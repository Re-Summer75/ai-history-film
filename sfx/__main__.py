"""命令行入口。

    python -m sfx list                                   列出所有配方
    python -m sfx render knock_wood --seeds 0 1 2        渲染（每个 seed 一个变体）
    python -m sfx render rain --set intensity=0.9 surface=roof
    python -m sfx render --all                           渲染全部配方（含基线）
    python -m sfx analyze out/rain/rain__s0.wav --ref 你的参考录音.wav
    python -m sfx gallery                                生成试听页 out/index.html
    python -m sfx demo --clean                           渲染精选变体 + 生成试听页
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

OUT = Path.cwd() / "out"   # 输出到当前工作目录（在任何项目里使用时都写到该项目下）


def _show(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(Path.cwd()))
    except ValueError:
        return str(p)


def _parse_value(v: str):
    low = v.lower()
    if low in ("true", "false"):
        return low == "true"
    if low == "none":
        return None
    for cast in (int, float):
        try:
            return cast(v)
        except ValueError:
            pass
    return v


def _variant_name(name: str, seed: int, params: dict) -> str:
    extra = "".join(f"__{k}={v}" for k, v in sorted(params.items()))
    return f"{name}__s{seed}{extra}"


def cmd_list(_):
    from .recipes import load_all
    reg = load_all()
    for key, r in sorted(reg.items(), key=lambda kv: (kv[1]["tags"][:1] == ("基线",), kv[0])):
        tag = "/".join(r["tags"])
        base = f"  [基线: {r['baseline']}]" if r["baseline"] else ""
        print(f"{key:18s} {r['title']}  ({tag}){base}")


def render_one(name: str, seed: int, params: dict, out: Path, plot: bool = True) -> dict:
    from .analysis import analyze, plot as plot_fn, summary_line
    from .master import finalize, save
    from .recipes import load_all
    reg = load_all()
    if name not in reg:
        sys.exit(f"没有这个配方: {name}（用 python -m sfx list 查看）")
    r = reg[name]
    t0 = time.time()
    x = r["fn"](seed=seed, **params)
    y = finalize(x, **r["master"])
    stem = _variant_name(name, seed, params)
    d = out / name
    wav = save(d / f"{stem}.wav", y)
    m = analyze(y)
    m["_配方"] = name
    m["_参数"] = {"seed": seed, **params}
    m["_渲染耗时_s"] = round(time.time() - t0, 2)
    (d / f"{stem}.json").write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    if plot:
        plot_fn(y, d / f"{stem}.png", title=f"{name}  seed={seed}  {params or ''}", metrics={k: v for k, v in m.items() if not k.startswith("_")})
    print(f"[{name}] {_show(wav)}  ({m['_渲染耗时_s']}s)\n    {summary_line(m)}")
    return m


def cmd_render(a):
    from .recipes import load_all
    params = dict(kv.split("=", 1) for kv in a.set) if a.set else {}
    params = {k: _parse_value(v) for k, v in params.items()}
    names = sorted(load_all()) if a.all else a.names
    if not names:
        sys.exit("请指定配方名，或用 --all")
    out = Path(a.out)
    for name in names:
        for seed in a.seeds:
            render_one(name, seed, params, out, plot=not a.no_plot)
    if a.all or a.gallery:
        from .gallery import build
        print(f"试听页: {build(out)}")


def cmd_analyze(a):
    from .analysis import analyze, compare, plot, summary_line
    from .master import load
    x = load(a.file)
    m = analyze(x)
    print(summary_line(m))
    print(json.dumps(m, ensure_ascii=False, indent=1))
    p = Path(a.png) if a.png else Path(a.file).with_suffix(".analysis.png")
    plot(x, p, title=Path(a.file).name, metrics=m)
    print(f"分析图: {p}")
    if a.ref:
        items = [(Path(a.file).name, x)] + [(Path(r).name, load(r)) for r in a.ref]
        cp = p.with_name(p.stem.replace(".analysis", "") + ".compare.png")
        compare(items, cp)
        print(f"对比图: {cp}")


def cmd_gallery(a):
    from .gallery import build
    print(f"试听页: {build(Path(a.out))}")


DEMO = [  # (配方, seeds, 参数)
    ("knock_wood", [0, 1], {}), ("knock_wood", [0], {"door": "hollow"}),
    ("metal_hit", [0], {}), ("metal_hit", [0], {"obj": "pan"}), ("metal_hit", [0], {"obj": "sheet"}),
    ("glass_clink", [0, 1], {}),
    ("door_slam", [0, 1], {}), ("door_creak", [0, 1], {}),
    ("rain", [0], {}), ("rain", [0], {"surface": "roof"}), ("rain", [0], {"surface": "window", "intensity": 0.4}),
    ("rain", [0], {"intensity": 0.95}),
    ("wind", [0], {}), ("wind", [0], {"env": "trees"}), ("wind", [0], {"env": "indoor"}),
    ("campfire", [0], {}), ("campfire", [0], {"size": 1.0, "crackle": 0.9}),
    ("footsteps", [0], {}), ("footsteps", [0], {"shoe": "soft"}), ("footsteps", [0], {"surface": "concrete"}),
    ("footsteps", [0], {"surface": "gravel"}),
    ("cave_drips", [0], {}),
    ("explosion", [0], {}), ("explosion", [0], {"distance": 300.0}),
    ("naive_knock", [0], {}), ("naive_glass", [0], {}), ("naive_rain", [0], {}), ("naive_fire", [0], {}),
    ("naive_explosion", [0], {}),
]


def cmd_demo(a):
    import shutil
    out = Path(a.out)
    if a.clean and out.exists():
        shutil.rmtree(out)
    for name, seeds, params in DEMO:
        for seed in seeds:
            render_one(name, seed, params, out)
    from .gallery import build
    print(f"试听页: {build(out)}")


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):   # Windows 终端可能是 GBK：无法编码的字符替换掉，而不是崩溃
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(prog="python -m sfx", description="物理建模程序化音效")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="列出配方").set_defaults(func=cmd_list)
    r = sub.add_parser("render", help="渲染配方")
    r.add_argument("names", nargs="*")
    r.add_argument("--all", action="store_true")
    r.add_argument("--seeds", nargs="+", type=int, default=[0])
    r.add_argument("--set", nargs="*", default=[], help="参数覆盖，如 intensity=0.8 surface=roof")
    r.add_argument("--out", default=str(OUT))
    r.add_argument("--no-plot", action="store_true")
    r.add_argument("--gallery", action="store_true", help="渲染后更新试听页")
    r.set_defaults(func=cmd_render)
    an = sub.add_parser("analyze", help="分析任意 wav（可与参考录音对比）")
    an.add_argument("file")
    an.add_argument("--ref", nargs="*", default=[])
    an.add_argument("--png", default=None)
    an.set_defaults(func=cmd_analyze)
    g = sub.add_parser("gallery", help="生成试听页")
    g.add_argument("--out", default=str(OUT))
    g.set_defaults(func=cmd_gallery)
    d = sub.add_parser("demo", help="渲染精选变体 + 生成试听页")
    d.add_argument("--out", default=str(OUT))
    d.add_argument("--clean", action="store_true", help="先清空输出目录")
    d.set_defaults(func=cmd_demo)
    a = ap.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
