// 分幕时间重排（按内容加长）：每一幕照旧用自己原来的时间写，登记完再统一换算成成片时间。
// 换算 = 整体平移 ofs（前面各幕一共加长了多少）+ 本幕内若干"停留窗口"：
//   窗口 [a, b, extra] 在成片里变长 extra 秒；窗口两端各有一小段平滑过渡，速度连续变化，不会突然一顿。
// 窗口只放在内容已经出完、停在那里等观众看清的地方（数字滚完、卡片落定、字幕出齐之后），
// 入场动画、镜头冲刺、重击都在窗口之外，照原速播放——不是整体放慢。
export function makeWarp(ofs = 0, holds = []) {
  const H = holds.map(([a, b, extra]) => {
    const r = Math.min(0.3, (b - a) / 3);
    return { a, b, r, extra, k: extra / (b - a - r) };
  }).sort((p, q) => p.a - q.a);
  const total = H.reduce((s, h) => s + h.extra, 0);
  const S1 = (t) => t * t * t - (t * t * t * t) / 2;        // ∫₀ᵗ smoothstep
  const area = (h, x) => {                                  // ∫ₐˣ 窗口形状（0 → 1 平台 → 0）
    const { a, b, r } = h;
    if (x <= a) return 0;
    if (x >= b) return b - a - r;
    if (x < a + r) return r * S1((x - a) / r);
    if (x <= b - r) return r / 2 + (x - a - r);
    const t = (x - (b - r)) / r;
    return r / 2 + (b - a - 2 * r) + r * (t - S1(t));
  };
  // 原来的时间 → 成片时间
  const inv = (t) => { let y = t + ofs; for (const h of H) y += h.k * area(h, t); return y; };
  // 成片时间 → 原来的时间（二分；两格缓存：逐粒子调用时同一帧只算一两次）
  let c0 = NaN, v0 = 0, c1 = NaN, v1 = 0;
  const fwd = !H.length ? (T) => T - ofs : (T) => {
    if (T === c0) return v0;
    if (T === c1) return v1;
    let lo = T - ofs - total - 1e-6, hi = T - ofs + 1e-6;
    for (let n = 0; n < 50; n++) { const m = 0.5 * (lo + hi); if (inv(m) < T) lo = m; else hi = m; }
    const v = 0.5 * (lo + hi);
    c1 = c0; v1 = v0; c0 = T; v0 = v;
    return v;
  };
  // 一段原来的时长 dur（从原来的时刻 t 开始）在成片里有多长
  const span = (t, dur) => inv(t + dur) - inv(t);
  return { ofs, total, holds: H, fwd, inv, span, identity: !ofs && !H.length };
}
export const IDENTITY = makeWarp(0, []);
