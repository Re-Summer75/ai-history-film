// 第 6 幕 · 现在（316 – 356 s，本幕原来的时间）
// 数据之城：76 年化作一座光的城市——每一座楼代表那个时代 AI 的规模，年份越近楼越高（指数增长）；
// 镜头贴地穿城而过，越飞越快，最后像穿越宇宙 → 冲出 2026 → 镜头拉到城外：整条天际线就是一条指数曲线 → "76 年"
// → 回到开场的那句任务（已完成）→ "从一个问题，到一个能并肩工作的伙伴。" → "故事，才刚刚开始。" → 所有光收成最初的那个心跳光点 → 片名
import { SEGS, GSEGS, CAMK, LINES, key, FLASH, SHAKE, RINGS, CORE, HEART, FOCUS, distTo, NM, TAU2, rA, rB, rC, rD, gX, gY, gZ, heartPulse, gid } from '../film.js';
import { scene } from '../../../web/js/engine.js';
import { title, smooth, frac, h, E, clamp, lerp, seg, rng } from '../kit.js';
import { tag, chapter, bracket } from '../hud.js';
import { ball, setCol } from '../geo.js';
import { project } from '../world.js';
import { PROMPT } from './a0_now.js';

export const A6_END = 357;                            // 本幕（按原来的时间写）的结束时刻
const C6 = [34, 2, -870];
const [cx, cy, cz] = C6;

// ---------------------------------------------------------------- 数据之城
// 城市的局部坐标：原点在飞行开始时镜头的脚下（接上一幕最后的镜头位置），镜头朝 −z 看，地面 y = 0。
// 整座城向镜头"卷"过来（而不是镜头在动），于是每个光点都有真实的运动拖尾，速度感来自拖尾。
const O6 = [cx + 2, cy - 1, cz + 60];
const C7 = [O6[0] - 2, O6[1] + 61, O6[2] + 492];     // 尾声（任务框、心跳光点）放在城市中央：镜头绕城转过去就能直接推进，不用折返
const [kx, ky, kz] = C7;
const LY = 12, Z0 = 60;                               // 每年 12 个单位；1950 年在镜头前方 60
const HGT = (y) => 0.8 * Math.exp((y - 1950) / 13);   // 楼高随年份指数增长：76 年长了约 350 倍
const MIL = [[1950, '图灵之问'], [1956, '“人工智能”'], [1958, '感知机'], [1966, 'ELIZA'], [1986, '反向传播'], [1997, '深蓝'],
  [2012, '深度学习'], [2016, 'AlphaGo'], [2017, 'Transformer'], [2020, 'GPT-3'], [2022, 'ChatGPT'], [2026, '此刻']];
const WINTER = (y) => (y >= 1974 && y < 1980) || (y >= 1987 && y < 1993);
const TOW = [];
{
  const R = rng(1950);
  let side = 1;
  const add = (y, name) => {
    const hh = HGT(y) * (name ? 1.15 : 0.62 + 0.6 * R());
    side = -side;
    const x = side * (name ? 9 + 2 * R() : 11 + 30 * Math.pow(R(), 1.3));
    TOW.push({ y, w: (y - 1950) * LY, x, h: hh, hw: 0.7 + 0.19 * Math.sqrt(hh), name, ph: R(), cold: WINTER(Math.floor(y)) });
  };
  for (let y = 1950.7; y < 2026.2;) { add(y, null); y += (0.6 + 0.8 * R()) / (0.35 + 0.00055 * (y - 1950) ** 2); }
  MIL.forEach(([y, n]) => add(y + 0.02, n));
  TOW.sort((a, b) => a.y - b.y);
}
const NTW = 40000, NST = 12000;                       // 楼的光点、星尘
const TID = new Uint16Array(NTW), TQ = new Float32Array(NTW);
{
  const wts = TOW.map((P) => Math.pow(P.h, 0.55) * (P.name ? 1.6 : 1) + 2);
  const sum = wts.reduce((a, b) => a + b, 0);
  let i = 0;
  TOW.forEach((P, k) => {
    const n = k === TOW.length - 1 ? NTW - i : Math.round((NTW * wts[k]) / sum);
    for (let q = 0; q < n && i < NTW; q++, i++) { TID[i] = k; TQ[i] = q / n; }
  });
}

// 飞行：镜头所在的"年份"按指数加速（起步每秒约 2 年，冲出时每秒约 19 年；速度涨到 8.7 倍）
const T_FLY = 317.0, D_FLY = 11.0, T_OUT = T_FLY + D_FLY;         // 328.0 冲出 2026（小节首拍）
const YC0 = 1945.5, YC1 = 2026.3, KC = 4.8, EK = Math.exp(D_FLY / KC);
const yCam = (T) => { const t = clamp((T - T_FLY) / D_FLY) * D_FLY; return YC0 + ((YC1 - YC0) * (Math.exp(t / KC) - 1)) / (EK - 1); };
const V0 = (LY * (YC1 - YC0)) / KC / (EK - 1), VEND = V0 * EK;   // 起步 / 冲出时的速度（单位/秒）
const S0 = Z0 + (YC0 - 1950) * LY;
export const scrollAt = (T) => {
  if (T < T_FLY) return S0 - V0 * (T_FLY - T);                    // 城市匀速滑进来，与起飞的速度接上
  if (T <= T_OUT) return Z0 + (yCam(T) - 1950) * LY;
  const d = 0.16;
  return Z0 + (YC1 - 1950) * LY + VEND * d * (1 - Math.exp(-(T - T_OUT) / d));   // 冲出后急停
};
const S_END = scrollAt(400);
const zOf = (P, T) => -(Z0 + P.w) + scrollAt(T);
const tWhen = (P, z) => {                                          // 这座楼到达局部 z 处的时刻（飞行期间）
  let a = 316.0, b = T_OUT;
  if (zOf(P, a) >= z) return a;
  if (zOf(P, b) < z) return b;
  for (let n = 0; n < 40; n++) { const m = 0.5 * (a + b); if (zOf(P, m) < z) a = m; else b = m; }
  return 0.5 * (a + b);
};
const warm = (y) => smooth(clamp((y - 1985) / 38));
// 能量扫地：一道光沿地面从远处（雾里）扫向镜头，正好在镜头脚下"撞"上拍子（本幕原来的时间；成片 = +32 s）。
// 光扫过的地方地面的线亮一下，楼从脚下往上亮起来。前四道落在小节首拍，最后两秒跟着鼓的加花越来越密，推到 328.0 冲出 2026
export const WAVES = [[318.0, 1.0], [320.0, 1.05], [322.0, 1.1], [324.0, 1.2], [325.0, 0.85], [326.0, 0.95], [326.5, 1.0], [327.0, 1.1], [327.5, 1.2]];
const WAVE_D = 820;                                    // 从多远处扫过来（与雾的距离一致）
const waveDur = (k) => (k < 4 ? 0.8 : 0.55);
const waveFront = (k, T) => {                          // 第 k 道光波此刻的位置（镜头前方为负）；不在场时返回 null
  const [tb] = WAVES[k], d = waveDur(k), u = (T - (tb - d)) / d;
  return u < 0 || u > 1.08 ? null : -WAVE_D * (1 - u);
};
// 某个位置（镜头前方的 z）此刻受到的光：hit = 波前正好经过；ring = 已经扫过的楼上，一圈光从楼脚爬到楼顶（0.45 s）再慢慢熄
function waveLight(zc, T, h = 0, y = 0) {
  let hit = 0, ring = 0;
  for (let k = 0; k < WAVES.length; k++) {
    const zw = waveFront(k, T);
    if (zw === null) continue;
    const s = WAVES[k][1], dz = zc - zw;
    hit += s * Math.exp(-(dz * dz) / 800);
    if (h > 0 && dz < 0) {
      const dt = -dz / (WAVE_D / waveDur(k));
      if (dt < 0.9) { const cy = h * Math.min(1, dt / 0.45); ring += s * Math.exp(-dt / 0.55) * Math.exp(-(((y - cy) / (0.07 * h + 1.2)) ** 2)); }
    }
  }
  return [hit, ring];
}
const speedK = (T) => (T < T_FLY || T > T_OUT + 0.3 ? 0 : clamp((Math.exp(clamp((T - T_FLY) / D_FLY) * D_FLY / KC) - 1) / (EK - 1)));

function fCity(i, T, o) {
  const S = scrollAt(T);
  if (i < NTW) {
    const P = TOW[TID[i]], f = TQ[i];
    const zc = -(Z0 + P.w) + S;
    let x, y, z, top = 0;
    if (f < 0.52) {                                   // 四条竖棱
      const e = i & 3; x = (e & 1 ? 1 : -1) * P.hw; z = (e & 2 ? 1 : -1) * P.hw; y = rB[i] * P.h;
    } else if (f < 0.68) {                            // 楼顶的方框（亮）
      const t = rA[i] * 4, sd = Math.floor(t), u = (t - sd) * 2 - 1;
      x = sd === 0 ? u * P.hw : sd === 1 ? P.hw : sd === 2 ? -u * P.hw : -P.hw;
      z = sd === 0 ? -P.hw : sd === 1 ? u * P.hw : sd === 2 ? P.hw : -u * P.hw;
      y = P.h; top = 1;
    } else {                                          // 窗：四个面上的点
      const fc = Math.floor(rA[i] * 4), u = (rC[i] * 2 - 1) * P.hw;
      x = fc === 0 ? u : fc === 1 ? P.hw : fc === 2 ? u : -P.hw;
      z = fc === 0 ? -P.hw : fc === 1 ? u : fc === 2 ? P.hw : u;
      y = rB[i] * P.h;
    }
    o.x = O6[0] + P.x + x; o.y = O6[1] + y; o.z = O6[2] + zc + z;
    const fog = smooth(clamp((zc + 820) / 300));      // 远处从黑暗里浮出来
    const rv = smooth(seg(T, 328.3, 329.8));          // 拉到城外之后：楼要亮、要粗，远看才是一条清楚的天际线
    const wv = warm(P.y);
    const pulse = Math.exp(-(((y - frac(T * 0.45 + P.ph) * P.h * 1.15) / (0.05 * P.h + 0.6)) ** 2));   // 数据沿楼身往上涌
    const win = f >= 0.68 ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T * (1.5 + 3 * rD[i]) + rC[i] * 40)) : 1;
    let a = (top ? 1.15 : f < 0.52 ? 0.55 : 0.32 * win) * (1 + 1.3 * pulse) * fog;
    if (P.name) a *= 1.35;
    if (P.cold) a *= 0.45;                            // 寒冬：楼是暗的
    setCol(o, lerp(0.5, 1.0, wv) + 0.3 * top, lerp(0.66, 0.56, wv) + 0.2 * top, lerp(1.0, 0.24, wv) + 0.1 * top, a, top ? 0.2 : 0.13);
    if (P.name && P.y > 2025.9) { o.r += 0.3; o.g *= 0.85; o.b *= 0.6; o.a *= 1.3; }
    if (T > 317.0 && T < 328.2) {                     // 能量扫地
      const [hit, ring] = waveLight(zc, T, P.h, y);
      const e = 0.9 * hit * (0.35 + 0.65 * Math.exp(-y / 6)) + 1.6 * ring;
      if (e > 0.003) { o.a *= 1 + 2.4 * e; o.r += 0.45 * e; o.g += 0.35 * e; o.b += 0.2 * e; }
    }
    o.a *= 1 + 1.3 * rv; o.s *= 1 + 1.6 * rv;
    return;
  }
  if (i < NTW + NST) {                                // 星尘：包在航道四周，随城一起卷过来，速度越快拖尾越长
    const th = rA[i] * TAU2, rr = 48 + 280 * Math.pow(rB[i], 0.8), L = 1800;
    const z = -1650 + frac(rC[i] + S / L) * L;
    o.x = O6[0] + Math.cos(th) * rr; o.y = O6[1] + 30 + Math.sin(th) * rr * 0.62; o.z = O6[2] + z;
    const k = speedK(T);
    const a = (0.25 + 0.45 * rD[i]) * smooth(clamp((z + 1650) / 300)) * (1 - smooth(clamp((z + 30) / 60))) * (0.6 + 0.8 * k);
    setCol(o, 0.85, 0.9, 1, a, 0.1 + 0.05 * rD[i]);
    return;
  }
  if (i < NTW + NST + WAVES.length * 440) {           // 波前：贴地的一排火花
    const q = i - NTW - NST, k = Math.floor(q / 440), zw = waveFront(k, T);
    o.x = O6[0] + (rA[i] - 0.5) * 130; o.y = O6[1] + 0.25 + Math.abs(gY[i]) * 0.35; o.z = O6[2] + (zw ?? -2000) + gZ[i] * 1.6;
    const s = WAVES[k][1];
    const a = zw === null ? 0 : s * 1.1 * smooth(clamp((zw + WAVE_D) / 120)) * (1 - smooth(clamp((zw + 4) / 8)));
    setCol(o, 1.3, 1.1, 0.85, a * (0.6 + 0.4 * rB[i]), 0.13 + 0.05 * rC[i]);
    return;
  }
  ball(o, i, O6[0], O6[1], O6[2] - 400, 80); setCol(o, 1, 0.8, 0.6, 0, 0.12);
}
function cityLines(T, L) {                            // 地面：每年一道横线（逢十年更亮更宽）+ 航道两侧的导轨
  const vis = smooth(seg(T, 316.3, 317.3)) * (1 - smooth(seg(T, 332.2, 333.2)));
  if (vis <= 0.01) return;
  const S = scrollAt(T);
  const [ox, oy, oz] = O6;
  for (let y = 1950; y <= 2026; y++) {
    const z = -(Z0 + (y - 1950) * LY) + S;
    if (z > 60) continue;
    const fog = smooth(clamp((z + 820) / 300)), wv = warm(y), dec = y % 10 === 0;
    const hit = T > 317.0 && T < 328.2 ? waveLight(z, T)[0] : 0;
    const k = vis * fog * (dec ? 0.34 : 0.1) * (WINTER(y) ? 0.5 : 1) * (1 + 4 * hit), w = (dec ? 46 : 28) + 14 * hit;
    L.seg(ox - w, oy, oz + z, k * lerp(0.55, 1, wv), k * lerp(0.7, 0.6, wv), k * lerp(1, 0.3, wv), ox + w, oy, oz + z, k * lerp(0.55, 1, wv), k * lerp(0.7, 0.6, wv), k * lerp(1, 0.3, wv));
  }
  for (let k = 0; k < WAVES.length; k++) {             // 扫过来的那道光：一道亮线 + 身后几道渐暗的余光
    const zw = waveFront(k, T);
    if (zw === null || zw > -2) continue;
    const s = WAVES[k][1] * vis * smooth(clamp((zw + WAVE_D) / 120));
    for (let j = 0; j < 6; j++) {
      const kk = s * (j ? 0.35 * Math.exp(-j / 2) : 1), zz = zw - j * 7, w = 70 - j * 4;
      L.seg(ox - w, oy + 0.05, oz + zz, kk * 1.2, kk * 1.0, kk * 0.8, ox + w, oy + 0.05, oz + zz, kk * 1.2, kk * 1.0, kk * 0.8);
    }
  }
  const za = -(Z0) + S, zb = -(Z0 + 77 * LY) + S;
  for (const xr of [-6, 6, -46, 46]) {
    const k = vis * (Math.abs(xr) < 10 ? 0.22 : 0.1);
    const N = 24;
    for (let s = 0; s < N; s++) {                     // 分段画，远处的一端淡进黑暗
      const z1 = lerp(za, zb, s / N), z2 = lerp(za, zb, (s + 1) / N);
      if (z1 < -1000 && z2 < -1000) continue;
      const f1 = k * smooth(clamp((z1 + 820) / 300)), f2 = k * smooth(clamp((z2 + 820) / 300));
      L.seg(ox + xr, oy, oz + z1, f1 * 0.9, f1 * 0.7, f1 * 0.5, ox + xr, oy, oz + z2, f2 * 0.9, f2 * 0.7, f2 * 0.5);
    }
  }
  // 楼的轮廓线：飞行时淡淡勾一下，拉到城外之后加亮（远看时光点太细，靠线条撑起天际线）
  const rv = smooth(seg(T, 328.3, 329.8)), kt = 0.08 + 0.42 * rv;
  const CN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const P of TOW) {
    const zc = -(Z0 + P.w) + S;
    if (zc > 60) continue;
    const k = vis * kt * smooth(clamp((zc + 820) / 300)) * (P.cold ? 0.5 : 1) * (P.name ? 1.4 : 1);
    if (k < 0.004) continue;
    const wv = warm(P.y), r = k * lerp(0.55, 1, wv), g = k * lerp(0.7, 0.58, wv), b = k * lerp(1, 0.28, wv);
    const x0 = ox + P.x, z0 = oz + zc, y1 = oy + P.h;
    for (let e = 0; e < 4; e++) {
      const [sx, sz] = CN[e], [tx, tz] = CN[(e + 1) & 3];
      L.seg(x0 + sx * P.hw, oy, z0 + sz * P.hw, r * 0.5, g * 0.5, b * 0.5, x0 + sx * P.hw, y1, z0 + sz * P.hw, r * 1.2, g * 1.2, b * 1.2);
      L.seg(x0 + sx * P.hw, y1, z0 + sz * P.hw, r * 1.5, g * 1.5, b * 1.5, x0 + tx * P.hw, y1, z0 + tz * P.hw, r * 1.5, g * 1.5, b * 1.5);
    }
  }
}

// 回到开场：任务已完成。主粒子化作身后一片温暖、失焦的光
function fCalm(i, T, o) {
  o.x = kx + (rA[i] - 0.5) * 220; o.y = ky + (rB[i] - 0.5) * 120; o.z = kz - 40 - rC[i] * 160 + Math.sin(T * 0.3 + i) * 1.5;
  setCol(o, 1, 0.66, 0.36, 0.14 * (1 - smooth(seg(T, 345.4, 347.2))), 0.16);
}
// 收束：所有光回到最初那个心跳光点
function fGather(i, T, o) {
  ball(o, i, kx, ky + 4, kz, 0.3);
  setCol(o, 1, 0.8, 0.6, 0, 0.12);
}

// 提示词（字符粒子），与开场同样的排法
const NP = [...PROMPT].length, ADV = 2.5, GSZ = 3.95, PX0 = -((NP - 1) * ADV) / 2;
let PID = null;
function gPrompt(j, T, o) {
  o.gl = 0; o.a = 0; o.x = kx; o.y = ky; o.z = kz; o.s = GSZ; o.r = 1; o.g = 0.92; o.b = 0.82;
  if (j >= NP) return;
  o.x = kx + PX0 + j * ADV; o.y = ky + 3; o.z = kz;
  o.gl = PID[j];
  o.a = smooth(seg(T, 333.4 + j * 0.03, 333.9 + j * 0.03)) * (1 - smooth(seg(T, 340.6, 341.6)));
}

export function a6() {
  PID = [...PROMPT].map((c) => gid(c));
  SEGS.push({ t: 316.0, form: fCity, tr: { type: 'swirl', dur: 1.5, spread: 0.8, amp: 14 } });
  SEGS.push({ t: 332.6, form: fCalm, tr: { type: 'swirl', dur: 1.6, spread: 0.8, amp: 10 } });
  SEGS.push({ t: 346.4, form: fGather, tr: { type: 'fly', dur: 1.2, spread: 0.6 } });
  GSEGS.push({ t: 332.6, form: gPrompt });
  LINES.push({ t0: 316.2, t1: 333.4, fn: cityLines });
  key('calm', [316.4, 0], [317.2, 1], [327.8, 1], [328.6, 0]);   // 飞行时关掉全片那层轻微的手持漂浮
  const BEATS = [[347.9, 1], [348.16, 0.55], [348.9, 1], [349.16, 0.55]];
  HEART.push(...BEATS);
  CORE.push({ t0: 347.2, t1: 357, pos: [kx, ky + 4, kz],
    a: (T) => smooth(seg(T, 347.2, 347.6)) * (1.2 + 1.4 * heartPulse(T)) * (1 - smooth(seg(T, 355.2, 356.6))),
    s: (T) => 1.3 + 1.0 * heartPulse(T), col: (T) => [1, 0.86, 0.72] });
  RINGS.push({ t: 328.0, n: 6000, R0: 2, R1: 150, k: 0.28, life: 1.5, a: 1.1, col: [1, 0.72, 0.45], s: 0.22, flat: 0.5, c: [O6[0], O6[1] + 20, O6[2] - 40] });
  RINGS.push({ t: 347.9, n: 1800, R0: 0.5, R1: 22, k: 0.5, life: 0.98, a: 0.5, col: [1, 0.8, 0.6], s: 0.16, flat: 1, c: [kx, ky + 4, kz] });
  RINGS.push({ t: 348.9, n: 1800, R0: 0.5, R1: 22, k: 0.5, life: 0.98, a: 0.5, col: [1, 0.8, 0.6], s: 0.16, flat: 1, c: [kx, ky + 4, kz] });

  // 镜头：贴地飞行（越来越快、视角越来越广、微微摇摆、抬头看越来越高的楼）→ 冲出 → 拉到城外看天际线 → 飞回任务框
  const L6 = (x, y, z) => [O6[0] + x, O6[1] + y, O6[2] + z];
  // 贴地直飞：不左右摆、不滚转、不上下颠（用户：这段镜头不要摇摆），只有越来越快、视角越来越广
  const flyK = [[317.0, 0, 6, 60, 0], [318.4, 0, 6.05, 61, 0], [319.8, 0, 6.1, 62, 0], [321.2, 0, 6.15, 64, 0], [322.6, 0, 6.2, 66, 0],
    [324.0, 0, 6.3, 69, 0], [325.3, 0, 6.35, 73, 0], [326.7, 0, 6.42, 79, 0], [328.0, 0, 6.5, 86, 0]];
  flyK.forEach(([t, x, y, fov, roll]) => {
    const up = 9 + 22 * Math.pow(clamp((t - T_FLY) / D_FLY), 3);
    CAMK.push({ t, p: L6(x, y, 0), q: L6(x * 0.3, up, -100), fov, roll });
  });
  CAMK.push(
    { t: 328.9,  p: L6(110, 70, 150),   q: L6(0, 95, 430), fov: 60, roll: 0.06, ease: E.p3o },
    { t: 330.5,  p: L6(690, 185, 492),  q: L6(0, 122, 492), fov: 50, roll: 0 },
    { t: 332.1,  p: L6(560, 150, 880),  q: L6(0, 95, 492), fov: 50, roll: -0.02 },
    { t: 333.2,  p: L6(150, 85, 700),   q: L6(-2, 64, 492), fov: 52, roll: -0.03 },
    { t: 333.9,  p: [kx, ky + 3, kz + 62],        q: [kx, ky + 2, kz], fov: 50, roll: 0 },
    { t: 341,  p: [kx, ky + 3, kz + 56],        q: [kx, ky + 2, kz], fov: 50, roll: 0 },
    { t: 346.4,  p: [kx, ky + 3, kz + 64],        q: [kx, ky + 1, kz], fov: 50, roll: 0 },
    { t: 349,  p: [kx, ky + 4, kz + 60],        q: [kx, ky - 2, kz], fov: 50, roll: 0 },
    { t: 357,  p: [kx, ky + 4, kz + 52],        q: [kx, ky - 2, kz], fov: 50, roll: 0 },
  );
  FOCUS.push({ t0: 316, t1: 328.2, fn: () => 45 }, { t0: 328.2, t1: 332.6, fn: (T) => lerp(45, distTo(...L6(0, 120, 505)), smooth(seg(T, 328.2, 330.2))) },
    { t0: 332.6, t1: 357, fn: () => distTo(kx, ky, kz) });
  key('bloom', [316.0, 3.6], [317.4, 2.4], [324.5, 2.5], [327.6, 3.0], [328.0, 4.0], [329.2, 2.5], [332, 2.3], [341, 2.2], [347, 2.6], [357, 2.4]);
  key('spread', [316, 0.55], [327.3, 0.6], [328.0, 0.66], [329.2, 0.55]);
  key('ap', [316, 0.004], [328.2, 0.004], [330.2, 0.006], [332.6, 0.01], [334, 0.022], [357, 0.022]);
  key('streak', [316.2, 0.03], [317.0, 0.022], [322, 0.022], [326.3, 0.03], [327.9, 0.045], [328.15, 0.01], [346.4, 0.01], [347, 0.04], [347.6, 0]);
  key('streakI', [316, 0.5], [324.5, 0.55], [328.0, 0.7], [328.4, 0.4]);
  key('zoom', [316.6, 0], [324.3, 0], [327.7, 0.09], [328.05, 0.16], [328.7, 0.02], [329.2, 0]);
  key('ca', [316.2, 0.0015], [324.3, 0.0015], [327.9, 0.012], [328.1, 0.022], [329.1, 0.0015]);
  key('dust', [316, 0.5], [327, 0.5], [329, 0.9], [333, 0.8], [347, 0.5], [356, 0]);
  key('fade', [0, 0], [355.8, 0], [357, 1]);
  FLASH.push([316.0, 0.5, 0.2], [328.0, 0.75, 0.22]);
  WAVES.forEach(([t, s], k) => { FLASH.push([t, (k < 4 ? 0.06 : 0.04) * s, 0.1]); SHAKE.push([t, (k < 4 ? 0.32 : 0.22) * s, 0.2]); });
  SHAKE.push([316.0, 1.4, 0.35], [325.4, 0.22, 2.2], [328.0, 1.3, 0.4]);

  scene({ id: 'a6', start: 316, dur: 41 }, (S) => {
    const c = (t, ...a) => S.cue(t - 316, ...a);
    c(316.0, 'impact', { size: 1.4, metal: 0.3, gain: 0 });
    c(316.0, 'sub', { dur: 3.0, gain: -6 });
    c(318.0, 'riser', { dur: 10.0, gain: -5 });                                        // 一路推到冲出的那一下
    for (let y = 1960; y <= 2020; y += 10) {                                          // 每过一个十年：一声越来越高的"嘀"
      const t = T_FLY + KC * Math.log(1 + ((y - YC0) / (YC1 - YC0)) * (EK - 1));
      c(t, 'blip', { pitch: 700 + (y - 1950) * 16, kind: 'tick', gain: -15 });
    }
    c(327.2, 'reverse', { dur: 0.8, gain: -8 });
    WAVES.forEach(([t, s2], k) => {                    // 能量扫地：光扫过来 = 一声反向的"吸"，撞上拍子 = 一记低频
      if (k < 4) { c(t - 0.8, 'reverse', { dur: 0.8, gain: -16 }); c(t, 'sub', { dur: 0.7, gain: -15 }); }
      else if (k < 6) c(t - 0.5, 'reverse', { dur: 0.5, gain: -20 });
    });
    c(328.0, 'impact', { size: 1.7, metal: 0.3, gain: 0 });
    c(328.0, 'sub', { dur: 3.4, gain: -5 });
    c(329.5, 'blip', { pitch: 1760, kind: 'ping', gain: -12 });
    c(332.3, 'whoosh', { dur: 1.7, size: 0.6, gain: -11 });
    c(334, 'blip', { pitch: 1568, kind: 'confirm', gain: -12 });
    c(346.2, 'reverse', { dur: 1.5, size: 0.7, gain: -8 });
    for (const [t, s2] of BEATS) c(t, 'heart', { strength: s2 });

    // 飞行中的年份读数：从 1950 一路滚到 2026，冲出的那一刻停在 2026
    const yr = S.add(h('div', { class: 'big num city-year' }));
    S.update((_, T) => {
      const v = smooth(seg(T, 317.0, 317.5)) * (1 - smooth(seg(T, 328.8, 329.3)));
      yr.style.opacity = v.toFixed(3);
      if (v <= 0) return;
      const y = Math.round(clamp(yCam(T), 1950, 2026));
      yr.textContent = String(y);
      const hit = T > T_OUT ? Math.exp(-(T - T_OUT) / 0.5) : 0;
      yr.style.color = T > T_OUT - 0.05 ? '#ff8a4c' : '';
      yr.style.transform = `scale(${(1 + 0.12 * hit).toFixed(3)})`;
      yr.style.filter = `blur(${(0.9 * speedK(T) * (T < T_OUT ? 1 : 0)).toFixed(2)}px)`;
    }, 0, 41);
    title(S, '76 年', { t0: 329.4, t1: 332.5, size: 180, weight: 200, cls: 'num glow half-l', ls: '0.1em', stagger: 0.1, inDur: 1.0, y: 360 });
    title(S, '从一个问题，', { t0: 334.4, t1: 340.6, size: 58, weight: 300, ls: '0.16em', stagger: 0.08, inDur: 1.4, y: 760 });
    title(S, '到一个能并肩工作的伙伴。', { t0: 336.4, t1: 340.6, size: 58, weight: 400, ls: '0.16em', stagger: 0.08, inDur: 1.4, y: 850 });
    title(S, '故事，才刚刚开始。', { t0: 341.7, t1: 346.4, size: 84, weight: 300, ls: '0.2em', stagger: 0.12, inDur: 1.6, y: 540, cls: 'glow' });
    title(S, '从现在看过去', { t0: 349.6, t1: 355.8, size: 104, weight: 300, ls: '0.42em', stagger: 0.1, inDur: 1.8, y: 720, cls: 'glow' });
    title(S, 'AI 简史  1950 — 2026', { t0: 350.6, t1: 355.8, size: 30, weight: 400, cls: 'mono dim', ls: '0.5em', stagger: 0.02, blur: 6, y: 830, scale: 1 });
    title(S, '导演 · 铼夏 Re-Summer', { t0: 350.9, t1: 355.8, size: 22, weight: 300, cls: 'dim', ls: '0.26em', stagger: 0.015, blur: 6, y: 945, scale: 1 });   // 片尾署名：和下面一行同样的字号、颜色，融成一个署名块
    title(S, '本片画面、音乐与音效均由 Claude Opus 5.5 用代码生成', { t0: 350.9, t1: 355.8, size: 22, weight: 300, cls: 'dim', ls: '0.26em', stagger: 0.015, blur: 6, y: 985, scale: 1 });
  });

  chapter({ t0: 317.2, t1: 322.4, num: '06 / 06', title: '现在', sub: '1950 — 2026' });
  // 里程碑的楼：快到身边时，楼顶（高楼则在视线高度）亮出名字
  TOW.filter((P) => P.name && P.y < 2013).forEach((P) => {
    const a = Math.max(317.3, tWhen(P, -165)), b = tWhen(P, -14);
    if (b - a < 0.15) return;
    const L = P.x < 0;
    tag({ t0: a, t1: b, at: (T) => [O6[0] + P.x, O6[1] + Math.min(P.h, 9) + 1.6, O6[2] + zOf(P, T)], text: `${Math.floor(P.y)} · ${P.name}`,
      cls: (P.y > 2011 ? 'acc ' : '') + 'cn recap', scramble: false, fin: 0.2, center: L ? 'right' : false, dx: L ? -10 : 10 });
  });
  // 拉到城外：天际线的两端标上年份，一句话点明"楼高 = 规模"
  tag({ t0: 329.8, t1: 331.6, at: () => L6(0, -8, S_END - Z0 - 2), text: '1950', cls: 'dim', scramble: false });
  tag({ t0: 330.0, t1: 331.6, at: () => L6(0, -8, S_END - Z0 - 76 * LY), text: '2026', cls: 'acc', scramble: false });
  tag({ t0: 330.2, t1: 332.4, at: [960, 1000], text: '楼高 = 那个时代 AI 的规模（示意）', cls: 'dim cn sm', scramble: false });

  const box = () => {
    const a = project(kx + PX0 - 3.0, ky + 3 + 2.4, kz), b = project(kx + PX0 + (NP - 1) * ADV + 1.7, ky + 3 - 2.4, kz);
    return [a.x - 18, a.y - 16, b.x - a.x + 36, b.y - a.y + 32];
  };
  bracket({ t0: 333.6, t1: 341, box });
  tag({ t0: 333.8, t1: 341, at: () => { const b = box(); return [b[0], b[1] - 26]; }, text: 'TASK · 任务', cls: 'dim', center: false });
  tag({ t0: 334, t1: 341, at: () => { const b = box(); return [b[0] + b[2], b[1] + b[3] + 28]; }, text: '✓ 已完成 · 连续工作 2 小时 47 分 · 212 项测试通过', cls: 'cn', center: false, dx: -560, scramble: false });
  tag({ t0: 341.6, t1: 346.4, at: [960, 700], text: 'CLAUDE OPUS 5.5 · 2026.09.22 · 1M CONTEXT', cls: 'dim' });
}
