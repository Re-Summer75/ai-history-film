"""爆炸：多层 + 距离的范例。"""
from __future__ import annotations

import numpy as np

from .. import modal, texture
from ..core import SR, Mix, n_samples, normalize, rng, smooth_random
from ..dynamics import saturate
from ..env import exp_decay
from ..filters import lowpass, tv_filter
from ..noise import pink, white
from ..space import outdoor
from . import recipe


@recipe(tags=("爆炸", "分层"), baseline="naive_explosion")
def explosion(seed=0, size=1.0, distance=40.0, debris=True):
    """爆炸
    ① 冲击波"N 波"：极短的正压→负压脉冲（近处是鞭子般的"啪"，越远越钝）
    ② 轰鸣：宽带噪声，低通截止频率由高到低下扫（由亮变暗）+ 缓慢游移的带通（"滚滚"感）
    ③ 次低频：音高下滑的正弦（身体感受到的"咚"），轻度饱和补出谐波让小音箱也听得到
    ④ 碎片散落：随机时间、幂律大小的石头/木头/金属小物体撞击，密度随时间衰减
    ⑤ 距离：空气吸收（越远越闷）+ 地面反射 + 远处地形的离散回声
    size: 规模 0.3~2；distance: 米"""
    g = rng(seed)
    dur = 3.5 + 2.0 * size
    n = n_samples(dur)
    t = np.arange(n) / SR
    t0 = 0.01
    m = Mix(dur)

    T = 0.0025 * size ** (1 / 3) * (1 + distance / 300.0)      # N 波随规模和传播距离变长
    k = n_samples(T)
    nw = np.zeros(k + n_samples(0.01))
    nw[:k] = np.linspace(1.0, -1.0, k)
    m.add(lowpass(nw, 12000.0), t0, 0.0)

    # 轰鸣是主体：快衰减（冲击）+ 慢衰减（翻滚的余波）；低通由 9 kHz 慢慢降到 250 Hz
    fast, slow = exp_decay(n, 1.0 * size), exp_decay(n, 3.5 * size)
    env = (0.6 * fast + 0.4 * slow) * np.minimum(1.0, t / 0.004)
    fc = 9000.0 * (250.0 / 9000.0) ** np.minimum(t / (2.0 * size), 1.0)
    swirl_fc = 300.0 + 900.0 * (0.5 + 0.5 * smooth_random(dur, 0.8, g, octaves=2))
    roar = np.zeros((n, 2))
    for ch in (0, 1):
        src = 0.5 * white(n, g) + 0.9 * pink(n, g)
        a = tv_filter(src, "lowpass", fc, 0.9, block=128)
        b = tv_filter(pink(n, g), "bandpass", swirl_fc, 1.2, block=128)
        roar[:, ch] = (normalize(a, 0) + 0.5 * normalize(b, 0)) * env
    m.add(normalize(roar, 0), t0, 0.0)

    # 火球的噼啪：前一秒左右密集的颗粒爆裂，给中高频"质感"（纯低频的爆炸在小音箱上只剩一声闷响）
    fb_rate = 300.0 * size * np.exp(-t / 0.35)
    ft = texture.modulated_times(fb_rate, g)
    kern = [lowpass(white(n_samples(g.uniform(0.3, 3.0) / 1000), g), g.uniform(1500, 7000)) for _ in range(12)]
    fire = np.stack([texture.scatter(ft[i::2], texture.power_law(len(ft[i::2]), 2.0, 0.05, 1.0, g), kern, n, g)
                     for i in (0, 1)], axis=1)
    m.add(normalize(fire, 0), t0, -9.0)

    f = 28.0 + 34.0 * np.exp(-t / 0.25)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_decay(n, 0.8 * size) * np.minimum(1.0, t / 0.005)
    m.add(saturate(sub, 8.0), t0, -15.0)

    if debris:
        rate = np.where(t > 0.3, 40.0 * size * np.exp(-(t - 0.3) / 1.0), 0.0)
        dt = texture.modulated_times(rate, g)
        amps = texture.power_law(len(dt), 2.0, 0.05, 1.0, g)
        deb = Mix(dur)
        for tt, a in zip(dt, amps):
            r = g.random()
            if r < 0.6:
                b = modal.random_body(800, 7000, 6, "stone", eta=0.008, alpha=120.0, seed=g)
            elif r < 0.85:
                b = modal.random_body(300, 3000, 8, "wood", eta=0.03, alpha=40.0, seed=g)
            else:
                b = modal.random_body(900, 8000, 8, "metal", eta=0.001, alpha=12.0, seed=g)
            x = b.render([modal.Hit(0.0, 1.0, g.uniform(0.2, 1.5))], dur=0.3)
            deb.add(a * x / (np.max(np.abs(x)) + 1e-12), tt, 0.0, g.uniform(-0.9, 0.9))
        m.add(normalize(deb.out(), 0), 0.0, -16.0)

    y = saturate(m.out()[:n], 3.0, mix=0.4)
    return outdoor(y, distance=distance, echoes=4, wet_db=-14.0, seed=g)
