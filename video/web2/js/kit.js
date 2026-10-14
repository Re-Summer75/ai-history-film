// 样片与正片共用的小工具：关键帧轨道、相机路径、震屏、文字采样、电影感字幕
import { h, E, clamp, lerp, seg, rng, TEXTS } from '../../web/js/engine.js';

export const smooth = (x) => x * x * (3 - 2 * x);
export const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
export const frac = (x) => x - Math.floor(x);

// 标量轨道：[[t, v], ...]，相邻关键帧之间用 smootherstep（两端速度为 0）；可逐段指定缓动
export function track(keys) {
  return (T) => {
    if (T <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [a, va, ease] = keys[i], [b, vb] = keys[i + 1];
      if (T < b) return b - a < 1e-9 ? vb : lerp(va, vb, (ease || smoother)(clamp((T - a) / (b - a))));
    }
    return keys[keys.length - 1][1];
  };
}

// 相机路径：关键帧 {t, p:[x,y,z], q:[目标], fov, roll, ease?}
// 默认用 Hermite 样条（切线取相邻关键帧的差分，时间非均匀），镜头运动连续不停顿；
// 指定 ease 的段改为缓动插值（用于冲击、急推急拉）；同一时刻的两个关键帧 = 硬切
export function camPath(keys) {
  const F = ['p', 'q'];
  const val = (k, f, c) => (f === 'fov' ? k.fov : f === 'roll' ? k.roll || 0 : k[f][c]);
  const tangent = (i, f, c) => {
    const a = keys[Math.max(0, i - 1)], b = keys[Math.min(keys.length - 1, i + 1)];
    if (keys[i].hold || b.t - a.t < 1e-6) return 0;
    if (i > 0 && keys[i].t - keys[i - 1].t < 1e-6) return 0;
    if (i < keys.length - 1 && keys[i + 1].t - keys[i].t < 1e-6) return 0;
    return (val(b, f, c) - val(a, f, c)) / (b.t - a.t);
  };
  const out = { p: [0, 0, 0], q: [0, 0, 0], fov: 50, roll: 0 };
  return (T) => {
    let i = 0;
    while (i < keys.length - 2 && T >= keys[i + 1].t) i++;
    const A = keys[i], B = keys[i + 1];
    const d = Math.max(1e-6, B.t - A.t);
    const u = clamp((T - A.t) / d);
    const one = (f, c) => {
      const pa = val(A, f, c), pb = val(B, f, c);
      if (B.ease) return lerp(pa, pb, B.ease(u));
      const ma = tangent(i, f, c) * d, mb = tangent(i + 1, f, c) * d;
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * pa + (u3 - 2 * u2 + u) * ma + (-2 * u3 + 3 * u2) * pb + (u3 - u2) * mb;
    };
    for (const f of F) for (let c = 0; c < 3; c++) out[f][c] = one(f, c);
    out.fov = one('fov', 0);
    out.roll = one('roll', 0);
    return out;
  };
}

// 正片用的相机路径：镜头一路不停、速度连续（"一镜到底"），只在刻意的冲击处才有速度突变。
// 切线用单调三次插值（Fritsch–Carlson）：不过冲；某个分量前后方向相反时，它在该关键帧处速度为 0（自然的折返）。
// 关键帧上旧的 ease 按形状自动归类：
//   爆发（power3.out 之类，起步快、收尾慢）→ 这一段起步冲刺，收尾与下一段的速度接上（不再停一下再走）；
//   撞击（x²、x³，越来越快）→ 这一段起步与上一段接上，加速撞进关键帧（撞击后允许速度突变）；
//   两头慢的 inOut → 当作普通段，速度连续。
// hold: true → 该关键帧速度为 0；同一时刻的两个关键帧 = 硬切。
export function camPathSmooth(keys) {
  const n = keys.length;
  const C = [['p', 0], ['p', 1], ['p', 2], ['q', 0], ['q', 1], ['q', 2], ['fov', 0], ['roll', 0]];
  const val = (k, f, c) => (f === 'fov' ? k.fov : f === 'roll' ? k.roll || 0 : k[f][c]);
  const kind = keys.map((k) => {
    if (!k.ease) return 'free';
    const e = k.ease, d0 = e(0.02) / 0.02, d1 = (1 - e(0.98)) / 0.02;
    if (d0 > 1.5 && d1 < 0.6) return 'punch';
    if (d0 < 0.6 && d1 > 1.5) return 'slam';
    return 'free';
  });
  const H = [], D = C.map(() => []);
  for (let i = 0; i < n - 1; i++) {
    H.push(keys[i + 1].t - keys[i].t);
    C.forEach(([f, c], j) => D[j].push(H[i] > 1e-6 ? (val(keys[i + 1], f, c) - val(keys[i], f, c)) / H[i] : 0));
  }
  const cut = (i) => i >= 0 && i < n - 1 && H[i] <= 1e-6;
  // 每个关键帧、每个分量的切线
  const M = C.map((_, j) => {
    const d = D[j], m = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (keys[i].hold) { m[i] = 0; continue; }
      const L = i > 0 && !cut(i - 1) ? i - 1 : -1, R = i < n - 1 && !cut(i) ? i : -1;
      if (L < 0 && R < 0) { m[i] = 0; continue; }
      if (L < 0 || R < 0) { m[i] = 0; continue; }                     // 片头片尾、硬切两侧：从静止开始 / 停到静止
      const a = d[L], b = d[R];
      if (a * b <= 0) { m[i] = 0; continue; }
      const w1 = 2 * H[R] + H[L], w2 = H[R] + 2 * H[L];
      m[i] = (w1 + w2) / (w1 / a + w2 / b);
    }
    return m;
  });
  const out = { p: [0, 0, 0], q: [0, 0, 0], fov: 50, roll: 0 };
  return (T) => {
    let i = 0;
    while (i < n - 2 && T >= keys[i + 1].t) i++;
    const A = keys[i], B = keys[i + 1], h = Math.max(1e-6, B.t - A.t);
    const u = clamp((T - A.t) / h), u2 = u * u, u3 = u2 * u;
    const k = kind[i + 1];
    C.forEach(([f, c], j) => {
      const pa = val(A, f, c), pb = val(B, f, c), d = D[j][i];
      let ma = M[j][i], mb = M[j][i + 1];
      if (k === 'punch') ma = 2.7 * d;
      else if (k === 'slam') mb = 2.5 * d;
      const v = (2 * u3 - 3 * u2 + 1) * pa + (u3 - 2 * u2 + u) * ma * h + (-2 * u3 + 3 * u2) * pb + (u3 - u2) * mb * h;
      if (f === 'fov') out.fov = v; else if (f === 'roll') out.roll = v; else out[f][c] = v;
    });
    return out;
  };
}

// 冲击震屏：事件 [t, 强度, 衰减秒]；返回 {x, y, r}（确定性噪声）
export function shaker(events) {
  return (T) => {
    let A = 0;
    for (const [t, a, d] of events) if (T >= t) A += a * Math.exp(-(T - t) / d);
    const x = Math.sin(T * 41.3) * 0.5 + Math.sin(T * 73.1 + 1.3) * 0.3 + Math.sin(T * 127.7 + 2.1) * 0.2;
    const y = Math.sin(T * 37.9 + 0.7) * 0.5 + Math.sin(T * 69.3 + 2.9) * 0.3 + Math.sin(T * 113.1 + 0.4) * 0.2;
    const r = Math.sin(T * 29.3 + 1.1) * 0.6 + Math.sin(T * 83.7) * 0.4;
    return { x: x * A, y: y * A, r: r * A, A };
  };
}

// 把文字渲染到画布，均匀采样笔画内部的点 → 世界坐标（宽度 width，中心在原点）
export function sampleText(text, { font = '800 360px Inter', count = 20000, width = 60, seed = 1, thresh = 150 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  const m = ctx.measureText(text);
  const pad = 24;
  const tw = Math.ceil(m.actualBoundingBoxRight + m.actualBoundingBoxLeft);
  const th = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
  c.width = tw + pad * 2; c.height = th + pad * 2;
  ctx.font = font;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const px = [];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > thresh) px.push(x, y);
  const r = rng(seed);
  const n = px.length / 2;
  const sc = width / tw;
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const k = Math.floor(r() * n);
    out[2 * i] = (px[2 * k] + r() - 0.5 - c.width / 2) * sc;
    out[2 * i + 1] = -(px[2 * k + 1] + r() - 0.5 - c.height / 2) * sc;
  }
  return { pts: out, w: width, h: th * sc };
}

// ---------------------------------------------------------------- 电影感字幕（DOM）
// 逐字：从模糊、放大、透明中"聚焦"出来；退场整体失焦
export function splitChars(el, text) {
  TEXTS.add(text);
  el.textContent = '';
  const out = [];
  for (const ch of [...text]) {
    const s = h('span', { class: 'c' }, ch === ' ' ? ' ' : ch);
    el.append(s);
    out.push(s);
  }
  return out;
}

// 登记所有字幕（用于检查"没看清就被切走"：可读时长 = 出齐之后到开始退场）
export const TITLES = [];
export function titleReport() {
  return TITLES.map(({ S, text, n, t0, t1, stagger, inDur, outDur }) => {
    const W = S.warp || { inv: (t) => t };
    const full = t0 + stagger * Math.max(0, n - 1) + 0.4 * inDur;       // expo.out：约 40% 时长时已基本清晰
    const end = t1 == null ? null : t1 - outDur;
    return { text, n, t0: +W.inv(t0).toFixed(2), full: +W.inv(full).toFixed(2), end: end == null ? null : +W.inv(end).toFixed(2),
      read: end == null ? null : +(W.inv(end) - W.inv(full)).toFixed(2) };
  });
}
export function title(S, text, o = {}) {
  const { t0, t1, y = 540, size = 64, weight = 300, cls = '', ls = '0.08em', inDur = 1.1,
          outDur = 0.55, blur = 18, rise = 0.25, scale = 1.18, font } = o;
  // 逐字入场的总时长封顶 0.8 s：长句子不能光"出字"就用掉一两秒，留给观众读的时间会被吃掉
  const n0 = [...text].length;
  const stagger = Math.min(o.stagger ?? 0.045, n0 > 1 ? 0.8 / (n0 - 1) : 1);
  const el = h('div', { class: `big ${cls}` });
  Object.assign(el.style, { fontSize: `${size}px`, fontWeight: weight, letterSpacing: ls, top: `${y - size * 0.62}px`, lineHeight: '1.24' });
  if (font) el.style.fontFamily = font;
  S.el.appendChild(el);
  const cs = splitChars(el, text);
  TITLES.push({ S, text, n: cs.length, t0, t1, stagger, inDur, outDur });
  S.tl.fromTo(cs, { opacity: 0, filter: `blur(${blur}px)`, yPercent: rise * 100, scale },
    { opacity: 1, filter: 'blur(0px)', yPercent: 0, scale: 1, duration: inDur, stagger, ease: 'expo.out' }, t0 - S.start);
  if (t1 != null) {
    S.tl.fromTo(el, { opacity: 1, filter: 'blur(0px)', scale: 1 },
      { opacity: 0, filter: `blur(${blur * 0.7}px)`, scale: 1.035, duration: outDur, ease: 'power2.in', immediateRender: false }, t1 - S.start - outDur);
  }
  return { el, cs };
}

export { h, E, clamp, lerp, seg, rng };

// ---------------------------------------------------------------- 逐字音效
// 画面上每出现一个字就响一下：times 为全片时间列表，合成一个提示点（keys = 人在打字的键盘声；stream = AI 输出的数据流声）
export function charCue(S, type, times, params = {}) {
  if (!times.length) return;
  const t0 = times[0];
  S.cue(t0 - S.start, type, { times: times.map((t) => +(t - t0).toFixed(4)), ...params });
}
// engine.typewriter 的第 m 个字出现的时刻（全片时间）
export const typeTimes = (t0, text, cps) => [...text].map((_, m) => t0 + (m + 1) / cps);

// 把一个字符（可以是彩色 emoji）画到画布上，按 n×n 网格取颜色 → 用作粒子图像
export function sampleGrid(ch, { font = '200px "Segoe UI Emoji", "Noto Color Emoji", sans-serif', n = 40, size = 256 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(ch, size / 2, size / 2 + size * 0.04);
  const d = ctx.getImageData(0, 0, size, size).data;
  const out = new Float32Array(n * n * 4);
  const cell = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let r = 0, g = 0, b = 0, a = 0, k = 0;
    for (let yy = 0; yy < cell; yy += 2) for (let xx = 0; xx < cell; xx += 2) {
      const p = ((Math.floor(y * cell + yy)) * size + Math.floor(x * cell + xx)) * 4;
      r += d[p]; g += d[p + 1]; b += d[p + 2]; a += d[p + 3]; k++;
    }
    const o = (y * n + x) * 4;
    out[o] = r / k / 255; out[o + 1] = g / k / 255; out[o + 2] = b / k / 255; out[o + 3] = a / k / 255;
  }
  return out;
}
