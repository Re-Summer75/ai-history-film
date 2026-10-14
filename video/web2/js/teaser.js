// 风格样片（38 秒）：2026 光流 → 冻结 → 倒带 → 1950 心跳 → 快进 → ChatGPT 超新星 → 地球被点亮
// 一镜到底：所有画面都是同一群光粒子在变形；字幕一次只出现一句，永远只有一个视觉焦点。
import { camera, bloom, fx, Particles, Lines as Streaks, onFrame, pxPerUnit } from './world.js';
import { scene, E, clamp, lerp, seg, rng } from '../../web/js/engine.js';
import { track, camPath, shaker, sampleText, title, smooth, frac, h } from './kit.js';

export const DUR = 38;

// ---------------------------------------------------------------- 粒子分组
const NM = 48000;                 // 主粒子：光流 / 文字 / 星系 / 爆发 / 地球
const NR = 6000;                  // 冲击波环
const ND = 7000;                  // 环境尘埃（提供景深与视差）
const IR = NM, ID = NM + NR, IC = NM + NR + ND;
const N = IC + 1;                 // 最后一个是"心跳光点"
const KT = 21000;                 // 组成 "2026" 的粒子数
const TAU2 = Math.PI * 2;

// 心跳（与配乐共用：导出为 heart 提示点）
const HEART = [];
for (let k = 0; k < 6; k++) { HEART.push([20.5 + k, 1.0]); HEART.push([20.76 + k, 0.55]); }
[26.0, 26.4, 26.74, 27.02, 27.24, 27.4].forEach((t, k) => HEART.push([t, 0.8 + 0.05 * k]));

// ---------------------------------------------------------------- 时间轨道
// 光流的"世界时钟"：速率 → 积分成时钟（逐帧渲染无状态，所以预先积分成查找表）
const rate = track([
  [0, 0.35], [2, 0.55], [5.2, 1.25], [6.0, 0.4], [8.6, 0.5], [10, 1.0], [12.4, 1.0, (x) => x * x * x], [14.0, 3.2],
  [14.0, 3.2, (x) => x], [14.5, 0], [15.5, 0, (x) => Math.pow(x, 2.2)], [19.0, -16], [20, -16],
]);
const TSTEP = 1200, TLEN = (DUR + 2) * TSTEP;
const TAB = new Float64Array(TLEN + 1);
for (let k = 1; k <= TLEN; k++) TAB[k] = TAB[k - 1] + rate((k - 0.5) / TSTEP) / TSTEP;
function TAU(T) {
  if (T <= 0) return T * rate(0);
  const x = Math.min(T * TSTEP, TLEN - 1), k = Math.floor(x);
  return TAB[k] + (TAB[k + 1] - TAB[k]) * (x - k);
}

const CAM = camPath([
  { t: 0,     p: [0, 4, 150],     q: [0, 0, -400], fov: 56, roll: 0.05 },
  { t: 5.2,   p: [0, 0.5, 88],    q: [0, 0, -400], fov: 52, roll: -0.01 },
  { t: 6.0,   p: [0, 0, 62],      q: [0, 0.6, -400], fov: 50, roll: 0, ease: (x) => x * x },
  { t: 8.6,   p: [0, 0, 54],      q: [0, 0.6, -400], fov: 50, roll: 0 },
  { t: 12.4,  p: [1.5, -1, 8],    q: [0, 0, -400], fov: 54, roll: 0.07 },
  { t: 14.0,  p: [0, 0, -46],     q: [0, 0, -400], fov: 66, roll: -0.06, ease: (x) => x * x },
  { t: 14.5,  p: [0, 0, -57],     q: [0, 0, -400], fov: 64, roll: -0.05, ease: E.p3o },
  { t: 15.45, p: [22, 7, -60],    q: [0, 0, -130], fov: 58, roll: 0.02, ease: E.p2 },
  { t: 19.0,  p: [0, 0, 150],     q: [0, 0, -400], fov: 72, roll: -0.5, ease: (x) => x * x },
  { t: 20.2,  p: [0, 0, 172],     q: [0, -12.6, 0], fov: 50, roll: 0, ease: E.p3o, hold: true },
  { t: 26.0,  p: [0, 0, 66],      q: [0, -4.8, 0], fov: 50, roll: 0, hold: true },
  { t: 27.45, p: [0, 26, 92],     q: [0, 0, 0], fov: 52, roll: 0.08, ease: E.p2 },
  { t: 27.75, p: [0, 12, 64],     q: [0, 0, 0], fov: 50, roll: 0, ease: (x) => x * x * x },
  { t: 28.0,  p: [0, 12, 64],     q: [0, 0, 0], fov: 50, roll: 0, hold: true },
  { t: 28.0,  p: [0, 0, 92],      q: [0, 0, 0], fov: 56, roll: 0 },
  { t: 29.6,  p: [0, 3, 126],     q: [0, 0, 0], fov: 56, roll: -0.03 },
  { t: 31.6,  p: [-6, 20, 60],    q: [0, 17, 0], fov: 50, roll: 0.02 },
  { t: 34.0,  p: [5, 22, 54],     q: [0, 19, 0], fov: 50, roll: -0.02 },
  { t: 36.0,  p: [0, 12, 104],    q: [0, -8, 0], fov: 50, roll: 0 },
  { t: 38.5,  p: [0, 10, 118],    q: [0, -9, 0], fov: 50, roll: 0 },
]);
const SHAKE = shaker([[6.0, 1.0, 0.22], [20.0, 0.12, 0.3], [28.0, 2.4, 0.42], [34.0, 0.9, 0.35], [15.5, 0.05, 3.0]]);
const bloomK = track([[0, 0.8], [5.9, 1.0], [5.999, 1.0], [6.0, 2.0], [6.9, 1.05], [14, 1.05], [15.5, 0.85], [19.0, 1.2], [20.0, 1.5], [26, 1.25],
  [27.7, 1.4], [27.999, 1.1], [28.0, 2.2], [28.8, 1.2], [33.999, 1.05], [34.0, 1.9], [35.0, 1.1], [38, 1.0]]);
const zoomK = track([[0, 0], [5.6, 0], [5.97, 0.05], [6.35, 0], [15.6, 0], [18.9, 0.16], [19.6, 0.2], [20.1, 0], [27.45, 0], [27.7, 0.07], [27.75, 0],
  [27.999, 0], [28.0, 0.22], [28.9, 0.03], [29.6, 0]]);
const caK = track([[0, 0.0015], [5.99, 0.0015], [6.0, 0.02], [6.6, 0.0015], [15.5, 0.0015], [18.5, 0.01], [20, 0.0015], [27.99, 0.0015], [28.0, 0.03],
  [29.2, 0.002], [33.99, 0.002], [34.0, 0.016], [34.8, 0.002]]);
const expoK = track([[0, 0], [1.4, 1], [14.0, 1], [14.5, 0.8], [15.5, 0.8], [16.2, 1]]);
const apK = track([[0, 0.011], [5.0, 0.011], [5.5, 0.005], [6.0, 0.005], [6.3, 0.016], [9.4, 0.016], [10.2, 0.03], [12.2, 0.03], [13.2, 0.01], [15.5, 0.006],
  [19, 0.012], [20.4, 0.02], [26, 0.02], [27.4, 0.006], [28, 0.004], [30, 0.004], [31.5, 0.012], [38, 0.012]]);
const streakK = track([[0, 0.03], [5.4, 0.04], [5.95, 0.06], [6.02, 0], [8.6, 0], [9.2, 0.03], [9.9, 0.012], [12.0, 0.012], [12.8, 0.04], [13.9, 0.06],
  [14.45, 0], [15.6, 0], [17, 0.05], [19.0, 0.08], [20.2, 0], [26, 0.03], [27.45, 0.04], [27.72, 0.06], [28.0, 0.1], [29.0, 0.03], [29.5, 0.01], [31.5, 0.006], [34, 0.006]]);
const streakI = track([[0, 0.55], [9.6, 0.55], [10.2, 0.3], [12.0, 0.3], [12.8, 0.55]]);
const dimK = track([[5.5, 1], [6.0, 0.2], [8.6, 0.2], [9.8, 1]]);
const coldK = track([[14.0, 0], [14.5, 0.55], [15.5, 0.55], [18.5, 1.0], [25.9, 1.0], [25.9001, 0]]);
const dustK = track([[0, 0.6], [5.5, 1], [6.1, 0.4], [9, 1], [19.5, 1], [20.4, 0.65], [26, 0.65], [27.6, 1], [34, 1], [37.8, 0]]);
const flashEv = [[6.0, 0.3, 0.12], [20.0, 0.06, 0.25], [28.0, 1.0, 0.1], [34.0, 0.35, 0.18]];
const fadeK = track([[0, 0], [37.1, 0], [38, 1]]);

// ---------------------------------------------------------------- 预计算
const P = new Particles(N);
const SK = new Streaks(NM / 2 + 10);
const R = rng(20260927);
const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(TAU2 * R());

const rA = new Float32Array(NM), rB = new Float32Array(NM), rC = new Float32Array(NM), rD = new Float32Array(NM);
for (let i = 0; i < NM; i++) { rA[i] = R(); rB[i] = R(); rC[i] = R(); rD[i] = R(); }

// 光流：M 条弯曲的"数据流"管道，围绕镜头前进的方向
const M = 170, ZF = -820, LZ = 1000;
const TH = new Float32Array(M), RR = new Float32Array(M), TW = new Float32Array(M), AMP = new Float32Array(M), PH = new Float32Array(M),
  SP = new Float32Array(M), TUBE = new Float32Array(M), BR = new Float32Array(M), CR = new Float32Array(M), CG = new Float32Array(M), CB = new Float32Array(M);
const MR = 36;                     // 前 MR 条是"丝带"
for (let k = 0; k < M; k++) {
  const ribbon = k < MR;
  TH[k] = ribbon ? (k / MR) * TAU2 + (R() - 0.5) * 0.3 : (k / M) * TAU2 + (R() - 0.5) * 0.1;
  RR[k] = ribbon ? 9 + 30 * R() : 7 + 44 * Math.pow(R(), 1.35);
  TW[k] = ribbon ? (R() < 0.5 ? -1 : 1) * (0.003 + 0.004 * R()) : (R() - 0.5) * 0.0045;
  AMP[k] = 0.1 + 0.35 * R();
  PH[k] = R() * TAU2;
  SP[k] = ribbon ? 70 + 30 * R() : 60 + 40 * R();
  TUBE[k] = ribbon ? 0.06 + 0.16 * R() : 0.2 + 1.2 * R() * R();
  BR[k] = ribbon ? 0.6 + 0.4 * R() : 0.35 + 0.65 * R();
  const c = R();
  const col = ribbon ? (c < 0.5 ? [1, 0.42, 0.1] : c < 0.85 ? [1, 0.74, 0.5] : [0.5, 0.66, 1])
    : c < 0.55 ? [1, 0.74, 0.5] : c < 0.8 ? [1, 0.34, 0.07] : c < 0.9 ? [1, 0.95, 0.9] : [0.42, 0.6, 1];
  [CR[k], CG[k], CB[k]] = col;
}
const SKI = new Uint16Array(NM), U0 = new Float32Array(NM), OX = new Float32Array(NM), OY = new Float32Array(NM), SJ = new Float32Array(NM),
  COMET = new Uint8Array(NM), SZ = new Float32Array(NM);
for (let i = 0; i < NM; i++) {
  const k = R() < 0.45 ? Math.floor(R() * MR) : MR + Math.floor(R() * (M - MR));
  SKI[i] = k; U0[i] = R(); OX[i] = gauss() * TUBE[k]; OY[i] = gauss() * TUBE[k];
  SJ[i] = 0.92 + 0.16 * R(); COMET[i] = R() < 0.005 ? 1 : 0; SZ[i] = 0.09 + 0.12 * R() * R();
}
{ // 重排：5.4 s 时 z 在 [-420, 50] 的非彗星粒子排到最前面，作为文字粒子
  const zAt = (i, tau) => ZF + LZ * frac(U0[i] + (tau * SP[SKI[i]] * SJ[i] * (COMET[i] ? 2.3 : 1)) / LZ);
  const order = [], rest = [];
  const tau54 = 5.4 * 0.8;          // 近似的时钟值（TAU 表在下面才建好，这里只需要粗略挑选）
  for (let i = 0; i < NM; i++) { const z = zAt(i, tau54); (!COMET[i] && z > -420 && z < 50 && order.length < KT ? order : rest).push(i); }
  const idx = order.concat(rest);
  const perm = (A) => { const B = A.slice(); for (let j = 0; j < NM; j++) A[j] = B[idx[j]]; };
  [SKI, U0, OX, OY, SJ, COMET, SZ].forEach(perm);
}

// 星系：三条对数螺旋臂
const GR = new Float32Array(NM), GA = new Float32Array(NM), GH = new Float32Array(NM);
for (let i = 0; i < NM; i++) {
  const r = 2 + 50 * Math.pow(rB[i], 0.85);
  GR[i] = r;
  GA[i] = (i % 3) * (TAU2 / 3) + 2.3 * Math.log(1 + r / 5) + (rC[i] - 0.5) * (0.35 + r / 60) + gauss() * 0.08;
  GH[i] = gauss() * 1.1 * Math.exp(-r / 22);
}
const GT = -1.05;

// 爆发：68% 球壳 + 32% 赤道盘
const BD = new Float32Array(NM * 3), BM = new Float32Array(NM), BCR = new Float32Array(NM), BCG = new Float32Array(NM), BCB = new Float32Array(NM);
for (let i = 0; i < NM; i++) {
  let x = gauss(), y = gauss(), z = gauss();
  const disk = R() < 0.32;
  if (disk) y *= 0.08;
  const l = Math.hypot(x, y, z) || 1;
  BD[3 * i] = x / l; BD[3 * i + 1] = y / l; BD[3 * i + 2] = z / l;
  BM[i] = disk ? 40 + 140 * R() : 25 + 120 * Math.pow(R(), 1.6);
  const c = R();
  const col = c < 0.45 ? [1, 0.7, 0.45] : c < 0.85 ? [1, 0.38, 0.1] : [0.5, 0.65, 1];
  BCR[i] = col[0]; BCG[i] = col[1]; BCB[i] = col[2];
}

// 地球：斐波那契球面；灯光从几个"种子"向外扩散（先稀疏的早期用户，再铺满）
const RG = 24, GTILT = 0.42;
const GX = new Float32Array(NM), GY = new Float32Array(NM), GZ = new Float32Array(NM), LT = new Float32Array(NM);
{
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NM; i++) {
    const y = 1 - (2 * (i + 0.5)) / NM, r = Math.sqrt(1 - y * y), ph = i * golden;
    GX[i] = Math.cos(ph) * r; GY[i] = y; GZ[i] = Math.sin(ph) * r;
  }
  // 种子取在 31 s 时朝向镜头的半球上
  const ang = 0.16 * (31 - 29.5);
  const toLocal = (v) => {       // 世界方向 → 地球局部坐标（先逆俯仰，再逆自转）
    const [x, y, z] = v;
    const ct = Math.cos(GTILT), st = Math.sin(GTILT);
    const y1 = y * ct + z * st, z1 = -y * st + z * ct;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return [x * ca - z1 * sa, y1, x * sa + z1 * ca];
  };
  const seeds = [[-0.35, 0.55, 0.76], [0.4, 0.6, 0.7], [0.05, 0.85, 0.5], [-0.7, 0.3, 0.64], [0.75, 0.25, 0.6]].map((v) => {
    const l = Math.hypot(...v); return toLocal(v.map((c) => c / l));
  });
  for (let i = 0; i < NM; i++) {
    let dmin = 9;
    for (const s of seeds) dmin = Math.min(dmin, Math.acos(clamp(GX[i] * s[0] + GY[i] * s[1] + GZ[i] * s[2], -1, 1)));
    const d = dmin / Math.PI;
    LT[i] = rA[i] < 0.14 ? 30.5 + 1.3 * d + 0.25 * rC[i] : 32.15 + 1.75 * Math.pow(d, 0.85) + 0.25 * rC[i];
  }
}

// 尘埃
const DX = new Float32Array(ND), DY = new Float32Array(ND), DZ = new Float32Array(ND), DV = new Float32Array(ND * 3), DS = new Float32Array(ND), DA = new Float32Array(ND);
for (let j = 0; j < ND; j++) {
  DX[j] = (R() - 0.5) * 400; DY[j] = (R() - 0.5) * 240; DZ[j] = -600 + 820 * R();
  DV[3 * j] = (R() - 0.5) * 1.2; DV[3 * j + 1] = (R() - 0.5) * 0.8; DV[3 * j + 2] = (R() - 0.5) * 1.2;
  DS[j] = 0.12 + 0.2 * R(); DA[j] = 0.1 + 0.25 * R();
}

// 冲击波环 & 心跳涟漪
const RINGS = [{ t: 6.0, n: NR, R0: 3, R1: 118, k: 0.3, life: 1.4, a: 1.1, col: [1, 0.62, 0.35], s: 0.22, flat: 0.62, cy: 1 }];
for (const [t, st] of HEART) if (t < 26 && st > 0.9) RINGS.push({ t, n: 1800, R0: 0.5, R1: 22, k: 0.5, life: 0.98, a: 0.55, col: [0.6, 0.75, 1], s: 0.16, flat: 1, cy: 0 });
RINGS.push({ t: 28.0, n: NR, R0: 1, R1: 165, k: 0.32, life: 1.8, a: 1.4, col: [1, 0.85, 0.7], s: 0.25, flat: 0.3, cy: 0 });
RINGS.push({ t: 34.0, n: NR, R0: 25, R1: 120, k: 0.4, life: 1.6, a: 0.9, col: [1, 0.55, 0.2], s: 0.2, flat: 0.28, cy: 0 });
RINGS.sort((a, b) => a.t - b.t);
const RJ = new Float32Array(NR), RT = new Float32Array(NR), RZ = new Float32Array(NR);
for (let j = 0; j < NR; j++) { RJ[j] = R() < 0.25 ? 0.8 + 0.05 * gauss() : 1 + 0.035 * gauss(); RT[j] = (R() - 0.5) * 0.004; RZ[j] = gauss() * 0.5; }

// ---------------------------------------------------------------- 各形态
let TP = null;   // "2026" 的目标点（build 时采样，需要字体已加载）

function streamAt(i, T, o) {
  const k = SKI[i];
  const sp = SP[k] * SJ[i] * (COMET[i] ? 2.3 : 1);
  const u = frac(U0[i] + (TAU(T) * sp) / LZ);
  const z = ZF + LZ * u;
  const ang = TH[k] + TW[k] * z + AMP[k] * Math.sin(0.0065 * z + PH[k]);
  const rad = RR[k] * (1 + 0.2 * Math.sin(0.0093 * z + PH[k] * 1.7)) + OX[i];
  const c = Math.cos(ang), s = Math.sin(ang);
  o.x = rad * c - OY[i] * s;
  o.y = (rad * s + OY[i] * c) * 0.7;
  o.z = z;
  o.a = BR[k] * smooth(clamp(u / 0.14)) * (1 - smooth(clamp((u - 0.965) / 0.035))) * (COMET[i] ? 2.2 : 0.9);
  o.r = CR[k]; o.g = CG[k]; o.b = CB[k];
  o.s = COMET[i] ? 0.26 : SZ[i];
}

function textPhase(i, T, o) {
  const tx = TP[2 * i], ty = TP[2 * i + 1] + 0.6, tz = (rD[i] - 0.5) * 0.6;
  if (T < 6.0) {                                  // 汇聚：远处的先出发，全部恰好在 6.0 s 落位
    const d = 0.38 + 0.45 * rA[i];
    const q = seg(T, 6.0 - d, 6.0);
    if (q <= 0) return;
    const e = Math.pow(q, 2.6);
    const fz = lerp(o.z, Math.min(o.z, -30), smooth(clamp(q * 4)));
    o.x = lerp(o.x, tx, e); o.y = lerp(o.y, ty, e); o.z = lerp(fz, tz, e);
    o.a = lerp(o.a * 0.6, 0.9, q * q * q); o.s = lerp(o.s, 0.15, q);
    const hot = Math.pow(q, 8);
    o.r = lerp(o.r, 1.5, hot); o.g = lerp(o.g, 1.25, hot); o.b = lerp(o.b, 1.0, hot);
    return;
  }
  const t = T - 6.0;
  const punch = 1 + 0.06 * Math.exp(-t / 0.13) * Math.cos(t * 26);
  const x = tx * punch + 0.05 * Math.sin(T * 2.3 + rB[i] * 40);
  const y = ty * punch + 0.05 * Math.cos(T * 1.9 + rC[i] * 40);
  const z = tz;
  const cool = smooth(clamp(t / 0.9));
  let r = lerp(1.35, 1.0, cool), g = lerp(1.12, 0.62, cool), b = lerp(0.9, 0.34, cool);
  if (T > 7.0 && T < 8.3) {                      // 一道扫光
    const xs = lerp(-48, 48, E.p2(seg(T, 7.0, 8.2)));
    const sw = Math.exp(-((tx - xs + ty * 0.35) ** 2) / 18);
    r += sw * 0.9; g += sw * 0.8; b += sw * 0.7;
  }
  const fl = 0.85 + 0.15 * Math.sin(T * 9 + rD[i] * 60);
  const st = 8.6 + (0.6 * (tx + 34)) / 68 + 0.15 * rB[i];
  const q = seg(T, st, st + 1.0);
  if (q <= 0) { o.x = x; o.y = y; o.z = z; o.r = r; o.g = g; o.b = b; o.a = fl; o.s = 0.15; return; }
  if (q < 0.7) {                                  // 瓦解：被风吹散成尘
    const p = q / 0.7, p15 = Math.pow(p, 1.5);
    const ang = rC[i] * TAU2 + p * 3;
    o.x = x + (4 + 6 * rB[i]) * p15 + Math.cos(ang) * 1.5 * p;
    o.y = y + (2 + 3 * rC[i]) * p15 + Math.sin(ang) * 1.5 * p;
    o.z = z + 10 * p * p;
    o.r = r; o.g = g; o.b = b; o.a = fl * (1 - smooth(p)); o.s = 0.15;
    return;
  }
  o.a *= smooth((q - 0.7) / 0.3);                // 然后在光流里重新出现
}

function galaxyAt(i, T, o) {
  const Rg = GR[i];
  const st = 26.0 + 0.55 * (Rg / 52) + 0.1 * rD[i];
  const g = E.out(seg(T, st, st + 0.8));
  if (g <= 0) { o.a = 0; return; }
  const rad = Rg * g;
  const a = GA[i] + 1.8 * (T - 26.0) * (24 / (Rg + 10));
  const x = rad * Math.cos(a), y = rad * Math.sin(a), hh = GH[i] * g;
  const ct = Math.cos(GT), st2 = Math.sin(GT);
  o.x = x; o.y = y * ct - hh * st2; o.z = y * st2 + hh * ct;
  const w = smooth(seg(T, 26.1, 27.4));
  const warm = clamp(Math.exp(-Rg / 14) * 1.2 + w * 0.7);
  o.r = lerp(0.42, 1.0, warm); o.g = lerp(0.58, 0.55, warm); o.b = lerp(1.0, 0.25, warm);
  o.a = 0.72 * smooth(clamp(g * 3));
  o.s = 0.13;
}

function burstAt(i, T, o) {
  const t = T - 28.0;
  const rad = BM[i] * (1 - Math.exp(-t / 0.28)) + 1.5 * t;
  o.x = BD[3 * i] * rad; o.y = BD[3 * i + 1] * rad; o.z = BD[3 * i + 2] * rad;
  const cool = smooth(clamp(t / 0.7));
  o.r = lerp(1.6, BCR[i], cool); o.g = lerp(1.4, BCG[i], cool); o.b = lerp(1.2, BCB[i], cool);
  o.a = 0.6 + 0.4 * Math.exp(-t / 0.8);
  o.s = 0.16;
}

const CAMP = { x: 0, y: 0, z: 100 };            // 当前帧相机位置（地球背面变暗、边缘光用）
function globeAt(i, T, o) {
  const ang = 0.16 * (T - 29.5);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const x0 = GX[i], y0 = GY[i], z0 = GZ[i];
  const x1 = x0 * ca + z0 * sa, z1 = -x0 * sa + z0 * ca;
  const ct = Math.cos(GTILT), st = Math.sin(GTILT);
  const y2 = y0 * ct - z1 * st, z2 = y0 * st + z1 * ct;
  let rad = RG;
  if (T > 34.0) rad *= 1 + 0.07 * Math.exp(-(T - 34.0) / 0.22) * (1 - Math.exp(-(T - 34.0) / 0.03));
  o.x = x1 * rad; o.y = y2 * rad; o.z = z2 * rad;
  const vx = CAMP.x - o.x, vy = CAMP.y - o.y, vz = CAMP.z - o.z;
  const facing = (x1 * vx + y2 * vy + z2 * vz) / (Math.hypot(vx, vy, vz) + 1e-6);
  const front = 0.16 + 0.84 * smooth(clamp(facing * 3 + 0.35));
  const rim = Math.exp(-((facing - 0.05) ** 2) / 0.012);
  const L = LT[i];
  const lit = smooth(clamp((T - L) / 0.3));
  const spark = T > L ? Math.exp(-(T - L) / 0.25) : 0;
  const boost = T > 34.0 ? 1 + 1.4 * Math.exp(-(T - 34.0) / 0.35) : 1;
  o.r = (lerp(0.32, 1.0, lit) + spark * 1.2 + rim * 0.12) * boost;
  o.g = (lerp(0.45, 0.36, lit) + spark * 0.9 + rim * 0.2) * boost;
  o.b = (lerp(0.8, 0.08, lit) + spark * 0.6 + rim * 0.4) * boost;
  o.a = lerp(0.22, 0.85, lit) * front;
  o.s = lerp(0.1, 0.14, lit);
}

const G2 = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, s: 0 };
function mainAt(i, T, o) {
  if (T < 19.0) {
    streamAt(i, T, o);
    if (i < KT) { if (T >= 5.0 && T < 10.8) textPhase(i, T, o); }
    else if (T >= 5.5 && T < 10) {
      o.a *= dimK(T);
      if (T >= 6.0) {                             // 冲击波把光流向外推开，再慢慢回弹
        const t = T - 6.0, k = 14 * (1 - Math.exp(-t / 0.18)) * Math.exp(-t / 1.4);
        const rr = Math.hypot(o.x, o.y) + 1e-3;
        o.x += (o.x / rr) * k; o.y += (o.y / rr) * k;
      }
    }
    return;
  }
  if (T < 20.2) {                                 // 坍缩：所有光流旋转着被吸进一个点
    streamAt(i, T, o);
    const st = 18.95 + 0.4 * rA[i];
    const q = seg(T, st, st + 0.75);
    const sc = 1 - q * q * q, ang = 2.8 * q * q;
    const c = Math.cos(ang), s = Math.sin(ang);
    const x = o.x * sc, y = o.y * sc;
    o.x = x * c - y * s; o.y = x * s + y * c; o.z *= sc;
    o.a *= 1 - smooth(clamp((q - 0.75) / 0.25));
    return;
  }
  if (T < 26.0) { o.a = 0; return; }
  if (T < 27.75) {
    galaxyAt(i, T, o);
    if (T >= 27.45) {                             // 内爆
      const q = seg(T, 27.45, 27.72), e = q * q * q;
      o.x *= 1 - e; o.y *= 1 - e; o.z *= 1 - e;
      o.a *= 1 - smooth(clamp((q - 0.8) / 0.2));
    }
    return;
  }
  if (T < 28.0) { o.a = 0; return; }
  burstAt(i, T, o);
  if (T >= 29.5) {                                // 爆发的光尘凝聚成地球
    const st = 29.5 + 1.0 * rA[i];
    const q = seg(T, st, st + 1.1);
    if (q <= 0) return;
    globeAt(i, T, G2);
    const e = E.p3(q);
    o.x = lerp(o.x, G2.x, e); o.y = lerp(o.y, G2.y, e); o.z = lerp(o.z, G2.z, e);
    o.r = lerp(o.r, G2.r, e); o.g = lerp(o.g, G2.g, e); o.b = lerp(o.b, G2.b, e);
    o.a = lerp(o.a, G2.a, e); o.s = lerp(o.s, G2.s, e);
    if (T > 36.0) o.a *= 1 - smooth(seg(T, 36.0, 37.8)) * 0.7;
  }
}

// ---------------------------------------------------------------- 逐帧
const O = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, s: 0 };
const Q = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, s: 0 };
const stageFlash = document.getElementById('flash');
const stageFade = document.getElementById('fade');
const scenesEl = document.getElementById('scenes');

function heartPulse(T) {
  let p = 0;
  for (const [t, s] of HEART) if (T >= t) p += s * Math.exp(-(T - t) / 0.11) * Math.min(1, (T - t) / 0.012);
  return p;
}

function frame(T) {
  // 相机
  const c = CAM(T), sh = SHAKE(T);
  camera.position.set(c.p[0] + sh.x * 0.9, c.p[1] + sh.y * 0.9, c.p[2]);
  camera.fov = c.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(c.q[0] + sh.x * 0.4, c.q[1] + sh.y * 0.4, c.q[2]);
  camera.rotateZ(c.roll + sh.r * 0.015);
  camera.updateMatrixWorld();
  CAMP.x = camera.position.x; CAMP.y = camera.position.y; CAMP.z = camera.position.z;
  scenesEl.style.transform = `translate(${(sh.x * 7).toFixed(2)}px, ${(sh.y * 7).toFixed(2)}px)`;

  // 对焦：跟随当前的主体
  const d0 = Math.hypot(CAMP.x, CAMP.y, CAMP.z);     // 到原点（文字 / 光点 / 地球中心）的距离
  let focus = 70;
  if (T >= 5.6 && T < 12.3) focus = lerp(d0, 220, smooth(seg(T, 9.6, 10.4)));
  else if (T >= 12.3 && T < 13.0) focus = lerp(220, 70, smooth(seg(T, 12.3, 13.0)));
  else if (T >= 19.5 && T < 29.6) focus = d0;
  else if (T >= 29.6) focus = d0 - RG * 0.8;
  P.u.uFocus.value = focus;
  P.u.uAperture.value = apK(T);
  P.u.uPx.value = pxPerUnit();
  bloom.strength = bloomK(T);
  fx.uniforms.uZoom.value = zoomK(T);
  fx.uniforms.uCA.value = caK(T);
  fx.uniforms.uExposure.value = expoK(T);
  let fl = 0;
  for (const [t, a, d] of flashEv) if (T >= t) fl += a * Math.exp(-(T - t) / d);
  stageFlash.style.opacity = Math.min(1, fl).toFixed(3);
  stageFade.style.opacity = fadeK(T).toFixed(3);
  if (window.__ov) window.__ov(T);               // 开发调试：临时覆盖参数

  // 调色：冻结时去饱和偏冷，倒带时越来越冷
  const cold = coldK(T);
  const gr = lerp(1, 0.62, cold), gg = lerp(1, 0.78, cold), gb = lerp(1, 1.15, cold), desat = cold * 0.6;
  const grade = (o) => {
    const l = 0.3 * o.r + 0.55 * o.g + 0.15 * o.b;
    o.r = lerp(o.r, l, desat) * gr; o.g = lerp(o.g, l, desat) * gg; o.b = lerp(o.b, l, desat) * gb;
  };

  const pos = P.pos, col = P.col, siz = P.size, alp = P.alpha;
  const dt = streakK(T);
  const skK = streakI(T);
  SK.begin();
  for (let i = 0; i < NM; i++) {
    mainAt(i, T, O);
    if (cold > 0) grade(O);
    const a = O.a > 0 ? O.a : 0;
    pos[3 * i] = O.x; pos[3 * i + 1] = O.y; pos[3 * i + 2] = O.z;
    col[3 * i] = O.r; col[3 * i + 1] = O.g; col[3 * i + 2] = O.b;
    siz[i] = O.s; alp[i] = a;
    if (dt > 0 && a > 0.02 && (i & 1) === 0) {
      const flying = i < KT && T > 5.0 && T < 6.0;
      mainAt(i, T - (flying ? Math.min(dt, 0.022) : dt), Q);
      const dx = O.x - Q.x, dy = O.y - Q.y, dz = O.z - Q.z, l2 = dx * dx + dy * dy + dz * dz;
      if (Q.a > 0.01 && l2 > 0.01 && l2 < (flying ? 400 : 3600)) {
        const k = a * skK * (flying ? 0.3 : 1);
        SK.streak(O.x, O.y, O.z, Q.x, Q.y, Q.z, O.r * k, O.g * k, O.b * k);
      }
    }
  }

  // 冲击波环
  let ev = null;
  for (const r of RINGS) if (T >= r.t && T < r.t + r.life) ev = r;
  for (let j = 0; j < NR; j++) {
    const i = IR + j;
    if (!ev || j >= ev.n) { alp[i] = 0; continue; }
    const t = T - ev.t;
    const Rr = (ev.R0 + (ev.R1 - ev.R0) * (1 - Math.exp(-t / ev.k))) * RJ[j];
    const th = (j / ev.n) * TAU2 + RT[j] * 40;
    pos[3 * i] = Math.cos(th) * Rr; pos[3 * i + 1] = Math.sin(th) * Rr * ev.flat + ev.cy; pos[3 * i + 2] = RZ[j];
    col[3 * i] = ev.col[0]; col[3 * i + 1] = ev.col[1]; col[3 * i + 2] = ev.col[2];
    siz[i] = ev.s;
    alp[i] = ev.a * Math.pow(1 - t / ev.life, 1.5) * Math.min(1, t / 0.015) * (RJ[j] < 0.9 ? 0.5 : 1);
  }

  // 尘埃
  const td = T < 20 ? TAU(T) * 0.4 : TAU(20) * 0.4 + (T - 20) * 0.35;
  const da = dustK(T);
  for (let j = 0; j < ND; j++) {
    const i = ID + j;
    pos[3 * i] = DX[j] + DV[3 * j] * td * 2 + Math.sin(td * 0.3 + j) * 2;
    pos[3 * i + 1] = DY[j] + DV[3 * j + 1] * td * 2 + Math.cos(td * 0.23 + j * 1.7) * 2;
    pos[3 * i + 2] = DZ[j] + DV[3 * j + 2] * td * 2;
    O.r = 0.9; O.g = 0.8; O.b = 0.7;
    if (T > 19.5 && T < 26.5) { O.r = 0.6; O.g = 0.72; O.b = 1.0; }
    else if (cold > 0) grade(O);
    col[3 * i] = O.r; col[3 * i + 1] = O.g; col[3 * i + 2] = O.b;
    siz[i] = DS[j]; alp[i] = DA[j] * da;
  }

  // 心跳光点
  {
    const i = IC;
    pos[3 * i] = 0; pos[3 * i + 1] = 0; pos[3 * i + 2] = 0;
    let a = 0, s = 0.5;
    if (T >= 19.85 && T < 28.0) {
      const pulse = heartPulse(T);
      const pop = T >= 20.0 ? 2.5 * Math.exp(-(T - 20.0) / 0.2) : 0;
      a = smooth(seg(T, 19.85, 20.0)) * (1.1 + pop + 1.3 * pulse);
      s = 0.9 + 0.7 * pulse;
      if (T >= 26.0) { a *= 1 + 0.8 * seg(T, 26, 27.4); }
      if (T >= 27.45 && T < 27.72) { a *= 1 + 3 * seg(T, 27.45, 27.72); }
      if (T >= 27.72) { a = 1.6; s = 0.28; }
    }
    const w = smooth(seg(T, 26.0, 27.4));
    col[3 * i] = lerp(0.75, 1.0, w); col[3 * i + 1] = lerp(0.85, 0.8, w); col[3 * i + 2] = lerp(1.0, 0.6, w);
    siz[i] = s; alp[i] = a;
  }
  P.commit();
  SK.commit();
}

// ---------------------------------------------------------------- 字幕与音效提示点
function captions() {
  scene({ id: 'teaser', start: 0, dur: DUR }, (S) => {
    const cue = S.cue;
    cue(2.0, 'whoosh', { dur: 2.6, size: 0.5, gain: -10 });
    cue(4.4, 'reverse', { dur: 1.6, gain: -2 });
    cue(6.0, 'impact', { size: 1.3, metal: 0.2, gain: 0 });
    cue(6.0, 'sub', { dur: 2.2, gain: -2 });
    cue(8.6, 'whoosh', { dur: 1.3, size: 0.6, gain: -8 });
    cue(12.4, 'riser', { dur: 1.6, gain: -6 });
    cue(15.5, 'rewind', { dur: 3.6, gain: -4 });
    cue(18.6, 'reverse', { dur: 1.4, gain: -4 });
    cue(20.0, 'impact', { size: 0.45, metal: 0.0, gain: -10 });
    cue(20.0, 'sub', { dur: 3.0, gain: -12 });
    for (const [t, s] of HEART) cue(t, 'heart', { strength: s });
    cue(26.0, 'riser', { dur: 1.72, gain: -3 });
    cue(26.9, 'reverse', { dur: 0.82, gain: -6 });
    cue(28.0, 'impact', { size: 1.7, metal: 0.35, gain: 2 });
    cue(28.0, 'sub', { dur: 3.2, gain: -5 });
    cue(28.0, 'whoosh', { dur: 1.4, size: 1.0, gain: -6 });
    cue(29.6, 'whoosh', { dur: 1.8, size: 0.7, gain: -10 });
    cue(30.5, 'blip', { pitch: 1760, kind: 'ping', gain: -8 });
    cue(32.15, 'blip', { pitch: 2350, kind: 'ping', gain: -8 });
    cue(33.2, 'reverse', { dur: 0.8, gain: -8 });
    cue(34.0, 'impact', { size: 1.2, metal: 0.25, gain: -2 });
    cue(34.0, 'sub', { dur: 3.2, gain: -7 });

    // 现在：一句话
    title(S, '今天，AI 已经能自己完成工作。', { t0: 9.15, t1: 12.45, size: 68, weight: 300, ls: '0.1em' });
    // 冻结
    title(S, '它是怎么来的？', { t0: 14.35, t1: 15.55, size: 78, weight: 400, ls: '0.12em', stagger: 0.06, inDur: 0.9 });

    // 倒带：年份飞速倒退，最后缩进那个光点
    const yr = S.add(h('div', { class: 'big num year' }));
    Object.assign(yr.style, { top: '390px' });
    S.update((T) => {
      if (T < 15.6 || T > 19.9) { yr.style.opacity = 0; return; }
      const p = seg(T, 15.6, 19.0);
      const v = Math.round(2026 - 76 * Math.pow(p, 2.1));
      yr.textContent = String(v);
      const speed = 2.1 * Math.pow(p, 1.1) * (T < 19.0 ? 1 : 0);
      const out = seg(T, 19.2, 19.75);
      const inn = smooth(seg(T, 15.6, 15.9));
      yr.style.opacity = (inn * (1 - E.in(out)) * 0.92).toFixed(3);
      yr.style.filter = `blur(${(0.5 + speed * 2.4 + out * 14).toFixed(2)}px)`;
      yr.style.transform = `scale(${(1 - 0.85 * E.in(out)) * (1 + 0.02 * speed)})`;
      yr.style.textShadow = `0 ${(-18 * speed).toFixed(1)}px 0 rgba(170,200,255,${(0.18 * speed).toFixed(3)}), 0 ${(18 * speed).toFixed(1)}px 0 rgba(170,200,255,${(0.18 * speed).toFixed(3)}), 0 0 40px rgba(140,180,255,.35)`;
    }, 0, DUR);

    // 1950：黑暗里的一个问题
    title(S, '1950', { t0: 20.9, t1: 25.75, size: 26, weight: 400, cls: 'mono dim', ls: '0.9em', stagger: 0.08, blur: 8, y: 610, scale: 1 });
    title(S, '机器能思考吗？', { t0: 21.9, t1: 25.75, size: 58, weight: 300, ls: '0.14em', stagger: 0.1, inDur: 1.6, y: 700, cls: 'glow-cold' });
    title(S, '—— 阿兰·图灵', { t0: 23.2, t1: 25.75, size: 22, weight: 300, cls: 'dim', ls: '0.3em', stagger: 0.03, blur: 8, y: 790, scale: 1 });

    // 快进：年份在底部飞速前进
    const ff = S.add(h('div', { class: 'big mono dim ff' }));
    Object.assign(ff.style, { top: '930px', fontSize: '26px', letterSpacing: '0.6em' });
    S.update((T) => {
      if (T < 26.0 || T > 27.7) { ff.style.opacity = 0; return; }
      const p = seg(T, 26.05, 27.5);
      ff.textContent = String(Math.round(1956 + 66 * Math.pow(p, 1.8)));
      ff.style.opacity = (smooth(seg(T, 26.0, 26.25)) * (1 - seg(T, 27.5, 27.7))).toFixed(3);
    }, 0, DUR);

    // 爆发
    title(S, 'ChatGPT', { t0: 28.0, t1: 30.15, size: 190, weight: 800, cls: 'num glow', ls: '-0.02em', stagger: 0.025, inDur: 0.8, blur: 24, y: 520, scale: 1.3 });
    title(S, '2022.11.30', { t0: 28.45, t1: 30.1, size: 26, weight: 400, cls: 'mono', ls: '0.6em', stagger: 0.04, blur: 8, y: 680, scale: 1 });

    // 地球被点亮
    title(S, '5 天', { t0: 30.5, t1: 31.95, size: 36, weight: 400, cls: 'dim', ls: '0.4em', stagger: 0.06, blur: 10, y: 190, scale: 1 });
    const big1 = title(S, '100 万用户', { t0: 30.58, t1: 31.95, size: 120, weight: 600, cls: 'glow', ls: '0.04em', stagger: 0.05, y: 310 });
    const numEls = big1.cs.slice(0, 3);
    S.update((T) => {
      const v = String(Math.round(100 * E.p3o(seg(T, 30.58, 31.15)))).padStart(3, ' ');
      numEls.forEach((el, k) => { el.textContent = v[k] === ' ' ? ' ' : v[k]; });
    }, 0, DUR);
    title(S, '2 个月', { t0: 32.1, t1: 33.95, size: 36, weight: 400, cls: 'dim', ls: '0.4em', stagger: 0.06, blur: 10, y: 190, scale: 1 });
    title(S, '1 亿用户', { t0: 32.18, t1: 33.95, size: 120, weight: 600, cls: 'glow', ls: '0.04em', stagger: 0.05, y: 310 });

    // 片名
    title(S, '从现在看过去', { t0: 34.7, t1: 37.7, size: 56, weight: 300, ls: '0.6em', stagger: 0.09, inDur: 1.6, y: 860 });
    title(S, 'AI 简史  1950 — 2026', { t0: 35.4, t1: 37.7, size: 20, weight: 400, cls: 'mono dim', ls: '0.5em', stagger: 0.02, blur: 6, y: 935, scale: 1 });
  });
}

export function build() {
  TP = sampleText('2026', { font: '700 400px Inter', count: KT, width: 64, seed: 3 }).pts;
  captions();
  onFrame(frame);
  window.__dbg = { bloom, fx, P, SK, camera };
}
