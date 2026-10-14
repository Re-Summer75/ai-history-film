"""母带处理与导出："清晰度"的工程底线。"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

from .core import SR, amp_to_db, db_to_amp, fade, to_mono
from .dynamics import limit, true_peak
from .filters import highpass


def trim_silence(x: np.ndarray, floor_db: float = -60.0, keep_head: float = 0.003, keep_tail: float = 0.05,
                 sr: int = SR) -> np.ndarray:
    """裁掉首尾的数字静音（相对峰值低于 floor_db 的部分）。"""
    env = np.abs(to_mono(x))
    p = env.max() if len(env) else 0.0
    if p == 0:
        return x
    idx = np.nonzero(env > p * db_to_amp(floor_db))[0]
    head = int(keep_head * sr)
    s = max(0, idx[0] - head)
    e = min(len(x), idx[-1] + int(keep_tail * sr))
    y = x[s:e]
    if idx[0] < head:   # 声音从第一个采样就开始（瞬态在最前面）：补足留白，免得淡入削掉瞬态
        y = np.concatenate([np.zeros((head - idx[0],) + y.shape[1:]), y])
    return y


def loudness_lufs(x: np.ndarray, sr: int = SR) -> float:
    """ITU-R BS.1770 积分响度（LUFS），用于环境声/长音频的响度统一。"""
    from .analysis import integrated_loudness
    return integrated_loudness(x, sr)


def finalize(x: np.ndarray, peak_db: float = -1.0, lufs: float | None = None, highpass_hz: float = 20.0,
             fade_in: float = 0.0005, fade_out: float = 0.03, trim: bool = True, sr: int = SR) -> np.ndarray:
    """母带：切除次声/直流 → 裁静音 → 响度或峰值归一 → 前瞻限幅 → 真峰值校正 → 首尾淡入淡出（防爆音）。

    - 单次音效（撞击、关门）：lufs=None，按真峰值归一到 peak_db。
    - 环境声（雨、风、火）：给 lufs（如 -20），限幅器兜底峰值。
    """
    y = highpass(np.asarray(x, dtype=float), highpass_hz, sr=sr)
    y -= y.mean(axis=0)
    if trim:
        y = trim_silence(y, sr=sr)
    if lufs is not None:
        cur = loudness_lufs(y, sr)
        if np.isfinite(cur):
            y = y * db_to_amp(lufs - cur)
        y = limit(y, peak_db - 0.3, sr=sr)
    else:
        tp = true_peak(y)
        if tp > 0:
            y = y * db_to_amp(peak_db) / tp
    tp = true_peak(y)
    if tp > db_to_amp(peak_db):
        y = y * db_to_amp(peak_db) / tp
    return fade(y, fade_in, fade_out, sr)


def save(path, x: np.ndarray, sr: int = SR, subtype: str = "PCM_24") -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.asarray(x, dtype=np.float32), sr, subtype=subtype)
    return path


def load(path, sr: int = SR) -> np.ndarray:
    """读取音频并重采样到 sr（用于分析参考录音）。"""
    from math import gcd

    from scipy.signal import resample_poly
    x, file_sr = sf.read(str(path), always_2d=False)
    x = np.asarray(x, dtype=float)
    if file_sr != sr:
        g = gcd(sr, file_sr)
        x = resample_poly(x, sr // g, file_sr // g, axis=0)
    return x


__all__ = ["finalize", "save", "load", "trim_silence", "loudness_lufs", "amp_to_db"]
