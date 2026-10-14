"""天气：雨、风。随机纹理 + 慢变控制信号的范例。"""
from __future__ import annotations

import numpy as np

from .. import modal, texture
from ..core import SR, Mix, db_to_amp, n_samples, normalize, rms, rng, smooth_random
from ..filters import bandpass, highpass, lowpass, peak_eq, tv_filter
from ..noise import brown, burst, pink, white
from . import recipe


def _rms_to(x, db):
    r = rms(x)
    return x if r == 0 else x * (float(db_to_amp(db)) / r)


def _drop_kernels(kind: str, g, k: int = 32) -> list[np.ndarray]:
    """单个雨滴撞击不同表面的声音（每种表面 k 个变体，事件随机选用）。
    变体要多：同一个带共振的核被重复几千次，会叠加出固定的共振峰（听起来有"音高"）。"""
    out = []
    for _ in range(k):
        if kind == "pavement":      # 硬路面：极短的宽带"嗒"
            x = bandpass(burst(g.uniform(0.3, 1.4) / 1000, g), np.exp(g.uniform(np.log(1500), np.log(9000))), g.uniform(0.6, 1.4))
        elif kind == "leaves":      # 树叶：轻薄、阻尼极大的小板，短促"嗒"
            b = modal.random_body(1200, 7500, 6, "cardboard", eta=0.04, alpha=150.0, seed=g)
            x = b.render([modal.Hit(0.0, 1.0, g.uniform(0.2, 0.5), hardness=0.3)], dur=0.05)
            x = x / (np.max(np.abs(x)) + 1e-12)
            tick = bandpass(burst(0.0006, g), 4000, 0.8)
            x[: len(tick)] += 0.3 * tick / (np.max(np.abs(tick)) + 1e-12)
        elif kind == "roof":        # 铁皮屋顶：带余音的金属"叮"
            b = modal.random_body(900, 7000, 9, "metal", eta=0.0015, alpha=22.0, seed=g)
            x = b.render([modal.Hit(0.0, 1.0, 0.15)], dur=0.35)
        elif kind == "window":      # 玻璃窗：清脆的"嗒"
            b = modal.random_body(2500, 11000, 6, "glass", eta=0.0015, alpha=90.0, seed=g)
            x = b.render([modal.Hit(0.0, 1.0, 0.08)], dur=0.06)
        else:
            raise ValueError(kind)
        out.append(x / (np.max(np.abs(x)) + 1e-12))
    return out


@recipe(tags=("环境", "雨", "纹理"), master={"lufs": -20.0}, baseline="naive_rain")
def rain(seed=0, dur=12.0, intensity=0.6, surface="mixed"):
    """下雨
    ① 近处雨滴：数千个独立撞击 —— 泊松分布的时间 + 幂律分布的大小 + 按表面材质塑形 + 散布在整个声场
    ② 水洼里的气泡"叮"（Minnaert 气泡共振，音高上扬）
    ③ 远处雨幕的底噪 + 大雨时的低频轰鸣
    ④ 雨势随时间缓慢起伏
    intensity: 0~1（小雨→暴雨）；surface: mixed 混合 | leaves 树叶 | pavement 路面 | roof 铁皮屋顶 | window 隔着玻璃窗"""
    g = rng(seed)
    n = n_samples(dur)
    swell = np.clip(1.0 + 0.35 * smooth_random(dur, 0.1, g, octaves=2), 0.3, None)
    rate = (120.0 + 3000.0 * intensity ** 1.5) * swell

    kinds = {"mixed": ["pavement", "leaves"], "leaves": ["leaves"], "pavement": ["pavement"],
             "roof": ["roof"], "window": ["window"]}[surface]
    if surface == "roof":
        rate = rate * 0.35
    elif surface == "window":
        rate = rate * 0.15
    kern = [k for kind in kinds for k in _drop_kernels(kind, g)]

    m = Mix(dur)
    positions = [-0.85, -0.45, 0.0, 0.45, 0.85]
    for p in positions:                               # 近处：全频带、声场宽
        t = texture.modulated_times(rate / len(positions), g)
        a = texture.power_law(len(t), 2.3, 0.03, 1.0, g)
        x = texture.scatter(t, a, kern, n, g)
        m.add(_rms_to(x, -22.0), pan_pos=p)
    for p in (-0.6, 0.0, 0.6):                        # 稍远处：更多、更暗、更轻
        t = texture.modulated_times(rate * 0.8, g)
        a = texture.power_law(len(t), 2.3, 0.03, 1.0, g)
        x = lowpass(texture.scatter(t, a, kern, n, g), 3500.0)
        m.add(_rms_to(x, -28.0), pan_pos=p)

    if surface in ("mixed", "pavement"):               # 水洼气泡
        bub = np.zeros((n, 2))
        tb = texture.modulated_times((10.0 + 90.0 * intensity) * swell * (1.0 if surface == "mixed" else 0.4), g)
        for t0, a in zip(tb, texture.power_law(len(tb), 2.0, 0.1, 1.0, g)):
            r_mm = np.exp(g.uniform(np.log(0.9), np.log(3.5)))
            b = texture.bubble(3.26 / (r_mm / 1000.0), rise=g.uniform(0.05, 0.3))
            s = int(t0 * SR)
            e = min(n, s + len(b))
            th = (g.uniform(-0.9, 0.9) + 1) * np.pi / 4
            bub[s:e] += a * b[: e - s, None] * np.array([np.cos(th), np.sin(th)])
        m.add(_rms_to(bub, -32.0 + 4 * intensity))

    bed = np.stack([pink(n, g), pink(n, g)], axis=1)   # 远处雨幕：去相关的立体声底噪
    bed = lowpass(highpass(bed, 500.0), 11000.0)
    bed = peak_eq(bed, 4500.0, 4.0, q=0.6) * (swell ** 0.7)[:, None]   # 雨幕的"沙沙"集中在 3~7 kHz
    if surface == "window":
        bed = lowpass(bed, 1400.0, order=4)            # 隔着玻璃，外面的雨声发闷
    m.add(_rms_to(bed, -23.0 + 5.0 * intensity))
    if intensity > 0.5:
        rumble = lowpass(np.stack([brown(n, g), brown(n, g)], axis=1), 160.0, order=4)
        m.add(_rms_to(rumble, -40.0 + 12.0 * (intensity - 0.5)))
    return m.out()[:n]


@recipe(tags=("环境", "风", "纹理"), master={"lufs": -22.0})
def wind(seed=0, dur=15.0, strength=0.6, gustiness=0.6, whistle=0.5, env="open"):
    """阵风
    一条"风速曲线"（慢变随机 + 不对称的阵风：涨得快、落得慢）同时驱动所有层：
    ① 低频隆隆 ② 中频呼啸（中心频率随风速升高）③ 强风时的高频嘶声 ④ 缝隙口哨声（窄带共振，音高随风速）
    env: open 空旷处 | trees 树林（加树叶沙沙声）| indoor 室内听窗外（发闷，口哨声明显）"""
    g = rng(seed)
    n = n_samples(dur)
    t = np.arange(n) / SR
    v = strength + 0.3 * gustiness * smooth_random(dur, 0.09, g, octaves=3)
    for tg in texture.poisson_times(dur, 0.12 + 0.12 * gustiness, g):  # 阵风事件
        rise, fall, amp = g.uniform(0.8, 2.5), g.uniform(2.0, 5.0), g.uniform(0.25, 0.6) * gustiness
        shape = np.where(t < tg, np.exp(-((t - tg) / rise) ** 2), np.exp(-((t - tg) / fall) ** 2))
        v = v + amp * shape
    v = np.clip(v, 0.03, 1.3)

    m = Mix(dur)
    muffle = env == "indoor"
    for ch in (0, 1):                                  # 左右声道独立噪声、共享风速 → 宽阔
        rumble = tv_filter(highpass(brown(n, g), 35.0), "lowpass", 70.0 + 220.0 * v, 0.7, block=128) * v ** 1.8
        whoosh = tv_filter(pink(n, g), "bandpass", 220.0 + 1300.0 * v ** 1.4, 0.9, block=128) * v ** 2.6
        hiss = highpass(white(n, g), 3500.0) * np.clip(v - 0.45, 0, None) ** 2
        layer = _rms_to(rumble, -22.0) + _rms_to(whoosh, -21.0) + _rms_to(hiss, -40.0 + 10 * strength)
        if muffle:
            layer = lowpass(layer, 900.0, order=4)
        stereo = np.zeros((n, 2))
        stereo[:, ch] = layer
        m.add(stereo)

    if whistle > 0:                                    # 缝隙口哨：窄带、音高跟风速走，风弱时消失
        for _ in range(2):
            f0 = g.uniform(420, 900)
            jitter = 1.0 + 0.012 * smooth_random(dur, 6.0, g)       # 湍流造成的音高抖动
            fc = f0 * (0.55 + 0.75 * v) * jitter
            gate = np.clip((v - 0.35) / 0.4, 0, 1) ** 2
            w = tv_filter(pink(n, g), "bandpass", fc, g.uniform(18, 35), block=64) * gate
            m.add(_rms_to(w, -30.0 + 8.0 * whistle + (6.0 if muffle else 0.0)), pan_pos=g.uniform(-0.6, 0.6))

    if env == "trees":                                 # 树叶沙沙：高频颗粒，密度随风速
        leaves = np.zeros((n, 2))
        rate = 40.0 + 900.0 * v ** 2
        for ch in (0, 1):
            tl = texture.modulated_times(rate, g)
            kern = [bandpass(burst(g.uniform(0.004, 0.02), g), g.uniform(2500, 8000), 0.9) for _ in range(10)]
            leaves[:, ch] = texture.scatter(tl, texture.power_law(len(tl), 2.0, 0.1, 1.0, g), kern, n, g)
        m.add(_rms_to(leaves, -30.0))
    return m.out()[:n]
