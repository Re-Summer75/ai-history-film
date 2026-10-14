"""配乐乐器与处理（第二版，光粒子版视频用）

全部用 sfx 工具包合成：
- 鼓：物理化的底鼓 / 拍手 / 军鼓 / 踩镲 / 镲片
- 音高乐器：带限锯齿贝斯、超级锯齿铺底与主奏、FM 钟、FM 琶音、正弦堆叠的持续音
- 心跳：低频正弦"咚"+ 柔软的接触声（lub-dub 两下为一拍）
- 磁带处理：停转（读头线性减速，音高一路掉下去）、倒带（读头反向加速，音高越来越高）
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))   # 仓库根目录的 sfx 包
from sfx import synth                                              # noqa: E402,F401
from sfx.core import SR, db_to_amp, rng                            # noqa: E402,F401
from sfx.dynamics import compress, limit, saturate                 # noqa: E402,F401
from sfx.env import exp_decay                                      # noqa: E402
from sfx.filters import bandpass, highpass, highshelf, lowpass, lowshelf, tv_filter  # noqa: E402,F401
from sfx.noise import burst, pink, white                           # noqa: E402
from sfx.space import room_ir                                      # noqa: E402

HALL = dict(dims=(42.0, 30.0, 16.0), rt60=3.6, hf_damping=0.42)   # 电影感的大空间


def ns(d: float) -> int:
    return int(round(d * SR))


class Bus:
    """立体声总线：按时间放置单声道 / 立体声片段。"""

    def __init__(self, n: int):
        self.n = n
        self.buf = np.zeros((n, 2))

    def add(self, x, t: float, gain_db: float = 0.0, pan: float = 0.0):
        x = np.asarray(x, dtype=np.float64)
        if x.ndim == 1:
            th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
            x = np.stack([x * np.cos(th), x * np.sin(th)], axis=1) * np.sqrt(2)
        s = int(round(t * SR))
        if s >= self.n or s + len(x) <= 0:
            return
        if s < 0:
            x, s = x[-s:], 0
        e = min(self.n, s + len(x))
        self.buf[s:e] += x[: e - s] * float(db_to_amp(gain_db))


# ---------------------------------------------------------------- 鼓
def mk_kick(seed, punch=1.0):
    g = rng(seed)
    n = ns(0.55)
    t = np.arange(n) / SR
    f = 45.0 + 130.0 * punch * np.exp(-t / 0.026) + g.uniform(-0.5, 0.5)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = highpass(burst(0.004, g), 2500.0)
    click = np.pad(click, (0, n - len(click)))
    return saturate(body + 0.35 * click / (np.abs(click).max() + 1e-9), 5.0)


def mk_clap(seed):
    g = rng(seed)
    n = ns(0.35)
    x = np.zeros(n)
    for d in (0.0, 0.009, 0.019, 0.028):
        b = bandpass(burst(0.012 if d < 0.02 else 0.18, g, t60=0.012 if d < 0.02 else 0.16), 1250.0, 0.7)
        s = ns(d)
        x[s:s + len(b)] += b[: n - s]
    body = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * np.exp(-np.arange(n) / (0.04 * SR))
    return x / (np.abs(x).max() + 1e-9) + 0.25 * body


def mk_snare(seed):
    g = rng(seed)
    n = ns(0.3)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(185 + 70 * np.exp(-t / 0.015)) / SR) * np.exp(-t / 0.05)
    nz = bandpass(white(n, g), 3800.0, 0.55) * np.exp(-t / 0.08)
    return saturate(0.55 * body + 0.9 * nz / (np.abs(nz).max() + 1e-9), 3.0)


def mk_hat(seed, open_=False):
    g = rng(seed)
    d = 0.32 if open_ else 0.06
    n = ns(d)
    t = np.arange(n) / SR
    metal = sum(synth.pulse(f, n, 0.5) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = bandpass(metal, 8500.0, 0.8) + 0.8 * highpass(white(n, g), 7000.0)
    return highpass(x, 6000.0) * np.exp(-t / (0.11 if open_ else 0.018))


def mk_crash(seed, dur=3.2):
    """镲片：非谐波方波堆叠 + 高通噪声，左右声道去相关。"""
    n = ns(dur)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for c in range(2):
        g = rng(seed * 3 + c)
        fs = [313.3, 427.1, 587.9, 732.4, 911.7, 1203.1]
        metal = sum(synth.pulse(f * (1 + 0.004 * c), n, 0.5, phase0=g.uniform()) for f in fs)
        x = bandpass(metal, 6500.0, 0.5) + 1.1 * highpass(white(n, g), 5000.0)
        out[:, c] = highpass(x, 2500.0) * np.exp(-t / 0.75) * np.minimum(1.0, t / 0.0015)
    return out / (np.abs(out).max() + 1e-9)


# ---------------------------------------------------------------- 音高乐器
VOICING = {
    "Dm": ["D3", "F3", "A3", "D4"], "Bb": ["D3", "F3", "Bb3", "D4"], "F": ["C3", "F3", "A3", "C4"],
    "C": ["C3", "E3", "G3", "C4"], "Gm": ["D3", "G3", "Bb3", "D4"], "A": ["C#3", "E3", "A3", "C#4"],
    "D": ["D3", "F#3", "A3", "D4"], "Dsus2": ["D3", "A3", "E4", "A4"], "Bbadd9": ["D3", "F3", "Bb3", "C4"],
    "Csus": ["C3", "F3", "G3", "C4"],
}
ROOT = {"Dm": "D2", "Bb": "Bb1", "F": "F2", "C": "C2", "Gm": "G1", "A": "A1", "D": "D2", "Bbadd9": "Bb1", "Csus": "C2"}


def up(note: str, k: int = 1) -> str:
    return note[:-1] + str(int(note[-1]) + k)


def bass_note(note, dur, bright):
    f = synth.hz(note)
    n = ns(dur + 0.05)
    t = np.arange(n) / SR
    osc = 0.7 * synth.saw(f, n) + 0.5 * synth.pulse(f * 1.002, n, 0.3)
    fenv = np.exp(-t / 0.09)
    cut = 120.0 + (250.0 + 1800.0 * bright) * (0.25 + 0.75 * fenv)
    x = tv_filter(osc, "lowpass", cut, 1.2, block=32) + 0.45 * synth.sine(f, n)
    amp = np.minimum(1.0, t / 0.004) * np.minimum(1.0, np.maximum(0.0, dur + 0.05 - t) / 0.03)
    return saturate(x * amp, 4.0) * 0.8


def pad_chord(ch, dur, bright, seed, attack=0.9, release=0.6, octave=0):
    notes = [up(nt, octave) if octave else nt for nt in VOICING[ch]]
    n = ns(dur + release * 3)
    t = np.arange(n) / SR
    env = np.minimum(1.0, t / attack) * np.where(t < dur, 1.0, np.exp(-(t - dur) / release))
    out = np.zeros((n, 2))
    for c in range(2):
        g = rng(seed * 7 + c)
        x = sum(synth.supersaw(synth.hz(nt), n, voices=5, detune=0.14, seed=g) for nt in notes)
        x = lowpass(x, 600.0 + 5200.0 * bright, 0.7)
        out[:, c] = x * env
    return out / len(notes) * 1.6


def bell(note, gain=1.0, dur=3.0, index=2.6, ratio=3.5):
    f = synth.hz(note)
    n = ns(dur)
    t = np.arange(n) / SR
    idx = index * np.exp(-t / 0.35)
    x = synth.fm(f, ratio, idx, n) * exp_decay(n, dur * 0.9) + 0.35 * synth.fm(f, 1.0, 0.4, n) * exp_decay(n, dur * 0.6)
    return x * np.minimum(1.0, t / 0.002) * gain


def celesta(note, dur=4.0):
    """柔和的"问题"音色：FM 比例 1:4、小指数，接近钢片琴 / 八音盒。"""
    f = synth.hz(note)
    n = ns(dur)
    t = np.arange(n) / SR
    x = synth.fm(f, 4.0, 1.1 * np.exp(-t / 0.25), n) * exp_decay(n, dur * 0.8)
    x += 0.25 * synth.sine(2 * f, n) * exp_decay(n, 0.9)
    return x * np.minimum(1.0, t / 0.003)


def arp_note(note, bright=0.5, dur=0.28):
    f = synth.hz(note)
    n = ns(dur)
    t = np.arange(n) / SR
    return synth.fm(f, 2.0, (0.6 + 1.6 * bright) * np.exp(-t / 0.05), n) * np.exp(-t / 0.09) * np.minimum(1, t / 0.001)


def drone(note, dur, seed, fade_in=2.0, fade_out=1.5):
    f = synth.hz(note)
    n = ns(dur)
    t = np.arange(n) / SR
    g = rng(seed)
    lfo = 1.0 + 0.15 * np.sin(2 * np.pi * 0.11 * t)
    x = synth.sine(f, n) + 0.5 * synth.sine(f * 2.003, n) + 0.25 * synth.sine(f * 3.01, n) + 0.12 * synth.sine(f * 4.02, n)
    air = bandpass(pink(n, g), f * 6, 2.0) * 0.5
    env = np.minimum(1.0, t / fade_in) * np.clip((dur - t) / fade_out, 0, 1)
    return (x * lfo + air) * env


def lead_saw(note, dur, bright=1.0, seed=0, glide_from=None):
    """超级锯齿主奏：滤波包络 + 延迟颤音，可从上一个音滑过来。"""
    f = synth.hz(note)
    n = ns(dur + 0.45)
    t = np.arange(n) / SR
    vib = 1 + 0.0045 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.22) / 0.3, 0, 1)
    freq = f * vib
    if glide_from:
        freq = freq * (synth.hz(glide_from) / f) ** np.exp(-t / 0.035)
    out = np.zeros((n, 2))
    env = np.minimum(1.0, t / 0.008) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.14))
    cut = 700.0 + 5200.0 * bright * (0.35 + 0.65 * np.exp(-t / 0.3))
    for c in range(2):
        x = synth.supersaw(freq, n, voices=7, detune=0.2, seed=seed * 5 + c)
        out[:, c] = tv_filter(x, "lowpass", cut, 0.9, block=64) * env
    return out


def heartbeat(strength=1.0, seed=0):
    """心跳的一下：低频正弦的"咚"（音高快速下滑）+ 很软的接触声。"""
    g = rng(seed)
    n = ns(0.6)
    t = np.arange(n) / SR
    f = 44.0 + 34.0 * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12) * np.minimum(1.0, t / 0.005)
    knock = lowpass(burst(0.06, g, t60=0.035), 220.0)
    knock = np.pad(knock, (0, n - len(knock)))
    x = body + 0.35 * knock / (np.abs(knock).max() + 1e-9)
    return saturate(x, 3.0) * strength


def sub_boom(dur=3.0, f0=55.0, f1=30.0):
    n = ns(dur)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.35)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.35)) * np.minimum(1.0, t / 0.004)


# ---------------------------------------------------------------- 磁带处理
def _read(x: np.ndarray, pos: np.ndarray) -> np.ndarray:
    idx = np.arange(len(x))
    return np.stack([np.interp(pos, idx, x[:, c]) for c in range(2)], axis=1)


def tape_stop(x: np.ndarray, t0: float, dur: float) -> np.ndarray:
    """从 t0 开始读头线性减速到停：音高和速度一起掉到零。"""
    m = ns(dur)
    p = np.arange(m) / m
    rate = (1.0 - p) ** 1.15
    pos = ns(t0) + np.cumsum(rate)
    y = _read(x, pos)
    y *= np.clip((1.0 - p) / 0.06, 0, 1)[:, None]
    return lowpass(y, 9000.0)


def rewind(x: np.ndarray, t0: float, dur: float, v0=0.35, v1=4.5, curve=1.7, wow=0.03) -> np.ndarray:
    """从 t0 往回读，速度从 v0 倍加速到 v1 倍（倍速越高音调越尖），带一点磁带"抖动"。"""
    src = lowpass(x, SR / 2 / max(v1, 1.0) * 0.9)          # 先限带，防止加速后混叠
    m = ns(dur)
    p = np.arange(m) / m
    rate = -(v0 + (v1 - v0) * p ** curve) * (1 + wow * np.sin(2 * np.pi * 7.0 * p * dur))
    pos = np.clip(ns(t0) + np.cumsum(rate), 0, len(x) - 1)
    return _read(src, pos)


# ---------------------------------------------------------------- 效果
def sidechain(n: int, kicks, depth: float, tau: float = 0.16) -> np.ndarray:
    idx = (np.asarray(kicks) * SR).astype(int)
    idx = idx[(idx >= 0) & (idx < n)]
    last = np.full(n, -10**9)
    last[idx] = idx
    last = np.maximum.accumulate(last)
    dt = (np.arange(n) - last) / SR
    return 1.0 - depth * np.exp(-dt / tau) * (dt < 1.0)


def conv_chunked(x: np.ndarray, ir: np.ndarray, block_s: float = 15.0) -> np.ndarray:
    """分块卷积（重叠相加）：长达几分钟的音轨也只占很少内存；全静音的块直接跳过。"""
    n, m = len(x), len(ir)
    B = ns(block_s)
    y = np.zeros(n + m - 1)
    for s0 in range(0, n, B):
        seg = x[s0:s0 + B]
        if not np.any(seg):
            continue
        c = signal.fftconvolve(seg, ir)
        y[s0:s0 + len(c)] += c
    return y[:n]


def conv_reverb(x, room, wet_db, seed=0):
    ir = room_ir(room, seed).astype(np.float64)
    wet = np.stack([conv_chunked(np.asarray(x[:, c], np.float64), ir[:, c]) for c in range(2)], axis=1)
    return wet * float(db_to_amp(wet_db))


def pingpong(x, delay_s, fb=0.35, wet_db=-12.0, taps=6):
    D = ns(delay_s)
    irL, irR = np.zeros(D * taps * 2 + 1), np.zeros(D * taps * 2 + 1)
    for k in range(1, taps + 1):
        (irL if k % 2 else irR)[k * D] = fb ** (k - 1)
    m = np.asarray(x.mean(axis=1), np.float64)
    wet = np.stack([conv_chunked(m, irL), conv_chunked(m, irR)], axis=1)
    return lowpass(wet, 4500.0) * float(db_to_amp(wet_db))


def gate(n: int, spans, ramp: float = 0.004) -> np.ndarray:
    """静音区间 [(a, b), ...]（秒），边缘有极短斜坡，避免爆音。"""
    t = np.arange(n) / SR
    g = np.ones(n)
    for a, b in spans:
        k = np.clip(np.minimum((t - a) / ramp, (b - t) / ramp), 0, 1)
        g *= 1 - k
    return g
