"""界面与机械：HUD 提示音、微动开关、继电器、键盘、数据处理声。
机能风界面的声音要"干净、精确、有物理质感"：短、干、起音利落，带一点真实材质的余振，而不是廉价的方波哔哔声。"""
from __future__ import annotations

import numpy as np

from .. import modal, synth, texture
from ..core import SR, Mix, n_samples, normalize, rng
from ..env import exp_decay
from ..filters import bandpass, highpass, lowpass
from ..space import reverb
from . import recipe


def _tone(f, dur, t60, attack=0.0008, index=0.0, ratio=2.0):
    n = n_samples(dur)
    env = exp_decay(n, t60) * np.minimum(1.0, np.arange(n) / (attack * SR))
    if index > 0:
        return synth.fm(f, ratio, index * exp_decay(n, t60 * 0.4), n) * env
    return synth.sine(f, n) * env


@recipe(tags=("界面", "提示音"))
def ui_blip(seed=0, pitch=2200.0, kind="tick"):
    """界面提示音（HUD 元素出现、数据落定）
    kind: tick 单点 | confirm 上行两音 | select 下行两音 | ping 带 FM 玻璃感的长音 | error 低沉双音
    正弦 + 极短起音 + 指数衰减，外加一点点 FM 泛音让它有"材质"而不是纯电子音。"""
    g = rng(seed)
    m = Mix(0.5)
    if kind == "tick":
        m.add(_tone(pitch, 0.06, 0.035, index=0.6, ratio=3.0))
    elif kind == "confirm":
        m.add(_tone(pitch, 0.08, 0.05, index=0.5), 0.0).add(_tone(pitch * 1.5, 0.12, 0.08, index=0.5), 0.06)
    elif kind == "select":
        m.add(_tone(pitch * 1.25, 0.07, 0.04, index=0.5), 0.0).add(_tone(pitch, 0.1, 0.06, index=0.5), 0.05)
    elif kind == "ping":
        m.add(_tone(pitch, 0.6, 0.45, index=2.2, ratio=3.5))
    elif kind == "error":
        n = n_samples(0.09)
        buzz = lowpass(synth.pulse(pitch / 4, n, 0.3), 2000.0) * exp_decay(n, 0.09)
        m.add(buzz, 0.0).add(buzz, 0.11, -2.0)
    else:
        raise ValueError(kind)
    return reverb(m.out(), "small_room", wet_db=-22.0, seed=g)


@recipe(tags=("界面", "机械"))
def ui_click(seed=0, press=True, release=True):
    """微动开关/按键的"咔哒"：极小的塑料体模态（高频、阻尼极大）+ 接触噪声；按下与弹起两声，弹起更轻更高。"""
    g = rng(seed)
    m = Mix(0.2)
    for i, (on, t0, v) in enumerate(((press, 0.0, 1.0), (release, g.uniform(0.07, 0.12), 0.6))):
        if not on:
            continue
        b = modal.random_body(2500 + 800 * i, 11000, 6, "plastic", eta=0.02, alpha=300.0, seed=g)
        x = normalize(b.render([modal.Hit(0, v, 0.12, hardness=0.4)], dur=0.03), 0) * v
        m.add(x, t0).add(modal.contact_noise(0.3, 6000.0 + 1500 * i, 1.0, g) * v, t0, -8.0)
    return reverb(highpass(m.out(), 400.0), "small_room", wet_db=-26.0, seed=g)


@recipe(tags=("界面", "机械"))
def roulette_tick(seed=0, last=False):
    """转盘 / 抽签的"咔嗒"：一根硬木小舌拨过一颗木钉——先撞上、4–7 ms 后弹开时再轻碰一下（两个接触），极短、干、不带音高感；
    last=True 是停下的那一下：指针落进格子——更低、更实的木盒"咔"，带一点体感（短促的低频）。"""
    g = rng(seed)
    m = Mix(0.4)
    peg = modal.random_body(1400, 6500, 9, "wood", eta=0.025, alpha=260.0, seed=g)
    if not last:
        x = peg.render([modal.Hit(0, 1.0, 0.09, hardness=0.5), modal.Hit(g.uniform(0.004, 0.007), 0.35, 0.08)], dur=0.05)
        m.add(normalize(x, 0), 0.0, 0.0, g.uniform(-0.25, 0.25)).add(modal.contact_noise(0.25, 4500.0, 1.0, g), 0.0, -9.0)
    else:
        box = modal.random_body(380, 2600, 12, "wood", eta=0.02, alpha=70.0, seed=g)
        x = box.render([modal.Hit(0, 1.0, 0.25, hardness=0.35)], dur=0.2)
        y = peg.render([modal.Hit(0, 0.8, 0.09, hardness=0.5)], dur=0.05)
        n = n_samples(0.1)
        thump = synth.sine(95.0 * (1.0 + 0.6 * np.exp(-np.arange(n) / (0.01 * SR))), n) * exp_decay(n, 0.08)
        m.add(normalize(x, 0), 0.0, 0.0).add(normalize(y, 0), 0.0, -5.0).add(normalize(thump, 0), 0.0, -9.0).add(modal.contact_noise(0.4, 3000.0, 0.9, g), 0.0, -8.0)
    return reverb(highpass(m.out(), 120.0), "small_room", wet_db=-20.0, seed=g)


@recipe(tags=("界面", "提示音", "音乐"))
def answer_chime(seed=0, note=1174.66, grace=880.0, grace_lead=0.07):
    """"猜中了"的一声叮：钟琴 / 钢片琴式的调音金属条，毡头槌敲——代替电子味的"嘀—叮"。
    物理拆解：自由梁（泛音 1 : 2.756 : 5.404，上面两个泛音让它亮，但衰减得比基音快）；钢，η≈3e-4，支撑阻尼调大让余音约 2 s；
    槌头接触约 0.45 ms（半正弦频谱的零点落在 2.756 倍泛音附近，所以基音突出、不刺耳）；
    下方的共鸣管只放大基音（钢片琴的木箱）→ 基音上叠一点起音稍慢的正弦，声音更圆；槌头碰上去的那一下极轻的"嗒"。
    先一个轻的倚音（grace，默认 A5 = 主音下方纯四度），grace_lead 秒后主音落下——放提示点时提前 grace_lead，主音正好落在拍点上。
    默认主音 D6：D 小调的主音，在 B♭ 和弦里是三音、在 C 和弦里是九音；大厅混响和配乐在同一个空间里。"""
    g = rng(seed)
    t_main = grace_lead if grace else 0.0
    dur = t_main + 2.4
    m = Mix(dur)

    def strike(f, t, vel, pan, db):
        b = modal.bar(f, "metal", n_modes=4, tilt=0.35, alpha=2.5, detune=0.003, pos=0.22, seed=g)
        x = b.render([modal.Hit(0.0, vel, 0.45, hardness=0.15)], dur=dur - t)
        n = len(x)
        body = synth.sine(f, n) * exp_decay(n, 1.1) * np.minimum(1.0, np.arange(n) / (0.006 * SR))
        m.add(normalize(x, 0), t, db, pan).add(normalize(body, 0), t, db - 8.0, pan)
        m.add(modal.contact_noise(0.3, 5200.0, 1.0, g), t, db - 22.0, pan)

    if grace:
        strike(grace, 0.0, 0.55, -0.2, -9.0)
    strike(note, t_main, 1.0, 0.1, 0.0)
    y = lowpass(highpass(m.out(), 250.0), 9000.0)
    return reverb(y, "hall", wet_db=-15.0, seed=g)


@recipe(tags=("界面", "机械"))
def relay_click(seed=0, count=1, gap=0.18):
    """电磁继电器吸合：衔铁撞击（金属小模态）+ 塑料外壳的闷响 + 触点回弹（4~9 ms 后更轻的第二下）。
    count 次，间隔 gap 秒（带微小抖动）。机能风界面里状态切换、开关闭合的声音。"""
    g = rng(seed)
    m = Mix(count * gap + 0.2)
    for k in range(count):
        t0 = k * gap * g.uniform(0.95, 1.05)
        arm = modal.random_body(1500, 9000, 10, "metal", eta=0.002, alpha=120.0, seed=g)
        case = modal.random_body(300, 2500, 8, "plastic", eta=0.03, alpha=90.0, seed=g)
        bounce = g.uniform(0.004, 0.009)
        a = arm.render([modal.Hit(0, 1.0, 0.08), modal.Hit(bounce, 0.3, 0.08)], dur=0.06)
        c = case.render([modal.Hit(0, 1.0, 0.6, hardness=0.3)], dur=0.06)
        m.add(normalize(a, 0), t0, -2.0).add(normalize(c, 0), t0, -6.0)
    return reverb(highpass(m.out(), 150.0), "small_room", wet_db=-24.0, seed=g)


def _keystroke(g, space=None, v=None):
    """一次按键：键帽塑料模态 + 触底"咚" + 弹簧细微金属余振（space 为空格键：更低更长）。返回 (声音, 声像)。"""
    space = g.random() < 0.12 if space is None else space
    v = g.uniform(0.7, 1.0) if v is None else v
    cap = modal.random_body(900 if space else 1400, 5000, 7, "plastic", eta=0.03, alpha=160.0, seed=g)
    x = normalize(cap.render([modal.Hit(0, v, 0.35, hardness=0.3)], dur=0.05), 0)
    thock = lowpass(normalize(modal.random_body(180, 700, 6, "plastic", eta=0.05, alpha=60.0, seed=g)
                              .render([modal.Hit(0, 1, 1.5)], dur=0.06), 0), 1200.0)
    spring = normalize(modal.random_body(3500, 7000, 3, "metal", eta=0.001, alpha=40.0, seed=g)
                       .render([modal.Hit(0, 1, 0.1)], dur=0.12), 0)
    m = Mix(0.14)
    m.add(x * v, 0.0, -1.0 if not space else -4.0).add(thock * v, 0.004, -7.0 + (3 if space else 0)).add(spring * v, 0.0, -30.0)
    return m.out(), g.uniform(-0.25, 0.25)


@recipe(tags=("界面", "机械"))
def typing(seed=0, keys=12, speed=1.0):
    """机械键盘打字：人的节奏（快慢不均、偶尔停顿）+ 键帽塑料模态 + 触底"咚" + 弹簧细微金属余振；偶尔是更低更长的空格键。"""
    g = rng(seed)
    gaps = g.lognormal(np.log(0.095 / speed), 0.35, keys)
    gaps[g.random(keys) < 0.08] *= 3.0                       # 偶尔停顿
    times = np.concatenate([[0.0], np.cumsum(gaps[:-1])])
    m = Mix(times[-1] + 0.3)
    for t0 in times:
        x, p = _keystroke(g)
        m.add(x, t0, 0.0, p)
    return reverb(m.out(), "small_room", wet_db=-22.0, seed=g)


@recipe(tags=("界面", "机械"))
def typing_at(seed=0, times=(0.0, 0.12, 0.25, 0.4), spaces=()):
    """机械键盘：在给定时刻逐键敲击——画面上每出现一个字就响一下，严格对齐（times 为相对秒数；spaces 为空格键的序号）。"""
    g = rng(seed)
    times = np.asarray(times, float)
    m = Mix(float(times.max()) + 0.3)
    sp = set(int(k) for k in spaces)
    for k, t0 in enumerate(times):
        x, p = _keystroke(g, space=k in sp)
        m.add(x, float(t0), 0.0, p)
    return reverb(m.out(), "small_room", wet_db=-22.0, seed=g)


@recipe(tags=("界面", "数据"))
def text_stream(seed=0, times=(0.0, 0.04, 0.08, 0.12), base=1174.7, voice="tone"):
    """AI 逐字输出：每个字一颗极短的声音，严格落在给定时刻（与画面上出字的时刻逐一对齐）。
    voice="tone"（默认）：FM 微音，音高在 D 小调五声音阶上缓慢游走（有序，而不是乱码），比键盘声轻、干净——它不是"敲"出来的，是"流"出来的；
    voice="soft"：不带音高的极轻"沙沙"颗粒（2.5–5 kHz 的带通噪声，几毫秒就衰减完）——字多的时候不会变成一串叮叮当当。"""
    g = rng(seed)
    times = np.asarray(times, float)
    if voice == "soft":
        m = Mix(float(times.max()) + 0.1)
        for t0 in times:
            n = n_samples(0.014)
            grain = lowpass(bandpass(g.standard_normal(n), g.uniform(2500.0, 5000.0), 1.1), 7000.0) * exp_decay(n, g.uniform(0.004, 0.009))   # 7 kHz 低通：不发嘶
            m.add(normalize(grain, 0) * g.uniform(0.3, 0.6), float(t0), 0.0, g.uniform(-0.4, 0.4))
        return reverb(m.out(), "small_room", wet_db=-26.0, seed=g)
    scale = np.array([0, 3, 5, 7, 10, 12])
    m = Mix(float(times.max()) + 0.2)
    step = 2
    for t0 in times:
        step = int(np.clip(step + g.integers(-1, 2), 0, len(scale) - 1))
        f = base * 2 ** (scale[step] / 12)
        x = _tone(f, 0.03, g.uniform(0.008, 0.015), index=g.uniform(0.2, 0.6), ratio=float(g.choice([2.0, 3.0])))
        m.add(x * g.uniform(0.55, 1.0), float(t0), 0.0, g.uniform(-0.35, 0.35))
    return reverb(m.out(), "small_room", wet_db=-24.0, seed=g)


@recipe(tags=("界面", "数据"))
def data_chirp(seed=0, dur=0.8, rate=28.0, base=1800.0):
    """数据处理/计算中：一串极短的 FM 微音，音高取自五声音阶（听起来"有序"而不是乱码），随机散布在声场里。"""
    g = rng(seed)
    scale = np.array([0, 2, 4, 7, 9, 12, 14, 16])
    m = Mix(dur + 0.2)
    for t0 in texture.poisson_times(dur, rate, g):
        f = base * 2 ** (g.choice(scale) / 12)
        x = _tone(f, 0.03, g.uniform(0.012, 0.025), index=g.uniform(0.3, 1.2), ratio=g.choice([2.0, 3.0, 3.5]))
        m.add(x * g.uniform(0.4, 1.0), t0, 0.0, g.uniform(-0.7, 0.7))
    return reverb(m.out(), "small_room", wet_db=-20.0, seed=g)
