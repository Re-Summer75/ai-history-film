// 质检：逐帧扫描画面上所有文字（字幕、大数字、标注、卡片），找出互相重叠、出画、一闪而过、从没露面的文字。
// 用法：probe.py "await window.qaText(起点秒, 终点秒, 步长秒)"（main.js 里挂载）
export async function qaText(t0 = 0, t1 = window.DURATION, step = 0.2) {
  const R = document.createRange();
  const op = (e) => { const v = parseFloat(e.style.opacity); return Number.isFinite(v) ? v : 1; };
  const sel = ['#scenes .big', '#scenes .ans', '#scenes .rl-card', '#scenes .rl-rank', '#scenes .chips',
    '#hud .tg', '#hud .co', '#hud .ro', '#hud .chap', '#hud .bars'];
  const els = [...new Set(sel.flatMap((s) => [...document.querySelectorAll(s)]))];
  const name = (e) => `${e.className.split(' ').slice(0, 3).join('.')}「${(e.textContent || '').trim().slice(0, 18)}」`;
  const vis = (e) => {
    if (e.style.display === 'none') return 0;
    const sc = e.closest('.scene');
    if (sc && sc.style.visibility === 'hidden') return 0;
    let a = op(e);
    for (let p = e.parentElement; p && p.id !== 'stage'; p = p.parentElement) { if (p.style.display === 'none') return 0; a *= op(p); }
    if (e.classList.contains('big') && e.children.length) {      // 逐字入场的字幕：取几个字里最大的透明度
      let m = 0; const cs = e.children; for (const k of [0, cs.length >> 1, cs.length - 1]) m = Math.max(m, op(cs[k])); a *= m;
    }
    return a;
  };
  const box = (e) => {
    if (e.classList.contains('big') || e.classList.contains('tg')) { R.selectNodeContents(e); return R.getBoundingClientRect(); }
    return e.getBoundingClientRect();
  };
  const st = document.getElementById('stage').getBoundingClientRect(), kx = 1920 / st.width, ky = 1080 / st.height;
  const life = new Map(), overl = new Map(), off = new Map();
  for (let T = t0; T <= t1 + 1e-6; T += step) {
    await window.renderFrame(Math.round(T * 60));
    const on = [];
    for (const e of els) {
      const a = vis(e);
      if (a < 0.3) continue;
      const r = box(e);
      if (r.width < 2 || r.height < 2) continue;
      const q = { e, a, x0: (r.left - st.left) * kx, y0: (r.top - st.top) * ky, x1: (r.right - st.left) * kx, y1: (r.bottom - st.top) * ky };
      on.push(q);
      const L = life.get(e) || { first: T, last: T, n: 0 }; L.last = T; L.n++; life.set(e, L);
      if (q.x0 < -6 || q.x1 > 1926 || q.y0 < -6 || q.y1 > 1086) {
        const k = name(e), o = off.get(k) || { t0: T, t1: T, box: [q.x0, q.y0, q.x1, q.y1].map(Math.round) }; o.t1 = T; off.set(k, o);
      }
    }
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
      const A = on[i], B = on[j];
      if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
      const w = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), h = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      if (w <= 2 || h <= 2) continue;
      const ar = (w * h) / Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
      if (ar < 0.08) continue;
      const k = `${name(A.e)} × ${name(B.e)}`;
      const o = overl.get(k) || { t0: T, t1: T, max: 0 }; o.t1 = T; o.max = Math.max(o.max, ar); overl.set(k, o);
    }
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    overlaps: [...overl].map(([k, o]) => ({ at: r2(o.t0), to: r2(o.t1), ratio: r2(o.max), pair: k })).sort((a, b) => a.at - b.at),
    offscreen: [...off].map(([k, o]) => ({ at: r2(o.t0), to: r2(o.t1), box: o.box, el: k })).sort((a, b) => a.at - b.at),
    brief: [...life].filter(([, L]) => L.last - L.first + step < 0.6).map(([e, L]) => ({ at: r2(L.first), dur: r2(L.last - L.first + step), el: name(e) })).sort((a, b) => a.at - b.at),
    never: els.filter((e) => !life.has(e) && (e.textContent || '').trim()).map(name),
  };
}
