"""撞击类：敲门、金属、玻璃。全部基于模态合成。"""
from __future__ import annotations

import numpy as np

from .. import modal, texture
from ..core import Mix, normalize, pan, rng
from ..filters import highpass
from ..space import reverb
from . import recipe


@recipe(tags=("撞击", "木头", "门"), baseline="naive_knock")
def knock_wood(seed=0, knocks=3, force=0.8, door="solid", room="small_room", wet_db=-15.0):
    """敲木门：指节敲击门板
    分层：门板的板模态（木材阻尼大，高频先消失）+ 指节骨头接触的"嗒" + 小房间反射。
    每一下的力度、间隔、敲击位置都略有不同。
    door: solid 实木门（厚重低沉）| hollow 空心门（更亮、更"空"）"""
    g = rng(seed)
    # 模态要覆盖到几 kHz（高阶模态衰减极快，正是"笃"的清脆感来源）；指节骨头硬，接触时间不到 1 ms
    if door == "hollow":
        body = modal.plate(g.uniform(100, 120), "wood", aspect=2.4, n_modes=140, tilt=0.1,
                           eta=0.022, alpha=9.0, pos=(0.6, 0.42), seed=g)
        contact, f_rad = (0.5, 0.8), 180.0
    else:
        body = modal.plate(g.uniform(68, 82), "wood", aspect=2.4, n_modes=160, tilt=0.15,
                           eta=0.035, alpha=16.0, pos=(0.6, 0.42), seed=g)
        contact, f_rad = (0.7, 1.1), 250.0
    times = texture.human_rhythm(knocks, interval=g.uniform(0.16, 0.21), jitter=0.07, seed=g, start=0.01)
    vel = force * np.clip(g.normal(1.0, 0.07, knocks), 0.75, 1.15)
    # 指节 = 软组织（长接触）+ 骨头（短接触）：hardness 让激励频谱不在 1.5/Tc 处出现空洞
    hits = [modal.Hit(t, v, contact_ms=g.uniform(*contact), hardness=0.25) for t, v in zip(times, vel)]

    m = Mix().add(normalize(body.render(hits), 0.0))
    for t, v in zip(times, vel):  # 指节骨头的"嗒"：极短、中高频
        tick = modal.contact_noise(g.uniform(1.0, 1.6), center_hz=g.uniform(1500, 2500), q=0.7, seed=g)
        m.add(tick * v / force, at=t, gain_db=-12.0)
    # 辐射效率：门板在吻合频率（约 470 Hz）以下向空气辐射很弱，一阶高通近似这一 +6 dB/倍频程的斜率。
    # 没有这一步，输出的是"板的振动"而不是"听到的声音"，会闷成一团低频。
    dry = highpass(m.out()[:, 0], f_rad, order=1)
    dry = highpass(dry, 45.0)
    return reverb(pan(dry, g.uniform(-0.25, 0.25)), room, wet_db=wet_db, seed=g)


@recipe(tags=("撞击", "金属"))
def metal_hit(seed=0, obj="pipe", force=1.0, room="warehouse", wet_db=-13.0):
    """敲击金属：用扳手敲钢管 / 平底锅 / 大铁皮
    分层：主体模态（金属阻尼极小，余音长；简并模态分裂产生拍频闪烁）
          + 撞击瞬间的"铛"（大量杂散高频模态，几十毫秒内消失）+ 硬接触的"叮"。
    obj: pipe 钢管 | pan 平底锅（手柄带来额外阻尼）| sheet 大铁皮（密集模态，雷声般）"""
    g = rng(seed)
    if obj == "pan":
        body = modal.plate(g.uniform(280, 360), "metal", aspect=1.05, n_modes=36, tilt=0.25,
                           eta=0.0006, alpha=3.0, seed=g).split(0.003, g)
        contact, hp = 0.25, 150.0
    elif obj == "sheet":
        body = modal.plate(g.uniform(28, 40), "metal", aspect=1.4, n_modes=120, tilt=0.05,
                           eta=0.0004, alpha=1.2, seed=g)
        contact, hp = 0.6, 30.0
    else:
        body = modal.bar(g.uniform(150, 230), "metal", n_modes=10, tilt=0.05, eta=0.00025, alpha=1.2,
                         pos=0.12, seed=g).split(0.0025, g)
        contact, hp = 0.15, 100.0
    t0 = 0.005
    main = normalize(body.render([modal.Hit(t0, force, contact_ms=contact)]), 0.0)
    clank = modal.random_body(1800, 11000, 24, "metal", tilt=0.1, eta=0.002, alpha=45.0, seed=g)
    clank = normalize(clank.render([modal.Hit(t0, force, contact_ms=0.08)]), 0.0)
    tick = modal.contact_noise(0.25, center_hz=g.uniform(6000, 9000), q=1.2, seed=g)
    m = Mix().add(main).add(clank, gain_db=-9.0).add(tick, at=t0, gain_db=-16.0)
    dry = highpass(m.out()[:, 0], hp)
    return reverb(pan(dry, g.uniform(-0.2, 0.2)), room, wet_db=wet_db, seed=g)


@recipe(tags=("撞击", "玻璃"), baseline="naive_glass")
def glass_clink(seed=0, force=0.5, fill=0.3, room="room", wet_db=-17.0):
    """两只玻璃杯碰杯
    "叮"一声后两只杯子以各自的音高鸣响（环形模态，非整数倍泛音），简并模态的拍频带来微妙闪烁。
    fill：杯中液体比例 0~1（越满音调越低、余音越短）。"""
    g = rng(seed)
    t0 = 0.005
    m = Mix()
    f_a = g.uniform(750, 1050) * (1.0 - 0.3 * fill)
    for i, f0 in enumerate([f_a, f_a * g.uniform(1.12, 1.35)]):
        cup = modal.ring(f0, "glass", n_modes=5, stiffness=0.9, tilt=0.05, eta=0.0006,
                         alpha=1.2 + 5.0 * fill, split=g.uniform(0.0008, 0.002), seed=g)
        ring_sig = normalize(cup.render([modal.Hit(t0, force * g.uniform(0.8, 1.0), contact_ms=0.07)]), 0.0)
        m.add(highpass(ring_sig, 350.0), gain_db=-1.5 * i, pan_pos=(-0.15, 0.15)[i])
    tick = modal.contact_noise(0.2, center_hz=g.uniform(7000, 10000), q=1.5, seed=g)
    m.add(tick, at=t0, gain_db=-14.0)
    return reverb(m.out(), room, wet_db=wet_db, seed=g)


@recipe(tags=("撞击", "石头", "木头", "围棋"))
def go_stone(seed=0, force=0.8, big=False, room="small_room", wet_db=-18.0):
    """围棋落子：石质棋子拍在榧木棋盘上（清脆的"啪"）
    分层：棋子本身的高频模态（小石片，几 kHz，衰减极快）——听感的主体；
          + 棋盘的板模态：厚木块在吻合频率以下辐射效率很低，只保留中高频的"木头味"（一阶高通近似辐射效率）；
          + 石头与木面硬接触的"咔"（接触时间极短）+ 小房间反射。
    big=True：重要的一手，力度更大、棋盘余韵稍长。"""
    g = rng(seed)
    v = force * (1.25 if big else g.uniform(0.85, 1.1))
    stone = modal.random_body(g.uniform(2600, 3200), 12000, 16, "stone", tilt=0.15, seed=g)
    board = modal.plate(g.uniform(650, 760), "wood", aspect=1.05, n_modes=110, tilt=0.1,
                        eta=0.02 if big else 0.026, alpha=14.0, pos=(g.uniform(0.3, 0.7), g.uniform(0.3, 0.7)), seed=g)
    hit_s = [modal.Hit(0.0, v, contact_ms=0.04, hardness=0.85)]
    hit_b = [modal.Hit(0.0, v, contact_ms=0.12, hardness=0.6)]
    m = Mix()
    m.add(normalize(stone.render(hit_s, dur=0.08), 0.0), gain_db=-2.0)
    m.add(normalize(highpass(board.render(hit_b, dur=0.35 if big else 0.22), 900.0, order=1), 0.0), gain_db=-5.0)
    m.add(modal.contact_noise(0.25, center_hz=g.uniform(4500, 5500), q=0.9, seed=g), gain_db=-4.0)
    return reverb(m.out(), room, wet_db=wet_db, seed=g)
