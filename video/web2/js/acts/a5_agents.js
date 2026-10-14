// 第 5 幕 · 智能体（264 – 320 s）
// 智能体循环（观察 → 思考 → 行动 → 检查）→ 自己操作电脑 → MCP 接上一圈工具 → 在终端里写代码、派出子智能体
// → METR：能独立完成的任务长度从 3 秒爬到约 12 小时（全片情绪高点）
import { SEGS, GSEGS, CAMK, LINES, key, FLASH, SHAKE, RINGS, FOCUS, distTo, NM, NG, TAU2, rA, rB, rC, rD, gX, gY, gZ, gid, ACT } from '../film.js';
import { scene } from '../../../web/js/engine.js';
import { title, smooth, frac, h, E, clamp, lerp, seg, rng, charCue } from '../kit.js';
import { tag, chapter, callout, readout, wline, bracket } from '../hud.js';
import { ball, onSeg, setCol } from '../geo.js';
import { project } from '../world.js';
import { PROMPT } from './a0_now.js';

const C5 = [34, 2, -870];
const [cx, cy, cz] = C5;

// ---------------------------------------------------------------- 智能体循环
const LOOP = ['观察', '思考', '行动', '检查'];
const LA = (k) => Math.PI / 2 - (k * Math.PI) / 2;   // 顶 → 右 → 底 → 左（顺时针）
const RR = 14;
const TOOLS = ['搜索', '浏览器', '终端', '代码', '文件', 'API'];
// 工具分列在环的左右两侧（左三右三），底部留给字幕
const TOOLP = (k) => [cx + (k < 3 ? -33 : 33), cy + (k < 3 ? 8 - k * 8 : -8 + (k - 3) * 8)];
// 转速按成片时间指数增长：0.3 转/秒起步，约每 1.7 s 翻一倍，最后快到连成一圈光
const LOOP_TC = 2.44, LOOP_A = 0.73;                 // 转数 = A·(e^(τ/TC) − 1)，转速 = A/TC·e^(τ/TC)
let W5 = { inv: (t) => t, fwd: (t) => t };
const tau5 = (T) => Math.max(0, W5.inv(T) - W5.inv(264.6));
const loopAng = (T) => TAU2 * LOOP_A * (Math.exp(tau5(T) / LOOP_TC) - 1);
const loopSpd = (T) => (T < 264.6 ? 0 : (LOOP_A / LOOP_TC) * Math.exp(tau5(T) / LOOP_TC));
function fLoop(i, T, o) {
  const spd = loopSpd(T), hot = clamp((spd - 1) / 7);
  if (i < 4000) {                                     // 环：转得越快越亮、越热
    const a = (i / 4000) * TAU2;
    const w = 0.06 + 0.25 * hot;
    o.x = cx + Math.cos(a) * RR + gX[i] * w; o.y = cy + Math.sin(a) * RR + gY[i] * w; o.z = cz + gZ[i] * w;
    setCol(o, 1, 0.8 - 0.25 * hot, 0.62 - 0.4 * hot, 0.3 + 0.9 * hot, 0.1 + 0.03 * hot);
  } else if (i < 10000) {                             // 四个节点：光点经过时亮；转得太快时常亮（避免频闪）
    const k = Math.floor((i - 4000) / 1500);
    ball(o, i, cx + Math.cos(LA(k)) * RR, cy + Math.sin(LA(k)) * RR, cz, 1.3 + 0.5 * hot);
    const pa = (loopAng(T) / (Math.PI / 2)) % 4;
    const near = Math.exp(-(((pa - k + 4) % 4) ** 2) * 6) + Math.exp(-(((k - pa + 4) % 4) ** 2) * 6);
    const lit = lerp(Math.min(1, near), 1, clamp((spd - 1.5) / 2.5));
    setCol(o, 1, 0.8 + 0.1 * lit - 0.2 * hot, 0.62 - 0.3 * hot, 0.8 + 1.0 * lit + 0.8 * hot, 0.12);
  } else if (i < 10800) {                             // 沿环奔跑的光点：越转越快，拖尾越拉越长，最后连成一圈
    const u = (i - 10000) / 800, trail = Math.min(TAU2 * 0.94, 0.45 + 0.6 * spd);
    const a = LA(0) - loopAng(T) - u * trail;
    ball(o, i, cx + Math.cos(a) * RR, cy + Math.sin(a) * RR, cz, 0.5 + 0.4 * hot);
    setCol(o, 1, 0.55, 0.2, T > 264.6 ? (1.5 + hot) * (1 - 0.75 * u) : 0, 0.1 + 0.03 * hot);
  } else if (i < 10800 + 6 * 1200) {                  // 工具节点：流光到达时闪一下
    const k = Math.floor((i - 10800) / 1200);
    const [x, y] = TOOLP(k), fl = toolFlash(k, T);
    ball(o, i, x, y, cz, 1.0 + 0.35 * fl);
    const on = smooth(seg(T, 266.4 + k * 0.45, 266.8 + k * 0.45));
    setCol(o, 1, 0.84 - 0.2 * fl, 0.7 - 0.35 * fl, 0.15 + 0.75 * on + 1.4 * fl, 0.11);
  } else if (i < 18000 + 6 * PULSE_N) {               // 流光：光点每经过一次"行动"，沿接好的折线向工具射出一道光
    const q = i - 18000, k = Math.floor(q / PULSE_N), r = q % PULSE_N, u = Math.floor(r / PULSE_S) / (PULSE_N / PULSE_S - 1);
    const p = pulseAt(k, r % PULSE_S, T), s = p ? p.head - u * PULSE_TAIL : -1;   // 这个点在折线上的位置（弧长）：头在前，尾巴拖在后面
    if (!p || s < p.from || s > TLEN[k]) { ball(o, i, cx, cy, cz - 40, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); return; }
    const [x, y] = polyAtLen(TP[k], s), w = Math.pow(1 - u, 1.6);
    o.x = x + gX[i] * 0.06; o.y = y + gY[i] * 0.06; o.z = cz + gZ[i] * 0.06;
    setCol(o, 1, lerp(0.5, 0.92, w), lerp(0.18, 0.62, w), (0.2 + 1.5 * w) * p.a, 0.1 + 0.04 * w);
  } else { ball(o, i, cx, cy, cz - 40, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}
// 工具的连线走折线（像电路板上的走线）：从工具横向出来 → 在环外竖直往下 → 在环下方汇成一条总线 → 从侧面接进"行动"。
// 上面的工具走最里面的一条竖线、下面的走最外面的，三条线互不交叉；不穿过环，也不挡"检查""思考""行动"几个字
const LANE = [23.5, 26, 28.5], BUSY = -15.0, CHF = 1.0;
function toolPath(k) {
  const left = k < 3, sd = left ? -1 : 1, j = left ? k : 5 - k;          // j：0 = 上，1 = 中，2 = 下
  const [tx, ty] = TOOLP(k), lx = cx + sd * LANE[j], by = cy + BUSY;
  return [[cx + sd * 1.4, by], [lx - sd * CHF, by], [lx, by + CHF], [lx, ty - CHF], [lx + sd * CHF, ty], [tx - sd * 1.3, ty]];   // 从"行动"那端开始
}
const TP = Array.from({ length: 6 }, (_, k) => toolPath(k));
const polyLen = (P) => { let t = 0; for (let q = 1; q < P.length; q++) t += Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1]); return t; };
const TLEN = TP.map(polyLen);
const polyAtLen = (P, s) => {                         // 折线上按弧长（绝对长度）取点
  for (let q = 1; q < P.length; q++) {
    const d = Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1]);
    if (s <= d) { const f = s / d; return [lerp(P[q - 1][0], P[q][0], f), lerp(P[q - 1][1], P[q][1], f)]; }
    s -= d;
  }
  return P[P.length - 1];
};
// 流光：光点第 n 次经过"行动"（转过 π(2n+1)）时，沿每条已经接好的折线射出一道光。光速恒定（不跟着环加速）：
// 环越转越快，光就一道接一道连成一串流向工具；速度太快的话，画面的运动拖尾（0.01–0.03 s）会在拐角处拉出扇形、整串频闪。
// 每条线 1500 个粒子分 6 组轮流用（一道光走完全程约 0.4 s，最快时 0.1 s 发一道）；跟连线一起在 271.4–272.4 淡出
const PULSE_N = 1500, PULSE_S = 6, PULSE_V = 150, PULSE_TAIL = 10;
const passTf = (n) => W5.inv(264.6) + LOOP_TC * Math.log(1 + (2 * n + 1) / (2 * LOOP_A));   // 第 n 次经过"行动"的成片时刻
const lastPass = (T) => (T < 264.6 ? -1 : Math.floor((loopAng(T) / Math.PI - 1) / 2));    // 最近一次经过"行动"是第几次
const wired = (k) => W5.inv(266.95 + k * 0.45);                                              // 第 k 条连线画完的成片时刻
const SIDE = (k) => (k < 3 ? -1 : 1), LANEJ = (k) => (k < 3 ? k : 5 - k);                    // 在哪一侧、走第几条竖线（0 = 最里面）
const BUSL = [0, 1, 2].map((j) => LANE[j] - CHF - 1.4);                                      // 在共用的总线上走多远才拐上去
function pulseAt(k, slot, T) {
  const nl = lastPass(T);
  if (nl < 0) return null;
  const n = nl - ((((nl - slot) % PULSE_S) + PULSE_S) % PULSE_S);                           // 这一组最近的一道光
  if (n < 0) return null;
  const t0 = passTf(n);
  if (t0 < wired(k)) return null;
  const head = PULSE_V * (W5.inv(T) - t0);
  if (head - PULSE_TAIL > TLEN[k]) return null;
  // 共用的总线上只画一道光（由这一侧最外面、已经接好的那条线来画），到了自己的拐角才分出来——三道叠在一起会过亮、发白
  let from = 0;
  for (let q = 0; q < 6; q++) if (SIDE(q) === SIDE(k) && LANEJ(q) > LANEJ(k) && t0 >= wired(q)) from = BUSL[LANEJ(k)];
  return { head, from, a: 1 - smooth(seg(T, 271.4, 272.4)) };
}
function toolFlash(k, T) {                            // 流光到达工具：节点闪一下；转得快了改成常亮（和环上的四个节点一样，避免频闪）
  const nl = lastPass(T), tf = W5.inv(T);
  if (nl < 0 || tf < wired(k)) return 0;
  let f = 0;
  for (let n = Math.max(0, nl - 4); n <= nl; n++) {
    const t0 = passTf(n);
    if (t0 < wired(k)) continue;
    const ta = t0 + TLEN[k] / PULSE_V;
    if (tf >= ta) f = Math.max(f, Math.exp(-(tf - ta) / 0.16));
  }
  return lerp(f, 0.55, clamp((loopSpd(T) - 2.2) / 1.6)) * (1 - smooth(seg(T, 271.4, 272.4)));
}
function loopLines(T, L) {
  const out = 1 - smooth(seg(T, 271.4, 272.4));
  for (let k = 0; k < 6; k++) {
    const on = smooth(seg(T, 266.4 + k * 0.45, 266.6 + k * 0.45)) * out * 0.34;
    if (on <= 0) continue;
    const P = toolPath(k), grow = E.p3o(seg(T, 266.4 + k * 0.45, 266.95 + k * 0.45));   // 从"行动"往工具画出去
    let tot = 0;
    for (let q = 1; q < P.length; q++) tot += Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1]);
    let left = tot * grow;
    for (let q = 1; q < P.length && left > 0; q++) {
      const [x0, y0] = P[q - 1], [x1, y1] = P[q], d = Math.hypot(x1 - x0, y1 - y0), f = Math.min(1, left / d);
      L.seg(x0, y0, cz, on, on * 0.7, on * 0.45, lerp(x0, x1, f), lerp(y0, y1, f), cz, on, on * 0.7, on * 0.45);
      left -= d;
    }
  }
}

// ---------------------------------------------------------------- 自己操作电脑（2024.10）
// 一个浏览器窗口：地址栏"天气查询"、带提示字的搜索框、"搜索"按钮、两张天气结果卡片。光标（真正的箭头）依次：
// 点搜索框 → 打字"杭州 周末 天气" → 点"搜索" → 结果出来 → 点"周日"那张卡片（选定——和前面"四个时代"里的回答对得上）。
// 左下角的读数实时写出它在做哪一步
const SW = 56, SH = 32;
const CK = [273.05, 274.35, 275.35];                 // 三次点击：搜索框、"搜索"按钮、"周日"卡片
const CUR = [[6, -12, 272.55], [-6, 6.1, 273.0], [-6, 6.1, 273.85], [17.5, 6.1, 274.3], [17.5, 6.1, 274.9], [10.8, -3.0, 275.3], [10.8, -3.0, 276.0]];   // 光标路径：x, y, 到达时间
const curAt = (T) => {
  if (T <= CUR[0][2]) return [CUR[0][0], CUR[0][1]];
  for (let k = 0; k < CUR.length - 1; k++) {
    const [x0, y0, t0] = CUR[k], [x1, y1, t1] = CUR[k + 1];
    if (T < t1) { const e = E.p3(seg(T, t0 + 0.12, t1)); return [lerp(x0, x1, e), lerp(y0, y1, e)]; }
  }
  const L = CUR[CUR.length - 1]; return [L[0], L[1]];
};
function rectPt(o, i, x0, y0, w, hh, t) {
  const P = 2 * (w + hh), d = t * P;
  let x, y;
  if (d < w) { x = x0 + d; y = y0; } else if (d < w + hh) { x = x0 + w; y = y0 - (d - w); }
  else if (d < 2 * w + hh) { x = x0 + w - (d - w - hh); y = y0 - hh; } else { x = x0; y = y0 - hh + (d - 2 * w - hh); }
  o.x = cx + x + gX[i] * 0.04; o.y = cy + y + gY[i] * 0.04; o.z = cz + gZ[i] * 0.04;
}
const UI = [                                          // [左, 上, 宽, 高, 粒子数]
  [-SW / 2, SH / 2, SW, SH, 6000],                   // 0 窗口
  [-19, 15.1, 30, 2.2, 1400],                        // 1 地址栏
  [-22, 8.4, 34, 4.6, 2400],                         // 2 搜索框
  [13.5, 8.4, 8, 4.6, 1400],                         // 3 "搜索"按钮
  [-22, 1.2, 21, 11.4, 2400],                        // 4 结果卡片：周六
  [0.5, 1.2, 21, 11.4, 2400],                        // 5 结果卡片：周日
];
const CARD_T = [274.5, 274.65];                       // 两张结果卡片开始出现（边框一笔画出来）
// 天气图标：一朵云（几段圆弧 + 底边），下雨再加四道斜线，多云再加一个露出半边的太阳
const CLOUD = [];
{
  const arc = (x, y, r, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180; CLOUD.push([x + r * Math.cos(a), y + r * Math.sin(a)]); } };
  arc(1.3, -0.15, 0.85, -90, 70, 14); arc(0.1, 0.35, 1.25, 20, 165, 18); arc(-1.35, -0.2, 0.8, 100, 270, 14);
  CLOUD.push([1.3, -1.0]);
}
const polyAt = (P, t) => {                            // 折线上按弧长取点
  const L = []; let tot = 0;
  for (let k = 1; k < P.length; k++) { const d = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); L.push(d); tot += d; }
  let s = t * tot;
  for (let k = 1; k < P.length; k++) { if (s <= L[k - 1]) { const f = s / L[k - 1]; return [lerp(P[k - 1][0], P[k][0], f), lerp(P[k - 1][1], P[k][1], f)]; } s -= L[k - 1]; }
  return P[P.length - 1];
};
// 光标：标准的箭头（尖在左上，下方一条小尾巴），填充 + 更亮的描边
const ARW = [[0, 0], [0, -17], [4, -13], [7, -19.5], [9.5, -18.5], [6.5, -12.2], [12, -12.2]].map(([x, y]) => [x * 0.17, y * 0.17]);
const ARW_T = [[0, 1, 2], [0, 2, 5], [0, 5, 6], [2, 3, 4], [2, 4, 5]];
const triA = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
const ARW_CUM = []; { let s = 0; const A = ARW_T.map(([a, b, c]) => triA(ARW[a], ARW[b], ARW[c])), tot = A.reduce((p, q) => p + q, 0); A.forEach((v) => { s += v / tot; ARW_CUM.push(s); }); }
function arrowPt(i) {                                 // → [x, y, 是不是描边]
  if (rC[i] < 0.55) { const [x, y] = polyAt([...ARW, ARW[0]], rD[i]); return [x, y, 1]; }
  let k = 0; while (k < ARW_CUM.length - 1 && rA[i] > ARW_CUM[k]) k++;
  const [a, b, c] = ARW_T[k].map((q) => ARW[q]);
  let u = rB[i], v = rD[i]; if (u + v > 1) { u = 1 - u; v = 1 - v; }
  return [a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]), a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]), 0];
}
const pressK = (T) => CK.reduce((s, t) => s + (T >= t && T < t + 0.3 ? Math.exp(-(T - t) / 0.06) : 0), 0);   // 按下的一瞬间
const UIN = UI.reduce((a, u) => a + u[4], 0);
function fScreen(i, T, o) {
  const warm = [1, 0.8, 0.64], acc = [1, 0.58, 0.26];
  let base = 0;
  for (let k = 0; k < UI.length; k++) {
    const [x0, y0, w, hh, n] = UI[k];
    if (i < base + n) {
      const t = (i - base) / n;
      rectPt(o, i, x0, y0, w, hh, t);
      let a = k === 0 ? 0.6 : 0.3, col = warm;
      if (k === 2 && T >= CK[0] && T < CK[1]) a = 0.75;                                     // 搜索框：点中之后亮（获得焦点）
      if (k === 3) { a = 0.42 + 1.4 * pressK(T) * (T >= CK[1] ? 1 : 0); if (T >= CK[1]) col = acc; }   // "搜索"按钮：按下一闪，之后变橙
      if (k >= 4) {                                                                           // 结果卡片：边框一笔画出来
        const p = E.p3o(seg(T, CARD_T[k - 4], CARD_T[k - 4] + 0.4));
        a = t < p ? 0.34 : 0;
        if (k === 5 && T >= CK[2]) { col = acc; a = 0.34 + 0.5 * smooth(clamp((T - CK[2]) / 0.2)) + 1.2 * Math.exp(-(T - CK[2]) / 0.2); }   // 选定"周日"
      }
      setCol(o, col[0], col[1], col[2], a, 0.1);
      return;
    }
    base += n;
  }
  let q = i - base;
  if (q < 900) {                                      // 标题栏的分隔线
    o.x = cx - SW / 2 + SW * (q / 900) + gX[i] * 0.03; o.y = cy + 12.3 + gY[i] * 0.03; o.z = cz;
    setCol(o, 1, 0.8, 0.64, 0.22, 0.1); return;
  }
  q -= 900;
  if (q < 450) {                                      // 窗口左上角的三个圆点
    const k = Math.floor(q / 150), a = (q % 150) / 150 * TAU2;
    o.x = cx - 26 + 1.4 * k + 0.45 * Math.cos(a); o.y = cy + 14.0 + 0.45 * Math.sin(a); o.z = cz;
    setCol(o, 1, k === 0 ? 0.55 : 0.8, k === 0 ? 0.3 : 0.64, 0.4, 0.1); return;
  }
  q -= 450;
  if (q < 1600) {                                     // 两个天气图标：周六（云 + 雨）、周日（云 + 半个太阳）
    const card = q < 800 ? 0 : 1, r = q % 800, ox = card ? 17.6 : -4.1, oy = -3.4;   // 图标靠卡片右边：点"周日"时光标不压在图标上
    const p = smooth(seg(T, CARD_T[card] + 0.25, CARD_T[card] + 0.6));
    let x, y;
    if (r < 500) [x, y] = polyAt(CLOUD, r / 500);
    else if (!card) { const k = Math.floor((r - 500) / 75), u = ((r - 500) % 75) / 75, x0 = -1.1 + 0.75 * k; x = x0 - 0.45 * u; y = -1.4 - 1.05 * u; }
    else { const u = (r - 500) / 300; if (u < 0.6) { const a = (40 + 150 * (u / 0.6)) * Math.PI / 180; x = 1.1 + 0.75 * Math.cos(a); y = 1.0 + 0.75 * Math.sin(a); } else { const k = Math.floor((u - 0.6) / 0.1334), v = ((u - 0.6) % 0.1334) / 0.1334, a = (60 + 45 * k) * Math.PI / 180; x = 1.1 + (1.05 + 0.45 * v) * Math.cos(a); y = 1.0 + (1.05 + 0.45 * v) * Math.sin(a); } }
    o.x = cx + ox + x + gX[i] * 0.03; o.y = cy + oy + y + gY[i] * 0.03; o.z = cz;
    const sel = card && T >= CK[2] ? 1 : 0;
    setCol(o, 1, sel ? 0.66 : 0.85, sel ? 0.36 : 0.72, 0.55 * p, 0.1); return;
  }
  q -= 1600;
  if (q < 1500) {                                     // "搜索"按钮按下时整块亮一下
    const [x0, y0, w, hh] = UI[3];
    o.x = cx + x0 + w * rA[i]; o.y = cy + y0 - hh * rB[i]; o.z = cz - 0.1;
    setCol(o, 1, 0.6, 0.28, T >= CK[1] ? 0.5 * Math.exp(-(T - CK[1]) / 0.35) : 0, 0.12); return;
  }
  q -= 1500;
  if (q < 1200) {                                     // 选定的"周日"卡片：淡淡的底色
    const [x0, y0, w, hh] = UI[5];
    o.x = cx + x0 + w * rA[i]; o.y = cy + y0 - hh * rB[i]; o.z = cz - 0.1;
    setCol(o, 1, 0.6, 0.3, T >= CK[2] ? 0.07 + 0.35 * Math.exp(-(T - CK[2]) / 0.25) : 0, 0.12); return;
  }
  q -= 1200;
  if (q < 1400) {                                     // 光标：箭头（按下时微微缩一下）
    const [x, y] = curAt(T), [ax, ay, edge] = arrowPt(i), sc = 1 - 0.14 * pressK(T);
    o.x = cx + x + ax * sc; o.y = cy + y + ay * sc; o.z = cz + 0.4;
    const on = smooth(seg(T, 272.5, 272.7));
    setCol(o, 1, edge ? 0.72 : 0.96, edge ? 0.42 : 0.9, on * (edge ? 1.25 : 0.55), edge ? 0.09 : 0.08); return;
  }
  ball(o, i, cx, cy, cz - 40, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12);
}

const SQ = '杭州 周末 天气';                            // 在搜索框里打的字（与键盘声逐字对齐）
const sqT = (m) => 273.15 + m * 0.09;
const SG = [], SQX = [];
function layoutScreen() {
  const add = (txt, x0, y, o) => {
    let x = x0;
    [...txt].forEach((ch, m) => {
      const cjk = ch.charCodeAt(0) > 0x2e80, w = (cjk ? 0.82 : 0.46) * o.s;
      if (o.typed) SQX.push(x);
      SG.push({ x: x + w / 2, y, id: ch === ' ' ? 0 : gid(ch), t0: o.typed ? sqT(m) : o.t0, t1: o.t1 ?? 276.0, s: o.s, col: o.col, a: o.a ?? 0.95, btn: o.btn || 0, card: o.card || 0 });
      x += w;
    });
    if (o.typed) SQX.push(x);
  };
  add('天气查询', -17.4, 14.0, { t0: 272.6, s: 1.4, col: [0.8, 0.76, 0.7], a: 0.55 });
  add('输入城市和日期…', -20.6, 6.1, { t0: 272.6, t1: CK[0], s: 1.6, col: [0.8, 0.77, 0.72], a: 0.45 });
  add(SQ, -20.6, 6.1, { typed: 1, s: 1.95, col: [1, 0.95, 0.88] });
  SG.push({ caret: 1, x: 0, y: 6.1, id: gid('▍'), t0: CK[0], t1: CK[1], s: 1.9, col: [1, 0.6, 0.3], a: 0.9 });
  add('搜索', 15.8, 6.1, { t0: 272.65, s: 1.85, col: [1, 0.92, 0.82], btn: 1 });
  add('周六', -20.2, -1.4, { t0: CARD_T[0] + 0.1, s: 2.3, col: [1, 0.95, 0.88] });
  add('小雨 · 18°C', -20.2, -5.3, { t0: CARD_T[0] + 0.18, s: 1.55, col: [0.86, 0.83, 0.78] });
  add('周日', 2.3, -1.4, { t0: CARD_T[1] + 0.1, s: 2.3, col: [1, 0.95, 0.88], card: 2 });
  add('多云 · 22°C', 2.3, -5.3, { t0: CARD_T[1] + 0.18, s: 1.55, col: [0.86, 0.83, 0.78], card: 2 });
  add('✓ 选定', 2.3, -8.9, { t0: CK[2] + 0.08, s: 1.45, col: [1, 0.6, 0.28] });
}
function gScreen(j, T, o) {
  o.gl = 0; o.a = 0; o.x = cx; o.y = cy; o.z = cz; o.s = 2; o.r = o.g = o.b = 1;
  if (j >= SG.length) return;
  const g = SG[j];
  let x = g.x, blink = 1;
  if (g.caret) {                                      // 输入位置的竖线：跟着打出的字往右走，没在打字时闪烁
    let m = 0; while (m < SQX.length - 1 && T >= sqT(m)) m++;
    x = SQX[m] + 0.35;
    const typing = T >= sqT(0) - 0.05 && T < sqT(SQX.length - 2) + 0.15;
    blink = typing || Math.floor((T - CK[0]) * 3.4) % 2 === 0 ? 1 : 0;
  }
  o.x = cx + x; o.y = cy + g.y; o.z = cz + 0.3; o.gl = g.id; o.s = g.s;
  const vis = T >= g.t0 && T < g.t1 && g.id ? smooth(clamp((T - g.t0) / 0.08)) : 0;
  o.a = vis * blink * g.a * (1 - smooth(seg(T, 275.9, 276.4)));
  let [r, gg, b] = g.col;
  if (g.btn && T >= CK[1]) { r = 1; gg = 0.62; b = 0.3; }                                   // 按下之后按钮上的字变橙
  if (g.card === 2 && T >= CK[2]) { const k = smooth(clamp((T - CK[2]) / 0.2)); r = lerp(r, 1, k); gg = lerp(gg, 0.7, k); b = lerp(b, 0.42, k); }
  o.r = r; o.g = gg; o.b = b;
}

// ---------------------------------------------------------------- MCP：一个接口，接上一圈工具
const MTOOLS = ['代码仓库', '数据库', '日历', '文件', '搜索', '浏览器', '邮件', '设计稿', '表格', '终端'];
const MA = (k) => (k / MTOOLS.length) * TAU2 + 0.3;
const MR = 26;
function fMcp(i, T, o) {
  if (i < 4000) { ball(o, i, cx, cy, cz, 2.4); setCol(o, 1, 0.55, 0.2, 1.0, 0.12); }
  else if (i < 4000 + 10 * 1000) {
    const k = Math.floor((i - 4000) / 1000);
    ball(o, i, cx + Math.cos(MA(k)) * MR, cy + Math.sin(MA(k)) * MR * 0.62, cz, 1.0);
    setCol(o, 1, 0.84, 0.7, 0.85 * smooth(seg(T, 276.3 + k * 0.12, 276.6 + k * 0.12)), 0.11);
  } else if (i < 14000 + 10 * 900) {                   // 沿辐条来回流动的数据
    const q = i - 14000, k = Math.floor(q / 900);
    const t = frac(rA[i] + (T - 276) * (rB[i] < 0.5 ? 0.7 : -0.7));
    onSeg(o, t, cx, cy, cz, cx + Math.cos(MA(k)) * MR, cy + Math.sin(MA(k)) * MR * 0.62, cz, i, 0.1);
    setCol(o, 1, 0.7, 0.4, 0.5 * smooth(seg(T, 276.6 + k * 0.12, 277.0 + k * 0.12)), 0.09);
  } else { ball(o, i, cx, cy, cz - 40, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}

// ---------------------------------------------------------------- 在终端里写代码 + 子智能体
const TW = 62, THh = 34, TX0 = -TW / 2 - 8;
function fTerm2(i, T, o) {
  if (i < 9000) { rectPt(o, i, TX0, THh / 2, TW, THh, i / 9000); setCol(o, 1, 0.84, 0.7, 0.55, 0.1); o.x -= 0; }
  else if (i < 9000 + 4 * 3000) {                     // 四个子智能体：从终端右上角分出的光线与节点
    const q = i - 9000, k = Math.floor(q / 3000), r = q % 3000;
    const t0 = 283.2 + k * 0.5;
    const src = [TX0 + TW, THh / 2 - 3], dst = [TX0 + TW + 16, THh / 2 - 3 - k * 9.5];
    if (r < 2200) {
      const t = rA[i] * smooth(seg(T, t0, t0 + 0.8));
      const bend = Math.sin(Math.PI * t) * 2;
      o.x = cx + lerp(src[0], dst[0], t); o.y = cy + lerp(src[1], dst[1], t) + bend * (k - 1.5) * 0.3; o.z = cz;
      setCol(o, 1, 0.7, 0.4, T > t0 ? 0.4 : 0, 0.09);
    } else {
      ball(o, i, cx + dst[0], cy + dst[1], cz, 1.1);
      const pulse = 1 + 0.5 * Math.sin((T - t0) * 6 + k);
      setCol(o, 1, 0.6, 0.25, T > t0 + 0.7 ? 0.9 * pulse : 0, 0.11);
    }
  } else { ball(o, i, cx, cy, cz - 40, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}
const TLINES = [
  { t: 280.6, text: '› ' + PROMPT, c: 'w' },
  { t: 281.3, text: '  读取 412 个文件 … 制定 7 步计划', c: 'd' },
  { t: 281.9, text: '- import { render } from "./legacy"', c: 'd' },
  { t: 282.3, text: '+ import { render } from "./core/render"', c: 'o' },
  { t: 282.9, text: '  npm test   ✗ 3 failed', c: 'o' },
  { t: 283.6, text: '  派出 4 个子智能体 · 并行处理', c: 'w' },
  { t: 285.0, text: '  修复 timeout · retry with backoff', c: 'd' },
  { t: 285.8, text: '  npm test   ✓ 212 passed', c: 'w' },
  { t: 286.6, text: '  git commit -m "refactor: split engine"', c: 'o' },
];
const TG = [];
function layoutTerm() {
  const aw = 1.0, cw = 1.68, x0 = TX0 + 2.4, y0 = THh / 2 - 3.4;
  TLINES.forEach((L, li) => {
    let x = x0;
    const chars = [...L.text];
    chars.forEach((ch, m) => {
      const cjk = ch.charCodeAt(0) > 0x2e80;
      const w = cjk ? cw : aw;
      TG.push({ x: x + w / 2, y: y0 - li * 3.35, id: ch === ' ' ? 0 : gid(ch), t: L.t + m * (li === 0 ? 0.034 : 0.02), c: L.c, cjk, li });
      x += w;
    });
  });
}
function gTerm(j, T, o) {
  o.gl = 0; o.a = 0; o.x = cx; o.y = cy; o.z = cz; o.s = 2; o.r = o.g = o.b = 1;
  if (j >= TG.length) return;
  const g = TG[j];
  o.x = cx + g.x; o.y = cy + g.y; o.z = cz + 0.2; o.gl = g.id;
  o.s = g.cjk ? 2.6 : 2.3;
  o.a = T >= g.t && g.id ? 0.9 * (1 - smooth(seg(T, 291.2, 292.0))) : 0;
  if (g.c === 'o') { o.r = 1; o.g = 0.5; o.b = 0.2; } else if (g.c === 'd') { o.r = 0.62; o.g = 0.6; o.b = 0.58; } else { o.r = 1; o.g = 0.93; o.b = 0.84; }
}

// ---------------------------------------------------------------- METR：能独立完成的任务长度（50% 成功率）
const MP = [
  [2019.1, 3, 'GPT-2', '约 3 秒'], [2020.4, 9, 'GPT-3', '约 9 秒'], [2022.2, 36, 'GPT-3.5', '约 36 秒'], [2023.2, 240, 'GPT-4', '4 分钟'],
  [2024.8, 1230, 'Claude 3.5 Sonnet', '20.5 分钟'], [2024.95, 2328, 'o1', '38.8 分钟'], [2025.15, 3624, 'Claude 3.7 Sonnet', '约 1 小时'],
  [2025.3, 7200, 'o3', '约 2 小时'], [2025.6, 12180, 'GPT-5', '约 3.4 小时'], [2025.9, 17580, 'Claude Opus 4.5', '约 4.9 小时'], [2026.1, 43200, 'Claude Opus 4.6', '约 12 小时'],
];
const MX = (d) => -50 + (d - 2019) * 13.2, MY = (s) => -24 + ((Math.log10(s) - 0.4) / 4.3) * 54;
const PENTA = [587.3, 698.5, 784.0, 880.0, 1046.5, 1174.7, 1396.9, 1568.0, 1760.0, 2093.0];   // 提示音：D 小调五声音阶一路往上爬，和配乐同调
const mpT = (k) => 293.0 + k * 1.5;                   // 每 3 拍一个点，最后一个（12 小时）落在 308.0 的小节首拍
function fMetr(i, T, o) {
  if (i < MP.length * 1600) {
    const k = Math.floor(i / 1600);
    const [d, s] = MP[k];
    ball(o, i, cx + MX(d), cy + MY(s), cz, k === MP.length - 1 ? 1.6 : 1.1);
    const on = smooth(seg(T, mpT(k), mpT(k) + 0.3));
    const pop = T > mpT(k) ? 1 + 1.6 * Math.exp(-(T - mpT(k)) / 0.3) : 1;
    const last = k === MP.length - 1;
    setCol(o, 1, last ? 0.5 : 0.84, last ? 0.2 : 0.7, 0.9 * on * pop, 0.12);
  } else if (i < MP.length * 1600 + 10 * 2400) {       // 连线上的粒子（随新点出现而延伸）
    const q = i - MP.length * 1600, e = Math.floor(q / 2400);
    const [d0, s0] = MP[e], [d1, s1] = MP[e + 1];
    const t = rA[i];
    const grow = smooth(seg(T, mpT(e + 1) - 0.4, mpT(e + 1) + 0.1));
    onSeg(o, t * grow, cx + MX(d0), cy + MY(s0), cz, cx + MX(d1), cy + MY(s1), cz, i, 0.12);
    setCol(o, 1, 0.62, 0.3, grow > 0 ? 0.5 : 0, 0.1);
  } else if (i < MP.length * 1600 + 24000 + 8000) {   // 背景网格点（对数坐标的横线）
    const q = i - MP.length * 1600 - 24000;
    const row = q % 5, t = Math.floor(q / 5) / 1600;
    const ys = [1, 60, 3600, 43200, 3600 * 16][row];
    o.x = cx - 54 + t * 104; o.y = cy + MY(ys); o.z = cz - 0.5;
    setCol(o, 0.9, 0.9, 1, 0.1 * smooth(seg(T, 292.1, 292.9)), 0.08);
  } else { ball(o, i, cx, cy, cz - 40, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
  if (T > 314.4) {                                    // 高潮：整张图冲向镜头化作光流
    const p = seg(T, 314.4, 316.0);
    o.z += 90 * p * p * (0.5 + rB[i]); o.x += (o.x - cx) * p * p * 0.6; o.y += (o.y - cy) * p * p * 0.6;
    o.a *= 1 - smooth(seg(T, 315.4, 316.2));
  }
}

export function a5() {
  if (ACT.W) W5 = ACT.W;
  layoutTerm();
  layoutScreen();
  SEGS.push({ t: 264.0, form: fLoop, tr: { type: 'swirl', dur: 1.4, spread: 0.7, amp: 8 } });
  SEGS.push({ t: 272.0, form: fScreen, tr: { type: 'swirl', dur: 0.7, spread: 0.3, amp: 6 } });
  SEGS.push({ t: 276.0, form: fMcp, tr: { type: 'swirl', dur: 1.0, spread: 0.5, amp: 6 } });
  SEGS.push({ t: 280.0, form: fTerm2, tr: { type: 'swirl', dur: 1.0, spread: 0.5, amp: 6 } });
  SEGS.push({ t: 292.0, form: fMetr, tr: { type: 'swirl', dur: 1.4, spread: 0.8, amp: 10 } });
  GSEGS.push({ t: 272.0, form: gScreen });
  GSEGS.push({ t: 276.3, form: (j, T, o) => { o.a = 0; o.gl = 0; o.x = cx; o.y = cy; o.z = cz; o.s = 2; o.r = o.g = o.b = 1; } });
  GSEGS.push({ t: 280.0, form: gTerm });
  GSEGS.push({ t: 292.2, form: (j, T, o) => { o.a = 0; o.gl = 0; o.x = cx; o.y = cy; o.z = cz; o.s = 2; o.r = o.g = o.b = 1; } });
  LINES.push({ t0: 266.0, t1: 272.6, fn: loopLines });
  LINES.push({ t0: 276.2, t1: 280.4, fn: (T, L) => {
    const out = 1 - smooth(seg(T, 279.6, 280.4));
    for (let k = 0; k < 10; k++) {
      const on = smooth(seg(T, 276.4 + k * 0.12, 276.8 + k * 0.12)) * out * 0.2;
      L.seg(cx, cy, cz, on, on * 0.6, on * 0.3, cx + Math.cos(MA(k)) * MR, cy + Math.sin(MA(k)) * MR * 0.62, cz, on, on * 0.8, on * 0.6);
    }
  } });
  SHAKE.push([271.2, 0.25, 0.9], [272.0, 0.5, 0.25], [308.0, 0.6, 0.35]);
  FLASH.push([308.0, 0.12, 0.15]);                             // 转到极速：画面微微发颤，然后"甩"进下一个场景
  RINGS.push({ t: 272.0, n: 4000, R0: 14, R1: 70, k: 0.3, life: 1.0, a: 0.9, col: [1, 0.6, 0.3], s: 0.16, flat: 1, c: [cx, cy, cz] });
  for (const t of CK) RINGS.push({ t, n: 900, R0: 0.2, R1: 3.2, k: 0.12, life: 0.45, a: 0.9, col: [1, 0.6, 0.25], s: 0.1, flat: 1, c: [0, 0, 0], at: t });
  RINGS.forEach((r) => { if (r.at) { const [x, y] = curAt(r.at + 0.2); r.c = [cx + x, cy + y, cz + 0.2]; } });

  CAMK.push(
    { t: 264.4, p: [cx, cy, cz + 66],       q: [cx, cy, cz], fov: 50, roll: 0 },
    { t: 271.6, p: [cx - 4, cy + 3, cz + 62], q: [cx, cy - 2, cz], fov: 50, roll: 0.01 },
    { t: 272.8, p: [cx, cy, cz + 62],       q: [cx, cy, cz], fov: 50, roll: 0 },
    { t: 275.8, p: [cx + 5, cy + 1, cz + 58], q: [cx + 2, cy, cz], fov: 50, roll: -0.01 },
    { t: 276.8, p: [cx, cy + 4, cz + 72],   q: [cx, cy, cz], fov: 50, roll: 0 },
    { t: 279.8, p: [cx - 6, cy + 8, cz + 70], q: [cx, cy, cz], fov: 50, roll: 0.02 },
    { t: 280.8, p: [cx + 4, cy, cz + 70],   q: [cx + 4, cy, cz], fov: 50, roll: 0 },
    { t: 291.6, p: [cx + 8, cy + 1, cz + 76], q: [cx + 6, cy, cz], fov: 50, roll: 0 },
    { t: 293.4, p: [cx + MX(2019.1) + 22, cy + MY(3) + 6, cz + 52], q: [cx + MX(2019.1) + 10, cy + MY(3) + 4, cz], fov: 50, roll: 0.02 },
    { t: 300.0, p: [cx + MX(2023.2) + 20, cy + MY(240) + 2, cz + 48], q: [cx + MX(2023.2) + 8, cy + MY(240) + 4, cz], fov: 52, roll: -0.02 },
    { t: 306.0, p: [cx + MX(2025.3) + 12, cy + MY(7200) - 6, cz + 44], q: [cx + MX(2025.3), cy + MY(7200) + 6, cz], fov: 56, roll: 0.04 },
    { t: 309.0, p: [cx + MX(2026.1) + 6, cy + MY(43200) - 12, cz + 41], q: [cx + MX(2026.1), cy + MY(43200) + 4, cz], fov: 58, roll: 0.02 },
    { t: 313.8, p: [cx + 6, cy + 14, cz + 96],  q: [cx + 2, cy + 12, cz], fov: 52, roll: 0 },     // 整张图放低一些，顶上留给大字
    { t: 316.0, p: [cx + 2, cy + 4, cz + 60],   q: [cx, cy + 4, cz], fov: 60, roll: 0, ease: (x) => x * x },
  );
  FOCUS.push({ t0: 264, t1: 292, fn: () => distTo(cx, cy, cz) }, { t0: 292, t1: 320, fn: () => distTo(cx, cy, cz) });
  key('bloom', [264, 2.3], [269, 2.3], [271.8, 2.9], [272.4, 2.3], [292, 2.3], [307.8, 2.6], [308.3, 3.2], [309.4, 2.6], [314.4, 2.6], [316.0, 3.6]);
  key('ap', [264, 0.01], [292, 0.008], [314.4, 0.008], [316, 0.004]);
  key('streak', [264, 0.01], [268, 0.012], [271.7, 0.03], [272.3, 0.012], [292, 0.012], [314.4, 0.02], [315.6, 0.07], [316.2, 0.03]);
  key('streakI', [264, 0.4], [314.4, 0.5]);
  key('zoom', [314.6, 0], [315.9, 0.12], [316.4, 0.02], [317, 0]);
  key('dust', [264, 0.8], [292, 1]);

  scene({ id: 'a5', start: 264, dur: 56 }, (S) => {
    const c = (t, ...a) => S.cue(t - 264, ...a);
    c(264.0, 'whoosh', { dur: 1.4, size: 0.5, gain: -10 });
    // 只在第一圈的四个节点轻轻"嘀"一声（交代"观察 → 思考 → 行动 → 检查"），之后换成一道连续的升调呼啸，越转越快越尖
    const t0n = W5.inv(264.6);
    const passT = (k) => W5.fwd(t0n + LOOP_TC * Math.log(1 + k / (4 * LOOP_A)));
    for (let k = 1; k <= 4; k++) c(passT(k), 'blip', { pitch: 1760, kind: 'tick', gain: -20 });
    c(passT(4) + 0.2, 'riser', { dur: 272.0 - passT(4) - 0.2, gain: -9 });
    c(272.0, 'impact', { size: 0.6, metal: 0.3, gain: -10 });
    c(266.3, 'chirp', { dur: 2.6, gain: -22 });                                       // 工具一个个接上：一道很轻的数据声，不再逐个发声
    c(272.0, 'whoosh', { dur: 1.0, size: 0.4, gain: -12 });
    CK.forEach((t) => c(t, 'click', { gain: -8 }));                        // 三次点击：搜索框、"搜索"、"周日"
    charCue(S, 'keys', [...SQ].map((_, m) => sqT(m)), { gain: -11, spaces: [...SQ].flatMap((ch, m) => (ch === ' ' ? [m] : [])) });
    c(CK[2] + 0.1, 'blip', { pitch: 1568, kind: 'confirm', gain: -13 });    // 选定"周日"
    c(276.0, 'whoosh', { dur: 1.0, size: 0.4, gain: -12 });
    MTOOLS.forEach((_, k) => c(276.3 + k * 0.12, 'blip', { pitch: 1568 + k * 60, kind: 'tick', gain: -18 }));
    c(280.0, 'whoosh', { dur: 1.0, size: 0.4, gain: -12 });
    TLINES.forEach((L, li) => charCue(S, li === 0 ? 'keys' : 'stream', TG.filter((g) => g.li === li && g.id).map((g) => g.t), { gain: li === 0 ? -12 : -16 }));
    c(283.16, 'blip', { pitch: 880, kind: 'error', gain: -12 });           // "✗" 出现的那一刻
    [0, 1, 2, 3].forEach((k) => c(283.2 + k * 0.5, 'blip', { pitch: 1320 + k * 220, kind: 'tick', gain: -12 }));
    c(286.06, 'blip', { pitch: 1760, kind: 'confirm', gain: -10 });        // "✓" 出现的那一刻
    c(292.0, 'whoosh', { dur: 1.6, size: 0.6, gain: -10 });
    MP.forEach((_, k) => c(mpT(k), k === MP.length - 1 ? 'impact' : 'blip', k === MP.length - 1 ? { size: 1.0, metal: 0.3, gain: -4 } : { pitch: PENTA[k], kind: 'ping', gain: -12 }));
    c(310.0, 'riser', { dur: 5.9, gain: -3 });
    c(315.2, 'reverse', { dur: 0.8, gain: -6 });

    title(S, '从回答问题，到完成任务。', { t0: 264.6, t1: 268.0, size: 56, weight: 300, ls: '0.14em', y: 930 });
    title(S, '智能体 = 模型 + 工具 + 循环', { t0: 268.3, t1: 271.8, size: 52, weight: 300, ls: '0.12em', y: 930 });
    title(S, '它能像人一样，自己操作电脑。', { t0: 272.5, t1: 275.9, size: 48, weight: 300, ls: '0.1em', y: 930 });
    title(S, '接上一个通用接口，就能用上一整圈工具。', { t0: 276.4, t1: 280.3, size: 46, weight: 300, ls: '0.08em', y: 930 });
    title(S, '它开始自己写代码、跑测试、提交。', { t0: 281.0, t1: 285.6, size: 48, weight: 300, ls: '0.1em', y: 930 });
    title(S, '能独立完成的任务，越来越长。', { t0: 293.2, t1: 297.6, size: 48, weight: 300, ls: '0.12em', y: 930 });
    title(S, '3 秒  →  12 小时', { t0: 309.4, t1: 315.6, size: 150, weight: 200, cls: 'num glow', ls: '0.04em', stagger: 0.05, inDur: 1.0, y: 175 });
  });

  // ---------------- 机能标注 ----------------
  chapter({ t0: 264.4, t1: 270.4, num: '05 / 06', title: '智能体', sub: '2024 — 2026' });
  LOOP.forEach((n, k) => tag({ t0: 264.8 + 0.15 * k, t1: 271.8, at: [cx + Math.cos(LA(k)) * (RR + 4.2), cy + Math.sin(LA(k)) * (RR + 3.4), cz], text: n, cls: 'cn tok', scramble: false }));
  TOOLS.forEach((n, k) => tag({ t0: 266.5 + k * 0.45, t1: 271.8, at: [TOOLP(k)[0] + (k < 3 ? -2.2 : 2.2), TOOLP(k)[1], cz], text: n, cls: 'cn dim', scramble: false, center: k < 3 ? 'right' : false }));
  tag({ t0: 272.4, t1: 275.9, at: [960, 150], text: '2024.10 · COMPUTER USE', cls: 'dim' });
  readout({ t0: 272.3, t1: 275.9, x: 96, y: 900, label: 'ACTION · 操作', value: (T) => (T < CK[0] ? '移动 → 搜索框' : T < sqT(0) ? '点击 · 搜索框'
    : T < 273.9 ? `输入 · ${[...SQ].filter((_, m) => T >= sqT(m)).join('')}` : T < CK[1] ? '移动 → 搜索' : T < 274.5 ? '点击 · 搜索'
    : T < 274.97 ? '读取 · 搜索结果' : T < CK[2] ? '移动 → 周日' : '选定 · 周日 多云 22°C') });
  tag({ t0: 276.4, t1: 279.9, at: [960, 150], text: '2024.11 · MCP · MODEL CONTEXT PROTOCOL', cls: 'dim' });
  tag({ t0: 276.5, t1: 279.9, at: [cx + 2.0, cy - 4.6, cz], text: 'MCP', cls: 'acc', scramble: false });   // 放在"设计稿"和"表格"两条线之间的空隙里（正下方会压在线上）
  MTOOLS.forEach((n, k) => tag({ t0: 276.5 + k * 0.12, t1: 279.9, at: [cx + Math.cos(MA(k)) * (MR + 5), cy + Math.sin(MA(k)) * (MR * 0.62 + 3.5), cz], text: n, cls: 'cn', scramble: false }));
  tag({ t0: 280.6, t1: 291.8, at: [960, 150], text: '2025.02 · CLAUDE CODE', cls: 'dim' });
  ['子智能体 1 · 写测试', '子智能体 2 · 改接口', '子智能体 3 · 更新文档', '子智能体 4 · 查性能'].forEach((n, k) =>
    tag({ t0: 284.0 + k * 0.5, t1: 291.8, at: [cx + TX0 + TW + 18.5, cy + THh / 2 - 3 - k * 9.5, cz], text: n, cls: 'cn dim', center: false, scramble: false }));
  tag({ t0: 286.8, t1: 291.8, at: [960, 1000], text: '官方案例：不到一天，迁移 68 万行代码（Opus 5.5）', cls: 'cn', scramble: false });
  tag({ t0: 292.8, t1: 309.3, at: [960, 110], text: '能独立完成的任务长度（50% 成功率）· 数据：METR，截至 2026.05', cls: 'dim cn', scramble: false });   // 大字出来时让位
  [[60, '1 分钟'], [3600, '1 小时'], [43200, '12 小时']].forEach(([s, t2], k) =>
    tag({ t0: 312.6 + 0.1 * k, t1: 314.4, at: [cx - 56, cy + MY(s), cz], text: t2, cls: 'dim cn', center: false, dx: -60, scramble: false }));
  readout({ t0: 293.2, t1: 309.3, x: 96, y: 170, label: '人类专家要做这么久的任务，它能独立完成（50% 成功率）', size: 58,
    value: (T) => { let k = 0; for (let n = 0; n < MP.length; n++) if (T >= mpT(n)) k = n; return `${MP[k][3]}`; } });
  // GPT-2、GPT-4 的标注提前退场：镜头沿曲线往上走时，这两个点会从画面左下方出去。
  // 标注放在曲线空着的一侧：曲线往右上走，所以 GPT-2、GPT-4 的标注放右下（原来放右上，压在下一段线上）；GPT-5 放左上、Opus 4.6 放右下
  const KEYM = [0, 3, 8, 10];                       // GPT-2 · GPT-4 · GPT-5 · Opus 4.6
  MP.forEach(([d, s, n, v], k) => KEYM.includes(k) && callout({ t0: mpT(k) + 0.1, t1: k === 0 ? mpT(3) + 0.3 : k === 3 ? mpT(7) : 314.4, at: [cx + MX(d), cy + MY(s), cz], dx: [90, 90, -80, 80][KEYM.indexOf(k)], dy: [50, 60, -60, 60][KEYM.indexOf(k)],
    title: v, sub: n, accent: k === MP.length - 1, size: k === MP.length - 1 ? 26 : 16 }));
  wline({ t0: 308.8, t1: 314.4, pts: () => [[cx + MX(2019), cy + MY(2.2), cz], [cx + MX(2026.6), cy + MY(90000), cz]], color: 'rgba(255,106,43,.7)', dash: '8 6' });
  tag({ t0: 309.0, t1: 314.4, at: [1500, 900], text: '约每 4~7 个月翻一倍', cls: 'acc cn', scramble: false });
}
