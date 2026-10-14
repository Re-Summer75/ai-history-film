"""水：洞穴滴水。气泡物理 + 大空间混响的范例。"""
from __future__ import annotations

import numpy as np

from .. import texture
from ..core import SR, Mix, db_to_amp, n_samples, rng
from ..filters import highpass, lowpass
from ..noise import brown, burst, pink
from ..space import reverb
from . import recipe


def _drip(g, f0: float) -> np.ndarray:
    """一滴水落入水面：触水的轻"嗒" + 夹带气泡的"叮"（频率上扬）+ 有时反弹的小水滴再落下。"""
    n = n_samples(0.12)
    y = np.zeros(n)
    tick = highpass(burst(0.0003, g), 2000.0)
    y[: len(tick)] += 0.12 * tick / (np.max(np.abs(tick)) + 1e-12)
    if g.random() > 0.08:                                   # 少数水滴不夹带气泡，只有"嗒"
        b = texture.bubble(f0 * g.uniform(0.95, 1.05), rise=g.uniform(0.12, 0.35), damping_scale=g.uniform(0.6, 0.9))
        s = n_samples(g.uniform(0.0005, 0.002))
        e = min(n, s + len(b))
        y[s:e] += b[: e - s]
    if g.random() < 0.25:                                   # 反弹水滴
        b2 = texture.bubble(f0 * g.uniform(1.3, 2.0), rise=g.uniform(0.1, 0.3))
        s = n_samples(g.uniform(0.02, 0.06))
        e = min(n, s + len(b2))
        y[s:e] += g.uniform(0.25, 0.5) * b2[: e - s]
    return y


@recipe(tags=("水", "环境", "洞穴"), master={"lufs": -24.0})
def cave_drips(seed=0, dur=12.0, sources=3, room="cave", wet_db=-3.0):
    """洞穴滴水
    几个滴水点各自以略不规则的周期滴落，每个点有自己的音高（气泡大小）、方位和远近；
    每滴 = 触水"嗒" + 上扬的气泡"叮"（Minnaert 共振）；洞穴的长混响和离散回声让它们"活"起来。"""
    g = rng(seed)
    n = n_samples(dur)
    m = Mix(dur)
    for _ in range(sources):
        period = g.uniform(0.7, 2.8)
        f0 = g.uniform(650, 1800)
        pos = g.uniform(-0.8, 0.8)
        dist_db = -g.uniform(0, 10)
        k = int(dur / period) + 2
        times = texture.human_rhythm(k, period, jitter=0.08, seed=g, start=g.uniform(0.05, period))
        for t in times[times < dur - 0.2]:
            d = _drip(g, f0)
            if dist_db < -5:
                d = lowpass(d, 5000.0)                     # 远处的更暗
            m.add(d, t, dist_db + g.normal(0, 1.0), pos)
    tone = np.stack([lowpass(brown(n, g), 250.0) + 0.1 * pink(n, g) for _ in range(2)], axis=1)
    m.add(tone * db_to_amp(-62.0))                         # 空间底噪：避免"数字静音"
    return reverb(m.out()[:n], room, wet_db=wet_db, predelay=0.012, seed=g)
