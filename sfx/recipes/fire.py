"""火：篝火。Cox 过程（成簇的随机事件）+ 幂律大小的范例。"""
from __future__ import annotations

import numpy as np

from .. import modal, texture
from ..core import SR, Mix, db_to_amp, n_samples, rms, rng, smooth_random
from ..filters import bandpass, highpass, lowpass, peak_eq, tv_filter
from ..noise import burst, pink, white
from . import recipe


def _stereo(fn, n):
    return np.stack([fn(), fn()], axis=1)


@recipe(tags=("环境", "火", "纹理"), master={"lufs": -22.0}, baseline="naive_fire")
def campfire(seed=0, dur=12.0, size=0.6, crackle=0.6):
    """篝火
    ① 火焰翻滚的低频"呼呼"（布朗噪声，随机起伏）② 燃烧气流的高频嘶嘶
    ③ 噼啪爆裂：成簇出现（Cox 过程）、大小服从幂律；每次爆裂由 1~4 个极短的碎裂脉冲组成，偶尔是低一些的"啵"
    ④ 偶尔木柴塌落的闷响和炭块的沙沙声
    size: 火的大小 0~1；crackle: 噼啪多少 0~1"""
    g = rng(seed)
    n = n_samples(dur)
    t = np.arange(n) / SR
    m = Mix(dur)

    bed_db = -26.0 + 6.0 * size
    flick = smooth_random(dur, 0.8, g, octaves=3)
    roar = _stereo(lambda: tv_filter(pink(n, g), "lowpass", 180.0 + 250.0 * size * (1 + 0.3 * flick), 0.8, block=128)
                   * np.clip(1 + 0.5 * smooth_random(dur, 1.5, g, octaves=2), 0.1, None), n)
    roar = highpass(roar, 70.0)                       # 篝火不是低音炮：只留一点温暖的"呼呼"
    m.add(roar * (db_to_amp(bed_db - 8.0 + 6.0 * size) / rms(roar)))

    # 火焰"舔舐"：中频噪声被快速随机调幅（8~15 Hz 的颤动），填补 500 Hz~2 kHz
    lap = _stereo(lambda: bandpass(pink(n, g), g.uniform(600, 1100), 0.6)
                  * np.clip(1 + 0.9 * smooth_random(dur, 11.0, g, octaves=2), 0.0, None) ** 2, n)
    m.add(lap * (db_to_amp(bed_db - 7.0) / rms(lap)))

    hiss = _stereo(lambda: peak_eq(highpass(white(n, g), 2500.0), 5500.0, 3.0, 0.8)
                   * np.clip(1 + 0.6 * smooth_random(dur, 4.0, g, octaves=2), 0.0, None), n)
    m.add(hiss * (db_to_amp(bed_db - 13.0 + 4.0 * size) / rms(hiss)))

    # 噼啪：速率被慢变随机信号的指数调制 → 时而安静、时而连续爆裂
    rate = crackle * (3.0 + 20.0 * size) * np.exp(1.1 * smooth_random(dur, 0.35, g, octaves=2))
    times = texture.modulated_times(rate, g)
    amps = texture.power_law(len(times), 1.5, 0.12, 1.0, g)   # 中等大小的噼啪要多，否则全被底噪盖住
    cr = np.zeros((n, 2))
    for t0, a in zip(times, amps):
        th = (g.uniform(-0.45, 0.45) + 1) * np.pi / 4
        pan_g = np.array([np.cos(th), np.sin(th)])
        pop = g.random() < 0.12
        tj = t0
        for j in range(int(g.integers(1, 5))):
            if pop:
                x = bandpass(burst(g.uniform(1.5, 4.0) / 1000, g), g.uniform(400, 1400), g.uniform(0.7, 1.5))
                x = np.concatenate([x, np.zeros(n_samples(0.01))])
                amp = 1.4 * a
            else:
                x = bandpass(burst(g.uniform(0.08, 0.7) / 1000, g), np.exp(g.uniform(np.log(1500), np.log(8000))),
                             g.uniform(0.6, 2.2))
                x = np.concatenate([x, np.zeros(n_samples(0.004))])
                amp = a * (1.0 if j == 0 else g.uniform(0.3, 0.9))
            s = int(tj * SR)
            if s < n:
                e = min(n, s + len(x))
                cr[s:e] += (amp * x[: e - s] / (np.max(np.abs(x)) + 1e-12))[:, None] * pan_g
            tj += g.uniform(0.0005, 0.006)
    m.add(cr * db_to_amp(bed_db + 19.0 + 3.0 * crackle))

    for t0 in texture.poisson_times(dur - 1.0, 0.07, g, start=0.3):   # 木柴塌落
        wood = modal.random_body(120, 1500, 14, "wood", eta=0.05, alpha=30.0, seed=g)
        thud = lowpass(wood.render([modal.Hit(0.0, 1.0, 4.0)], dur=0.4), 2500.0)
        k = int(g.integers(20, 50))
        crunch_t = g.gamma(1.5, 0.05, k)
        kern = [bandpass(burst(g.uniform(0.2, 1.0) / 1000, g), g.uniform(1500, 6000), 1.0) for _ in range(6)]
        crunch = texture.scatter(crunch_t, texture.power_law(k, 2.0, 0.1, 1.0, g), kern, n_samples(0.6), g)
        layer = np.zeros(n_samples(0.6))
        layer[: len(thud)] += thud / (np.max(np.abs(thud)) + 1e-12)
        layer += 0.35 * crunch / (np.max(np.abs(crunch)) + 1e-12)
        m.add(layer * db_to_amp(bed_db + 12.0), at=t0, pan_pos=g.uniform(-0.3, 0.3))
    return m.out()[:n]
