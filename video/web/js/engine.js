// 逐帧确定性动画引擎
// - 所有补间放在一条暂停的 GSAP 主时间轴上，渲染第 f 帧 = 把主时间轴精确跳到 f/60 秒
// - 程序化内容（计数器、乱码解码、three.js、画布）用 updater：每帧按时间直接算出状态，与播放历史无关
// - 场景可以登记音效提示点（cue），渲染音频时按同一条时间线生成音效
export const FPS = 60, W = 1920, H = 1080;
export const DURATION = 240;

gsap.registerPlugin(CustomEase, SplitText, DrawSVGPlugin);
CustomEase.create('snap', 'M0,0 C0.14,0 0.12,1 1,1');           // 利落的"机能"缓动
CustomEase.create('glide', 'M0,0 C0.6,0 0.1,1 1,1');
gsap.defaults({ ease: 'expo.out', duration: 0.9 });

export const master = gsap.timeline({ paused: true });
export const stageEl = document.getElementById('stage');
export const scenesEl = document.getElementById('scenes');
const updaters = [];
export const cues = [];
export const TEXTS = new Set();   // 动态文字（打字机、乱码解码）登记在这里，用于预加载字形

// ---------------- 小工具 ----------------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const E = {
  out: gsap.parseEase('expo.out'), inOut: gsap.parseEase('expo.inOut'), in: gsap.parseEase('expo.in'),
  p3: gsap.parseEase('power3.inOut'), p3o: gsap.parseEase('power3.out'), p2: gsap.parseEase('power2.inOut'),
  snap: gsap.parseEase('snap'), glide: gsap.parseEase('glide'), lin: (x) => x,
};
export function rng(seed) {                    // mulberry32：可复现的伪随机
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash = (...n) => { let h = 2166136261; for (const v of n) { h ^= (v * 2654435761) >>> 0; h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (k === 'text') el.textContent = v; else el.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
}
export const px = (v) => `${v}px`;
export function place(el, x, y, extra = {}) { Object.assign(el.style, { left: px(x), top: px(y) }, extra); el.classList.add('abs'); return el; }

// ---------------- 场景 ----------------
// scene({id, start, dur, tail}, S => { ... })
// S.el 场景容器；S.tl 场景时间轴（局部时间从 0 开始）；S.cue(t, 类型, 参数) 登记音效；S.update(fn) 逐帧更新
// 分幕时间重排（光粒子版用）：场景照旧按原来的时间写，放进成片时按时间映射 W 换算（W.inv：原来 → 成片，W.fwd：成片 → 原来）。
// 逐帧更新、场景时间轴收到的仍是原来的时间；音效提示点记录的是换算后的真实时间（逐字时刻、持续时长一并换算）
let SCENE_WARP = null;
export const setSceneWarp = (w) => { SCENE_WARP = w; };
const WID = { fwd: (T) => T, inv: (t) => t, identity: true };
const seekers = [];
export function scene({ id, start, dur, tail = 0 }, build) {
  const el = h('div', { class: 'scene', 'data-id': id });
  scenesEl.appendChild(el);
  const W = SCENE_WARP || WID;
  const tl = gsap.timeline({ paused: !W.identity });
  const S = {
    id, start, dur, el, tl, warp: W,
    cue: (t, type, params = {}) => {
      const a = start + t, t0 = W.inv(a), p = { ...params };
      if (p.times) p.times = p.times.map((r) => +(W.inv(a + r) - t0).toFixed(4));
      if (p.dur) p.dur = +(W.inv(a + p.dur) - t0).toFixed(4);
      cues.push({ t: +t0.toFixed(4), type, ...p });
    },
    update: (fn, from = 0, to = dur + tail) => updaters.push({ a: W.inv(start + from), b: W.inv(start + to), fn: W.identity ? (T) => fn(T - start, T) : (T) => { const t = W.fwd(T); fn(t - start, t); } }),
    add: (child, x, y, extra) => { if (x != null) place(child, x, y, extra); el.appendChild(child); return child; },
  };
  build(S);
  if (W.identity) master.add(tl, start);
  else seekers.push({ tl, start, W });                  // 不放进主时间轴：每帧按换算后的时间单独定位
  // 可见性每帧按时间窗口直接计算（时间轴恰好停在子时间轴起点时，零时长的 set 不一定生效，会出现黑帧）
  windows.push({ el, a: W.inv(start), b: W.inv(start + dur + tail) });
  return S;
}
const windows = [];

// 全局逐帧更新（HUD、背景等跨场景元素）
export function always(fn) { updaters.push({ a: -1, b: 1e9, fn }); }

let glRender = () => {};
export function setGLRenderer(fn) { glRender = fn; }

export async function renderFrame(f) {
  const T = f / FPS;
  master.seek(T, true);
  for (const s of seekers) s.tl.seek(Math.max(0, s.W.fwd(T) - s.start), true);
  for (const w of windows) w.el.style.visibility = T >= w.a && T < w.b ? 'visible' : 'hidden';
  for (const u of updaters) if (T >= u.a && T <= u.b) u.fn(T);
  glRender(T);
  await new Promise((r) => requestAnimationFrame(() => r()));
}

// ---------------- 文字 ----------------
// 把文字拆成逐字遮罩结构（外层裁切、内层位移），返回内层元素数组
export function chars(el, text) {
  TEXTS.add(text);
  el.textContent = '';
  const inners = [];
  for (const c of [...text]) {
    if (c === '\n') { el.append(h('br')); continue; }
    const i = h('i', {}, c === ' ' ? ' ' : c);
    el.append(h('span', { class: 'ch' }, i));
    inners.push(i);
  }
  return inners;
}
// 逐字从下方升起（高级感的核心动作之一）
export function riseIn(tl, inners, at, { stagger = 0.035, dur = 1.0, from = 105, ease = 'expo.out' } = {}) {
  tl.fromTo(inners, { yPercent: from }, { yPercent: 0, duration: dur, stagger, ease }, at);
}
export function riseOut(tl, inners, at, { stagger = 0.015, dur = 0.5, to = -105, ease = 'power3.in' } = {}) {
  tl.fromTo(inners, { yPercent: 0 }, { yPercent: to, duration: dur, stagger, ease, immediateRender: false }, at);
}
// 淡入 + 轻微位移
export function fadeUp(tl, els, at, { y = 24, dur = 0.9, stagger = 0.06, ease = 'expo.out' } = {}) {
  tl.fromTo(els, { autoAlpha: 0, y }, { autoAlpha: 1, y: 0, duration: dur, stagger, ease }, at);
}
export function fadeOut(tl, els, at, { y = -12, dur = 0.45, stagger = 0.02, ease = 'power2.in' } = {}) {
  tl.fromTo(els, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y, duration: dur, stagger, ease, immediateRender: false }, at);
}
// 横线/竖线的"画出"
export function wipe(tl, els, at, { dur = 0.9, stagger = 0.05, axis = 'x', ease = 'expo.inOut' } = {}) {
  const k = axis === 'x' ? 'scaleX' : 'scaleY';
  tl.fromTo(els, { [k]: 0 }, { [k]: 1, duration: dur, stagger, ease }, at);
}
export function draw(tl, paths, at, { dur = 1.0, stagger = 0.04, ease = 'expo.inOut', from = '0%', to = '100%' } = {}) {
  tl.fromTo(paths, { drawSVG: from }, { drawSVG: to, duration: dur, stagger, ease }, at);
}

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=/<>';
// 乱码解码：文字从随机字符逐位"锁定"成最终文本（HUD 机能感）
export function scramble(S, el, text, t0, dur = 0.8, { seed = 1, glyphs = GLYPHS, keep = ' ·/:-' } = {}) {
  const arr = [...text];
  TEXTS.add(text);
  el.textContent = '';
  S.update((t) => {
    const p = seg(t, t0, t0 + dur);
    if (t < t0) { el.textContent = ''; return; }
    const shown = Math.ceil(arr.length * Math.min(1, p * 1.6));
    const locked = Math.floor(arr.length * E.p3o(p));
    const fr = Math.floor(t * 30);
    let out = '';
    for (let i = 0; i < shown; i++) {
      const c = arr[i];
      out += (i < locked || keep.includes(c)) ? c : glyphs[Math.floor(hash(seed, i, fr) * glyphs.length)];
    }
    el.textContent = out;
  });
}
// 打字机（按字符速率显示，带光标）
export function typewriter(S, el, text, t0, cps = 28, { caret = true, until = Infinity } = {}) {
  const arr = [...text];
  TEXTS.add(text);
  S.update((t) => {
    const n = clamp(Math.floor((t - t0) * cps), 0, arr.length);
    const blink = caret && t < until && (n < arr.length || Math.floor(t * 2.2) % 2 === 0);
    el.textContent = arr.slice(0, n).join('') + (t >= t0 && blink ? '▍' : '');
  });
  return t0 + arr.length / cps;
}
// 数字滚动
export function counter(S, el, from, to, t0, t1, { fmt = (v) => Math.round(v).toLocaleString('en-US'), ease = E.p3o } = {}) {
  S.update((t) => { el.textContent = fmt(lerp(from, to, ease(seg(t, t0, t1)))); });
}
