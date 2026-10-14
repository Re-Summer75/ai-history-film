"""成片时间轴：画面各幕按"原来的时间"写，再经各幕的时间映射（整体平移 + 停留窗口，见 web2/js/warp.js）换算成成片时间。
配乐按成片时间编写；段落边界用 M(原来的时刻) 换算，保证与画面对齐。映射参数从 out/film_cues.json 读取（render.py cues 导出）。
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "out"
# 各幕在"原来的时间"里的起点（与 web2/js/acts/*.js 一致）
ACT_START = [0.0, 30.2, 96.0, 176.0, 198.3, 264.0, 316.0]


def _S1(t: float) -> float:
    return t ** 3 - t ** 4 / 2


class Warp:
    def __init__(self, ofs: float, holds):
        self.ofs = ofs
        self.H = []
        for a, b, extra in holds:
            r = min(0.3, (b - a) / 3)
            self.H.append((a, b, r, extra / (b - a - r)))

    def _area(self, h, x):
        a, b, r, _ = h
        if x <= a:
            return 0.0
        if x >= b:
            return b - a - r
        if x < a + r:
            return r * _S1((x - a) / r)
        if x <= b - r:
            return r / 2 + (x - a - r)
        t = (x - (b - r)) / r
        return r / 2 + (b - a - 2 * r) + r * (t - _S1(t))

    def inv(self, t: float) -> float:
        return t + self.ofs + sum(h[3] * self._area(h, t) for h in self.H)


def load(path: Path = OUT / "film_cues.json"):
    d = json.loads(path.read_text(encoding="utf-8"))
    ws = [Warp(w["ofs"], w["holds"]) for w in d.get("warps", [])] or [Warp(0, [])]
    return d, ws


_D, _W = load() if (OUT / "film_cues.json").exists() else ({"duration": 352.0, "cues": []}, [Warp(0, [])])
DURATION = float(_D["duration"])


def M(t: float) -> float:
    """原来的全片时刻 → 成片时刻（按它所在的那一幕换算）。"""
    k = 0
    for i, s in enumerate(ACT_START):
        if t >= s - 1e-9:
            k = i
    k = min(k, len(_W) - 1)
    return _W[k].inv(t)


def cues(kind: str | None = None):
    return [c for c in _D["cues"] if kind is None or c["type"] == kind]
