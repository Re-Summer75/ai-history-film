// 第 4 幕 · 竞赛（196 – 264 s）：2023 → 2026
// 地球化作一条时间跑道，镜头贴着跑道高速前进，两侧一根根发布光柱升起，名字踩着鼓点砸出来
// → 一次能读多长：几页纸 → 一本书 → 一整个代码库 → 同一个问题，四个时代 → 推理：先想，再答
import { SEGS, CAMK, LINES, key, FLASH, SHAKE, RINGS, FOCUS, distTo, CAMP, NM, TAU2, rA, rB, rC, rD, gX, gY, gZ, uX, uY, uZ } from '../film.js';
import { scene, typewriter, hash } from '../../../web/js/engine.js';
import { title, smooth, frac, h, E, clamp, lerp, seg, rng, charCue, typeTimes } from '../kit.js';
import { tag, chapter, bars, readout, callout, bracket, OCCL } from '../hud.js';
import { ball, onSeg, setCol } from '../geo.js';
import { project } from '../world.js';

const TX = 34, TY = -12, TZ0 = -210;                 // 跑道：2023.0 在 z = -210，每年向前 160
const zOf = (d) => TZ0 - (d - 2023) * 160;
const REL = [   // [年份小数, 名字, 日期, 是否大字]（日期见 FACTS.md，2026-09-28 复核）
  [2023.20, 'GPT-4', '2023.03', 1], [2023.20, 'Claude', '2023.03', 1], [2023.53, 'Claude 2', '2023.07', 0], [2023.55, 'Llama 2', '2023.07', 1],
  [2023.93, 'Gemini', '2023.12', 1], [2024.17, 'Claude 3', '2024.03', 1], [2024.36, 'GPT-4o', '2024.05', 1], [2024.47, 'Claude 3.5 Sonnet', '2024.06', 1],
  [2024.70, 'o1 · 推理模型', '2024.09', 1], [2024.81, 'Computer Use', '2024.10', 0], [2024.90, 'MCP', '2024.11', 0], [2025.05, 'DeepSeek-R1', '2025.01', 1],
  [2025.15, 'Claude Code', '2025.02', 1], [2025.39, 'Claude 4', '2025.05', 1], [2025.60, 'GPT-5', '2025.08', 1], [2025.74, 'Sonnet 4.5', '2025.09', 0],
  [2025.88, 'Gemini 3', '2025.11', 1], [2025.90, 'Opus 4.5', '2025.11', 1], [2026.10, 'Opus 4.6', '2026.02', 0], [2026.13, 'Gemini 3.1 Pro', '2026.02', 0],
  [2026.29, 'DeepSeek-V4', '2026.04', 0], [2026.31, 'GPT-5.5', '2026.04', 0], [2026.44, 'Claude Fable 5', '2026.06', 1], [2026.49, 'Sonnet 5', '2026.06', 0],
  [2026.56, 'Opus 5', '2026.07', 0], [2026.57, 'Kimi K3', '2026.07', 0],
  [2026.67, 'Fable 5.1', '2026.09', 1], [2026.68, 'GPT-6 Astra', '2026.09', 1], [2026.72, 'Opus 5.5', '2026.09', 1],
];
export const FRONT = 2026.66;                        // 2026 年 9 月的前沿：Fable 5.1（09-01）· GPT-6 Astra（09-03）· Opus 5.5（09-22）
// 大字只挑 10 个里程碑，每个至少停留 1.3 s；镜头沿跑道的"年份"随这些时刻变速（单调三次插值），
// 于是大字与正从身边经过的光柱始终对得上（大字自带日期，不再另设滚动的年份读数）
export const BIG = [   // [时刻, 年份小数, 大字, 小字, 大字盖住的光柱]；每 1.5 s（3 拍）一个，最后一个落在 214.0 的强拍
  [200.5, 2023.20, 'GPT-4 · Claude', '2023.03'], [202.0, 2023.93, 'Gemini', '2023.12'], [203.5, 2024.36, 'GPT-4o', '2024.05'],
  [205.0, 2024.70, 'o1 · 推理模型', '2024.09'], [206.5, 2025.05, 'DeepSeek-R1', '2025.01'], [208.0, 2025.15, 'Claude Code', '2025.02'],
  [209.5, 2025.60, 'GPT-5', '2025.08'], [211.0, 2025.89, 'Gemini 3 · Opus 4.5', '2025.11'], [212.5, 2026.44, 'Claude Fable 5', '2026.06'],
  // 结尾不替任何一家下结论：落在"此刻"的日期上，下面并列同一个月里的三个前沿模型
  [214.0, 2026.72, '2026.09', 'Claude Fable 5.1 · GPT-6 Astra · Claude Opus 5.5', ['Fable 5.1', 'GPT-6 Astra', 'Opus 5.5']],
];
const ANC = [[199.6, 2022.9], ...BIG.map(([t, d]) => [t - 0.3, d]), [216.4, 2026.8]];
const dateAt = (() => {                                  // Fritsch–Carlson 单调三次插值：速度连续、不会倒退
  const X = ANC.map((a) => a[0]), Y = ANC.map((a) => a[1]), n = X.length;
  const d = [], m = new Array(n);
  for (let k = 0; k < n - 1; k++) d.push((Y[k + 1] - Y[k]) / (X[k + 1] - X[k]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : 2 / (1 / d[k - 1] + 1 / d[k]);   // 相邻斜率的调和平均
  return (T) => {
    if (T <= X[0]) return Y[0];
    if (T >= X[n - 1]) return Y[n - 1];
    let k = 0; while (T > X[k + 1]) k++;
    const h = X[k + 1] - X[k], t = (T - X[k]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Y[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * Y[k + 1] + (t3 - t2) * h * m[k + 1];
  };
})();
const Tof = (date) => { let a = 200.4, b = 216.4; for (let k = 0; k < 40; k++) { const c = (a + b) / 2; if (dateAt(c) < date) a = c; else b = c; } return (a + b) / 2; };
const relT = (d) => Tof(d);
const camZ = (T) => zOf(dateAt(T)) + 110;
const PIL = REL.map(([d, n, dt, big], k) => ({ d, z: zOf(d), x: TX + (k % 2 ? 1 : -1) * (7 + 5 * frac(Math.sin(k * 3.7) * 99)), hgt: big ? 22 + 6 * frac(Math.sin(k * 7.1) * 57) : 13, t: relT(d) - 0.9, name: n, date: dt, big }));

function fTrack(i, T, o) {
  if (i < 16000) {                                    // 跑道主带
    const u = i / 16000;
    const z = TZ0 + 60 - u * 680 + frac(rA[i] + T * 0.05) * 0.8;
    o.x = TX + gX[i] * 0.7; o.y = TY + gY[i] * 0.06; o.z = z;
    setCol(o, 1, 0.66, 0.36, 0.55, 0.12);
  } else if (i < 24000) {                             // 两侧淡淡的光晕
    const u = (i - 16000) / 8000;
    o.x = TX + (rB[i] - 0.5) * 16; o.y = TY - 0.2; o.z = TZ0 + 60 - u * 680;
    setCol(o, 1, 0.7, 0.45, 0.08, 0.12);
  } else if (i < 24000 + PIL.length * 1300) {         // 发布光柱
    const q = i - 24000, k = Math.floor(q / 1300), P = PIL[k];
    const grow = E.p3o(seg(T, P.t, P.t + 0.7));
    const v = (q % 1300) / 1300;
    const top = v > 0.92;
    o.x = P.x + gX[i] * (top ? 0.45 : 0.18); o.z = P.z + gZ[i] * (top ? 0.45 : 0.18);
    o.y = TY + (top ? P.hgt + gY[i] * 0.45 : v / 0.92 * P.hgt) * grow;
    const front = P.d >= FRONT;                       // 最新的一批（同一个月的三家）一样亮，不偏向任何一家
    setCol(o, 1, front ? 0.5 : 0.8, front ? 0.2 : 0.62, grow > 0 ? (top ? 1.3 : 0.55) * (front ? 1.4 : 1) : 0, top ? 0.16 : 0.12);
  } else if (i < 24000 + PIL.length * 1300 + 4 * 2400) {   // 年份门：每到新的一年，穿过一道光门
    const q = i - 24000 - PIL.length * 1300, g = Math.floor(q / 2400), t = (q % 2400) / 2400;
    const z = zOf(2024 + g) + (g === 3 ? 0 : 0);
    const W = 34, Hh = 24, P = 2 * (W + Hh), d = t * P;
    let x, y;
    if (d < W) { x = -W / 2 + d; y = Hh; } else if (d < W + Hh) { x = W / 2; y = Hh - (d - W); }
    else if (d < 2 * W + Hh) { x = W / 2 - (d - W - Hh); y = 0; } else { x = -W / 2; y = d - 2 * W - Hh; }
    o.x = TX + x; o.y = TY + y; o.z = z;
    setCol(o, 0.9, 0.85, 0.8, g < 3 ? 0.35 : 0, 0.1);
  } else { ball(o, i, TX, TY, TZ0 - 300, 80); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}
function trackLines(T, L) {
  const k = 0.18 * smooth(seg(T, 199.5, 201)) * (1 - smooth(seg(T, 216.0, 217.0)));
  if (k <= 0) return;
  for (let m = 0; m <= 45; m++) {
    const z = zOf(2023 + m / 12);
    const w = m % 12 === 0 ? 5 : m % 3 === 0 ? 2.4 : 1.2;
    const kk = k * (m % 12 === 0 ? 1.4 : 0.7);
    L.seg(TX - w, TY, z, kk, kk * 0.8, kk * 0.6, TX + w, TY, z, kk, kk * 0.8, kk * 0.6);
  }
}

// ---------------------------------------------------------------- 一次能读多长
const CC = [TX, 2, -870];
function page(o, i, cx, cy, cz, n) {                  // 一页纸：14 行"文字"
  const row = Math.floor(n * 14), t = frac(n * 14);
  const lineLen = 0.55 + 0.4 * frac(Math.sin(row * 12.7 + cx) * 91);
  o.x = cx - 4 + t * 8 * lineLen; o.y = cy + 5 - row * 0.72 - 0.35; o.z = cz;
  o.x += gX[i] * 0.03; o.y += gY[i] * 0.03;
}
const CITY = [];
{ const R = rng(9); for (let a = 0; a < 12; a++) for (let b = 0; b < 8; b++) CITY.push([(a - 5.5) * 5.2, (b - 3.5) * 5.2, 1 + 7 * Math.pow(R(), 1.8)]); }
// 粒子按楼高分配（高楼不再稀稀拉拉）；每栋楼朝镜头的两面墙上是一行行长短不一、有缩进的"代码"
const BK = new Uint8Array(36000);
{ const cum = []; let acc = 0; const tot = CITY.reduce((a, c) => a + c[2], 0); CITY.forEach((c) => cum.push((acc += c[2]) / tot)); let k = 0; for (let i = 0; i < 36000; i++) { while (k < cum.length - 1 && (i + 0.5) / 36000 > cum[k]) k++; BK[i] = k; } }
const citySweep = (T) => lerp(-44, 44, seg(T, 221.7, 223.5));   // 一道光从左到右扫过整座城：一次读完整个代码库
const fContext = (ph) => (i, T, o) => {
  const [cx, cy, cz] = CC;
  if (i >= 36000) { ball(o, i, cx, cy, cz, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); return; }
  if (ph === 0) {                                     // 4K：三页纸
    const k = i % 3;
    page(o, i, cx - 10 + k * 10, cy, cz, rB[i]);
    setCol(o, 1, 0.86, 0.72, i < 9000 ? 0.7 : 0, 0.1);
  } else if (ph === 1) {                              // 200K：一本书（一叠纸的侧面与顶面）
    const f = rC[i];
    if (f < 0.55) { page(o, i, cx, cy, cz + 3.6 - rD[i] * 7.2, rB[i]); setCol(o, 1, 0.86, 0.72, 0.18, 0.1); }
    else { o.x = cx + (rA[i] - 0.5) * 8; o.y = cy + (rB[i] < 0.5 ? 5.4 : -5.4); o.z = cz + (rD[i] - 0.5) * 7.2; setCol(o, 1, 0.8, 0.6, 0.35, 0.1); }
  } else {                                            // 1M：一整座"代码城市"
    const k = BK[i], [bx, bz, bh] = CITY[k], H = bh * 2;
    const grow = E.p3o(seg(T, 220.6 + 0.012 * k, 221.6 + 0.012 * k));
    const rows = Math.max(2, Math.round(H / 0.85)), row = Math.floor(rD[i] * rows), side = rA[i] < 0.5 ? 0 : 1;
    const hs = frac(Math.sin(k * 12.9898 + side * 78.233 + row * 37.719) * 43758.5453);
    const ind = hs < 0.35 ? 0 : hs < 0.65 ? 0.14 : 0.28, len = 0.35 + 0.6 * frac(hs * 7.13);   // 缩进、行长
    const u = -1.6 + 3.2 * (ind + (1 - ind) * len * rB[i]);
    o.x = cx + bx + (side ? 1.8 : u) + gX[i] * 0.02; o.z = cz + bz + (side ? -u : 1.8) + gZ[i] * 0.02;
    o.y = cy - 9 + ((row + 0.5) / rows) * H * grow + gY[i] * 0.02;         // 整座城放低一点：高楼不顶到上面的两行字
    const sw = T > 221.6 && T < 223.8 ? Math.exp(-((bx - citySweep(T)) ** 2) / 20) : 0;
    setCol(o, 1 + 0.35 * sw, 0.8 + 0.3 * sw, 0.58 + 0.3 * sw, (0.62 + 1.1 * sw) * grow, 0.11);
  }
};

// ---------------------------------------------------------------- 同一个问题，四个时代
const ERAS = [
  { t0: 225.6, t1: 230.4, tag: '1966 · ELIZA', col: [1, 0.66, 0.28], text: '你为什么想去杭州？', cps: 9, cls: 'era-eliza',
    cap: [0.1, 0.02, 0, 0] },
  { t0: 230.6, t1: 235.4, tag: '2019 · GPT-2', col: [0.6, 0.7, 0.95], text: '杭州是一个美丽的城市。杭州是一个美丽的城市，西湖是一个美丽的湖，杭州是……', cps: 18, cls: 'era-gpt2',
    cap: [0.3, 0.1, 0, 0] },
  { t0: 235.6, t1: 240.8, tag: '2022 · ChatGPT', col: [1, 0.9, 0.8], text: '当然！第一天上午游西湖，下午去灵隐寺；晚上逛河坊街。第二天去龙井村喝茶，再到西溪湿地走走。', cps: 22, cls: 'era-cgpt',
    cap: [0.75, 0.5, 0.1, 0.05] },
  { t0: 241.0, t1: 247.8, tag: '2026 · Claude Opus 5.5', col: [1, 0.5, 0.18], text: '查到周六有小雨，西湖改到周日上午。比较了 3 趟高铁和 2 家评分 4.7 以上的酒店，行程和预算表已经生成。需要我直接预订吗？', cps: 20, cls: 'era-now',
    cap: [0.95, 0.9, 0.9, 0.8] },
];
const eraAt = (T) => { let k = 0; ERAS.forEach((e, n) => { if (T >= e.t0 - 0.2) k = n; }); return k; };
function fDialog(i, T, o) {
  const [cx, cy, cz] = CC;
  const W = 66, Hh = 21;
  const k = eraAt(T), E0 = ERAS[k];
  if (i < 12000) {                                    // 卡片的光边框
    const t = i / 12000, P = 2 * (W + Hh), d = t * P;
    let x, y;
    if (d < W) { x = -W / 2 + d; y = Hh / 2; } else if (d < W + Hh) { x = W / 2; y = Hh / 2 - (d - W); }
    else if (d < 2 * W + Hh) { x = W / 2 - (d - W - Hh); y = -Hh / 2; } else { x = -W / 2; y = -Hh / 2 + (d - 2 * W - Hh); }
    o.x = cx + x + gX[i] * 0.04; o.y = cy - 2 + y + gY[i] * 0.04; o.z = cz + gZ[i] * 0.04;
    const pulse = 1 + 1.2 * Math.exp(-Math.max(0, T - E0.t0) / 0.35);
    setCol(o, E0.col[0], E0.col[1], E0.col[2], 0.55 * pulse * smooth(seg(T, 223.8, 224.7)), 0.1);
  } else if (i < 30000) {                             // 背景：一片随时代变色的光尘
    o.x = cx + (rA[i] - 0.5) * 150; o.y = cy + (rB[i] - 0.5) * 90; o.z = cz - 30 - rC[i] * 80;
    setCol(o, E0.col[0], E0.col[1], E0.col[2], 0.1 + 0.08 * Math.sin(T * 1.3 + i), 0.14);
  } else { ball(o, i, cx, cy, cz - 60, 50); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}

// ---------------------------------------------------------------- 推理：先想，再答（思维树）→ 两张成绩卡片
// IMO 2025：6 道题 × 7 分 = 42 个点，一题一列、自下而上亮起；解出 5 题 = 35 分（金牌分数），第 6 列保持暗（FACTS.md）
// ICPC 2025：12 道题一行 12 个点；上面一行 AI、下面一行人类冠军，两行同时从左往右亮——人类停在 11，AI 亮到 12
export const CAP_T = [258.5, 260.5];
const IMO_X = -17, ICPC_X = 20.5, CAP_Y = 1.5;
const imoDot = (c, r) => [CC[0] + IMO_X + (c - 2.5) * 3.2, CC[1] + CAP_Y + (r - 3) * 2.4, CC[2]];
const imoT = (c, r) => CAP_T[0] + 0.25 + (c * 7 + r) * (1.25 / 34);   // 第 35 个点 = 原来的 260.0 = 成片 286.0（拍点）
const icpcDot = (row, k) => [CC[0] + ICPC_X + (k - 5.5) * 2.6, CC[1] + CAP_Y + (row ? -3.4 : 3.4), CC[2]];
// 两行一起往右亮，第 11 个点落在成片 287.25（人类冠军停在这里）→ 停顿四分之一秒 → AI 的第 12 个点落在拍点 287.5
// （第 12 个点 = 原来的 261.455：261.3 之后进入减速段，所以不是简单的 +26）
const icpcT = (k) => (k < 11 ? CAP_T[1] + 0.1 + k * 0.065 : CAP_T[1] + 0.955);
function fCaps(i, T, o) {
  const out = 1;                                    // 不淡出：下一幕开始时整块板直接被卷进循环（避免空窗）
  if (i < 42 * 300) {                                  // IMO：42 个点
    const n = Math.floor(i / 300), c = Math.floor(n / 7), r = n % 7;
    const [x, y, z] = imoDot(c, r), solved = c < 5, t = imoT(c, r);
    const on = solved ? smooth(seg(T, t, t + 0.12)) : 0;
    const pop = solved && T > t ? 1 + 1.6 * Math.exp(-(T - t) / 0.18) : 1;
    ball(o, i, x, y, z, 0.52 * pop);
    const appear = smooth(seg(T, CAP_T[0] - 0.4, CAP_T[0] + 0.15));
    setCol(o, 1, lerp(0.8, 0.62, on), lerp(0.7, 0.3, on), (0.1 + 1.15 * on * pop) * appear * out, 0.12);
    return;
  }
  if (i < 42 * 300 + 24 * 400) {                       // ICPC：两行 × 12 个点
    const n = Math.floor((i - 42 * 300) / 400), row = Math.floor(n / 12), k = n % 12, ai = row === 0;
    const [x, y, z] = icpcDot(row, k), solved = ai || k < 11, t = icpcT(k);
    const on = solved ? smooth(seg(T, t, t + 0.12)) : 0;
    const last = ai && k === 11;
    const pop = solved && T > t ? 1 + (last ? 3.2 : 1.4) * Math.exp(-(T - t) / (last ? 0.45 : 0.18)) : 1;
    ball(o, i, x, y, z, 0.58 * pop);
    const appear = smooth(seg(T, CAP_T[1] - 0.4, CAP_T[1] + 0.15));
    setCol(o, 1, ai ? lerp(0.8, 0.55, on) : 0.92, ai ? lerp(0.7, 0.22, on) : 0.88, (0.1 + (ai ? 1.2 : 0.75) * on * pop) * appear * out, 0.12);
    return;
  }
  ball(o, i, CC[0], CC[1], CC[2] - 60, 50); setCol(o, 1, 0.8, 0.6, 0, 0.12);
}
// ---------------------------------------------------------------- 推理：先想，再答——平行的世界线（带一个彩蛋）
// 从"问题"分出 7 条平行的世界线（每条 = 一种想法），向右是"想下去"。思考的火花沿一条线往前走，走进死路就变红、这条线的未来崩塌，
// 火花在同一时刻跳到另一条世界线上继续（世界线变动）；最后在夹缝里那条没被观测过的线上走到头 = 找到答案，一路走过的折线亮成金色。
// 顶上的辉光管读数是这条世界线的"变动率"：0.571024 → 0.337187 → 1.130205 → 1.048596（彩蛋：数值取自某部作品的设定）
const WX0 = -36, WXF = -24, WXE = 34;                // 起点（问题）、分叉完成处、终点（答案）
const WY = [15, 10, 5, 0, -5, -10, -15, -2.5];       // 7 条看得见的世界线 + 夹在 0 和 -5 之间的第 8 条
const WHID = 7;                                      // 第 8 条：夹缝里没被观测过的那条线——火花到达之前它不存在
const wlY = (k, x) => WY[k] * smooth(clamp((x - WX0) / (WXF - WX0)));
// 火花走过的四段：[世界线, 起点 x, 终点 x, 出发时刻, 到达时刻]；到达之后停 0.1 s（死路），下一段在同一个 x 跳到另一条线上
export const WSEG = [[2, WX0, -10, 249.6, 250.9], [5, -10, 2, 251.0, 252.4], [1, 2, 14, 252.5, 253.9], [WHID, 14, WXE, 254.0, 256.0]];
export const WANS = 256.0;                           // 走到头、找到答案（成片 282.0，正好是配乐换到 F 和弦的拍点）
const WREV = (T) => lerp(WX0, WXE, E.p3o(seg(T, 248.4, 249.5)));   // 世界线从问题处向右长出来
const wlOut = (T) => 1 - smooth(seg(T, 257.9, 258.7));
const wlWin = (T) => smooth(seg(T, WANS, WANS + 0.5));
function sparkAt(T) {                                // 火花的位置 [x, y, 第几段, 是否停在死路]
  for (let n = WSEG.length - 1; n >= 0; n--) {
    const [k, xa, xb, ta, tb] = WSEG[n];
    if (T < ta) continue;
    const u = E.p2(seg(T, ta, tb)), x = lerp(xa, xb, u);
    return [x, wlY(k, x), n, T >= tb && n < WSEG.length - 1];
  }
  return [WX0, 0, -1, false];
}
const dead = (k) => WSEG.findIndex((s, n) => s[0] === k && n < WSEG.length - 1);   // 这条线是不是死路（第几段）
function wlState(k, x, T) {                          // 世界线上 x 处的亮度 [底色, 是否在最终路径上, 崩塌进度]
  const n = dead(k);
  if (n >= 0) {
    const [, xa, xb, , tb] = WSEG[n];
    if (x > xb) return [0.12, 0, smooth(seg(T, tb, tb + 0.6))];                      // 死路的"未来"：崩塌
    const onPath = x >= xa ? 1 : 0;
    return [T >= tb ? 0.07 : 0.12, onPath, 0];
  }
  const fin = WSEG[WSEG.length - 1];
  if (k === fin[0]) return [0.14, x >= fin[1] ? 1 : 0, 0];
  return [0.12, 0, 0];
}
function wlSeen(k, x, T) {
  if (k !== WHID) return 1;
  const fin = WSEG[WSEG.length - 1];
  if (x < fin[1] || T < fin[3]) return 0;
  return smooth(clamp((sparkAt(T)[0] + 1.5 - x) / 1.5));
}
function fWorld(i, T, o) {
  const [cx, cy, cz] = CC;
  const out = wlOut(T), win = wlWin(T), xr = WREV(T);
  if (i < 20800) {                                    // 世界线上缓缓向右流动的光点（时间在往前走）：8 条 × 2600
    const k = Math.floor(i / 2600);
    const x = WX0 + (WXE - WX0) * frac(rA[i] + (T - 248) * 0.05 * (0.6 + 0.8 * rB[i]));
    let y = wlY(k, x) + gY[i] * 0.07;
    const [base, onPath, col] = wlState(k, x, T);
    let xx = x, a = x < xr ? base * 1.6 : 0;
    const [sx, , sn] = sparkAt(T);
    if (sn >= 0 && k === WSEG[sn][0] && x <= sx && x >= WSEG[sn][1]) a += 0.35;          // 火花走过的地方亮起来
    if (col > 0) { xx += col * 5 * rD[i]; y += (rC[i] - 0.5) * 7 * col; a *= (1 - col) * (0.5 + 0.5 * Math.sin(T * 60 + i)); }   // 崩塌：抖动、散开、熄灭
    if (win > 0) a = lerp(a, onPath ? 1.1 : 0.03, win);
    o.x = cx + xx + gX[i] * 0.05; o.y = cy + y; o.z = cz + gZ[i] * 0.05;
    const gold = onPath * win;
    setCol(o, lerp(0.85, 1.2, gold), lerp(0.88, 0.62, gold), lerp(1.0, 0.25, gold), a * out * wlSeen(k, x, T), 0.1);
    return;
  }
  if (i < 22600) {                                    // 火花：亮核 + 沿走过的路拖一条尾巴（跳线时尾巴是一道竖直的光）
    const q = i - 20800, tail = q < 700 ? 0 : (q - 700) / 1100;
    const [x, y, sn, stuck] = sparkAt(T - tail * 0.35);
    const on = T >= 249.55 && T < WANS + 0.35 ? 1 : 0;
    ball(o, i, cx + x, cy + y, cz, tail ? 0.25 : 0.55);
    const red = stuck ? 1 : 0;
    setCol(o, 1.3, lerp(1.1, 0.35, red), lerp(0.9, 0.2, red), on * out * (tail ? 0.6 * (1 - tail) : 1.3), 0.12);
    void sn;
    return;
  }
  if (i < 23500) {                                    // 三次跳线留下的竖线（跳的一瞬间最亮，之后留一道淡的；找到答案时成为金色路径的一部分）
    const n = Math.floor((i - 22600) / 300), s = WSEG[n], s2 = WSEG[n + 1], u = ((i - 22600) % 300) / 299;
    const x = s[2], ya = wlY(s[0], x), yb = wlY(s2[0], x), tj = s2[3];
    o.x = cx + x + gX[i] * 0.04; o.y = cy + lerp(ya, yb, u); o.z = cz + gZ[i] * 0.04;
    const a = T < tj ? 0 : 0.12 + 1.6 * Math.exp(-(T - tj) / 0.15);
    setCol(o, lerp(1.1, 1.2, win), lerp(0.95, 0.62, win), lerp(1.0, 0.25, win), lerp(a, 1.0, win) * out, 0.1);
    return;
  }
  if (i < 24400) {                                    // 问题
    ball(o, i, cx + WX0, cy, cz, 1.0);
    setCol(o, 1, 0.85, 0.7, smooth(seg(T, 248.3, 248.6)) * 0.9 * out, 0.12);
    return;
  }
  if (i < 25900) {                                    // 答案：在那条没被观测过的线的尽头
    ball(o, i, cx + WXE, cy + WY[WHID], cz, 1.3);
    const on = T >= WANS, pop = on ? 1 + 3 * Math.exp(-(T - WANS) / 0.15) : 0;
    setCol(o, 1.2, 0.62, 0.25, on * pop * out, 0.14);
    return;
  }
  ball(o, i, cx, cy, cz - 60, 50); setCol(o, 1, 0.8, 0.6, 0, 0.12);
}
function worldLines(T, L) {                          // 世界线本身（细线）：长出来、崩塌、最终路径变金
  const [cx, cy, cz] = CC;
  const out = wlOut(T), win = wlWin(T), xr = WREV(T);
  for (let k = 0; k < WY.length; k++) {
    const st = k === WHID ? 0.25 : 1;
    for (let x = WX0; x < WXE - 1e-6; x += st) {
      const x2 = x + st;
      if (x >= xr) break;
      const seen = wlSeen(k, x + st / 2, T);
      if (seen <= 0) continue;
      const [base, onPath, col] = wlState(k, x + st / 2, T);
      let a = base * (col > 0 ? (1 - col) * (Math.sin(T * 47 + x * 3.1 + k) > 0 ? 1 : 0.2) : 1);
      if (win > 0) a = lerp(a, onPath ? 0.75 : 0.02, win);
      a *= out * seen;
      if (a < 0.004) continue;
      const g = onPath * win, r = a * lerp(0.85, 1.2, g), gg = a * lerp(0.9, 0.62, g), b = a * lerp(1.0, 0.25, g);
      L.seg(cx + x, cy + wlY(k, x), cz, r, gg, b, cx + x2, cy + wlY(k, x2), cz, r, gg, b);
    }
  }
}

// ---------------------------------------------------------------- 世界线变动率：立体的辉光管（彩蛋）
// 线条画的玻璃管（圆柱 + 圆顶 + 侧面高光）立在一块底座上；每根管里 0–9 十个数字阴极前后叠放（真实辉光管的结构），
// 没点亮的是很淡的金属丝，点亮的那个发橙色辉光。仪器在三维场景里，镜头移动时叠放的数字有视差；跳线时数字在不同深度间闪烁
const NX_DV = ['0.571024', '0.337187', '1.130205', '1.048596'];   // 辉光管依次显示的四个数（彩蛋）
const NX_XC = 1, NX_YB = 19.5, NX_H = 5.0, NX_R = 1.4, NX_W = 3.2;   // 仪器中心 x、管底 y、管高、管半径、管间距
const NX_ORDER = [1, 6, 2, 7, 5, 0, 4, 9, 8, 3];                // 阴极从前到后的叠放顺序
const arcP = (x0, y0, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [x0 + rx * Math.cos(a), y0 + ry * Math.sin(a)]; });
const quadP = (p0, p1, p2, n) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n, u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; });
const PI = Math.PI;
const NX_DIG = [                                      // 每个数字 = 若干条折线（在 1.6 × 2.9 的框里，原点在中心）
  [arcP(0, 0, 0.72, 1.42, 0, 2 * PI, 32)],
  [[[-0.35, 1.0], [0.08, 1.42], [0.08, -1.42]]],
  [[...arcP(0, 0.72, 0.7, 0.7, PI * 0.9, -PI * 0.28, 14), [-0.74, -1.42], [0.76, -1.42]]],
  [[[-0.68, 1.42], [0.7, 1.42], [0.0, 0.2], ...arcP(0, -0.62, 0.78, 0.8, PI * 0.5, -PI * 0.85, 16)]],
  [[[0.35, -1.42], [0.35, 1.42], [-0.76, -0.55], [0.8, -0.55]]],
  [[[0.7, 1.42], [-0.6, 1.42], [-0.7, 0.12], ...arcP(0, -0.6, 0.76, 0.82, PI * 0.72, -PI * 0.85, 16)]],
  [[...quadP([0.6, 1.42], [-0.74, 0.9], [-0.7, -0.7], 12), ...arcP(0, -0.7, 0.7, 0.72, PI, -PI, 22)]],
  [[[-0.76, 1.42], [0.76, 1.42], [-0.24, -1.42]]],
  [arcP(0, 0.8, 0.54, 0.62, 0, 2 * PI, 22), arcP(0, -0.66, 0.7, 0.78, 0, 2 * PI, 24)],
  [[...arcP(0, 0.7, 0.7, 0.72, 0, 2 * PI, 22), ...quadP([0.7, 0.7], [0.74, -0.7], [-0.54, -1.42], 12)]],
];
// 正视图：整台仪器正对这一段镜头的平均位置（镜头在它下方约 15.5°，所以朝镜头仰 0.27 弧度），再加细微的摆动——
// 像悬在空中轻轻晃（左右 ±4°、前后 ±2°、滚转 ±0.7°，周期 5–7 s，互不同步）。底座按真实遮挡只画看得见的边
const NX_C = [CC[0] + NX_XC, CC[1] + NX_YB + NX_H * 0.45, CC[2]], NX_P0 = 0.27, NX_Y0 = -0.007;
let NXT = NaN, NXP = NX_P0, NXY = NX_Y0, NXR = 0;
function nxPose(T) {
  if (T === NXT) return;
  NXT = T;
  NXP = NX_P0 + 0.035 * Math.sin((2 * PI * T) / 7.1 + 1.0);
  NXY = NX_Y0 + 0.07 * Math.sin((2 * PI * T) / 5.3);
  NXR = 0.012 * Math.sin((2 * PI * T) / 6.2 + 0.5);
}
function nxXf(a) {
  const x = a[0] - NX_C[0], y = a[1] - NX_C[1], z = a[2] - NX_C[2];
  const y1 = y * Math.cos(NXP) - z * Math.sin(NXP), z1 = y * Math.sin(NXP) + z * Math.cos(NXP);   // 绕 x 轴：朝镜头仰
  const x2 = x * Math.cos(NXY) + z1 * Math.sin(NXY), z2 = -x * Math.sin(NXY) + z1 * Math.cos(NXY);   // 绕 y 轴：左右摆
  const x3 = x2 * Math.cos(NXR) - y1 * Math.sin(NXR), y3 = x2 * Math.sin(NXR) + y1 * Math.cos(NXR);     // 绕视线：轻轻滚转
  return [NX_C[0] + x3, NX_C[1] + y3, NX_C[2] + z2];
}
function nixieLines(T, L) {
  const [cx, cy, cz] = CC;
  const vis = smooth(seg(T, 249.0, 249.5)) * (1 - smooth(seg(T, 257.9, 258.4)));
  if (vis < 0.01) return;
  let kv = -1;
  for (let n = 0; n < WSEG.length; n++) if (T >= WSEG[n][3]) kv = n;
  const lock = T >= WANS ? Math.exp(-(T - WANS) / 0.7) : 0;
  nxPose(T);
  const z0 = cz;
  const S3 = (a, b, r, g, bl) => { const A = nxXf(a), B = nxXf(b); L.seg(A[0], A[1], A[2], r, g, bl, B[0], B[1], B[2], r, g, bl); };   // 真 3D：整台仪器转一个角度再画
  const wid = (m) => (m === 1 ? NX_W * 0.5 : NX_W);
  let total = 0;
  for (let m = 0; m < 8; m++) total += wid(m);
  const yb = cy + NX_YB, glass = 0.075 * vis;
  // 底座：一个扁长的实心盒子——只画朝着镜头的面的边（背后被挡住的边不画，正面看就是干净的一块）
  {
    const x0 = cx + NX_XC - total / 2 - 0.7, x1 = cx + NX_XC + total / 2 + 0.7, y0 = yb - 1.1, y1 = yb, zA = z0 - 1.6, zB = z0 + 1.6, k = 0.12 * vis;
    const P = [[x0, y0, zA], [x1, y0, zA], [x1, y1, zA], [x0, y1, zA], [x0, y0, zB], [x1, y0, zB], [x1, y1, zB], [x0, y1, zB]];
    const W = P.map(nxXf), mid = (ids) => ids.reduce((m, q) => [m[0] + W[q][0] / 4, m[1] + W[q][1] / 4, m[2] + W[q][2] / 4], [0, 0, 0]);
    const cxW = mid([0, 1, 2, 3, 4, 5, 6, 7].slice(0, 4)).map((v, d) => (v + mid([4, 5, 6, 7])[d]) / 2);
    const FACES = { back: [0, 1, 2, 3], front: [4, 5, 6, 7], bottom: [0, 1, 5, 4], top: [3, 2, 6, 7], left: [0, 3, 7, 4], right: [1, 2, 6, 5] };
    const seen = {};
    for (const [nm, ids] of Object.entries(FACES)) {       // 面朝镜头：面中心指向外的方向和"指向镜头"的方向同向
      const fc = mid(ids), nrm = [fc[0] - cxW[0], fc[1] - cxW[1], fc[2] - cxW[2]];
      seen[nm] = nrm[0] * (CAMP.x - fc[0]) + nrm[1] * (CAMP.y - fc[1]) + nrm[2] * (CAMP.z - fc[2]) > 0;
    }
    const EDGES = [[0, 1, 'back', 'bottom'], [1, 2, 'back', 'right'], [2, 3, 'back', 'top'], [3, 0, 'back', 'left'],
      [4, 5, 'front', 'bottom'], [5, 6, 'front', 'right'], [6, 7, 'front', 'top'], [7, 4, 'front', 'left'],
      [0, 4, 'bottom', 'left'], [1, 5, 'bottom', 'right'], [2, 6, 'top', 'right'], [3, 7, 'top', 'left']];
    for (const [a, b, f1, f2] of EDGES) if (seen[f1] || seen[f2]) S3(P[a], P[b], k, k * 0.92, k * 0.85);
  }
  let x = cx + NX_XC - total / 2;
  for (let m = 0; m < 8; m++) {
    const tx = x + wid(m) / 2; x += wid(m);
    const R = m === 1 ? NX_R * 0.45 : NX_R, H = m === 1 ? NX_H * 0.8 : NX_H, yt = yb + H;
    // 玻璃管：6 条竖线 + 底圈 + 顶圈 + 圆顶的 4 条经线；左前方一道高光
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * 2 * PI, px = tx + R * Math.cos(a), pz = z0 + R * Math.sin(a);
      const edge = Math.abs(Math.sin(a)) < 0.2 ? 1.6 : 1;               // 左右两侧的轮廓线稍亮
      S3([px, yb, pz], [px, yt, pz], glass * edge, glass * edge * 0.95, glass * edge * 0.9);
    }
    for (const yy of [yb, yt]) for (let s = 0; s < 20; s++) {
      const a0 = (s / 20) * 2 * PI, a1 = ((s + 1) / 20) * 2 * PI;
      S3([tx + R * Math.cos(a0), yy, z0 + R * Math.sin(a0)], [tx + R * Math.cos(a1), yy, z0 + R * Math.sin(a1)], glass, glass * 0.95, glass * 0.9);
    }
    for (let s = 0; s < 4; s++) {
      const th = (s / 4) * 2 * PI;
      for (let q = 0; q < 6; q++) {
        const f0 = (q / 6) * PI / 2, f1 = ((q + 1) / 6) * PI / 2;
        S3([tx + R * Math.cos(f0) * Math.cos(th), yt + 0.85 * R * Math.sin(f0), z0 + R * Math.cos(f0) * Math.sin(th)],
           [tx + R * Math.cos(f1) * Math.cos(th), yt + 0.85 * R * Math.sin(f1), z0 + R * Math.cos(f1) * Math.sin(th)], glass, glass * 0.95, glass * 0.9);
      }
    }
    { const a = PI * 0.78, px = tx + R * 0.92 * Math.cos(a), pz = z0 + R * 0.92 * Math.sin(a) + 0.4, hk = 0.16 * vis; S3([px, yb + 0.5, pz], [px, yt - 0.3, pz], hk, hk, hk * 1.05); }
    const yc = yb + H * 0.52;
    if (m === 1) {                                     // 小数点那一管：一个一直亮着的点
      const dp = arcP(tx, yb + 0.55, 0.13, 0.13, 0, 2 * PI, 10), k = 1.4 * vis * (1 + 1.2 * lock);
      for (let q = 0; q < dp.length - 1; q++) S3([dp[q][0], dp[q][1], z0], [dp[q + 1][0], dp[q + 1][1], z0], k, k * 0.45, k * 0.12);
      continue;
    }
    const settle = kv < 0 ? 1e9 : WSEG[kv][3] + 0.1 + (0.08 * Math.max(0, m - 1)) / 1.5;
    const lit = T < settle ? Math.floor(hash(Math.floor(T * 24), m, 7) * 10) : +NX_DV[kv][m];
    NX_ORDER.forEach((dg, k) => {                    // 十个阴极前后叠放
      const dz = 0.5 - k * 0.11, on = dg === lit;
      const kk = on ? 1.35 * vis * (1 + 1.2 * lock) : 0.05 * vis;
      const r = kk, g = kk * (on ? 0.45 : 0.62), bl = kk * (on ? 0.12 : 0.45);
      const offs = on ? [[0, 0], [0.035, 0.02], [-0.035, -0.02]] : [[0, 0]];   // 点亮的那个画三遍：灯丝更粗、辉光更足
      for (const path of NX_DIG[dg]) for (const [ox, oy] of offs) for (let q = 0; q < path.length - 1; q++) {
        S3([tx + path[q][0] + ox, yc + path[q][1] + oy, z0 + dz], [tx + path[q + 1][0] + ox, yc + path[q + 1][1] + oy, z0 + dz], r, g, bl);
      }
    });
  }
}

export function a4() {
  SEGS.push({ t: 198.3, form: fTrack, tr: { type: 'swirl', dur: 1.4, spread: 0.7, amp: 12 } });
  SEGS.push({ t: 216.0, form: fContext(0), tr: { type: 'swirl', dur: 1.2, spread: 0.6, amp: 6 } });
  SEGS.push({ t: 218.4, form: fContext(1), tr: { type: 'morph', dur: 0.8, spread: 0.5 } });
  SEGS.push({ t: 220.6, form: fContext(2), tr: { type: 'morph', dur: 0.9, spread: 0.6 } });
  SEGS.push({ t: 224.0, form: fDialog, tr: { type: 'swirl', dur: 1.3, spread: 0.7, amp: 8 } });
  SEGS.push({ t: 248.0, form: fWorld, tr: { type: 'swirl', dur: 1.4, spread: 0.7, amp: 8 } });
  SEGS.push({ t: 258.0, form: fCaps, tr: { type: 'swirl', dur: 1.1, spread: 0.6, amp: 7 } });   // 想通之后：世界线散开，聚成两块计分板
  LINES.push({ t0: 199.5, t1: 217.0, fn: trackLines });
  LINES.push({ t0: 220.6, t1: 224.2, fn: (T, L) => {       // 代码城市：每栋楼看得见的三条竖边 + 楼顶（扫过的时候亮一下）
    const out = (1 - smooth(seg(T, 223.6, 224.1))) * smooth(seg(T, 221.0, 221.7));   // 等粒子到位了再亮边框
    CITY.forEach(([bx, bz, bh], k) => {
      const grow = E.p3o(seg(T, 220.6 + 0.012 * k, 221.6 + 0.012 * k));
      if (grow < 0.02) return;
      const sw = T > 221.6 && T < 223.8 ? Math.exp(-((bx - citySweep(T)) ** 2) / 20) : 0;
      const a = (0.14 + 0.5 * sw) * out * grow, r = a, g = a * 0.8, b = a * 0.6;
      const x0 = CC[0] + bx - 1.9, x1 = CC[0] + bx + 1.9, z0 = CC[2] + bz - 1.9, z1 = CC[2] + bz + 1.9, y0 = CC[1] - 9, y1 = CC[1] - 9 + bh * 2 * grow;
      for (const [x, z] of [[x0, z1], [x1, z1], [x1, z0]]) L.seg(x, y0, z, r, g, b, x, y1, z, r, g, b);
      L.seg(x0, y1, z1, r, g, b, x1, y1, z1, r, g, b); L.seg(x1, y1, z1, r, g, b, x1, y1, z0, r, g, b);
      L.seg(x1, y1, z0, r, g, b, x0, y1, z0, r, g, b); L.seg(x0, y1, z0, r, g, b, x0, y1, z1, r, g, b);
    });
  } });
  LINES.push({ t0: 248.3, t1: 258.8, fn: worldLines }, { t0: 248.9, t1: 258.5, fn: nixieLines });

  const [cx, cy, cz] = CC;
  for (let t = 200.4; t < 216.39; t += 0.4) {            // 密集关键帧：镜头严格跟随变速的"年份"
    const u = (t - 200.4) / 16, sway = Math.sin(u * 9) * 3.5, hgt = 16 - 5 * Math.sin(u * Math.PI);
    CAMK.push({ t, p: [TX + sway, TY + hgt, camZ(t)], q: [TX, TY + 3 + 3 * u, camZ(t) - 200], fov: 58 + 5 * Math.sin(u * Math.PI), roll: 0.035 * Math.sin(u * 7) });
  }
  CAMK.push(
    { t: 216.4,  p: [TX, TY + 16, camZ(216.4)],     q: [TX, TY + 10, camZ(216.4) - 120], fov: 56, roll: 0 },
    { t: 217.6,  p: [cx, cy + 2, cz + 42],   q: [cx, cy, cz], fov: 50, roll: 0 },
    { t: 220.4,  p: [cx + 12, cy + 8, cz + 34], q: [cx, cy, cz], fov: 50, roll: 0.02 },
    { t: 223.8,  p: [cx + 6, cy + 30, cz + 62], q: [cx, cy - 4, cz], fov: 52, roll: 0.03 },
    { t: 225.4,  p: [cx, cy, cz + 70],      q: [cx, cy, cz], fov: 50, roll: 0 },
    { t: 247.6,  p: [cx, cy, cz + 66],      q: [cx, cy, cz], fov: 50, roll: 0 },
    { t: 249.4,  p: [cx - 4, cy + 2.5, cz + 72],  q: [cx - 2, cy + 2.5, cz], fov: 50, roll: 0 },   // 看向世界线中心上方一点：整组线在画面里偏下，给顶上的辉光管留出位置
    { t: 257.4,  p: [cx + 5, cy + 2.5, cz + 67], q: [cx + 4, cy + 2.5, cz], fov: 50, roll: 0.01 },  // 只推近一点：最上面那条世界线不碰到辉光管的说明文字
    { t: 259.2,  p: [cx + 4.5, cy + 1, cz + 60], q: [cx + 4.5, cy + 0.5, cz], fov: 50, roll: 0 },
    { t: 263.8,  p: [cx + 4.5, cy + 1.5, cz + 55], q: [cx + 4.5, cy + 0.5, cz], fov: 50, roll: 0 },
  );
  FOCUS.push({ t0: 196, t1: 216.4, fn: () => 120 }, { t0: 216.4, t1: 264, fn: () => distTo(cx, cy, cz) });
  FLASH.push([214.0, 0.15, 0.14]);
  SHAKE.push([214.0, 0.6, 0.3]);
  WSEG.slice(1).forEach(([, , , tj]) => SHAKE.push([tj, 0.25, 0.18]));                       // 跳到另一条世界线：轻微一震 + 色散
  key('ca', [248, 0.0015], ...WSEG.slice(1).flatMap(([, , , tj]) => [[tj - 0.01, 0.0015], [tj, 0.02], [tj + 0.3, 0.0015]]), [258, 0.0015]);
  key('bloom', [196, 2.4], [200.4, 2.2], [214.1, 2.6], [216.4, 2.2], [224, 2.0], [248, 2.3], [257, 2.8], [258, 2.3]);
  key('ap', [196, 0.012], [200.4, 0.008], [216, 0.008], [217, 0.01], [224, 0.006], [248, 0.01]);
  key('streak', [196, 0.01], [200.4, 0.03], [214.1, 0.04], [216.4, 0.01], [224, 0.004], [248, 0.01]);
  key('streakI', [196, 0.4], [200.4, 0.5], [216, 0.4]);
  key('dust', [196, 1], [224, 0.5], [248, 0.8]);

  scene({ id: 'a4', start: 196, dur: 68 }, (S) => {
    const c = (t, ...a) => S.cue(t - 196, ...a);
    BIG.forEach(([t], k) => k < BIG.length - 1 && c(t - 0.02, 'impact', { size: 0.45, metal: 0.3, gain: -14 }));
    REL.forEach(([d, n, dt, big]) => { if (!big && d < 2026) c(relT(d), 'blip', { pitch: 1760, kind: 'tick', gain: -18 }); });
    for (let y = 2024; y <= 2026; y++) c(relT(y) - 0.5, 'whoosh', { dur: 0.9, size: 0.5, gain: -12 });
    c(213.98, 'impact', { size: 1.0, metal: 0.3, gain: -4 });   // Opus 5.5：重击与大字同时落下
    c(216.0, 'whoosh', { dur: 1.2, size: 0.5, gain: -12 });
    [216.4, 218.5, 220.7].forEach((t) => c(t, 'blip', { pitch: 1320, kind: 'confirm', gain: -12 }));
    c(224.0, 'whoosh', { dur: 1.2, size: 0.4, gain: -14 });
    charCue(S, 'keys', typeTimes(224.2, '帮我规划一个周末去杭州的旅行。', 14), { gain: -10 });            // 人在提问：键盘声，逐字对齐
    ERAS.forEach((e) => {                                                                                     // 各时代的回答：AI 输出的数据流声，逐字对齐
      c(e.t0, 'whoosh', { dur: 0.7, size: 0.3, gain: -14 });
      charCue(S, 'stream', typeTimes(e.t0 + 0.4, e.text, e.cps).filter((_, m) => [...e.text][m] !== ' '), { gain: -15 });
    });
    c(245.4, 'blip', { pitch: 1568, kind: 'confirm', gain: -10 });
    c(248.0, 'whoosh', { dur: 1.2, size: 0.4, gain: -12 });
    c(248.35, 'whoosh', { dur: 1.2, size: 0.6, gain: -16 });                              // 世界线从"问题"处向右铺开
    // 世界线的声音（重做：原来的数据声、故障声、继电器咔嗒声又杂又怪）：
    //   火花沿一条线往前走 = 一段很轻的上升气流；走进死路 = 一声往下沉的低音（这条线的未来塌掉）；
    //   跳到另一条线 = 配乐里一记倒放的和弦吸进去 + 底鼓（film_score.py），这里只配一声短促的掠过；找到答案 = 一记温暖的闷击 + 配乐和弦
    WSEG.forEach(([, , , ta, tb], n) => {
      c(ta + 0.05, 'riser', { dur: tb - ta, gain: -20 });
      if (n > 0) c(ta - 0.42, 'worldshift', { gain: 0 });                               // 走进死路 → 世界线变动（音效里"扭"的那一下正好落在跳线的时刻）
    });
    c(WANS, 'impact', { size: 0.5, metal: 0.15, gain: -11 });
    // 计分板的声音（第三次重编：原来的气流、上升音、闷击和前面几段重复）——每亮一个点一粒"沙沙"的数据声，
    // 和开场那一圈测试点亮起时同一种声音（IMO 35 粒、ICPC 12 粒）；35 分亮满、AI 亮到第 12 题的重音交给配乐（和弦 + 镲片）
    charCue(S, 'stream', Array.from({ length: 35 }, (_, n) => imoT(Math.floor(n / 7), n % 7)), { gain: -14 });
    charCue(S, 'stream', Array.from({ length: 12 }, (_, k) => icpcT(k)), { gain: -14 });
    c(261.0, 'riser', { dur: 3.0, gain: -6 });

    // 竞赛：名字踩着拍子砸出来（每个停留约 1.5 s）
    BIG.forEach(([t0, d, n, dt], k) => {
      const last = k === BIG.length - 1;
      const t1 = last ? 216.4 : BIG[k + 1][0] - 0.05;
      const a = title(S, n, { t0, t1, size: last ? 150 : 96, weight: 700, cls: 'num glow', ls: '0.01em', stagger: 0.015, inDur: 0.35, outDur: 0.2, blur: 14, y: 430, scale: 1.15 });
      const b = last ? title(S, dt, { t0: t0 + 0.15, t1, size: 32, weight: 400, cls: 'mono', ls: '0.16em', stagger: 0.008, inDur: 0.45, outDur: 0.2, blur: 8, y: 565, scale: 1 })
        : title(S, dt, { t0: t0 + 0.05, t1, size: 22, weight: 400, cls: 'mono dim', ls: '0.5em', stagger: 0.01, inDur: 0.3, outDur: 0.2, blur: 6, y: 520, scale: 1 });
      OCCL.push(a, b);                               // 背后的小字标签碰到大字时让开
    });
    // 一次能读多长：大字比喻 + 小字数字
    const CX = [[216.6, '几页纸', '4K TOKENS · 2023'], [218.45, '一本书', '200K TOKENS · 2023.11'], [220.65, '一整个代码库', '1M TOKENS · 2024 起']];
    const cxBig = S.add(h('div', { class: 'big ctx-big' })), cxSub = S.add(h('div', { class: 'big mono ctx-sub' }));
    S.update((_, T) => {
      let k = 0;
      for (let n = 0; n < CX.length; n++) if (T >= CX[n][0]) k = n;
      const q = E.p3o(clamp((T - CX[k][0]) / 0.3)), v = smooth(seg(T, 216.6, 217.0)) * (1 - smooth(seg(T, 223.6, 224.0)));
      cxBig.textContent = `≈ ${CX[k][1]}`; cxSub.textContent = CX[k][2];
      cxBig.style.opacity = cxSub.style.opacity = (v * q).toFixed(3);
      cxBig.style.transform = `translateY(${((1 - q) * 18).toFixed(1)}px) scale(${(1 + 0.04 * (1 - q)).toFixed(3)})`;
    }, 0, 68);
    // 同一个问题，四个时代
    const q = S.add(h('div', { class: 'big' }));
    Object.assign(q.style, { top: '196px', fontSize: '40px', fontWeight: 400, letterSpacing: '0.1em' });
    typewriter(S, q, '帮我规划一个周末去杭州的旅行。', 224.2 - 196, 14, { until: 225.4 - 196 });
    S.update((_, T) => { q.style.opacity = (smooth(seg(T, 224.0, 224.3)) * (1 - smooth(seg(T, 247.6, 248.2)))).toFixed(3); }, 0, 68);
    ERAS.forEach((e, k) => {
      const box = S.add(h('div', { class: `ans ${e.cls}` }));
      const lab = h('div', { class: 'ans-tag' }, e.tag);
      const body = h('div', { class: 'ans-body' });
      box.append(lab, body);
      typewriter(S, body, e.text, e.t0 + 0.4 - 196, e.cps, { until: e.t1 - 196 });
      S.update((_, T) => {
        const v = smooth(seg(T, e.t0, e.t0 + 0.35)) * (1 - smooth(seg(T, e.t1 - 0.25, e.t1)));
        box.style.opacity = v.toFixed(3);
        box.style.filter = `blur(${((1 - v) * 8).toFixed(2)}px)`;
      }, 0, 68);
      if (k === 3) {
        const chips = h('div', { class: 'chips' });
        const at = (w) => e.t0 + 0.4 + ([...e.text.slice(0, e.text.indexOf(w))].length + [...w].length) / e.cps;   // 这句话打到这个词的时刻
        [['天气', '小雨'], ['搜索 · 高铁', '高铁'], ['搜索 · 酒店', '酒店'], ['表格', '预算表'], ['待你确认', '预订吗']].forEach(([c2, w], n) => {
          const ch = h('span', { class: n === 4 ? 'chip acc' : 'chip' }, c2);
          chips.append(ch);
          const t = at(w);
          S.update((_, T) => { const q = smooth(seg(T, t, t + 0.25)); ch.style.opacity = q.toFixed(3); ch.style.transform = `translateY(${((1 - q) * 10).toFixed(1)}px)`; }, 0, 68);
        });
        box.append(chips);
      }
    });
    // 推理
    title(S, '推理模型：先想，再答。', { t0: 248.8, t1: 253.6, size: 56, weight: 300, ls: '0.14em', y: 930 });
    // 世界线变动率的辉光管在三维场景里画（nixieLines），这里只有底座下面那行说明（见机能标注）
    title(S, '把算力花在“想”上：想得越久，答得越准。', { t0: 257.4, t1: 263.4, size: 48, weight: 300, ls: '0.1em', y: 930 });
  });

  // ---------------- 机能标注 ----------------
  chapter({ t0: 200.4, t1: 206.4, num: '04 / 06', title: '竞赛', sub: '2023 — 2026' });
  const passT = (z) => Tof(2023 + (TZ0 - (z - 110)) / 160);   // 镜头到达 z 处的时刻
  const inBig = (n) => BIG.some(([, , t, , cover]) => (cover || [t, ...t.split(' · ')]).includes(n));   // 名字本身带" · "的（o1 · 推理模型）也要认出来
  const TZONE = [360, 330, 1560, 600];              // 大标题（y 430）和日期行（y 520–565）会出现的区域：光柱的小字进来就淡出
  // 这几个出了大标题区域以后光柱很快就掠过镜头，只能露出 0.1–0.25 s，一闪而过反而更乱——不显示（Computer Use、MCP 第 5 幕有专门的段落）
  const SMALL_SKIP = ['Claude 2', 'Computer Use', 'MCP', 'Sonnet 4.5'];
  PIL.forEach((P) => { if (inBig(P.name) || SMALL_SKIP.includes(P.name)) return; const a = Math.max(P.t + 0.3, passT(P.z + 130)), b = Math.min(216.2, passT(P.z + 4)); if (b > a + 0.6 && P.d < 2026) tag({ t0: a, t1: b, at: [P.x, TY + P.hgt + 2.2, P.z], text: `${P.date} · ${P.name}`, cls: P.d >= FRONT ? 'acc' : 'dim', fin: 0.25, occlude: true, zone: TZONE }); });
  // （不再显示连续滚动的年份读数：每个大字自带日期，两个日期同屏会互相矛盾）
  tag({ t0: 216.6, t1: 223.9, at: [960, 96], text: 'CONTEXT WINDOW · 上下文窗口：一次能读下多少', cls: 'dim cn sm', scramble: false });
  tag({ t0: 224.4, t1: 247.8, at: [960, 130], text: '同一个问题 · 四个时代 · 示意', cls: 'dim cn', scramble: false });
  tag({ t0: 249.0, t1: 258.3, at: [960, 96], text: '2024.09 · o1 · 推理模型 ／ 2025 · 扩展思考', cls: 'dim' });
  tag({ t0: 249.3, t1: 257.9, at: (T) => { nxPose(T); return nxXf([CC[0] + NX_XC, CC[1] + NX_YB - 2.6, CC[2] + 1.6]); }, text: 'DIVERGENCE · 世界线变动率', cls: 'dim cn sm', scramble: false });   // 挂在底座下面，跟着一起晃
  // 线上的文字：每条线 = 一种思路；走到死路打 ✕ 并写上原因（不懂的人也看得懂"先想、试错、换思路"）
  const WTXT = ['思路 1：套公式', '思路 2：分情况', '思路 3：换角度', '思路 4：先化简，再验证'], WWHY = ['✕ 矛盾', '✕ 漏了一种情况', '✕ 越算越复杂'];
  WSEG.forEach(([k, xa, , ta], n) => {
    const x = n === 0 ? WXF + 0.5 : xa + 0.6;
    tag({ t0: ta, t1: 257.9, at: [CC[0] + x, CC[1] + wlY(k, x) + (k === WHID ? 1.25 : 1.5), CC[2]], text: WTXT[n], cls: n === WSEG.length - 1 ? 'acc cn sm' : 'cn sm', center: false, scramble: false, fin: 0.2 });
  });
  WSEG.slice(0, -1).forEach(([k, , xb, , tb], n) => tag({ t0: tb, t1: 257.9, at: [CC[0] + xb, CC[1] + wlY(k, xb) + 1.5, CC[2]], text: WWHY[n], cls: 'acc cn sm prot', center: false, dx: -9, scramble: false, fin: 0.12 }));   // 死路：✕ 落在死路点上，原因写在这条线塌掉的那段"未来"上方
  // 计分板的文字：上面一行是比赛，下面是分数（大）和一句说明
  const capTag = (t0, x, y, text, cls) => tag({ t0, t1: 263.5, at: [CC[0] + x, CC[1] + y, CC[2]], text, cls, scramble: false, fin: 0.3 });
  capTag(CAP_T[0] - 0.1, IMO_X, CAP_Y + 11.0, 'IMO 2025 · 国际数学奥林匹克', 'dim cn sm');
  capTag(imoT(4, 6) + 0.05, IMO_X, CAP_Y - 11.0, '35 / 42', 'cap-num');
  capTag(imoT(4, 6) + 0.2, IMO_X, CAP_Y - 15.0, '金牌分数 · IMO 官方评分', 'acc cn sm');
  capTag(CAP_T[1] - 0.1, ICPC_X, CAP_Y + 11.0, 'ICPC 2025 · 全球总决赛（大学生编程）', 'dim cn sm');
  tag({ t0: CAP_T[1] + 0.1, t1: 263.5, at: [CC[0] + ICPC_X - 16.2, CC[1] + CAP_Y + 3.4, CC[2]], text: 'AI', cls: 'acc cn sm', center: 'right', scramble: false });
  tag({ t0: CAP_T[1] + 0.15, t1: 263.5, at: [CC[0] + ICPC_X - 16.2, CC[1] + CAP_Y - 3.4, CC[2]], text: '人类冠军', cls: 'dim cn sm', center: 'right', scramble: false });
  capTag(icpcT(11) + 0.05, ICPC_X, CAP_Y - 11.0, '12 / 12', 'cap-num');
  capTag(icpcT(11) + 0.2, ICPC_X, CAP_Y - 15.0, '全部做对 · 人类冠军 11 题', 'acc cn sm');
  readout({ t0: 249.6, t1: 257.0, x: 96, y: 900, label: 'THINKING · 思考中', value: (T) => `${String(Math.floor(seg(T, 249.6, WANS) * 14)).padStart(2, '0')} 秒` });
  callout({ t0: WANS + 0.15, t1: 258.5, at: [CC[0] + WXE, CC[1] + WY[WHID], CC[2]], dx: 120, dy: -90, idx: '✓', title: '答案', accent: true });
  callout({ t0: 248.7, t1: 256.0, at: [CC[0] + WX0, CC[1], CC[2]], dx: -110, dy: -90, idx: '?', title: '问题', sub: '每条线 = 一种思路' });
}
