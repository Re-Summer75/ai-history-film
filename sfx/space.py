"""空间：房间混响、户外回声、距离感。干声"悬在真空里"是合成音效不真实的一大原因。

房间脉冲响应 = 镜像声源法算出的早期反射（离散回声，决定"房间有多大、墙在哪"）
            + 频率相关衰减的扩散尾音（高频比低频衰减得快，决定"房间是否吸音"）。
"""
from __future__ import annotations

import numpy as np
from scipy import signal

from .core import LN1000, SR, Mix, db_to_amp, n_samples, rng, to_stereo
from .filters import lowpass, spectral_tilt_by_distance, tv_filter
from .noise import white

C = 343.0  # 声速 m/s

ROOMS = {
    # dims: 长宽高(米)；rt60：中低频混响时间(秒)；hf_damping：0~1，越大高频衰减越快（软装、地毯）
    "small_room": dict(dims=(3.6, 3.0, 2.5), rt60=0.35, hf_damping=0.55),
    "room":       dict(dims=(5.0, 4.0, 2.8), rt60=0.55, hf_damping=0.5),
    "bathroom":   dict(dims=(2.6, 2.0, 2.4), rt60=0.9, hf_damping=0.2),
    "corridor":   dict(dims=(18.0, 2.2, 2.7), rt60=1.2, hf_damping=0.35),
    "hall":       dict(dims=(28.0, 18.0, 11.0), rt60=2.0, hf_damping=0.45),
    "warehouse":  dict(dims=(35.0, 22.0, 9.0), rt60=2.6, hf_damping=0.35),
    "cave":       dict(dims=(16.0, 9.0, 6.0), rt60=3.2, hf_damping=0.5),
}


def room_ir(room: str | dict = "room", seed=None, order: int = 3, sr: int = SR) -> np.ndarray:
    """合成立体声房间脉冲响应（不含直达声），能量归一。"""
    cfg = ROOMS[room] if isinstance(room, str) else room
    L = np.asarray(cfg["dims"], dtype=float)
    rt60, hfd = float(cfg["rt60"]), float(cfg["hf_damping"])
    g = rng(seed)

    V, S = np.prod(L), 2 * (L[0] * L[1] + L[0] * L[2] + L[1] * L[2])
    absorb = np.clip(0.161 * V / (S * rt60), 0.02, 0.95)      # Sabine 公式反推平均吸声系数
    beta = np.sqrt(1.0 - absorb)                               # 墙面反射系数
    src = L * g.uniform([0.2, 0.2, 0.35], [0.8, 0.8, 0.65])
    lis = L * g.uniform([0.2, 0.2, 0.4], [0.8, 0.8, 0.6])
    ears = [lis + np.array([-0.1, 0.0, 0.0]), lis + np.array([0.1, 0.0, 0.0])]  # 间隔 20 cm 的一对全指向话筒

    n = n_samples(rt60 * 1.3 + 0.1, sr)
    ir = np.zeros((n, 2))

    rng_idx = np.arange(-order, order + 1)
    nx, ny, nz = (a.ravel() for a in np.meshgrid(rng_idx, rng_idx, rng_idx, indexing="ij"))
    k = np.abs(nx) + np.abs(ny) + np.abs(nz)
    sel = (k >= 1) & (k <= order)
    nx, ny, nz, k = nx[sel], ny[sel], nz[sel], k[sel]
    imgs = np.stack([
        nx * L[0] + np.where(nx % 2 == 0, src[0], L[0] - src[0]),
        ny * L[1] + np.where(ny % 2 == 0, src[1], L[1] - src[1]),
        nz * L[2] + np.where(nz % 2 == 0, src[2], L[2] - src[2]),
    ], axis=1)

    t_mix = 4.0 * V / (S * C)  # 平均自由程时间：扩散尾音从这里开始建立
    t = np.arange(n) / sr
    for ch, ear in enumerate(ears):
        d_direct = np.linalg.norm(src - ear)
        d = np.linalg.norm(imgs - ear, axis=1)
        delay = (d - d_direct) / C * sr * g.uniform(0.995, 1.005, len(d))  # 轻微抖动，避免过于规整
        amp = (d_direct / d) * beta ** k
        early = np.zeros(n)
        for o in range(1, order + 1):                          # 反射次数越多越闷
            m = (k == o) & (delay < n - 2)
            part = np.zeros(n)
            i0 = np.floor(delay[m]).astype(int)
            frac = delay[m] - i0
            np.add.at(part, i0, amp[m] * (1 - frac))
            np.add.at(part, i0 + 1, amp[m] * frac)
            early += lowpass(part, 14000.0 * (1.0 - 0.5 * hfd) ** o, sr=sr)

        # 扩散尾音：去相关噪声 × 指数衰减，截止频率随时间下降（高频先消失）
        tail = white(n, g) * np.exp(-LN1000 * t / rt60)
        tail *= 1.0 - np.exp(-np.maximum(t - 0.5 * t_mix, 0.0) / (1.5 * t_mix))
        fc_end = 16000.0 * (1.0 - hfd) ** 3
        fc = 16000.0 * (max(fc_end, 200.0) / 16000.0) ** np.minimum(t / rt60, 1.0)
        tail = tv_filter(tail, "lowpass", fc, 0.6, block=128, sr=sr)
        # 统计声学：混响总能量 / 直达声能量 = 16π·d²·(1-ā) / (S·ā)；早期反射之外的部分由尾音补足
        e_rev = 16.0 * np.pi * d_direct ** 2 * (1.0 - absorb) / (S * absorb)
        e_early = float(np.sum(early ** 2))
        e_tail = max(e_rev - e_early, 0.3 * e_early)
        tail *= np.sqrt(e_tail / (np.sum(tail ** 2) + 1e-12))

        # 低频房间模态（Schroeder 频率以下）：房间的轴向驻波 f = c·k/(2L)，衰减比中高频慢 ——
        # 小房间里撞击声尾巴发"嗡"、偏暗，就是它们。耦合强度 = 声源与听者处的模态振型之积。
        f_s = 2000.0 * np.sqrt(rt60 / V)
        modal = np.zeros(n)
        for ax in range(3):
            for k_ax in range(1, 40):
                f = C * k_ax / (2.0 * L[ax])
                if f >= f_s:
                    break
                cpl = abs(np.cos(k_ax * np.pi * src[ax] / L[ax]) * np.cos(k_ax * np.pi * ear[ax] / L[ax]))
                t60m = rt60 * g.uniform(1.1, 1.5)
                modal += cpl * np.sin(2 * np.pi * f * t + g.uniform(0, 2 * np.pi)) * np.exp(-LN1000 * t / t60m)
        if np.any(modal):
            F = np.fft.rfftfreq(n, 1.0 / sr)
            e_low = float(np.sum(np.abs(np.fft.rfft(tail)[F < f_s]) ** 2) * 2.0 / n)
            modal *= np.sqrt(e_low / (np.sum(modal ** 2) + 1e-12))
            modal *= 1.0 - np.exp(-t / 0.01)
        ir[:, ch] = early + tail + modal

    return ir / np.sqrt(np.sum(ir ** 2) / 2.0)


def reverb(x: np.ndarray, room: str | dict = "room", wet_db: float = -10.0, dry_db: float = 0.0,
           predelay: float = 0.0, seed=None, sr: int = SR) -> np.ndarray:
    """卷积混响，返回立体声（干声 + 湿声）。wet_db 越大越"远/空旷"。"""
    ir = room_ir(room, seed, sr=sr)
    xs = to_stereo(x)
    wet = np.stack([signal.oaconvolve(xs[:, c], ir[:, c]) for c in range(2)], axis=1)
    return Mix(sr=sr).add(xs, 0.0, dry_db).add(wet, predelay, wet_db).out()


def outdoor(x: np.ndarray, distance: float = 10.0, echoes: int = 3, wet_db: float = -16.0,
            src_height: float = 1.5, seed=None, sr: int = SR) -> np.ndarray:
    """户外：距离衰减与空气吸收 + 地面反射 + 远处建筑/山体的回声 + 短散射尾音。
    src_height：声源离地高度。声源贴地（脚步、落地物体）时地面反射与直达声重合，不产生梳状染色。
    只做声学"位置感"，不改变整体增益（需要时自行按 1/r 调整音量）。"""
    g = rng(seed)
    dry = spectral_tilt_by_distance(to_stereo(x), distance, sr)
    m = Mix(sr=sr).add(dry)
    h_lis = 1.7
    dt = (np.hypot(distance, src_height + h_lis) - np.hypot(distance, src_height - h_lis)) / C
    if dt > 0.0003:
        m.add(lowpass(dry, 6000.0, sr=sr), dt, -4.0)
    for i, delay in enumerate(np.sort(g.uniform(0.15, 1.8, echoes))):
        echo = spectral_tilt_by_distance(to_stereo(x), distance + delay * C, sr)
        # 远处地形的回声经过多次散射，是"一团"而不是清晰的复制：延迟越长越弥散
        ls = n_samples(0.04 + 0.12 * delay, sr)
        smear = white(ls, g) * np.exp(-np.arange(ls) / (0.3 * ls))
        smear /= np.sqrt(np.sum(smear ** 2))
        echo = np.stack([signal.oaconvolve(echo[:, c], smear) for c in range(2)], axis=1)
        pos = g.uniform(-0.8, 0.8)
        gains = np.array([np.cos((pos + 1) * np.pi / 4), np.sin((pos + 1) * np.pi / 4)]) * np.sqrt(2)
        m.add(echo * gains, delay, wet_db - 5.0 * i - 6.0 * delay - g.uniform(0, 3))
    scat_n = n_samples(0.6, sr)
    scat = np.stack([white(scat_n, g), white(scat_n, g)], axis=1) * np.exp(-LN1000 * np.arange(scat_n) / (0.6 * sr))[:, None]
    scat = lowpass(scat, 3000.0, sr=sr)
    scat /= np.sqrt(np.sum(scat ** 2) / 2.0)
    xs = to_stereo(x)
    tail = np.stack([signal.oaconvolve(xs[:, c], scat[:, c]) for c in range(2)], axis=1)
    m.add(tail, 0.01, wet_db - 6.0)
    return m.out()


def distance(x: np.ndarray, meters: float, ref: float = 1.0, sr: int = SR) -> np.ndarray:
    """距离：1/r 衰减 + 空气吸收。"""
    return spectral_tilt_by_distance(x, meters, sr) * float(db_to_amp(-20 * np.log10(max(meters, ref) / ref)))
