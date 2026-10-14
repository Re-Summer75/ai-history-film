// 整片导演：各幕往这里登记"形态段"、相机关键帧、参数轨道、闪白/震屏/冲击环/心跳，
// 这里负责把它们合成一条确定性的时间线，并逐帧写入粒子缓冲。
import { camera, bloom, fx, Particles, Lines, Glyphs, onFrame, pxPerUnit } from './world.js';
import { track, camPathSmooth, shaker, smooth, clamp, lerp, seg, rng, E } from './kit.js';

export const DUR = 352;
export const NM = 56000;          // 主粒子
export const NG = 12000;          // 字符粒子
export const NR = 6000;           // 冲击波环
export const ND = 7000;           // 环境尘埃
export const TAU2 = Math.PI * 2;

// ---------------------------------------------------------------- 每个粒子的固定随机属性（各幕共用）
const R0 = rng(20260927);
export const gauss = (R = R0) => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(TAU2 * R());
export const rA = new Float32Array(NM), rB = new Float32Array(NM), rC = new Float32Array(NM), rD = new Float32Array(NM);
export const gX = new Float32Array(NM), gY = new Float32Array(NM), gZ = new Float32Array(NM);   // 标准正态
export const uX = new Float32Array(NM), uY = new Float32Array(NM), uZ = new Float32Array(NM);   // 随机单位向量
for (let i = 0; i < NM; i++) {
  rA[i] = R0(); rB[i] = R0(); rC[i] = R0(); rD[i] = R0();
  gX[i] = gauss(); gY[i] = gauss(); gZ[i] = gauss();
  const l = Math.hypot(gX[i], gY[i], gZ[i]) || 1;
  uX[i] = gX[i] / l; uY[i] = gY[i] / l; uZ[i] = gZ[i] / l;
}
export const grA = new Float32Array(NG), grB = new Float32Array(NG), grC = new Float32Array(NG);
for (let j = 0; j < NG; j++) { grA[j] = R0(); grB[j] = R0(); grC[j] = R0(); }

// ---------------------------------------------------------------- 登记表
export const SEGS = [];      // 主粒子形态段 {t, form(i,T,o), tr?:{type,dur,spread,order(i),ease,amp}, pre?(T)}
export const GSEGS = [];     // 字符粒子形态段（同上，form(j,T,o) 还要写 o.g 字形编号）
export const LINES = [];     // {t0, t1, fn(T, L)}
export const CAMK = [];      // 相机关键帧
export const KEYS = { bloom: [], spread: [], zoom: [], ca: [], expo: [], ap: [], streak: [], streakI: [], cold: [], dust: [], fade: [], glyphAp: [], calm: [] };   // calm：1 = 关掉手持漂浮
export const FLASH = [];     // [t, 强度, 衰减秒]
export const SHAKE = [];     // [t, 强度, 衰减秒]
export const RINGS = [];     // {t, n, R0, R1, k, life, a, col, s, flat, c:[x,y,z]}
export const HEART = [];     // [t, 强度]
export const CORE = [];      // {t0, t1, pos:[x,y,z], a(T), s(T), col(T)}
export const HOOKS = [];     // 每帧调用的额外更新 fn(T, ctx)
export const FOCUS = [];     // {t0, t1, fn(T) → 对焦距离}；没有登记的时刻对焦在相机注视点
export const XP = [];        // 额外的大粒子层 {t0, t1, n, fn(i, T, o)}：只在自己的时间段里算、画（例如 2.8 万亿参数 = 28 万个点），其余时间不画
                             // fn 里不能用 rA/gX 这些按主粒子数 NM 准备的随机数组（i 会超出 NM）
export const distTo = (x, y, z) => Math.hypot(CAMP.x - x, CAMP.y - y, CAMP.z - z);

export function key(name, ...ks) { KEYS[name].push(...ks); }
export const dustClock = { fn: (T) => T * 0.35 };   // 环境尘埃的漂移时钟（第 0 幕会换成可冻结、倒流的世界时钟）

// ---------------------------------------------------------------- 分幕时间重排
// 各幕照旧用自己原来的时间写；登记完由 warpSince 按本幕的时间映射 W（见 warp.js）换算成成片时间：
// 各种时刻 → W.inv(时刻)；形态段、连线、光点、对焦、尘埃时钟的回调收到的仍是"本幕原来的时间" W.fwd(T)。
// 心跳表 HEART 保持原来的时间（只在光点回调里用）。
export const ACT = { W: null };   // 正在登记的这一幕的时间映射（个别需要按成片时间计时的效果用，如越转越快的循环）
export function markReg() {
  return { SEGS: SEGS.length, GSEGS: GSEGS.length, LINES: LINES.length, CAMK: CAMK.length, FLASH: FLASH.length, SHAKE: SHAKE.length,
    RINGS: RINGS.length, CORE: CORE.length, FOCUS: FOCUS.length, XP: XP.length, KEYS: Object.fromEntries(Object.keys(KEYS).map((k) => [k, KEYS[k].length])),
    dust: dustClock.fn };
}
export function warpSince(m, W) {
  if (W.identity) return;
  const F = W.fwd, I = W.inv;
  for (const L of [SEGS, GSEGS]) for (const S of L.slice(L === SEGS ? m.SEGS : m.GSEGS)) {
    S.t = I(S.t);
    const f = S.form; S.form = (i, T, o) => f(i, F(T), o);
    if (S.pre) { const p = S.pre; S.pre = (T) => p(F(T)); }
  }
  for (const Ln of LINES.slice(m.LINES)) { Ln.t0 = I(Ln.t0); Ln.t1 = I(Ln.t1); const f = Ln.fn; Ln.fn = (T, Lb) => f(F(T), Lb); }
  for (const k of CAMK.slice(m.CAMK)) k.t = I(k.t);
  for (const a of FLASH.slice(m.FLASH)) a[0] = I(a[0]);
  for (const a of SHAKE.slice(m.SHAKE)) a[0] = I(a[0]);
  for (const r of RINGS.slice(m.RINGS)) r.t = I(r.t);
  for (const C of CORE.slice(m.CORE)) { C.t0 = I(C.t0); C.t1 = I(C.t1); for (const k of ['a', 's', 'col']) { const f = C[k]; C[k] = (T) => f(F(T)); } }
  for (const Fo of FOCUS.slice(m.FOCUS)) { Fo.t0 = I(Fo.t0); Fo.t1 = I(Fo.t1); const f = Fo.fn; Fo.fn = (T) => f(F(T)); }
  for (const X of XP.slice(m.XP)) { X.t0 = I(X.t0); X.t1 = I(X.t1); const f = X.fn; X.fn = (i, T, o) => f(i, F(T), o); }
  for (const k of Object.keys(KEYS)) for (const a of KEYS[k].slice(m.KEYS[k])) a[0] = I(a[0]);
  if (dustClock.fn !== m.dust) { const f = dustClock.fn; dustClock.fn = (T) => f(F(T)); }
}

// ---------------------------------------------------------------- 过渡
// 每个形态段可以指定进入方式：morph（直接插值）、swirl（带绕行）、fly（加速冲入）、fade（先隐后现）
const O2 = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, s: 0 };
function blend(tr, i, q, from, to) {
  const e = tr.ease(q);
  let x = lerp(from.x, to.x, e), y = lerp(from.y, to.y, e), z = lerp(from.z, to.z, e);
  if (tr.type === 'swirl') {
    const w = Math.sin(Math.PI * q) * tr.amp;
    x += uX[i] * w; y += uY[i] * w; z += uZ[i] * w;
  }
  to.x = x; to.y = y; to.z = z;
  if (tr.type === 'fade') {
    to.a = q < 0.5 ? from.a * (1 - smooth(q * 2)) : to.a * smooth(q * 2 - 1);
    if (q < 0.5) { to.x = from.x; to.y = from.y; to.z = from.z; to.r = from.r; to.g = from.g; to.b = from.b; to.s = from.s; }
    return;
  }
  to.r = lerp(from.r, to.r, e); to.g = lerp(from.g, to.g, e); to.b = lerp(from.b, to.b, e);
  to.a = lerp(from.a, to.a, e); to.s = lerp(from.s, to.s, e);
}
function mkTr(tr) {
  if (!tr) return null;
  const t = { type: 'morph', dur: 1.2, spread: 0.6, amp: 6, order: (i) => rA[i], ...tr };
  if (!t.ease) t.ease = t.type === 'fly' ? (q) => q * q * q : E.p3;
  return t;
}

function segAt(list, T) {
  let lo = 0, hi = list.length - 1;
  if (T < list[0].t) return 0;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (list[m].t <= T) lo = m; else hi = m - 1; }
  return lo;
}

function evalSeg(list, i, T, o) {
  const k = segAt(list, T);
  const S = list[k];
  S.form(i, T, o);
  if (k > 0 && S.trx) {
    const tr = S.trx;
    const q = (T - S.t - tr.spread * tr.order(i)) / tr.dur;
    if (q < 1) {
      list[k - 1].form(i, T, O2);
      if (q <= 0) { Object.assign(o, O2); return; }
      if (list === GSEGS && q < 0.5) o.gl = O2.gl;
      blend(tr, i, q, O2, o);
    }
  }
}

// ---------------------------------------------------------------- 构建
let P, G, L, PX = null;
const TR = {};
export function build() {
  P = new Particles(NM + NR + ND + 1);
  G = new Glyphs(NG, CHARSET.s);
  L = new Lines(60000);
  const XN = XP.reduce((a, x) => Math.max(a, x.n), 0);
  if (XN) { PX = new Particles(XN); PX.geo.setDrawRange(0, 0); }
  SEGS.sort((a, b) => a.t - b.t);
  GSEGS.sort((a, b) => a.t - b.t);
  for (const S of SEGS) S.trx = mkTr(S.tr);
  for (const S of GSEGS) S.trx = mkTr(S.tr);
  for (const k of Object.keys(KEYS)) {
    const ks = KEYS[k].slice().sort((a, b) => a[0] - b[0]);
    TR[k] = ks.length ? track(ks) : () => 0;
  }
  CAMK.sort((a, b) => a.t - b.t);
  TR.cam = camPathSmooth(CAMK);
  TR.shake = shaker(SHAKE);
  RINGS.sort((a, b) => a.t - b.t);
  initRings();
  initDust();
  onFrame(frame);
  window.__dbg = { bloom, fx, P, G, L, camera, TR };
  return { P, G, L };
}
// 字形表：ASCII 在前（编号固定），各幕用到的其他字符按登记顺序追加
export const CHARSET = { s: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') };
export function gid(ch) { let k = CHARSET.s.indexOf(ch); if (k < 0) { CHARSET.s += ch; k = CHARSET.s.length - 1; } return k; }

// ---------------------------------------------------------------- 冲击环
const RJ = new Float32Array(NR), RT = new Float32Array(NR), RZ = new Float32Array(NR);
function initRings() {
  const R = rng(77);
  for (let j = 0; j < NR; j++) { RJ[j] = R() < 0.25 ? 0.8 + 0.05 * gauss(R) : 1 + 0.035 * gauss(R); RT[j] = (R() - 0.5) * 0.004; RZ[j] = gauss(R) * 0.5; }
}

// ---------------------------------------------------------------- 尘埃（全片都在，提供空间感）
const DX = new Float32Array(ND), DY = new Float32Array(ND), DZ = new Float32Array(ND), DV = new Float32Array(ND * 3), DS = new Float32Array(ND), DA = new Float32Array(ND);
function initDust() {
  const R = rng(99);
  for (let j = 0; j < ND; j++) {
    DX[j] = (R() - 0.5) * 420; DY[j] = (R() - 0.5) * 260; DZ[j] = -600 + 820 * R();
    DV[3 * j] = (R() - 0.5) * 1.2; DV[3 * j + 1] = (R() - 0.5) * 0.8; DV[3 * j + 2] = (R() - 0.5) * 1.2;
    DS[j] = 0.12 + 0.2 * R(); DA[j] = 0.1 + 0.25 * R();
  }
}

// ---------------------------------------------------------------- 逐帧
const O = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, s: 0, gl: 0 };
const Q = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, s: 0, gl: 0 };
export const CAMP = { x: 0, y: 0, z: 100 };
export const FRAME = { T: 0, focus: 70 };
const stageFlash = document.getElementById('flash');
const stageFade = document.getElementById('fade');
const scenesEl = document.getElementById('scenes');
const hudEl = document.getElementById('hud');


function frame(T) {
  FRAME.T = T;
  const c = TR.cam(T), sh = TR.shake(T);
  // 全片的轻微漂浮（像手持的呼吸感）：镜头永远不会完全静止；幅度与到注视点的距离成正比，周期 12–33 s
  const dq = Math.hypot(c.p[0] - c.q[0], c.p[1] - c.q[1], c.p[2] - c.q[2]) * (1 - TR.calm(T));
  const drx = dq * (0.0055 * Math.sin(T * 0.29 + 0.7) + 0.0032 * Math.sin(T * 0.53 + 2.1));
  const dry = dq * (0.0040 * Math.sin(T * 0.23 + 1.9) + 0.0022 * Math.sin(T * 0.47 + 0.3));
  camera.position.set(c.p[0] + drx + sh.x * 0.9, c.p[1] + dry + sh.y * 0.9, c.p[2]);
  camera.fov = c.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(c.q[0] + sh.x * 0.4, c.q[1] + sh.y * 0.4, c.q[2]);
  camera.rotateZ(c.roll + 0.006 * Math.sin(T * 0.19 + 0.4) * (1 - TR.calm(T)) + sh.r * 0.015);
  camera.updateMatrixWorld();
  CAMP.x = camera.position.x; CAMP.y = camera.position.y; CAMP.z = camera.position.z;
  const shk = `translate(${(sh.x * 7).toFixed(2)}px, ${(sh.y * 7).toFixed(2)}px)`;
  scenesEl.style.transform = shk;
  if (hudEl) hudEl.style.transform = shk;

  const d0 = Math.hypot(CAMP.x - c.q[0], CAMP.y - c.q[1], CAMP.z - c.q[2]);
  let focus = d0;
  for (const F of FOCUS) if (T >= F.t0 && T < F.t1) focus = F.fn(T);
  FRAME.focus = focus;
  const px = pxPerUnit();
  P.u.uFocus.value = focus; P.u.uAperture.value = TR.ap(T); P.u.uPx.value = px;
  G.u.uFocus.value = focus; G.u.uAperture.value = TR.glyphAp(T); G.u.uPx.value = px;
  bloom.strength = TR.bloom(T);
  bloom.spread = TR.spread(T) || 0.55;
  fx.uniforms.uZoom.value = TR.zoom(T);
  fx.uniforms.uCA.value = TR.ca(T);
  fx.uniforms.uExposure.value = TR.expo(T);
  let fl = 0;
  for (const [t, a, d] of FLASH) if (T >= t && T < t + d * 8) fl += a * Math.exp(-(T - t) / d);
  stageFlash.style.opacity = Math.min(1, fl).toFixed(3);
  stageFade.style.opacity = TR.fade(T).toFixed(3);
  for (const h of HOOKS) h(T);
  if (window.__ov) window.__ov(T);

  const cold = TR.cold(T);
  const gr = lerp(1, 0.62, cold), gg = lerp(1, 0.78, cold), gb = lerp(1, 1.15, cold), desat = cold * 0.6;
  const grade = (o) => {
    const l = 0.3 * o.r + 0.55 * o.g + 0.15 * o.b;
    o.r = lerp(o.r, l, desat) * gr; o.g = lerp(o.g, l, desat) * gg; o.b = lerp(o.b, l, desat) * gb;
  };

  for (const S of SEGS) if (S.pre) S.pre(T);
  L.begin();
  for (const Ln of LINES) if (T >= Ln.t0 && T < Ln.t1) Ln.fn(T, L);

  // 主粒子 + 运动拖尾
  const pos = P.pos, col = P.col, siz = P.size, alp = P.alpha;
  const dt = TR.streak(T), skK = TR.streakI(T);
  for (let i = 0; i < NM; i++) {
    evalSeg(SEGS, i, T, O);
    if (cold > 0) grade(O);
    const a = O.a > 0 ? O.a : 0;
    pos[3 * i] = O.x; pos[3 * i + 1] = O.y; pos[3 * i + 2] = O.z;
    col[3 * i] = O.r; col[3 * i + 1] = O.g; col[3 * i + 2] = O.b;
    siz[i] = O.s; alp[i] = a;
    if (dt > 0 && a > 0.02 && (i & 1) === 0) {
      evalSeg(SEGS, i, T - dt, Q);
      const dx = O.x - Q.x, dy = O.y - Q.y, dz = O.z - Q.z, l2 = dx * dx + dy * dy + dz * dz;
      if (Q.a > 0.01 && l2 > 0.01 && l2 < 3600) {
        const k = a * skK;
        L.streak(O.x, O.y, O.z, Q.x, Q.y, Q.z, O.r * k, O.g * k, O.b * k);
      }
    }
  }

  // 额外的大粒子层（只在登记的时间段里）
  if (PX) {
    let xa = null;
    for (const X of XP) if (T >= X.t0 && T < X.t1) xa = X;
    PX.u.uFocus.value = focus; PX.u.uAperture.value = TR.ap(T); PX.u.uPx.value = px;
    if (xa) {
      const xp = PX.pos, xc = PX.col, xs = PX.size, xl = PX.alpha;
      for (let i = 0; i < xa.n; i++) {
        xa.fn(i, T, O);
        if (cold > 0) grade(O);
        xp[3 * i] = O.x; xp[3 * i + 1] = O.y; xp[3 * i + 2] = O.z;
        xc[3 * i] = O.r; xc[3 * i + 1] = O.g; xc[3 * i + 2] = O.b;
        xs[i] = O.s; xl[i] = O.a > 0 ? O.a : 0;
      }
      PX.geo.setDrawRange(0, xa.n);
      PX.commit();
    } else PX.geo.setDrawRange(0, 0);
  }

  // 字符粒子
  const gp = G.pos, gc = G.col, gs = G.size, ga = G.alpha, gg2 = G.glyph;
  for (let j = 0; j < NG; j++) {
    O.gl = 0;
    evalSeg(GSEGS, j, T, O);
    if (cold > 0) grade(O);
    gp[3 * j] = O.x; gp[3 * j + 1] = O.y; gp[3 * j + 2] = O.z;
    gc[3 * j] = O.r; gc[3 * j + 1] = O.g; gc[3 * j + 2] = O.b;
    gs[j] = O.s; ga[j] = O.a > 0 ? O.a : 0; gg2[j] = O.gl;
  }

  // 冲击环
  let ev = null;
  for (const r of RINGS) if (T >= r.t && T < r.t + r.life) ev = r;
  for (let j = 0; j < NR; j++) {
    const i = NM + j;
    if (!ev || j >= ev.n) { alp[i] = 0; continue; }
    const t = T - ev.t;
    const Rr = (ev.R0 + (ev.R1 - ev.R0) * (1 - Math.exp(-t / ev.k))) * RJ[j];
    const th = (j / ev.n) * TAU2 + RT[j] * 40;
    const c0 = ev.c || [0, 0, 0];
    if (ev.plane === 'xz') { pos[3 * i] = c0[0] + Math.cos(th) * Rr; pos[3 * i + 1] = c0[1] + RZ[j] * 0.3; pos[3 * i + 2] = c0[2] + Math.sin(th) * Rr * ev.flat; }
    else { pos[3 * i] = c0[0] + Math.cos(th) * Rr; pos[3 * i + 1] = c0[1] + Math.sin(th) * Rr * ev.flat; pos[3 * i + 2] = c0[2] + RZ[j]; }
    col[3 * i] = ev.col[0]; col[3 * i + 1] = ev.col[1]; col[3 * i + 2] = ev.col[2];
    siz[i] = ev.s;
    alp[i] = ev.a * Math.pow(1 - t / ev.life, 1.5) * Math.min(1, t / 0.015) * (RJ[j] < 0.9 ? 0.5 : 1);
  }

  // 尘埃
  const td = dustClock.fn(T);
  const da = TR.dust(T);
  for (let j = 0; j < ND; j++) {
    const i = NM + NR + j;
    pos[3 * i] = DX[j] + DV[3 * j] * td * 2 + Math.sin(td * 0.3 + j) * 2;
    pos[3 * i + 1] = DY[j] + DV[3 * j + 1] * td * 2 + Math.cos(td * 0.23 + j * 1.7) * 2;
    pos[3 * i + 2] = DZ[j] + DV[3 * j + 2] * td * 2;
    O.r = 0.9; O.g = 0.8; O.b = 0.7;
    if (cold > 0) grade(O);
    col[3 * i] = O.r; col[3 * i + 1] = O.g; col[3 * i + 2] = O.b;
    siz[i] = DS[j]; alp[i] = DA[j] * da;
  }

  // 心跳光点
  {
    const i = NM + NR + ND;
    alp[i] = 0; siz[i] = 0.5;
    for (const C of CORE) {
      if (T < C.t0 || T >= C.t1) continue;
      pos[3 * i] = C.pos[0]; pos[3 * i + 1] = C.pos[1]; pos[3 * i + 2] = C.pos[2];
      const cc = C.col(T);
      col[3 * i] = cc[0]; col[3 * i + 1] = cc[1]; col[3 * i + 2] = cc[2];
      alp[i] = C.a(T); siz[i] = C.s(T);
    }
  }
  P.commit();
  G.commit();
  L.commit();
  protectText();
}

// ---------------------------------------------------------------- 文字保护：字幕、卡片、关键标注下面的画面自动压暗
// 亮粒子和白字叠在一起会看不清；按文字的实际范围（含 GSAP 的位移、缩放）生成柔和的暗区，强度跟随文字的透明度
const stageEl = document.getElementById('stage');
const RANGE = document.createRange();
const PROT = [['#scenes .big', 1.0], ['#scenes .ans', 0.9], ['#scenes .cap-card', 0.9], ['#scenes .rl-card', 0.8], ['#scenes .rl-rank', 0.8], ['#hud .ro', 0.55], ['#hud .bars', 0.7], ['#hud .co', 0.5], ['#hud .tg.cn', 0.6], ['#hud .tg.prot', 0.75]];
let PROT_EL = null;
const opac = (el) => { const v = parseFloat(el.style.opacity); return Number.isFinite(v) ? v : 1; };
function protectText() {
  if (!PROT_EL) PROT_EL = PROT.flatMap(([sel, k]) => [...document.querySelectorAll(sel)].map((el) => [el, k, el.closest('.scene')]));
  const sr = stageEl.getBoundingClientRect(), kx = 1920 / sr.width, ky = 1080 / sr.height;
  const U = fx.uniforms, B = U.uBox.value, K = U.uBoxK.value;
  let n = 0;
  for (const [el, k0, sc] of PROT_EL) {
    if (n >= B.length) break;
    if ((sc && sc.style.visibility === 'hidden') || el.style.display === 'none') continue;
    let a = opac(el) * k0;
    if (el.classList.contains('big')) {                    // 逐字入场的字幕：取几个字里最大的透明度
      const cs = el.children;
      if (cs.length) { let m = 0; for (const i of [0, cs.length >> 1, cs.length - 1]) m = Math.max(m, opac(cs[i])); a *= m; }
    }
    if (a < 0.02) continue;
    RANGE.selectNodeContents(el);
    const r = RANGE.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const x0 = (r.left - sr.left) * kx, y0 = (r.top - sr.top) * ky, w = r.width * kx, hh = r.height * ky;
    B[n].set(x0 + w / 2, y0 + hh / 2, w / 2 + 30, hh / 2 + 16);
    K[n] = Math.min(1, a);
    n++;
  }
  U.uNBox.value = n;
}

export function heartPulse(T) {
  let p = 0;
  for (const [t, s] of HEART) if (T >= t && T < t + 1.2) p += s * Math.exp(-(T - t) / 0.11) * Math.min(1, (T - t) / 0.012);
  return p;
}

// 常用的"隐藏"形态：粒子留在某处但不可见
export const hidden = (cx = 0, cy = 0, cz = 0, r = 30) => (i, T, o) => {
  o.x = cx + gX[i] * r; o.y = cy + gY[i] * r; o.z = cz + gZ[i] * r;
  o.r = 1; o.g = 0.8; o.b = 0.6; o.a = 0; o.s = 0.12;
};
