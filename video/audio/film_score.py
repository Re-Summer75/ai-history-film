"""整片配乐 v4（成片时长见 out/film_cues.json，120 BPM，一拍 0.5 s；D 小调 → 结尾 D 大调）。

v4 按"加长之后的成片时间轴"重写（各幕的段落边界由 timeline.M 从画面的时间映射换算，与画面逐拍对齐）：
  · 全片只有一套拍子：所有画面重音都在 0.5 s 的拍点上；段落可以从任意拍点开始（Score.at 设定本段的小节相位），
    拍子本身从不错位——v3 开场"工作的脉动"小节线在奇数秒、12 s 重击又回到偶数秒，听起来像断了一下，这次统一；
  · 去掉 11.92 的硬静音；冻结时不再是一片死寂：停转之后保留一个"被冻住"的和弦（慢慢颤动），八音盒在上面问出问题，
    倒带从它里面长出来；
  · 铺底（pad）从 26 s 起一直连奏到片尾，只在 193.72 的"屏息"（内爆 → 爆发）留 0.28 s 的空白；
  · 画面重音：重击 14.0、冻结 26.0、1950 32.0、2012 102.0、第 37 手 127.5、4 : 1 131.5、规模 158 / 160.5 / 163 / 166、
    爆发 194.0、算力 212.0、竞赛 226.0 起每 3 拍、Opus 5.5 240.0、智能体 292.0、12 小时 340.0、数据之城 348.0、冲出 2026 360.0。

主题（"问句"）：A D F E | D C A；回答的尝试：A D F G → A；结尾在 D 大调上回答：A D F♯ E D。
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from inst import (HALL, ROOT, SR, VOICING, arp_note, bandpass, bass_note, bell, celesta, compress, conv_reverb, db_to_amp, drone,
                  exp_decay, gate, heartbeat, highpass, highshelf, lead_saw, lowpass, lowshelf, mk_clap, mk_crash, mk_hat, mk_kick,
                  mk_snare, ns, pad_chord, pingpong, rewind, rng, saturate, sub_boom, synth, tape_stop, up, white)
from timeline import DURATION, M

DUR = DURATION
N = ns(DUR + 4.0)
OUT = Path(__file__).resolve().parents[1] / "out"
G = rng(389)

KICK = [mk_kick(i) for i in range(4)]
KICK_BIG = mk_kick(9, punch=1.3)
CLAP = [mk_clap(10 + i) for i in range(4)]
SNARE = [mk_snare(40 + i) for i in range(6)]
HAT = [mk_hat(20 + i) for i in range(6)]
OHAT = [mk_hat(30 + i, True) for i in range(3)]


def mk_tom(f0: float, seed: int) -> np.ndarray:
    """筒鼓：音高快速下滑的正弦 + 鼓槌的一点噪声。"""
    g = rng(seed)
    n = ns(0.6)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.45 * np.exp(-t / 0.04))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18) * np.minimum(1, t / 0.002)
    stick = bandpass(white(n, g), 2500.0, 0.8) * np.exp(-t / 0.012)
    return saturate(body + 0.25 * stick / (np.abs(stick).max() + 1e-9), 2.5)


TOMS = [mk_tom(f, 60 + i) for i, f in enumerate((196.0, 147.0, 110.0, 82.0))]

HOOK = [(0.0, "A4", 0.45), (0.5, "D5", 0.45), (1.0, "F5", 0.45), (1.5, "E5", 0.95), (2.5, "D5", 0.45), (3.0, "C5", 0.45), (3.5, "A4", 0.45)]
ANSWER = [(0.0, "A4", 0.45), (0.5, "D5", 0.45), (1.0, "F5", 0.45), (1.5, "G5", 0.45), (2.0, "A5", 1.4)]
MAJOR = [(0.0, "A4", 0.45), (0.5, "D5", 0.45), (1.0, "F#5", 0.45), (1.5, "E5", 0.95), (2.5, "D5", 2.4)]

# ---------------------------------------------------------------- 段落锚点（成片时间）：由画面的时间映射换算，写成常数便于阅读，
# 启动时逐个核对（画面改了时间，这里会直接报错，而不是悄悄错位）
ANCHORS = {
    "slam": (12.0, 14.0), "freeze": (24.0, 26.0), "rewind": (26.9, 28.9), "y1950": (30.0, 32.0), "imit": (38.0, 40.0),
    "dartmouth": (46.0, 50.0), "ai_bells": (49.64, 53.64), "perceptron": (54.0, 58.0), "eliza": (64.0, 69.0), "winter": (72.4, 78.4), "crash": (75.0, 81.0),
    "backprop": (84.0, 90.0), "y2012": (96.0, 102.0), "imagenet": (104.0, 110.0), "deepblue": (112.0, 118.0), "go": (114.0, 121.0),
    "move37": (120.5, 127.5), "four_one": (124.0, 131.5), "attention": (128.0, 135.5), "guess": (144.0, 152.0), "sanbu": (147.5, 155.5),
    "gpt1": (150.0, 158.0), "gpt2": (152.0, 160.5), "gpt3": (154.0, 163.0), "kimi": (156.0, 166.0), "build": (168.0, 186.0),
    "implode": (175.72, 193.72), "chatgpt": (176.0, 194.0), "compute": (192.0, 212.0), "race": (200.0, 226.0), "opus55": (214.0, 240.0),
    "context": (216.0, 242.0), "dialog": (224.0, 250.0), "reason": (248.0, 274.0), "answer": (256.0, 282.0), "caps": (258.5, 284.5), "imo35": (260.0, 286.0), "icpc11": (261.25, 287.25), "icpc12": (261.455, 287.5), "agents": (264.0, 292.0),
    "screen": (272.0, 301.0), "mcp": (276.0, 307.0), "term": (280.0, 312.0), "metr": (292.0, 324.0), "h12": (308.0, 340.0),
    "city": (316.0, 348.0), "exit": (328.0, 360.0), "calm": (332.6, 364.6), "story": (342.2, 374.2), "title": (349.6, 381.6),
}
for _k, (_old, _new) in ANCHORS.items():
    assert abs(M(_old) - _new) < 0.02, f"锚点 {_k}：原来 {_old} → 成片 {M(_old):.2f}，配乐里写的是 {_new}"
A = {k: v[1] for k, v in ANCHORS.items()}

# ---------------------------------------------------------------- 和弦表（26 s 之后；0–26 s 的"磁带"另写在 pass_tape 里）
CHART = [
    (26.0, "Bb"),                                                              # 冻结：停住的那个和弦
    (31.0, "Dsus2"),                                                           # 倒带 → 1950
    (40.0, "Dm"), (42.0, "Dm"), (44.0, "Gm"), (46.0, "Gm"), (48.0, "C"),       # 模仿游戏
    (50.0, "F"), (52.0, "Bb"), (54.0, "F"), (56.0, "C"),                       # 达特茅斯：大调的希望
    (58.0, "Dm"), (60.0, "Bb"), (62.0, "F"), (64.0, "C"), (66.0, "Dm"), (68.0, "A"),   # 感知机（68–69 是两拍的过门）
    (69.0, "Dm"), (71.0, "Bb"), (73.0, "Gm"), (75.0, "Gm"), (77.0, "Bb"), (79.0, "C"),   # ELIZA → 拉远：期望曲线一路往上（VI–VII）
    (81.0, "Dm"), (84.0, "Bb"), (86.0, "Gm"), (88.0, "A"),                     # 寒冬：跌下去那一拍落回 i（最暗）；之后改走偶数拍，接反向传播
    (90.0, "Dm"), (92.0, "Bb"), (94.0, "F"), (96.0, "C"), (98.0, "Bb"), (100.0, "C"),   # 反向传播：回暖
    (102.0, "Dm"), (104.0, "Bb"), (106.0, "F"), (108.0, "C"), (110.0, "Dm"), (112.0, "Bb"), (114.0, "F"), (116.0, "C"),
    (118.0, "Dm"), (120.0, "Bb"), (122.0, "Gm"), (124.0, "A"),                 # 深蓝 → 围棋：低音一路下行到属和弦
    (127.5, "Bb"), (129.5, "C"), (131.5, "D"),                                 # 第 37 手（意外的一步）→ 4 : 1（大三和弦）
    (135.5, "F"), (138.0, "C"), (140.0, "Dm"), (142.0, "Bb"), (144.0, "F"), (146.0, "C"), (148.0, "Dm"), (150.0, "Bb"),   # 注意力
    (152.0, "Dm"), (154.0, "Bb"), (156.0, "C"),                                # 猜下一个词
    (158.0, "Dm"), (160.5, "Bb"), (163.0, "F"), (166.0, "C"),                  # 规模：四级堆叠
    (168.0, "Dm"), (170.0, "Bb"), (172.0, "F"), (174.0, "C"), (176.0, "Dm"), (178.0, "Bb"), (180.0, "F"), (182.0, "C"), (184.0, "Dm"),
    (186.0, "Bb"), (190.0, "A"),                                               # 蓄力
    (194.0, "Dm"), (196.0, "Bb"), (198.0, "F"), (200.0, "C"), (202.0, "Dm"), (204.0, "Bb"), (206.0, "F"), (208.0, "C"), (210.0, "Dm"),
    (212.0, "Dm"), (214.0, "Bb"), (216.0, "F"), (218.0, "C"), (220.0, "Dm"), (222.0, "Bb"), (224.0, "C"),   # 算力
    (226.0, "Dm"), (228.0, "C"), (230.0, "Bb"), (232.0, "A"), (234.0, "Dm"), (236.0, "C"), (238.0, "Bb"), (239.0, "A"),   # 竞赛
    (240.0, "D"),                                                              # Opus 5.5：落到大三和弦
    (242.0, "F"), (244.0, "C"), (246.0, "Dm"), (248.0, "Bb"),                  # 上下文窗口
    (250.0, "Dm"), (254.0, "Bb"), (258.0, "F"), (262.0, "C"), (266.0, "Dm"), (270.0, "Bb"),   # 对话：四个时代
    (274.0, "Dm"), (278.0, "Bb"), (282.0, "F"), (284.0, "C"), (286.0, "Bb"), (288.0, "C"),    # 推理 → 成绩卡片
    (292.0, "Dm"), (294.0, "Bb"), (296.0, "F"), (298.0, "C"), (300.0, "Dm"),   # 智能体循环
    (301.0, "Bb"), (303.0, "F"), (305.0, "C"),                                 # 操作电脑
    (307.0, "Dm"), (309.0, "Bb"), (311.0, "C"),                                # MCP
    (312.0, "Dm"), (314.0, "Bb"), (316.0, "F"), (318.0, "C"), (320.0, "Dm"), (322.0, "C"),   # 终端
    (324.0, "Bb"), (328.0, "C"), (332.0, "Dm"), (336.0, "Bb"), (338.0, "C"),   # METR 爬升
    (340.0, "D"), (342.0, "Bb"), (344.0, "C"), (346.0, "A"),                   # 12 小时 → 冲向数据之城
    (348.0, "Dm"), (350.0, "Bb"), (352.0, "F"), (354.0, "C"), (356.0, "Dm"), (358.0, "A"),   # 穿城而过
    (360.0, "Bb"),                                                             # 冲出 2026 / 76 年
    (364.0, "F"), (366.0, "C"), (368.0, "Dm"), (370.0, "Bb"), (372.0, "F"), (374.0, "C"), (376.0, "Gm"), (378.0, "A"),   # 平静
    (381.6, "D"),                                                              # 片名：D 大调
    (DUR, None),
]

def segments(t0: float, t1: float):
    """和弦表里与 [t0, t1) 相交的片段：[(起, 止, 和弦), ...]。"""
    out = []
    for (a, ch), (b, _) in zip(CHART, CHART[1:]):
        if ch is None or b <= t0 or a >= t1:
            continue
        out.append((max(a, t0), min(b, t1), ch))
    return out


def chord_at(t: float) -> str:
    cur = CHART[0][1]
    for a, ch in CHART:
        if a > t + 1e-9:
            break
        cur = ch
    return cur


def curve(points):
    """自动化曲线 [(t, 值), ...] → f(t)：相邻两点之间用 S 形平滑过渡，两端保持。"""
    P = sorted(points)
    T = np.array([p[0] for p in P], float)
    V = np.array([p[1] for p in P], float)

    def f(t):
        t = float(t)
        if t <= T[0]:
            return float(V[0])
        if t >= T[-1]:
            return float(V[-1])
        k = int(np.searchsorted(T, t, side="right") - 1)
        u = (t - T[k]) / max(T[k + 1] - T[k], 1e-9)
        u = u * u * (3 - 2 * u)
        return float(V[k] + (V[k + 1] - V[k]) * u)
    return f


def lv(x, t: float) -> float:
    return float(x(t)) if callable(x) else float(x)


def square_note(note: str, dur: float = 0.16) -> np.ndarray:
    """ELIZA 年代的复古方波。"""
    f = synth.hz(note)
    n = ns(dur)
    x = synth.pulse(f, n, 0.25) * exp_decay(n, dur * 0.9) * np.minimum(1, np.arange(n) / 50)
    return lowpass(x, 3500.0)


def duck_env(n: int, hits, tau: float = 0.16) -> np.ndarray:
    """侧链：每下底鼓按各自的深度把增益压下去，再指数恢复（轻的底鼓只压一点点）。"""
    g = np.ones(n, np.float32)
    L = ns(1.0)
    k = np.arange(L) / SR
    for t, d in hits:
        if d <= 0.0:
            continue
        s = int(round(t * SR))
        if s >= n or s < 0:
            continue
        e = min(n, s + L)
        np.minimum(g[s:e], (1 - d * np.exp(-k[: e - s] / tau)).astype(np.float32), out=g[s:e])
    return g


def breath_env(n: int, items) -> np.ndarray:
    """重击前的吸气：在 [t-dur, t) 里先用 45% 的时间平滑压下 depth dB，保持到重击前 4 ms 再弹回（被重击的起音盖住）。"""
    g = np.zeros(n, np.float32)
    for t, depth, dur in items:
        a, b = int(round((t - dur) * SR)), int(round(t * SR))
        a0, b0 = max(0, a), min(n, b)
        if b0 <= a0:
            continue
        idx = np.arange(a0, b0)
        x = np.clip((idx - a) / (b - a) / 0.45, 0, 1)
        shape = x * x * (3 - 2 * x) * np.clip((b - idx) / (0.004 * SR), 0, 1)
        g[a0:b0] = np.minimum(g[a0:b0], -depth * shape)
    return (10 ** (g / 20)).astype(np.float32)


class Bus:
    def __init__(self, n: int):
        self.n = n
        self.buf = np.zeros((n, 2), np.float32)

    def add(self, x, t, gain_db=0.0, pan=0.0):
        x = np.asarray(x, dtype=np.float64)
        if x.ndim == 1:
            th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
            x = np.stack([x * np.cos(th), x * np.sin(th)], axis=1) * np.sqrt(2)
        f = min(len(x), ns(0.005))                           # 片段末尾 5 ms 淡出，防止截断的"咔"
        if f > 1:
            x = x.copy()
            x[-f:] *= np.linspace(1.0, 0.0, f)[:, None]
        s = int(round(t * SR))
        if s >= self.n or s + len(x) <= 0:
            return
        if s < 0:
            x, s = x[-s:], 0
        e = min(self.n, s + len(x))
        self.buf[s:e] += (x[: e - s] * float(db_to_amp(gain_db))).astype(np.float32)


class Score:
    def __init__(self, n: int = N):
        self.n = n
        self.drums, self.bass, self.pads, self.keys, self.lead, self.fx = (Bus(n) for _ in range(6))
        self.hits: list[tuple[float, float]] = []            # (时间, 侧链深度)
        self.beds: list[tuple[float, float]] = []            # 铺底覆盖的区间（用于检查"地基"是否连续）
        self._kt: set[int] = set()                           # 已有底鼓的时刻（毫秒）：同一时刻只打一下，重击优先（先放）
        self.origin = 0.0                                    # 小节线的相位：本段的第一个小节首拍（全片拍点都在 0.5 s 的网格上）
        self.breaths: list[tuple[float, float, float]] = []   # 重击前的"吸气"：(重击时刻, 压下去多少 dB, 提前多少秒)

    def breath(self, t, depth=8.0, dur=0.28):
        self.breaths.append((t, depth, dur))

    def at(self, origin: float):
        """之后的鼓型以 origin 为小节首拍（段落从奇数秒或半小节开始时用）。"""
        self.origin = origin
        return self

    def beat(self, t: float) -> int:
        return int(round(((t - self.origin) % 2.0) / 0.5)) % 4

    # ---------------- 鼓 ----------------
    def kick(self, t, db=-5.0, big=False):
        key = int(round(t * 1000))
        if key in self._kt:
            return
        self._kt.add(key)
        self.drums.add(KICK_BIG if big else KICK[int(t * 2) % 4], t, db)
        self.hits.append((t, float(np.clip(0.45 * db_to_amp(db + 5.0), 0.0, 0.5))))

    def kicks(self, t0, t1, db=-5.0, pattern="four"):
        """four = 每拍；two = 第 1、3 拍；half = 只有第 1 拍（小节以偶数秒为起点）。"""
        for t in np.arange(t0, t1 - 1e-6, 0.5):
            pos = self.beat(t)
            if pattern == "four" or (pattern == "two" and pos in (0, 2)) or (pattern == "half" and pos == 0):
                self.kick(t, lv(db, t))

    def claps(self, t0, t1, db=-9.0):
        for t in np.arange(t0, t1 - 1e-6, 0.5):
            if self.beat(t) in (1, 3):
                self.drums.add(CLAP[int(t * 2) % 4], t, lv(db, t), 0.05)

    def backbeat(self, t0, t1, db=-12.0):
        """半速的军鼓：每小节第 3 拍。"""
        for t in np.arange(t0, t1 - 1e-6, 0.5):
            if self.beat(t) == 2:
                self.drums.add(SNARE[int(t) % 6], t, lv(db, t), 0.1)

    def hats(self, t0, t1, db=-13.0, step=0.25, g=None):
        gg = G if g is None else g                   # 新加的踩镲可以用自己的随机数：不改动后面段落要用的 G
        for k, t in enumerate(np.arange(t0, t1 - 1e-6, step)):
            acc = 1.0 if int(round((t - t0) / 0.25)) % 2 == 1 else 0.55
            self.drums.add(HAT[k % 6], t + gg.normal(0, 0.002), lv(db, t) + 20 * np.log10(acc), 0.25)

    def crash(self, t, db=-8.0, seed=1, dur=3.2):
        self.drums.add(mk_crash(seed, dur), t, db)

    def roll(self, t0, t1, db0=-24.0, db1=-12.0, step0=0.25, step1=0.0625):
        t, k = t0, 0
        while t < t1 - 1e-6:
            p = (t - t0) / (t1 - t0)
            self.drums.add(SNARE[k % 6], t, db0 + (db1 - db0) * p, 0.1)
            t += step0 * (step1 / step0) ** p
            k += 1

    def fill(self, t0, dur=1.0, db=-9.0):
        """筒鼓加花：十六分音符由高到低，最后一拍加军鼓。"""
        for k, t in enumerate(np.arange(t0, t0 + dur - 1e-6, 0.125)):
            p = (t - t0) / dur
            self.drums.add(TOMS[min(3, int(p * 4))], t, db - 4 * (1 - p) + (1.5 if k % 2 == 0 else 0), 0.35 * (1 - 2 * p))
            if p >= 0.75:
                self.drums.add(SNARE[k % 6], t, db - 3, 0.1)

    def swell(self, t_end, dur=1.0, db=-14.0, seed=3):
        """反向镲：在 t_end 处最响（段落衔接）。"""
        x = mk_crash(seed, dur + 0.3)[::-1][-ns(dur):]
        env = (np.arange(len(x)) / len(x)) ** 2
        self.fx.add(x * env[:, None], t_end - dur, db)

    def pad_swell(self, t_end, ch, dur=1.2, db=-16.0):
        """下一段的第一个和弦倒着放：从无到有，落点正好在 t_end。"""
        x = pad_chord(ch, dur + 0.4, 0.6, int(t_end * 3), attack=0.01, release=0.3)[: ns(dur)][::-1]
        env = (np.arange(len(x)) / len(x)) ** 1.5
        self.fx.add(x * env[:, None], t_end - dur, db)

    # ---------------- 音高 ----------------
    def bed(self, t0, t1, db, bright, attack=0.3, release=0.6, octave=0):
        """铺底：按和弦表逐个和弦连奏（后一个和弦的起音与前一个的释音交叠）。"""
        for a, b, ch in segments(t0, t1):
            self.pads.add(pad_chord(ch, b - a, lv(bright, a), int(a * 7) + 3 * octave, attack=attack, release=release, octave=octave),
                          a, lv(db, a))
        if octave == 0:
            self.beds.append((t0, t1))

    def stab(self, t, ch, db=-12.0):
        """短促的和弦重音（放在主奏总线上，不被侧链压掉）。"""
        self.lead.add(pad_chord(ch, 0.2, 0.95, int(t * 13), attack=0.004, release=0.12, octave=1), t, db)

    def bass_line(self, t0, t1, pattern="off8", db=-8.0, bright=0.5):
        """off8 = 反拍八分；8 = 八分；16 = 十六分（避开正拍，偶尔跳八度）；half = 二分音符；whole = 整个和弦持续。"""
        k = 0
        for a, b, ch in segments(t0, t1):
            r = ROOT[ch]
            if pattern == "whole":
                self.bass.add(bass_note(r, b - a - 0.04, bright), a, lv(db, a))
                continue
            if pattern == "half":
                for t in np.arange(a, b - 1e-6, 1.0):
                    self.bass.add(bass_note(r, 0.3, bright), t, lv(db, t))
                continue
            offs, dur = {"off8": ([0.25], 0.2), "8": ([0.0, 0.25], 0.2), "16": ([0.125, 0.25, 0.375], 0.11)}[pattern]
            for beat in np.arange(a, b - 1e-6, 0.5):
                for off in offs:
                    t = beat + off
                    if t >= b - 1e-6:
                        continue
                    k += 1
                    nt = up(r) if (pattern == "16" and k % 5 == 0) else r
                    self.bass.add(bass_note(nt, dur, bright), t, lv(db, t))

    def arp(self, t0, t1, db=-20.0, bright=0.5, step=0.125, octave=2, timbre="fm", offset=0.0):
        for a, b, ch in segments(t0, t1):
            seq = [up(nt, octave) for nt in VOICING[ch]]
            seq = seq + seq[1:3][::-1]
            for k, t in enumerate(np.arange(a + offset, b - 1e-6, step)):
                d = lv(db, t)
                if d < -60:
                    continue
                nt = seq[k % len(seq)]
                x = arp_note(nt, lv(bright, t)) if timbre == "fm" else square_note(nt, 0.16)
                self.keys.add(x, t, d, 0.35 * np.sin(k * 0.7))

    def plucks(self, t0, t1, db=-19.0, pattern=(0, 2, 1, 3, 2, 1, 3, 2), octave=1, step=0.25, bright=0.45):
        for a, b, ch in segments(t0, t1):
            notes = [up(nt, octave) for nt in VOICING[ch]]
            for k, t in enumerate(np.arange(a, b - 1e-6, step)):
                d = lv(db, t)
                if d < -60:
                    continue
                nt = notes[pattern[k % len(pattern)]]
                self.keys.add(synth.pluck(synth.hz(nt), 1.2, brightness=bright, decay=0.996, seed=G), t, d, 0.3 * (1 if k % 2 else -1))

    def motif(self, t0, notes, timbre="saw", db=-11.0, pan=0.0):
        prev = None
        for off, nt, *d in notes:
            dur = d[0] if d else 0.45
            if timbre == "saw":
                self.lead.add(lead_saw(nt, dur, 1.0, int((t0 + off) * 10), glide_from=prev), t0 + off, db)
                self.lead.add(bell(nt, 1.0, 2.0), t0 + off, db - 4, 0.2)
            elif timbre == "bell":
                self.lead.add(bell(nt, 1.0, 2.5), t0 + off, db, pan)
            else:
                self.lead.add(celesta(nt, 3.5 + dur), t0 + off, db, pan)
            prev = nt

    def bells(self, t, notes, db=-16.0, step=0.1, dur=3.0):
        for i, nt in enumerate(notes):
            self.lead.add(bell(nt, 1.0, dur), t + i * step, db, (-0.3, 0.1, 0.3, -0.1)[i % 4])

    # ---------------- 组合 ----------------
    def groove(self, t0, t1, lvl=0.0, clap=True, hats=0.25, bass="off8", arp=True, bright=0.6, kick="four"):
        """标准律动；lvl 为整体电平偏移（dB，可以是自动化曲线）。"""
        L = (lambda t: lv(lvl, t))
        if kick:
            self.kicks(t0, t1, lambda t: -5.0 + L(t), kick)
        if clap:
            self.claps(t0, t1, lambda t: -9.0 + L(t))
        if hats:
            self.hats(t0, t1, lambda t: -13.0 + L(t), hats)
        if bass:
            self.bass_line(t0, t1, bass, lambda t: -8.0 + L(t), bright)
        if arp:
            self.arp(t0, t1, lambda t: -20.0 + L(t), bright * 0.8)

    def drop(self, t0, t1, first=False, bass_db=-8.0):
        """全力段落：四拍底鼓 + 拍手 + 反拍开镲 + 十六分踩镲 + 十六分贝斯。"""
        if first:
            self.kick(t0, -2.0, big=True)
            self.crash(t0, -6.0, 2)
        for b in np.arange(t0, t1 - 1e-6, 0.5):
            if not (first and abs(b - t0) < 1e-6):
                self.kick(b, -4.0)
            if self.beat(b) in (1, 3):
                self.drums.add(CLAP[int(b * 2) % 4], b, -8.0, 0.05)
            self.drums.add(OHAT[int(b * 2) % 3], b + 0.25, -16.0, -0.2)
        for k, t in enumerate(np.arange(t0, t1 - 1e-6, 0.125)):
            if k % 4:
                self.drums.add(HAT[k % 6], t, -14.0 if k % 2 else -18.0, 0.25)
        self.bass_line(t0, t1, "16", bass_db, 0.9)

    # ---------------- 混音 ----------------
    def mix(self) -> np.ndarray:
        """逐条总线处理并累加（每处理完一条就释放），整片长度下也不会撑爆内存。"""
        n = self.n
        m = np.zeros((n, 2), np.float32)
        d = self.drums.buf.astype(np.float64); self.drums.buf = None
        d = compress(d, -14.0, 3.0, 2.0, 80.0) + conv_reverb(d, "room", -20.0)
        m += (d * db_to_amp(-2)).astype(np.float32); del d
        sc = duck_env(n, self.hits, 0.16)
        b = self.bass.buf * sc[:, None]; self.bass.buf = None
        b = lowpass(highpass(b.astype(np.float64), 32.0), 5000.0)
        m += (b * db_to_amp(-6)).astype(np.float32); del b
        sc = duck_env(n, [(t, min(0.55, 1.1 * dp)) for t, dp in self.hits], 0.2)
        p = self.pads.buf * sc[:, None]; self.pads.buf = None; del sc
        p = highpass(p.astype(np.float64), 100.0)
        p = p + conv_reverb(p, HALL, -8.0, 1)
        m += (p * db_to_amp(-3)).astype(np.float32); del p
        k = highpass(self.keys.buf.astype(np.float64), 170.0); self.keys.buf = None
        k = k + pingpong(k, 0.375, 0.36, -14.0) + conv_reverb(k, HALL, -9.0, 5)
        m += k.astype(np.float32); del k
        ld = highpass(self.lead.buf.astype(np.float64), 170.0); self.lead.buf = None
        ld = ld + pingpong(ld, 0.375, 0.36, -14.0) + conv_reverb(ld, HALL, -8.0, 2)
        m += ld.astype(np.float32); del ld
        if self.breaths:                                     # 效果总线不参与：反向镲、倒放和弦正好在"吸气"里冲上来
            m *= breath_env(n, self.breaths)[:, None]
        fx = self.fx.buf.astype(np.float64); self.fx.buf = None
        fx = fx + conv_reverb(fx, HALL, -6.0, 3)
        m += fx.astype(np.float32); del fx
        m = highpass(m.astype(np.float64), 26.0)
        m = lowshelf(m, 90.0, -2.0)
        return highshelf(m, 5000.0, 3.5).astype(np.float32)


def heart_times() -> list[tuple[float, float]]:
    p = OUT / "film_cues.json"
    cues = json.loads(p.read_text(encoding="utf-8"))["cues"]
    return [(c["t"], float(c.get("strength", 1.0))) for c in cues if c["type"] == "heart"]

# ================================================================ 第一遍："磁带"（0 – 26 s，之后被停转、倒带）
def pass_tape() -> np.ndarray:
    S = Score(ns(32.0))
    # 0–3 打字：只有很轻的持续音
    S.pads.add(drone("D2", 14.6, 1, fade_in=4.0, fade_out=0.4), 0.8, -19.0)
    S.pads.add(pad_chord("Dsus2", 3.6, 0.15, 3, attack=2.0, release=0.8), 0.4, -26.0)
    # 3.0 任务发出：和弦倒着吸进来 → 4.0 起"工作的脉动"。小节线在偶数秒，与 14.0 的重击是同一套拍子（v3 在这里错开了半小节）
    S.pad_swell(4.0, "Dm", 1.0, -21.0)
    for k, (t0, ch) in enumerate([(4.0, "Dm"), (6.0, "Dm"), (8.0, "Bb"), (10.0, "C"), (12.0, "A")]):
        p = k / 4
        seq = [up(nt, 2) for nt in VOICING[ch]]
        seq = seq + seq[1:3][::-1]
        for j, t in enumerate(np.arange(t0, t0 + 2.0 - 1e-6, 0.125)):
            S.keys.add(arp_note(seq[j % len(seq)], 0.15 + 0.6 * p), t, -29.0 + 12.0 * p, 0.35 * np.sin(j * 0.7))
        S.pads.add(pad_chord(ch, 2.0, 0.25 + 0.25 * p, int(t0 * 7), attack=0.8 if k == 0 else 0.2, release=0.3), t0, -18.0 + 3.5 * p)
    for t in np.arange(8.0, 14.0 - 1e-6, 0.5):
        r = "Bb1" if t < 10.0 else "C2" if t < 12.0 else "A1"
        S.bass.add(bass_note(r, 0.2, 0.4), t + 0.25, -14.0 + 4.0 * (t - 8.0) / 6.0)
    S.hats(8.0, 10.0, -21.0, 0.25)
    S.hats(10.0, 13.0, -19.0, 0.125)
    S.kicks(10.0, 12.0, -13.0, "two")                                   # 底鼓悄悄进来
    S.kicks(12.0, 13.5, -10.0, "four")
    S.roll(12.0, 14.0, -26.0, -12.0, 0.25, 0.0625)                     # 不再硬静音换气：滚奏 + 反向镲一路推到 14.0
    S.swell(14.0, 1.6, -15.0, 31)
    # 14.0 重击 → 律动；多写到 32 s，给停转与倒带留素材
    S.breath(14.0, 10.0, 0.32)                         # 光流汇聚成"2026"之前吸一口气（v3 在这里是硬静音，被听成断层；现在是平滑的压低）
    S.crash(14.0, -7.0)
    S.kick(14.0, -1.5, big=True)
    S.fx.add(sub_boom(2.6, 55.0, 30.0), 14.0, -9.0)
    for k, ch in enumerate(["Dm", "Bb", "F", "C", "Dm", "Bb", "Dm", "Bb", "Dm"]):
        t0 = 14.0 + 2 * k
        S.kicks(t0, t0 + 2.0, -5.0)
        if t0 >= 16.0:
            S.claps(t0, t0 + 2.0, -9.0)
        S.hats(t0, t0 + 2.0, -13.0, 0.125 if t0 >= 18.0 else 0.25)
        for off in (0.25, 0.75, 1.25, 1.75):
            S.bass.add(bass_note(ROOT[ch], 0.2, 0.5 + 0.03 * k), t0 + off, -8.0)
        seq = [up(nt, 2) for nt in VOICING[ch]]
        seq = seq + seq[1:3][::-1]
        for j, t in enumerate(np.arange(t0, t0 + 2.0 - 1e-6, 0.125)):
            S.keys.add(arp_note(seq[j % len(seq)], 0.4 + 0.03 * k), t, -20.0, 0.35 * np.sin(j * 0.7))
        S.pads.add(pad_chord(ch, 2.0, 0.4 + 0.03 * k, int(t0 * 7), attack=0.05, release=0.3), t0, -13.0)
    S.motif(18.0, HOOK[:4], "bell", -17.0, 0.15)
    S.roll(22.4, 26.0, -26.0, -13.0, 0.25, 0.0625)
    return S.mix()


# ================================================================ 第二遍：26 s 之后的整片
def pass_story() -> np.ndarray:
    S = Score(N)
    # ---- 冻结（26.0 磁带停转之后）：不留死寂——停住的 B♭ 和弦被"冻"在高处轻轻颤动，八音盒在上面慢慢问出那个问题
    fz = pad_chord("Bbadd9", 3.6, 0.35, 261, attack=0.25, release=1.0)          # 与停转交叠 0.45 s：声音不会掉进空洞
    tt = np.arange(len(fz)) / SR
    trem = 0.72 + 0.28 * np.sin(2 * np.pi * 5.5 * tt)
    S.fx.add(highpass(fz, 380.0) * trem[:, None], 26.05, -19.5)
    S.pads.add(drone("D2", 6.6, 31, fade_in=0.25, fade_out=2.2), 25.95, -23.0)   # 低处一根持续音托住冻结与倒带，一直接到 1950
    for off, nt, db in [(0.0, "A4", -19.5), (0.5, "D5", -19.0), (1.0, "F5", -19.0), (1.5, "E5", -17.5)]:
        S.lead.add(celesta(nt, 4.5), 26.8 + off, db, 0.12)
    # ---- 心跳（全片所有 heart 提示点：图灵、蓄力、片尾）
    for t, s in heart_times():
        S.bass.add(heartbeat(s, int(t * 100)), t, -5.0 + 6.0 * np.log10(max(s, 0.1)))

    # ================= 第 1 幕：一个问题（32 – 102）=================
    S.pad_swell(32.0, "Dsus2", 1.6, -12.0)                               # 倒带的尽头：和弦倒着涌上来，落在 32.0
    S.bed(32.0, 40.0, -19.5, 0.15, attack=1.0, release=1.2)
    S.pads.add(drone("D3", 9.4, 5, fade_in=1.0, fade_out=2.0), 31.6, -23.0)
    S.motif(33.0, HOOK[:4], "celesta", -11.5, 0.2)                       # 问句
    S.motif(37.0, ANSWER[:4], "celesta", -12.5, -0.2)                    # 想回答，却停在半空（A D F G，不落到 A）
    S.swell(40.0, 1.4, -21.0)
    # 模仿游戏（40–50）→ 达特茅斯（50–58）：拨弦一直延续到 59 s；心跳变成每小节一下的脉搏
    S.at(40.0)
    S.bed(40.0, 50.0, -13.5, 0.25, attack=0.8, release=0.8)
    S.bed(50.0, 58.0, -12.0, 0.45, attack=0.6, release=0.6)
    S.plucks(40.0, 59.0, curve([(40.0, -21.0), (42.0, -14.5), (57.0, -14.5), (59.0, -27.0)]))
    for t in np.arange(40.0, 58.0, 2.0):
        S.bass.add(heartbeat(0.55, int(t)), t, -7.0)
        if t >= 54.0:                                                   # "人工智能"有了名字之后：一小节两下，脉搏加快
            S.bass.add(heartbeat(0.45, int(t) + 1), t + 1.0, -9.5)
    S.swell(50.0, 1.2, -20.0, 5)
    S.bells(A["ai_bells"], ["F5", "A5", "C6", "F6"], -20.0, 0.12, 3.5)   # "ARTIFICIAL INTELLIGENCE" 成形
    S.crash(54.0, -28.0, 21, 4.0)
    S.hats(57.0, 58.0, curve([(57.0, -30.0), (58.0, -19.0)]), 0.0625)    # 拾音：带进感知机
    # 感知机（58–69）：计算的脉冲（FM 琶音 + 第 1、3 拍的底鼓）
    S.bed(58.0, 69.0, -12.5, 0.35, attack=0.3, release=0.5)
    S.arp(57.0, 69.5, curve([(57.0, -31.0), (59.0, -17.0), (66.0, -17.0), (69.5, -33.0)]), 0.35, step=0.25, octave=1)
    S.kicks(58.0, 68.0, -11.0, "two")
    S.hats(58.0, 68.0, curve([(58.0, -20.0), (66.0, -18.0), (68.0, -22.0)]), 0.25)
    S.bass_line(60.0, 69.0, "half", curve([(60.0, -16.0), (64.0, -12.0)]), 0.25)
    # ELIZA（69–81）：琶音的音色在 67–69 交叉淡化成复古方波。77 起镜头拉远，终端缩成期望曲线上的一点，曲线一路冲上 1973 的顶点——
    # 律动不退场，反而往上推（B♭ → C、琶音变亮、踩镲加密、反向镲），到 81.0 曲线跌下去的那一拍一刀切断
    S.at(69.0)
    S.bed(69.0, 81.0, curve([(69.0, -13.0), (79.0, -13.0), (81.0, -11.5)]), curve([(69.0, 0.25), (79.0, 0.3), (81.0, 0.5)]), attack=0.3, release=0.15)
    S.arp(67.0, 81.0, curve([(67.0, -37.0), (69.0, -18.5), (77.0, -18.5), (81.0, -15.5)]), curve([(67.0, 0.5), (79.0, 0.5), (81.0, 0.75)]),
          step=0.25, octave=1, timbre="square")
    S.kicks(69.0, 81.0, curve([(69.0, -13.0), (77.0, -14.0), (81.0, -10.0)]), "two")
    S.hats(79.0, 81.0, curve([(79.0, -24.0), (81.0, -16.0)]), 0.125)
    S.bass_line(69.0, 81.0, "half", curve([(69.0, -12.0), (81.0, -12.0)]), 0.2)
    S.swell(81.0, 1.6, -15.0)                                            # 反向镲冲进跌落的那一拍
    S.breath(81.0, 8.0, 0.25)
    # 寒冬（81–90）：跌下去的那一拍——镲片、低频下坠、一记很暗的和弦；之后只剩冷的持续音、一路往下的钟（偶数拍）和第二次跌落
    S.bed(81.0, 90.0, -14.0, 0.1, attack=0.08, release=1.2)
    S.pads.add(drone("D3", 10.0, 11, fade_in=0.3, fade_out=2.5), 80.9, -24.0)
    S.pads.add(drone("A3", 10.0, 12, fade_in=1.5, fade_out=2.5), 80.9, -29.0)
    S.stab(81.0, "Dm", -13.0)
    S.crash(81.0, -15.0, 22, 5.0)
    S.kick(81.0, -6.0, big=True)
    S.fx.add(sub_boom(2.4, 46.0, 30.0), 81.0, -9.0)                     # 第一次跌落
    S.fx.add(sub_boom(2.0, 48.0, 30.0), 83.0, -12.0)                    # 第二次跌落（曲线 1987 起往下掉）
    for t0, nt in [(82.0, "A5"), (84.0, "F5"), (86.0, "D5"), (88.0, "A4")]:
        S.lead.add(bell(nt, 1.0, 4.0), t0, -15.5, 0.2 * np.sin(t0))
    S.pad_swell(90.0, "Dm", 1.6, -17.0)
    # 反向传播（90–102）：心跳变成鼓，一路回暖、加厚，直到 102 的爆发
    S.at(90.0)
    S.bed(90.0, 102.0, curve([(90.0, -13.5), (102.0, -13.0)]), curve([(90.0, 0.3), (102.0, 0.6)]), attack=0.4, release=0.5)
    S.kicks(90.0, 94.0, curve([(90.0, -13.0), (94.0, -10.0)]), "two")
    S.arp(90.0, 102.0, curve([(90.0, -23.0), (94.0, -20.0), (102.0, -19.0)]), curve([(90.0, 0.25), (102.0, 0.6)]))
    S.kicks(94.0, 102.0, curve([(94.0, -9.0), (102.0, -5.0)]), "four")
    S.hats(94.0, 98.0, -17.0, 0.25)
    S.hats(98.0, 102.0, -15.0, 0.125)
    S.claps(98.0, 102.0, curve([(98.0, -13.0), (102.0, -9.0)]))
    S.bass_line(92.0, 102.0, "off8", curve([(92.0, -17.0), (96.0, -11.0), (102.0, -8.0)]), 0.4)
    S.roll(100.0, 102.0, -22.0, -12.0, 0.125, 0.0625)

    # ================= 第 2 幕：点燃（102 – 194）=================
    S.at(102.0)
    for t, dp, du in [(102.0, 9.0, 0.3), (127.5, 8.0, 0.28), (163.0, 7.0, 0.22), (166.0, 8.0, 0.28), (212.0, 8.0, 0.28),
                      (226.0, 8.0, 0.28), (240.0, 7.0, 0.25), (292.0, 7.0, 0.25), (301.0, 6.0, 0.22), (340.0, 8.0, 0.28),
                      (350.0, 5.0, 0.14), (352.0, 5.0, 0.14), (354.0, 5.0, 0.14), (356.0, 6.0, 0.16)]:
        S.breath(t, dp, du)                                             # 重击前吸一口气（见 breath_env）
    for t, db in [(102.0, -10.0), (163.0, -11.0), (212.0, -10.0), (226.0, -11.0), (292.0, -11.0)]:
        S.fx.add(sub_boom(2.4, 52.0, 30.0), t, db)                      # 补一记低频轰鸣
    S.crash(102.0, -6.0, 4)
    S.kick(102.0, -2.0, big=True)
    S.bed(102.0, 118.0, -13.0, 0.6, attack=0.05, release=0.35)
    S.groove(102.0, 117.0, 0.0, hats=0.25, bright=0.6)
    S.hats(110.0, 117.0, -16.0, 0.125)                                  # ImageNet 的柱状图：踩镲加密
    S.crash(110.0, -14.0, 23)
    S.bass_line(117.0, 118.0, "off8", -8.0, 0.6)
    S.fill(117.0, 1.0, -9.0)                                             # → 深蓝
    # 深蓝 → 围棋（118–127.5）：半速的张力，低音 D–B♭–G–A 一路下行
    S.crash(118.0, -10.0, 5)
    S.bed(118.0, 124.0, -13.5, 0.3, attack=0.3, release=0.5, octave=-1)
    S.bed(118.0, 124.0, -19.0, 0.3, attack=0.3, release=0.5)
    S.bed(124.0, 127.5, -12.0, 0.6, attack=2.4, release=0.06)            # A：一路渐强，憋到第 37 手
    S.kicks(118.0, 127.0, -6.0, "half")
    S.backbeat(118.0, 127.0, -11.0)
    S.hats(118.0, 122.0, -19.0, 0.25)
    S.hats(122.0, 127.0, curve([(122.0, -19.0), (127.0, -15.0)]), 0.125)
    S.bass_line(118.0, 127.5, "whole", -10.0, 0.3)
    # 127.5 第 37 手：落到 B♭（意外的一步，而且落在反拍上）→ C → 131.5 的 4 : 1 落在 D 大三和弦上
    S.at(127.5)
    S.kick(127.5, -2.0, big=True)
    S.crash(127.5, -7.0, 6)
    S.fx.add(sub_boom(2.5, 50.0, 30.0), 127.5, -11.0)
    S.bed(127.5, 131.5, -12.0, 0.7, attack=0.02, release=0.2)
    S.arp(128.0, 131.5, curve([(128.0, -22.0), (131.5, -16.0)]), curve([(128.0, 0.5), (131.5, 0.9)]), step=0.0625)
    S.kicks(128.0, 130.5, -8.0, "four")
    S.bass_line(127.5, 131.5, "8", -9.0, 0.6)
    S.roll(130.5, 131.5, -20.0, -10.0, 0.125, 0.0625)
    S.kick(131.5, -2.0, big=True)
    S.crash(131.5, -7.0, 7)
    S.bed(131.5, 135.5, -11.5, 0.8, attack=0.02, release=0.8)
    S.bells(131.5, ["D5", "F#5", "A5", "D6"], -15.0)
    S.bass.add(bass_note("D2", 3.95, 0.3), 131.5, -10.0)
    S.hats(132.5, 135.5, curve([(132.5, -26.0), (135.5, -20.0)]), 0.25)   # 延音下面留着很轻的拍子，不让时间停住
    S.pad_swell(135.5, "F", 1.0, -17.0)
    S.swell(135.5, 1.0, -16.0, 8)
    # 注意力（135.5–152）：更轻的律动 + 高八度的闪烁琶音（135.5 是弱起，小节线在 136）
    S.at(136.0)
    S.bed(135.5, 150.0, -14.0, 0.55, attack=0.05, release=0.35)
    S.groove(135.5, 150.0, -5.0, clap=False, hats=0.125, bright=0.7)
    S.claps(140.0, 150.0, -14.5)
    S.arp(135.5, 152.0, curve([(135.5, -24.0), (150.0, -24.0), (152.0, -30.0)]), 0.6, octave=3, offset=0.0625)
    S.groove(150.0, 152.0, curve([(150.0, -6.0), (152.0, -15.0)]), clap=False, hats=0.25, bright=0.6)
    # 猜下一个词（152–158）
    S.at(152.0)
    S.bed(150.0, 158.0, curve([(150.0, -13.5), (152.0, -12.5)]), 0.3, attack=0.6, release=0.6)
    # 第三十四轮：整段还原成第二十八轮（用户点名要那一版）——两小节一下的底鼓 + 猜词的拨弦每半拍一下一直弹到 157.0（节奏不断）。
    # 只去掉"散步"那一刻的两声钟：那一声"叮"改成音效轨里的 answer_chime（a2_ignite.js，主音落在拍点 155.5）
    S.kicks(152.0, 158.0, -14.0, "half")
    guess = ["D5", "A5", "F5", "C6", "E5", "A5", "D5", "F5", "G5", "A5"]
    for i, t in enumerate(np.arange(152.5, 157.4, 0.5)):
        S.keys.add(synth.pluck(synth.hz(guess[i % len(guess)]), 1.4, brightness=0.4, decay=0.996, seed=G), t, -15.0, 0.3 * np.sin(i))
    S.pad_swell(158.0, "Dm", 1.0, -15.0)
    # 规模（158–166）：四级堆叠，一下比一下重（GPT-1 · GPT-2 · GPT-3 · 2.8 万亿）
    S.at(158.0)
    S.bed(158.0, 166.0, curve([(158.0, -15.0), (166.0, -12.5)]), curve([(158.0, 0.35), (166.0, 0.65)]), attack=0.05, release=0.3)
    S.bass_line(158.0, 166.0, "whole", -11.0, 0.3)
    S.kick(158.0, -6.0); S.stab(158.0, "Dm", -15.0)
    S.hats(158.0, 160.5, -19.0, 0.25)
    S.kick(160.5, -4.0); S.stab(160.5, "Bb", -13.0)
    S.hats(160.5, 163.0, -16.0, 0.125)
    S.roll(162.0, 163.0, -22.0, -12.0, 0.125, 0.0625)
    S.kick(163.0, -2.0, big=True); S.crash(163.0, -7.0, 8); S.stab(163.0, "F", -11.0)
    S.hats(163.0, 166.0, -15.0, 0.125)
    S.kicks(163.5, 166.0, curve([(163.5, -12.0), (166.0, -7.0)]), "four")
    S.roll(164.5, 166.0, -24.0, -10.0, 0.125, 0.045)
    S.swell(166.0, 1.4, -14.0, 24)
    # 166.0 万亿级：最重的一下 → 规模定律 + RLHF 的律动（十小节；主题第一次以钟声完整出现：助手诞生）
    S.at(166.0)
    S.kick(166.0, -1.0, big=True); S.crash(166.0, -6.0, 24); S.stab(166.0, "C", -10.0)
    S.fx.add(sub_boom(2.2, 52.0, 30.0), 166.0, -11.0)
    S.bed(166.0, 186.0, -13.0, 0.6, attack=0.05, release=0.35)
    S.groove(166.0, 185.0, -2.0, hats=0.125, bright=0.65)
    S.bass_line(185.0, 186.0, "off8", -10.0, 0.6)
    S.motif(178.0, HOOK, "bell", -17.5, 0.1)
    S.fill(185.0, 1.0, -10.0)
    # 蓄力（186–193.72）：律动在一小节里退场，只剩加速的琶音、心跳、滚奏和越来越亮的 A 和弦
    S.at(186.0)
    S.crash(186.0, -12.0, 15, 4.0)
    S.kicks(186.0, 188.0, curve([(186.0, -8.0), (188.0, -18.0)]), "four")
    S.bed(186.0, 190.0, -13.0, 0.45, attack=0.5, release=0.1)
    S.bed(190.0, 193.72, -12.0, 0.75, attack=2.8, release=0.02)
    S.bass.add(bass_note("Bb1", 3.9, 0.25), 186.0, -12.0)
    S.bass.add(bass_note("A1", 3.6, 0.35), 190.0, -11.0)
    t, i, gap = 186.4, 0, 0.5
    seq = ["D4", "F4", "A4", "D5", "F5", "A5", "C6", "D6", "E6", "F6", "A6"]
    while t < 193.68:
        S.keys.add(arp_note(seq[i % len(seq)] if i < len(seq) else seq[len(seq) - 3 + i % 3], 0.4 + 0.5 * (t - 186.4) / 7.3),
                   t, -22.0 + 8.0 * (t - 186.4) / 7.3, 0.4 * np.sin(i))
        t += gap
        gap = max(0.05, gap * 0.93)
        i += 1
    S.roll(190.0, 193.7, -26.0, -12.0, 0.25, 0.045)

    # ================= 第 3 幕：爆发（194 – 226）=================
    S.at(194.0)
    S.fx.add(sub_boom(3.5), 194.0, -8.0)
    S.drop(194.0, 212.0, first=True)
    S.bed(194.0, 212.0, -11.0, 0.95, attack=0.02, release=0.25)
    S.bed(194.0, 212.0, -17.0, 0.7, attack=0.02, release=0.25, octave=1)
    S.motif(194.0, HOOK, "saw", -11.0)
    S.motif(198.0, ANSWER, "saw", -11.0)
    S.motif(202.0, HOOK, "saw", -12.0)
    S.motif(206.0, ANSWER, "saw", -11.0)
    S.roll(210.0, 212.0, -24.0, -12.0, 0.125, 0.0625)
    # 212.0 地球一震："这场爆发，点燃了一场算力竞赛" → 算力图（律动稍收，让换算那句话被听见）
    S.at(212.0)
    S.kick(212.0, -3.0, big=True)
    S.crash(212.0, -8.0, 9)
    S.bed(212.0, 226.0, -12.5, 0.7, attack=0.05, release=0.3)
    S.groove(212.0, 226.0, curve([(212.0, -1.0), (218.0, -2.0), (223.0, -3.0), (226.0, -1.0)]), hats=0.125, bright=0.7)
    S.roll(224.0, 226.0, -22.0, -11.0, 0.125, 0.0625)

    # ================= 第 4 幕：竞赛（226 – 292）=================
    S.at(226.0)
    S.crash(226.0, -9.0, 10)
    S.kick(226.0, -2.0, big=True)
    S.drop(226.0, 240.0)
    S.bed(226.0, 240.0, -11.5, 0.9, attack=0.02, release=0.25)
    S.bed(226.0, 240.0, -17.0, 0.7, attack=0.02, release=0.25, octave=1)
    for t in (226.5, 228.0, 229.5, 231.0, 232.5, 234.0, 235.5, 237.0, 238.5):   # 大字：3 拍一个的交错重音
        S.stab(t, chord_at(t), -12.0)
        S.drums.add(TOMS[3], t, -7.0, -0.1)
    S.roll(239.0, 240.0, -20.0, -10.0, 0.125, 0.0625)
    # 240.0 Opus 5.5：D 大三和弦 + 号角式的上行分解
    S.kick(240.0, -1.0, big=True)
    S.crash(240.0, -6.0, 11)
    S.fx.add(sub_boom(2.5, 55.0, 30.0), 240.0, -10.0)
    S.bed(240.0, 242.0, -11.0, 0.85, attack=0.02, release=0.9)
    S.bed(240.0, 242.0, -17.0, 0.7, attack=0.02, release=0.9, octave=1)
    S.motif(240.0, [(0.0, "A4", 0.2), (0.25, "D5", 0.2), (0.5, "F#5", 0.2), (0.75, "A5", 1.1)], "saw", -12.0)
    S.bass.add(bass_note("D2", 1.9, 0.4), 240.0, -9.0)
    S.hats(240.5, 242.0, curve([(240.5, -24.0), (242.0, -17.0)]), 0.125)
    S.swell(242.0, 1.0, -16.0, 12)
    # 上下文窗口（242–250）：更轻的律动（没有拍手），渐弱交给对话
    S.bed(242.0, 250.0, -14.0, 0.5, attack=0.1, release=0.5)
    S.groove(242.0, 250.0, curve([(242.0, -5.0), (247.0, -6.0), (250.0, -14.0)]), clap=False, hats=0.25, bright=0.55)
    # 对话（250–274）：四个时代，四种音色；底下保留很轻的脉搏
    S.crash(250.0, -19.0, 16, 4.0)
    S.bed(250.0, 274.0, -11.5, 0.3, attack=1.0, release=0.8)
    S.bass_line(250.0, 274.0, "whole", -17.0, 0.2)
    S.kicks(250.0, 273.0, -15.0, "half")
    S.hats(250.0, 273.0, -23.0, 0.25)
    S.plucks(252.0, 273.5, curve([(252.0, -27.0), (254.0, -21.5), (271.0, -21.5), (273.5, -29.0)]), pattern=(0, 2, 3, 2), octave=1, step=0.5, bright=0.35)
    for i, nt in enumerate(["D5", "F5", "A5", "F5"]):                     # ELIZA：方波
        S.keys.add(square_note(nt, 0.18), M(226.0) + i * 0.25, -19.5)
    for i, nt in enumerate(["A4", "A4", "A4", "C5", "A4", "A4"]):         # GPT-2：单调、重复
        n = ns(0.3)
        S.keys.add(synth.sine(synth.hz(nt), n) * exp_decay(n, 0.25), M(231.0) + i * 0.4, -18.5)
    S.bells(M(236.0), ["C5", "E5", "G5", "C6"], -21.0, 0.25, 2.5)         # ChatGPT：温暖的钟
    S.motif(M(241.0), ANSWER, "saw", -15.5)                               # 2026：主题的回答
    S.pad_swell(274.0, "Dm", 1.2, -16.0)
    # 推理（274–284）：半速；"思考"的琶音越来越快；想通的一刻钟声落下
    S.at(274.0)
    S.bed(274.0, 284.0, -12.0, curve([(274.0, 0.3), (282.0, 0.5)]), attack=0.3, release=0.4)
    S.kicks(274.0, 284.0, -8.0, "half")
    S.backbeat(274.0, 284.0, -13.0)
    S.bass_line(274.0, 284.0, "whole", -13.0, 0.25)
    S.stab(A["answer"], chord_at(A["answer"]), -13.0)                   # 世界线走到头、找到答案（辉光管停在 1.048596）
    for t in (A["answer"] - 5.0, A["answer"] - 3.5, A["answer"] - 2.0):   # 三次跳到另一条世界线（277.0 / 278.5 / 280.0）：配乐让一口气 + 底鼓（"扭"的声音在音效 worldline_shift 里）
        S.breath(t, 5.0, 0.15)
        S.kick(t, -6.0)
    S.breath(A["answer"], 6.0, 0.2)
    # （原来这里有一串越来越快的"思考"琶音——叮叮当当，已删：节奏交给铺底、鼓和每次跳线的倒放和弦）
    # 成绩卡片（284–292）：各一记重音，律动一层层回来
    S.at(284.0)
    S.bed(284.0, 292.0, -13.5, 0.55, attack=0.05, release=0.35)
    # 计分板（原来是两张卡片落下的重击 + 筒鼓，已删）：35 分亮满（286.0）一记轻和弦；AI 做对第 12 题（287.5）更重的一记 + 钟声
    S.stab(286.0, chord_at(286.0), -14.0); S.crash(286.0, -21.0, 44, 2.0)
    S.breath(286.0, 4.0, 0.2)                          # 35 分亮满之前吸一口气（第三十轮去掉了这里的闷击音效，靠配乐让这一记和弦落清楚）
    S.stab(287.5, chord_at(287.5), -11.0); S.crash(287.5, -17.0, 45, 2.5)
    S.breath(287.5, 5.0, 0.2)                          # 人类冠军停在第 11 题（287.25）之后吸一口气，AI 的第 12 题再落下
    S.kicks(284.0, 290.0, curve([(284.0, -8.0), (288.0, -5.0)]), "four")
    S.hats(284.0, 286.0, -16.0, 0.25)
    S.hats(286.0, 292.0, -14.0, 0.125)
    S.claps(286.0, 290.0, -11.0)
    S.bass_line(284.0, 292.0, "off8", curve([(284.0, -12.0), (288.0, -8.0)]), 0.5)
    S.arp(288.0, 292.0, curve([(288.0, -24.0), (292.0, -20.0)]), 0.5)   # 琶音等计分板结束（288）再进来：计分板上不要叮叮当当
    S.roll(290.0, 292.0, -24.0, -12.0, 0.125, 0.0625)

    # ================= 第 5 幕：智能体（292 – 348）=================
    # 循环（292–301）不是满编律动，而是"蓄力"：铺底 + 第 1、3 拍的底鼓 + 八分踩镲，唯一的旋律是那串跟着转速加速的琶音；
    # 转得越快，滤波越开、底鼓变成四拍；301 "甩"进操作电脑时律动才完整进来（原来这里两串琶音叠在满编律动上，很吵）
    S.at(292.0)
    S.crash(292.0, -9.0, 12)
    S.kick(292.0, -3.0, big=True)
    S.bed(292.0, 301.0, -13.5, curve([(292.0, 0.3), (300.5, 0.75)]), attack=0.05, release=0.35)
    S.bed(301.0, 324.0, -13.0, 0.6, attack=0.05, release=0.35)
    S.kicks(292.5, 297.0, -12.0, "two")
    S.kicks(297.0, 300.5, curve([(297.0, -10.0), (300.5, -6.5)]), "four")
    S.hats(292.0, 297.0, -21.0, 0.25)
    S.hats(297.0, 300.75, curve([(297.0, -19.0), (300.75, -15.5)]), 0.125)
    S.bass_line(292.0, 301.0, "whole", -13.0, 0.3)
    # 一串和转速同步加速的琶音（每个音 ≈ 转过 0.15 圈），到十六分音符封顶
    t, i, gap = 292.6, 0, 0.5
    seq = ["D5", "F5", "A5", "C6", "D6", "A5", "F5", "C6"]
    while t < 300.95:
        p = (t - 292.6) / 8.35
        S.keys.add(arp_note(seq[i % len(seq)], 0.3 + 0.5 * p), t, -27.0 + 8.0 * p, 0.4 * np.sin(i * 0.9))
        if gap > 0.125:
            t += gap
            gap = gap * np.exp(-gap / 2.44)
            if gap <= 0.125:                                              # 到十六分音符就封顶，并对齐到拍点网格
                t = 292.0 + np.ceil((t - 292.0) / 0.125 - 1e-9) * 0.125
        else:
            t += 0.125
        i += 1
    S.roll(299.5, 301.0, -26.0, -13.0, 0.125, 0.045)
    S.swell(301.0, 1.4, -15.0, 27)
    S.at(301.0)
    S.kick(301.0, -3.0, big=True); S.crash(301.0, -12.0, 26)
    S.groove(301.0, 307.0, -2.5, hats=0.125, bright=0.62)
    S.at(307.0)
    S.groove(307.0, 312.0, -2.5, hats=0.125, bright=0.62)
    S.at(312.0)
    S.crash(312.0, -17.0, 18)
    S.groove(312.0, 323.0, -1.5, hats=0.125, bright=0.66, arp=False)
    S.plucks(312.0, 323.0, curve([(312.0, -21.0), (314.0, -17.5)]), pattern=(0, 2, 1, 3, 2, 3, 1, 2), octave=1, step=0.25, bright=0.5)
    S.bass_line(323.0, 324.0, "off8", -8.0, 0.66)
    S.fill(323.0, 1.0, -9.0)
    # METR（324–340）：从轻开始，每 2 小节加一层；提示音每 3 拍一个沿五声音阶往上爬
    S.at(324.0)
    S.crash(324.0, -10.0, 17)
    S.bed(324.0, 340.0, curve([(324.0, -15.0), (340.0, -11.5)]), curve([(324.0, 0.4), (340.0, 0.9)]), attack=0.05, release=0.3)
    S.groove(324.0, 328.0, -7.0, clap=False, hats=0.25, arp=False, bright=0.45)
    S.groove(328.0, 332.0, -5.0, clap=True, hats=0.25, arp=True, bright=0.55)
    S.groove(332.0, 336.0, -3.0, hats=0.125, bright=0.65)
    S.drop(336.0, 340.0)
    S.roll(338.0, 340.0, -22.0, -10.0, 0.125, 0.0625)
    # 340.0 12 小时：D 大三和弦；随后冲向数据之城
    S.fx.add(sub_boom(3.0), 340.0, -9.0)
    S.drop(340.0, 347.9, first=True)
    S.bells(340.0, ["D5", "F#5", "A5", "D6"], -14.0)
    S.bed(340.0, 348.0, -11.0, 0.95, attack=0.02, release=0.2)
    S.bed(340.0, 348.0, -17.0, 0.7, attack=0.02, release=0.2, octave=1)
    S.motif(342.0, HOOK, "saw", -12.5)
    S.roll(344.0, 347.9, -24.0, -9.0, 0.25, 0.045)

    # ================= 第 6 幕：现在（348 – 片尾）=================
    # 数据之城（348–360）：一路加速——十六分踩镲、越来越密越来越亮的琶音、滚奏，推到 360.0 冲出 2026
    S.at(348.0)
    S.fx.add(sub_boom(3.5), 348.0, -8.0)
    S.drop(348.0, 356.0, first=True)
    S.bed(348.0, 360.0, -11.0, 0.95, attack=0.02, release=0.2)
    S.bed(348.0, 360.0, -17.0, 0.7, attack=0.02, release=0.2, octave=1)
    S.motif(348.0, HOOK, "saw", -11.0)
    S.motif(352.0, ANSWER, "saw", -11.0)
    for t in (350.0, 352.0, 354.0, 356.0):             # 能量扫地：光从远处扫过来（反向镲）→ 在小节首拍撞上（镲片）
        S.swell(t, 0.8, -21.0, 40 + int(t))
        S.crash(t, -19.0, 41 + int(t), 2.2)
    S.arp(352.0, 359.9, curve([(352.0, -23.0), (359.8, -15.5)]), curve([(352.0, 0.6), (359.8, 0.95)]), step=0.125, octave=2)
    S.drop(356.0, 359.75)
    S.roll(356.0, 358.0, -24.0, -12.0, 0.25, 0.0625)
    S.fill(358.0, 2.0, -9.0)
    S.swell(360.0, 2.0, -12.0, 33)
    # 360.0 冲出 2026：全片最重的一下，落在 B♭ 大三和弦上，然后让它慢慢散开（天际线、"76 年"）
    S.kick(360.0, -1.0, big=True)
    S.crash(360.0, -5.0, 14, 5.0)
    S.fx.add(sub_boom(3.5, 50.0, 28.0), 360.0, -8.0)
    S.bed(360.0, 364.0, -11.5, 0.75, attack=0.02, release=1.6)
    S.bells(360.0, ["D5", "F5", "Bb5", "D6"], -14.5, 0.12, 4.5)
    S.bells(361.4, ["F6", "Bb6"], -20.0, 0.2, 4.0)                        # "76 年"出现
    S.bass.add(bass_note("Bb1", 3.6, 0.3), 360.0, -10.0)
    S.hats(361.0, 364.0, curve([(361.0, -28.0), (364.0, -22.0)]), 0.25)   # 延音下面留着很轻的拍子
    # 平静（364–378）：拨弦 + 心跳似的脉搏（从 1950 一直跳到现在）；"故事，才刚刚开始"时，回答的旋律再出现一次
    S.at(364.0)
    S.bed(364.0, 378.0, -12.5, 0.4, attack=0.8, release=0.8)
    S.plucks(364.0, 378.0, curve([(364.0, -21.0), (366.0, -17.0), (375.0, -17.0), (378.0, -24.0)]), pattern=(0, 2, 3, 2), step=0.5)
    for t in np.arange(364.0, 377.0, 2.0):
        S.bass.add(heartbeat(0.5, 500 + int(t)), t, -9.0)
    S.bass_line(364.0, 378.0, "whole", -15.0, 0.2)
    S.motif(373.0, ANSWER, "celesta", -14.0, 0.1)
    # 378–381.6：A 和弦压低，只剩心跳 → 片名落在 D 大三和弦上，八音盒用大调把问句答完
    S.bed(378.0, 381.6, -17.0, 0.3, attack=0.6, release=0.4)
    S.bed(381.6, DUR, -14.0, 0.4, attack=1.2, release=2.0)
    S.pads.add(drone("D2", DUR - 381.6, 21, fade_in=1.5, fade_out=3.0), 381.6, -21.0)
    S.motif(381.6, MAJOR, "celesta", -13.0, 0.1)
    S.bells(384.4, ["D5", "F#5", "A5", "D6"], -18.5, 0.12, 5.0)

    # 检查：铺底从 32 s 到片尾必须连续（193.72–194.0 的屏息除外）
    iv = sorted(S.beds)
    end = 32.0
    for a, b in iv:
        assert a <= end + 1e-6 or (abs(end - 193.72) < 1e-6 and a == 194.0), f"铺底在 {end:.2f}–{a:.2f} s 断开了"
        end = max(end, b)
    assert end >= DUR - 1e-6, f"铺底在 {end:.2f} s 提前结束"
    return S.mix()


# 段落电平目标（相对 102–118 的律动，单位 dB）。历史、对话、平静段落比律动低 4~8 dB：有起伏，但小音箱上也听得清。
# 实测每段"短时响度的中位数"（不被零星的重击、钟声带偏），再用一条平滑的增益曲线把各段拉到目标上
#（段内的渐强渐弱不受影响；换段处 0.8 s 过渡，在下一段首拍前完成）。
REF = (102.0, 118.0)
TARGET = [
    (32.0, 40.0, -6.0), (40.0, 50.0, -6.0), (50.0, 58.0, -5.5), (58.0, 69.0, -4.5), (69.0, 81.0, -5.5), (81.0, 90.0, -7.0),
    (90.0, 102.0, -3.5), (102.0, 118.0, 0.0), (118.0, 127.5, -2.5), (127.5, 135.5, -1.0), (135.5, 152.0, -1.5), (152.0, 158.0, -6.5),
    (158.0, 166.0, -2.5), (166.0, 186.0, -0.5), (186.0, 193.72, -4.0), (194.0, 212.0, 1.5), (212.0, 226.0, 0.0), (226.0, 240.0, 0.5),
    (240.0, 242.0, 0.5), (242.0, 250.0, -2.5), (250.0, 274.0, -5.5), (274.0, 284.0, -5.0), (284.0, 292.0, -1.5), (292.0, 301.0, -3.0),
    (301.0, 324.0, -0.5), (324.0, 340.0, -2.0), (340.0, 348.0, 1.0), (348.0, 360.0, 2.0), (360.0, 364.0, -1.5), (364.0, 378.0, -6.0),
    (378.0, 381.6, None), (381.6, DUR - 2.5, -5.0),
]

def st_median(x: np.ndarray) -> float:
    """K 计权短时响度（400 ms 块、100 ms 步进）的中位数。"""
    from sfx.analysis import _k_power
    p = _k_power(x, SR)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    c = np.concatenate([[0.0], np.cumsum(p)])
    st = np.arange(0, len(p) - blk + 1, hop)
    lj = -0.691 + 10 * np.log10((c[st + blk] - c[st]) / blk + 1e-20)
    return float(np.median(lj[lj > -70]))


def level_sections(x: np.ndarray) -> np.ndarray:
    ref = st_median(x[ns(REF[0]):ns(REF[1])])
    gains, prev = [], 0.0
    for a, b, tgt in TARGET:
        cur = st_median(x[ns(a):ns(b)]) - ref
        g = prev if tgt is None else float(np.clip(tgt - cur, -6.0, 8.0))
        gains.append((a, b, g))
        prev = g
    print("段落增益（dB）:", " ".join(f"{a:g}:{g:+.1f}" for a, b, g in gains))
    kt, kv = [32.0], [0.0]                                             # 32.0 之前（开场、冻结、倒带、和弦倒放）不动
    for a, b, g in gains:
        kt += [a, b - 0.8]
        kv += [g, g]
    kt[1] = max(kt[1], kt[0] + 0.8)
    t = np.arange(len(x)) / SR
    gdb = np.interp(t, kt, kv)
    return x * (10 ** (gdb / 20)).astype(np.float32)[:, None]


def render() -> np.ndarray:
    t0 = time.time()
    tape = pass_tape()
    out = np.zeros((N, 2))
    a = ns(26.0)
    out[:a] = tape[:a]
    ts = tape_stop(tape, 26.0, 0.5)                                    # 26.0–26.5 磁带停转（画面冻结）
    out[a:a + len(ts)] += ts
    rw = rewind(tape, 26.2, 2.4, v0=0.3, v1=4.8, curve=1.8)            # 28.9–31.3 倒带（与画面上年份倒转同时）
    m = len(rw)
    p = np.arange(m) / m
    env = np.clip(p / 0.07, 0, 1) * (0.55 + 0.9 * p) * np.clip((1 - p) / 0.06, 0, 1)
    rw = highpass(lowpass(rw * env[:, None], 7000.0), 180.0)
    s = ns(28.9)
    out[s:s + m] += rw * db_to_amp(-4.0)
    del tape
    out += level_sections(pass_story())
    t = np.arange(N) / SR
    out *= gate(N, [(193.72, 194.0), (347.9, 348.0)])[:, None]         # 屏息：内爆 → 爆发；冲进数据之城前的一个空拍
    out *= np.clip((DUR - t) / 2.5, 0, 1)[:, None] ** 1.5              # 片尾淡出
    print(f"整片配乐渲染完成：{time.time() - t0:.1f}s")
    return out[: ns(DUR)]


if __name__ == "__main__":
    from inst import limit
    from sfx.master import save
    mm = render()
    mm = limit(mm / (np.abs(mm).max() + 1e-9) * 0.9, -1.0)
    OUT.mkdir(exist_ok=True)
    save(OUT / "film_music.wav", mm)
