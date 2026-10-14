"""试听页：out/index.html。A/B 对比（朴素基线 vs 物理建模）、响度匹配播放、逐条打分并导出给 Claude。"""
from __future__ import annotations

import html
import json
from pathlib import Path

REF_LUFS = -23.0  # 响度匹配的参考电平：比它响的文件播放时自动调小音量（只衰减，不放大）


def _collect(out: Path) -> dict[str, list[dict]]:
    items: dict[str, list[dict]] = {}
    for js in sorted(out.glob("*/*.json")):
        wav = js.with_suffix(".wav")
        if not wav.exists():
            continue
        m = json.loads(js.read_text(encoding="utf-8"))
        loud = m.get("积分响度_LUFS") if m.get("时长_s", 0) >= 3 else m.get("最大瞬时响度_LUFS")
        items.setdefault(m.get("_配方", js.parent.name), []).append(dict(
            wav=wav.relative_to(out).as_posix(),
            png=js.with_suffix(".png").relative_to(out).as_posix() if js.with_suffix(".png").exists() else None,
            params=m.get("_参数", {}), loud=loud, m=m))
    return items


def _player(it: dict) -> str:
    m = it["m"]
    vol = min(1.0, 10 ** ((REF_LUFS - it["loud"]) / 20)) if it["loud"] is not None else 1.0
    params = ", ".join(f"{k}={v}" for k, v in it["params"].items())
    qc = m.get("QC") or []
    qc_html = "".join(f'<li class="warn">{html.escape(w)}</li>' for w in qc) or '<li class="ok">QC 通过</li>'
    stats = f'{m.get("时长_s")} s · 重心 {m.get("频谱重心_Hz")} Hz · 响度 {it["loud"]} LUFS'
    img = (f'<a href="{it["png"]}" target="_blank"><img loading="lazy" src="{it["png"]}" alt="分析图"></a>'
           if it["png"] else "")
    key = html.escape(it["wav"])
    stars = "".join(f'<button data-v="{i}">{i}</button>' for i in range(1, 6))
    return f"""
    <div class="variant" data-key="{key}">
      <div class="vhead"><code>{html.escape(params)}</code><span class="stats">{stats}</span></div>
      <audio controls preload="none" src="{it['wav']}" data-vol="{vol:.4f}"></audio>
      <div class="rate"><span>真实度</span>{stars}<input placeholder="听感备注：太亮/太闷/像塑料/节奏太规则…"></div>
      <ul class="qc">{qc_html}</ul>
      {img}
    </div>"""


def build(out: Path) -> Path:
    from .recipes import load_all
    reg = load_all()
    items = _collect(out)
    ab, cards = [], []
    for name in sorted(items, key=lambda k: (k.startswith("naive_"), k)):
        r = reg.get(name, {})
        if name.startswith("naive_"):
            continue
        desc = html.escape(r.get("doc", "")).replace("\n", "<br>")
        body = "".join(_player(it) for it in items[name])
        cards.append(f'<section class="card"><h3>{html.escape(name)} <small>{html.escape("/".join(r.get("tags", ())))}</small></h3>'
                     f'<p class="doc">{desc}</p>{body}</section>')
        base = r.get("baseline")
        if base and base in items:
            ab.append(f'<section class="card ab"><h3>{html.escape(r.get("title", name))}</h3><div class="cols">'
                      f'<div><h4>A · 朴素合成（直接画波形）</h4>{_player(items[base][0])}</div>'
                      f'<div><h4>B · 物理建模（本项目）</h4>{_player(items[name][0])}</div></div></section>')

    page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>程序化音效试听</title>
<style>
:root {{ --bg:#f6f5f2; --fg:#1d1d1f; --card:#fff; --mute:#6b6b70; --line:#e2e0da; --accent:#2f6fde; --warn:#b3261e; --ok:#1e7d3a; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#141416; --fg:#ececef; --card:#1d1d21; --mute:#9a9aa2; --line:#2e2e34; --accent:#7aa7ff; --warn:#ff8a80; --ok:#7bd88f; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 "Microsoft YaHei","PingFang SC",system-ui,sans-serif; }}
main {{ max-width:1180px; margin:0 auto; padding:24px 16px 80px; }}
h1 {{ font-size:24px; margin:0 0 4px; }} h2 {{ font-size:19px; margin:36px 0 12px; }}
h3 {{ font-size:17px; margin:0 0 6px; }} h3 small {{ color:var(--mute); font-weight:normal; font-size:13px; }}
h4 {{ margin:0 0 8px; font-size:14px; color:var(--mute); }}
.lead {{ color:var(--mute); margin:0 0 16px; }}
.bar {{ position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line); padding:10px 0; display:flex; gap:12px; flex-wrap:wrap; align-items:center; }}
button {{ font:inherit; border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:6px; padding:3px 10px; cursor:pointer; }}
button.on {{ background:var(--accent); color:#fff; border-color:var(--accent); }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin:12px 0; }}
.cols {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
@media (max-width:760px) {{ .cols {{ grid-template-columns:1fr; }} }}
.doc {{ color:var(--mute); font-size:13.5px; margin:0 0 8px; }}
.variant {{ border-top:1px dashed var(--line); padding-top:10px; margin-top:10px; }}
.vhead {{ display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; font-size:13px; }}
.stats {{ color:var(--mute); }}
audio {{ width:100%; margin:6px 0; }}
.rate {{ display:flex; gap:6px; align-items:center; flex-wrap:wrap; font-size:13px; }}
.rate input {{ flex:1; min-width:180px; font:inherit; padding:3px 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--fg); }}
.qc {{ margin:6px 0; padding-left:18px; font-size:13px; }} .warn {{ color:var(--warn); }} .ok {{ color:var(--ok); }}
img {{ width:100%; border-radius:6px; border:1px solid var(--line); margin-top:4px; }}
textarea {{ width:100%; height:160px; font:12px/1.4 Consolas,monospace; }}
</style></head><body><main>
<h1>程序化音效试听</h1>
<p class="lead">全部由代码实时合成，没有使用任何录音素材。建议戴耳机。点每条下面的 1~5 分给"真实度"打分，写一句听感备注，最后点"导出评分"把结果发给 Claude。</p>
<div class="bar">
  <label><input type="checkbox" id="match" checked> 响度匹配（A/B 对比更公平）</label>
  <button id="export">导出评分</button><button id="clear">清空评分</button><span id="count" class="stats"></span>
</div>
<textarea id="dump" hidden readonly></textarea>
<h2>A/B 对比：朴素合成 vs 物理建模</h2>
{''.join(ab) or '<p class="lead">（还没有渲染基线，运行 python -m sfx render --all）</p>'}
<h2>全部音效</h2>
{''.join(cards)}
</main>
<script>
const KEY = "sfx_ratings_v1";
let db = {{}};
try {{ db = JSON.parse(localStorage.getItem(KEY) || "{{}}"); }} catch (e) {{}}
const save = () => {{ try {{ localStorage.setItem(KEY, JSON.stringify(db)); }} catch (e) {{}} count(); }};
const count = () => {{ document.getElementById("count").textContent = "已评分 " + Object.keys(db).filter(k => db[k].score).length + " 条"; }};
document.querySelectorAll(".variant").forEach(v => {{
  const k = v.dataset.key, r = db[k] || {{}};
  const btns = v.querySelectorAll(".rate button"), inp = v.querySelector(".rate input");
  const paint = () => btns.forEach(b => b.classList.toggle("on", +b.dataset.v === (db[k] || {{}}).score));
  btns.forEach(b => b.onclick = () => {{ db[k] = {{...(db[k] || {{}}), score: +b.dataset.v}}; paint(); save(); }});
  inp.value = r.note || "";
  inp.oninput = () => {{ db[k] = {{...(db[k] || {{}}), note: inp.value}}; save(); }};
  paint();
}});
const applyVol = () => {{
  const on = document.getElementById("match").checked;
  document.querySelectorAll("audio").forEach(a => a.volume = on ? +a.dataset.vol : 1);
}};
document.getElementById("match").onchange = applyVol; applyVol();
document.addEventListener("play", e => {{ document.querySelectorAll("audio").forEach(a => {{ if (a !== e.target) a.pause(); }}); }}, true);
document.getElementById("export").onclick = async () => {{
  const txt = JSON.stringify(db, null, 1), ta = document.getElementById("dump");
  ta.hidden = false; ta.value = txt; ta.select();
  try {{ await navigator.clipboard.writeText(txt); ta.value = "（已复制到剪贴板，直接粘贴给 Claude 即可）\\n" + txt; }} catch (e) {{}}
}};
document.getElementById("clear").onclick = () => {{ if (confirm("清空全部评分？")) {{ db = {{}}; save(); location.reload(); }} }};
count();
</script></body></html>"""
    path = out / "index.html"
    path.write_text(page, encoding="utf-8")
    return path
