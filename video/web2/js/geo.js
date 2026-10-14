// 几何小工具：光球、线段、样条、节点网络等（各幕共用）
import { gX, gY, gZ, rA, rB, rC, rD, uX, uY, uZ } from './film.js';
import { clamp, lerp, smooth } from './kit.js';

// 光球：粒子 i 在以 (cx,cy,cz) 为心、半径 r 的实心球里（中心更密，像发光的核）
export function ball(o, i, cx, cy, cz, r) {
  const k = r * Math.pow(rD[i], 0.75);
  o.x = cx + uX[i] * k; o.y = cy + uY[i] * k; o.z = cz + uZ[i] * k;
}
// 球壳
export function shell(o, i, cx, cy, cz, r, jitter = 0.03) {
  const k = r * (1 + gX[i] * jitter);
  o.x = cx + uX[i] * k; o.y = cy + uY[i] * k; o.z = cz + uZ[i] * k;
}
// 线段上的点（t∈[0,1]），带一点横向抖动
export function onSeg(o, t, ax, ay, az, bx, by, bz, i = 0, jit = 0) {
  o.x = lerp(ax, bx, t) + (jit ? gX[i] * jit : 0);
  o.y = lerp(ay, by, t) + (jit ? gY[i] * jit : 0);
  o.z = lerp(az, bz, t) + (jit ? gZ[i] * jit : 0);
}
export function setCol(o, r, g, b, a = 1, s = 0.14) { o.r = r; o.g = g; o.b = b; o.a = a; o.s = s; }

// Catmull-Rom 样条：把关键点连成光滑曲线，并按弧长参数化（均匀取点）
export function spline(pts, samples = 800) {
  const P = pts, n = P.length;
  const at = (t) => {
    const f = t * (n - 1), k = Math.min(n - 2, Math.floor(f)), u = f - k;
    const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(n - 1, k + 2)];
    const r = [];
    for (let d = 0; d < p1.length; d++) {
      const a = p0[d], b = p1[d], c = p2[d], e = p3[d];
      r.push(0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - e) * u * u + (-a + 3 * b - 3 * c + e) * u * u * u));
    }
    return r;
  };
  const S = [], L = [0];
  for (let k = 0; k <= samples; k++) S.push(at(k / samples));
  for (let k = 1; k <= samples; k++) L.push(L[k - 1] + Math.hypot(...S[k].map((v, d) => v - S[k - 1][d])));
  const total = L[samples];
  // s∈[0,1]（弧长比例）→ 点
  const byLen = (s) => {
    const target = clamp(s) * total;
    let lo = 0, hi = samples;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < target) lo = m; else hi = m; }
    const u = (target - L[lo]) / Math.max(1e-9, L[hi] - L[lo]);
    return S[lo].map((v, d) => lerp(v, S[hi][d], u));
  };
  return { at, byLen, total, S };
}

// 分层网络：layers = [4, 6, 6, 2]，返回节点坐标与边
export function layeredNet(layers, { dx = 20, dy = 8, x0 = null } = {}) {
  const nodes = [], edges = [];
  const W = (layers.length - 1) * dx;
  const start = x0 == null ? -W / 2 : x0;
  layers.forEach((n, l) => {
    for (let k = 0; k < n; k++) nodes.push({ l, k, x: start + l * dx, y: (k - (n - 1) / 2) * dy, z: 0 });
  });
  const idx = (l, k) => layers.slice(0, l).reduce((a, b) => a + b, 0) + k;
  for (let l = 0; l < layers.length - 1; l++)
    for (let a = 0; a < layers[l]; a++) for (let b = 0; b < layers[l + 1]; b++) edges.push({ a: idx(l, a), b: idx(l + 1, b), l });
  return { nodes, edges, idx };
}

export const hot = (x) => clamp(x);          // 占位：便于以后统一调色
export { smooth };
