"""混音体检图：各轨的短时响度曲线（标出关键时刻）+ 总混音频谱图。Claude 听不见，靠这张图检查结构。

    python inspect_mix.py             → out/film_inspect.png
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt   # noqa: E402
import numpy as np                # noqa: E402
from scipy import signal          # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from sfx.core import SR           # noqa: E402
from sfx.master import load       # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "out"


def env_db(x, win=0.05):
    m = x.mean(axis=1) if x.ndim > 1 else x
    k = int(win * SR)
    n = len(m) // k
    r = np.sqrt(np.mean(m[: n * k].reshape(n, k) ** 2, axis=1) + 1e-12)
    return np.arange(n) * win, 20 * np.log10(r)


def main(tag="film"):
    pre = f"{tag}_"
    mix = load(OUT / f"{pre}mix.wav")
    mus = load(OUT / f"{pre}music.wav")
    sfx = load(OUT / f"{pre}sfx_track.wav")
    cues = json.loads((OUT / f"{pre}cues.json").read_text(encoding="utf-8"))["cues"]
    fig, ax = plt.subplots(3, 1, figsize=(22, 13), sharex=True, gridspec_kw={"height_ratios": [1.2, 1.2, 1.6]})
    for x, lab, c in [(mus, "music", "#4a90d9"), (sfx, "sfx", "#e08a3c"), (mix, "mix", "#222")]:
        t, d = env_db(x)
        ax[0].plot(t, d, lw=0.9 if lab != "mix" else 1.3, label=lab, color=c)
    ax[0].set_ylim(-70, 0)
    ax[0].legend(loc="upper left")
    ax[0].set_ylabel("RMS dBFS (50 ms)")
    for c in cues:
        if c["type"] == "heart":
            ax[0].axvline(c["t"], color="#c33", lw=0.4, alpha=0.5)
        else:
            ax[0].axvline(c["t"], color="#999", lw=0.5, ls=":")
            if len(mix) / SR < 60:
                ax[0].text(c["t"], -68, c["type"], rotation=90, fontsize=7, va="bottom")
    # 频段能量：低 / 中 / 高
    m = mix.mean(axis=1)
    for lo, hi, c in [(20, 120, "#6a3d9a"), (120, 2000, "#33a02c"), (2000, 16000, "#e31a1c")]:
        sos = signal.butter(4, [lo, hi], "bandpass", fs=SR, output="sos")
        t, d = env_db(signal.sosfilt(sos, m))
        ax[1].plot(t, d, lw=0.9, color=c, label=f"{lo}-{hi} Hz")
    ax[1].set_ylim(-70, 0)
    ax[1].legend(loc="upper left")
    ax[1].set_ylabel("band dBFS")
    f, tt, S = signal.spectrogram(m, SR, nperseg=2048, noverlap=1536)
    ax[2].pcolormesh(tt, f, 10 * np.log10(S + 1e-12), shading="auto", cmap="magma", vmin=-110, vmax=-30)
    ax[2].set_yscale("symlog", linthresh=200)
    ax[2].set_ylim(30, 20000)
    ax[2].set_xlabel("s")
    step = 1.0 if len(m) / SR < 60 else 8.0
    for a in ax:
        a.set_xticks(np.arange(0, len(m) / SR + 0.01, step))
        a.grid(alpha=0.25)
    plt.tight_layout()
    dst = OUT / f"{pre}inspect.png"
    plt.savefig(dst, dpi=80)
    print(dst)


if __name__ == "__main__":
    main(*(sys.argv[1:] or ["film"]))
