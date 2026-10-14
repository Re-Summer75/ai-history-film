"""朴素合成基线：典型的"直接画波形"写法（纯正弦/白噪声 + 简单衰减）。
只用于 A/B 对比，说明增强方法到底改进了什么。"""
from __future__ import annotations

import numpy as np

from ..core import SR, Mix, n_samples, rng
from ..filters import lowpass
from . import recipe


def _t(dur):
    return np.arange(n_samples(dur)) / SR


@recipe(tags=("基线",))
def naive_knock(seed=0):
    """朴素基线·敲门：3 个 200 Hz 正弦 × 指数衰减，等间隔"""
    t = _t(0.3)
    knock = np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.05)
    m = Mix()
    for i in range(3):
        m.add(knock, at=i * 0.2)
    return m.out()


@recipe(tags=("基线",))
def naive_glass(seed=0):
    """朴素基线·碰杯：2000 Hz + 4000 Hz 正弦 × 指数衰减"""
    t = _t(1.5)
    return (np.sin(2 * np.pi * 2000 * t) + 0.5 * np.sin(2 * np.pi * 4000 * t)) * np.exp(-t / 0.4)


@recipe(tags=("基线",))
def naive_rain(seed=0, dur=12.0):
    """朴素基线·下雨：白噪声"""
    return 0.3 * rng(seed).standard_normal(n_samples(dur))


@recipe(tags=("基线",))
def naive_fire(seed=0, dur=12.0):
    """朴素基线·篝火：低通白噪声 + 均匀随机的等幅咔哒声"""
    g = rng(seed)
    x = lowpass(g.standard_normal(n_samples(dur)), 1000.0) * 0.3
    for t in g.uniform(0, dur - 0.01, int(8 * dur)):
        i = int(t * SR)
        x[i:i + 48] += g.uniform(-1, 1, 48) * 0.8
    return x


@recipe(tags=("基线",))
def naive_explosion(seed=0):
    """朴素基线·爆炸：白噪声 × 指数衰减 + 50 Hz 正弦"""
    g = rng(seed)
    t = _t(3.0)
    return g.standard_normal(len(t)) * np.exp(-t / 0.5) + np.sin(2 * np.pi * 50 * t) * np.exp(-t / 0.4)
