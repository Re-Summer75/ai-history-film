// 第 2 幕 · 点燃（96 – 176 s）：2012 → 2022
// 穿过一张深度网络（每一层看到的东西越来越抽象）→ ImageNet 错误率骤降 → 深蓝的棋盘长成围棋棋盘、第 37 手、4:1
// → 注意力（每个词看向所有词）→ 猜下一个词、参数规模从 1.17 亿到 1750 亿、规模定律 → RLHF → 蓄力、内爆、静默
import { SEGS, GSEGS, CAMK, LINES, XP, key, FLASH, SHAKE, RINGS, CORE, HEART, HOOKS, FOCUS, distTo, NM, NG, TAU2, rA, rB, rC, rD, gX, gY, gZ, uX, uY, uZ, grA, grB, grC, heartPulse, gid } from '../film.js';
import { scene } from '../../../web/js/engine.js';
import { sampleText, sampleGrid, title, smooth, frac, h, E, clamp, lerp, seg, rng, charCue, typeTimes } from '../kit.js';
import { callout, tag, chapter, wline, bars, readout } from '../hud.js';
import { ball, onSeg, setCol, spline } from '../geo.js';
import { project } from '../world.js';
import { LAYERS, CELLS, NCNN } from './cnn.js';
import { fNet } from './a1_question.js';

export const OZ = -175;                              // 2012 之后的场景都放在 z = -175 附近（网络尽头）

// ---------------------------------------------------------------- 2012：卷积网络的层层特征（层定义在 cnn.js）
let IMG = null;
const waveL = (T) => 6.4 * seg(T, 97.6, 103.0);                 // 数据流：匀速从输入流到输出（到每一层一声）
const OUTC = CELLS.filter((c) => c.k === 6);                     // 输出层的 5 个类别（第一个是猫）
const LZ = (l) => { const k = Math.max(0, Math.min(5, Math.floor(l))); return lerp(LAYERS[k].z, LAYERS[k + 1].z, clamp(l - k)); };
const RF = [[-0.14, 0.12], [-0.1, 0.08], [-0.06, 0.05], [-0.03, 0.02], [-0.01, 0.01], [0, 0], [0, 0]];   // 卷积窗口的中心（占该层边长的比例），逐层往猫脸中间收
function feat(c, T) {                                 // 每层的"特征图"：越深越稀疏、越集中
  const f = frac(Math.sin(c.ix * 12.99 + c.iy * 78.23 + c.ch * 37.7 + c.k * 5.3) * 43758.5);
  const cx = c.ix / Math.max(1, LAYERS[c.k].n - 1) - 0.5, cy = c.iy / Math.max(1, LAYERS[c.k].n - 1) - 0.5;
  const blob = Math.exp(-(cx * cx + cy * cy) * (3 + c.k * 2));
  const th = 0.55 + c.k * 0.05;
  return clamp((f * 0.6 + blob * 0.7 - th) * 2.5);
}
function stack(i, T, o) {
  const ci = i >> 1;
  if (ci >= CELLS.length) {
    const q = i - NCNN;
    if (q < 2000) {                                  // 输出层的 5 个类别画成看得见的光球（格子本身只有 2 个粒子，侧面远看几乎看不见）
      const k = Math.floor(q / 400), C = OUTC[k];
      const win = k === 0 ? smooth(seg(T, 102.4, 103.2)) : 0, glow = Math.exp(-((6 - waveL(T)) ** 2) / 0.25);
      ball(o, i, C.x, C.y, C.z, 0.8 + 0.5 * win);
      setCol(o, 1, 0.5 + 0.4 * (1 - win), 0.2 + 0.3 * (1 - win), (0.06 + 0.35 * win + 0.15 * glow) * smooth(seg(T, 97.8, 98.6)), 0.12);
      return;
    }
    ball(o, i, 0, 0, -60, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); return;
  }
  const c = CELLS[ci];
  const Ly = LAYERS[c.k];
  const jit = (Ly.w / Math.max(1, Ly.n - 1)) * 0.18;
  o.x = c.x + gX[i] * jit; o.y = c.y + gY[i] * jit; o.z = c.z;
  const glow = Math.exp(-((c.k - waveL(T)) ** 2) / 0.25);
  if (c.k === 0) {                                    // 输入：一张猫的图
    const p = (c.iy * 40 + c.ix) * 4;
    const a = IMG[p + 3];
    if (a > 0.1) setCol(o, IMG[p] * 1.3 + 0.1, IMG[p + 1] * 1.2 + 0.08, IMG[p + 2] * 1.1 + 0.06, 0.95, 0.34);
    else setCol(o, 0.5, 0.55, 0.7, 0.07, 0.2);
    o.a *= 1 + glow;
    return;
  }
  if (Ly.row) {                                       // 输出：5 个类别，第一个（猫）最后亮起
    const win = c.ix === 0 ? smooth(seg(T, 102.4, 103.2)) : 0;
    setCol(o, 1, 0.5 + 0.4 * (1 - win), 0.2 + 0.3 * (1 - win), 0.25 + 1.4 * win + glow * 0.5, 0.5);
    return;
  }
  const v = feat(c, T);
  const warm = c.k / 6;
  setCol(o, lerp(0.55, 1, warm), lerp(0.7, 0.62, warm), lerp(1, 0.35, warm), (0.1 + 0.8 * v) * (0.6 + 1.4 * glow), 0.2 + 0.05 * c.k);
}

// 96.0 重击：第 1 幕末尾转进纵深的那张深层网络（a1_question.js 的 fNet），每一圈节点原地展开成这一层的特征图——
// 节点的粒子按方向铺满整张图（输入层铺成猫的图像），近处的层先展开；卷积网络用不到的粒子炸成火花散掉
let N96 = null;
function net96() {                                   // 深层网络在 96.0 那一刻的样子（每个粒子的位置、颜色）
  if (N96) return N96;
  N96 = new Float32Array(NM * 8);
  const t = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, s: 0 };
  for (let i = 0; i < NM; i++) { fNet(i, 96.0, t); N96.set([t.x, t.y, t.z, t.r, t.g, t.b, t.a, t.s], i * 8); }
  return N96;
}
function fStack(i, T, o) {
  stack(i, T, o);
  if (T >= 97.8) return;
  const N = net96(), p = i * 8;
  if (i < NCNN) {
    const t0 = 96.0 + 0.06 * CELLS[i >> 1].k + 0.12 * rA[i], q = E.p3o(seg(T, t0, t0 + 0.8)), fl = Math.sin(Math.PI * q);
    o.x = lerp(N[p], o.x, q); o.y = lerp(N[p + 1], o.y, q); o.z = lerp(N[p + 2], o.z, q);
    o.r = lerp(N[p + 3], o.r, q); o.g = lerp(N[p + 4], o.g, q); o.b = lerp(N[p + 5], o.b, q);
    o.a = lerp(N[p + 6], o.a, q) * (1 + 1.2 * fl); o.s = lerp(N[p + 7], o.s, q);
  } else {
    const d = 1 - Math.exp(-(T - 96.0) / 0.22), sp = 5 + 14 * rB[i];
    o.x = N[p] + uX[i] * sp * d; o.y = N[p + 1] + uY[i] * sp * d; o.z = N[p + 2] + uZ[i] * sp * d;
    o.r = N[p + 3]; o.g = N[p + 4] * 0.85; o.b = N[p + 5] * 0.6; o.s = N[p + 7];
    o.a = N[p + 6] * (1 + 2 * Math.exp(-(T - 96.0) / 0.1)) * (1 - smooth(seg(T, 96.0, 96.5 + 0.4 * rC[i])));
  }
}

// ---------------------------------------------------------------- ImageNet 错误率（前 5）
const BARS = [[2010, 28.2], [2011, 25.8], [2012, 15.3], [2013, 11.7], [2014, 6.7], [2015, 3.57]];
const BX = (k) => -25 + k * 10;
function fBars(i, T, o) {
  if (i >= 18000) { ball(o, i, 0, 10, OZ, 40); setCol(o, 1, 0.8, 0.6, 0, 0.12); return; }
  const k = Math.floor(i / 3000), q = (i % 3000) / 3000;
  const hgt = BARS[k][1] * 1.0 * E.p3o(seg(T, 104.6 + 0.22 * k, 105.9 + 0.22 * k));
  // 盒子的四个侧面 + 顶面（边缘更密，像线框）
  const face = Math.floor(rA[i] * 5), u = rB[i] - 0.5, v = rC[i];
  let x, y, z;
  const edge = (w) => Math.sign(w) * Math.pow(Math.abs(w) * 2, 0.35) / 2;
  if (face < 4) {
    const s = face < 2 ? 1 : -1;
    y = v * hgt;
    if (face % 2 === 0) { x = s * 2.5; z = edge(u) * 5; } else { z = s * 2.5; x = edge(u) * 5; }
  } else { x = edge(u) * 5; z = edge(rD[i] - 0.5) * 5; y = hgt; }
  o.x = BX(k) + x; o.y = y; o.z = OZ + z;
  const alex = k === 2;
  setCol(o, 1, alex ? 0.45 : 0.86, alex ? 0.14 : 0.72, hgt > 0.05 ? (alex ? 1.1 : 0.75) : 0, 0.12);
  void q;
}

// ---------------------------------------------------------------- 1997 国际象棋 → 2016 围棋
const GS = 2.3, GN = 19, GOFF = -((GN - 1) * GS) / 2;
// 棋盘上是真实棋谱：AlphaGo 对李世石第二局（2016-03-10，首尔；黑 AlphaGo，211 手中盘胜）。
// 两份独立来源逐手一致：DeepMind 官方解说 SGF（alphago-games.com）与 CWI 棋谱库（homepages.cwi.nl/~aeb）；
// OGS 直播复盘前 37 手也一致。坐标是 SGF 写法（第一个字母 = 列，从左数；第二个 = 行，从上数），画面方向与常规棋谱图相同。
// 第 37 手 = 黑 P10（SGF oj）：右边五路的"肩冲"，压在白 36 手（pi）的斜上方。
const GAME2 = 'pddpcdqpopoqnqpqcnfqmpqnicdjpoqocpcqbqcobpbodobndqepdrcmjpcgedqfqepfndpiojoinjmhgpgqdndmfohphoeoenfnemelfmgnflgoekdkdlclehdipjqirfrgkdhnomre'
  + 'rdsffigkhminhlkokpgcdfidjcgedgcfchbhdhbihdhegdfdhcfeecghfcgiiihkikilimijjljjifkmklljlklolikjcicjmjnrmrlqlpmqnplrlmkhhgqcqdrcpcsdggcebdqbhijg'
  + 'hjobpbpanbdeeegjhhejnfmfmerkfhelnhnglglhmgogkgnijhnakimijincmbodmcockrmsioipjojnirhrqlrlqmrmaobmlnknmobeaeafadmalaoaddbglbpnonercrfpiqhqqjrjks';
const MOVES = [];
for (let k = 0; k < GAME2.length; k += 2) MOVES.push([GAME2.charCodeAt(k) - 97, GAME2.charCodeAt(k + 1) - 97]);
const NMOV = MOVES.length;                              // 211
// 提子：按规则逐手计算每颗子在第几手被提走（-1 = 一直在盘上）。全局共 8 颗：52→59、65→72、104→107、59→156、121→176、18→205、41/45→206
const CAPT = new Int16Array(NMOV).fill(-1);
{
  const at = new Int16Array(19 * 19).fill(-1);
  const nb = (p) => { const x = p % 19, y = (p - x) / 19, r = []; if (x > 0) r.push(p - 1); if (x < 18) r.push(p + 1); if (y > 0) r.push(p - 19); if (y < 18) r.push(p + 19); return r; };
  const group = (p) => {
    const col = at[p] % 2, seen = new Set([p]), st = [p]; let lib = 0;
    while (st.length) { const q = st.pop(); for (const r of nb(q)) { if (at[r] < 0) lib++; else if (at[r] % 2 === col && !seen.has(r)) { seen.add(r); st.push(r); } } }
    return [seen, lib];
  };
  MOVES.forEach(([x, y], k) => {
    const p = y * 19 + x;
    at[p] = k;
    for (const r of nb(p)) if (at[r] >= 0 && at[r] % 2 !== k % 2) {
      const [g, lib] = group(r);
      if (!lib) for (const q of g) { CAPT[at[q]] = k; at[q] = -1; }
    }
  });
}
export const GO_CHECK = { MOVES, CAPT };                // 供核对（probe.py）
// 前 36 手一手一手落；第 37 手单独停一下；之后整盘棋一口气下完（在"4 : 1"之前落完第 211 手）
const moveT = (k) => (k < 36 ? 114.5 + k * 0.145 : k === 36 ? 120.5 : 121.3 + (k - 37) * 0.0149);
const gxz = (ix, iy) => [GOFF + ix * GS, OZ + GOFF + iy * GS];
function fChess(i, T, o) {                            // 8×8 棋盘：亮格填满粒子
  if (i < 12800) {
    const sq = Math.floor(i / 400), r = Math.floor(sq / 4), cc = (sq % 4) * 2 + (r % 2);
    const x = -12 + cc * 3 + rA[i] * 3, z = OZ - 12 + r * 3 + rB[i] * 3;
    o.x = x; o.y = 0; o.z = z;
    setCol(o, 1, 0.84, 0.68, 0.32, 0.12);
  } else { ball(o, i, 0, 0, OZ, 30); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}
const PIECES = [                                    // [列, 行(0 = 远端), 字]
  [0, 0, '♜'], [4, 0, '♚'], [7, 0, '♜'], [3, 1, '♛'], [0, 1, '♟'], [1, 1, '♟'], [2, 1, '♟'], [5, 1, '♟'], [6, 1, '♟'], [7, 2, '♟'], [5, 2, '♞'], [2, 2, '♝'],
  [3, 3, '♟'], [4, 4, '♙'], [0, 7, '♖'], [4, 7, '♔'], [7, 7, '♖'], [3, 6, '♕'], [0, 6, '♙'], [1, 6, '♙'], [2, 5, '♙'], [5, 6, '♙'], [6, 6, '♙'], [7, 6, '♙'],
  [2, 5, '♘'], [5, 4, '♗'],
].filter((q, k, A) => A.findIndex((r) => r[0] === q[0] && r[1] === q[1]) === k);
let PGID = null;
function gChess(j, T, o) {
  o.gl = 0; o.a = 0; o.x = 0; o.y = 0; o.z = OZ; o.s = 2.6; o.r = o.g = o.b = 1;
  if (j >= PIECES.length) return;
  const [cc, r, ch] = PIECES[j];
  const t0 = 112.1 + 0.03 * j;
  const d = 1 - E.p3o(seg(T, t0, t0 + 0.45));
  o.x = -12 + cc * 3 + 1.5; o.z = OZ - 12 + r * 3 + 1.5; o.y = 1.35 + 6 * d;
  o.gl = PGID[j];
  const white = '♔♕♖♗♘♙'.includes(ch);
  o.r = white ? 1.05 : 0.6; o.g = white ? 0.94 : 0.7; o.b = white ? 0.82 : 1.05;
  o.a = (T >= t0 ? 1 - d : 0) * (1 - smooth(seg(T, 113.7, 114.2)));
}
const PER = 110;                                      // 每颗子的光点数
function fGo(i, T, o) {
  if (i < NMOV * PER) {
    const k = Math.floor(i / PER), q = i % PER;
    const [ix, iy] = MOVES[k];
    const [x, z] = gxz(ix, iy);
    const t0 = moveT(k);
    const black = k % 2 === 0;
    const rr = 0.98 * Math.sqrt(q / PER), th = q * 2.39996;
    const drop = k === 36 ? 6 * (1 - E.p3o(seg(T, 120.0, 120.5))) : 3 * (1 - E.p3o(seg(T, t0 - 0.12, t0)));
    o.x = x + Math.cos(th) * rr; o.y = 0.15 + drop + gY[i] * 0.05; o.z = z + Math.sin(th) * rr;
    const rim = rr > 0.8 ? 1 : 0;
    const on = k === 36 ? smooth(seg(T, 120.0, 120.25)) : T >= t0 - 0.12 ? 1 : 0;
    const flash = T > t0 ? Math.exp(-(T - t0) / (k === 36 ? 0.5 : 0.12)) : 0;
    if (black) setCol(o, 0.3 + 0.5 * rim + flash, 0.4 + 0.4 * rim + flash * 0.6, 0.72 + 0.3 * rim + flash * 0.2, on * (0.35 + 0.45 * rim), 0.11);
    else setCol(o, 1 + flash, 0.88 + flash, 0.74 + flash, on * 0.8, 0.11);
    if (k === 36) { o.r += 0.3; o.g *= 0.8; o.b *= 0.6; o.a *= 1.3; }
    if (CAPT[k] >= 0) {                                 // 被提走：轻轻升起、淡出
      const tc = moveT(CAPT[k]), u = smooth(seg(T, tc, tc + 0.15));
      o.a *= 1 - u; o.y += 0.8 * u;
    }
  } else if (i < NMOV * PER + 900) {                  // 星位
    const q = i - NMOV * PER, s = Math.floor(q / 100), ix = [3, 9, 15][s % 3], iy = [3, 9, 15][Math.floor(s / 3)];
    const [x, z] = gxz(ix, iy);
    o.x = x + gX[i] * 0.12; o.y = 0; o.z = z + gZ[i] * 0.12;
    setCol(o, 1, 0.85, 0.7, 0.6, 0.1);
  } else { ball(o, i, 0, 0, OZ, 40); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}
function goLines(T, L) {
  const k = 0.16 * smooth(seg(T, 113.6, 114.8)) * (1 - smooth(seg(T, 127.6, 128.6)));
  if (k <= 0) return;
  for (let a = 0; a < GN; a++) {
    const p = GOFF + a * GS;
    L.seg(p, 0, OZ + GOFF, k, k * 0.85, k * 0.7, p, 0, OZ - GOFF, k, k * 0.85, k * 0.7);
    L.seg(GOFF, 0, OZ + p, k, k * 0.85, k * 0.7, -GOFF, 0, OZ + p, k, k * 0.85, k * 0.7);
  }
}
function chessLines(T, L) {
  const k = 0.25 * smooth(seg(T, 111.6, 112.4)) * (1 - smooth(seg(T, 113.8, 114.6)));
  if (k <= 0) return;
  for (let a = 0; a <= 8; a++) {
    L.seg(-12 + a * 3, 0, OZ - 12, k, k, k, -12 + a * 3, 0, OZ + 12, k, k, k);
    L.seg(-12, 0, OZ - 12 + a * 3, k, k, k, 12, 0, OZ - 12 + a * 3, k, k, k);
  }
}

// ---------------------------------------------------------------- 2017 注意力
const WORDS = ['小猫', '没有', '跳上', '桌子', '，', '因为', '它', '太', '累', '了'];
const TOK = WORDS.map((w, k) => { const x = -36 + k * 8; return [x, -2 + 5 * (1 - (x / 38) ** 2), OZ]; });
const AT1 = [0.62, 0.03, 0.05, 0.12, 0.01, 0.04, 0.05, 0.03, 0.04, 0.01], AT2 = [0.1, 0.03, 0.06, 0.64, 0.01, 0.05, 0.05, 0.03, 0.02, 0.01];
const att = (k, T) => lerp(AT1[k], AT2[k], smooth(seg(T, 136.7, 137.6)));
const ALLP = []; for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) ALLP.push([a, b]);
function arcPt(a, b, t) {                             // 两个词之间的弧（向上拱起，距离越远拱得越高）
  const A = TOK[a], B = TOK[b], d = Math.abs(B[0] - A[0]);
  const hgt = 3 + d * 0.32;
  return [lerp(A[0], B[0], t), lerp(A[1], B[1], t) + Math.sin(Math.PI * t) * hgt, OZ + Math.sin(Math.PI * t) * 2];
}
const allK = (T) => smooth(seg(T, 140.0, 140.8));
// 显示"它 = 小猫 / 桌子"的时候，其他的弧压暗一半：只突出被看着的那一条
const focusDim = (T) => 1 - 0.55 * (smooth(seg(T, 133.6, 134.2)) * (1 - smooth(seg(T, 136.3, 136.7))) + smooth(seg(T, 137.6, 138.0)) * (1 - smooth(seg(T, 139.8, 140.2))));
function fAttn(i, T, o) {
  if (i < 8000) {                                     // 10 个词的光点
    const k = Math.floor(i / 800);
    ball(o, i, ...TOK[k], 0.9);
    const land = k === 3 && T > 137.6 ? 2.2 * Math.exp(-(T - 137.6) / 0.3) : 0, swap = k === 8 && T > 136.5 ? 2.5 * Math.exp(-(T - 136.5) / 0.3) : 0;
    const w = (k === 6 ? 1.6 : 0.8 + 1.2 * att(k, T) * (1 - allK(T)) + 0.4 * allK(T)) + land + swap;
    const warm = k === 6 || k === 8 && T > 136.5 ? 1 : 0;   // "它"和换上的"高"是橙色
    setCol(o, 1, warm ? 0.55 : 0.84, warm ? 0.2 : 0.7, 0.9 * w, 0.12);
  } else if (i < 8000 + 9 * 700) {                    // "它"看向每个词：沿弧流回"它"的光
    const q = i - 8000, k0 = Math.floor(q / 700), k = k0 >= 6 ? k0 + 1 : k0;
    const t = frac(rA[i] + (T - 132) * 0.55);
    const p = arcPt(Math.min(k, 6), Math.max(k, 6), k < 6 ? t : 1 - t);
    o.x = p[0] + gX[i] * 0.08; o.y = p[1] + gY[i] * 0.08; o.z = p[2];
    const w = att(k, T), hotP = k === 0 && T < 136.7 || k === 3 && T > 137.6;
    setCol(o, 1, hotP ? 0.5 : 0.8, hotP ? 0.18 : 0.6,
      smooth(seg(T, 132.6, 133.6)) * (1 - allK(T)) * Math.min(1, w * 3.5) * (hotP ? 1 : focusDim(T)), 0.1);
  } else if (i < 8000 + 6300 + 45 * 300) {            // 全部词两两相连（并行）
    const q = i - 14300, e = Math.floor(q / 300), [a, b] = ALLP[e];
    const t = frac(rA[i] + (T - 140) * 0.8 * (rB[i] < 0.5 ? 1 : -1));
    const p = arcPt(a, b, t);
    o.x = p[0]; o.y = p[1]; o.z = p[2];
    setCol(o, 1, 0.78, 0.55, allK(T) * 0.55 * (1 - smooth(seg(T, 143.4, 144.2))), 0.1);
  } else { ball(o, i, 0, 0, OZ, 45); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}
function attnLines(T, L) {
  const on = smooth(seg(T, 132.4, 133.4)) * (1 - allK(T));
  if (on > 0.01) for (let k = 0; k < 10; k++) {
    if (k === 6) continue;
    const w = att(k, T), a = Math.min(k, 6), b = Math.max(k, 6);
    const hot = (k === 0 && T < 136.7) || (k === 3 && T > 137.6);
    let prev = arcPt(a, b, 0);
    for (let s = 1; s <= 24; s++) {
      const p = arcPt(a, b, s / 24);
      const kk = on * (0.05 + 0.9 * w) * (hot ? 1 : focusDim(T));
      L.seg(...prev, kk, kk * (hot ? 0.45 : 0.8), kk * (hot ? 0.15 : 0.6), ...p, kk, kk * (hot ? 0.45 : 0.8), kk * (hot ? 0.15 : 0.6));
      prev = p;
    }
  }
  const sw = seg(T, 136.7, 137.6);
  if (on > 0.01 && sw > 0 && sw < 1) {                  // 换字之后：一条橙色的弧从"小猫"扫到"桌子"
    const xe = lerp(TOK[0][0], TOK[3][0], E.p3(sw)), ye = lerp(TOK[0][1], TOK[3][1], E.p3(sw)), A = TOK[6];
    const d = Math.abs(A[0] - xe), hgt = 3 + d * 0.32, kk = on * 1.4;
    for (const off of [0, 0.12, -0.12]) {
      let prev = [xe, ye + off, OZ];
      for (let s = 1; s <= 28; s++) {
        const t = s / 28, p = [lerp(xe, A[0], t), lerp(ye, A[1], t) + Math.sin(Math.PI * t) * hgt + off, OZ + Math.sin(Math.PI * t) * 2];
        L.seg(...prev, kk, kk * 0.45, kk * 0.15, ...p, kk, kk * 0.45, kk * 0.15);
        prev = p;
      }
    }
  }
  const all = allK(T) * (1 - smooth(seg(T, 143.4, 144.2)));
  if (all > 0.01) for (const [a, b] of ALLP) {
    let prev = arcPt(a, b, 0);
    for (let s = 1; s <= 16; s++) {
      const p = arcPt(a, b, s / 16);
      const kk = all * 0.16;
      L.seg(...prev, kk, kk * 0.8, kk * 0.6, ...p, kk, kk * 0.8, kk * 0.6);
      prev = p;
    }
  }
}

// ---------------------------------------------------------------- 规模：猜下一个词 → 参数立方体 → 规模定律
const CUBE = [];
for (let a = 0; a < 26; a++) for (let b = 0; b < 26; b++) for (let c = 0; c < 26; c++) CUBE.push([(a - 12.5) * 1.25, (b - 12.5) * 1.25, (c - 12.5) * 1.25]);
CUBE.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
const NC3 = 17576;
// 2.8 万亿 ≈ 16 个 GPT-3。"每个点 = 1000 万个参数"不打折扣：16 个立方体都和 GPT-3 一样满密度（共约 28 万个点，
// 另外 15 个用额外的大粒子层 XP 画），搭成一个立体的 4 × 2 × 2 方块（不是一面平墙）。GPT-3 原地不动，就是方块正面的左上角（橙色），
// 其余的往右、往下、往后排开；重击时一道光从 GPT-3 出发扫过整个方块，扫到哪里、哪里的点亮起来
const GAP3 = 46;                                     // 立方体边长 31.25，中间留约 15 的缝，远看也分得清 16 块
const SLOT3 = [];
for (let zz = 0; zz < 2; zz++) for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 4; xx++) SLOT3.push([xx * GAP3, -yy * GAP3, -zz * GAP3]);
const G3 = SLOT3[0];                                 // GPT-3：[0, 0, 0]（原地）
const K3C = [1.5 * GAP3, -0.5 * GAP3, -0.5 * GAP3];   // 整个方块的中心（相对 GPT-3）
const WAVE3 = (d) => 156.0 + d / 200;                // 光从 GPT-3 中心出发，200 单位/秒（最远的角约 0.9 s 后亮起）
// 参照物：GPT-1（1.17 亿参数 = 12 个点，和前面 GPT-1 出场时一样大、一样密），放在方块左边；方块长完之后出现
const G1P = [-44, -0.5 * GAP3, 12], G1T = 157.25;   // 紧挨在方块左边（离远了会把视线拉走）   // 离方块远一点、往前一点：悬在方块左边的空处，一眼看出是"旁边"的一个小点
export const SCALE = [                               // [时刻, 参数量, 名字, 年份]
  [150.0, 1.17e8, 'GPT-1', '2018'], [152.0, 1.5e9, 'GPT-2', '2019'], [154.0, 1.75e11, 'GPT-3', '2020'], [156.0, 2.8e12, 'Kimi K3 · 开放权重', '2026.07'],
];
const appearT = (m) => (m < 12 ? 150.0 + m * 0.05 : m < 150 ? 152.0 + (m - 12) * 0.006 : 154.0 + Math.pow((m - 150) / 17426, 0.7) * 1.3);
function fCube(i, T, o) {
  if (i < NC3) {
    const p = CUBE[i];
    const t0 = appearT(i);
    const on = T >= t0;
    const pop = on ? 1 + 1.5 * Math.exp(-(T - t0) / 0.12) : 0;
    const jk = T >= 156.0 ? 0.56 * smooth(seg(T, 156.0, 156.25)) : 0;          // Kimi K3 重击时（闪白里）错开一点，和另外 15 个一样，不出摩尔纹
    o.x = p[0] * (on ? 1 : 0.2) + jk * (rA[i] - 0.5); o.y = p[1] * (on ? 1 : 0.2) + jk * (rB[i] - 0.5); o.z = OZ + p[2] * (on ? 1 : 0.2) + jk * (rC[i] - 0.5);
    // 上一代模型在新模型里只是中心的一小撮：用橙色标出来
    const prev = (T >= 152.0 && T < 154.6 && i < 12) || (T >= 154.0 && T < 156.2 && i < 150) || (T >= 156.0 && T < 158.4);
    const big = i < 12 ? 1.5 : i < 150 ? 1.2 : 1;
    const far = T >= 156.0 ? lerp(1, 0.7, smooth(seg(T, 156.0, 156.8))) : 1;        // 拉远后亮度收一些（它的粒子多），但仍比另外 15 个醒目
    if (prev) setCol(o, 1.2, 0.55, 0.2, on ? 1.1 * pop * far : 0, 0.17 * big);
    else setCol(o, 1, 0.8, 0.58, on ? 0.85 * pop : 0, 0.16 * big);
    return;
  }
  ball(o, i, 0, 0, OZ, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12);   // 另外 15 个立方体在额外的大粒子层里（fK3）
}
// 另外 15 个 GPT-3 大小的立方体（额外的大粒子层：这里 i 会超出 NM，不能用 rA 这些随机数组，用哈希）
const XH = (i, s2) => frac(Math.sin(i * 12.9898 + s2 * 78.233) * 43758.5453);
function fK3(i, T, o) {
  if (i >= 15 * NC3) {                                // GPT-1：12 个点（点画大、画亮一点，远看才分得出是 12 个）
    const p = CUBE[i - 15 * NC3], on = T >= G1T, pop = on ? 1 + 3 * Math.exp(-(T - G1T) / 0.12) : 0;
    o.x = G1P[0] + p[0]; o.y = G1P[1] + p[1]; o.z = OZ + G1P[2] + p[2];
    setCol(o, 1.25, 0.6, 0.24, on ? 2.2 * pop * (1 - smooth(seg(T, 158.1, 158.45))) : 0, 0.3);
    return;
  }
  const n = 1 + Math.floor(i / NC3), m = i % NC3, sl = SLOT3[n], p = CUBE[m];
  const j = 0.45 * 1.25;                              // 每个点在自己的格子里随机错开一点：规则点阵远看会出摩尔纹
  const x = sl[0] + p[0] + j * (XH(i, 1) - 0.5), y = sl[1] + p[1] + j * (XH(i, 2) - 0.5), z = sl[2] + p[2] + j * (XH(i, 3) - 0.5);
  const t0 = WAVE3(Math.hypot(x, y, z)) + 0.04 * XH(i, 4);
  o.x = x; o.y = y; o.z = OZ + z;
  if (T < t0) { setCol(o, 1, 0.74, 0.46, 0, 0.18); return; }
  const pop = 1 + 2.2 * Math.exp(-(T - t0) / 0.1);    // 光扫过的那一刻最亮：一道亮的波前穿过整个方块
  const tw = 0.82 + 0.18 * Math.sin(T * 5.5 + XH(i, 5) * 40);   // 之后每个点各自缓缓闪烁（相位随机，整体亮度不变）：整块像活的
  setCol(o, 1, 0.74, 0.46, 0.85 * pop * tw * (1 - smooth(seg(T, 158.1, 158.45))), 0.18);   // 偏暖一点：稀的地方和深蓝底色混起来不发紫
}
// 16 个立方体的边框：光扫到的时候亮起（GPT-3 的是橙色）
function k3Lines(T, L) {
  const out = 1 - smooth(seg(T, 158.0, 158.45)), h = 15.6 + 0.9;
  SLOT3.forEach((sl, n) => {
    const t0 = n ? WAVE3(Math.hypot(...sl) - 16) : 156.0, on = smooth(seg(T, t0, t0 + 0.25)) * out;
    if (on < 0.01) return;
    const k = on * (n ? 0.08 : 0.22) * (1 + 5 * Math.exp(-Math.max(0, T - t0) / 0.2)), r = k, g = k * (n ? 0.72 : 0.5), b = k * (n ? 0.45 : 0.2);
    const V = [];
    for (let c = 0; c < 8; c++) V.push([sl[0] + (c & 1 ? h : -h), sl[1] + (c & 2 ? h : -h), OZ + sl[2] + (c & 4 ? h : -h)]);
    for (const [a, b2] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) L.seg(...V[a], r, g, b, ...V[b2], r, g, b);
  });
}
const LAWX = (k) => -30 + k * 9, LAWY = (k) => 14 - k * 4.2;
function fLaw(i, T, o) {
  if (i < 7 * 1200) {
    const k = Math.floor(i / 1200);
    ball(o, i, LAWX(k), LAWY(k), OZ, 1.1);
    setCol(o, 1, 0.8, 0.6, 0.85 * smooth(seg(T, 158.5 + 0.22 * k, 159.0 + 0.22 * k)), 0.12);
  } else { ball(o, i, 0, 0, OZ, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}
// 背景里的"海量文字"：字符粒子慢慢漂过
const OCEAN = 'の的是在了和有人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条';
function gOcean(j, T, o) {
  const ch = OCEAN[j % OCEAN.length];
  o.gl = OCID[j % OCEAN.length];
  o.x = -110 + 220 * grA[j]; o.y = -60 + 120 * grB[j];
  o.z = OZ - 190 + frac(grC[j] + (T - 144) * 0.02) * 190;
  const a = (j % 2 ? 0 : 0.075) * smooth(seg(T, 144.0 + grA[j], 145.4 + grA[j])) * (1 - smooth(seg(T, 149.4, 150.6)));
  o.r = 1; o.g = 0.86; o.b = 0.72; o.a = a; o.s = 2.2;
  void ch;
}
let OCID = null;

// ---------------------------------------------------------------- RLHF：从续写到对话
const ST = [-34, -17, 0, 17, 34], PY = 17;          // 流程条在上方，下面留给具体例子（卡片）
const STT = [161.4, 163.5, 164.0, 164.7, 165.4];
const stT = (k) => STT[k];
function fRlhf(i, T, o) {
  if (i < 5 * 1500) {
    const k = Math.floor(i / 1500);
    ball(o, i, ST[k], PY, OZ, k === 4 ? 1.3 : 0.95);
    const lit = T >= stT(k) ? 1 + 1.4 * Math.exp(-(T - stT(k)) / 0.4) : 0.35;
    setCol(o, 1, k === 4 ? 0.6 : 0.84, k === 4 ? 0.28 : 0.7, 0.8 * lit, 0.12);
  } else if (i < 7500 + 4 * 500) {
    const q = i - 7500, s = Math.floor(q / 500), t = (q % 500) / 500;
    onSeg(o, t, ST[s] + 1.4, PY, OZ, ST[s + 1] - 1.4, PY, OZ, i, 0.06);
    setCol(o, 1, 0.8, 0.6, 0.12 + 0.35 * smooth(seg(T, stT(s), stT(s + 1))), 0.09);
  } else if (i < 9500 + 600) {                        // 走过流程的光点
    let x = ST[0];
    for (let k = 0; k < 4; k++) if (T >= stT(k)) x = lerp(ST[k], ST[k + 1], E.p3(clamp((T - stT(k)) / Math.min(0.6, stT(k + 1) - stT(k)))));
    ball(o, i, x, PY, OZ, 0.6);
    setCol(o, 1, 0.55, 0.2, T > stT(0) && T < stT(4) + 0.3 ? 1.4 : 0, 0.1);
  } else if (i < 10100 + 9000) {                      // 对话框的光框（与第 4 幕"四个时代"的框一样：一圈发光的点）
    rectLine(o, i, CARD, (i - 10100) / 9000);
    const after = T >= 165.3, t0 = after ? 165.3 : 161.3;
    const pulse = 1 + 1.3 * Math.exp(-Math.max(0, T - t0) / 0.35);
    const col = after ? [1, 0.52, 0.2] : [0.62, 0.72, 1];
    setCol(o, col[0], col[1], col[2], 0.55 * pulse * cardOn(T), 0.1);
  } else if (i < 19100 + 3 * 3000) {                  // 排名：三个小光框
    const q = i - 19100, k = Math.floor(q / 3000);
    rectLine(o, i, RANKR[k], (q % 3000) / 3000);
    const best = k === 0 && T >= 163.9;
    const rv = smooth(seg(T, 163.5, 163.8)) * (1 - smooth(seg(T, 165.1, 165.35)));
    setCol(o, 1, best ? 0.52 : 0.84, best ? 0.2 : 0.72, (best ? 0.75 : 0.4) * rv * (best ? 1 + Math.exp(-(T - 163.9) / 0.35) : 1), 0.1);
  } else { ball(o, i, 0, 0, OZ, 60); setCol(o, 1, 0.8, 0.6, 0, 0.12); }
}
// 对话框、排名格的世界坐标范围 [x0, y0（上）, x1, y1（下）]；DOM 文字每帧按投影对齐到框里
const CARD = [-35, 4.8, 35, -10.2];
const RANKR = [[-35, 4.4, -12.4, -3.4], [-11.4, 4.4, 11.4, -3.4], [12.4, 4.4, 35, -3.4]];
const cardOn = (T) => smooth(seg(T, 161.3, 161.6)) * (1 - smooth(seg(T, 163.3, 163.55))) + smooth(seg(T, 165.3, 165.6)) * (1 - smooth(seg(T, 167.8, 168.2)));
function rectLine(o, i, [x0, y0, x1, y1], t) {
  const w = x1 - x0, hh = y0 - y1, P = 2 * (w + hh), d = t * P;
  let x, y;
  if (d < w) { x = x0 + d; y = y0; } else if (d < w + hh) { x = x1; y = y0 - (d - w); }
  else if (d < 2 * w + hh) { x = x1 - (d - w - hh); y = y1; } else { x = x0; y = y1 + (d - 2 * w - hh); }
  o.x = x + gX[i] * 0.04; o.y = y + gY[i] * 0.04; o.z = OZ + gZ[i] * 0.04;
}

// ---------------------------------------------------------------- 蓄力：从"对话助手"长出一个星系，跟着节奏越转越快、边转边收缩，然后内爆
const GR = new Float32Array(NM), GA = new Float32Array(NM), GH = new Float32Array(NM);
for (let i = 0; i < NM; i++) {
  const r = 2 + 50 * Math.pow(rB[i], 0.85);
  GR[i] = r;
  GA[i] = (i % 3) * (TAU2 / 3) + 2.3 * Math.log(1 + r / 5) + (rC[i] - 0.5) * (0.35 + r / 60) + gX[i] * 0.08;
  GH[i] = gY[i] * 1.1 * Math.exp(-r / 22);
}
const GTILT = -1.05, GC = [ST[4], PY, OZ];
// 差速旋转（像黑洞 / 中子星周围的吸积盘）：越靠里转得越快，角速度约 ∝ 半径^-1.1；最里面封顶 2.6 倍
// （再快的话一帧转过的角度太大，运动拖尾会从圆弧变成穿过中间的直线弦）。
// 旋转方向让旋臂越绕越紧（顺时针，第十六轮的做法，用户选定）；粒子从中心喷出时跟着一起转着甩出来，转速按粒子最终所在的半径定
// （第十七轮试过"按当前半径、沿旋臂滑出去"、第十八轮试过原版的逆时针，用户都觉得不如这一版）
const GK = new Float32Array(NM);
for (let i = 0; i < NM; i++) GK[i] = clamp(Math.pow(18 / (GR[i] + 4), 1.1), 0.35, 2.6) * (1 + 0.12 * (rD[i] - 0.5));   // 每颗粒子快慢略有不同（±6%）：绕紧后散成带湍流感的光带
// 配乐（film_score.py 的蓄力段）里那串越来越快的琶音：成片 186.4 起，间隔 0.5 s，每个 ×0.93，最小 0.05——这里用同一个序列
// （这一段本幕的旧时间 = 成片 − 18）。每个音符转过的角度越来越大、音符越来越密 → 越转越快；每个音符后稍快、下一个音符前稍慢（±30%），
// 跟着节拍一涌一涌。不能"推一下停一下"：转速忽快忽停会让运动拖尾忽长忽短，整团一亮一暗地频闪
const ARP = [];
{ let t = 186.4, gap = 0.5; while (t < 193.68) { ARP.push([t - 18, gap]); t += gap; gap = Math.max(0.05, gap * 0.93); } }
const PULSE_T = [171.0, 171.8, 172.5, 173.1, 173.6, 174.0, 174.35, 174.65, 174.9, 175.1, 175.25];   // 越来越快的心跳（配乐和音效也用这组时刻）
let GXT = NaN, GXS = 0, GXG = 0, GXH = 0;
function galaxyClock(T) {                            // 这一帧：跟着音符的总转角、音符闪光、心跳（按时间缓存）
  if (T === GXT) return;
  GXT = T; GXS = 0; GXG = 0; GXH = 0;
  for (const t of PULSE_T) if (T > t) GXH += 1.6 * (1 - Math.exp(-(T - t) / 0.04)) * Math.exp(-(T - t) / 0.16);   // 星系跟着心跳一缩一亮：起得稍缓（约 4 帧），不在一帧里突变
  let th = 0;
  for (let n = 0; n < ARP.length; n++) {
    const [t, gap] = ARP[n], dth = 0.25 + 0.008 * n;
    if (T <= t) break;
    const u = Math.min(1, (T - t) / gap), pul = clamp((gap - 0.08) / 0.2);   // 音符越密，涌动越弱（每秒十几个音符时融成平滑的高速旋转，不闪）
    GXS = th + dth * (u + 0.3 * pul * u * (1 - u));  // 这个音符到下一个音符之间转过 dth：开头快、结尾慢，但不停
    th += dth;
    GXG += pul * Math.exp(-(T - t) / 0.12);
  }
}
function fGalaxy(i, T, o) {
  const Rg = GR[i];
  const st = 168.4 + 4.2 * Math.pow(Rg / 52, 0.8) + 0.4 * rD[i];
  const g = E.out(seg(T, st, st + 1.4));              // 从中心喷出
  if (g <= 0) { ball(o, i, ...GC, 0.4); setCol(o, 0.5, 0.65, 1, 0, 0.12); return; }
  galaxyClock(T);
  const sc = 1 - 0.42 * E.p2(seg(T, 173.4, 175.4));    // 最后 2 s 边转边收缩（像花样滑冰收手臂）
  const qi = T >= 175.4 ? seg(T, 175.4, 175.72) : 0, ei = qi * qi * qi;      // 内爆：螺旋着被吸进中心
  const rad = Rg * g * sc, gk = GK[i];
  const spin = -((0.35 * (T - 168.4) + 1.3 * GXS) * gk + 3 * ei * (0.6 + 0.4 * gk));   // 差速：里圈快、外圈慢，越转越紧
  const a = GA[i] + spin;
  const hb = 1 - 0.035 * GXH;                           // 心跳时整团一缩：只作用在位置上
  const x = rad * hb * Math.cos(a), y = rad * hb * Math.sin(a), hh = GH[i] * g * sc;
  const ct = Math.cos(GTILT), st2 = Math.sin(GTILT);
  o.x = GC[0] + x; o.y = GC[1] + y * ct - hh * st2; o.z = GC[2] + y * st2 + hh * ct;
  const w = smooth(seg(T, 169, 175));
  const warm = clamp(Math.exp(-Rg / 14) * 1.2 + w * 0.7);
  setCol(o, lerp(0.42, 1.0, warm), lerp(0.58, 0.55, warm), lerp(1.0, 0.25, warm),
    0.7 * smooth(clamp(g * 3)) * (1 + 0.12 * Math.min(1, GXG)) * (1 + 0.08 * GXH) * lerp(1, 0.5, E.p2(seg(T, 173.4, 175.4))) * (1.1 - 0.2 * gk / 2.6), 0.13);
    // ↑ 每个音符亮一下、心跳亮一下；收缩时同样多的粒子挤进更小的面积，单颗调暗（否则转成一片过曝的白盘，看不出旋臂）
  if (ei > 0) {
    o.x = lerp(o.x, GC[0], ei); o.y = lerp(o.y, GC[1], ei); o.z = lerp(o.z, GC[2], ei);
    o.a *= 1 - smooth(clamp((qi - 0.8) / 0.2));
  }
}

// ---------------------------------------------------------------- 登记
// 猜下一个词：句子的空格踩着拍子闪，147.5（= 成片 155.5，拍点）"散步"出现，概率条旁的指针同一刻指向它，
// 同一刻一声"叮"（answer_chime：A5 倚音提前 0.07 s，D6 主音落在拍点上）；配乐是第二十八轮那一版（拨弦一直弹下去）
const SANBU_T = 147.5;

export function a2() {
  IMG = sampleGrid('🐱', { n: 40 });
  if (IMG.filter((v, k) => k % 4 === 3 && v > 0.2).length < 50) IMG = sampleGrid('猫', { n: 40, font: '600 220px "Noto Sans SC"' });
  OCID = [...OCEAN].map((c) => gid(c));
  PGID = PIECES.map(([, , ch]) => gid(ch));

  SEGS.push({ t: 96.0, form: fStack });                                   // 原地展开，不再绕行（见 fStack）
  SEGS.push({ t: 104.0, form: fBars, tr: { type: 'swirl', dur: 1.2, spread: 0.6, amp: 8 } });
  SEGS.push({ t: 111.8, form: fChess, tr: { type: 'morph', dur: 1.0, spread: 0.5 } });
  SEGS.push({ t: 114.0, form: fGo, tr: { type: 'morph', dur: 0.8, spread: 0.4 } });
  SEGS.push({ t: 128.0, form: fAttn, tr: { type: 'swirl', dur: 1.6, spread: 0.9, amp: 8 } });
  SEGS.push({ t: 144.0, form: (i, T, o) => { ball(o, i, 0, 0, OZ, 1.5); setCol(o, 1, 0.8, 0.6, 0, 0.12); }, tr: { type: 'morph', dur: 1.2, spread: 0.6 } });
  SEGS.push({ t: 149.6, form: fCube, tr: { type: 'morph', dur: 0.4, spread: 0.2 } });
  XP.push({ t0: 155.95, t1: 158.45, n: 15 * NC3 + 12, fn: fK3 });           // Kimi K3：另外 15 个满密度的 GPT-3（约 26 万个点）+ 参照物 GPT-1（12 个点）
  LINES.push({ t0: 155.95, t1: 158.45, fn: k3Lines });
  SEGS.push({ t: 158.2, form: fLaw, tr: { type: 'swirl', dur: 1.0, spread: 0.5, amp: 6 } });
  SEGS.push({ t: 161.2, form: fRlhf, tr: { type: 'swirl', dur: 1.0, spread: 0.5, amp: 5 } });
  SEGS.push({ t: 168.0, form: fGalaxy, tr: { type: 'morph', dur: 0.6, spread: 0.3 } });
  GSEGS.push({ t: 111.8, form: gChess });
  GSEGS.push({ t: 114.3, form: (j, T, o) => { o.a = 0; o.gl = 0; o.x = 0; o.y = 0; o.z = OZ; o.s = 2; o.r = o.g = o.b = 1; } });
  GSEGS.push({ t: 143.9, form: gOcean });
  GSEGS.push({ t: 150.8, form: (j, T, o) => { o.a = 0; o.gl = 0; o.x = 0; o.y = 0; o.z = OZ; o.s = 2; o.r = o.g = o.b = 1; } });
  LINES.push({ t0: 111.5, t1: 114.8, fn: chessLines }, { t0: 113.5, t1: 128.8, fn: goLines }, { t0: 132.0, t1: 144.4, fn: attnLines });
  LINES.push({ t0: 97.4, t1: 103.8, fn: (T, L) => {        // 卷积：下一层的一个点只看上一层的一小块（数据流经过这两层之间时亮起）
    const w = waveL(T);
    for (let k = 0; k < 6; k++) {
      const a = 0.55 * clamp(1 - Math.abs(w - (k + 0.5)) / 0.8);
      if (a < 0.01) continue;
      const A = LAYERS[k], B = LAYERS[k + 1], hw = A.w * 0.1;
      const cx = RF[k][0] * A.w, cy = RF[k][1] * A.w;
      const tx = B.row ? OUTC[0].x : RF[k + 1][0] * B.w, ty = B.row ? 0 : RF[k + 1][1] * B.w;
      const C = [[cx - hw, cy - hw], [cx + hw, cy - hw], [cx + hw, cy + hw], [cx - hw, cy + hw]];
      C.forEach(([x, y], m) => {
        const [x2, y2] = C[(m + 1) % 4];
        L.seg(x, y, A.z + 0.2, a, a * 0.45, a * 0.15, x2, y2, A.z + 0.2, a, a * 0.45, a * 0.15);                       // 窗口
        L.seg(x, y, A.z, a, a * 0.45, a * 0.15, tx, ty, B.z, a * 0.6, a * 0.27, a * 0.09);                           // 窗口 → 下一层的一个点
      });
    }
  } });
  LINES.push({ t0: 97.0, t1: 104.4, fn: (T, L) => {        // 每一层的线框（像最初版的方盒）：数据流经过时亮一下
    const fin = smooth(seg(T, 97.0, 97.8)) * (1 - smooth(seg(T, 103.8, 104.4))), w = waveL(T);
    LAYERS.forEach((Ly, k) => {
      if (Ly.row) return;
      const a = fin * (0.1 + 0.5 * Math.exp(-((k - w) ** 2) / 0.3)), hh = Ly.w / 2 + 0.8;
      const z0 = Ly.z + 0.3, z1 = Ly.z - (Ly.c - 1) * 1.4 - 0.3, cr = a, cg = a * 0.85, cb = a * 0.7;
      const Q = [[-hh, -hh], [hh, -hh], [hh, hh], [-hh, hh]];
      for (const z of Ly.c > 1 ? [z0, z1] : [z0]) Q.forEach(([x, y], m) => { const [x2, y2] = Q[(m + 1) % 4]; L.seg(x, y, z, cr, cg, cb, x2, y2, z, cr, cg, cb); });
      if (Ly.c > 1) Q.forEach(([x, y]) => L.seg(x, y, z0, cr, cg, cb, x, y, z1, cr, cg, cb));
    });
  } });
  LINES.push({ t0: 104.2, t1: 112.2, fn: (T, L) => {       // 柱状图的地面网格
    const k = 0.07 * smooth(seg(T, 104.2, 105.2)) * (1 - smooth(seg(T, 111.4, 112.2)));
    for (let a = -8; a <= 8; a++) {
      L.seg(-32, 0, OZ + a * 1, k, k, k, 32, 0, OZ + a * 1, k, k, k);
    }
    for (let a = -32; a <= 32; a += 4) L.seg(a, 0, OZ - 8, k, k, k, a, 0, OZ + 8, k, k, k);
  } });

  const pulseT = PULSE_T;
  pulseT.forEach((t, k) => HEART.push([t, 0.7 + 0.03 * k]));
  CORE.push({ t0: 167.8, t1: 176.0, pos: GC,
    a: (T) => smooth(seg(T, 167.8, 168.4)) * (1.2 + 1.2 * heartPulse(T) + (T > 175.4 ? 3 * seg(T, 175.4, 175.72) : 0)) * (T > 175.72 ? 0.8 : 1),
    s: (T) => (T > 175.72 ? 0.3 : 0.8 + 0.5 * heartPulse(T)), col: (T) => [1, lerp(0.85, 0.75, seg(T, 170, 175)), lerp(1, 0.55, seg(T, 170, 175))] });
  RINGS.push({ t: 120.5, n: 3000, R0: 1, R1: 30, k: 0.35, life: 1.4, a: 0.9, col: [1, 0.6, 0.3], s: 0.14, flat: 1, c: [...(() => { const [x, z] = gxz(...MOVES[36]); return [x, 0.2, z]; })()], plane: 'xz' });

  const camA2 = [
    { t: 96.0,   p: [19, 8, 42],      q: [-7, -3, -66], fov: 50, roll: 0.03 },   // 重击：各层原地展开，镜头从斜侧绕回轴线，顺势钻进去
    { t: 97.4,   p: [84, 30, 40],     q: [-4, -2, -70], fov: 50, roll: 0.01 },   // 拉远到侧前方：整条流水线一眼看全（猫 → 一层层特征图 → 输出）
    { t: 101.0,  p: [88, 28, 26],     q: [-3, -2, -74], fov: 50, roll: 0 },       // 构图基本不动，只慢慢漂：数据流从头流到尾都在画面里
    { t: 103.0,  p: [84, 27, 12],     q: [-2, -1, -78], fov: 50, roll: -0.01 },
    { t: 104.0,  p: [66, 24, -40],    q: [0, 4, -130], fov: 50, roll: 0 },
    { t: 105.8,  p: [20, 17, OZ + 52], q: [0, 12, OZ], fov: 50, roll: 0 },
    { t: 111.6,  p: [8, 15, OZ + 60],  q: [0, 11, OZ], fov: 50, roll: 0 },
    { t: 113.8,  p: [0, 34, OZ + 38],  q: [0, 0, OZ], fov: 50, roll: 0 },
    { t: 119.8,  p: [-18, 40, OZ + 34], q: [0, 0, OZ - 2], fov: 50, roll: 0.02 },
    { t: 120.6,  p: [8, 22, OZ + 22],  q: [gxz(...MOVES[36])[0] * 0.6, 0, gxz(...MOVES[36])[1] * 0.6 + OZ * 0.4], fov: 50, roll: 0 },
    { t: 123.8,  p: [14, 30, OZ + 30], q: [0, 0, OZ], fov: 50, roll: -0.02 },
    { t: 127.6,  p: [0, 46, OZ + 44],  q: [0, 6, OZ], fov: 50, roll: 0 },
    { t: 129.6,  p: [0, 4, OZ + 72],   q: [0, 4, OZ], fov: 50, roll: 0 },
    { t: 139.6,  p: [-4, 6, OZ + 66],  q: [0, 4, OZ], fov: 50, roll: 0.01 },
    { t: 143.8,  p: [0, 8, OZ + 80],   q: [0, 4, OZ], fov: 50, roll: 0 },
    { t: 149.95, p: [0, 0, OZ + 70],   q: [0, 0, OZ], fov: 50, roll: 0 },                  // 每一级的重击：镜头冲刺（起点对准重击），随后缓缓漂移
    { t: 150.45, p: [3, 2, OZ + 11],   q: [0, 0, OZ], fov: 50, roll: 0, ease: E.p3o },
    { t: 152.0,  p: [5, 3, OZ + 14],   q: [0, 0, OZ], fov: 50, roll: 0.02 },
    { t: 152.6,  p: [7, 5, OZ + 24],   q: [0, 0, OZ], fov: 50, roll: 0.02, ease: E.p3o },
    { t: 154.0,  p: [9, 6, OZ + 28],   q: [0, 0, OZ], fov: 50, roll: 0.03 },
    { t: 155.1,  p: [34, 30, OZ + 70], q: [0, 0, OZ], fov: 52, roll: 0.05, ease: E.p3o },
    { t: 156.0,  p: [30, 26, OZ + 78], q: [0, 0, OZ], fov: 52, roll: 0.04 },
    { t: 157.1,  p: [K3C[0] + 150, K3C[1] + 128, OZ + K3C[2] + 205], q: [K3C[0] - 2, K3C[1] + 16, OZ + K3C[2]], fov: 48, roll: 0.03, ease: E.p3o },   // Kimi K3：拉开到斜前上方，看全整个方块
    { t: 158.1,  p: [K3C[0] + 112, K3C[1] + 132, OZ + K3C[2] + 228], q: [K3C[0] - 2, K3C[1] + 16, OZ + K3C[2]], fov: 48, roll: 0.02 },   // 慢慢绕到更正面一点：前后层次靠视差看出来
    { t: 159.1,  p: [0, 0, OZ + 70],   q: [0, 0, OZ], fov: 50, roll: 0, ease: E.p3 },
    { t: 161.0,  p: [0, 0, OZ + 66],   q: [0, 0, OZ], fov: 50, roll: 0 },
    { t: 167.6,  p: [3, 1.5, OZ + 66], q: [0, 0, OZ], fov: 50, roll: 0 },
    { t: 168.6,  p: [ST[4], PY + 2, OZ + 40], q: [ST[4], PY, OZ], fov: 50, roll: 0 },
    { t: 175.4,  p: [ST[4], PY + 32, OZ + 96], q: [ST[4], PY, OZ], fov: 52, roll: 0.08, ease: E.p2 },
    { t: 175.72, p: [ST[4], PY + 14, OZ + 66], q: [ST[4], PY, OZ], fov: 50, roll: 0, ease: (x) => x * x * x },
    { t: 176.0,  p: [ST[4], PY + 14, OZ + 66], q: [ST[4], PY, OZ], fov: 50, roll: 0, hold: true },
  ];
  CAMK.push(...camA2);
  const dO = () => distTo(0, 0, OZ);
  FOCUS.push({ t0: 96.0, t1: 104.0, fn: (T) => distTo(0, 0, LZ(waveL(T))) },   // 对焦跟着数据流走
    { t0: 104.0, t1: 113.8, fn: () => distTo(0, 12, OZ) },
    { t0: 113.8, t1: 128.0, fn: dO }, { t0: 128.0, t1: 168.0, fn: dO }, { t0: 168.0, t1: 176.0, fn: () => distTo(...GC) });
  FOCUS.push({ t0: 156.0, t1: 158.45, fn: (T) => lerp(distTo(0, 0, OZ), distTo(K3C[0], K3C[1], OZ + K3C[2]), smooth(seg(T, 156.0, 157.0))) });   // 放在后面才生效（同一时刻后登记的对焦优先）；Kimi K3：对焦从 GPT-3 移到整个方块的中心
  FLASH.push([96.0, 0.14, 0.12], [124.0, 0.12, 0.14], [156.0, 0.12, 0.12]);
  SHAKE.push([96.0, 0.6, 0.3], [124.0, 0.55, 0.3], [154.0, 0.35, 0.25], [156.0, 0.6, 0.35]);
  key('bloom', [96, 2.4], [104, 2.2], [114, 2.2], [120.5, 2.2], [120.55, 3.2], [121.4, 2.2], [128, 2.3], [144, 2.2], [154.0, 2.2], [154.2, 2.8], [155.8, 2.2],
    [156.0, 2.2], [156.2, 2.7], [157.4, 2.2],
    [168, 2.4], [175.4, 2.6], [175.72, 3.0]);
  key('ap', [96, 0.012], [97.6, 0.003], [103.4, 0.003], [104.4, 0.01], [113.8, 0.012], [150, 0.006], [155.6, 0.006], [158.2, 0.006], [159, 0.01], [168, 0.01], [175, 0.006]);
  key('streak', [96, 0.02], [97.6, 0.03], [103, 0.03], [104, 0.02], [112, 0.02], [114, 0.012], [128, 0.02], [144, 0.02], [168, 0.02], [174, 0.026], [175.4, 0.026], [175.72, 0.06]);
  key('zoom', [175.3, 0], [175.7, 0.07], [175.75, 0]);
  key('dust', [96, 0.9], [168, 0.9], [174, 1], [175.72, 0.5]);
  key('expo', [175.72, 1], [175.74, 0.4], [175.99, 0.4]);

  scene({ id: 'a2', start: 96, dur: 80 }, (S) => {
    const cue = S.cue, c = (t, ...a) => cue(t - 96, ...a);
    c(96.0, 'impact', { size: 0.9, metal: 0.2, gain: -6 });
    c(96.25, 'whoosh', { dur: 1.4, size: 0.6, gain: -12 });           // 展开之后镜头往后拉到侧前方
    c(97.6, 'chirp', { dur: 5.4, gain: -17 });                         // 数据流过一层层
    for (let k = 1; k < 7; k++) c(97.6 + (5.4 * k) / 6.4, 'blip', { pitch: 1200 + 180 * k, kind: 'tick', gain: -16 });
    c(102.5, 'blip', { pitch: 1760, kind: 'confirm', gain: -10 });
    c(104.0, 'whoosh', { dur: 1.2, size: 0.5, gain: -10 });
    BARS.forEach((b, k) => c(104.6 + 0.22 * k, 'blip', { pitch: 900 + k * 150, kind: 'tick', gain: -14 }));
    c(111.8, 'whoosh', { dur: 1.0, size: 0.5, gain: -12 });
    for (let k = 0; k < 36; k++) c(moveT(k), 'stone', { gain: -8 - (k % 3) });
    c(120.0, 'reverse', { dur: 0.5, size: 0.6, gain: -8 });
    c(120.5, 'impact', { size: 0.8, metal: 0.4, gain: -6 });
    c(120.5, 'stone', { big: 1, gain: -2 });
    for (let k = 37; k < NMOV; k += 6) c(moveT(k), 'stone', { gain: -17 });
    c(124.0, 'impact', { size: 1.1, metal: 0.2, gain: -4 });
    c(124.0, 'sub', { dur: 2.0, gain: -10 });
    c(128.0, 'whoosh', { dur: 1.6, size: 0.7, gain: -10 });
    c(132.6, 'chirp', { dur: 1.4, gain: -16 });
    c(136.2, 'reverse', { dur: 0.3, size: 0.3, gain: -15 });          // 换一个字
    c(136.5, 'impact', { size: 0.3, metal: 0.25, gain: -12 });
    c(136.7, 'whoosh', { dur: 0.9, size: 0.35, gain: -16 });           // 注意力的弧扫过去
    c(137.6, 'stone', { gain: -8 });                                   // 落在"桌子"上
    c(140.0, 'chirp', { dur: 3.4, gain: -14 });
    // "散步"出现：一声"叮"（第二十八轮是电子味的"嘀—叮" + 配乐两声钟，这轮换成钟琴式金属条，主音正好落在拍点上）
    c(SANBU_T - 0.07, 'chime', { gain: -5 });
    // 规模：每一级一声重击（越来越重），数字滚动时是一串数据声，镜头后拉时一声掠过
    c(150.0, 'impact', { size: 0.35, metal: 0.3, gain: -14 });
    c(152.0, 'impact', { size: 0.55, metal: 0.3, gain: -10 });
    c(154.0, 'impact', { size: 0.9, metal: 0.3, gain: -6 });
    c(154.0, 'whoosh', { dur: 1.4, size: 0.9, gain: -8 });
    c(155.9, 'whoosh', { dur: 1.1, size: 1.0, gain: -8 });
    c(156.0, 'impact', { size: 1.2, metal: 0.3, gain: -4 });
    c(156.0, 'sub', { dur: 2.0, gain: -9 });
    c(157.25, 'blip', { pitch: 2093, kind: 'tick', gain: -17 });            // 参照物 GPT-1 出现：很小的一声
    SCALE.forEach(([t]) => charCue(S, 'stream', Array.from({ length: 14 }, (_, k) => t + 0.04 + (0.62 * k) / 14), { gain: -17 }));
    c(144.0, 'whoosh', { dur: 1.2, size: 0.4, gain: -14 });
    c(158.2, 'whoosh', { dur: 1.0, size: 0.4, gain: -12 });
    c(161.2, 'whoosh', { dur: 1.0, size: 0.35, gain: -14 });
    for (let k = 0; k < 5; k++) c(stT(k), 'blip', { pitch: 1047 * Math.pow(2, k * 2 / 12), kind: 'tick', gain: -13 });
    charCue(S, 'keys', typeTimes(161.4, '怎么做番茄炒蛋？', 16), { gain: -12 });
    charCue(S, 'stream', typeTimes(162.0, '怎么做红烧肉？怎么做鱼香肉丝？怎么做……', 18), { gain: -15 });
    c(162.95, 'blip', { pitch: 880, kind: 'error', gain: -12 });
    [163.9, 164.2, 164.5].forEach((t) => c(t, 'blip', { pitch: 1568, kind: 'tick', gain: -13 }));
    c(164.7, 'whoosh', { dur: 0.6, size: 0.3, gain: -14 });
    charCue(S, 'stream', typeTimes(165.6, '先把鸡蛋炒到半熟盛出，再炒番茄出汁，最后倒回鸡蛋、加盐翻匀。', 20), { gain: -15 });
    c(167.05, 'blip', { pitch: 1320, kind: 'confirm', gain: -11 });
    c(168.0, 'whoosh', { dur: 1.2, size: 0.5, gain: -12 });
    for (const t of pulseT) c(t, 'heart', { strength: 0.8 });
    c(172.0, 'riser', { dur: 3.72, gain: -3 });
    c(174.9, 'reverse', { dur: 0.82, gain: -6 });

    // 2012
    title(S, '2012 · 深度学习爆发', { t0: 96.9, t1: 100.6, size: 72, weight: 300, ls: '0.14em', y: 930 });
    // ImageNet
    title(S, '一年，错误率下降了约 10 个百分点。', { t0: 107.2, t1: 111.6, size: 48, weight: 300, ls: '0.1em', y: 930 });
    // 深蓝 / AlphaGo
    title(S, '1997：深蓝赢了国际象棋世界冠军。', { t0: 112.1, t1: 115.3, size: 46, weight: 300, ls: '0.1em', y: 930 });
    title(S, '围棋：可能的局面比宇宙中的原子还多。', { t0: 115.5, t1: 120.3, size: 46, weight: 300, ls: '0.1em', y: 930 });
    title(S, '机器下出了人类想不到的一手。', { t0: 120.9, t1: 123.9, size: 52, weight: 300, ls: '0.12em', y: 930 });
    title(S, '4 : 1', { t0: 124.0, t1: 127.7, size: 220, weight: 200, cls: 'num glow', ls: '0.05em', stagger: 0.06, inDur: 0.9, y: 470, blur: 20 });
    // 注意力
    title(S, 'Attention Is All You Need', { t0: 128.5, t1: 131.9, size: 76, weight: 300, cls: 'big-title', ls: '0.02em', stagger: 0.03, y: 300 });
    title(S, '注意力：每个词都能直接看向句子里的所有词。', { t0: 132.3, t1: 136.5, size: 46, weight: 300, ls: '0.08em', y: 930 });
    title(S, '换一个词，它关注的对象就跟着变。', { t0: 136.8, t1: 140.3, size: 46, weight: 300, ls: '0.1em', y: 930 });
    title(S, '而且可以并行计算——模型从此可以一直做大。', { t0: 140.5, t1: 144.4, size: 46, weight: 300, ls: '0.08em', y: 930 });
    // 猜下一个词
    title(S, '读遍海量文字，只做一件事：猜下一个词。', { t0: 144.6, t1: 149.3, size: 46, weight: 300, ls: '0.08em', y: 930 });
    const sent = S.add(h('div', { class: 'big' }));
    Object.assign(sent.style, { top: '420px', fontSize: '60px', fontWeight: 300, letterSpacing: '0.08em' });
    S.update((_, T) => {                             // 第二个参数才是全片时间
      if (T < 144.3 || T > 149.5) { sent.style.opacity = 0; return; }
      const blink = Math.floor(T * 2) % 2 === 0;       // 空格踩着拍子闪（每拍 0.5 s：第 1、3 拍亮，第 2、4 拍暗）
      const done = T >= SANBU_T;                      // 成片 155.5：拍点，和"叮"的主音同一刻
      const g = done ? Math.exp(-(T - SANBU_T) / 0.35) : 0;                     // 出现的一瞬间亮一下
      const word = done ? `<span style="color:#ff6a2b;text-shadow:0 0 ${(26 * g).toFixed(1)}px rgba(255,106,43,${(0.9 * g).toFixed(3)})">散步</span>`
        : `<span style="opacity:${blink ? 0.9 : 0.2}">▁▁</span>`;
      // 空格固定两个字宽："散步"出现时整句不左右晃
      sent.innerHTML = `今天天气很好，我们去公园<span style="display:inline-block;width:2.16em;text-align:left;white-space:nowrap">${word}</span>`;
      sent.style.opacity = (smooth(seg(T, 144.3, 144.9)) * (1 - smooth(seg(T, 149.0, 149.5)))).toFixed(3);
    }, 0, 81);
    // 规模
    title(S, '规模越大，模型越强——而且可以预测。', { t0: 158.6, t1: 161.1, size: 48, weight: 300, ls: '0.1em', y: 930 });
    // 巨大的数字：参数量一路滚上去，位数越来越长；下面换算成"每秒数一个，要数多少年"
    const nEl = S.add(h('div', { class: 'big num scale-n' }));
    const mEl = S.add(h('div', { class: 'big scale-m' }));
    const yEl = S.add(h('div', { class: 'big scale-y' }));
    const fmtN = (v) => Math.round(v).toLocaleString('en-US');
    const yrs = (v) => { const y = v / 31557600; return y < 1000 ? String(+y.toFixed(1)) : Math.round(y).toLocaleString('en-US'); };
    const MULT = ['', '× 13', '× 117', '× 16'];
    S.update((_, T) => {
      const vis = smooth(seg(T, 149.9, 150.3)) * (1 - smooth(seg(T, 158.0, 158.5)));
      let k = 0;
      for (let n = 0; n < SCALE.length; n++) if (T >= SCALE[n][0]) k = n;
      const [t0, v1, name, year] = SCALE[k], v0 = k ? SCALE[k - 1][1] : v1;
      const e = E.p3o(clamp((T - t0 - 0.04) / 0.62));
      const v = Math.exp(lerp(Math.log(v0), Math.log(v1), e));               // 在对数上滚动：位数一位一位地长
      nEl.style.opacity = mEl.style.opacity = yEl.style.opacity = vis.toFixed(3);
      nEl.innerHTML = `${fmtN(v)}${k && T < (k < SCALE.length - 1 ? SCALE[k + 1][0] - 0.1 : 158.0) ? `<span class="mult">${MULT[k]}</span>` : ''}`;
      nEl.style.transform = `scale(${(1 + 0.06 * Math.exp(-Math.max(0, T - t0) / 0.18)).toFixed(4)})`;
      mEl.textContent = `${name} · ${year} · 参数`;
      yEl.innerHTML = `如果每秒数一个，要数 <b>${yrs(v)}</b> 年`;
    }, 0, 81);
    // RLHF
    title(S, '关键一步：用人类的反馈，把它调教成助手。', { t0: 163.3, t1: 165.6, size: 46, weight: 300, ls: '0.08em', y: 930 });
    // 同一个问题，之前 / 之后：之前只会接着往下写；人类示范、给回答排名次；之后像个助手
    const Q = '怎么做番茄炒蛋？', A0 = '怎么做红烧肉？怎么做鱼香肉丝？怎么做……', A1 = '先把鸡蛋炒到半熟盛出，再炒番茄出汁，最后倒回鸡蛋、加盐翻匀。';
    const card = S.add(h('div', { class: 'rl-card' }));
    const qEl = h('div', { class: 'rl-q' }), aEl = h('div', { class: 'rl-a' }), stp = h('div', { class: 'rl-stamp' }), who = h('div', { class: 'rl-who' });
    card.append(who, qEl, aEl, stp);
    const rank = S.add(h('div', { class: 'rl-rank' }));
    const RK = [['A', '回答 A', 1], ['B', '回答 B', 3], ['C', '回答 C', 2]];
    const rkEls = RK.map(([n, t]) => { const d = h('div', { class: 'rk' }); d.append(h('span', { class: 'rk-n' }, n), h('span', { class: 'rk-t' }, t), h('span', { class: 'rk-b' })); rank.append(d); return d; });
    const cps = (t0, text, rate, T) => [...text].slice(0, clamp(Math.floor((T - t0) * rate), 0, [...text].length)).join('');
    const fit = (el, [x0, y0, x1, y1]) => {
      const a = project(x0, y0, OZ), b = project(x1, y1, OZ);
      Object.assign(el.style, { left: `${a.x.toFixed(1)}px`, top: `${a.y.toFixed(1)}px`, width: `${(b.x - a.x).toFixed(1)}px`, height: `${(b.y - a.y).toFixed(1)}px` });
    };
    HOOKS.push(() => { if (S.el.style.visibility !== 'hidden') { fit(card, CARD); fit(rank, [RANKR[0][0], RANKR[0][1], RANKR[2][2], RANKR[0][3]]); } });
    S.update((_, T) => {
      const on = cardOn(T);
      card.style.opacity = on.toFixed(3);
      const after = T >= 165.3;
      card.classList.toggle('after', after);
      who.textContent = after ? '2022 · 经过人类反馈训练之后' : '预训练模型 · 只学过“接着往下写”';
      qEl.textContent = '› ' + (after ? Q : cps(161.4, Q, 16, T));
      aEl.textContent = after ? cps(165.6, A1, 20, T) : cps(162.0, A0, 18, T);
      stp.textContent = after ? (T >= 167.05 ? '✓ 像个助手了' : '') : (T >= 162.95 ? '✕ 只会续写' : '');
      const rv = smooth(seg(T, 163.5, 163.8)) * (1 - smooth(seg(T, 165.1, 165.35)));
      rank.style.opacity = rv.toFixed(3);
      rkEls.forEach((d, k) => { const t = 163.9 + 0.3 * [0, 2, 1][k]; const b = d.lastChild; b.textContent = T >= t ? `第 ${RK[k][2]} 名` : ''; d.classList.toggle('best', T >= t && RK[k][2] === 1); });
    }, 0, 81);
  });

  // ---------------- 机能标注 ----------------
  chapter({ t0: 96.6, t1: 102.6, num: '02 / 06', title: '点燃', sub: '2012 — 2022' });
  tag({ t0: 97.6, t1: 103.6, at: [960, 1000], text: 'ALEXNET · GPU × 大数据 × 深层网络', cls: 'dim prot' });
  // 每一层的说明挂在那一层下方：数据流到哪一层，亮哪一层的说明（侧前方看得到整条流水线）
  const LYN = ['输入：一张图片', '第 1 层 · 边缘', '第 2 层 · 纹理', '第 3 层 · 局部', '第 4 层 · 部件', '第 5 层 · 物体'];
  LYN.forEach((txt, k) => {
    const Ly = LAYERS[k], tIn = k === 0 ? 97.0 : 97.6 + (5.4 * k) / 6.4;
    const t1 = k === 0 ? 98.5 : k < 5 ? tIn + 0.8 : 103.2;           // 一次只亮一条（相邻两层在画面上挨得近）
    tag({ t0: tIn, t1, at: [0, Ly.w / 2 + 3.0, Ly.z], text: txt, cls: 'cn prot', scramble: false });   // 挂在上方：不压底部的标题
  });
  tag({ t0: 102.6, t1: 104.2, at: [OUTC[0].x, -3.4, OUTC[0].z], text: '猫', cls: 'acc cn', scramble: false });
  bars({ t0: 102.5, t1: 104.2, x: 1330, y: 640, w: 380, row: 56, label: 'PREDICTION · 它认为这是', items: [['猫', 0.92, '92%', true], ['狐狸', 0.04, '4%'], ['狗', 0.02, '2%'], ['兔', 0.01, '1%']] });
  tag({ t0: 104.8, t1: 111.6, at: [960, 150], text: 'IMAGENET · 图像识别错误率（前 5）', cls: 'dim' });
  BARS.forEach(([yr, v], k) => {
    tag({ t0: 105.0 + 0.22 * k, t1: 111.6, at: [BX(k), -2.2, OZ + 3], text: String(yr), cls: 'dim' });
    tag({ t0: 105.9 + 0.22 * k, t1: 111.6, at: [BX(k), v + 2.4, OZ], text: `${v === 3.57 ? '3.6' : v}%`, cls: k === 2 ? 'acc' : '', scramble: false });
  });
  callout({ t0: 106.8, t1: 111.6, at: [BX(2) + 2.5, 15.3, OZ], dx: 150, dy: -90, idx: '2012', title: 'ALEXNET', accent: true, size: 20 });
  wline({ t0: 106.4, t1: 111.6, pts: () => [[-31, 5.1, OZ], [31, 5.1, OZ]], color: 'rgba(244,239,232,.55)', dash: '6 6' });
  tag({ t0: 106.6, t1: 111.6, at: [32, 5.9, OZ], text: '人类 ≈ 5%', cls: 'dim cn', center: false });                     // 虚线右端，分两行，不出画
  tag({ t0: 106.8, t1: 111.6, at: [32, 4.1, OZ], text: '（一位研究者自测）', cls: 'dim cn sm', center: false });
  tag({ t0: 112.3, t1: 115.2, at: [960, 150], text: '1997 · DEEP BLUE · 国际象棋', cls: 'dim' });
  tag({ t0: 115.4, t1: 127.7, at: [960, 150], text: '2016.03 · ALPHAGO vs 李世石 · 首尔', cls: 'dim' });
  callout({ t0: 120.6, t1: 123.9, at: () => { const [x, z] = gxz(...MOVES[36]); return [x, 0.4, z]; }, dx: 170, dy: -110, idx: '37', title: '第 37 手', sub: '第二局 · 2016.03.10', accent: true });
  tag({ t0: 128.5, t1: 131.9, at: [960, 200], text: '2017 · TRANSFORMER · VASWANI ET AL.', cls: 'dim' });
  WORDS.forEach((w, k) => tag({ t0: 130.2 + 0.08 * k, t1: k === 8 ? 136.5 : 143.9, at: [TOK[k][0], TOK[k][1] - 3.6, OZ], text: w,
    cls: k === 6 ? 'acc cn tok' : 'cn tok', scramble: false, fin: k === 8 ? 0.15 : 0.35 }));
  tag({ t0: 136.5, t1: 143.9, at: [TOK[8][0], TOK[8][1] - 3.6, OZ], text: '高', cls: 'acc cn tok', scramble: false, fin: 0.15 });   // 换一个字
  tag({ t0: 136.55, t1: 138.6, at: [TOK[8][0], TOK[8][1] + 3.2, OZ], text: '累 → 高', cls: 'acc cn sm', scramble: false, fin: 0.15 });
  RINGS.push({ t: 136.5, n: 1400, R0: 0.6, R1: 7, k: 0.2, life: 0.8, a: 1.0, col: [1, 0.55, 0.2], s: 0.12, flat: 1, c: [...TOK[8]] });
  tag({ t0: 132.8, t1: 136.4, at: [TOK[6][0], TOK[6][1] + 4.4, OZ], text: '“它”在看谁？', cls: 'acc cn sm', scramble: false });
  // 答案写在最亮那条弧的弧顶正上方（大号橙字）：它 = 小猫 → 它 = 桌子
  tag({ t0: 133.8, t1: 136.6, at: [(TOK[0][0] + TOK[6][0]) / 2, TOK[0][1] + 3 + 0.32 * Math.abs(TOK[6][0] - TOK[0][0]) + 4.2, OZ], text: '它 = 小猫', cls: 'acc cn big-ans', scramble: false, fin: 0.2 });
  tag({ t0: 137.65, t1: 139.9, at: [(TOK[3][0] + TOK[6][0]) / 2, TOK[3][1] + 3 + 0.32 * Math.abs(TOK[6][0] - TOK[3][0]) + 4.2, OZ], text: '它 = 桌子', cls: 'acc cn big-ans', scramble: false, fin: 0.2 });
  bars({ t0: 145.4, t1: 149.4, x: 760, y: 540, w: 300, label: 'NEXT TOKEN · 示意', items: [['散步', 0.62, '62%', true], ['玩', 0.21, '21%'], ['野餐', 0.11, '11%'], ['跑步', 0.04, '4%']] });
  tag({ t0: SANBU_T, t1: 149.4, at: [732, 597], text: '►', cls: 'acc rpt', scramble: false, fin: 0.04 });   // 选中：和"散步"同一刻指向第一行（行中心 y = 597）
  tag({ t0: 150.2, t1: 155.9, at: [960, 1010], text: '每个点 = 1000 万个参数', cls: 'dim cn sm' });
  tag({ t0: 152.3, t1: 154.4, at: [3.2, 3.6, OZ], text: 'GPT-1', cls: 'acc' });
  tag({ t0: 154.7, t1: 156.0, at: [4.4, 6.4, OZ], text: 'GPT-2', cls: 'acc' });
  tag({ t0: 156.7, t1: 158.1, at: [G3[0], G3[1] + 21.5, OZ + G3[2]], text: 'GPT-3', cls: 'acc' });
  tag({ t0: 156.9, t1: 158.1, at: [960, 1000], text: '≈ 16 个 GPT-3', cls: 'cn prot', scramble: false });
  callout({ t0: G1T + 0.05, t1: 158.1, at: [G1P[0], G1P[1], OZ + G1P[2]], dx: -70, dy: -85, idx: '2018', title: 'GPT-1', sub: '1.17 亿参数 = 12 个点', accent: true, size: 20, dot: false, gap: 10 });
  wline({ t0: 158.4, t1: 161.1, pts: () => [[-36, -20, OZ], [36, -20, OZ]], color: 'rgba(244,239,232,.45)' });
  wline({ t0: 158.4, t1: 161.1, pts: () => [[-36, -20, OZ], [-36, 20, OZ]], color: 'rgba(244,239,232,.45)' });
  wline({ t0: 159.8, t1: 161.1, pts: () => [[LAWX(0) - 4, LAWY(0) + 1.9, OZ], [LAWX(6) + 10, LAWY(6) - 4.6, OZ]], color: 'rgba(255,106,43,.8)', dash: '8 6' });
  tag({ t0: 158.6, t1: 161.1, at: [30, -17.6, OZ], text: '计算量 →（对数）', cls: 'dim cn sm' });   // 在横轴上方，避开底部字幕
  tag({ t0: 158.7, t1: 161.1, at: [-36, 23, OZ], text: '误差（对数）', cls: 'dim cn sm' });
  tag({ t0: 158.5, t1: 161.1, at: [960, 150], text: 'SCALING LAWS · KAPLAN ET AL. · 2020', cls: 'dim' });
  ['预训练 · 会续写', '人类示范', '人类排序', '强化学习', '对话助手'].forEach((t, k) =>
    tag({ t0: stT(k), t1: 167.8, at: [ST[k], PY - 3.4, OZ], text: t, cls: (k === 4 ? 'acc ' : '') + 'cn sm', scramble: false }));
  tag({ t0: 161.4, t1: 167.8, at: [960, 110], text: 'RLHF · 人类反馈强化学习 · INSTRUCTGPT 2022', cls: 'dim' });
  tag({ t0: 168.6, t1: 175.6, at: [960, 1000], text: (T) => { const p = seg(T, 168.6, 175.4); const m = Math.floor(lerp(2020 * 12, 2022 * 12 + 10, Math.pow(p, 1.6))); return `${Math.floor(m / 12)}.${String((m % 12) + 1).padStart(2, '0')}`; }, cls: 'dim', scramble: false });
}
