"""逐帧渲染：无头浏览器打开 web2/index.html，逐帧把时间轴精确跳到 帧号/60 秒、截图，送进 ffmpeg 编码（不会掉帧）。

    python render.py cues                         导出音效提示点 → out/film_cues.json（配乐和音效都按它对齐画面）
    python render.py full --workers 4             并行渲染整片 → out/film_noaudio.mp4（30 秒一块，中断后重跑会跳过已完成的块）
    python render.py full --from 128 --to 152     只渲染一段（预览）→ out/preview_128-152.mp4
    python render.py snap 3.5 9.8 13              截取指定时刻（秒）→ out/snaps/ + 联系表
    python render.py snap --every 2 --from 0 --to 16
    python render.py mux                          画面 + 混音 → out/从现在看过去_AI简史.mp4

浏览器优先用 Microsoft Edge；没有装 Edge 时改用 Playwright 自带的 Chromium（先运行一次 python -m playwright install chromium）。
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import subprocess
import time
from pathlib import Path

import imageio_ffmpeg
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
WEB = (ROOT / "web2" / "index.html").as_uri()
OUT = ROOT / "out"
FPS = 60
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
        "--allow-file-access-from-files", "--disable-web-security", "--force-color-profile=srgb",
        "--hide-scrollbars", "--mute-audio", "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"]


async def open_page(p):
    try:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
    except Exception:                                                # 没有 Edge：用 Playwright 自带的 Chromium
        b = await p.chromium.launch(headless=True, args=ARGS)
    page = await b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    page.on("console", lambda m: print("[page]", m.type, m.text) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: print("[pageerror]", e))
    await page.goto(WEB, wait_until="domcontentloaded", timeout=180_000)
    await page.wait_for_function("window.ready === true", timeout=300_000, polling=250)
    cdp = await page.context.new_cdp_session(page)
    return b, page, cdp


async def grab(page, cdp, f: int) -> bytes:
    await page.evaluate("f => window.renderFrame(f)", f)
    r = await cdp.send("Page.captureScreenshot", {"format": "png", "optimizeForSpeed": True})
    return base64.b64decode(r["data"])


def film_duration() -> float:
    """成片时长（秒）：优先读 out/film_cues.json（render.py cues 导出），没有就打开页面问一下。"""
    f = OUT / "film_cues.json"
    if f.exists():
        return float(json.loads(f.read_text(encoding="utf-8"))["duration"])

    async def ask():
        async with async_playwright() as p:
            b, page, _ = await open_page(p)
            d = await page.evaluate("window.DURATION")
            await b.close()
            return float(d)
    return asyncio.run(ask())


def contact_sheet(paths: list[Path], dst: Path, cols: int = 4, w: int = 480):
    from PIL import Image, ImageDraw
    h = w * 9 // 16
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * (h + 22)), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGB").resize((w, h), Image.LANCZOS)
        x, y = (i % cols) * w, (i // cols) * (h + 22)
        sheet.paste(im, (x, y + 22))
        d.text((x + 6, y + 4), p.stem, fill=(255, 140, 90))
    sheet.save(dst)


async def snap(times: list[float], tag: str = ""):
    d = OUT / "snaps"
    d.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b, page, cdp = await open_page(p)
        paths = []
        for t in times:
            png = await grab(page, cdp, round(t * FPS))
            path = d / f"{tag}t{t:07.2f}.png"
            path.write_bytes(png)
            paths.append(path)
        await b.close()
    if len(paths) > 1:
        contact_sheet(paths, d / f"{tag}sheet_{times[0]:.1f}-{times[-1]:.1f}.png")
    print("\n".join(str(p) for p in paths))


async def export_cues():
    async with async_playwright() as p:
        b, page, _ = await open_page(p)
        cues = await page.evaluate("window.getCues()")
        dur = await page.evaluate("window.DURATION")
        # 各幕的时间映射（原来的时间 → 成片时间），配乐用它把段落边界换算到成片上
        warps = await page.evaluate("window.__warps ? window.__warps.map(w => ({ofs: w.ofs, holds: w.holds.map(h => [h.a, h.b, h.extra])})) : []")
        await b.close()
    OUT.mkdir(exist_ok=True)
    dst = OUT / "film_cues.json"
    dst.write_text(json.dumps({"duration": dur, "warps": warps, "cues": sorted(cues, key=lambda c: c["t"])}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(cues)} cues → {dst}")


ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(FPS), "-g", "120", "-bf", "2",
       "-threads", "3", "-x264-params", "rc-lookahead=24", "-movflags", "+faststart"]


class Browser:
    """一个无头浏览器会话；卡住或崩溃时自动重开（逐帧渲染是无状态的，重开后从同一帧继续即可）。"""

    def __init__(self, p, k):
        self.p, self.k, self.b = p, k, None

    async def open(self):
        await self.close()
        self.b, self.page, self.cdp = await open_page(self.p)

    async def close(self):
        if self.b is not None:
            try:
                await asyncio.wait_for(self.b.close(), 20)
            except Exception:
                pass
        self.b = None

    async def frame(self, f: int) -> bytes:
        for attempt in range(5):
            try:
                if self.b is None:
                    await self.open()
                return await asyncio.wait_for(grab(self.page, self.cdp, f), 90)
            except Exception as e:                                    # 超时 / 页面崩溃 → 重开浏览器重试
                print(f"  worker {self.k}: 第 {f} 帧失败（{type(e).__name__}），重开浏览器重试 {attempt + 1}", flush=True)
                await self.close()
        raise RuntimeError(f"第 {f} 帧连续失败")


async def worker(k: int, queue: asyncio.Queue, t_start: float, total: int, done: list):
    async with async_playwright() as p:
        br = Browser(p, k)
        while True:
            try:
                f0, f1, dst = queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            tmp = dst.with_suffix(".part.mp4")
            proc = subprocess.Popen([FFMPEG, "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "png", "-framerate", str(FPS), "-i", "-", *ENC, str(tmp)],
                                    stdin=subprocess.PIPE)
            for f in range(f0, f1):
                proc.stdin.write(await br.frame(f))
            proc.stdin.close()
            proc.wait()
            tmp.replace(dst)                                          # 写完才改名：中断后可以续渲
            done[0] += f1 - f0
            el = time.time() - t_start
            print(f"  worker {k}: 完成 {dst.name}  总进度 {done[0]}/{total}  ({el:.0f}s，平均 {el / max(done[0], 1) * 1000:.0f} ms/帧)", flush=True)
        await br.close()


async def full(t_from: float, t_to: float, workers: int, whole: bool, chunk_s: float = 30.0):
    """并行渲染：按 30 秒切块，多个浏览器从队列里取块；已完成的块会保留，重跑时自动跳过（断点续渲）。"""
    OUT.mkdir(exist_ok=True)
    cdir = OUT / "chunks" / f"film_{t_from:g}-{t_to:g}"
    cdir.mkdir(parents=True, exist_ok=True)
    f0, f1 = round(t_from * FPS), round(t_to * FPS)
    step = round(chunk_s * FPS)
    chunks = [(a, min(f1, a + step), cdir / f"c{a // step:03d}.mp4") for a in range(f0, f1, step)]
    queue: asyncio.Queue = asyncio.Queue()
    todo = [c for c in chunks if not c[2].exists()]
    for c in todo:
        queue.put_nowait(c)
    total = sum(b - a for a, b, _ in todo)
    print(f"{len(chunks)} 块，待渲染 {len(todo)} 块（{total} 帧）", flush=True)
    t = time.time()
    done = [0]
    await asyncio.gather(*(worker(i, queue, t, total, done) for i in range(workers)))
    lst = cdir / "list.txt"
    lst.write_text("\n".join(f"file '{c[2].name}'" for c in chunks), encoding="utf-8")
    dst = OUT / ("film_noaudio.mp4" if whole else f"preview_{t_from:g}-{t_to:g}.mp4")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(dst)], check=True, cwd=cdir)
    print(f"完成 {f1 - f0} 帧，用时 {time.time() - t:.0f}s → {dst}")


def mux(video=None, audio=None, dst=None):
    """画面 + 最终混音 → 成片（H.264 + AAC 320k）。"""
    v = Path(video) if video else OUT / "film_noaudio.mp4"
    a = Path(audio) if audio else OUT / "film_mix.wav"
    dst = Path(dst) if dst else OUT / "从现在看过去_AI简史.mp4"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(v), "-i", str(a), "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(dst)], check=True)
    print(f"成片 → {dst}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("mux")
    m.add_argument("--video")
    m.add_argument("--audio")
    m.add_argument("--dst")
    s = sub.add_parser("snap")
    s.add_argument("times", nargs="*", type=float)
    s.add_argument("--every", type=float)
    s.add_argument("--from", dest="t_from", type=float, default=0)
    s.add_argument("--to", dest="t_to", type=float, default=None, help="默认到片尾")
    s.add_argument("--tag", default="")
    sub.add_parser("cues")
    f = sub.add_parser("full")
    f.add_argument("--from", dest="t_from", type=float, default=0)
    f.add_argument("--to", dest="t_to", type=float, default=None, help="默认到片尾")
    f.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    if a.cmd == "snap":
        times = a.times or []
        if a.every:
            end = a.t_to if a.t_to is not None else film_duration()
            k = a.t_from
            while k <= end + 1e-9:
                times.append(round(k, 3))
                k += a.every
        asyncio.run(snap(times, a.tag))
    elif a.cmd == "cues":
        asyncio.run(export_cues())
    elif a.cmd == "mux":
        mux(a.video, a.audio, a.dst)
    else:
        dur = film_duration()
        t_to = dur if a.t_to is None else a.t_to
        asyncio.run(full(a.t_from, t_to, a.workers, whole=(a.t_from == 0 and abs(t_to - dur) < 1e-6)))


if __name__ == "__main__":
    main()
