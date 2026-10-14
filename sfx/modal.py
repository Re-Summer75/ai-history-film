"""模态合成（modal synthesis）：撞击、敲击、碰撞类声音的物理模型。

一个被敲击的物体 = 一组"模态"（固有振动），每个模态是一个指数衰减的正弦：
- 频率比由【形状】决定：棒、板、膜、环（玻璃杯）、钟……都是非整数倍（非谐波）关系，
  这正是"真实物体"和"合成器音色"听感差异的主要来源之一。
- 衰减由【材质】决定：衰减率 d = alpha + π·f·η（η 为损耗因子），高频衰减更快。
  人耳判断"这是木头还是金属"主要靠衰减快慢，而不是音高。
- 幅度由【敲击位置】决定（模态振型），每次敲击位置略有不同 → 音色自然变化，不会像复制粘贴。
- 亮度由【接触时间】决定：硬物短接触（金属锤 ~0.1 ms）激发大量高频；软物长接触（指节 ~2 ms）发闷。
  力度越大接触越短（Hertz 接触，Tc ∝ v^-0.2），所以重击天然更亮 —— 不需要额外调 EQ。
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .core import LN1000, SR, n_samples, peak, rng
from .filters import bandpass, resonator
from .noise import burst

# 损耗因子 η 与支撑/辐射阻尼 alpha(1/s)。数值取自材料内耗的典型量级，并按听感校准。
MATERIALS = {
    "metal":     dict(eta=0.0003, alpha=1.0),   # 钢/铝：余音数秒
    "glass":     dict(eta=0.0006, alpha=1.0),   # 玻璃：清亮，余音长
    "ceramic":   dict(eta=0.002, alpha=4.0),    # 陶瓷
    "stone":     dict(eta=0.008, alpha=12.0),   # 石头/混凝土
    "wood":      dict(eta=0.02, alpha=12.0),    # 木头：短促温暖
    "plastic":   dict(eta=0.035, alpha=25.0),   # 塑料：闷
    "cardboard": dict(eta=0.08, alpha=40.0),    # 纸板
    "rubber":    dict(eta=0.2, alpha=60.0),     # 橡胶：几乎无余音
}


def decay_t60(freqs, material: str = "wood", eta: float | None = None, alpha: float | None = None) -> np.ndarray:
    m = MATERIALS[material]
    eta = m["eta"] if eta is None else eta
    alpha = m["alpha"] if alpha is None else alpha
    return LN1000 / (alpha + np.pi * np.asarray(freqs, dtype=float) * eta)


# ---------------------------------------------------------------- 形状 → 模态频率比

def bar_ratios(n: int, clamped: bool = False) -> np.ndarray:
    """欧拉-伯努利梁。自由-自由（木琴条、金属管、木棍）：1, 2.756, 5.404, 8.933…
    一端固定（尺子压在桌边、音叉齿）：1, 6.267, 17.55…"""
    if clamped:
        betas = [1.8751, 4.6941, 7.8548, 10.9955] + [(2 * k - 1) * np.pi / 2 for k in range(5, n + 1)]
    else:
        betas = [4.7300, 7.8532, 10.9956, 14.1372] + [(2 * k + 1) * np.pi / 2 for k in range(5, n + 1)]
    b = np.asarray(betas[:n])
    return (b / b[0]) ** 2


def plate_ratios(n: int, aspect: float = 1.5):
    """矩形板（简支边界）：f_mn ∝ (m/a)² + (k/b)²。门板、地板、桌面、箱子侧板。
    返回 (频率比, [(m, k), ...])，后者用于按敲击位置计算模态幅度。"""
    modes = sorted(((m / aspect) ** 2 + k ** 2, m, k) for m in range(1, 40) for k in range(1, 40))[:n]
    base = modes[0][0]
    return np.array([v / base for v, _, _ in modes]), [(m, k) for _, m, k in modes]


MEMBRANE_RATIOS = np.array([1.0, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.600, 3.652,
                            4.060, 4.154, 4.601, 4.832, 4.903, 5.131, 5.412, 5.500, 5.570, 5.625])
BELL_RATIOS = np.array([0.5, 1.0, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011, 4.166, 5.433, 6.796, 8.215])


def ring_ratios(n: int, stiffness: float = 0.9) -> np.ndarray:
    """圆环/薄壳（玻璃杯、碗、金属罐的 (k,0) 模态）：f ∝ k(k²-1)/√(k²+1)，k=2,3,…
    stiffness < 1 压缩高阶比值，更接近实测酒杯（(3,0)/(2,0) ≈ 2.3~2.7）。"""
    k = np.arange(2, 2 + n, dtype=float)
    r = k * (k ** 2 - 1) / np.sqrt(k ** 2 + 1)
    return (r / r[0]) ** stiffness


# ---------------------------------------------------------------- 物体与敲击

@dataclass
class Hit:
    t: float = 0.0              # 时刻（秒）
    velocity: float = 1.0       # 力度，1 为基准；影响音量和亮度
    contact_ms: float = 1.0     # 基准接触时间（毫秒）：越短越亮
    pos: object = None          # 敲击位置：板为 (x, y)，棒为 x，取值 0~1；None 用物体默认位置并随机抖动
    hardness: float = 0.0       # 0~1：力中"硬核"部分的比例（接触时间只有 1/5），如指节=软组织+骨头、带橡胶头的锤子


def _half_sine(k: int) -> np.ndarray:
    p = np.sin(np.pi * (np.arange(k) + 0.5) / k)
    return p / p.sum()


def force_pulse(contact_ms: float, velocity: float = 1.0, hardness: float = 0.0, sr: int = SR) -> np.ndarray:
    """接触力脉冲（面积 = velocity）。半正弦的频谱在 ~0.5/Tc 以上滚降、1.5/Tc 处有零点，
    所以接触时间直接决定能激发多高的模态。力度越大接触越短（Hertz 接触 Tc ∝ v^-0.2）。"""
    tc = contact_ms / 1000.0 * max(velocity, 0.05) ** -0.2
    k = max(2, n_samples(tc, sr))
    p = (1.0 - hardness) * _half_sine(k)
    if hardness > 0:
        kh = max(2, k // 5)
        p[:kh] += hardness * _half_sine(kh)
    return velocity * p


@dataclass
class Body:
    freqs: np.ndarray
    t60s: np.ndarray
    gains: np.ndarray
    kind: str = "generic"                 # plate | bar | generic
    mode_idx: list | None = None          # plate 为 [(m,k)]；bar 为模态序号
    default_pos: object = None
    pos_jitter: float = 0.03
    seed: object = None
    _rng: np.random.Generator = field(default=None, repr=False)

    def __post_init__(self):
        self._rng = rng(self.seed)
        keep = (self.freqs > 20) & (self.freqs < 20000)
        self.freqs, self.t60s, self.gains = self.freqs[keep], self.t60s[keep], self.gains[keep]
        if self.mode_idx is not None:
            self.mode_idx = [m for m, k in zip(self.mode_idx, keep) if k]

    # -- 敲击位置 → 各模态幅度系数
    def _position_factor(self, pos) -> np.ndarray:
        g = self._rng
        if self.kind == "plate" and self.mode_idx is not None:
            x, y = pos if pos is not None else self.default_pos or (0.37, 0.41)
            x = float(np.clip(x + g.normal(0, self.pos_jitter), 0.02, 0.98))
            y = float(np.clip(y + g.normal(0, self.pos_jitter), 0.02, 0.98))
            mk = np.array(self.mode_idx, dtype=float)
            f = np.abs(np.sin(mk[:, 0] * np.pi * x) * np.sin(mk[:, 1] * np.pi * y))
        elif self.kind == "bar":
            x = pos if pos is not None else (self.default_pos if self.default_pos is not None else 0.3)
            x = float(np.clip(x + g.normal(0, self.pos_jitter), 0.0, 1.0))
            ks = np.asarray(self.mode_idx if self.mode_idx is not None else range(len(self.freqs)), dtype=float)
            betas = np.sqrt(self.freqs / self.freqs[0]) * 4.73
            f = np.abs(np.cos(betas * (x - 0.5) + (ks % 2) * np.pi / 2))
        else:
            f = np.clip(1.0 + g.normal(0, 0.25, len(self.freqs)), 0.2, 1.6)
        return 0.08 + 0.92 * f

    def split(self, amount: float = 0.001, seed=None) -> "Body":
        """简并模态分裂：对称物体（玻璃杯、钟、金属管）每个模态其实是两个极近的频率，
        它们互相"拍频"产生微妙的起伏闪烁（钟声的 wah-wah）。amount 为相对失谐量。"""
        g = rng(seed if seed is not None else self._rng)
        m = len(self.freqs)
        f2 = self.freqs * (1.0 + amount * g.uniform(0.3, 1.0, m))
        idx = None if self.mode_idx is None else self.mode_idx + self.mode_idx
        return Body(np.concatenate([self.freqs, f2]),
                    np.concatenate([self.t60s, self.t60s * g.uniform(0.85, 1.15, m)]),
                    np.concatenate([self.gains, self.gains * g.uniform(0.3, 0.9, m)]),
                    self.kind, idx, self.default_pos, self.pos_jitter, g)

    def render(self, hits, dur: float | None = None, sr: int = SR) -> np.ndarray:
        """渲染一串敲击（单声道）。同一物体多次敲击时各模态线性叠加（上一击的余音不会被切断）。"""
        hits = [hits] if isinstance(hits, Hit) else list(hits)
        if dur is None:
            dur = max(h.t for h in hits) + min(float(np.max(self.t60s)), 8.0) + 0.05
        n = n_samples(dur, sr)
        events = []  # (起点, 力脉冲, 各模态权重)
        for h in hits:
            s = n_samples(h.t, sr)
            if s >= n:
                continue
            pulse = force_pulse(h.contact_ms, h.velocity, h.hardness, sr)
            events.append((s, pulse[: n - s], self.gains * self._position_factor(h.pos)))
        y = np.zeros(n)
        exc = np.zeros(n)
        for i, (f, t60) in enumerate(zip(self.freqs, self.t60s)):
            exc[:] = 0.0
            for s, pulse, w in events:
                exc[s:s + len(pulse)] += w[i] * pulse
            y += resonator(exc, f, t60, 1.0, sr)
        return y


def _gains(ratios, tilt, g, spread=0.4):
    return np.asarray(ratios, dtype=float) ** -tilt * g.uniform(1.0 - spread, 1.0, len(ratios))


def _detune(ratios, amount, g):
    r = np.asarray(ratios, dtype=float).copy()
    r[1:] *= 1.0 + amount * g.standard_normal(len(r) - 1)
    return r


def plate(f11: float, material: str = "wood", aspect: float = 1.5, n_modes: int = 40, tilt: float = 0.3,
          eta=None, alpha=None, detune: float = 0.015, pos=None, seed=None) -> Body:
    """板状物体：门、地板、桌面、箱体、金属板（f11 为最低模态频率）。"""
    g = rng(seed)
    ratios, idx = plate_ratios(n_modes, aspect)
    f = f11 * _detune(ratios, detune, g)
    return Body(f, decay_t60(f, material, eta, alpha), _gains(ratios, tilt, g), "plate", idx, pos, seed=g)


def bar(f1: float, material: str = "wood", n_modes: int = 8, clamped: bool = False, tilt: float = 0.2,
        eta=None, alpha=None, detune: float = 0.01, pos=None, seed=None) -> Body:
    """棒/管状物体：木棍、金属管、木琴条、尺子。"""
    g = rng(seed)
    ratios = bar_ratios(n_modes, clamped)
    f = f1 * _detune(ratios, detune, g)
    return Body(f, decay_t60(f, material, eta, alpha), _gains(ratios, tilt, g), "bar",
                list(range(len(f))), pos, seed=g)


def membrane(f1: float, material: str = "plastic", n_modes: int = 16, tilt: float = 0.4,
             eta=None, alpha=None, detune: float = 0.01, seed=None) -> Body:
    """圆形膜：鼓面、纸箱面、帐篷布（配合较大阻尼）。"""
    g = rng(seed)
    ratios = MEMBRANE_RATIOS[:n_modes]
    f = f1 * _detune(ratios, detune, g)
    return Body(f, decay_t60(f, material, eta, alpha), _gains(ratios, tilt, g), seed=g)


def ring(f_base: float, material: str = "glass", n_modes: int = 6, stiffness: float = 0.9, tilt: float = 0.2,
         eta=None, alpha=None, detune: float = 0.02, split: float = 0.0015, seed=None) -> Body:
    """杯/碗/罐：玻璃杯、陶瓷杯、金属碗。默认带简并模态分裂（拍频闪烁）。"""
    g = rng(seed)
    ratios = ring_ratios(n_modes, stiffness)
    f = f_base * _detune(ratios, detune, g)
    b = Body(f, decay_t60(f, material, eta, alpha), _gains(ratios, tilt, g), seed=g)
    return b.split(split, g) if split > 0 else b


def bell(f_prime: float, material: str = "metal", tilt: float = 0.1, eta=None, alpha=None,
         detune: float = 0.004, split: float = 0.002, seed=None) -> Body:
    """钟：hum(0.5) prime(1) tierce(1.183 小三度) quint(1.5) nominal(2)…"""
    g = rng(seed)
    f = f_prime * _detune(BELL_RATIOS, detune, g)
    b = Body(f, decay_t60(f, material, eta, alpha), _gains(BELL_RATIOS, tilt, g), seed=g)
    return b.split(split, g) if split > 0 else b


def random_body(f_low: float, f_high: float, n_modes: int = 12, material: str = "stone", tilt: float = 0.3,
                eta=None, alpha=None, seed=None) -> Body:
    """无规则形状的小物体（碎片、石子、杂物）：模态在 [f_low, f_high] 内对数均匀随机分布。"""
    g = rng(seed)
    f = np.sort(np.exp(g.uniform(np.log(f_low), np.log(f_high), n_modes)))
    return Body(f, decay_t60(f, material, eta, alpha), _gains(f / f[0], tilt, g), seed=g)


def contact_noise(dur_ms: float = 1.0, center_hz: float = 3000.0, q: float = 0.8, seed=None, sr: int = SR) -> np.ndarray:
    """接触瞬间的"咔/嗒"声：极短噪声爆发经带通（指节骨头、指甲、硬底鞋跟的那一下）。峰值归一。"""
    x = burst(max(dur_ms, 0.05) / 1000.0, seed, sr=sr)
    x = np.concatenate([x, np.zeros(n_samples(0.004, sr))])  # 给带通留出振铃尾巴
    y = bandpass(x, center_hz, q, sr)
    return y / (peak(y) + 1e-12)
