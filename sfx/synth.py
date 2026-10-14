"""音高类声源：带限振荡器、FM、超级锯齿、拨弦（Karplus-Strong）、ADSR。

用于界面提示音、音乐性的转场音效和简单配乐。所有振荡器都是"带限"的（PolyBLEP），
避免朴素锯齿/方波在高音区产生刺耳的混叠。频率参数可以是标量，也可以是逐采样数组（滑音、颤音）。
"""
from __future__ import annotations

import re

import numpy as np
from scipy import signal

from .core import SR, n_samples, rng

_NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(note) -> float:
    """音名或 MIDI 号 → 频率。hz("A4")=440，hz("C#5")，hz("Eb3")，hz(60)。"""
    if isinstance(note, (int, float, np.integer, np.floating)):
        return 440.0 * 2 ** ((float(note) - 69) / 12)
    m = re.fullmatch(r"([A-Ga-g])([#b]?)(-?\d)", note.strip())
    if not m:
        raise ValueError(f"无法解析音名: {note}")
    k = _NOTE[m.group(1).upper()] + {"#": 1, "b": -1, "": 0}[m.group(2)]
    return 440.0 * 2 ** ((k + 12 * (int(m.group(3)) + 1) - 69) / 12)


def _freq(freq, n):
    return np.broadcast_to(np.asarray(freq, dtype=float), (n,))


def _phase(freq, n, phase0, sr):
    f = _freq(freq, n)
    dt = f / sr
    return (phase0 + np.cumsum(dt) - dt[0]) % 1.0, dt


def _polyblep(t, dt):
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1.0
    m = t > 1.0 - dt
    x = (t[m] - 1.0) / dt[m]
    y[m] = x * x + x + x + 1.0
    return y


def sine(freq, n: int, phase0: float = 0.0, sr: int = SR) -> np.ndarray:
    ph, _ = _phase(freq, n, phase0, sr)
    return np.sin(2 * np.pi * ph)


def saw(freq, n: int, phase0: float = 0.0, sr: int = SR) -> np.ndarray:
    """带限锯齿波（PolyBLEP）。"""
    ph, dt = _phase(freq, n, phase0, sr)
    return 2.0 * ph - 1.0 - _polyblep(ph, dt)


def pulse(freq, n: int, width: float = 0.5, phase0: float = 0.0, sr: int = SR) -> np.ndarray:
    """带限脉冲/方波：两个相位错开的锯齿相减。"""
    y = saw(freq, n, phase0, sr) - saw(freq, n, (phase0 + width) % 1.0, sr)
    return y - y.mean()


def triangle(freq, n: int, phase0: float = 0.0, sr: int = SR) -> np.ndarray:
    """三角波（谐波按 12 dB/倍频程衰减，混叠很轻，直接用朴素算法）。"""
    ph, _ = _phase(freq, n, phase0, sr)
    return 4.0 * np.abs(ph - 0.5) - 1.0


def fm(carrier, ratio: float, index, n: int, feedback: float = 0.0, sr: int = SR) -> np.ndarray:
    """两算子 FM：载波 + 调制器（频率 = 载波 × ratio）。index 可为包络数组：
    指数随时间衰减 → 起音明亮、尾音变纯，这正是钟、电钢琴、玻璃感提示音的听感来源。
    ratio 为非整数（如 3.5、1.41）时产生非谐波的金属/钟声音色。"""
    c = _freq(carrier, n)
    mod = sine(c * ratio, n, 0.0, sr)
    if feedback:
        mod = np.sin(2 * np.pi * np.cumsum(c * ratio) / sr + feedback * mod)
    ph = np.cumsum(c) / sr
    return np.sin(2 * np.pi * ph + _freq(index, n) * mod)


def supersaw(freq, n: int, voices: int = 7, detune: float = 0.25, seed=None, sr: int = SR) -> np.ndarray:
    """超级锯齿：多个轻微失谐的锯齿叠加（宽厚的合成器铺底）。detune 为最大失谐（半音）。"""
    g = rng(seed)
    f = _freq(freq, n)
    offs = np.linspace(-1, 1, voices) * detune
    y = np.zeros(n)
    for k, o in enumerate(offs):
        y += saw(f * 2 ** (o / 12), n, g.uniform(), sr) * (1.0 if k == voices // 2 else 0.7)
    return y / voices


def pluck(freq: float, dur: float, brightness: float = 0.6, decay: float = 0.996, seed=None, sr: int = SR) -> np.ndarray:
    """Karplus-Strong 拨弦：噪声激励 + 延迟线 + 平均低通反馈（用长 IIR 实现，速度快）。
    brightness 控制激励噪声的亮度，decay 越接近 1 余音越长。"""
    g = rng(seed)
    n = n_samples(dur, sr)
    N = max(2, int(round(sr / freq - 0.5)))
    exc = g.uniform(-1, 1, N)
    if brightness < 1:
        exc = signal.lfilter([brightness], [1, -(1 - brightness)], exc)
    x = np.zeros(n)
    x[:N] = exc
    a = np.zeros(N + 2)
    a[0], a[N], a[N + 1] = 1.0, -0.5 * decay, -0.5 * decay
    return signal.lfilter([1.0], a, x)


def adsr(n: int, attack: float, decay: float, sustain: float, release: float, gate: float | None = None,
         sr: int = SR) -> np.ndarray:
    """ADSR 包络（起音线性、衰减/释放为指数形状）。gate 为按住时长（秒），默认 = 总长 - release。"""
    t = np.arange(n) / sr
    gate = (n / sr - release) if gate is None else gate
    env = np.where(t < attack, t / max(attack, 1e-6),
                   sustain + (1 - sustain) * np.exp(-(t - attack) / max(decay / 3, 1e-6)))
    g_level = float(np.interp(gate, t, env)) if n else 0.0
    rel = t >= gate
    env[rel] = g_level * np.exp(-(t[rel] - gate) / max(release / 5, 1e-6))
    return env
