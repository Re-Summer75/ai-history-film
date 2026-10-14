"""门：关门（多层叠加的范例）、门轴吱呀（摩擦 → 脉冲串 → 共振）。"""
from __future__ import annotations

import numpy as np

from .. import modal, texture
from ..core import SR, Mix, n_samples, normalize, pan, rng, smooth_random
from ..dynamics import saturate
from ..env import breakpoints, exp_decay
from ..filters import bandpass, highpass, lowpass, resonator_bank
from ..noise import pink, white
from ..space import reverb
from . import recipe


@recipe(tags=("门", "撞击", "分层"))
def door_slam(seed=0, force=1.0, room="room", wet_db=-9.0, latch=True):
    """用力关门（分层叠加的范例）
    ① 门扇扫过推动空气的"呼" ② 门板撞门框：板模态 ③ 撞击瞬间的木头"啪"
    ④ 墙体/门框的低频冲击 ⑤ 门锁舌弹入锁扣的两下金属"咔哒" ⑥ 五金件余震 ⑦ 房间被激发的混响"""
    g = rng(seed)
    t0 = 0.22                        # 撞击时刻（前面留给"呼"）
    m = Mix()

    nw = n_samples(t0)
    whoosh = lowpass(pink(nw, g), 380.0, order=4) * breakpoints([(0, 0), (t0 * 0.55, 0.35), (t0, 1.0)], t0)
    m.add(normalize(whoosh, 0), at=0.0, gain_db=-27.0)

    door = modal.plate(g.uniform(55, 68), "wood", aspect=2.4, n_modes=150, tilt=0.2, eta=0.03, alpha=14.0,
                       pos=(0.5, 0.96), seed=g)   # 撞击发生在门的锁边
    body = door.render([modal.Hit(t0, force, contact_ms=2.2, hardness=0.3)])
    body = highpass(body, 200.0, order=1)          # 辐射效率（见 knock_wood）
    m.add(normalize(body, 0), gain_db=0.0)

    crack = modal.contact_noise(g.uniform(1.5, 2.5), center_hz=g.uniform(1200, 1800), q=0.6, seed=g)
    m.add(crack, at=t0, gain_db=-7.0)

    nth = n_samples(0.35)
    tt = np.arange(nth) / SR
    f_th = 72.0 * np.exp(-tt / 0.08) + 48.0        # 低频冲击：音高快速下滑
    thump = np.sin(2 * np.pi * np.cumsum(f_th) / SR) * exp_decay(nth, 0.3)
    m.add(thump * np.minimum(1, tt / 0.002), at=t0, gain_db=-8.0)

    if latch:
        bolt = modal.random_body(2400, 9000, 10, "metal", tilt=0.2, eta=0.0012, alpha=70.0, seed=g)
        tl = t0 + g.uniform(0.012, 0.022)
        clicks = bolt.render([modal.Hit(tl, 1.0, 0.12), modal.Hit(tl + g.uniform(0.008, 0.016), 0.7, 0.1)])
        m.add(normalize(clicks, 0), gain_db=-13.0, pan_pos=0.1)

    rattle = modal.random_body(1200, 6500, 8, "metal", tilt=0.2, eta=0.004, alpha=90.0, seed=g)
    rt = np.sort(t0 + 0.03 + g.exponential(0.06, g.integers(4, 9)))
    rv = 0.9 ** np.arange(len(rt)) * g.uniform(0.3, 1.0, len(rt))
    rat = rattle.render([modal.Hit(t, v, 0.15) for t, v in zip(rt, rv)])
    m.add(normalize(rat, 0), gain_db=-31.0, pan_pos=-0.2)

    dry = saturate(m.out(), drive_db=4.0, mix=0.5)
    return reverb(dry, room, wet_db=wet_db, seed=g)


@recipe(tags=("门", "摩擦"))
def door_creak(seed=0, dur=2.4, pitch=1.0, room="room", wet_db=-14.0):
    """老木门慢慢打开的吱呀声
    物理：铰链处"粘滞-滑动"交替（stick-slip）产生一串脉冲，脉冲频率 = 听到的音高，随开门速度起伏；
    脉冲激发铰链与门板的共振峰，形成像"嗓音"一样的吱呀。门停住时摩擦也停止。
    pitch：整体音高倍率。"""
    g = rng(seed)
    n = n_samples(dur)
    speed = breakpoints([(0, 0.0), (0.12 * dur, 0.55), (0.45 * dur, 1.0), (0.8 * dur, 0.75), (dur, 0.0)], dur)
    speed = np.clip(speed * (1 + 0.3 * smooth_random(dur, 2.5, g, octaves=3)), 0, None)
    rate = pitch * (90.0 + 420.0 * speed ** 1.3)            # 粘滑频率（Hz）= 听到的音高
    exc = texture.stick_slip(rate, speed, seed=g)

    # 共振峰要"宽"（t60 短 → Q ≈ 10~25），否则会变成恒定的哨音，盖过随速度变化的粘滑音高
    f_formant = g.uniform([650, 1100, 1700, 2600], [850, 1500, 2300, 3400]) * pitch ** 0.3
    creak = resonator_bank(exc, f_formant, g.uniform(0.006, 0.014, 4), g.uniform(0.5, 1.0, 4))
    door = modal.plate(g.uniform(60, 75), "wood", aspect=2.4, n_modes=80, tilt=0.3, eta=0.03, alpha=14.0, seed=g)
    body = resonator_bank(exc, door.freqs, door.t60s, door.gains * g.uniform(0.3, 1.0, len(door.freqs)))
    scrape = bandpass(white(n, g), 2500.0, 0.8) * speed ** 2

    m = Mix()
    m.add(normalize(creak, 0), gain_db=0.0)
    m.add(normalize(highpass(body, 200.0, order=1), 0), gain_db=-7.0)
    m.add(normalize(scrape, 0), gain_db=-30.0)
    dry = highpass(m.out()[:, 0], 120.0)
    return reverb(pan(dry, g.uniform(-0.3, 0.3)), room, wet_db=wet_db, seed=g)
