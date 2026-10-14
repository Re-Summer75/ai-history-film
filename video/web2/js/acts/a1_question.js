// 第 1 幕 · 一个问题（30.2 – 96 s）：1950 → 1986
// 黑暗里的心跳光点与图灵之问 → 模仿游戏 → 1956"人工智能"诞生 → 1958 感知机 → 1966 ELIZA → 两次寒冬 → 1986 反向传播（冰雪消融）
// 色彩：越早越冷；随着"学会学习"慢慢回暖。讲原理的段落加入机能标注。
import { SEGS, GSEGS, CAMK, LINES, key, FLASH, SHAKE, RINGS, CORE, HEART, FOCUS, distTo, NM, NG, rA, rB, rC, rD, gX, gY, gZ, uX, uY, uZ, heartPulse, gid, hidden } from '../film.js';
import { scene, typewriter } from '../../../web/js/engine.js';
import { sampleText, title, smooth, frac, h, E, clamp, lerp, seg, rng, charCue, typeTimes } from '../kit.js';
import { callout, tag, chapter, wline, bracket, readout } from '../hud.js';
import { ball, onSeg, setCol, spline, layeredNet } from '../geo.js';
import { project } from '../world.js';
import { LAYERS, CELLS, CRANGE, NCNN } from './cnn.js';

const T1 = 30.2;

// ---------------------------------------------------------------- 1950：心跳
for (let k = 0; k < 8; k++) { HEART.push([30.5 + k, 1.0]); HEART.push([30.76 + k, 0.55]); }

// ---------------------------------------------------------------- 模仿游戏
// 三个"光之生命"：明亮的核 + 三条倾斜的轨道，每条轨道上三颗拖着长尾巴的彗星在转 + 一圈向外飘散的星尘。
// C（提问者，人）暖金色；A、B 看起来一模一样（这正是游戏的关键）。揭晓时：A 的核变成立方体、三条轨道对齐成精密的陀螺仪、变冷青色（机器）；
// B 变暖金色（人）。消息是沿弧线飞行的彗星（问过去、答回来），穿过中间的"墙"——一片缓缓下落的粒子帘幕——时激起一圈涟漪。
const PC = [-24, 0, 0], PA = [18, 9, 0], PB = [18, -9, 0];
const MSG = [[38.9, PA], [39.7, PB], [40.6, PA], [41.4, PB], [42.3, PA], [43.1, PB], [44.0, PA]];
// 每个光之生命都在缓缓漂浮（不是钉在原地的球）；0 = C、1 = A、2 = B、3–6 = 达特茅斯的四位发起人
const BOB = (e, T) => [0.6 * Math.sin(0.8 * T + e * 2.1), 0.8 * Math.sin(0.63 * T + e * 1.3), 0.5 * Math.sin(0.57 * T + e * 0.7)];
const EP = [PC, PA, PB];
const entAt = (e, T) => { const b = BOB(e, T), c = EP[e]; return [c[0] + b[0], c[1] + b[1], c[2] + b[2]]; };
const plus = (p, dx, dy) => [p[0] + dx, p[1] + dy, p[2]];
const NE = 3200;                                     // 每个光之生命的粒子数
const EQ = [];                                       // 每个生命的三条轨道：{ n: 法向, u, v: 轨道平面的两个方向, R, w, ph }
{
  const R = rng(1950);
  for (let e = 0; e < 8; e++) {
    const rings = [];
    for (let r = 0; r < 3; r++) {
      const th = R() * Math.PI, ph0 = R() * 2 * Math.PI;
      const n = [Math.sin(th) * Math.cos(ph0), Math.cos(th), Math.sin(th) * Math.sin(ph0)];
      rings.push({ n, R: 2.9 + 0.95 * r, w: (1.5 + 0.5 * r) * (r % 2 ? -1 : 1), ph: R() * 2 * Math.PI });
    }
    EQ.push(rings);
  }
}
const MACH = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];      // 揭晓成机器时，三条轨道对齐的方向（陀螺仪）
function ringBasis(n) {                               // 与法向 n 垂直的两个方向
  const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const lu = Math.hypot(...u); u = u.map((x) => x / lu);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return [u, v];
}
const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// 每条轨道的起始朝向（u0 在轨道平面里、n0 是法向）和变成陀螺仪后的朝向（n1 取和 n0 同侧的那个轴，u1 = u0 在新平面上的投影：转动最小）。
// 揭晓时在两者之间连续插值——不能每帧用 ringBasis 重算：它换参照轴的那一刻，轨道上的点会整体跳一截（拖尾闪一帧）
const RBAS = EQ.map((rings) => rings.map((ring, r) => {
  const [u0, v0] = ringBasis(ring.n), m = MACH[r], sg = dot3(ring.n, m) < 0 ? -1 : 1, n1 = m.map((x) => x * sg);
  let up = u0.map((x, d) => x - dot3(u0, n1) * n1[d]);
  if (Math.hypot(...up) < 0.2) up = ringBasis(n1)[0];
  return { u0, v0, n0: ring.n, u1: nrm(up), n1 };
}));
// 揭晓（REV）的积分：转速从 w0 平滑加快到 w1 时，转过的角度 = w0·t + (w1 − w0)·∫REV dt（直接换转速会让角度一帧跳一大截）
const revI = (T) => { if (T <= 44.35) return 0; if (T >= 45.0) return 0.325 + (T - 45.0); const u = (T - 44.35) / 0.65; return 0.65 * (u * u * u - (u * u * u * u) / 2); };
// 一个光之生命里的第 j 个粒子（0 … NE-1）。col = [r,g,b]；mk = 变成机器的程度（0 … 1）
function entity(o, i, j, c, T, e, col, mk = 0, amp = 1, glow = 0) {
  if (j < 800) {                                      // 核：球（变成机器时变成立方体的表面）
    ball(o, i, c[0], c[1], c[2], 1.0);
    if (mk > 0) {
      const f = [uX[i], uY[i], uZ[i]], m = Math.max(Math.abs(f[0]), Math.abs(f[1]), Math.abs(f[2]));
      const cube = f.map((x, k) => c[k] + (x / m) * 0.9 * (0.85 + 0.15 * rD[i]));
      o.x = lerp(o.x, cube[0], mk); o.y = lerp(o.y, cube[1], mk); o.z = lerp(o.z, cube[2], mk);
    }
    setCol(o, col[0] * 1.15, col[1] * 1.15, col[2] * 1.15, (0.9 + 0.12 * Math.sin(T * 3 + i)) * amp * (1 + 1.4 * glow), 0.12);
    return;
  }
  if (j < 3050) {                                     // 三条轨道：每条 750 = 三颗彗星（各 200）+ 淡淡的轨道本身（150）
    const q = j - 800, r = Math.floor(q / 750), k = q % 750, ring = EQ[e][r], B = RBAS[e][r];
    let u = B.u0, v = B.v0;
    if (mk > 0) {                                     // 变成陀螺仪：轨道平面连续地转到新的朝向
      const kk = smooth(mk), n = nrm(B.n0.map((x, d) => lerp(x, B.n1[d], kk))), uu = B.u0.map((x, d) => lerp(x, B.u1[d], kk));
      u = nrm(uu.map((x, d) => x - dot3(uu, n) * n[d])); v = crs3(n, u);
    }
    const w = ring.w, spin = w * (T - 37) + (mk > 0 ? (2.6 * Math.sign(w) - w) * revI(T) : 0);   // 只有 A 揭晓时会转得更快
    let th, a, s;
    if (k < 600) {                                    // 彗星：头最亮，尾巴沿轨道往后拖、渐暗
      const cm = Math.floor(k / 200), tq = (k % 200) / 199;
      th = ring.ph + spin + (cm * 2 * Math.PI) / 3 - Math.sign(w) * tq * 1.25;
      a = (tq < 0.04 ? 1.9 : 1.25 * Math.pow(1 - tq, 1.5)) * amp; s = tq < 0.04 ? 0.15 : 0.1;
    } else {                                          // 轨道本身
      th = ((k - 600) / 150) * 2 * Math.PI; a = 0.07 * amp; s = 0.07;
    }
    const R = ring.R, ct = Math.cos(th), st = Math.sin(th), jit = 0.05;
    o.x = c[0] + R * (u[0] * ct + v[0] * st) + gX[i] * jit; o.y = c[1] + R * (u[1] * ct + v[1] * st) + gY[i] * jit; o.z = c[2] + R * (u[2] * ct + v[2] * st) + gZ[i] * jit;
    setCol(o, col[0], col[1], col[2], a, s);
    return;
  }
  const f = frac(rA[i] + T * 0.18), rr = 1.4 + 5.2 * f;   // 星尘：从核往外慢慢飘散、渐淡
  o.x = c[0] + uX[i] * rr; o.y = c[1] + uY[i] * rr; o.z = c[2] + uZ[i] * rr;
  setCol(o, col[0], col[1], col[2], 0.35 * (1 - f) * amp, 0.08);
}
// 消息：沿弧线飞的彗星。每次交流 = 问过去（0.55 s）+ 答回来（0.55 s）
const MSGT = 0.55;
const MFLY = MSG.flatMap(([t0, dst], m) => {
  const e = dst === PA ? 1 : 2;
  return [
    { t: t0, a: entAt(0, t0), b: entAt(e, t0 + MSGT), bend: e === 1 ? 5 : -5, m, ans: false, src: 0, dst: e },
    { t: t0 + 0.6, a: entAt(e, t0 + 0.6), b: entAt(0, t0 + 0.6 + MSGT), bend: e === 1 ? 2.5 : -2.5, m, ans: true, src: e, dst: 0 },
  ];
});
const arrive = (e, T) => MFLY.reduce((s2, f) => { const ta = f.t + MSGT; return s2 + (f.dst === e && T >= ta ? Math.exp(-(T - ta) / 0.18) : 0); }, 0);   // 收到消息：核亮一下
const bez = (f, u) => {                               // 二次贝塞尔：起点、终点，中间抬高 bend
  const mx = (f.a[0] + f.b[0]) / 2, my = (f.a[1] + f.b[1]) / 2 + f.bend, v = 1 - u;
  return [v * v * f.a[0] + 2 * v * u * mx + u * u * f.b[0], v * v * f.a[1] + 2 * v * u * my + u * u * f.b[1], 0];
};
for (const f of MFLY) {                               // 穿过墙（x = 0）的时刻和位置：墙上的涟漪从这里扩散
  let lo = 0, hi = 1;
  const sx = Math.sign(bez(f, 1)[0] - bez(f, 0)[0]);
  for (let k = 0; k < 30; k++) { const md = (lo + hi) / 2; if ((bez(f, md)[0] - 0) * sx < 0) lo = md; else hi = md; }
  f.uc = lo; f.yc = bez(f, lo)[1];
  let a0 = 0, a1 = 1;                                  // 缓动的反函数：头走到 lo 处是第几秒
  for (let k = 0; k < 30; k++) { const md = (a0 + a1) / 2; if (E.p2(md) < lo) a0 = md; else a1 = md; }
  f.tc = f.t + MSGT * a0;
}
const REV = (T) => smooth(seg(T, 44.35, 45.0));      // 揭晓：A 变成机器、B 变成人
const msgCol = (f, T) => (f.src === 0 ? C_HUM : f.src === 1 ? mixc(C_UNK, C_MAC, REV(T)) : mixc(C_UNK, C_HUM2, REV(T)));
const C_HUM = [1.0, 0.84, 0.62], C_UNK = [0.86, 0.88, 0.96], C_MAC = [0.4, 0.85, 1.35], C_HUM2 = [1.15, 0.78, 0.45];   // C_HUM2：揭晓后的 B（人），比 C 更暖，冷调下也看得出
const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
function fImit(i, T, o) {
  const rv = REV(T);
  if (i < NE) { entity(o, i, i, entAt(0, T), T, 0, C_HUM, 0, 1, arrive(0, T)); return; }
  if (i < 2 * NE) { entity(o, i, i - NE, entAt(1, T), T, 1, mixc(C_UNK, C_MAC, rv), rv, 1, arrive(1, T)); return; }
  if (i < 3 * NE) { entity(o, i, i - 2 * NE, entAt(2, T), T, 2, mixc(C_UNK, C_HUM2, rv), 0, 1, arrive(2, T)); return; }
  if (i < 3 * NE + 4000) {                            // 墙：一片有纵深、缓缓下落的粒子帘幕；消息穿过时激起涟漪
    const y = 17 - 34 * frac(rA[i] + (T - 37) * 0.035), z = (rB[i] - 0.5) * 13;
    o.x = z * 0.643 + gX[i] * 0.08; o.y = y; o.z = z * 0.766;                    // 帘幕平面转 40°（sin/cos 40°），不再是从正面只看到一条线
    let rip = 0;
    for (const f of MFLY) {
      const dt = T - f.tc;
      if (dt < 0 || dt > 1.2) continue;
      const d = Math.hypot(y - f.yc, z), R = 11 * dt;
      rip += Math.exp(-((d - R) ** 2) / 0.6) * Math.exp(-dt / 0.4);
    }
    const tw = 0.7 + 0.3 * Math.sin(T * 2.3 + rC[i] * 30);
    const edge = smooth(clamp((17 - Math.abs(y)) / 2.5));   // 上下边缘淡出：落到底回卷到顶的那一帧是透明的（否则运动拖尾会画出一条贯穿上下的直线）
    setCol(o, 0.72 + 0.5 * rip, 0.8 + 0.4 * rip, 1.0 + 0.2 * rip, ((0.13 + 0.15 * rB[i]) * tw * (1 - 0.6 * Math.abs(z) / 6.5) + 1.3 * rip) * edge, 0.09);
    return;
  }
  if (i < 3 * NE + 4000 + MFLY.length * 400) {        // 消息彗星
    const q = i - 3 * NE - 4000, f = MFLY[Math.floor(q / 400)], k = q % 400;
    const p = (T - f.t) / MSGT;
    o.x = f.a[0]; o.y = f.a[1]; o.z = 0; setCol(o, 1, 0.8, 0.6, 0, 0.1);
    if (p <= 0 || p >= 1.35) return;
    const uh = E.p2(Math.min(1, p));
    const tail = k < 60 ? 0 : (k - 60) / 340;         // 头 60 个粒子，尾巴 340 个
    const u = Math.max(0, uh - tail * 0.32);
    const P = bez(f, u);
    const w = k < 60 ? 0.3 : 0.12 * (1 - tail);
    o.x = P[0] + gX[i] * w; o.y = P[1] + gY[i] * w; o.z = gZ[i] * w;
    const from = msgCol(f, T);
    const fade = p > 1 ? 1 - (p - 1) / 0.35 : 1;
    setCol(o, from[0] * 1.2, from[1] * 1.1, from[2], (k < 60 ? 1.6 : 1.1 * Math.pow(1 - tail, 1.3)) * fade, k < 60 ? 0.13 : 0.1);
    return;
  }
  ball(o, i, 0, 0, 0, 0.5); o.a = 0;
}

// ---------------------------------------------------------------- 1956 达特茅斯：四个人 → "ARTIFICIAL INTELLIGENCE"
const FN = [[0, 11, 0], [-18, 0, 0], [18, 0, 0], [0, -11, 0]];
const KAI = 20000;
let TAI = null;
const FNat = (n, T) => { const b = BOB(3 + n, T); return [FN[n][0] + 0.8 * b[0], FN[n][1] + 0.8 * b[1], FN[n][2] + 0.8 * b[2]]; };
function fFound(i, T, o) {                           // 四位发起人：和模仿游戏里一样的"光之生命"（暖金色），同样缓缓漂浮
  const n = Math.floor(i / NE);
  if (n < 4) { entity(o, i, i - n * NE, FNat(n, T), T, 3 + n, C_HUM); return; }
  ball(o, i, ...FN[3], 0.6); setCol(o, 1, 0.84, 0.66, 0, 0.13);
}
function fAI(i, T, o) {
  if (i < KAI) {
    o.x = TAI[2 * i] + 0.04 * Math.sin(T * 2 + i); o.y = TAI[2 * i + 1] + 3.2; o.z = (rD[i] - 0.5) * 0.5;
    const sw = T > 50.2 && T < 51.6 ? Math.exp(-((TAI[2 * i] - lerp(-42, 42, E.p2(seg(T, 50.2, 51.5)))) ** 2) / 14) : 0;
    setCol(o, 1 + sw, 0.8 + sw * 0.9, 0.58 + sw * 0.8, 0.8 + 0.2 * Math.sin(T * 7 + rC[i] * 50), 0.13);
  } else { ball(o, i, 0, 0, 0, 20); o.a = 0; setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}

// ---------------------------------------------------------------- 1958 感知机：从例子中学习
// 30 个例子（橙 = 猫，蓝 = 狗）和一条分界线。逐个出示例子：分错了，线就转一下（= 调整权重）；几次之后，线把两类完全分开。
const PTS = [];                                      // [x, y, 类别]；真实分界：0.55x + y − 1.5 = 0
{
  let a = 7;
  const R = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let k = 0; k < 30; k++) {
    const c = k % 2;
    let x, y;
    do { x = (R() - 0.5) * 54; y = (R() - 0.5) * 30; } while ((c ? 1 : -1) * (0.55 * x + y - 1.5) < 2.6);
    PTS.push([x, y, c]);
  }
}
const deg = (d) => (d * Math.PI) / 180;
const LSTATE = [[deg(168), 0.0], [deg(118), 3.0], [deg(80), 1.8], [deg(61.2), 1.31]];   // 分界线的法向角与偏移，每分错一次换下一组
const EVT = [55.6, 56.5, 57.3, 58.1, 58.9, 59.7, 60.5, 61.3];                            // 出示例子的时刻
const EVW = [1, 1, 0, 1, 0, 0, 0, 0];                                                   // 1 = 这一次会分错
const PICK = [];                                     // [时刻, 例子编号, 是否分错]
const side = (st, x, y) => Math.cos(st[0]) * x + Math.sin(st[0]) * y - st[1];
{
  let k = 0;
  const used = new Set();
  EVT.forEach((t, e) => {
    const st = LSTATE[k];
    const cand = PTS.map((q, n) => [n, side(st, q[0], q[1]) * (q[2] ? 1 : -1)]).filter(([n]) => !used.has(n));
    let pick;
    if (EVW[e]) pick = cand.filter(([, v]) => v < 0).sort((u, v) => u[1] - v[1])[0];      // 分错得最离谱的那个
    if (!pick) { const good = cand.filter(([, v]) => v > 0).sort((u, v) => v[1] - u[1]); pick = good[Math.min(3, good.length - 1)] || cand[0]; }
    const wrong = pick[1] < 0;
    used.add(pick[0]);
    PICK.push([t, pick[0], wrong]);
    if (wrong && k < LSTATE.length - 1) k++;
  });
}
const lineAt = (T) => {                              // 当前分界线（每次分错后 0.5 s 转到新位置）
  let st = LSTATE[0], k = 0;
  for (const [t, , w] of PICK) {
    if (!w || T < t + 0.15) continue;
    const nx = LSTATE[Math.min(k + 1, LSTATE.length - 1)];
    const q = E.p3o(clamp((T - t - 0.15) / 0.55));
    st = [lerp(LSTATE[k][0], nx[0], q), lerp(LSTATE[k][1], nx[1], q)];
    k++;
  }
  return st;
};
const PBOX = { w: 60, h: 34 };
const orange = [1, 0.55, 0.25], blue = [0.45, 0.66, 1];
function fNeuron(i, T, o) {
  if (i < 30 * 220) {                               // 例子
    const n = Math.floor(i / 220), [x, y, c] = PTS[n];
    let hot = 0;
    for (const [t, m] of PICK) if (m === n && T >= t) hot = Math.max(hot, Math.exp(-(T - t) / 0.45));
    ball(o, i, x, y, 0, 0.75 + 0.5 * hot);
    const col = c ? orange : blue;
    setCol(o, col[0] + hot, col[1] + hot, col[2] + hot, 0.95 + 0.6 * hot, 0.13);
  } else if (i < 30 * 220 + 7000) {                 // 分界线
    const q = (i - 30 * 220) / 7000, st = lineAt(T);
    const nx = Math.cos(st[0]), ny = Math.sin(st[0]);
    const s0 = (q - 0.5) * 80;
    const x = nx * st[1] - ny * s0, y = ny * st[1] + nx * s0;
    const inside = clamp(1 - Math.max(Math.abs(x) - PBOX.w / 2, Math.abs(y) - PBOX.h / 2) / 3);
    o.x = x + gX[i] * 0.06; o.y = y + gY[i] * 0.06; o.z = gZ[i] * 0.06;
    const turn = PICK.some(([t, , w]) => w && T > t + 0.15 && T < t + 0.7) ? 1 : 0;
    setCol(o, 1, 0.9 + 0.1 * turn, 0.8, (0.55 + 0.35 * turn) * inside * smooth(seg(T, 54.8, 55.4)), 0.1);
  } else if (i < 30 * 220 + 7000 + 22000) {         // 两侧的底色：分界线把平面分成两块
    const x = (rA[i] - 0.5) * PBOX.w, y = (rB[i] - 0.5) * PBOX.h;
    const v = side(lineAt(T), x, y);
    const col = v > 0 ? orange : blue;
    o.x = x; o.y = y; o.z = -0.6 + (rC[i] - 0.5) * 0.4;
    const done = smooth(seg(T, 61.9, 62.6));
    setCol(o, col[0], col[1], col[2], (0.03 + 0.07 * done) * smooth(seg(T, 55.0, 55.8)) * clamp(Math.abs(v) / 1.2), 0.11);
  } else { ball(o, i, 0, 0, 0, 30); o.a = 0; setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}

// ---------------------------------------------------------------- 1966 ELIZA：琥珀色终端
const SCR = { w: 58, h: 30, cy: 2 };
// 终端的边框（9000）和扫描线（15000）用寒冬里空闲的那批粒子画（TERM，见反向传播一节）：
// 寒冬开场时镜头拉远，终端缩成期望曲线上 1966 年处的一块小屏幕，要和曲线、雪同时存在；曲线跌下去时它闪两下熄灭
function termAt(i, T, o) {
  const q = TERM[i];
  if (q < 0 || T > 75.55) return false;
  let x, y, z, a, g = 0.66, b = 0.28, sz = 0.11;
  if (q < 9000) {                                   // 屏幕边框（圆角矩形）
    const t = q / 9000, P = 2 * (SCR.w + SCR.h), d = t * P;
    if (d < SCR.w) { x = -SCR.w / 2 + d; y = SCR.h / 2; }
    else if (d < SCR.w + SCR.h) { x = SCR.w / 2; y = SCR.h / 2 - (d - SCR.w); }
    else if (d < 2 * SCR.w + SCR.h) { x = SCR.w / 2 - (d - SCR.w - SCR.h); y = -SCR.h / 2; }
    else { x = -SCR.w / 2; y = -SCR.h / 2 + (d - 2 * SCR.w - SCR.h); }
    x += gX[i] * 0.05; y += SCR.cy + gY[i] * 0.05; z = gZ[i] * 0.05; a = 0.7;
  } else {                                          // 扫描线纹理
    const qq = q - 9000, row = qq % 36, t = Math.floor(qq / 36) / 416;
    x = -SCR.w / 2 + 1 + (SCR.w - 2) * t + gX[i] * 0.05; y = SCR.cy - SCR.h / 2 + 1 + row * ((SCR.h - 2) / 35); z = -0.3;
    g = 0.6; b = 0.25; sz = 0.1; a = 0.05 + 0.03 * Math.sin(row * 1.7 + T * 6);
  }
  const k = zoomS(T);
  if (k < 1) { x = ZF[0] + k * (x - ZF[0]); y = ZF[1] + k * (y - ZF[1]); z *= k; a *= q < 9000 ? 0.25 + 0.75 * k : k; }
  const off = smooth(seg(T, 74.95, 75.5));
  if (off > 0) a *= (1 - off) * (0.55 + 0.45 * Math.cos(T * 90));
  o.x = x; o.y = y; o.z = z; setCol(o, 1, g, b, a, sz);
  return true;
}
function fTerm(i, T, o) {
  if (!termAt(i, T, o)) { ball(o, i, 0, 0, -10, 30); o.a = 0; setCol(o, 1, 0.66, 0.28, 0, 0.12); }
}
const ELIZA = [
  { t0: 64.9, dur: 0.9, text: '> 我最近总是很焦虑。', hl: [3, 10] },
  { t0: 66.2, dur: 1.4, text: 'ELIZA: 你为什么说你最近总是很焦虑？', hl: [13, 20] },
  { t0: 68.0, dur: 0.7, text: '> 因为工作压力太大。', hl: null },
  { t0: 68.9, dur: 0.9, text: 'ELIZA: 请多谈谈你的工作。', hl: null },
];
const EG = [];                                       // 每个字符：{line, m, x, y, id, t, hl}
function layoutEliza() {
  const cw = 1.55, aw = 0.93, x0 = -SCR.w / 2 + 4, y0 = SCR.cy + 8;
  ELIZA.forEach((L, li) => {
    let x = x0;
    const chars = [...L.text];
    chars.forEach((ch, m) => {
      const cjk = ch.charCodeAt(0) > 0x2e80;
      const w = cjk ? cw : aw;
      EG.push({ x: x + w / 2, y: y0 - li * 5.2, id: gid(ch), t: L.t0 + (m / chars.length) * L.dur, hl: L.hl && m >= L.hl[0] && m < L.hl[1], cjk, bot: L.text.startsWith('ELIZA'), li, m });
      x += w;
    });
  });
  // 回答里的关键词不是"打"出来的：从你的那句话里复制、飞过去（= 句式替换）
  for (const c of EG) if (c.li === 1 && c.hl) {
    const src = EG.find((d) => d.li === 0 && d.m === c.m - 10);
    c.src = src;
    c.f0 = 66.57 + 0.035 * (c.m - 13); c.t = c.f0 + 0.5;
  }
}
function gEliza(j, T, o) {
  o.gl = 0; o.a = 0; o.x = 0; o.y = SCR.cy; o.z = 0; o.s = 2.4; o.r = 1; o.g = 0.8; o.b = 0.5;
  if (j >= EG.length) return;
  const c = EG[j];
  o.x = c.x; o.y = c.y; o.z = 0.2; o.gl = c.id;
  o.s = c.cjk ? 2.45 : 2.2;
  const on = T >= (c.src ? c.f0 : c.t);
  o.a = on ? 0.95 * (1 - smooth(seg(T, 72.0, 72.6))) : 0;
  if (c.src && T < c.t) {                           // 飞行中：更亮，沿弧线过去
    const q = E.p3(clamp((T - c.f0) / (c.t - c.f0)));
    o.x = lerp(c.src.x, c.x, q); o.y = lerp(c.src.y, c.y, q) + Math.sin(Math.PI * q) * 2.2; o.z = 0.2 + Math.sin(Math.PI * q) * 3;
    o.a *= 1.4;
  }
  if (c.hl && T > 67.4) { o.r = 1; o.g = 0.42; o.b = 0.12; o.a *= 1.25; }
  else if (c.bot) { o.r = 1; o.g = 0.72; o.b = 0.36; }
  else { o.r = 1; o.g = 0.9; o.b = 0.78; }
  const k = zoomS(T);                               // 拉远：跟着屏幕一起缩小
  if (k < 1) { o.x = ZF[0] + k * (o.x - ZF[0]); o.y = ZF[1] + k * (o.y - ZF[1]); o.z *= k; o.s *= k; }
}

// ---------------------------------------------------------------- 两次寒冬：期望曲线 + 雪
const YX = (y) => -44 + (y - 1950) * 1.76;
const CURVE = spline([[1950, -8], [1956, 0], [1962, 6], [1968, 12], [1973, 15], [1975, 2], [1977, -9], [1980, -7], [1983, 4], [1986, 12],
  [1987, 13], [1989, 0], [1991, -9], [1994, -10], [1997, -5], [2000, 1]].map(([yr, v]) => [YX(yr), v - 2, 0]), 1200);
// 曲线按年份画出来：镜头拉远时补画 1950–1966（前面讲过的这段历史，停在 ELIZA 那块小屏幕上）；
// 一路冲上 1973 的顶点；81.0（成片）那一拍跌下去——第一次寒冬；专家系统回暖；1987 起第二次跌落；90 年代慢慢恢复
const RV = [[71.8, 1950], [72.9, 1966], [73.05, 1966], [74.95, 1973.2], [75.55, 1977.5], [76.9, 1987.2], [77.45, 1991.5], [78.4, 2000]];
const SY = new Float32Array(2001);                   // 弧长位置 k/2000 → 年份（取累计最大，保证单调）
for (let k = 0, m = 1950; k <= 2000; k++) { m = Math.max(m, 1950 + (CURVE.byLen(k / 2000)[0] + 44) / 1.76); SY[k] = m; }
function sAtYear(yr) {
  let lo = 0, hi = 2000;
  while (lo < hi) { const md = (lo + hi) >> 1; if (SY[md] < yr) lo = md + 1; else hi = md; }
  if (lo === 0) return 0;
  return (lo - 1 + (yr - SY[lo - 1]) / Math.max(1e-6, SY[lo] - SY[lo - 1])) / 2000;
}
let RVT = NaN, RVS = 0;
function reveal(T) {
  if (T === RVT) return RVS;
  RVT = T; RVS = 1;
  if (T <= RV[0][0]) RVS = 0;
  else for (let k = 1; k < RV.length; k++) if (T < RV[k][0]) {
    const [t0, y0] = RV[k - 1], [t1, y1] = RV[k], u = (T - t0) / (t1 - t0);
    RVS = sAtYear(lerp(y0, y1, k === 1 ? E.p2(u) : u));
    break;
  }
  return RVS;
}
// 拉远：终端绕不动点 ZF 缩到 ZS1，中心正好落在曲线 1966 年那一点的上方（像一枚钉在曲线上的小屏幕）
const ZS1 = 0.075, P66 = CURVE.byLen(sAtYear(1966));
const ZC1 = [P66[0], P66[1] + (SCR.h * ZS1) / 2 + 0.5];
const ZF = [ZC1[0] / (1 - ZS1), (ZC1[1] - ZS1 * SCR.cy) / (1 - ZS1)];
const zoomS = (T) => (T <= 71.5 ? 1 : Math.exp(Math.log(ZS1) * E.p3(seg(T, 71.5, 73.0))));
// 曲线和雪分别用哪些粒子画，由下面反向传播网络的粒子分工决定（WCURVE、WSNOW）：寒冬过后，
// 曲线上的点按从左到右的顺序凝成网络的节点，雪被吸进连线、变成流动的光
function fWinter(i, T, o) {
  if (termAt(i, T, o)) return;                      // ELIZA 缩成的小屏幕
  const s = WCURVE[i];
  if (s >= 0) {
    const p = CURVE.byLen(s);
    o.x = p[0] + gX[i] * 0.12; o.y = p[1] + gY[i] * 0.12; o.z = gZ[i] * 0.12;
    const rv = reveal(T);
    const drop = p[1] < -4 ? 1 : 0;
    setCol(o, drop ? 0.55 : 1, drop ? 0.7 : 0.78, drop ? 1 : 0.55, s <= rv ? 0.75 + 0.9 * Math.exp(-(((rv - s) * 60) ** 2)) : 0, 0.12);
    if (s > rv) { const q = CURVE.byLen(rv); o.x = q[0]; o.y = q[1]; o.z = 0; }
  } else if (WSNOW[i]) {                            // 雪：只有这一层，慢慢落下
    const v = 2.5 + 3 * rB[i];
    const y = 42 - frac(rC[i] + ((T - 72) * v) / 90) * 90;
    o.x = -85 + 170 * rA[i] + Math.sin(T * 0.6 + i) * 1.2; o.y = y; o.z = -70 + 110 * rD[i];
    setCol(o, 0.8, 0.88, 1, (0.2 + 0.25 * rB[i]) * smooth(seg(T, 75.0 + 1.6 * rA[i], 76.6 + 1.6 * rA[i])), 0.12 + 0.1 * rC[i]);   // 跌下去之后才下雪
  } else { ball(o, i, 0, 0, 0, 40); o.a = 0; setCol(o, 0.8, 0.88, 1, 0, 0.12); }
}

// ---------------------------------------------------------------- 1986 反向传播：寒冬里凝成的网络学会学习 → 长出新的层 → 转进纵深
// 深层网络 7 层（DN）：原来的 4 层是其中第 0、2、4、6 层；第 1、3、5 层是"多层网络"时由连线上流动的光汇聚、长出来的。
// 节点先竖排成正面的网络图；之后整张网转进纵深：层距拉开到和 2012 卷积网络的各层重合（LAYERS[k].z），每层的节点从一列张开成一圈。
// 96.0 重击时，每一圈原地展开成这一层的特征图（a2_ignite.js 的 fStack），镜头顺势钻进去。
// 粒子分工和卷积网络对齐：粒子 i 在卷积网络里是第 k 层的哪个格子，它在这里就是第 k 层、圈上方向离那个格子最近的节点。
const DN = [4, 6, 6, 6, 6, 6, 2];
const NODE0 = DN.map((n, k) => DN.slice(0, k).reduce((a, b) => a + b, 0)), NNODE = 36;
const nid = (k, j) => NODE0[k] + j;
const NL = [], NJ = [];                              // 节点编号 → 第几层、层里第几个
DN.forEach((n, k) => { for (let j = 0; j < n; j++) { NL.push(k); NJ.push(j); } });
const COLV = (k, j) => 2.5 + ((DN[k] - 1) / 2 - j) * 7.5;          // 正面：竖排一列，j = 0 在最上面；整张网上移一点，避开底部字幕
const RING_R = [11, 10, 10, 10, 10, 10, 6];                    // 纵深：每层张开成一圈的半径（一样大，靠透视收拢成一条隧道）
const RING_A = { 4: [90, 0, 180, -90], 6: [90, 30, 150, -30, -150, -90], 2: [0, 180] };   // 各节点在圈上的方向（度）：左右交替张开，上下顺序不变
const TB = [0, 93.25, 0, 93.5, 0, 93.75];                           // 三个新层长出来的时刻（踩八分音符）
const born = (k, T) => smooth(seg(T, TB[k] - 0.3, TB[k] + 0.35));
const bendK = (m, T) => smooth(seg(T, TB[2 * m + 1] - 0.45, TB[2 * m + 1] + 0.1));   // 第 m 束连线从直线弯成经过新节点的折线
const turnK = (T) => E.p3(seg(T, 93.8, 95.4));                      // 转进纵深
const inhale = (T) => smooth(seg(T, 95.75, 96.0));                  // 重击前收一下、暗一下
const ignite = (k, T) => E.p2(seg(T, 95.0 + (0.8 * k) / 6.8 - 0.05, 95.0 + (0.8 * k) / 6.8 + 0.3));   // 那道光经过哪一层，那一层的节点就连成一整个光环
const FWD = [[84.8, 86.6], [89.8, 91.0], [92.8, 93.4]], BWD = [[87.2, 89.4], [91.2, 92.3]];
const waveF = (T) => { for (const [a, b] of FWD) if (T >= a && T < b + 0.3) return 6 * seg(T, a, b); return -9; };   // 波前在第几层（0–6）
const waveB = (T) => { for (const [a, b] of BWD) if (T >= a && T < b + 0.3) return 6 - 6 * seg(T, a, b); return -9; };
const waveD = (T) => (T >= 95.0 && T < 96.0 ? 6.8 * seg(T, 95.0, 95.8) : -9);        // 转进纵深之后：一道光一口气穿过 7 层

// 连线：正面时是原来 4 层之间的连线（FE，带权重）；长出新层后是 7 层之间的连线（DE）
const FE = [], FEX = {};
for (let m = 0; m < 3; m++) for (let a = 0; a < DN[2 * m]; a++) for (let b = 0; b < DN[2 * m + 2]; b++) {
  FEX[`${m},${a},${b}`] = FE.length; FE.push({ m, a: nid(2 * m, a), b: nid(2 * m + 2, b) });
}
const EW0 = FE.map((e, k) => 0.25 + 0.75 * frac(Math.sin(k * 12.9898) * 43758.5)), EW1 = FE.map((e, k) => 0.25 + 0.75 * frac(Math.sin(k * 78.233) * 12345.6));
const ew = (k, T) => lerp(EW0[k], EW1[k], smooth(seg(T, 88.6, 89.6)));
const DE = [];
for (let k = 0; k < 6; k++) for (let a = 0; a < DN[k]; a++) for (let b = 0; b < DN[k + 1]; b++) DE.push({ k, a: nid(k, a), b: nid(k + 1, b), nk: k % 2 ? k : k + 1 });

// 节点的世界坐标：沿网络轴线的位置 a、竖直 v、横向 w；转进纵深 = 轴线绕竖轴转 90°（输入层在近处），并和卷积网络的各层对齐
function nodeW(k, j, T, out, p) {
  const r = turnK(T), th = (r * Math.PI) / 2, c = Math.cos(th), s = Math.sin(th);
  const a = lerp((k - 3) * 10, -73 - LAYERS[k].z, r);
  const ang = (RING_A[DN[k]][j] * Math.PI) / 180, R = RING_R[k] * (1 - 0.07 * inhale(T));
  const v = lerp(COLV(k, j), R * Math.sin(ang), r), w = R * Math.cos(ang) * r;
  out[p] = a * c + w * s; out[p + 1] = v; out[p + 2] = -73 * r - a * s + w * c;
}
function ringW(k, ps, T, o) {                       // 第 k 层圈上方向 ps 的点
  const r = turnK(T), th = (r * Math.PI) / 2, c = Math.cos(th), s = Math.sin(th);
  const a = lerp((k - 3) * 10, -73 - LAYERS[k].z, r), R = RING_R[k] * (1 - 0.07 * inhale(T));
  const v = lerp(2.5, 0, r) + R * Math.sin(ps), w = R * Math.cos(ps);
  o.x = a * c + w * s; o.y = v; o.z = -73 * r - a * s + w * c;
}
const NW = new Float32Array(NNODE * 3);
let NWT = NaN;
function nodesAt(T) {                                // 这一帧 36 个节点的位置（按时间缓存）
  if (T !== NWT) { NWT = T; for (let n = 0; n < NNODE; n++) nodeW(NL[n], NJ[n], T, NW, n * 3); }
  return NW;
}

// 粒子分工（固定不变）：ROLE 0 = 原来 4 层的节点；1 = 新层的节点（长出来之前是它两侧连线上的流光）；2 = 流光
const ROLE = new Uint8Array(NM), NODE = new Uint8Array(NM), FEI = new Uint8Array(NM), FEM = new Uint8Array(NM), LORD = new Float32Array(NM);
const GR = new Uint8Array(NM);                       // 流光粒子里真正显示成"光点"的那部分（每条连线约 140 个，和原来一样稀、一样亮）
const NCNT = new Int32Array(NNODE);                  // 每个节点有多少粒子（亮度按它归一）
const PSI = new Float32Array(NM);                    // 节点粒子在圈上的方向（= 它在卷积网络里那个格子的方向）
{
  const near = (k, x, y, i) => {                     // 卷积网络第 k 层的格子 → 这一层圈上方向离它最近的节点
    if (DN[k] === 2) return x > 0 ? 0 : x < 0 ? 1 : rA[i] < 0.5 ? 0 : 1;
    const ps = Math.atan2(y, x);
    let best = 0, bd = 9;
    RING_A[DN[k]].forEach((d, j) => { let e = Math.abs(ps - (d * Math.PI) / 180); e = Math.min(e, 2 * Math.PI - e); if (e < bd) { bd = e; best = j; } });
    return best;
  };
  for (let k = 0; k < 7; k++) for (let i = CRANGE[k][0]; i < CRANGE[k][1]; i++) {
    const c = CELLS[i >> 1], n = nid(k, near(k, c.x, c.y, i));
    ROLE[i] = k % 2; NODE[i] = n; NCNT[n]++; PSI[i] = Math.atan2(c.y, c.x);
  }
  let ip = NCNN;                                     // 卷积网络用不到的粒子：先给太稀的节点补到 800 个，其余都当流光
  for (let n = 0; n < NNODE; n++) for (; NCNT[n] < 800; NCNT[n]++, ip++) {
    const k = NL[n], d = DN[k];
    ROLE[ip] = k % 2; NODE[ip] = n; PSI[ip] = ((RING_A[d][NJ[n]] * Math.PI) / 180) + (d > 2 ? (rA[ip] - 0.5) * ((2 * Math.PI) / d) : 0);
  }
  for (; ip < NM; ip++) ROLE[ip] = 2;
  const R = rng(1986);
  for (let i = 0; i < NM; i++) {
    if (ROLE[i] === 0) { LORD[i] = (NL[NODE[i]] / 6) * 0.8 + 0.2 * rB[i]; continue; }
    let m;
    if (ROLE[i] === 1) {                             // 新层的节点：先在它两侧那一束连线上流动，折线正好经过自己的节点
      m = (NL[NODE[i]] - 1) / 2;
      FEI[i] = FEX[`${m},${Math.floor(R() * DN[2 * m])},${Math.floor(R() * DN[2 * m + 2])}`]; FEM[i] = NODE[i];
    } else {
      FEI[i] = Math.floor(R() * FE.length); m = FE[FEI[i]].m; FEM[i] = nid(2 * m + 1, Math.floor(R() * 6));
      GR[i] = R() < 0.39 ? 1 : 0;
    }
    LORD[i] = ((2 * m + 1) / 6) * 0.8 + 0.2 * rB[i];
  }
}
// 寒冬的曲线用原来 4 层的节点粒子画：按节点从左到右、从上到下排好，曲线凝结成节点时不会交叉乱飞；雪用流光粒子（每 3 个取 1 个）
const WCURVE = new Float32Array(NM).fill(-1), WSNOW = new Uint8Array(NM);
{
  const pick = [];
  for (let i = 0; i < NM; i++) if (ROLE[i] === 0 && rC[i] < 0.8333) pick.push(i);
  pick.sort((p, q) => NODE[p] - NODE[q] || rC[p] - rC[q]);
  pick.forEach((i, r) => { WCURVE[i] = r / (pick.length - 1); });
  let n = 0;
  for (let i = 0; i < NM; i++) if (ROLE[i] !== 0 && n++ % 3 === 0) WSNOW[i] = 1;
}

// ELIZA 终端用寒冬里空闲的粒子画（既不是曲线也不是雪）
const TERM = new Int32Array(NM).fill(-1);
{ let n = 0; for (let i = 0; i < NM && n < 24000; i++) if (WCURVE[i] < 0 && !WSNOW[i]) TERM[i] = n++; }

function nodeCol(o, k, T) {
  const f = Math.exp(-((k - waveF(T)) ** 2) / 0.48), b = Math.exp(-((k - waveB(T)) ** 2) / 0.48), d = Math.exp(-((k - waveD(T)) ** 2) / 0.3);
  const err = k === 6 && T > 86.8 && T < 88 ? Math.exp(-(T - 86.8) / 0.4) : 0;
  const ok = k === 6 && T > 92.6 ? Math.exp(-(T - 92.6) / 0.5) : 0;
  const bg = k % 2 && T > TB[k] ? 1.4 * Math.exp(-(T - TB[k]) / 0.3) : 0;        // 新层刚长出来：亮一下
  const hi = f * 0.8 + d + bg;
  setCol(o, 1 + hi + b + err * 1.2 + ok, 0.84 + hi + b * 0.2 - err * 0.3 + ok, 0.7 + hi - b * 0.3 - err * 0.4 + ok * 0.8, 0.85 * (1 - 0.35 * inhale(T)), 0.12);
}
function flowAt(i, T, nw, o) {
  const e = FE[FEI[i]], m = e.m, back = i & 1, sp = 0.35 + 0.4 * rB[i];
  const Tc = Math.min(T, 96.0);
  // 往回流的一半：新层长出来之后（93.0 起）也改成往前流，位置连续
  const u = frac(rA[i] + (back ? Math.max(0, Tc - 93.0) - (Math.min(Tc, 93.0) - 84) : Tc - 84) * sp);
  const A = e.a * 3, B = e.b * 3, g = bendK(m, T);
  let x = lerp(nw[A], nw[B], u), y = lerp(nw[A + 1], nw[B + 1], u), z = lerp(nw[A + 2], nw[B + 2], u);
  if (g > 0) {                                       // 折线：A → 新节点 → B
    const M = FEM[i] * 3, P = u < 0.5 ? A : M, Q = u < 0.5 ? M : B, uu = u < 0.5 ? 2 * u : 2 * u - 1;
    x = lerp(x, lerp(nw[P], nw[Q], uu), g); y = lerp(y, lerp(nw[P + 1], nw[Q + 1], uu), g); z = lerp(z, lerp(nw[P + 2], nw[Q + 2], uu), g);
  }
  o.x = x + gX[i] * 0.06; o.y = y + gY[i] * 0.06; o.z = z + gZ[i] * 0.06;
  const l = 2 * m + 2 * u;                           // 在网络里的深度位置（第几层，0–6）
  const f = Math.exp(-((l - waveF(T)) ** 2) / 0.2), fd = Math.exp(-((l - waveD(T)) ** 2) / 0.3);
  const fin = smooth(seg(T, 84.6 + 0.5 * m, 85.8 + 0.5 * m)) * (1 - 0.35 * inhale(T));
  const aF = back ? 1.7 * Math.exp(-((l - waveB(T)) ** 2) / 0.2) : 0.08 + 0.22 * ew(FEI[i], T) + 1.5 * f;   // 正面：往前流的白光 / 往回流的橙光
  const aD = 0.07 + 1.4 * fd + 0.5 * f;                                                                      // 纵深：一起往前流
  const hot = back ? 1 - g : 0;
  // 流光要一颗颗看得见：只有 GR 那部分显示（亮度和原来一样）；新层的粒子只在汇聚成节点的那一刻亮起来
  const vis = ROLE[i] === 2 ? GR[i] : 0.5 * g;
  setCol(o, lerp(1 + 0.5 * (f + fd), 1.35, hot), lerp(0.84 + 0.4 * (f + fd), 0.5, hot), lerp(0.62 + 0.4 * (f + fd), 0.16, hot),
    fin * vis * lerp(aF, aD, g), 0.1 + 0.07 * Math.max(f, fd));
}
export function fNet(i, T, o) {
  const nw = nodesAt(T), role = ROLE[i];
  if (role === 2) { flowAt(i, T, nw, o); return; }
  const n = NODE[i], k = NL[n], p = n * 3;
  const cv = role === 0 ? 1 : E.p3(seg(T, TB[k] - 0.5 + 0.35 * rB[i], TB[k] - 0.05 + 0.35 * rB[i]));   // 新层：流光汇聚成节点
  if (cv < 1) flowAt(i, T, nw, o);
  if (cv <= 0) return;
  const fx = o.x, fy = o.y, fz = o.z, fr = o.r, fg = o.g, fb = o.b, fa = o.a, fs = o.s;
  ball(o, i, nw[p], nw[p + 1], nw[p + 2], 1.25);
  const sm = ignite(k, T);
  if (sm > 0) {                                      // 光经过时：节点沿着圈铺开，连成一整个光环（重击时从光环展开成特征图）
    const bx = o.x, by = o.y, bz = o.z;
    ringW(k, PSI[i], T, o);
    o.x = lerp(bx, o.x + gX[i] * 0.3, sm); o.y = lerp(by, o.y + gY[i] * 0.3, sm); o.z = lerp(bz, o.z + gZ[i] * 0.3, sm);
  }
  nodeCol(o, k, T);
  o.a *= 1000 / NCNT[n];
  if (cv < 1) {
    o.x = lerp(fx, o.x, cv); o.y = lerp(fy, o.y, cv); o.z = lerp(fz, o.z, cv);
    o.r = lerp(fr, o.r, cv); o.g = lerp(fg, o.g, cv); o.b = lerp(fb, o.b, cv); o.a = lerp(fa, o.a, cv); o.s = lerp(fs, o.s, cv);
  }
}
function netLines(T, L) {
  const nw = nodesAt(T), wf = waveF(T), wb = waveB(T), wd = waveD(T);
  const dim = 1 - 0.35 * inhale(T), out = 1 - smooth(seg(T, 96.0, 96.45));
  FE.forEach((e, k) => {                             // 正面的连线（带权重）：新层长出来时淡出
    const fade = smooth(seg(T, 84.6 + 0.5 * e.m, 85.8 + 0.5 * e.m)) * (1 - bendK(e.m, T));
    if (fade < 0.01) return;
    const A = e.a * 3, B = e.b * 3, lm = 2 * e.m + 1;
    const f = Math.exp(-((lm - wf) ** 2) / 0.6), b = Math.exp(-((lm - wb) ** 2) / 0.6);
    const base = (0.08 + 0.22 * ew(k, T)) * fade;
    const r = base + f * 0.5 + b * 0.7, g = base * 0.8 + f * 0.5 + b * 0.25, bl = base * 0.6 + f * 0.45 + b * 0.05;
    L.seg(nw[A], nw[A + 1], nw[A + 2], r, g, bl, nw[B], nw[B + 1], nw[B + 2], r, g, bl);
  });
  const r = turnK(T), rk = smooth(seg(r, 0.6, 1)), th = (r * Math.PI) / 2, cs = Math.cos(th), sn = Math.sin(th);
  if (rk > 0.01) for (let k = 0; k < 6; k++) {       // 每层一道光圈（输出层只有两个节点，不画）
    const q = (0.07 * rk + 0.2 * ignite(k, T)) * dim * out * (1 + 4 * Math.exp(-((k - wd) ** 2) / 0.3));
    const a = lerp((k - 3) * 10, -73 - LAYERS[k].z, r), R = RING_R[k] * (1 - 0.07 * inhale(T));
    const cx = a * cs, cy = lerp(2.5, 0, r), cz = -73 * r - a * sn;   // （圈心；和 ringW 一致）
    for (let t = 0; t < 48; t++) {
      const a0 = (t / 48) * 2 * Math.PI, a1 = ((t + 1) / 48) * 2 * Math.PI;
      L.seg(cx + R * Math.cos(a0) * sn, cy + R * Math.sin(a0), cz + R * Math.cos(a0) * cs, q, q * 0.82, q * 0.62,
        cx + R * Math.cos(a1) * sn, cy + R * Math.sin(a1), cz + R * Math.cos(a1) * cs, q, q * 0.82, q * 0.62);
    }
  }
  DE.forEach((e) => {                                // 7 层之间的连线：跟着它连着的新层一起长出来
    const fade = born(e.nk, T) * dim * out * (1 - 0.75 * ignite(e.k + 1, T));
    if (fade < 0.01) return;
    const A = e.a * 3, B = e.b * 3, lm = e.k + 0.5;
    const d = Math.exp(-((lm - wd) ** 2) / 0.3), f = Math.exp(-((lm - wf) ** 2) / 0.6);
    const q = (0.07 + 0.6 * d + 0.3 * f) * fade;
    L.seg(nw[A], nw[A + 1], nw[A + 2], q, q * 0.8, q * 0.6, nw[B], nw[B + 1], nw[B + 2], q, q * 0.8, q * 0.6);
  });
}

// ---------------------------------------------------------------- 登记
export function a1() {
  TAI = sampleText('ARTIFICIAL INTELLIGENCE', { font: '600 200px Inter', count: KAI, width: 74, seed: 5 }).pts;
  layoutEliza();

  SEGS.push({ t: T1, form: (i, T, o) => { ball(o, i, 0, 0, 0, 0.4); setCol(o, 0.8, 0.85, 1, 0, 0.12); } });
  SEGS.push({ t: 37.5, form: fImit, tr: { type: 'swirl', dur: 1.0, spread: 0.45, amp: 5 } });
  SEGS.push({ t: 46.0, form: fFound, tr: { type: 'morph', dur: 1.2, spread: 0.5 } });
  SEGS.push({ t: 48.4, form: fAI, tr: { type: 'swirl', dur: 1.4, spread: 0.7, amp: 7 } });
  SEGS.push({ t: 54.0, form: fNeuron, tr: { type: 'swirl', dur: 1.4, spread: 0.7, amp: 6 } });
  SEGS.push({ t: 64.0, form: fTerm, tr: { type: 'swirl', dur: 1.3, spread: 0.6, amp: 5 } });
  SEGS.push({ t: 71.4, form: fWinter });                                  // 同一批粒子接着画终端：拉远不换形态、不打散
  SEGS.push({ t: 84.0, form: fNet, tr: { type: 'swirl', dur: 1.25, spread: 1.4, amp: 1.5, order: (i) => LORD[i] } });   // 从左到右凝成网络
  GSEGS.push({ t: 64.0, form: gEliza });
  LINES.push({ t0: 46.3, t1: 48.9, fn: (T, L) => {
    const k = 0.35 * smooth(seg(T, 46.3, 47.0)) * (1 - smooth(seg(T, 48.3, 48.9)));
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) L.seg(...FNat(a, T), k, k * 0.8, k * 0.6, ...FNat(b, T), k, k * 0.8, k * 0.6);
  } });
  LINES.push({ t0: 84.0, t1: 97.0, fn: netLines });

  CORE.push({ t0: 29.85, t1: 38.6, pos: [0, 0, 0],
    a: (T) => { const pulse = heartPulse(T), pop = T >= 30 ? 2.5 * Math.exp(-(T - 30) / 0.2) : 0; return smooth(seg(T, 29.85, 30.0)) * (1.1 + pop + 1.3 * pulse) * (1 - smooth(seg(T, 38.0, 38.5))); },
    s: (T) => 1.7 + 1.3 * heartPulse(T), col: () => [0.75, 0.85, 1.0] });
  for (const [t, s] of HEART) if (t < 38 && s > 0.9) RINGS.push({ t, n: 2400, R0: 0.8, R1: 30, k: 0.5, life: 0.98, a: 0.6, col: [0.6, 0.75, 1], s: 0.2, flat: 1, c: [0, 0, 0] });

  CAMK.push(
    { t: 38.0,  p: [0, 0, 66],   q: [0, -4.8, 0], fov: 50, roll: 0 },
    { t: 39.2,  p: [-7, 3, 64],  q: [-1.5, 0, 0], fov: 50, roll: -0.01 },   // 模仿游戏：从左侧慢慢横移到右侧，视差带出帘幕墙和轨道的纵深
    { t: 42.6,  p: [1, 4.5, 62], q: [-0.5, 0, 0], fov: 50, roll: 0 },
    { t: 45.8,  p: [8, 3, 67],   q: [0.5, 0, 0], fov: 50, roll: 0.01 },
    { t: 48.6,  p: [0, 1, 76],   q: [0, 1, 0], fov: 50, roll: 0 },
    { t: 53.8,  p: [-3, 0, 72],  q: [0, 1, 0], fov: 50, roll: -0.01 },
    { t: 58.0,  p: [-7, 4, 68],  q: [0, 0, 0], fov: 50, roll: 0.02 },
    { t: 63.8,  p: [2, 1, 66],   q: [0, 1, 0], fov: 50, roll: 0 },
    { t: 71.6,  p: [0, 2, 62],   q: [0, 2, 0], fov: 50, roll: 0 },
    { t: 73.0,  p: [1, 3, 72],   q: [-1, 0.5, 0], fov: 50, roll: 0.005 },  // 拉远：终端缩成曲线上的一点
    { t: 78.0,  p: [3, 4, 78],   q: [0, -2, 0], fov: 50, roll: 0.01 },
    { t: 83.8,  p: [0, 1, 76],   q: [0, 0, 0], fov: 50, roll: 0 },
    { t: 88.2,  p: [-4, 3, 72],  q: [0, 2, 0], fov: 50, roll: 0.01 },
    { t: 92.6,  p: [2, 2.5, 67], q: [0, 2, 0], fov: 50, roll: 0 },
    { t: 94.2,  p: [5, 3.5, 62], q: [0, 1.5, -12], fov: 50, roll: 0 },
    { t: 95.0,  p: [14, 6, 54],  q: [-2, 0, -40], fov: 50, roll: 0.02 },     // 网络转身时镜头往侧前方走：斜着看这条"隧道"（一直向前，不停）
    { t: 95.8,  p: [19, 8, 44],  q: [-7, -3, -62], fov: 50, roll: 0.03 },
  );
  FOCUS.push({ t0: 30.2, t1: 97, fn: () => distTo(0, 0, 0) });
  key('bloom', [30.2, 2.8], [38.0, 2.6], [46, 2.4], [72, 2.2], [84, 2.4], [96, 2.4]);
  key('spread', [30.2, 0.55], [96, 0.55]);
  key('ap', [30.4, 0.02], [37.5, 0.02], [38.5, 0.012], [96, 0.012]);
  key('cold', [29.5, 1.0], [37.6, 1.0], [39.5, 0.55], [63.5, 0.4], [74.9, 0.45], [75.9, 0.85], [84, 0.85], [88, 0.35], [93, 0.05], [96, 0]);
  key('dust', [30.4, 0.65], [38, 0.65], [40, 0.9], [74.9, 0.9], [76.6, 0.3], [84.0, 0.3], [86.5, 0.9], [96, 0.9]);
  key('streak', [30.2, 0], [37.9, 0], [38.2, 0.03], [39.6, 0.02], [96, 0.02]);
  key('streakI', [30.2, 0.4], [96, 0.4]);
  key('glyphAp', [60, 0.002]);

  scene({ id: 'a1', start: 30, dur: 67 }, (S) => {
    const cue = S.cue;
    for (const [t, s] of HEART) if (t < 38) cue(t - 30, 'heart', { strength: s });
    cue(38.0 - 30, 'whoosh', { dur: 1.4, size: 0.4, gain: -12 });
    for (const [t] of MSG) { cue(t - 30, 'blip', { pitch: 2100, kind: 'tick', gain: -16 }); cue(t + 0.6 - 30, 'blip', { pitch: 1760, kind: 'tick', gain: -18 }); }
    cue(44.5 - 30, 'blip', { pitch: 1320, kind: 'confirm', gain: -12 });
    cue(46.0 - 30, 'whoosh', { dur: 1.2, size: 0.4, gain: -12 });
    cue(48.4 - 30, 'reverse', { dur: 1.0, size: 0.6, gain: -10 });
    for (const [t, , w] of PICK) {                 // 出示一个例子 → 分错（低沉两声 + 分界线转动）/ 分对（轻轻一声）
      cue(t - 30, 'blip', { pitch: 1568, kind: 'tick', gain: -14 });
      if (w) { cue(t + 0.12 - 30, 'blip', { pitch: 880, kind: 'error', gain: -11 }); cue(t + 0.15 - 30, 'whoosh', { dur: 0.55, size: 0.25, gain: -16 }); }
      else cue(t + 0.12 - 30, 'blip', { pitch: 1760, kind: 'confirm', gain: -16 });
    }
    cue(61.9 - 30, 'blip', { pitch: 1320, kind: 'confirm', gain: -11 });
    cue(54.0 - 30, 'whoosh', { dur: 1.2, size: 0.4, gain: -13 });
    cue(64.0 - 30, 'whoosh', { dur: 1.2, size: 0.4, gain: -12 });
    ELIZA.forEach((L, li) => {                     // 你打的字 = 键盘声；ELIZA 的回答 = 数据流声；关键词飞过去 = 一声轻掠
      const ts = EG.filter((c) => c.li === li && !c.src && [...L.text][c.m] !== ' ').map((c) => c.t);
      charCue(S, L.text.startsWith('>') ? 'keys' : 'stream', ts, { gain: L.text.startsWith('>') ? -12 : -15 });
    });
    cue(66.57 - 30, 'whoosh', { dur: 0.6, size: 0.25, gain: -15 });
    cue(71.5 - 30, 'whoosh', { dur: 1.6, size: 0.6, gain: -14 });                 // 拉远
    cue(75.0 - 30, 'glitch', { dur: 0.35, gain: -17 });                           // 曲线跌下去：小屏幕熄灭
    cue(75.0 - 30, 'wind', { dur: 10.0, gain: -10 });                              // 寒风
    cue(84.0 - 30, 'whoosh', { dur: 2.4, size: 0.6, gain: -10 });
    for (const [a] of FWD) cue(a - 30, 'chirp', { dur: 1.0, gain: -14 });
    cue(86.8 - 30, 'blip', { pitch: 880, kind: 'error', gain: -12 });
    for (const [a, b] of BWD) cue(a - 30, 'reverse', { dur: b - a, size: 0.5, gain: -12 });
    cue(92.6 - 30, 'blip', { pitch: 1760, kind: 'confirm', gain: -10 });
    cue(93.0 - 30, 'riser', { dur: 3.0, gain: -6 });
    // 三个新层依次长出来：F6 → G6 → A6 一步步往上（这三刻配乐里正好空着这几个音，D6 会被配乐盖住）
    [1397, 1568, 1760].forEach((f, n) => cue(TB[2 * n + 1] - 30, 'blip', { pitch: f, kind: 'tick', gain: n ? -15 : -13 }));
    cue(93.9 - 30, 'whoosh', { dur: 1.8, size: 0.8, gain: -13 });                   // 整张网转进纵深
    cue(95.0 - 30, 'chirp', { dur: 0.8, gain: -15 });                               // 一道光穿过 7 层

    // 1950
    // 论文原句，打字机逐字打出（每个字一声按键）
    const TQ = '“CAN MACHINES THINK?”';
    const tq = S.add(h('div', { class: 'big mono turing-q glow-cold' }));
    tq.style.top = '578px';
    typewriter(S, tq, TQ, 30.9 - 30, 14, { until: 33.0 - 30 });
    S.update((t, T) => { tq.style.opacity = (1 - smooth(seg(T, 37.2, 37.7))).toFixed(3); }, 0, 67);
    charCue(S, 'keys', typeTimes(30.9, TQ, 14), { gain: -10 });
    title(S, '机器能思考吗？', { t0: 32.1, t1: 37.7, size: 58, weight: 300, ls: '0.14em', stagger: 0.1, inDur: 1.6, y: 700, cls: 'glow-cold' });
    title(S, '—— 阿兰·图灵《计算机器与智能》· 1950', { t0: 33.4, t1: 37.7, size: 26, weight: 300, cls: 'dim', ls: '0.24em', stagger: 0.03, blur: 8, y: 790, scale: 1 });
    // 模仿游戏
    title(S, '如果隔着文字，你分不出哪一边是机器——', { t0: 39.0, t1: 42.4, size: 50, weight: 300, ls: '0.1em', y: 880 });
    title(S, '那它，算不算在思考？', { t0: 42.7, t1: 45.8, size: 56, weight: 400, ls: '0.14em', stagger: 0.07, y: 880 });
    // 达特茅斯
    title(S, '“人工智能”有了自己的名字', { t0: 49.4, t1: 53.8, size: 56, weight: 300, ls: '0.14em', y: 760 });
    // 感知机
    title(S, '感知机：让机器从例子中学习', { t0: 54.9, t1: 58.7, size: 52, weight: 300, ls: '0.12em', y: 930 });
    title(S, '答错了，就调整权重——今天的神经网络，仍然这样学习。', { t0: 59.1, t1: 63.7, size: 44, weight: 300, ls: '0.08em', y: 930 });
    // ELIZA
    title(S, '它并不理解你——但很多人以为它懂。', { t0: 69.4, t1: 72.7, size: 50, weight: 300, ls: '0.1em', y: 930 });
    // 寒冬
    title(S, '两次寒冬', { t0: 75.05, t1: 79.0, size: 96, weight: 200, ls: '0.4em', stagger: 0.12, inDur: 1.6, y: 118, cls: 'glow-cold' });
    title(S, '期望太高，算力太弱，资金一次次撤离。', { t0: 78.4, t1: 83.7, size: 48, weight: 300, ls: '0.1em', y: 930 });
    // 反向传播
    title(S, '反向传播：把误差逐层传回，修正每一个权重。', { t0: 86.4, t1: 91.8, size: 46, weight: 300, ls: '0.08em', y: 930 });
    title(S, '多层网络，终于可以被有效训练了。', { t0: 92.4, t1: 95.9, size: 50, weight: 300, ls: '0.12em', y: 930 });
  });

  // ---------------- 机能标注 ----------------
  chapter({ t0: 31.0, t1: 37.0, num: '01 / 06', title: '一个问题', sub: '1950 — 1990' });
  callout({ t0: 39.4, t1: 45.8, at: (T) => entAt(0, T), dx: -150, dy: -80, idx: 'C', title: '提问者' });
  callout({ t0: 39.8, t1: 44.55, at: (T) => entAt(1, T), dx: 150, dy: -60, idx: 'A', title: '？' });          // 揭晓时让位给"A = 机器"
  callout({ t0: 40.1, t1: 44.75, at: (T) => entAt(2, T), dx: 150, dy: 60, idx: 'B', title: '？' });
  tag({ t0: 44.5, t1: 45.8, at: (T) => plus(entAt(1, T), 8.5, 2.6), text: 'A = 机器', cls: 'acc cn reveal', scramble: false });
  tag({ t0: 44.7, t1: 45.8, at: (T) => plus(entAt(2, T), 8.5, -2.6), text: 'B = 人', cls: 'cn reveal', scramble: false });
  [[38.9, 40.3, 0, '你会下国际象棋吗？', 1], [39.55, 41.2, 1, '会。', 0]]
    .forEach(([a, b, e, text, q]) => tag({ t0: a, t1: b, at: (T) => plus(entAt(e, T), q ? 1 : -2, q ? 6.4 : 7.4), text, cls: 'cn bubble' + (q ? '' : ' reply'), scramble: false, fin: 0.2 }));
  tag({ t0: 39.2, t1: 45.8, at: [960, 150], text: 'THE IMITATION GAME · 模仿游戏', cls: 'dim' });
  ['J. McCARTHY', 'M. MINSKY', 'N. ROCHESTER', 'C. SHANNON'].forEach((n, k) => {
    const d = [[0, -80], [-160, -40], [160, -40], [0, 80]][k];
    callout({ t0: 46.5 + 0.15 * k, t1: 48.5, at: (T) => FNat(k, T), dx: d[0], dy: d[1], title: n, size: 18 });
  });
  tag({ t0: 49.0, t1: 53.8, at: [0, 11.5, 0], text: '1955 提案 · 1956 达特茅斯会议', cls: 'dim cn', scramble: false });
  tag({ t0: 54.6, t1: 63.7, at: [960, 150], text: '1958 · F. ROSENBLATT · PERCEPTRON', cls: 'dim' });
  tag({ t0: 55.0, t1: 63.7, at: [19, 13.5, 0], text: '● 猫', cls: 'cn prot', scramble: false }).style.color = '#ffa36b';
  tag({ t0: 55.2, t1: 63.7, at: [-19, -13.5, 0], text: '● 狗', cls: 'cn prot', scramble: false }).style.color = '#8fb4ff';
  const onLine = (T, s0) => { const st = lineAt(T), nx = Math.cos(st[0]), ny = Math.sin(st[0]); return [nx * st[1] - ny * s0, ny * st[1] + nx * s0, 0]; };
  callout({ t0: 55.5, t1: 63.7, at: (T) => onLine(T, 15), dx: 140, dy: -60, idx: 'w', title: '分界线', size: 24 });
  PICK.forEach(([t, n, w]) => {
    const [x, y] = PTS[n];
    tag({ t0: t + 0.1, t1: t + (w ? 1.1 : 0.8), at: [x + (x > 0 ? -3 : 3), y + 3.2, 0], text: w ? '✕' : '✓', cls: (w ? 'acc ' : '') + 'cn prot', scramble: false, fin: 0.12 });
    RINGS.push({ t, n: 1400, R0: 0.5, R1: 6.5, k: 0.22, life: 0.7, a: 0.9, col: w ? [1, 0.32, 0.2] : [0.85, 1, 0.9], s: 0.12, flat: 1, c: [x, y, 0] });
  });
  tag({ t0: 61.9, t1: 63.6, at: [0, 20.5, 0], text: '✓ 全部分对', cls: 'cn prot', scramble: false });
  const scrBox = () => { const a = project(-SCR.w / 2, SCR.cy + SCR.h / 2, 0), b = project(SCR.w / 2, SCR.cy - SCR.h / 2, 0); return [a.x, a.y, b.x - a.x, b.y - a.y]; };
  tag({ t0: 64.6, t1: 71.5, at: () => { const b = scrBox(); return [b[0], b[1] - 24]; }, text: 'ELIZA · 1966 · J. WEIZENBAUM · MIT', cls: 'dim', center: false });
  tag({ t0: 65.0, t1: 71.5, at: () => { const b = scrBox(); return [b[0] + b[2], b[1] + b[3] + 24]; }, text: '示意对话', cls: 'dim cn', center: false, dx: -80 });
  const hlc = EG.filter((c) => c.hl && c.bot);
  callout({ t0: 67.5, t1: 71.5, at: [(hlc[0].x + hlc[hlc.length - 1].x) / 2, hlc[0].y - 1.6, 0], dx: 170, dy: 130, idx: '*', title: '关键词匹配 + 句式替换', accent: true, size: 18 });
  wline({ t0: 71.9, t1: 83.8, pts: () => [[YX(1950), -16.5, 0], [YX(2000), -16.5, 0]], color: 'rgba(170,200,255,.45)' });
  [1950, 1960, 1970, 1980, 1990, 2000].forEach((y, k) => tag({ t0: 72.1 + 0.1 * k, t1: 83.8, at: [YX(y), -19, 0], text: String(y), cls: 'dim' }));
  [[1974, 1980, '第一次寒冬', '1974—1980'], [1987, 1993, '第二次寒冬', '1987—1990 年代']].forEach(([a, b, t, yr], k) => {
    wline({ t0: 75.4 + 2.4 * k, t1: 83.8, pts: () => [[YX(a), -16.5, 0], [YX(a), 20, 0]], color: 'rgba(170,200,255,.35)', dash: '3 5' });
    wline({ t0: 75.4 + 2.4 * k, t1: 83.8, pts: () => [[YX(b), -16.5, 0], [YX(b), 20, 0]], color: 'rgba(170,200,255,.35)', dash: '3 5' });
    tag({ t0: 75.6 + 2.4 * k, t1: 83.8, at: [(YX(a) + YX(b)) / 2, 19.4, 0], text: t, cls: 'cn', scramble: false });
    tag({ t0: 75.8 + 2.4 * k, t1: 83.8, at: [(YX(a) + YX(b)) / 2, 16.6, 0], text: yr, cls: 'dim cn sm', scramble: false });
  });
  tag({ t0: 72.8, t1: 83.8, at: [YX(1951), 17, 0], text: '期望与投入', cls: 'dim cn', center: false, scramble: false });
  tag({ t0: 85.0, t1: 95.8, at: [960, 150], text: '1986 · RUMELHART · HINTON · WILLIAMS', cls: 'dim' });
  callout({ t0: 86.8, t1: 89.2, at: [30, COLV(6, 1), 0], dx: 110, dy: 70, idx: 'Δ', title: '误差', accent: true, size: 18 });
}
