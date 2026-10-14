// 第 3 幕 · 爆发（176 – 200 s）：2022.11.30
// 静默之后的超新星："ChatGPT" → 光尘凝成地球 → 为什么火：免费、打字就能聊、什么都能接（各种真实的提问从地球上冒出来）
// → 5 天 100 万、约 2 个月约 1 亿（估算）→ 对比条 → 镜头拉远
import { SEGS, CAMK, key, FLASH, SHAKE, RINGS, FOCUS, distTo, CAMP, NM, TAU2, rA, rB, rC, rD, uX, uY, uZ, gX, gY, gZ } from '../film.js';
import { scene } from '../../../web/js/engine.js';
import { title, smooth, h, E, clamp, lerp, seg, rng, charCue } from '../kit.js';
import { tag, chapter, bars, callout, wline } from '../hud.js';
import { OZ } from './a2_ignite.js';

const GC = [34, 0, OZ];                              // 与上一幕的星系中心相同
const ASK = ['帮我写一封辞职信', '用五岁小孩能懂的话解释黑洞', '这段代码为什么报错？', '把这段话翻译成英文', '给女儿编个睡前故事',
  '怎么跟老板提加薪？', '写一首关于猫的诗', '帮我改改简历', '这道数学题怎么做？', '帮我准备明天的面试',
  '你是一只猫娘……'];   // 彩蛋：当年最出圈的那句角色扮演提示词，最后一个冒出来
const askT = (k) => 178.6 + 0.42 * k;
const ASKXY = ASK.map((_, k) => {                    // 沿地球上方的一道弧散开（避开顶部的数字和底部的字幕）
  const a = ((((k * 7) % 16) / 15) * 2 - 1) * 1.3, rr = Math.abs(a) < 0.2 ? 0.62 : 0.9 + 0.08 * ((k * 5) % 3);   // 弧顶正中的两个往下放，避开大数字
  return [960 + Math.sin(a) * 720 * rr, 830 - Math.cos(a) * 400 * rr];
});
ASKXY[ASK.length - 1] = [600, 560];                   // 彩蛋放在地球左侧的空处：别挤在"100 万用户"大字下面
const RG = 24, GTILT = 0.42;

// 爆发：68% 球壳 + 32% 赤道盘
const BD = new Float32Array(NM * 3), BM = new Float32Array(NM), BCR = new Float32Array(NM), BCG = new Float32Array(NM), BCB = new Float32Array(NM);
{
  const R = rng(176);
  for (let i = 0; i < NM; i++) {
    let x = uX[i], y = uY[i], z = uZ[i];
    const disk = R() < 0.32;
    if (disk) { y *= 0.08; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l; }
    BD[3 * i] = x; BD[3 * i + 1] = y; BD[3 * i + 2] = z;
    BM[i] = disk ? 40 + 140 * R() : 25 + 120 * Math.pow(R(), 1.6);
    const c = R();
    const col = c < 0.45 ? [1, 0.7, 0.45] : c < 0.85 ? [1, 0.38, 0.1] : [0.5, 0.65, 1];
    BCR[i] = col[0]; BCG[i] = col[1]; BCB[i] = col[2];
  }
}
function burstAt(i, T, o) {
  const t = T - 176.0;
  const rad = BM[i] * (1 - Math.exp(-t / 0.28)) + 1.5 * t;
  o.x = GC[0] + BD[3 * i] * rad; o.y = GC[1] + BD[3 * i + 1] * rad; o.z = GC[2] + BD[3 * i + 2] * rad;
  const cool = smooth(clamp(t / 0.5));
  o.r = lerp(1.6, BCR[i], cool); o.g = lerp(1.4, BCG[i], cool); o.b = lerp(1.2, BCB[i], cool);
  o.a = 0.6 + 0.4 * Math.exp(-t / 0.8);
  o.s = 0.16;
}

// 地球：斐波那契球面；灯光先在少数"早期用户"处亮起，再铺满
const GX = new Float32Array(NM), GY = new Float32Array(NM), GZ = new Float32Array(NM), LT = new Float32Array(NM);
{
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NM; i++) {
    const y = 1 - (2 * (i + 0.5)) / NM, r = Math.sqrt(1 - y * y), ph = i * golden;
    GX[i] = Math.cos(ph) * r; GY[i] = y; GZ[i] = Math.sin(ph) * r;
  }
  const ang = 0.16 * (182 - 177.6);
  const toLocal = ([x, y, z]) => {
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
    LT[i] = rA[i] < 0.14 ? 178.8 + 2.6 * d + 0.25 * rC[i] : 185.0 + 1.9 * Math.pow(d, 0.85) + 0.25 * rC[i];
  }
}
function globeAt(i, T, o) {
  const ang = 0.16 * (T - 177.6);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const x0 = GX[i], y0 = GY[i], z0 = GZ[i];
  const x1 = x0 * ca + z0 * sa, z1 = -x0 * sa + z0 * ca;
  const ct = Math.cos(GTILT), st = Math.sin(GTILT);
  const y2 = y0 * ct - z1 * st, z2 = y0 * st + z1 * ct;
  let rad = RG;
  if (T > 192.0) rad *= 1 + 0.07 * Math.exp(-(T - 192.0) / 0.22) * (1 - Math.exp(-(T - 192.0) / 0.03));
  o.x = GC[0] + x1 * rad; o.y = GC[1] + y2 * rad; o.z = GC[2] + z2 * rad;
  const vx = CAMP.x - o.x, vy = CAMP.y - o.y, vz = CAMP.z - o.z;
  const facing = (x1 * vx + y2 * vy + z2 * vz) / (Math.hypot(vx, vy, vz) + 1e-6);
  const front = 0.16 + 0.84 * smooth(clamp(facing * 3 + 0.35));
  const rim = Math.exp(-((facing - 0.05) ** 2) / 0.012);
  const L = LT[i];
  const lit = smooth(clamp((T - L) / 0.3));
  const spark = T > L ? Math.exp(-(T - L) / 0.25) : 0;
  const boost = T > 192.0 ? 1 + 1.4 * Math.exp(-(T - 192.0) / 0.35) : 1;
  o.r = (lerp(0.32, 1.0, lit) + spark * 1.2 + rim * 0.12) * boost;
  o.g = (lerp(0.45, 0.36, lit) + spark * 0.9 + rim * 0.2) * boost;
  o.b = (lerp(0.8, 0.08, lit) + spark * 0.6 + rim * 0.4) * boost;
  o.a = lerp(0.22, 0.85, lit) * front;
  o.s = lerp(0.1, 0.14, lit);
}
const G2 = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, s: 0 };
function fBoom(i, T, o) {
  burstAt(i, T, o);
  if (T < 177.6) return;
  const st = 177.6 + 1.0 * rA[i];
  const q = seg(T, st, st + 1.1);
  if (q <= 0) return;
  globeAt(i, T, G2);
  const e = E.p3(q);
  o.x = lerp(o.x, G2.x, e); o.y = lerp(o.y, G2.y, e); o.z = lerp(o.z, G2.z, e);
  o.r = lerp(o.r, G2.r, e); o.g = lerp(o.g, G2.g, e); o.b = lerp(o.b, G2.b, e);
  o.a = lerp(o.a, G2.a, e); o.s = lerp(o.s, G2.s, e);
}

// ---------------------------------------------------------------- 竞赛的燃料：训练算力（对数坐标）
// 数字见 FACTS.md（Epoch AI 数据库；标"估计"的是估计值）
export const COMP = [                                // [年份, log10(运算次数), 名字, 说明]（Epoch AI 数据库）
  [2012.8, Math.log10(4.7e17), 'AlexNet', '2012'],
  [2020.4, Math.log10(3.14e23), 'GPT-3', '2020'],
  [2023.2, Math.log10(2.1e25), 'GPT-4', '2023 · 估计'],
  [2025.5, Math.log10(5e26), 'Grok 4', '2025 · 估计'],
  [2026.7, 27, 'GPT-6 Astra', '2026 · 估计'],
];
const CC3 = [34, 1, OZ];
const COMP_TOP_M = 1, COMP_TOP_E = 27;               // 已知最大的一次训练 ≈ 10^27（估计）
const CXF = (yr) => CC3[0] - 31 + (yr - 2011) * (62 / 16.5), CYF = (lg) => CC3[1] - 15 + (lg - 17) * (30 / 10.5);
export const compT = (k) => 193.9 + 0.55 * k;         // 各点出现的时刻
function fCompute(i, T, o) {
  const [cx, cy, cz] = CC3;
  if (i < COMP.length * 2600) {                       // 数据点
    const k = Math.floor(i / 2600), [yr, lg] = COMP[k];
    const t0 = compT(k), on = smooth(seg(T, t0, t0 + 0.25)), pop = T > t0 ? 1 + 2 * Math.exp(-(T - t0) / 0.25) : 0;
    const last = k === COMP.length - 1;
    const x = CXF(yr), y = CYF(lg), r = last ? 1.5 : 1.05;
    o.x = x + gX[i] * r * 0.45; o.y = y + gY[i] * r * 0.45; o.z = cz + gZ[i] * r * 0.45;
    o.r = last ? 1.3 : 1.1; o.g = last ? 0.55 : 0.8; o.b = last ? 0.2 : 0.6; o.a = 0.9 * on * pop; o.s = 0.13;
    return;
  }
  if (i < COMP.length * 2600 + 16000) {               // 连线：沿对数坐标一路往上（先画出来的部分亮）
    const q = (i - COMP.length * 2600) / 16000, seg3 = Math.min(COMP.length - 2, Math.floor(q * (COMP.length - 1))), u = q * (COMP.length - 1) - seg3;
    const [y0, l0] = COMP[seg3], [y1, l1] = COMP[seg3 + 1];
    const draw = seg(T, compT(seg3), compT(seg3 + 1));
    o.x = lerp(CXF(y0), CXF(y1), u) + gX[i] * 0.08; o.y = lerp(CYF(l0), CYF(l1), u) + gY[i] * 0.08; o.z = cz + gZ[i] * 0.08;
    o.r = 1; o.g = 0.62; o.b = 0.3; o.a = u <= draw ? 0.55 : 0; o.s = 0.1;
    return;
  }
  if (i < COMP.length * 2600 + 16000 + 18000) {       // 背景：对数网格的点阵（每一行 = 10 倍）
    const q = i - COMP.length * 2600 - 16000, row = q % 11, t = Math.floor(q / 11) / 1636;
    o.x = CXF(2011) + t * 62; o.y = CYF(17 + row); o.z = cz - 0.5;   // 2011 – 2027.5
    o.r = 0.8; o.g = 0.85; o.b = 1; o.a = 0.07 * smooth(seg(T, 193.0, 193.8)); o.s = 0.09;
    return;
  }
  o.x = cx + gX[i] * 60; o.y = cy + gY[i] * 40; o.z = cz - 40 + gZ[i] * 30; o.a = 0; o.r = o.g = o.b = 1; o.s = 0.1;
}

export function a3() {
  SEGS.push({ t: 176.0, form: fBoom });
  SEGS.push({ t: 192.9, form: fCompute, tr: { type: 'swirl', dur: 1.1, spread: 0.5, amp: 10 } });
  const [cx, cy, cz] = GC;
  CAMK.push(
    { t: 176.0,  p: [cx, 0, cz + 92],    q: [cx, 0, cz], fov: 56, roll: 0 },
    { t: 177.6,  p: [cx, 3, cz + 126],   q: [cx, 0, cz], fov: 56, roll: -0.03 },
    { t: 179.8,  p: [cx - 6, 20, cz + 60], q: [cx, 17, cz], fov: 50, roll: 0.02 },
    { t: 188.0,  p: [cx + 5, 22, cz + 54], q: [cx, 19, cz], fov: 50, roll: -0.02 },
    { t: 192.0,  p: [cx + 2, 16, cz + 70], q: [cx, 10, cz], fov: 50, roll: 0 },
    { t: 193.6,  p: [CC3[0] + 4, CC3[1] + 4, cz + 68], q: [CC3[0], CC3[1] + 4, cz], fov: 50, roll: 0.01, ease: E.p3o },
    { t: 198.2,  p: [CC3[0] - 3, CC3[1] + 5, cz + 63], q: [CC3[0] + 2, CC3[1] + 4, cz], fov: 50, roll: -0.01 },
  );
  FOCUS.push({ t0: 176.0, t1: 177.6, fn: () => distTo(...GC) }, { t0: 177.6, t1: 193.2, fn: () => distTo(...GC) - RG * 0.8 },
    { t0: 193.2, t1: 200, fn: () => distTo(...CC3) });
  key('bloom', [176.0, 3.8], [176.8, 2.6], [191.99, 2.3], [192.0, 3.4], [193.0, 2.4], [200, 2.4]);
  key('spread', [176.0, 0.62], [177.0, 0.55], [192.0, 0.6], [193, 0.55]);
  key('zoom', [175.99, 0], [176.0, 0.18], [176.8, 0.03], [177.6, 0]);
  key('ca', [175.99, 0.0015], [176.0, 0.03], [177.2, 0.002], [191.99, 0.002], [192.0, 0.016], [192.8, 0.002]);
  key('expo', [176.0, 1]);
  key('ap', [176, 0.004], [178, 0.004], [179.6, 0.012], [200, 0.012]);
  key('streak', [176.0, 0.1], [177.0, 0.03], [177.6, 0.01], [179.6, 0.006], [200, 0.006]);
  key('dust', [176.0, 0.6], [178, 1], [200, 1]);
  FLASH.push([176.0, 1.0, 0.1], [192.0, 0.3, 0.18]);
  SHAKE.push([176.0, 2.4, 0.42], [192.0, 0.9, 0.35]);
  RINGS.push({ t: 176.0, n: 6000, R0: 1, R1: 165, k: 0.32, life: 1.8, a: 1.4, col: [1, 0.85, 0.7], s: 0.25, flat: 0.3, c: GC });
  RINGS.push({ t: 192.0, n: 6000, R0: 25, R1: 120, k: 0.4, life: 1.6, a: 0.9, col: [1, 0.55, 0.2], s: 0.2, flat: 0.28, c: [cx, 8, cz] });

  scene({ id: 'a3', start: 176, dur: 24 }, (S) => {
    const c = (t, ...a) => S.cue(t - 176, ...a);
    c(176.0, 'impact', { size: 1.7, metal: 0.35, gain: 2 });
    c(176.0, 'sub', { dur: 3.2, gain: -5 });
    c(176.0, 'whoosh', { dur: 1.4, size: 1.0, gain: -6 });
    c(177.6, 'whoosh', { dur: 1.8, size: 0.7, gain: -10 });
    c(181.9, 'blip', { pitch: 1760, kind: 'ping', gain: -8 });
    c(185.0, 'blip', { pitch: 2350, kind: 'ping', gain: -8 });
    ASK.forEach((_, k) => c(askT(k), 'blip', { pitch: [1175, 1397, 1568, 1760, 2093][k % 5], kind: 'tick', gain: -17 }));   // 一条条消息
    c(188.4, 'chirp', { dur: 1.0, gain: -14 });
    c(191.2, 'reverse', { dur: 0.8, gain: -8 });
    c(192.0, 'impact', { size: 1.2, metal: 0.25, gain: -2 });
    c(192.0, 'sub', { dur: 3.2, gain: -7 });
    c(192.9, 'whoosh', { dur: 1.2, size: 0.6, gain: -10 });                                   // 地球散开，化成算力图
    COMP.forEach((_, k) => c(compT(k), 'impact', { size: 0.35 + 0.25 * k, metal: 0.3, gain: -14 + 3 * k }));
    charCue(S, 'stream', Array.from({ length: 24 }, (_, k) => 193.9 + (2.2 * k) / 24), { gain: -17 });   // 指数一路往上滚
    c(196.3, 'blip', { pitch: 1760, kind: 'ping', gain: -11 });
    c(198.0, 'whoosh', { dur: 2.2, size: 0.8, gain: -8 });                                      // 冲进竞赛的跑道

    title(S, 'ChatGPT', { t0: 176.0, t1: 178.3, size: 190, weight: 800, cls: 'num glow', ls: '-0.02em', stagger: 0.025, inDur: 0.8, blur: 24, y: 520, scale: 1.3 });
    title(S, '2022.11.30 · 基于 GPT-3.5', { t0: 176.45, t1: 179.4, size: 26, weight: 400, cls: 'mono', ls: '0.4em', stagger: 0.03, blur: 8, y: 680, scale: 1 });
    // 为什么火：第一次，任何人都能免费、用大白话和 AI 聊天，而且它什么都接得住
    title(S, '免费，打字就能聊——写作、编程、翻译、答疑，样样都接得住。', { t0: 178.5, t1: 181.6, size: 44, weight: 300, ls: '0.06em', y: 930 });
    title(S, '5 天', { t0: 181.8, t1: 184.7, size: 36, weight: 400, cls: 'dim', ls: '0.4em', stagger: 0.06, blur: 10, y: 190, scale: 1 });
    const big1 = title(S, '100 万用户', { t0: 181.88, t1: 184.7, size: 120, weight: 600, cls: 'glow', ls: '0.04em', stagger: 0.05, y: 310 });
    const numEls = big1.cs.slice(0, 3);
    S.update((_, T) => {
      const v = String(Math.round(100 * E.p3o(seg(T, 181.88, 182.5)))).padStart(3, ' ');
      numEls.forEach((el, k) => { el.textContent = v[k] === ' ' ? ' ' : v[k]; });
    }, 0, 24);
    title(S, '约 2 个月', { t0: 184.9, t1: 188.2, size: 36, weight: 400, cls: 'dim', ls: '0.4em', stagger: 0.06, blur: 10, y: 190, scale: 1 });
    title(S, '约 1 亿月活', { t0: 184.98, t1: 188.2, size: 120, weight: 600, cls: 'glow', ls: '0.04em', stagger: 0.05, y: 310 });
    title(S, '历史上增长最快的消费级应用之一', { t0: 188.4, t1: 191.8, size: 34, weight: 300, ls: '0.2em', y: 190 });
    // 竞赛的燃料：算力
    title(S, '这场爆发，点燃了一场算力竞赛。', { t0: 192.3, t1: 194.9, size: 50, weight: 300, ls: '0.1em', y: 940 });
    const ex = S.add(h('div', { class: 'big num comp-n' })), exS = S.add(h('div', { class: 'big comp-s' }));
    S.update((_, T) => {
      const v = smooth(seg(T, 193.7, 194.1)) * (1 - smooth(seg(T, 198.0, 198.4)));
      const e2 = lerp(COMP[0][1], COMP[COMP.length - 1][1], E.p3o(seg(T, 193.9, 196.1)));
      ex.innerHTML = T < 196.1 ? `10<sup>${Math.floor(e2)}</sup>` : `${COMP_TOP_M > 1 ? COMP_TOP_M + ' × ' : ''}10<sup>${COMP_TOP_E}</sup>`;   // 滚动时只显示整数次方
      exS.textContent = T < 196.1 ? '次运算' : '次运算 · 14 年，涨了十亿倍以上';
      ex.style.opacity = exS.style.opacity = v.toFixed(3);
    }, 0, 24);
    title(S, '相当于 80 亿人每人每秒算一次，要算约 40 亿年。', { t0: 196.3, t1: 198.5, size: 46, weight: 300, ls: '0.06em', y: 930 });
  });
  chapter({ t0: 180.0, t1: 186.0, num: '03 / 06', title: '爆发', sub: '2022' });
  // 算力图的标注
  COMP.forEach(([yr, lg, n, d], k) => callout({ t0: compT(k) + 0.1, t1: 198.3, at: [CXF(yr), CYF(lg), OZ], dx: k === COMP.length - 1 ? 110 : k === 3 ? 20 : k % 2 ? 90 : -90, dy: k === COMP.length - 1 ? 80 : k === 3 ? 95 : k % 2 ? 60 : -60,
    title: n, sub: d, accent: k === COMP.length - 1, size: k === COMP.length - 1 ? 26 : 20 }));
  [18, 20, 22, 24, 26].forEach((e2) => tag({ t0: 193.4, t1: 198.3, at: [CXF(2011) - 1.5, CYF(e2), OZ], text: `10^${e2}`, cls: 'dim', center: false, dx: -70, scramble: false }));
  wline({ t0: 193.3, t1: 198.3, pts: () => [[CXF(2011), CYF(17), OZ], [CXF(2027.5), CYF(17), OZ]], color: 'rgba(244,239,232,.4)' });
  wline({ t0: 193.3, t1: 198.3, pts: () => [[CXF(2011), CYF(17), OZ], [CXF(2011), CYF(27.5), OZ]], color: 'rgba(244,239,232,.4)' });
  tag({ t0: 193.4, t1: 198.3, at: [CXF(2027.5), CYF(17) + 1.6, OZ], text: '年份 →', cls: 'dim cn sm', scramble: false });
  tag({ t0: 185.6, t1: 188.2, at: [960, 1010], text: '月活为 UBS 基于 SIMILARWEB 数据的估算', cls: 'dim cn sm', scramble: false });
  // 各种真实的提问，从地球的各个角落冒出来（示意）
  ASK.forEach((q, k) => tag({ t0: askT(k), t1: askT(k) + 1.7, at: ASKXY[k], text: q, cls: 'cn bubble ask', scramble: false, fin: 0.18 }));
  bars({ t0: 188.6, t1: 191.9, x: 960, y: 232, w: 420, center: true, nameW: 170, label: '达到 1 亿用户用时', items: [['ChatGPT', 2 / 30, '约 2 个月', true], ['TikTok', 9 / 30, '约 9 个月'], ['Instagram', 1, '约 2.5 年']] });
  tag({ t0: 188.8, t1: 191.9, at: [960, 1010], text: '数据：UBS / SIMILARWEB 估算 · SENSOR TOWER', cls: 'dim', scramble: false });
}
