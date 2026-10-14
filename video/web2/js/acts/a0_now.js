// 第 0 幕 · 此刻（0 – 30.2 s）
// 一个光标、一句任务 → AI 开始工作：时钟飞快走到 2:47，中央大字逐步显示它在做什么
//   （读 412 个文件 → 定 7 步计划 → 改 38 个文件 → 跑 212 项测试、3 个失败 → 派 4 个子智能体修好 → 全部通过 → 提交）
//   代码字符与光流退到背景；212 个测试点围成一圈亮起、变红、被修好
// → 光流汇聚成 "2026" → "今天，一句话……" → 冻结 → 倒带回 1950 → 坍缩成一个光点
import { SEGS, GSEGS, CAMK, key, FLASH, SHAKE, RINGS, FOCUS, distTo, NM, NG, TAU2, rA, rB, rC, rD, gX, gY, gZ, uX, uY, gauss, dustClock, gid } from '../film.js';
import { scene } from '../../../web/js/engine.js';
import { track, sampleText, title, smooth, frac, h, E, clamp, lerp, seg, rng, charCue } from '../kit.js';
import { bracket, tag } from '../hud.js';
import { project } from '../world.js';

export const PROMPT = '把这个项目重构一下，补全测试，然后提交。';
const FILES = [
  'src/core/engine.ts', 'src/core/scheduler.ts', 'src/render/pipeline.ts', 'src/api/client.ts', 'src/io/loader.ts', 'tests/engine.test.ts',
  'package.json', 'src/utils/cache.ts', 'docs/ARCHITECTURE.md', 'src/legacy/render.js', 'src/core/types.ts', 'src/api/routes.ts',
  'src/io/stream.ts', 'tests/api.test.ts', 'src/render/shader.ts', 'src/utils/retry.ts', 'README.md', 'src/core/queue.ts',
];
const DIFFS = [
  "+ import { render } from './core/render';", "- import { render } from './legacy';", "+ export class Scheduler {", "- function oldLoop(state) {",
  "+ await queue.flush();", "- // TODO: split this file", "+ export function split(mod: Module) {", "- legacyRender(ctx, frame);",
  "+ retry(fetchPage, { backoff: 2 });", "- if (ok == true) {", "+ if (ok) {", "+ expect(parse(src)).toEqual(tree);",
];
export const GLYPHS_A0 = PROMPT + '›▍✓';

// ---------------------------------------------------------------- 时钟：光流的"世界时钟"（可以冻结、倒流）
const rate = track([
  [0, 0], [3.0, 0.35], [8.0, 0.9], [11.2, 1.3], [12.0, 0.4], [14.6, 0.5], [16.2, 1.0], [20.4, 1.0, (x) => x * x * x], [24.0, 3.2],
  [24.0, 3.2, (x) => x], [24.5, 0], [26.9, 0, (x) => Math.pow(x, 1.8)], [29.2, -16], [31, -16],
]);
const TSTEP = 1200, TLEN = 32 * TSTEP;
const TAB = new Float64Array(TLEN + 1);
for (let k = 1; k <= TLEN; k++) TAB[k] = TAB[k - 1] + rate((k - 0.5) / TSTEP) / TSTEP;
const TAU = (T) => {
  if (T <= 0) return 0;
  const x = Math.min(T * TSTEP, TLEN - 1), k = Math.floor(x);
  return TAB[k] + (TAB[k + 1] - TAB[k]) * (x - k);
};

// ---------------------------------------------------------------- 光流（圆点粒子）
const R = rng(20260927);
const M = 170, MR = 36, ZF = -820, LZ = 1000;
const TH = new Float32Array(M), RR = new Float32Array(M), TW = new Float32Array(M), AMP = new Float32Array(M), PH = new Float32Array(M),
  SP = new Float32Array(M), TUBE = new Float32Array(M), BR = new Float32Array(M), CR = new Float32Array(M), CG = new Float32Array(M), CB = new Float32Array(M);
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
  SKI[i] = k; U0[i] = R(); OX[i] = gauss(R) * TUBE[k]; OY[i] = gauss(R) * TUBE[k];
  SJ[i] = 0.92 + 0.16 * R(); COMET[i] = R() < 0.005 ? 1 : 0; SZ[i] = 0.09 + 0.12 * R() * R();
}
const KT = 21000;                  // 组成 "2026" 的粒子
{ // 汇聚前 z 落在 [-420, 50] 的粒子排到前面，飞行距离有限，拖尾不会糊成一团
  const zAt = (i, tau) => ZF + LZ * frac(U0[i] + (tau * SP[SKI[i]] * SJ[i] * (COMET[i] ? 2.3 : 1)) / LZ);
  const tau0 = TAU(11.4), order = [], rest = [];
  for (let i = 0; i < NM; i++) { const z = zAt(i, tau0); (!COMET[i] && z > -420 && z < 50 && order.length < KT ? order : rest).push(i); }
  const idx = order.concat(rest);
  const perm = (A) => { const B = A.slice(); for (let j = 0; j < NM; j++) A[j] = B[idx[j]]; };
  [SKI, U0, OX, OY, SJ, COMET, SZ].forEach(perm);
}

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

let TP = null;
const dimK = track([[11.5, 1], [12.0, 0.2], [14.6, 0.2], [15.8, 1]]);
function textPhase(i, T, o) {
  const tx = TP[2 * i], ty = TP[2 * i + 1] + 0.6, tz = (rD[i] - 0.5) * 0.6;
  if (T < 12.0) {                                  // 汇聚：各自出发，全部恰好在 12.0 s 落位
    const d = 0.38 + 0.45 * rA[i];
    const q = seg(T, 12.0 - d, 12.0);
    if (q <= 0) return;
    const e = Math.pow(q, 2.6);
    const fz = lerp(o.z, Math.min(o.z, -30), smooth(clamp(q * 4)));
    o.x = lerp(o.x, tx, e); o.y = lerp(o.y, ty, e); o.z = lerp(fz, tz, e);
    o.a = lerp(o.a * 0.6, 0.9, q * q * q); o.s = lerp(o.s, 0.15, q);
    const hot = Math.pow(q, 8);
    o.r = lerp(o.r, 1.5, hot); o.g = lerp(o.g, 1.25, hot); o.b = lerp(o.b, 1.0, hot);
    return;
  }
  const t = T - 12.0;
  const punch = 1 + 0.06 * Math.exp(-t / 0.13) * Math.cos(t * 26);
  const x = tx * punch + 0.05 * Math.sin(T * 2.3 + rB[i] * 40);
  const y = ty * punch + 0.05 * Math.cos(T * 1.9 + rC[i] * 40);
  const z = tz;
  const cool = smooth(clamp(t / 0.9));
  let r = lerp(1.35, 1.0, cool), g = lerp(1.12, 0.62, cool), b = lerp(0.9, 0.34, cool);
  if (T > 13.0 && T < 14.3) {                      // 一道扫光
    const xs = lerp(-48, 48, E.p2(seg(T, 13.0, 14.2)));
    const sw = Math.exp(-((tx - xs + ty * 0.35) ** 2) / 18);
    r += sw * 0.9; g += sw * 0.8; b += sw * 0.7;
  }
  const fl = 0.85 + 0.15 * Math.sin(T * 9 + rD[i] * 60);
  const st = 14.6 + (0.6 * (tx + 34)) / 68 + 0.15 * rB[i];
  const q = seg(T, st, st + 1.0);
  if (q <= 0) { o.x = x; o.y = y; o.z = z; o.r = r; o.g = g; o.b = b; o.a = fl; o.s = 0.15; return; }
  if (q < 0.7) {                                   // 瓦解：被风吹散成尘
    const p = q / 0.7, p15 = Math.pow(p, 1.5);
    const ang = rC[i] * TAU2 + p * 3;
    o.x = x + (4 + 6 * rB[i]) * p15 + Math.cos(ang) * 1.5 * p;
    o.y = y + (2 + 3 * rC[i]) * p15 + Math.sin(ang) * 1.5 * p;
    o.z = z + 10 * p * p;
    o.r = r; o.g = g; o.b = b; o.a = fl * (1 - smooth(p)); o.s = 0.15;
    return;
  }
  o.a *= smooth((q - 0.7) / 0.3);
}

// ---------------------------------------------------------------- 测试环：212 个测试点（3 个失败）+ 4 个子智能体（彗星）
const NT = 212, TPER = 17, TBASE = NM - 5000;            // 测试点：NT × TPER 个粒子（都不在组成 "2026" 的那批里）
const CPER = 240, CBASE = TBASE + NT * TPER;             // 彗星：4 × CPER 个
export const FAIL = [23, 97, 160];                       // 失败的 3 个测试
const RZ0 = -12;
const dotXY = (d) => { const ang = Math.PI / 2 - (d / NT) * TAU2, r = 25 + 2.5 * (d % 2); return [Math.cos(ang) * r, Math.sin(ang) * r]; };
const COMET_T = (c) => 9.25 + 0.09 * c, COMET_D = 0.62;
const FIX = (d) => { const c = FAIL.indexOf(d); return c < 0 ? 1e9 : COMET_T(c) + COMET_D; };
export const TEST_RUN = (d) => 8.6 + 0.45 * (d / NT);   // 第 d 个测试"运行"的时刻（顺时针扫一圈）

function testsAt(i, T, o) {
  const q = i - TBASE;
  o.s = 0.26;
  if (q < NT * TPER) {
    const d = Math.floor(q / TPER), u = d / NT;
    const [bx, by] = dotXY(d);
    const fail = FAIL.includes(d);
    const tA = 8.1 + 0.45 * u, tR = TEST_RUN(d);
    let a = 0.55 * smooth(seg(T, tA, tA + 0.12)), cr = 0.75, cg = 0.72, cb = 0.7;         // 待运行：灰
    let spread = 0.12;
    if (T >= tR) {
      const fl = Math.exp(-(T - tR) / 0.08);                                              // 运行的一瞬：闪白
      if (fail && T < FIX(d)) { cr = 1.4; cg = 0.18; cb = 0.12; a = 1.6 * (0.75 + 0.25 * Math.sin(T * 18)); spread = 0.42; o.s = 0.4; }   // 失败：更大、更亮、在跳
      else { cr = 0.5; cg = 1; cb = 0.62; a = 1.05; }
      cr = lerp(cr, 1.3, fl); cg = lerp(cg, 1.3, fl); cb = lerp(cb, 1.3, fl); a = lerp(a, 1, fl);
    }
    if (fail && T >= FIX(d)) {                                                            // 被子智能体修好：闪一下再变绿
      const f2 = Math.exp(-(T - FIX(d)) / 0.12);
      cr = lerp(0.5, 1.5, f2); cg = lerp(1, 1.5, f2); cb = lerp(0.62, 1.3, f2); a = lerp(0.75, 1.2, f2);
    }
    if (T > 10.2) {                                                                       // 全部通过：一道亮光扫过
      const sw = Math.exp(-(((T - 10.2) / 0.55 - u) ** 2) / 0.004);
      a += 0.55 * sw; cr += 0.45 * sw; cg += 0.35 * sw; cb += 0.35 * sw;
    }
    const c = seg(T, 11.05 + 0.2 * rA[i], 11.8);                                          // 旋转着收拢进中心，交给 "2026"
    const sc = 1 - c * c, rot = 1.6 * c * c, cs = Math.cos(rot), sn = Math.sin(rot);
    o.x = (bx * cs - by * sn) * sc + gX[i] * spread; o.y = (bx * sn + by * cs) * sc + gY[i] * spread; o.z = RZ0 + gZ[i] * 0.2;
    o.r = cr; o.g = cg; o.b = cb; o.a = a * (1 - smooth(clamp((c - 0.6) / 0.4)));
    return;
  }
  const c = Math.floor((q - NT * TPER) / CPER);                                           // 子智能体：从中心飞向失败的测试
  const t0 = COMET_T(c), lag = 0.22 * rA[i];
  if (c >= 4 || T < t0) { o.a = 0; o.x = 0; o.y = 0; o.z = RZ0; return; }
  const [tx, ty] = c < 3 ? dotXY(FAIL[c]) : [0, 44];
  const e = E.p3o(clamp((T - lag - t0) / COMET_D));
  const L = Math.hypot(tx, ty) || 1, bend = (Math.sin(Math.PI * e) * 5 * (c % 2 ? 1 : -1)) / L;
  o.x = tx * e - ty * bend + gX[i] * 0.12; o.y = ty * e + tx * bend + gY[i] * 0.12; o.z = RZ0 + gZ[i] * 0.12;
  const hit = t0 + COMET_D;
  if (T > hit) { const b = T - hit; o.x += uX[i] * b * 16 * rB[i]; o.y += uY[i] * b * 16 * rB[i]; }  // 撞上后迸散
  o.r = 1.25; o.g = 0.78; o.b = 0.42; o.s = 0.14;
  o.a = (1 - rA[i]) * 1.1 * (T < hit + lag ? 1 : Math.exp(-(T - hit - lag) / 0.2));
}

function a0Main(i, T, o) {
  if (T < 29.0) {
    streamAt(i, T, o);
    if (T < 6.6) o.a *= smooth(clamp((T - 3.1 - 2.8 * rA[i]) / 0.6));     // 任务发出后，光流才从深处涌出
    if (T > 7.9 && T < 11.4) o.a *= 1 - 0.5 * smooth(seg(T, 7.9, 8.4)) * (1 - smooth(seg(T, 10.9, 11.4)));   // 测试环出现时，光流退后
    if (i >= TBASE && T >= 7.9 && T < 11.95) { if (T < 8.1) o.a *= 1 - smooth(seg(T, 7.9, 8.08)); else testsAt(i, T, o); return; }
    if (i < KT) { if (T >= 11.0 && T < 16.8) textPhase(i, T, o); }
    else if (T >= 11.5 && T < 16) {
      o.a *= dimK(T);
      if (T >= 12.0) {
        // 重击把光流往外推开；推力在 16.0 这个分支结束前平滑归零（原来到 16.0 还剩 0.8，粒子一帧跳回去，那一帧的拖尾闪一下）
        const t = T - 12.0, k = 14 * (1 - Math.exp(-t / 0.18)) * Math.exp(-t / 1.4) * (1 - smooth(seg(T, 15.0, 15.95)));
        const rr = Math.hypot(o.x, o.y) + 1e-3;
        o.x += (o.x / rr) * k; o.y += (o.y / rr) * k;
      }
    }
    return;
  }
  streamAt(i, T, o);                                 // 坍缩：所有光流旋转着被吸进一个点
  const st = 28.95 + 0.4 * rA[i];
  const q = seg(T, st, st + 0.75);
  const sc = 1 - q * q * q, ang = 2.8 * q * q;
  const c = Math.cos(ang), s = Math.sin(ang);
  const x = o.x * sc, y = o.y * sc;
  o.x = x * c - y * s; o.y = x * s + y * c; o.z *= sc;
  o.a *= 1 - smooth(clamp((q - 0.75) / 0.25));
}

// ---------------------------------------------------------------- 字符粒子：提示词 + 代码流
const NP = [...PROMPT].length;
const ADV = 2.7, GSZ = 4.3;                         // 中文字宽 / 字形大小（世界单位，镜头距 56 时约 56 px：这句话是全片的起点，要大）
const PX0 = -((NP - 1) * ADV) / 2;
const typeAt = (m) => 0.6 + m * 0.115;
const LL = 50, KG = Math.floor((NG - NP - 1) / LL);
const LS = new Float32Array(KG), LV = new Float32Array(KG), LX = new Float32Array(KG), LTH = new Float32Array(KG), LR = new Float32Array(KG),
  LTW = new Float32Array(KG), LC = new Uint8Array(KG);
{
  const Rg = rng(404);
  for (let k = 0; k < KG; k++) {
    LS[k] = 4.3 + 3.8 * (k / KG) + (Rg() - 0.5) * 0.15;
    LV[k] = 34 + 26 * Rg();
    LX[k] = PX0 + (NP - 1) * ADV * Rg();
    LTH[k] = Rg() * TAU2;
    LR[k] = 13 + 34 * Rg();
    LTW[k] = (Rg() - 0.5) * 0.02;
    LC[k] = 0;
  }
}
let GID = null;                                     // 每个字符粒子的字形编号（build 时由图集决定）

function a0Glyph(j, T, o) {
  o.s = GSZ; o.r = 1.0; o.g = 0.92; o.b = 0.82;
  if (j < NP) {                                     // 提示词
    const t0 = typeAt(j);
    o.x = PX0 + j * ADV; o.y = 0; o.z = 0;
    o.gl = GID[j];
    const pop = T >= t0 ? 1 + 0.25 * Math.exp(-(T - t0) / 0.06) : 0;
    o.s = GSZ * (T >= t0 ? pop : 1);
    o.a = T >= t0 ? 1 : 0;
    if (T >= 3.0) o.a *= 1 + 0.9 * Math.exp(-(T - 3.0) / 0.25);                 // 回车：亮一下
    if (T >= 3.35) {                                                              // 发出：向镜头飞散
      const p = clamp((T - 3.35 - 0.02 * j) / 0.9);
      o.z = 30 * p * p; o.x += (o.x * 0.25) * p * p; o.y += (rA[j] - 0.5) * 4 * p * p;
      o.a *= 1 - smooth(p);
    }
    return;
  }
  if (j === NP) {                                   // 光标
    const n = [...PROMPT].filter((_, m) => T >= typeAt(m)).length;
    o.x = PX0 + n * ADV - ADV * 0.25; o.y = 0; o.z = 0;
    o.gl = GID[j];
    o.r = 1; o.g = 0.45; o.b = 0.15;
    o.a = T < 3.0 && (T < 0.6 || T > typeAt(NP - 1) + 0.1 ? Math.floor(T * 2) % 2 === 0 : true) ? 0.9 : 0;
    return;
  }
  const q = j - NP - 1, k = Math.floor(q / LL), m = q % LL;
  o.gl = GID[j];
  if (k >= KG) { o.a = 0; o.x = 0; o.y = 0; o.z = -5; return; }
  const z = (T - LS[k]) * LV[k] - m * 1.05;
  const f = smooth(clamp(z / 70));
  const ang = LTH[k] + LTW[k] * z;
  o.x = LX[k] * (1 - f) + Math.cos(ang) * LR[k] * f;
  o.y = Math.sin(ang) * LR[k] * f * 0.72;
  o.z = z;
  o.s = 1.9;
  if (LC[k] === 1) { o.r = 0.55; o.g = 1; o.b = 0.68; } else if (LC[k] === 2) { o.r = 1; o.g = 0.42; o.b = 0.36; } else { o.r = 0.95; o.g = 0.88; o.b = 0.8; }
  o.a = GID[j] === 0 || z < 0 || k % 3 ? 0 : 0.75 * smooth(clamp((z - 12) / 10)) * (1 - smooth(clamp((z - 40) / 18))) * (1 - smooth(seg(T, 8.2, 8.9)));   // 只在散开后出现：中心不再糊成一团
  if (z < 0) { o.x = LX[k]; o.y = 0; o.z = -0.5; }
}

// ---------------------------------------------------------------- 登记
export function a0() {
  TP = sampleText('2026', { font: '700 400px Inter', count: KT, width: 64, seed: 3 }).pts;
  GID = new Uint16Array(NG);
  [...PROMPT].forEach((ch, m) => { GID[m] = gid(ch); });
  GID[NP] = gid('▍');
  for (let j = NP + 1; j < NG; j++) {
    const q = j - NP - 1, k = Math.floor(q / LL), m = q % LL;
    const edit = k < KG && LS[k] >= 6.9;                                          // 7.0 s 起是"改代码"：diff 行，绿增红删
    const line = edit ? DIFFS[k % DIFFS.length] : 'read  ' + FILES[k % FILES.length];
    if (k < KG) LC[k] = edit ? (line[0] === '+' ? 1 : 2) : 0;
    const mm = k < KG && Math.cos(LTH[k]) > 0 ? line.length - 1 - m : m;     // 往右飞：行尾在前
    GID[j] = k < KG && m < line.length ? gid(line[mm]) : 0;
  }
  SEGS.push({ t: 0, form: a0Main });
  const d0 = () => distTo(0, 0, 0);
  FOCUS.push({ t0: 0, t1: 3.4, fn: d0 }, { t0: 3.4, t1: 11.0, fn: () => 70 }, { t0: 11.0, t1: 16.0, fn: d0 },
    { t0: 16.0, t1: 20.4, fn: (T) => lerp(d0(), 220, smooth(seg(T, 16.0, 16.8))) }, { t0: 20.4, t1: 21.2, fn: (T) => lerp(220, 70, smooth(seg(T, 20.4, 21.2))) },
    { t0: 21.2, t1: 29.0, fn: () => 70 }, { t0: 29.0, t1: 31.0, fn: d0 });
  GSEGS.push({ t: 0, form: a0Glyph });
  dustClock.fn = (T) => (T < 30 ? TAU(T) * 0.4 : TAU(30) * 0.4 + (T - 30) * 0.35);

  CAMK.push(
    { t: 0,     p: [0, 0, 60],       q: [0, 0, 0], fov: 50, roll: 0 },
    { t: 3.0,   p: [0, 0, 56],       q: [0, 0, 0], fov: 50, roll: 0, hold: true },
    { t: 8.0,   p: [0, 5, 92],       q: [0, 0, -300], fov: 54, roll: 0.06 },
    { t: 11.2,  p: [0, 0.5, 80],     q: [0, 0, -400], fov: 52, roll: -0.01 },
    { t: 12.0,  p: [0, 0, 62],       q: [0, 0.6, -400], fov: 50, roll: 0, ease: (x) => x * x },
    { t: 14.6,  p: [0, 0, 54],       q: [0, 0.6, -400], fov: 50, roll: 0 },
    { t: 20.4,  p: [1.5, -1, 8],     q: [0, 0, -400], fov: 54, roll: 0.07 },
    { t: 24.0,  p: [0, 0, -46],      q: [0, 0, -400], fov: 66, roll: -0.06, ease: (x) => x * x },
    { t: 24.5,  p: [0, 0, -57],      q: [0, 0, -400], fov: 64, roll: -0.05, ease: E.p3o },
    { t: 26.8,  p: [22, 7, -60],     q: [0, 0, -130], fov: 58, roll: 0.02, ease: E.p2 },
    { t: 29.0,  p: [0, 0, 150],      q: [0, 0, -400], fov: 72, roll: -0.5, ease: (x) => x * x },
    { t: 30.2,  p: [0, 0, 172],      q: [0, -12.6, 0], fov: 50, roll: 0, ease: E.p3o, hold: true },
  );
  key('bloom', [0, 1.8], [3.0, 1.8], [3.05, 2.8], [3.6, 2.0], [11.9, 2.2], [11.999, 2.2], [12.0, 3.8], [12.9, 2.6], [24, 2.3], [25.5, 1.9], [29.0, 2.4], [30.2, 2.8]);
  key('spread', [0, 0.5], [12.0, 0.62], [13.0, 0.5], [25.5, 0.55], [29.5, 0.6], [30.2, 0.55]);
  key('zoom', [0, 0], [11.6, 0], [11.97, 0.05], [12.35, 0], [27.0, 0], [28.9, 0.16], [29.6, 0.2], [30.1, 0]);
  key('ca', [0, 0.0015], [11.99, 0.0015], [12.0, 0.02], [12.6, 0.0015], [26.9, 0.0015], [28.7, 0.01], [30, 0.0015]);
  key('expo', [0, 0], [0.5, 1], [24.0, 1], [24.5, 0.8], [26.9, 0.8], [27.5, 1]);
  key('ap', [0, 0.004], [3, 0.004], [5, 0.011], [11.0, 0.011], [11.5, 0.005], [12.0, 0.005], [12.3, 0.016], [15.4, 0.016], [16.2, 0.03], [20.2, 0.03],
    [21.2, 0.01], [26.9, 0.006], [29, 0.012], [30.4, 0.02]);
  key('glyphAp', [0, 0], [3.3, 0], [4.5, 0.004]);
  key('streak', [0, 0], [3.2, 0], [4.5, 0.03], [11.4, 0.04], [11.95, 0.06], [12.02, 0], [14.6, 0], [15.2, 0.03], [15.9, 0.012], [20.0, 0.012], [20.8, 0.04], [23.9, 0.06],
    [24.45, 0], [26.9, 0], [27.8, 0.05], [29.0, 0.08], [30.2, 0]);
  key('streakI', [0, 0.55], [15.6, 0.55], [16.2, 0.3], [20.0, 0.3], [20.8, 0.55]);
  key('cold', [24.0, 0], [24.5, 0.55], [26.9, 0.55], [28.8, 1.0]);
  key('dust', [0, 0.35], [3, 0.35], [6, 1], [11.5, 1], [12.1, 0.4], [15, 1], [29.5, 1], [30.4, 0.65]);
  FLASH.push([12.0, 0.3, 0.12], [30.0, 0.06, 0.25]);
  SHAKE.push([12.0, 1.0, 0.22], [30.0, 0.12, 0.3], [26.9, 0.05, 2.4]);
  RINGS.push({ t: 12.0, n: 6000, R0: 3, R1: 118, k: 0.3, life: 1.4, a: 1.1, col: [1, 0.62, 0.35], s: 0.22, flat: 0.62, c: [0, 1, 0] });

  scene({ id: 'a0', start: 0, dur: 31 }, (S) => {
    const cue = S.cue;
    [...PROMPT].forEach((_, m) => cue(typeAt(m), 'key', { gain: -10 + 3 * rB[m] }));
    cue(3.0, 'key', { gain: -4, space: 1 });
    cue(3.02, 'blip', { pitch: 1500, kind: 'confirm', gain: -12 });
    cue(3.3, 'whoosh', { dur: 1.6, size: 0.7, gain: -8 });
    // 工作中：每一步一个提示音；数文件、改代码是数据流；测试逐个运行；失败 → 子智能体出发 → 逐个修好 → 全部通过 → 提交
    [4.6, 5.9, 7.0, 8.1, 9.2].forEach((t) => cue(t, 'blip', { pitch: 1568, kind: 'tick', gain: -12 }));
    charCue(S, 'stream', Array.from({ length: 26 }, (_, k) => 4.7 + (1.1 * k) / 26), { gain: -16 });
    charCue(S, 'stream', Array.from({ length: 20 }, (_, k) => 7.1 + (0.9 * k) / 20), { gain: -16 });
    charCue(S, 'stream', Array.from({ length: 36 }, (_, k) => TEST_RUN(Math.round((k / 35) * (NT - 1)))), { gain: -14 });
    cue(9.08, 'blip', { pitch: 880, kind: 'error', gain: -10 });
    cue(9.25, 'whoosh', { dur: 0.7, size: 0.35, gain: -12 });
    FAIL.forEach((d) => cue(FIX(d), 'blip', { pitch: 1760, kind: 'ping', gain: -14 }));
    cue(10.2, 'blip', { pitch: 1320, kind: 'confirm', gain: -10 });
    cue(11.0, 'key', { gain: -6, space: 1 });
    cue(11.02, 'blip', { pitch: 1568, kind: 'confirm', gain: -10 });
    cue(10.4, 'reverse', { dur: 1.6, gain: -8 });                // 吸气声别太满：重击前要留出落差
    cue(12.0, 'impact', { size: 1.3, metal: 0.2, gain: 0 });
    cue(12.0, 'sub', { dur: 2.2, gain: -5 });
    cue(14.6, 'whoosh', { dur: 1.3, size: 0.6, gain: -8 });
    cue(20.4, 'riser', { dur: 3.6, gain: -6 });
    cue(26.9, 'rewind', { dur: 2.6, gain: -4 });
    cue(28.6, 'reverse', { dur: 1.4, gain: -4 });
    cue(30.0, 'impact', { size: 0.45, metal: 0.0, gain: -10 });
    cue(30.0, 'sub', { dur: 3.0, gain: -12 });

    // 字幕
    title(S, '今天，一句话，AI 就能独立完成一整件工作。', { t0: 15.7, t1: 20.5, size: 64, weight: 300, ls: '0.1em' });
    title(S, '它是怎么走到今天的？', { t0: 24.3, t1: 26.95, size: 76, weight: 400, ls: '0.12em', stagger: 0.05, inDur: 0.9 });

    // 工作中：时钟 + 当前在做什么（大字）+ 进度（外行也能看懂它在干什么、干了多久）
    const cnt = (A, B, t0, t1, T) => Math.round(lerp(A, B, smooth(seg(T, t0, t1))));
    const STEPS = [
      [4.6, '阅读代码库', (T) => `${cnt(0, 412, 4.7, 5.8, T)} 个文件`],
      [5.9, '制定计划', () => '7 个步骤'],
      [7.0, '修改代码', (T) => `${cnt(0, 38, 7.1, 8.0, T)} 个文件`],
      [8.1, '运行测试', (T) => (T < 9.08 ? `${cnt(0, 212, 8.6, 9.05, T)} / 212` : '<i class="bad">3 个失败</i>')],
      [9.2, '派出 4 个子智能体', () => '并行修复'],
      [10.2, '全部测试通过', () => '212 / 212'],
      [11.0, '<i class="ok">✓</i> 已提交', () => 'refactor: split engine'],
    ];
    const clkL = S.add(h('div', { class: 'big work-label' }, 'ELAPSED · 已连续工作'));
    const clk = S.add(h('div', { class: 'big num work-clock' }));
    const stp = S.add(h('div', { class: 'big work-step' }));
    const prog = S.add(h('div', { class: 'work-prog' }));
    const segEls = STEPS.map(() => { const d = h('i'); prog.append(d); return d; });
    S.update((T) => {
      const vout = 1 - smooth(seg(T, 11.55, 11.85)), v = smooth(seg(T, 3.6, 4.2)) * vout;
      clkL.style.opacity = (v * 0.85).toFixed(3);
      clk.style.opacity = v.toFixed(3);
      clk.textContent = clock(T);
      let k = -1;
      for (let n = 0; n < STEPS.length; n++) if (T >= STEPS[n][0]) k = n;
      prog.style.opacity = (smooth(seg(T, 4.6, 5.0)) * vout).toFixed(3);
      segEls.forEach((e, n) => { e.className = n < k ? 'done' : n === k ? 'cur' : ''; });
      if (k < 0) { stp.style.opacity = 0; return; }
      const [tk, label, det] = STEPS[k];
      const q = E.p3o(clamp((T - tk) / 0.22));
      stp.innerHTML = `${label}<span class="sep">·</span><b>${det(T)}</b>`;
      stp.style.opacity = (q * vout).toFixed(3);
      stp.style.transform = `translateY(${((1 - q) * 16).toFixed(1)}px)`;
    }, 0, 31);

    // 倒带年份
    const yr = S.add(h('div', { class: 'big num year' }));
    yr.style.top = '390px';
    S.update((T) => {
      if (T < 26.95 || T > 29.9) { yr.style.opacity = 0; return; }
      const p = seg(T, 26.95, 29.0);
      yr.textContent = String(Math.round(2026 - 76 * Math.pow(p, 2.1)));
      const speed = 2.1 * Math.pow(p, 1.1) * (T < 29.0 ? 1 : 0);
      const out = seg(T, 29.2, 29.75), inn = smooth(seg(T, 26.95, 27.2));
      yr.style.opacity = (inn * (1 - E.in(out)) * 0.92).toFixed(3);
      yr.style.filter = `blur(${(0.5 + speed * 2.4 + out * 14).toFixed(2)}px)`;
      yr.style.transform = `scale(${(1 - 0.85 * E.in(out)) * (1 + 0.02 * speed)})`;
      yr.style.textShadow = `0 ${(-18 * speed).toFixed(1)}px 0 rgba(170,200,255,${(0.18 * speed).toFixed(3)}), 0 ${(18 * speed).toFixed(1)}px 0 rgba(170,200,255,${(0.18 * speed).toFixed(3)}), 0 0 40px rgba(140,180,255,.35)`;
    }, 0, 31);
  });

  // 机能：任务框
  const box = () => {
    const a = project(PX0 - 3.2, 2.6, 0), b = project(PX0 + (NP - 1) * ADV + 1.8, -2.6, 0);
    return [a.x - 18, a.y - 16, b.x - a.x + 36, b.y - a.y + 32];
  };
  bracket({ t0: 0.25, t1: 3.5, box });
  tag({ t0: 0.35, t1: 3.5, at: (T) => { const b = box(); return [b[0], b[1] - 26]; }, text: 'NEW TASK · 新任务', cls: 'dim', center: false });
  tag({ t0: 0.45, t1: 3.5, at: (T) => { const b = box(); return [b[0] + b[2], b[1] - 26]; }, text: '2026.09.27  21:14', cls: 'dim', center: false, dx: -170 });
  tag({ t0: 0.5, t1: 3.4, at: () => project(PX0 - 2.5, 0.1, 0), text: '›', cls: 'acc big-caret', scramble: false });
  const clock = (T) => {
    const s = Math.floor(10033 * Math.pow(seg(T, 4.6, 11.3), 1.6));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
}
