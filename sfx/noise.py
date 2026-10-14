"""噪声源。大部分真实音效（撞击瞬态、风、雨、火、爆炸）的主体都是被塑形的噪声，而不是振荡器。"""
from __future__ import annotations

import numpy as np

from .core import LN1000, SR, n_samples, rng


def white(n: int, seed=None) -> np.ndarray:
    return rng(seed).standard_normal(n)


def colored(n: int, slope_db_oct: float, seed=None, sr: int = SR, hp_hz: float = 20.0) -> np.ndarray:
    """指定频谱斜率的噪声（频域塑形）。slope：0 白噪声，-3 粉红，-6 布朗/红，+3 蓝。
    输出 RMS 归一为 1；hp_hz 以下置零，避免布朗噪声的超低频漂移。"""
    if n == 0:
        return np.zeros(0)
    g = rng(seed)
    k = n // 2 + 1
    spec = g.standard_normal(k) + 1j * g.standard_normal(k)
    f = np.fft.rfftfreq(n, 1.0 / sr)
    f[0] = f[1] if k > 1 else 1.0
    spec *= (f / 1000.0) ** (slope_db_oct / 6.0206)
    spec[f < hp_hz] = 0.0
    x = np.fft.irfft(spec, n)
    return x / (np.std(x) + 1e-12)


def pink(n: int, seed=None, sr: int = SR) -> np.ndarray:
    return colored(n, -3.0, seed, sr)


def brown(n: int, seed=None, sr: int = SR) -> np.ndarray:
    return colored(n, -6.0, seed, sr)


def burst(dur: float, seed=None, slope_db_oct: float = 0.0, attack: float = 0.0002,
          t60: float | None = None, sr: int = SR) -> np.ndarray:
    """短噪声爆发：接触声、噼啪声、碎裂声的基本单元。默认 t60 = dur（在结尾处衰减到 -60 dB）。"""
    n = max(2, n_samples(dur, sr))
    x = colored(n, slope_db_oct, seed, sr, hp_hz=0.0) if slope_db_oct else white(n, seed)
    t = np.arange(n) / sr
    env = np.exp(-LN1000 * t / (t60 or dur))
    na = min(n // 2, n_samples(attack, sr))
    if na > 1:
        env[:na] *= np.linspace(0.0, 1.0, na, endpoint=False) ** 0.5
    return x * env
