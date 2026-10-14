"""分析工具 —— Claude 的"耳朵"。

Claude 听不见音频，但能读数字、能看图。所以每次生成后都用这里的工具：
1. analyze()  算出客观指标（响度、起音/衰减时间、频谱重心、谱峰、节奏规律性……）
2. qc()       自动找出"假"和"脏"的征兆（削波、爆音、过于静态、节奏机械、频谱过于简单……）
3. plot()     画出 波形+包络 / 对数频率频谱图 / 长时平均谱，Claude 用 Read 工具看图判断
4. compare()  生成结果与真实录音并排对比，找差距
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy import signal

from .core import SR, amp_to_db, to_mono, to_stereo

BANDS = [("超低 <60", 0, 60), ("低 60-250", 60, 250), ("中低 250-1k", 250, 1000),
         ("中 1k-4k", 1000, 4000), ("高 4k-10k", 4000, 10000), ("极高 >10k", 10000, 24000)]

# BS.1770 K 计权（48 kHz 系数）
_K_SOS = np.array([
    [1.53512485958697, -2.69169618940638, 1.19839281085285, 1.0, -1.69065929318241, 0.73248077421585],
    [1.0, -2.0, 1.0, 1.0, -1.99004745483398, 0.99007225036621],
])


def _k_power(x: np.ndarray, sr: int) -> np.ndarray:
    assert sr == 48000, "响度计算按 48 kHz 系数实现，请先重采样"
    y = signal.sosfilt(_K_SOS, to_stereo(x) if x.ndim == 2 else x[:, None], axis=0)
    return np.sum(y ** 2, axis=1)   # 各声道功率之和（逐采样）


def integrated_loudness(x: np.ndarray, sr: int = SR) -> float:
    """BS.1770 积分响度（400 ms 块、75% 重叠、-70 LUFS 绝对门限 + -10 LU 相对门限）。短于 400 ms 时按整体均方计算。"""
    p = _k_power(x, sr)
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    if len(p) < blk:
        return float(-0.691 + 10 * np.log10(np.mean(p) + 1e-20))
    c = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, len(p) - blk + 1, hop)
    z = (c[starts + blk] - c[starts]) / blk
    lj = -0.691 + 10 * np.log10(z + 1e-20)
    z1 = z[lj > -70]
    if len(z1) == 0:
        return float("-inf")
    gate = -0.691 + 10 * np.log10(np.mean(z1)) - 10
    z2 = z[(lj > -70) & (lj > gate)]
    return float(-0.691 + 10 * np.log10(np.mean(z2)))


def momentary_max(x: np.ndarray, sr: int = SR) -> float:
    """最大瞬时响度（400 ms 滑动窗），适合评估短音效有多"响"。"""
    p = _k_power(x, sr)
    blk = int(0.4 * sr)
    if len(p) < blk:
        p = np.pad(p, (0, blk - len(p)))
    c = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, len(p) - blk + 1, int(0.01 * sr))
    return float(-0.691 + 10 * np.log10(np.max((c[starts + blk] - c[starts]) / blk) + 1e-20))


def envelope_db(x: np.ndarray, win: float = 0.005, hop: float = 0.001, sr: int = SR):
    """RMS 包络（dB），返回 (时间, dB)。"""
    p = to_mono(x) ** 2 if x.ndim == 1 else np.mean(x ** 2, axis=1)
    w, h = max(1, int(win * sr)), max(1, int(hop * sr))
    c = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, max(1, len(p) - w + 1), h)
    ms = (c[np.minimum(starts + w, len(p))] - c[starts]) / w
    return (starts + w / 2) / sr, 10 * np.log10(ms + 1e-20)


def _ltas(mono: np.ndarray, sr: int):
    nper = int(min(8192, 2 ** np.floor(np.log2(max(len(mono), 256)))))
    f, P = signal.welch(mono, sr, nperseg=nper, noverlap=nper * 3 // 4, window="hann")
    return f, P


def _smooth_octave(f, P_db, frac=24):
    """按 1/frac 倍频程平滑谱（dB 域）。"""
    lf = np.log2(np.maximum(f, 1e-3))
    half = 0.5 / frac
    c = np.concatenate([[0.0], np.cumsum(P_db)])
    lo = np.searchsorted(lf, lf - half)
    hi = np.searchsorted(lf, lf + half, side="right")
    return (c[hi] - c[lo]) / np.maximum(hi - lo, 1)


def _centroid(f, P):
    band = (f >= 20) & (f <= 20000)
    return float(np.sum(f[band] * P[band]) / (np.sum(P[band]) + 1e-30))


def analyze(x: np.ndarray, sr: int = SR) -> dict:
    x = np.asarray(x, dtype=float)
    mono = to_mono(x)
    n = len(mono)
    m: dict = {"时长_s": round(n / sr, 3), "声道": 1 if x.ndim == 1 else x.shape[1]}
    pk = float(np.max(np.abs(x))) if n else 0.0
    if pk == 0:
        m["QC"] = ["全是静音"]
        return m
    from .dynamics import true_peak
    m["峰值_dBFS"] = round(float(amp_to_db(pk)), 2)
    m["真峰值_dBTP"] = round(float(amp_to_db(true_peak(x))), 2)
    rms = float(np.sqrt(np.mean(x ** 2)))
    m["RMS_dBFS"] = round(float(amp_to_db(rms)), 2)
    m["峰均比_dB"] = round(m["峰值_dBFS"] - m["RMS_dBFS"], 2)
    m["积分响度_LUFS"] = round(integrated_loudness(x, sr), 2) if n >= 0.4 * sr else None
    m["最大瞬时响度_LUFS"] = round(momentary_max(x, sr), 2)
    m["直流偏移"] = round(float(np.max(np.abs(np.mean(x, axis=0)))), 5)
    m["削波采样数"] = int(np.sum(np.abs(x) >= 0.999))
    m["开头跳变"] = round(float(np.max(np.abs(x[0]))) / pk, 3)
    m["结尾跳变"] = round(float(np.max(np.abs(x[-1]))) / pk, 3)

    t, env = envelope_db(x, sr=sr)
    emax, ipk = float(env.max()), int(env.argmax())
    active = np.nonzero(env > emax - 60)[0]
    m["开头静音_s"] = round(float(t[active[0]]), 3)
    m["结尾静音_s"] = round(float(n / sr - t[active[-1]]), 3)
    on = np.nonzero(env[: ipk + 1] >= emax - 30)[0][0]
    win = env[on: on + max(2, int(0.1 / (t[1] - t[0])) if len(t) > 1 else 2)]
    m["起音_ms"] = round(float(np.argmax(win) * (t[1] - t[0] if len(t) > 1 else 0) * 1000), 1)  # 第一个事件的起音
    for d in (20, 40):
        above = np.nonzero(env >= emax - d)[0]
        m[f"衰减到-{d}dB_ms"] = round(float((t[above[-1]] - t[ipk]) * 1000), 1)
    act = env[env > emax - 40]
    m["包络起伏_dB"] = round(float(np.std(act)), 2) if n > sr else None

    f, P = _ltas(mono, sr)
    Pdb = 10 * np.log10(P + 1e-30)
    m["频谱重心_Hz"] = round(_centroid(f, P))
    cum = np.cumsum(P) / np.sum(P)
    m["85%能量以下_Hz"] = round(float(f[np.searchsorted(cum, 0.85)]))
    band = (f >= 50) & (f <= 16000)
    m["频谱平坦度"] = round(float(np.exp(np.mean(np.log(P[band] + 1e-30))) / (np.mean(P[band]) + 1e-30)), 4)
    tot = np.sum(P)
    m["频段能量%"] = {name: round(float(np.sum(P[(f >= lo) & (f < hi)]) / tot * 100), 1) for name, lo, hi in BANDS}
    sm = _smooth_octave(f, Pdb, 48)
    pk_idx, props = signal.find_peaks(sm, prominence=6)
    pk_idx = pk_idx[(f[pk_idx] >= 30) & (f[pk_idx] <= 20000)]
    top = sorted(pk_idx, key=lambda i: -sm[i])[:10]
    m["主要谱峰_Hz"] = [round(float(f[i])) for i in sorted(top)]

    # 亮度随时间变化（相对能量峰值）：真实撞击声衰减时越来越暗（高频先消失）
    nfft = 1024
    ff, tt, Z = signal.stft(mono, sr, nperseg=nfft, noverlap=nfft * 3 // 4)
    S = np.abs(Z) ** 2
    fe = S.sum(axis=0)
    good = fe > fe.max() * 1e-4
    cen = (ff[:, None] * S).sum(axis=0) / (fe + 1e-30)
    fe_db = 10 * np.log10(fe + 1e-30) - 10 * np.log10(fe.max() + 1e-30)
    ipk_f = int(np.argmax(fe_db))
    hop_s = (nfft // 4) / sr
    early = np.arange(ipk_f, min(len(fe_db), ipk_f + int(0.05 / hop_s) + 1))
    late = np.nonzero((np.arange(len(fe_db)) > ipk_f) & (fe_db < -25) & (fe_db > -45))[0]
    if len(early) and len(late) >= 2:
        m["重心_峰值后_Hz"] = round(float(np.median(cen[early])))
        m["重心_衰减段_Hz"] = round(float(np.median(cen[late])))
    flat_t = np.exp(np.mean(np.log(S[(ff >= 50) & (ff <= 16000)] + 1e-30), axis=0)) / (S[(ff >= 50) & (ff <= 16000)].mean(axis=0) + 1e-30)
    m["逐帧平坦度中位数"] = round(float(np.median(flat_t[good])), 4) if good.any() else None

    # 起音检测与节奏规律性
    flux = np.maximum(np.diff(np.log1p(1e4 * S / (S.max() + 1e-30)), axis=1), 0).sum(axis=0)
    if len(flux) > 3:
        thr = np.median(flux) + 3 * np.median(np.abs(flux - np.median(flux))) + 0.05 * flux.max()
        dist = max(1, int(0.03 * sr / (nfft // 4)))
        ons, _ = signal.find_peaks(flux, height=thr, distance=dist)
        ot = tt[ons + 1]
        m["起音次数"] = int(len(ot))
        if len(ot) >= 3:
            iv = np.diff(ot)
            m["起音间隔变异系数"] = round(float(np.std(iv) / (np.mean(iv) + 1e-9)), 3)

    if x.ndim == 2 and x.shape[1] == 2:
        L, R = x[:, 0], x[:, 1]
        m["左右相关"] = round(float(np.corrcoef(L, R)[0, 1]), 3) if np.std(L) > 0 and np.std(R) > 0 else 1.0
    m["QC"] = qc(m)
    return m


def qc(m: dict) -> list[str]:
    """常见问题的自动检查。每条都是"不真实"或"不干净"的具体征兆。"""
    w = []
    if m.get("削波采样数", 0) > 0:
        w.append(f"削波 {m['削波采样数']} 个采样（失真）")
    if m.get("真峰值_dBTP", -99) > -0.1:
        w.append("真峰值过高，播放时可能削波")
    if m.get("直流偏移", 0) > 0.002:
        w.append("有直流偏移")
    if m.get("开头跳变", 0) > 0.1:
        w.append("开头不是从零开始（会有'咔'声）")
    if m.get("结尾跳变", 0) > 0.01:
        w.append("结尾被截断（会有'咔'声），需要淡出")
    if m.get("峰值_dBFS", 0) < -24:
        w.append("整体音量过低")
    if m.get("开头静音_s", 0) > 0.1:
        w.append("开头有多余静音")
    if m.get("结尾静音_s", 0) > 0.6:
        w.append("结尾有多余静音")
    bands = m.get("频段能量%", {})
    if bands.get("极高 >10k", 0) > 25:
        w.append("10 kHz 以上能量过多（刺耳/嘶嘶声，可能有混叠）")
    if bands.get("超低 <60", 0) > 45:
        w.append("60 Hz 以下能量过多（发闷或有低频漂移）")
    mechanical = m.get("起音次数", 0) <= 2 or (m.get("起音间隔变异系数") is not None and m["起音间隔变异系数"] < 0.02)
    if m.get("频谱平坦度", 1) < 0.005 and len(m.get("主要谱峰_Hz", [])) <= 2 and mechanical:
        w.append("频谱过于简单（只有一两个纯音），听起来像电子合成音")
    if m.get("包络起伏_dB") is not None and m["包络起伏_dB"] < 1.0 and m.get("时长_s", 0) > 2:
        w.append("长音过于平稳，缺少自然起伏")
    if m.get("起音间隔变异系数") is not None and m["起音间隔变异系数"] < 0.02 and m.get("起音次数", 0) >= 4:
        w.append("节奏完全均匀，像机器（真人/自然事件有随机性）")
    if m.get("左右相关", 0) > 0.995 and m.get("声道", 1) == 2:
        w.append("立体声实为单声道（缺少空间感）")
    b0, b1 = m.get("重心_峰值后_Hz"), m.get("重心_衰减段_Hz")
    if b0 and b1 and b1 > b0 * 1.3 and m.get("时长_s", 99) <= 4 and m.get("起音次数", 0) <= 3:
        w.append("衰减段比峰值处更亮（真实撞击声会越来越暗）")
    return w


def summary_line(m: dict) -> str:
    keys = ["时长_s", "真峰值_dBTP", "积分响度_LUFS", "最大瞬时响度_LUFS", "起音_ms", "衰减到-40dB_ms", "频谱重心_Hz"]
    s = "  ".join(f"{k}={m.get(k)}" for k in keys if m.get(k) is not None)
    qcs = m.get("QC") or []
    return s + ("\n    [!] " + "；".join(qcs) if qcs else "\n    [OK] QC 通过")


# ---------------------------------------------------------------- 画图

def _setup_mpl():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False
    return plt


def _stft_db(mono, sr):
    dur = len(mono) / sr
    nfft = 2048 if dur <= 4 else 4096
    hop = max(nfft // 8, int(len(mono) / 1500))
    f, t, Z = signal.stft(mono, sr, nperseg=nfft, noverlap=max(0, nfft - hop))
    return f, t, 20 * np.log10(np.abs(Z) + 1e-12)


def _spectrogram(ax, mono, sr, vmax=None, dyn=90):
    f, t, S = _stft_db(mono, sr)
    vmax = S.max() if vmax is None else vmax
    sel = f >= 20
    im = ax.pcolormesh(t, f[sel], S[sel], shading="auto", cmap="magma", vmin=vmax - dyn, vmax=vmax)
    ax.set_yscale("log")
    ax.set_ylim(20, sr / 2)
    ax.set_yticks([50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000])
    ax.set_yticklabels(["50", "100", "200", "500", "1k", "2k", "5k", "10k", "20k"])
    ax.set_ylabel("频率 Hz")
    return im, vmax


def plot(x: np.ndarray, path, title: str = "", metrics: dict | None = None, sr: int = SR) -> Path:
    plt = _setup_mpl()
    x = np.asarray(x, dtype=float)
    m = metrics or analyze(x, sr)
    mono = to_mono(x)
    t_all = np.arange(len(mono)) / sr

    fig = plt.figure(figsize=(16, 10), dpi=100)
    gs = fig.add_gridspec(3, 2, width_ratios=[3.2, 1], height_ratios=[1, 1.6, 1.1], hspace=0.32, wspace=0.12)
    ax_w, ax_s, ax_l = fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[1, 0]), fig.add_subplot(gs[2, 0])
    ax_t = fig.add_subplot(gs[:, 1])

    chans = [x] if x.ndim == 1 else [x[:, c] for c in range(x.shape[1])]
    step = max(1, len(mono) // 3000)
    for c, (ch, col) in enumerate(zip(chans, ["#4a90d9", "#e07b39"])):
        k = len(ch) // step * step
        blk = ch[:k].reshape(-1, step)
        tb = t_all[:k:step]
        ax_w.fill_between(tb, blk.min(axis=1), blk.max(axis=1), color=col, alpha=0.55, lw=0, label="LR"[c] if len(chans) > 1 else None)
    ax_w.set_xlim(0, t_all[-1] if len(t_all) else 1)
    ax_w.set_ylim(-1.05, 1.05)
    ax_w.set_ylabel("振幅")
    ax_w.set_title(title or "波形与包络", fontsize=13, loc="left")
    te, env = envelope_db(x, sr=sr)
    ax2 = ax_w.twinx()
    ax2.plot(te, env, color="#2e7d32", lw=1.0)
    ax2.set_ylim(env.max() - 70, env.max() + 3)
    ax2.set_ylabel("RMS 包络 dB", color="#2e7d32")

    im, _ = _spectrogram(ax_s, mono, sr)
    ax_s.set_xlim(0, t_all[-1] if len(t_all) else 1)
    ax_s.set_xlabel("时间 s")
    fig.colorbar(im, ax=ax_s, pad=0.01, fraction=0.03, label="dB")

    f, P = _ltas(mono, sr)
    Pdb = 10 * np.log10(P + 1e-30)
    sm = _smooth_octave(f, Pdb, 48)
    sel = f >= 20
    ax_l.semilogx(f[sel], sm[sel], color="#6a1b9a", lw=1.2)
    ax_l.set_xlim(20, sr / 2)
    ax_l.set_ylim(sm[sel].max() - 80, sm[sel].max() + 5)
    ax_l.set_xticks([50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000])
    ax_l.set_xticklabels(["50", "100", "200", "500", "1k", "2k", "5k", "10k", "20k"])
    ax_l.set_xlabel("频率 Hz（长时平均谱，1/48 倍频程平滑）")
    ax_l.set_ylabel("dB")
    ax_l.grid(True, which="both", alpha=0.25)
    for fp in m.get("主要谱峰_Hz", []):
        i = np.searchsorted(f, fp)
        ax_l.annotate(f"{fp}", (fp, sm[i]), textcoords="offset points", xytext=(0, 6), ha="center", fontsize=8, color="#6a1b9a")

    ax_t.axis("off")
    lines = []
    for k, v in m.items():
        if k in ("QC", "频段能量%", "主要谱峰_Hz"):
            continue
        lines.append(f"{k}: {v}")
    lines.append("")
    lines.append("频段能量%:")
    for k, v in m.get("频段能量%", {}).items():
        lines.append(f"  {k}: {v}")
    lines.append("")
    lines.append("QC:")
    lines += [f"  [!] {w}" for w in m.get("QC", [])] or ["  通过"]
    ax_t.text(0.0, 1.0, "\n".join(lines), va="top", ha="left", fontsize=10.5, family="sans-serif", transform=ax_t.transAxes)

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


def compare(items: list[tuple[str, np.ndarray]], path, sr: int = SR) -> Path:
    """多个音频并排对比（例如：生成结果 vs 真实录音）。同一色标，便于直接比较频谱图。"""
    plt = _setup_mpl()
    k = len(items)
    fig = plt.figure(figsize=(16, 4.2 * k + 5), dpi=100)
    gs = fig.add_gridspec(k + 1, 2, height_ratios=[1.3] * k + [1.4], hspace=0.4)
    monos = [to_mono(np.asarray(x, dtype=float)) for _, x in items]
    vmax_db = max(float(_stft_db(mo, sr)[2].max()) for mo in monos)  # 统一色标
    tmax = max(len(mo) for mo in monos) / sr
    ms = []
    for i, ((label, x), mo) in enumerate(zip(items, monos)):
        ax = fig.add_subplot(gs[i, :])
        _spectrogram(ax, mo, sr, vmax=vmax_db)
        ax.set_xlim(0, tmax)
        ax.set_title(label, loc="left", fontsize=12)
        ms.append(analyze(x, sr))
    ax_l = fig.add_subplot(gs[k, 0])
    ax_e = fig.add_subplot(gs[k, 1])
    colors = ["#1565c0", "#c62828", "#2e7d32", "#6a1b9a"]
    for (label, x), mo, col in zip(items, monos, colors):
        f, P = _ltas(mo, sr)
        sm = _smooth_octave(f, 10 * np.log10(P + 1e-30), 24)
        sel = f >= 20
        ax_l.semilogx(f[sel], sm[sel] - sm[sel].max(), color=col, lw=1.2, label=label)
        te, env = envelope_db(x, sr=sr)
        i0 = int(np.argmax(env > env.max() - 30))
        ax_e.plot(te[i0:] - te[i0], env[i0:] - env.max(), color=col, lw=1.0, label=label)
    ax_l.set_xlim(20, sr / 2)
    ax_l.set_ylim(-70, 3)
    ax_l.set_title("长时平均谱（各自归一）", loc="left")
    ax_l.grid(True, which="both", alpha=0.25)
    ax_l.legend(fontsize=9)
    ax_e.set_ylim(-70, 3)
    ax_e.set_title("RMS 包络（起音对齐，dB）", loc="left")
    ax_e.grid(True, alpha=0.25)
    ax_e.legend(fontsize=9)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    keys = ["时长_s", "起音_ms", "衰减到-20dB_ms", "衰减到-40dB_ms", "频谱重心_Hz", "重心_峰值后_Hz", "重心_衰减段_Hz",
            "频谱平坦度", "包络起伏_dB", "起音次数", "起音间隔变异系数", "左右相关"]
    print("指标对比：")
    print("  " + " | ".join(["指标"] + [lab for lab, _ in items]))
    for key in keys:
        print("  " + " | ".join([key] + [str(mm.get(key)) for mm in ms]))
    for (lab, _), mm in zip(items, ms):
        print(f"  {lab} 频段能量%: {mm.get('频段能量%')}")
        print(f"  {lab} 主要谱峰: {mm.get('主要谱峰_Hz')}")
    return path
