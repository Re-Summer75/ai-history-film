"""基础约定与工具函数。

约定：
- 采样率统一 48 kHz（SR），内部全部用 float64 计算。
- 单声道数组 shape 为 (n,)，立体声为 (n, 2)。
- 时间参数一律用秒，频率用 Hz，增益用 dB（函数名带 _db 的参数）。
"""
from __future__ import annotations

import numpy as np

SR = 48000
LN1000 = 6.907755278982137  # ln(1000)：幅度衰减 60 dB 对应的自然对数


def n_samples(dur: float, sr: int = SR) -> int:
    return max(0, int(round(dur * sr)))


def time_axis(n: int, sr: int = SR) -> np.ndarray:
    return np.arange(n) / sr


def rng(seed=None) -> np.random.Generator:
    """seed 可以是整数、None 或已有的 Generator（直接复用）。"""
    if isinstance(seed, np.random.Generator):
        return seed
    return np.random.default_rng(seed)


def db_to_amp(db):
    return 10.0 ** (np.asarray(db, dtype=float) / 20.0)


def amp_to_db(a, floor: float = 1e-12):
    return 20.0 * np.log10(np.maximum(np.abs(a), floor))


def to_stereo(x: np.ndarray) -> np.ndarray:
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def to_mono(x: np.ndarray) -> np.ndarray:
    return x if x.ndim == 1 else x.mean(axis=1)


def pan(x: np.ndarray, position: float) -> np.ndarray:
    """等功率声像：position -1 最左，0 居中，+1 最右。立体声输入会先转单声道。"""
    x = to_mono(x)
    theta = (float(np.clip(position, -1.0, 1.0)) + 1.0) * np.pi / 4.0
    return np.stack([x * np.cos(theta), x * np.sin(theta)], axis=1)


def pan_dynamic(x: np.ndarray, positions) -> np.ndarray:
    """随时间移动的等功率声像：positions 为与 x 等长的数组（-1 左 ~ +1 右），例如掠过的物体。"""
    x = to_mono(x)
    theta = (np.clip(np.broadcast_to(positions, x.shape), -1.0, 1.0) + 1.0) * np.pi / 4.0
    return np.stack([x * np.cos(theta), x * np.sin(theta)], axis=1)


def fade(x: np.ndarray, fade_in: float = 0.0, fade_out: float = 0.0, sr: int = SR) -> np.ndarray:
    """升余弦淡入淡出（返回副本）。"""
    y = np.array(x, dtype=float, copy=True)
    n = len(y)
    ni, no = min(n, n_samples(fade_in, sr)), min(n, n_samples(fade_out, sr))
    if ni > 1:
        w = 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, ni))
        y[:ni] *= w if y.ndim == 1 else w[:, None]
    if no > 1:
        w = 0.5 + 0.5 * np.cos(np.linspace(0.0, np.pi, no))
        y[n - no:] *= w if y.ndim == 1 else w[:, None]
    return y


def pad_to(x: np.ndarray, n: int) -> np.ndarray:
    if len(x) >= n:
        return x[:n]
    pad = [(0, n - len(x))] + [(0, 0)] * (x.ndim - 1)
    return np.pad(x, pad)


def peak(x: np.ndarray) -> float:
    return float(np.max(np.abs(x))) if len(x) else 0.0


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def normalize(x: np.ndarray, peak_db: float = -1.0) -> np.ndarray:
    p = peak(x)
    return x if p == 0 else x * (db_to_amp(peak_db) / p)


class Mix:
    """立体声混音总线：把各层按时间、增益、声像叠加。缓冲区会按需自动加长（例如混响尾音）。

    用法：
        m = Mix()
        m.add(impact, at=0.0, gain_db=-3, pan_pos=-0.2)
        m.add(stereo_reverb, at=0.0, gain_db=-12)
        y = m.out()
    """

    def __init__(self, dur: float = 0.0, sr: int = SR):
        self.sr = sr
        self.buf = np.zeros((n_samples(dur, sr), 2))

    def add(self, x: np.ndarray, at: float = 0.0, gain_db: float = 0.0, pan_pos: float | None = None) -> "Mix":
        if len(x) == 0:
            return self
        x = pan(x, pan_pos) if pan_pos is not None else to_stereo(x)
        start = n_samples(at, self.sr)
        if start < 0:
            x, start = x[-start:], 0
        end = start + len(x)
        if end > len(self.buf):
            self.buf = pad_to(self.buf, end)
        self.buf[start:end] += float(db_to_amp(gain_db)) * x
        return self

    def out(self) -> np.ndarray:
        return self.buf


def smooth_random(dur: float, rate: float, seed=None, octaves: int = 1,
                  persistence: float = 0.5, sr: int = SR) -> np.ndarray:
    """慢变随机控制信号（Catmull-Rom 插值的随机拐点），大致在 [-1, 1]。

    rate：每秒随机拐点数（越大变化越快）；octaves>1 时叠加更快更小的细节（分形起伏，
    适合风的阵风、火焰闪烁、雨势变化这类"自然"的波动）。
    """
    g = rng(seed)
    n = n_samples(dur, sr)
    out = np.zeros(n)
    amp, total, r = 1.0, 0.0, rate
    for _ in range(max(1, octaves)):
        k = int(np.ceil(dur * r)) + 4
        pts = g.uniform(-1.0, 1.0, k)
        pos = np.arange(n) / sr * r
        i = np.floor(pos).astype(int)
        t = pos - i
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        out += amp * 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2
                            + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
        total += amp
        amp *= persistence
        r *= 2.0
    return out / total
