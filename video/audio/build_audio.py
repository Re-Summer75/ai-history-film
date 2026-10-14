"""音频总装：配乐 + 按画面提示点生成的音效轨 → 混音母带 → out/film_mix.wav

    python build_audio.py            # 需要 out/film_cues.json（render.py cues 导出）；film_music.wav 不存在时先渲染配乐
    python build_audio.py --music    # 强制重渲配乐
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "out"
sys.path.insert(0, str(HERE.parents[1]))
from sfx.core import SR, db_to_amp                      # noqa: E402
from sfx.dynamics import compress, limit, true_peak    # noqa: E402
from sfx.filters import lowpass                         # noqa: E402
from sfx.master import finalize, load, save            # noqa: E402
from sfx.analysis import integrated_loudness           # noqa: E402
from sfx.recipes import load_all                        # noqa: E402

REG = load_all()
DUR = 240.0
SKIP = {"heart"}          # 心跳在配乐里合成（与音乐同一条总线处理），这里跳过


def _r(name, **kw):
    return REG[name]["fn"](**kw)


# 提示音的音高吸附到 D 小调五声音阶（D F G A C）：和配乐同调，不再"跑调"
_PENTA = np.array([np.log2(440.0) + (m - 69) / 12 for m in range(36, 110) if m % 12 in (0, 2, 5, 7, 9)])


def in_key(f: float) -> float:
    return float(2 ** _PENTA[np.argmin(np.abs(_PENTA - np.log2(max(f, 30.0))))])


# 提示点类型 → 音效配方（每种提示点能带的参数，见各行里的 c.get(...)）
RENDER = {
    "blip":    lambda c, s: _r("ui_blip", seed=s, pitch=in_key(c.get("pitch", 2200.0)), kind=c.get("kind", "tick")),
    "click":   lambda c, s: _r("ui_click", seed=s),
    "relay":   lambda c, s: _r("relay_click", seed=s),
    "typing":  lambda c, s: _r("typing", seed=s, keys=int(c.get("keys", 12)), speed=c.get("speed", 1.0)),
    "chirp":   lambda c, s: _r("data_chirp", seed=s, dur=c.get("dur", 0.8)),
    "whoosh":  lambda c, s: _r("whoosh", seed=s, dur=c.get("dur", 0.9), direction=c.get("dir", "lr"), size=c.get("size", 0.6), brightness=0.35),   # 调暗：环境声，不抢戏
    "impact":  lambda c, s: _r("impact", seed=s, size=c.get("size", 1.0), metal=c.get("metal", 0.3)),
    "sub":     lambda c, s: _r("sub_drop", seed=s, dur=c.get("dur", 1.8)),
    "riser":   lambda c, s: _r("riser", seed=s, dur=c.get("dur", 4.0)),
    "reverse": lambda c, s: _r("reverse_swell", seed=s, dur=c.get("dur", 1.6)),
    "glitch":  lambda c, s: _r("glitch", seed=s, dur=c.get("dur", 0.6)),
    "rewind":  lambda c, s: _r("tape_rewind", seed=s, dur=c.get("dur", 2.6)),
    "key":     lambda c, s: _r("typing", seed=s, keys=1, speed=1.0),
    "wind":    lambda c, s: _r("wind", seed=s, dur=c.get("dur", 10.0), strength=c.get("strength", 0.5), gustiness=0.5, whistle=0.3),
    "stone":   lambda c, s: _r("go_stone", seed=s, big=bool(c.get("big", 0))),
    # 逐字对齐：times 为相对提示点时刻的秒数（画面上每出现一个字就一个音）
    "keys":    lambda c, s: _r("typing_at", seed=s, times=c.get("times", [0.0]), spaces=c.get("spaces", [])),   # 人在打字
    "worldshift": lambda c, s: _r("worldline_shift", seed=s, depth=c.get("depth", 1.0)),                          # 世界线变动（推理段跳线）
    "stream":  lambda c, s: _r("text_stream", seed=s, times=c.get("times", [0.0])),                               # AI 在输出
    "rtick":   lambda c, s: _r("roulette_tick", seed=s, last=bool(c.get("last", 0))),                              # 转盘抽签的木质"咔嗒"（猜下一个词）
    "chime":   lambda c, s: _r("answer_chime", seed=s),                                                             # "猜中了"的一声叮（钟琴式金属条）
}
# 各类音效在混音里的基准电平（再叠加提示点自带的 gain）
BASE_DB = {"blip": -10, "click": -10, "relay": -8, "typing": -10, "chirp": -12, "whoosh": -13, "impact": -5,
           "sub": -8, "riser": -9, "reverse": -9, "glitch": -10, "rewind": -6, "key": -10, "wind": -12, "stone": -8,
           "keys": -10, "stream": -13, "worldshift": -9, "rtick": -10, "chime": -10}


def build_sfx(cues: list[dict]) -> np.ndarray:
    n = int((DUR + 3) * SR)
    bus = np.zeros((n, 2))
    unknown = set()
    for i, c in enumerate(cues):
        kind = c["type"]
        if kind in SKIP:
            continue
        if kind not in RENDER:
            unknown.add(kind)
            continue
        # trim=False：不裁开头的"静音"。上升/反向吸气/掠过这类声音从无到有渐强，裁掉会让落点提前、对不上拍子
        x = finalize(RENDER[kind](c, 1000 + i), trim=False)
        if x.ndim == 1:
            x = np.stack([x, x], axis=1) * 0.7071
        g = float(db_to_amp(BASE_DB[kind] + float(c.get("gain", 0.0)) + 6.0))   # 提示点的 gain 以 -6 dB 为"正常"
        s = int(round(c["t"] * SR))
        if s < 0 or s >= n:
            continue
        e = min(n, s + len(x))
        bus[s:e] += g * x[: e - s]
    if unknown:
        print("未知的提示点类型（已跳过）:", ", ".join(sorted(unknown)))
    return bus


def duck(music: np.ndarray, sfx: np.ndarray, depth_db: float = 4.0) -> np.ndarray:
    """音效响起时配乐轻微让位（最多 depth_db），让重击和转场更清楚。"""
    env = lowpass(np.abs(sfx).max(axis=1), 12.0, order=1)
    k = np.clip(env / (np.percentile(env, 99.5) + 1e-9), 0, 1)
    g = 10 ** (-depth_db * k / 20)
    return music * g[:, None]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--music", action="store_true", help="强制重渲配乐")
    a = ap.parse_args()
    global DUR
    t0 = time.time()
    pre = "film_"
    meta = json.loads((OUT / f"{pre}cues.json").read_text(encoding="utf-8"))
    DUR = float(meta.get("duration", DUR))
    cues = meta["cues"]
    music_path = OUT / f"{pre}music.wav"
    if a.music or not music_path.exists():
        from film_score import render as render_music
        m = render_music()
        save(music_path, limit(m / (np.abs(m).max() + 1e-9) * 0.9, -1.0)[: int(DUR * SR)])
    music = load(music_path)
    print(f"{len(cues)} 个提示点")
    sfx = build_sfx(cues)
    n = min(len(music), len(sfx))
    music, sfx = music[:n], sfx[:n]
    save(OUT / f"{pre}sfx_track.wav", sfx / (np.abs(sfx).max() + 1e-9) * 0.9)
    mix = duck(music * db_to_amp(-1.5), sfx, 3.0) + sfx         # 音乐比音效低 1.5 dB；音效响时音乐最多让 3 dB
    mix = compress(mix, -9.0, 1.5, 15.0, 180.0)                  # 轻度"粘合"（再轻一点：重击前后要有对比）
    cur = integrated_loudness(mix)
    mix = mix * db_to_amp(-15.0 - cur)
    mix = limit(mix, -1.2, release_ms=120.0)
    tp = true_peak(mix)
    if tp > db_to_amp(-1.0):
        mix *= db_to_amp(-1.0) / tp
    mix = mix[: int(DUR * SR)]
    dst = OUT / f"{pre}mix.wav"
    save(dst, mix)
    print(f"{dst.name}：{integrated_loudness(mix):.1f} LUFS，真峰值 {20 * np.log10(true_peak(mix)):.2f} dBTP，用时 {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
