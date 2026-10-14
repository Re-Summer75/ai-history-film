"""转场与剪辑音效：嗖（掠过）、上升、重击、次低频下坠、反向吸气、数字故障、磁带倒带。
用于视频、动效、游戏过场。都尽量从物理过程出发：掠过 = 多普勒 + 1/r 距离衰减；重击 = 冲击波 + 空间。"""
from __future__ import annotations

import numpy as np

from .. import modal, synth, texture
from ..core import SR, Mix, n_samples, normalize, pad_to, pan_dynamic, rng, smooth_random
from ..dynamics import compress, saturate
from ..env import exp_decay
from ..filters import bandpass, highpass, lowpass, tv_filter
from ..noise import brown, burst, pink, white
from ..space import reverb
from . import recipe


@recipe(tags=("转场", "空气"))
def whoosh(seed=0, dur=0.9, brightness=0.6, size=0.6, direction="lr"):
    """掠过的"嗖"：一个物体从身边飞过——物理飞过模型，而不是滤波器扫频。
    声源：物体搅动空气的湍流噪声（粉噪 + 不规则的强弱起伏；越大越低沉，大物体再加一层低沉的气流）。
    传播：按真实的传播延迟 r(t)/c 读取声源，多普勒频移自然出现（旧版把多普勒放大到 6 次方，成了合成器式的"呜——"扫频）；
    音量 ∝ 1/r，飞过的"钟形"（半高全宽）约占整段的 1/5：从远处约 -20 dB 一路逼近、擦身而过、较快地远去
    （旧版速度太快，能量挤在最近点 50 ms 里，像一声电子"咻"）；越远越闷（适度夸张的空气吸收）；
    离得最近的那一下多一层 6–9 kHz 的"丝——"（近距离划开空气，强度 ∝ 1/r²）。
    地面反射：再叠一条经地面反射的路径，两条路径的程差随位置变化 → 真实车辆、飞机路过时那种缓缓移动的梳状相位。
    声像：随方位角从一侧移到另一侧。
    size：越大越低沉、越慢、越"重"；direction: lr 左→右 | rl 右→左 | center 从正面 / 头顶穿过"""
    g = rng(seed)
    n = n_samples(dur)
    t = np.arange(n) / SR
    c = 343.0
    tc = dur * g.uniform(0.58, 0.64)                       # 最近点的时刻（偏后：逼近得久、远去得快）
    d0 = 2.0 + 3.0 * size                                   # 最近距离（米）
    v = min(120.0, 2.0 * np.sqrt(3.0) * d0 / (0.2 * dur))   # 1/r 的半高全宽 = 2√3·d0/v ≈ 整段的 1/5
    x = v * (t - tc)                                        # 沿飞行方向的位置
    hs, hl = 1.2 + 1.5 * size, 1.6                          # 声源高度 / 听者耳高
    rd = np.sqrt(x ** 2 + d0 ** 2 + (hs - hl) ** 2)         # 直达路径
    rr = np.sqrt(x ** 2 + d0 ** 2 + (hs + hl) ** 2)         # 地面反射路径
    pad = int((rr.max() / c + 0.05) * SR)                   # 声源时间轴要往前多留出最长的传播延迟
    ns = n + pad
    src = pink(ns, g)
    src = highpass(src, 70.0 + 60.0 * (1.0 - size))
    src = lowpass(src, (3200.0 + 6000.0 * brightness) * (1.25 - 0.5 * size))
    src = src * np.clip(1.0 + 0.35 * smooth_random(ns / SR, 18.0, g, octaves=2), 0.2, None)   # 湍流：不规则的强弱起伏
    body = lowpass(brown(ns, g), 180.0 + 120.0 * (1.0 - size))                                # 大物体：低沉的气流
    src = normalize(src, 0) + 0.5 * size * normalize(body, 0)
    ts = np.arange(ns) / SR - pad / SR
    y = np.interp(t - rd / c, ts, src) / rd + 0.45 * np.interp(t - rr / c, ts, src) / rr   # 真多普勒 + 地面反射
    fc = (1800.0 + 9000.0 * brightness) * (d0 / rd) ** 0.8 + 500.0                          # 越远越闷
    y = tv_filter(y, "lowpass", fc, 0.7071, block=32)
    hiss = bandpass(white(n, g), 6500.0 + 2000.0 * brightness, 0.9) * (d0 / rd) ** 2   # 近距离划开空气的"丝——"
    y = y / (np.abs(y).max() + 1e-12) + 0.22 * brightness * (1.0 - 0.5 * size) * hiss / (np.abs(hiss).max() + 1e-12)
    y *= np.minimum(1.0, t / (0.1 * dur)) ** 1.5 * np.minimum(1.0, (dur - t) / (0.12 * dur))   # 从远处来、往远处去
    y = normalize(y, -5.4 - 1.2 * np.log2(max(dur, 0.35) / 0.35))   # 钟形比旧版宽、越长能量越多：峰值相应放低，和旧版最响 0.4 s 的响度对齐
    pos = 0.9 * np.arctan2(x, d0) / (np.pi / 2.0)           # 方位角 → 声像
    if direction == "rl":
        pos = -pos
    elif direction == "center":
        pos = 0.25 * pos
    return reverb(pan_dynamic(y, pos), "room", wet_db=-20.0, seed=g)


@recipe(tags=("转场", "张力"))
def riser(seed=0, dur=4.0, tone=True, end="cut"):
    """上升（推向高潮前的张力）
    噪声的带通中心指数上升 + 三个声部的超级锯齿同时上滑（音程固定、整体变亮）+ 越来越快的颤音。
    end: cut 在最高点戛然而止（接重击/落点）| fade 逐渐消失"""
    g = rng(seed)
    n = n_samples(dur)
    t = np.arange(n) / SR
    p = t / dur
    noise = tv_filter(pink(n, g), "bandpass", 250.0 * (32.0 ** p), 0.9 + 0.8 * p, block=64)
    y = normalize(noise, 0) * p ** 2.2
    if tone:
        glide = 2.0 ** (1.6 * p ** 1.5)
        chord = sum(synth.supersaw(synth.hz(nt) * glide, n, voices=5, detune=0.18, seed=g) for nt in ("A2", "E3", "A3"))
        chord = tv_filter(chord, "lowpass", 300.0 * (25.0 ** p), 0.9, block=64)
        y += 0.8 * normalize(chord, 0) * p ** 1.8
    trem_rate = 4.0 + 20.0 * p ** 2
    y *= 1.0 - (0.15 + 0.45 * p) * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(trem_rate) / SR))
    y *= np.minimum(1.0, t / 0.2)
    if end == "cut":
        y *= np.minimum(1.0, (dur - t) / 0.006)
    else:
        y *= np.minimum(1.0, (dur - t) / (0.25 * dur))
    st = np.stack([y, np.roll(y, 37)], axis=1)          # 轻微去相关 → 宽度
    return reverb(st, "hall", wet_db=-14.0, seed=g)[:n + n_samples(0.4)]


@recipe(tags=("转场", "撞击"))
def impact(seed=0, size=1.0, brightness=0.5, metal=0.3, tail=1.0):
    """电影感重击（落点、标题砸下）
    ① 次低频：音高快速下坠的正弦（冲击波的"咚"）② 中频冲击：短促的压缩噪声块 + 低频物体模态
    ③ 瞬态"啪" ④ 可选金属余振（大钢板）⑤ 大厅尾音
    metal: 0~1 金属感；tail: 尾音长短倍率"""
    g = rng(seed)
    dur = 2.5 * size + 1.0
    n = n_samples(dur)
    t = np.arange(n) / SR
    m = Mix(dur)
    f = 30.0 + 60.0 * np.exp(-t / 0.08)
    sub = synth.sine(f, n) * exp_decay(n, 0.7 * size) * np.minimum(1.0, t / 0.002)
    # 次低频负责"体感"，但能量极大；中频冲击和瞬态才是小音箱上听到的那一下，要给足
    m.add(saturate(sub, 6.0), gain_db=-14.0)
    body = modal.random_body(90, 900, 16, "stone", eta=0.02, alpha=25.0, seed=g).render([modal.Hit(0, 1, 1.2, hardness=0.3)], dur=0.6)
    punch = pad_to(lowpass(burst(0.08, g, t60=0.08), 1200.0 + 1800.0 * brightness), len(body))
    m.add(compress(highpass(normalize(punch, 0) + 0.8 * normalize(body, 0), 90.0), -12, 4, 1, 60), gain_db=0.0)
    m.add(modal.contact_noise(3.0, 2500.0 + 4000.0 * brightness, 0.6, g), gain_db=-6.0 + 4.0 * brightness)
    if metal > 0:
        plate = modal.plate(g.uniform(70, 110), "metal", aspect=1.3, n_modes=80, tilt=0.1, eta=0.0012, alpha=2.5, seed=g)
        ring = highpass(plate.render([modal.Hit(0.0, 1.0, 0.4)], dur=dur), 150.0)
        m.add(normalize(ring, 0), gain_db=-10.0 + 10.0 * (metal - 0.3))
    y = saturate(m.out()[:n], 3.0, mix=0.5)
    return reverb(y, "hall", wet_db=-10.0 + 3.0 * (tail - 1.0), predelay=0.012, seed=g)


@recipe(tags=("转场", "低频"))
def sub_drop(seed=0, dur=1.8, start_hz=80.0, end_hz=24.0):
    """次低频下坠：正弦从 start_hz 指数滑到 end_hz，轻度饱和补出谐波（小音箱上也能"感觉到"）。"""
    n = n_samples(dur)
    t = np.arange(n) / SR
    f = end_hz + (start_hz - end_hz) * np.exp(-t / (0.28 * dur))
    y = synth.sine(f, n) * exp_decay(n, dur) * np.minimum(1.0, t / 0.004)
    return saturate(y, 9.0)


@recipe(tags=("转场", "张力"))
def reverse_swell(seed=0, dur=1.6, size=1.0):
    """反向吸气：把一次重击的混响尾巴倒放，形成"吸进去"的膨胀感，正好在结尾处接上画面落点。"""
    x = impact(seed=seed, size=size, brightness=0.7, metal=0.4, tail=1.4)
    n = n_samples(dur)
    y = x[::-1][-n:] if len(x) >= n else x[::-1]
    y = y * np.minimum(1.0, np.arange(len(y))[:, None] / (0.3 * len(y)))
    return y * np.minimum(1.0, (len(y) - np.arange(len(y)))[:, None] / 48.0)


@recipe(tags=("转场", "时空"))
def worldline_shift(seed=0, dur=1.6, shift=0.42, depth=1.0):
    """世界线变动（时空被"扭"了一下，像科幻作品里的世界线跳转）：在 shift 秒处发生。
    ① 吸入：一记金属撞击的混响尾巴倒放，在变动前 shift 秒里被"吸"进去；
    ② 扭曲的和弦：D 小调和弦（D3 A3 D4 F4，锯齿波、每个音两层轻微失谐）像磁带被拖慢——音高 0.2 s 内掉到 60%、
       再用 0.55 s 慢慢回到原位，滤波跟着变暗再变亮；外加一层缓慢扫动的镶边（梳状相位），像空间在弯曲；
    ③ 落地的一下低沉"咚"（音高下坠的正弦）；④ 现实"跳帧"：扭曲和弦开头 50 ms 的片段紧跟着重复三次、越来越弱；
    ⑤ 一道从高往低扫的气流。depth：扭曲的深度（0.5 轻、1 标准）。"""
    g = rng(seed)
    n = n_samples(dur)
    t = np.arange(n) / SR
    tau = t - shift
    m = Mix(dur)
    # ① 吸入
    hit = impact(seed=int(g.integers(1 << 30)), size=0.45, brightness=0.75, metal=0.55, tail=1.2)
    k = n_samples(shift)
    suck = hit[::-1][-k:] if len(hit) >= k else hit[::-1]
    suck = suck * (np.linspace(0.0, 1.0, len(suck)) ** 2.2)[:, None]
    m.add(normalize(suck, 0), 0.0, -4.0)
    # ② 扭曲的和弦：音高曲线 r(τ)
    dn = np.clip(tau / 0.2, 0.0, 1.0)
    up = np.clip((tau - 0.2) / 0.55, 0.0, 1.0)
    sm = lambda u: u * u * (3.0 - 2.0 * u)
    r = np.where(tau < 0.2, 1.0 - 0.4 * depth * sm(dn), 1.0 - 0.4 * depth + 0.4 * depth * sm(up))
    after = tau >= 0
    env = np.where(after, np.minimum(1.0, np.maximum(tau, 0) / 0.006) * np.exp(-6.91 * np.maximum(tau, 0) / 1.15), 0.0)
    chord = np.zeros(n)
    for f0, a in ((146.83, 0.7), (220.0, 0.8), (293.66, 0.8), (349.23, 0.65), (440.0, 0.45), (587.33, 0.25)):
        for cents in (-7.0, 7.0):
            f = f0 * 2 ** (cents / 1200.0) * r
            chord += a * synth.saw(f, n, phase0=g.uniform(0, 1))
    chord = tv_filter(chord, "lowpass", 900.0 + 4200.0 * r ** 3, 0.9, block=32) * env
    # 镶边：0.8–5 ms 的调制延迟与原声相加（慢速扫动的梳状相位）
    dly = (0.8 + 4.2 * (0.5 - 0.5 * np.cos(2 * np.pi * np.maximum(tau, 0) / 0.9))) * 1e-3 * SR
    flange = np.interp(np.arange(n) - dly, np.arange(n), chord, left=0.0)
    warp = chord + 0.7 * flange
    wl = np.interp(np.arange(n) - 0.0007 * SR, np.arange(n), warp, left=0.0)            # 左右差 0.7 ms：更宽
    m.add(np.stack([wl, warp], axis=1) / (np.abs(warp).max() + 1e-12), 0.0, 0.0)
    # ③ 低沉的"咚"
    ft = 42.0 + 48.0 * np.exp(-np.maximum(tau, 0) / 0.06)
    thump = synth.sine(ft, n) * np.where(after, np.minimum(1.0, np.maximum(tau, 0) / 0.002) * np.exp(-6.91 * np.maximum(tau, 0) / 0.3), 0.0)
    m.add(saturate(normalize(thump, 0), 4.0), 0.0, -13.0)   # 只要一点体感：能量压在 60 Hz 以下会发闷、小音箱上听不见
    # ④ 跳帧：开头 50 ms 的片段重复三次
    s0, L = n_samples(shift), n_samples(0.05)
    grain = warp[s0:s0 + L] * np.hanning(L)
    for j, (dt, a) in enumerate(((0.07, 0.55), (0.13, 0.38), (0.19, 0.22))):
        m.add(np.stack([grain, grain], axis=1) / (np.abs(warp).max() + 1e-12) * a, shift + dt, -3.0, 0.4 * (-1) ** j)
    # ⑤ 从高往低扫的气流
    air = tv_filter(pink(n, g), "bandpass", 1000.0 + 5000.0 * np.exp(-np.maximum(tau, 0) / 0.25), 1.4, block=32)
    air *= np.where(after, np.exp(-6.91 * np.maximum(tau, 0) / 0.7), (np.clip(t / shift, 0, 1) ** 3) * 0.6)
    m.add(normalize(air, 0), 0.0, -11.0)
    return reverb(highpass(m.out()[:n], 38.0), "hall", wet_db=-12.0, predelay=0.01, seed=g)


@recipe(tags=("转场", "数字"))
def glitch(seed=0, dur=0.6, density=0.6):
    """数字故障：把一段源信号切成 8~60 ms 的碎片，随机做 结巴重复 / 比特压缩 / 降采样 / 倒放 / 静音。"""
    g = rng(seed)
    n = n_samples(dur)
    src = np.zeros(n)
    for t0 in texture.poisson_times(dur, 25.0, g):
        k = n_samples(g.uniform(0.01, 0.05))
        s = int(t0 * SR)
        e = min(n, s + k)
        f = g.choice([220, 440, 880, 1320, 1760, 2640]) * g.uniform(0.98, 1.02)
        seg = synth.pulse(f, e - s, g.uniform(0.2, 0.5)) * 0.5 + bandpass(white(e - s, g), g.uniform(800, 6000), 1.2)
        src[s:e] += seg
    out = np.zeros((n, 2))
    pos = 0
    while pos < n:
        L = n_samples(g.uniform(0.008, 0.06))
        seg = src[pos:pos + L].copy()
        op = g.choice(["stutter", "crush", "decimate", "reverse", "mute", "plain"],
                      p=[0.25, 0.2, 0.2, 0.1, 0.25 * (1 - density), 0.0 + 0.25 * density])
        if op == "stutter" and len(seg) > 8:
            piece = seg[: max(8, len(seg) // g.integers(2, 6))]
            seg = np.resize(piece, len(seg))
        elif op == "crush":
            q = 2 ** int(g.integers(2, 5))
            seg = np.round(seg * q) / q
        elif op == "decimate":
            h = int(g.integers(4, 24))
            seg = np.repeat(seg[::h], h)[: len(seg)]
        elif op == "reverse":
            seg = seg[::-1]
        elif op == "mute":
            seg = seg * 0.0
        th = (g.uniform(-0.8, 0.8) + 1) * np.pi / 4
        out[pos:pos + len(seg)] += seg[:, None] * np.array([np.cos(th), np.sin(th)])
        pos += L
    return highpass(out, 120.0)


@recipe(tags=("转场", "机械"))
def tape_rewind(seed=0, dur=2.6, accel=True, stop=True):
    """磁带倒带：高速倒放的"叽叽喳喳"（大量短促、快速变调的共振峰啁啾，越倒越快）
    + 电机上升的嗡鸣 + 磁带嘶声；结尾一声机械"咔嗒"停住。"""
    g = rng(seed)
    n = n_samples(dur)
    t = np.arange(n) / SR
    p = t / dur
    rate = (14.0 + 50.0 * p ** 1.5) if accel else np.full(n, 30.0)
    chirps = np.zeros(n)
    for t0 in texture.modulated_times(rate, g):
        L = n_samples(g.uniform(0.015, 0.06))
        s = int(t0 * SR)
        e = min(n, s + L)
        if e - s < 8:
            continue
        f1, f2 = np.exp(g.uniform(np.log(300), np.log(2800), 2))
        f = np.geomspace(f1, f2, e - s) * (1.0 + 0.8 * p[s])
        seg = synth.saw(f, e - s) * np.hanning(e - s)
        chirps[s:e] += g.uniform(0.3, 1.0) * bandpass(seg, float(np.sqrt(f1 * f2)) * 1.3, 2.0)
    motor = lowpass(synth.saw(60.0 + 140.0 * p ** 1.2 + 3.0 * smooth_random(dur, 8.0, g), n), 700.0) * (0.3 + 0.7 * p)
    hiss = highpass(white(n, g), 4000.0) * (0.3 + 0.7 * p)
    y = normalize(chirps, 0) + 0.35 * normalize(motor, 0) + 0.12 * normalize(hiss, 0)
    y = bandpass(y, 1500.0, 0.35) + 0.3 * y                # 小喇叭回放的频带
    y *= np.minimum(1.0, t / 0.08) * np.minimum(1.0, (dur - t) / 0.004)   # 停止时戛然而止
    m = Mix(dur + 0.4).add(np.stack([y, np.roll(y, 23)], axis=1))
    if stop:
        clunk = modal.random_body(150, 2500, 12, "plastic", eta=0.03, alpha=40.0, seed=g).render([modal.Hit(0, 1, 1.2, hardness=0.3)], dur=0.3)
        latch = modal.random_body(2000, 8000, 8, "metal", eta=0.002, alpha=90.0, seed=g).render([modal.Hit(0, 1, 0.1)], dur=0.1)
        m.add(normalize(clunk, 0), dur - 0.01, -2.0).add(normalize(latch, 0), dur, -9.0)
    return reverb(m.out(), "small_room", wet_db=-18.0, seed=g)
