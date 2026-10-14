"""动态处理：饱和（过采样防混叠）、压缩、前瞻限幅、真峰值测量。"""
from __future__ import annotations

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d

from .core import SR, db_to_amp


def true_peak(x: np.ndarray, oversample: int = 4) -> float:
    """真峰值（4 倍过采样后的峰值）：采样点之间的波峰可能比采样值更高，D/A 后会削波。"""
    if len(x) == 0:
        return 0.0
    return float(np.max(np.abs(signal.resample_poly(x, oversample, 1, axis=0))))


def saturate(x: np.ndarray, drive_db: float = 6.0, mix: float = 1.0, oversample: int = 4) -> np.ndarray:
    """tanh 软饱和：增加密度和"力量感"。非线性会产生新的高频，必须过采样，否则混叠成刺耳杂音。"""
    g = float(db_to_amp(drive_db))
    up = signal.resample_poly(x, oversample, 1, axis=0)
    y = signal.resample_poly(np.tanh(g * up) / np.tanh(g), 1, oversample, axis=0)[: len(x)]
    return mix * y + (1.0 - mix) * x


def compress(x: np.ndarray, threshold_db: float = -18.0, ratio: float = 3.0, attack_ms: float = 5.0,
             release_ms: float = 80.0, makeup_db: float = 0.0, sr: int = SR) -> np.ndarray:
    """前馈压缩器（控制信号以 8 采样为步长计算后插值到音频率）。"""
    step = 8
    det = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    m = int(np.ceil(len(det) / step))
    lvl = np.pad(det, (0, m * step - len(det))).reshape(m, step).max(axis=1)
    lvl_db = 20 * np.log10(np.maximum(lvl, 1e-9))
    over = np.maximum(lvl_db - threshold_db, 0.0)
    target = -over * (1.0 - 1.0 / ratio)             # 目标增益（dB，≤0）
    ca = np.exp(-step / (attack_ms / 1000.0 * sr))
    cr = np.exp(-step / (release_ms / 1000.0 * sr))
    gdb = np.empty(m)
    cur = 0.0
    for i in range(m):
        c = ca if target[i] < cur else cr
        cur = c * cur + (1.0 - c) * target[i]
        gdb[i] = cur
    gain = db_to_amp(np.interp(np.arange(len(det)) / step, np.arange(m), gdb) + makeup_db)
    return x * (gain[:, None] if x.ndim == 2 else gain)


def limit(x: np.ndarray, ceiling_db: float = -1.0, lookahead_ms: float = 2.0, release_ms: float = 60.0,
          sr: int = SR) -> np.ndarray:
    """前瞻峰值限幅：保证峰值不超过 ceiling，且增益变化平滑（不硬削波）。"""
    c = float(db_to_amp(ceiling_db))
    det = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    g_raw = np.minimum(1.0, c / np.maximum(det, 1e-12))
    if g_raw.min() >= 1.0:
        return x
    L = max(1, int(lookahead_ms / 1000.0 * sr))
    g1 = minimum_filter1d(g_raw, size=2 * L + 1, mode="nearest")
    # 因果滑动平均（窗长 L）：窗内每个 g1 都 ≤ 当前点的 g_raw，所以平均后仍 ≤ g_raw
    g2 = np.convolve(np.concatenate([np.full(L - 1, g1[0]), g1]), np.ones(L) / L, mode="valid")
    cr = np.exp(-1.0 / (release_ms / 1000.0 * sr))
    g3 = np.empty_like(g2)
    cur = 1.0
    for i, v in enumerate(g2):                                  # 释放：增益回升时平滑
        cur = v if v < cur else cr * cur + (1.0 - cr) * v
        g3[i] = cur
    return x * (g3[:, None] if x.ndim == 2 else g3)
