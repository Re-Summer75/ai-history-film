"""脚步：人的节奏 + 表面材质。同一套"脚跟-前掌"动作，换表面模型就换声音。"""
from __future__ import annotations

import numpy as np

from .. import modal, texture
from ..core import SR, Mix, n_samples, normalize, rng, smooth_random
from ..env import breakpoints
from ..filters import bandpass, highpass, lowpass, resonator_bank
from ..noise import burst
from ..space import outdoor, reverb
from . import recipe


def _floor_creak(g, dur: float) -> np.ndarray:
    """地板的短促嘎吱：粘滑摩擦脉冲串 → 木板共振峰。"""
    n = n_samples(dur)
    amp = breakpoints([(0, 0.0), (dur * 0.3, 1.0), (dur, 0.0)], dur) * (1 + 0.3 * smooth_random(dur, 20, g))
    rate = g.uniform(180, 450) * (0.8 + 0.4 * amp)
    exc = texture.stick_slip(rate, np.clip(amp, 0, None), seed=g)
    f = g.uniform([500, 900, 1500], [800, 1400, 2400])
    return resonator_bank(exc, f, g.uniform(0.006, 0.015, 3), g.uniform(0.5, 1.0, 3))


def _gravel_crunch(g, v: float, n_len: int) -> np.ndarray:
    """碎石：一次踩踏 = 几十个石子之间的微小碰撞，集中在前 50 ms、随后稀疏，持续约 150 ms。"""
    k = int(g.uniform(30, 60) * v) + 5
    times = g.gamma(1.6, 0.028, k)
    kern = []
    for _ in range(10):
        if g.random() < 0.3:     # 石子相碰的"咔"：极小的石头模态
            b = modal.random_body(2500, 9000, 4, "stone", eta=0.006, alpha=250.0, seed=g)
            kern.append(b.render([modal.Hit(0.0, 1.0, 0.1)], dur=0.02))
        else:                    # 摩擦/滚动的沙沙
            kern.append(bandpass(burst(g.uniform(0.15, 1.2) / 1000, g), np.exp(g.uniform(np.log(1200), np.log(9000))),
                                 g.uniform(0.7, 2.0)))
    kern = [x / (np.max(np.abs(x)) + 1e-12) for x in kern]
    x = texture.scatter(times, texture.power_law(k, 2.0, 0.08, 1.0, g), kern, n_len, g)
    thud = highpass(lowpass(burst(0.04, g), 160.0, order=4), 50.0)
    x[: len(thud)] += 0.25 * thud / (np.max(np.abs(thud)) + 1e-12) * np.max(np.abs(x))
    return x


@recipe(tags=("脚步", "分层"))
def footsteps(seed=0, surface="wood", steps=6, pace=1.8, shoe="hard", room="auto"):
    """脚步
    每一步 = 脚跟着地 + 60~110 ms 后前掌着地；左右脚力度略有差异；节奏带人的随机抖动。
    surface: wood 木地板（板模态 + 偶尔嘎吱）| concrete 水泥地（鞋跟"咔哒" + 走廊回声）| gravel 碎石（颗粒碰撞）
    shoe: hard 硬底鞋 | soft 软底运动鞋
    room: auto（木地板→房间，水泥→走廊，碎石→户外）或 ROOMS 里的名字"""
    g = rng(seed)
    hard = shoe == "hard"
    times = texture.human_rhythm(steps, 1.0 / pace, jitter=0.035, seed=g, start=0.05)
    dur = times[-1] + 0.6
    m = Mix(dur)
    floor = None
    if surface == "wood":
        floor = modal.plate(g.uniform(85, 110), "wood", aspect=4.0, n_modes=120, tilt=0.2, eta=0.03, alpha=18.0, seed=g)
    floor_hits = []

    for i, t in enumerate(times):
        foot = i % 2
        v = g.uniform(0.85, 1.0) * (1.0 if foot == 0 else g.uniform(0.85, 0.95))
        p = (-0.1 if foot == 0 else 0.1) + g.normal(0, 0.04)
        toe = t + g.uniform(0.06, 0.11)
        if surface == "wood":
            floor_hits += [modal.Hit(t, v, 1.0 if hard else 3.5, hardness=0.35 if hard else 0.05),
                           modal.Hit(toe, 0.55 * v, 1.6 if hard else 4.5, hardness=0.2 if hard else 0.0)]
            if hard:
                m.add(modal.contact_noise(g.uniform(0.5, 0.9), g.uniform(2000, 3500), 0.9, g) * v, t, -12.0, p)
            else:
                m.add(normalize(lowpass(burst(0.003, g), 900.0), 0) * v, t, -16.0, p)
            if g.random() < 0.22:
                m.add(normalize(_floor_creak(g, g.uniform(0.08, 0.25)), 0) * v, t + g.uniform(0.02, 0.1), -19.0, p)
        elif surface == "concrete":
            for tt, vv in ((t, v), (toe, 0.5 * v)):
                if hard:
                    # 水泥地又厚又重，不会"叮"地共振；硬底鞋的"咔哒"主要来自鞋跟本身（小块、高阻尼的硬塑料）
                    click = modal.contact_noise(g.uniform(1.0, 1.5), g.uniform(2000, 3500), 0.8, g)
                    heel = modal.random_body(1200, 5000, 6, "plastic", eta=0.03, alpha=150.0, seed=g)
                    body = normalize(heel.render([modal.Hit(0.0, 1.0, 0.25)], dur=0.05), 0)
                    m.add(click * vv, tt, -3.0, p).add(body * vv, tt, -5.0, p)
                thud = lowpass(burst(0.02, g), 150.0, order=4)
                m.add(normalize(thud, 0) * vv, tt, -10.0 if hard else -2.0, p)
                if not hard:
                    m.add(bandpass(burst(0.008, g), 3000.0, 0.7) * vv, tt, -26.0, p)   # 鞋底与地面的轻微摩擦
        elif surface == "gravel":
            for tt, vv in ((t, v), (toe, 0.6 * v)):
                x = _gravel_crunch(g, vv, n_samples(0.3))
                m.add(normalize(x, 0) * vv, tt, 0.0, p)
        else:
            raise ValueError(f"未知表面: {surface}")

    if floor is not None:
        body = highpass(floor.render(floor_hits, dur=dur), 180.0, order=1)   # 辐射效率
        m.add(normalize(body, 0), 0.0, 0.0 if hard else 2.0)
    dry = m.out()
    if room == "auto":
        room = {"wood": "room", "concrete": "corridor", "gravel": None}[surface]
    if surface == "gravel" and room is None:
        return outdoor(dry, distance=2.0, echoes=0, wet_db=-24.0, src_height=0.0, seed=g)
    return reverb(dry, room, wet_db=-9.0 if surface == "concrete" else -15.0, seed=g)
