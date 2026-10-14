"""随机事件与纹理：雨、火、碎石、气泡这类"由大量微小事件组成"的声音。

核心思想：真实纹理声 = 很多个略有不同的小事件 × 随机的时间分布。
- 时间分布用泊松过程（事件间隔为指数分布），而不是等间隔；
- 强度本身也在缓慢起伏（Cox 过程：泊松过程的速率被 smooth_random 调制），于是事件会"成簇"出现；
- 事件的大小服从幂律（很多小的、少数大的），而不是均匀随机。
"""
from __future__ import annotations

import numpy as np
from scipy import signal

from .core import SR, n_samples, rng


def poisson_times(dur: float, rate: float, seed=None, start: float = 0.0) -> np.ndarray:
    """齐次泊松过程：平均每秒 rate 个事件。"""
    g = rng(seed)
    if rate <= 0 or dur <= 0:
        return np.zeros(0)
    k = int(rate * dur * 1.5 + 20)
    t = np.cumsum(g.exponential(1.0 / rate, k))
    while t[-1] < dur:
        t = np.concatenate([t, t[-1] + np.cumsum(g.exponential(1.0 / rate, k))])
    return start + t[t < dur]


def modulated_times(rate_curve: np.ndarray, seed=None, sr: int = SR) -> np.ndarray:
    """非齐次泊松过程（稀疏化法）：rate_curve 为逐采样的瞬时速率（事件/秒）。"""
    g = rng(seed)
    dur = len(rate_curve) / sr
    rmax = float(np.max(rate_curve)) if len(rate_curve) else 0.0
    if rmax <= 0:
        return np.zeros(0)
    cand = poisson_times(dur, rmax, g)
    idx = np.minimum((cand * sr).astype(int), len(rate_curve) - 1)
    keep = g.uniform(0.0, rmax, len(cand)) < rate_curve[idx]
    return cand[keep]


def power_law(n: int, alpha: float = 2.0, lo: float = 0.05, hi: float = 1.0, seed=None) -> np.ndarray:
    """幂律分布的幅度（帕累托截断）：alpha 越大，小事件越占多数。"""
    g = rng(seed)
    u = g.uniform(0.0, 1.0, n)
    a1 = 1.0 - alpha
    return (lo ** a1 + u * (hi ** a1 - lo ** a1)) ** (1.0 / a1)


def human_rhythm(n: int, interval: float, jitter: float = 0.03, drift: float = 0.0, seed=None,
                 start: float = 0.0) -> np.ndarray:
    """人的节奏（敲门、脚步）：平均间隔 interval，带随机抖动（相对值）和整体快慢漂移。"""
    g = rng(seed)
    gaps = interval * (1.0 + jitter * g.standard_normal(n)) * (1.0 + drift * np.linspace(0, 1, n))
    return start + np.concatenate([[0.0], np.cumsum(gaps[:-1])])


def impulses(times, amps, n: int, sr: int = SR) -> np.ndarray:
    x = np.zeros(n)
    idx = (np.asarray(times) * sr).astype(int)
    ok = (idx >= 0) & (idx < n)
    np.add.at(x, idx[ok], np.asarray(amps, dtype=float)[ok])
    return x


def scatter(times, amps, kernels, n: int, seed=None, sr: int = SR) -> np.ndarray:
    """把大量事件高效地"撒"到时间线上：每个事件随机选一个核（kernels 列表中的短声音）并按幅度缩放。
    同一核的所有事件合并为一次 FFT 卷积，数千个事件也很快。"""
    g = rng(seed)
    times, amps = np.asarray(times), np.asarray(amps)
    which = g.integers(0, len(kernels), len(times))
    out = np.zeros(n)
    for k, ker in enumerate(kernels):
        sel = which == k
        if not np.any(sel):
            continue
        train = impulses(times[sel], amps[sel], n, sr)
        out += signal.oaconvolve(train, ker)[:n]
    return out


def stick_slip(rate: np.ndarray, amp: np.ndarray, jitter: float = 0.06, dropout_below: float = 0.12,
               seed=None, sr: int = SR) -> np.ndarray:
    """粘滑摩擦激励：门轴吱呀、地板嘎吱、鞋底摩擦、拉弦的共同机制。
    摩擦面交替"粘住-滑开"，每次滑开产生一个脉冲；rate(t) 为逐采样的脉冲频率（= 听到的音高），
    amp(t) 为逐采样幅度（通常跟速度/压力走）。幅度低于 dropout_below 时脉冲时断时续（将停未停的"咯…咯"）。
    返回脉冲串，再送入共振器（resonator_bank / Body 的模态）塑造音色。"""
    g = rng(seed)
    n = len(rate)
    phase = np.cumsum(rate) / sr
    idx = np.nonzero(np.diff(np.floor(phase)) > 0)[0]
    if len(idx) == 0:
        return np.zeros(n)
    period = sr / np.maximum(rate[idx], 1.0)
    idx = np.clip((idx + g.normal(0, jitter, len(idx)) * period).astype(int), 0, n - 1)
    a = amp[idx] * g.uniform(0.55, 1.0, len(idx))
    low = amp[idx] < dropout_below
    a[low] *= g.uniform(0, 1, int(low.sum())) < 0.3
    exc = np.zeros(n)
    np.add.at(exc, idx, a)
    return exc


def bubble(f0: float, rise: float = 0.1, damping_scale: float = 1.0, dur: float | None = None,
           sr: int = SR) -> np.ndarray:
    """Minnaert 气泡声（van den Doel 2005, "Physically-based models for liquid sounds"）。
    气泡半径 r(米) 对应共振频率 f0 ≈ 3.26 / r（r=1mm → 3.26 kHz）；
    阻尼 d = 0.13·f0 + 0.0072·f0^1.5（1/秒）；
    气泡上浮靠近水面时频率上扬：f(t) = f0 · (1 + rise · d · t) —— 水滴"叮咚"感的来源。"""
    d = (0.13 * f0 + 0.0072 * f0 ** 1.5) * damping_scale
    n = n_samples(dur if dur is not None else 6.0 / d, sr)
    t = np.arange(n) / sr
    f = f0 * (1.0 + rise * d * t)
    return np.sin(2.0 * np.pi * np.cumsum(f) / sr) * np.exp(-d * t)
