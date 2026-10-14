"""滤波器：静态 EQ、时变滤波（频率随时间变化）、模态谐振器组。

所有函数都支持单声道 (n,) 与立体声 (n, 2)，沿第 0 轴滤波。
"""
from __future__ import annotations

import numpy as np
from scipy import signal

from .core import LN1000, SR


def _clamp_f(f, sr):
    return np.clip(f, 1.0, 0.49 * sr)


def biquad(kind: str, f0: float, q: float = 0.7071, gain_db: float = 0.0, sr: int = SR) -> np.ndarray:
    """RBJ Audio EQ Cookbook 双二阶滤波器，返回一行 sos（shape (1, 6)）。
    kind: lowpass | highpass | bandpass（峰值 0 dB）| notch | peak | lowshelf | highshelf
    """
    w0 = 2.0 * np.pi * float(_clamp_f(f0, sr)) / sr
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2.0 * max(q, 1e-4))
    A = 10.0 ** (gain_db / 40.0)
    if kind == "lowpass":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "highpass":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "bandpass":
        b = [alpha, 0.0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "notch":
        b = [1.0, -2 * cw, 1.0]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind in ("lowshelf", "highshelf"):
        s = 2.0 * np.sqrt(A) * (sw / 2.0 * np.sqrt(2.0))  # 坡度 S = 1
        if kind == "lowshelf":
            b = [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s)]
            a = [(A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]
        else:
            b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)]
            a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]
    else:
        raise ValueError(f"未知滤波器类型: {kind}")
    b, a = np.asarray(b) / a[0], np.asarray(a) / a[0]
    return np.concatenate([b, a])[None, :]


def sosfilt(sos: np.ndarray, x: np.ndarray) -> np.ndarray:
    return signal.sosfilt(sos, x, axis=0)


def lowpass(x, fc, q=0.7071, order=2, sr=SR):
    """order=2 用单个双二阶（可设 Q 做谐振）；order>2 用巴特沃斯。"""
    if order == 2:
        return sosfilt(biquad("lowpass", fc, q, sr=sr), x)
    return sosfilt(signal.butter(order, _clamp_f(fc, sr), "low", fs=sr, output="sos"), x)


def highpass(x, fc, q=0.7071, order=2, sr=SR):
    if order == 2:
        return sosfilt(biquad("highpass", fc, q, sr=sr), x)
    return sosfilt(signal.butter(order, _clamp_f(fc, sr), "high", fs=sr, output="sos"), x)


def bandpass(x, f0, q=1.0, sr=SR):
    return sosfilt(biquad("bandpass", f0, q, sr=sr), x)


def peak_eq(x, f0, gain_db, q=1.0, sr=SR):
    return sosfilt(biquad("peak", f0, q, gain_db, sr=sr), x)


def lowshelf(x, f0, gain_db, sr=SR):
    return sosfilt(biquad("lowshelf", f0, 0.7071, gain_db, sr=sr), x)


def highshelf(x, f0, gain_db, sr=SR):
    return sosfilt(biquad("highshelf", f0, 0.7071, gain_db, sr=sr), x)


def tv_filter(x: np.ndarray, kind: str, freq, q=0.7071, gain_db=0.0, block: int = 64, sr: int = SR) -> np.ndarray:
    """时变双二阶滤波：freq / q 可以是标量或与 x 等长的数组（如扫频、随风速变化的中心频率）。
    每 block 个采样更新一次系数，滤波器状态在块之间延续。"""
    n = len(x)
    freq = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    q = np.broadcast_to(np.asarray(q, dtype=float), (n,))
    y = np.empty_like(x, dtype=float)
    zi = np.zeros((1, 2) + x.shape[1:])
    for s in range(0, n, block):
        e = min(n, s + block)
        m = (s + e) // 2
        sos = biquad(kind, freq[m], q[m], gain_db, sr)
        y[s:e], zi = signal.sosfilt(sos, x[s:e], axis=0, zi=zi)
    return y


def resonator(excitation: np.ndarray, f: float, t60: float, amp: float = 1.0, sr: int = SR) -> np.ndarray:
    """单个模态：二阶谐振器，冲激响应为 amp · r^n · sin(ωn)（指数衰减的正弦）。"""
    if amp == 0 or f <= 0 or f >= 0.47 * sr:
        return np.zeros(len(excitation))
    r = np.exp(-LN1000 / (max(t60, 1e-5) * sr))
    w = 2.0 * np.pi * f / sr
    return signal.lfilter([0.0, amp * r * np.sin(w)], [1.0, -2.0 * r * np.cos(w), r * r], excitation)


def resonator_bank(excitation: np.ndarray, freqs, t60s, amps, sr: int = SR) -> np.ndarray:
    """模态谐振器组：所有模态共用同一个激励信号，输出为各模态之和。"""
    y = np.zeros(len(excitation))
    for f, t60, a in zip(freqs, t60s, amps):
        y += resonator(excitation, f, t60, a, sr)
    return y


def spectral_tilt_by_distance(x: np.ndarray, meters: float, sr: int = SR) -> np.ndarray:
    """空气吸收：高频随距离衰减（约 20°C/50%RH 的近似：α(f) ≈ 0.005·(f/1kHz)^1.5 dB/m）。零相位频域实现。"""
    if meters <= 1.0:
        return x
    n = len(x)
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1.0 / sr)
    att_db = 0.005 * (f / 1000.0) ** 1.5 * meters
    g = 10.0 ** (-att_db / 20.0)
    X *= g if x.ndim == 1 else g[:, None]
    return np.fft.irfft(X, n, axis=0)
