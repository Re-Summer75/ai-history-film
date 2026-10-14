"""包络：幅度随时间的变化。真实声音几乎都是指数衰减，而不是线性衰减。"""
from __future__ import annotations

import numpy as np

from .core import LN1000, SR, n_samples


def exp_decay(n: int, t60: float, sr: int = SR) -> np.ndarray:
    """指数衰减包络：t60 秒后衰减 60 dB。"""
    return np.exp(-LN1000 * np.arange(n) / (sr * max(t60, 1e-6)))


def attack_decay(dur: float, attack: float, t60: float, sr: int = SR, curve: float = 2.0) -> np.ndarray:
    """起音（升余弦的 curve 次幂，curve 越大起音越'软'）+ 指数衰减。"""
    n = n_samples(dur, sr)
    t = np.arange(n) / sr
    na = n_samples(attack, sr)
    env = np.exp(-LN1000 * np.maximum(t - attack, 0.0) / max(t60, 1e-6))
    if na > 1:
        rise = (0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, na))) ** (curve / 2.0)
        env[:na] *= rise
    return env


def breakpoints(points, dur: float, sr: int = SR, curve: str = "linear") -> np.ndarray:
    """分段包络。points = [(时间秒, 值), ...]。
    curve='linear' 线性插值；'exp' 在对数域插值（值须 > 0，适合频率、音量这类感知上按比例变化的量）。
    """
    n = n_samples(dur, sr)
    t = np.arange(n) / sr
    ts = np.array([p[0] for p in points], dtype=float)
    vs = np.array([p[1] for p in points], dtype=float)
    if curve == "exp":
        return np.exp(np.interp(t, ts, np.log(np.maximum(vs, 1e-12))))
    return np.interp(t, ts, vs)
