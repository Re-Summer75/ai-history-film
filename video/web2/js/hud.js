// 机能标注层：只在讲原理、讲技术的段落出现，作为焦点物体的"注解"，不做成面板。
// 元素都挂在 3D 物体上（每帧把世界坐标投影到屏幕）：引线标注、取景角标、读数、章节标记。
// 视觉规则：1px 细线、等宽字体、编号、唯一强调色（橙）；入场 = 引线画出 + 文字乱码锁定，出场 = 淡出。
import { h, clamp, seg, E, smooth, lerp } from './kit.js';
import { project } from './world.js';
import { HOOKS } from './film.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const root = document.getElementById('hud');
const svg = document.createElementNS(SVGNS, 'svg');
svg.setAttribute('width', '1920'); svg.setAttribute('height', '1080'); svg.setAttribute('viewBox', '0 0 1920 1080');
svg.style.position = 'absolute'; svg.style.inset = '0'; svg.style.overflow = 'visible';
root.appendChild(svg);
const ITEMS = [];
HOOKS.push((T) => { for (const it of ITEMS) it.update(T); });
// 分幕时间重排：标注照旧按本幕原来的时间写，创建时换算成成片时间；位置、文字等回调收到的仍是原来的时间
let WARP = null;
export const setHudWarp = (w) => { WARP = w; };
const I = (t) => (WARP ? WARP.inv(t) : t);
const wrapT = (f) => { const W = WARP; return W && typeof f === 'function' ? (T) => f(W.fwd(T)) : f; };

const GL = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=/<>';
const hash = (a, b, c) => { let x = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
// 乱码锁定：p 从 0 到 1，字符依次从随机字形"锁定"成原文（中文字符直接淡入，不参与乱码）
function scrambled(text, p, T, seed) {
  const arr = [...text];
  const shown = Math.ceil(arr.length * Math.min(1, p * 1.7));
  const locked = Math.floor(arr.length * E.p3o(p));
  const fr = Math.floor(T * 30);
  let out = '';
  for (let i = 0; i < shown; i++) {
    const c = arr[i];
    out += i < locked || c === ' ' || c.charCodeAt(0) > 0x2e80 || '·/:.-—()'.includes(c) ? c : GL[Math.floor(hash(seed, i, fr) * GL.length)];
  }
  return out;
}
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.appendChild(e); return e; };
const where = (at, T) => {
  const p = typeof at === 'function' ? at(T) : at;
  if (p.x !== undefined) return p;
  return p.length === 2 ? { x: p[0], y: p[1], z: 1 } : project(p[0], p[1], p[2]);
};
// 投影点在镜头背后、或远在画面之外时，标注不画
const offscreen = (p) => p.z < 0 || p.x < -300 || p.x > 2220 || p.y < -300 || p.y > 1380;
const vis = (T, t0, t1, fin = 0.35, fout = 0.3) => clamp(Math.min(seg(T, t0, t0 + fin), 1 - seg(T, t1 - fout, t1)));

// 遮挡：登记在 OCCL 里的大字（title() 的返回值）在前面时，带 occlude 的小字标签碰到它就淡出——小字在"后面"，不能压在大字上
export const OCCL = [];
const RANGE = document.createRange();
const opac = (e) => { const v = parseFloat(e.style.opacity); return Number.isFinite(v) ? v : 1; };
function occluded(el) {
  let k = 1, r = null;
  for (const o of OCCL) {
    const sc = o.el.closest('.scene');
    if (sc && sc.style.visibility === 'hidden') continue;
    const cs = o.cs;
    let a = opac(o.el);
    if (cs && cs.length) { let m = 0; for (const n of [0, cs.length >> 1, cs.length - 1]) m = Math.max(m, opac(cs[n])); a *= m; }
    if (a < 0.03) continue;
    if (!r) r = el.getBoundingClientRect();
    RANGE.selectNodeContents(o.el);
    const q = RANGE.getBoundingClientRect();
    const dx = Math.max(q.left - r.right, r.left - q.right, 0), dy = Math.max(q.top - r.bottom, r.top - q.bottom, 0);
    k = Math.min(k, lerp(1, smooth(clamp(Math.hypot(dx, dy) / 26)), Math.min(1, a * 3)));   // 大字一开始出现，小字就让开
  }
  return k;
}

// 引线标注：锚点小圆 + 折线引线 + 编号/标题/副标题
export function callout({ t0, t1, at, dx = 140, dy = -70, idx = '', title = '', sub = '', accent = false, size = 26, dot: showDot = true, gap = 0 }) {   // dot: false = 锚点不画白点（只画圈）；gap = 引线离锚点留多少像素（不压住圈里的东西）
  t0 = I(t0); t1 = I(t1); at = wrapT(at);
  const dot = svgEl('circle', { r: 2.6, fill: '#f4efe8' });
  const ring = svgEl('circle', { r: 7, fill: 'none', stroke: 'rgba(244,239,232,.55)', 'stroke-width': 1 });
  const line = svgEl('polyline', { fill: 'none', stroke: accent ? '#ff6a2b' : 'rgba(244,239,232,.7)', 'stroke-width': 1 });
  const box = h('div', { class: 'co' });
  const iEl = h('span', { class: 'co-i' }); const tEl = h('span', { class: 'co-t' + (accent ? ' acc' : '') }); const sEl = h('div', { class: 'co-s' });
  tEl.style.fontSize = `${size}px`;
  box.append(iEl, tEl, sEl);
  root.appendChild(box);
  const left = dx < 0;
  ITEMS.push({ update(T) {
    const v = vis(T, t0, t1);
    const on = T >= t0 - 0.01 && T < t1;
    for (const e of [dot, ring, line]) e.style.display = on ? '' : 'none';
    if (!showDot) dot.style.display = 'none';
    box.style.display = on ? '' : 'none';
    if (!on) return;
    const p = where(at, T);
    if (offscreen(p)) { for (const e of [dot, ring, line]) e.style.display = 'none'; box.style.display = 'none'; return; }
    const ex = p.x + dx * 0.55, ey = p.y + dy, lx = p.x + dx, ly = p.y + dy;
    const d = clamp((T - t0) / 0.45);
    const k = E.p3o(d);
    // 折线按长度逐段画出
    const L1 = Math.hypot(ex - p.x, ey - p.y), L2 = Math.abs(lx - ex), Lt = (L1 + L2) * k;
    const gx = gap ? (ex - p.x) / Math.max(L1, 1e-3) * gap : 0, gy = gap ? (ey - p.y) / Math.max(L1, 1e-3) * gap : 0;
    let pts = `${p.x + gx},${p.y + gy} `;
    if (Lt <= L1) { const u = Math.max(Lt, gap) / Math.max(L1, 1e-3); pts += `${p.x + (ex - p.x) * u},${p.y + (ey - p.y) * u}`; }   // 从留空处开始往外画
    else pts += `${ex},${ey} ${ex + (lx - ex) * (Lt - L1) / Math.max(L2, 1e-3)},${ey}`;
    line.setAttribute('points', pts);
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    ring.setAttribute('cx', p.x); ring.setAttribute('cy', p.y);
    ring.setAttribute('r', 7 + 10 * (1 - E.p3o(clamp((T - t0) / 0.5))));
    for (const e of [dot, ring, line]) e.style.opacity = v;
    const tp = clamp((T - t0 - 0.25) / 0.6);
    iEl.textContent = idx ? scrambled(idx, tp, T, 3) : '';
    tEl.textContent = scrambled(title, tp, T, 5);
    sEl.textContent = sub ? scrambled(sub, clamp((T - t0 - 0.4) / 0.7), T, 9) : '';
    box.style.opacity = v;
    box.style.transform = `translate(${left ? lx - 8 : lx + 8}px, ${ly}px) translate(${left ? '-100%' : '0'}, -50%)`;
    box.style.textAlign = left ? 'right' : 'left';
  } });
}

// 取景角标：四个 L 形角，框住一个屏幕矩形（或世界坐标盒子投影后的范围）
export function bracket({ t0, t1, box, arm = 18, color = 'rgba(244,239,232,.8)' }) {
  t0 = I(t0); t1 = I(t1); box = wrapT(box);
  const ps = [0, 1, 2, 3].map(() => svgEl('polyline', { fill: 'none', stroke: color, 'stroke-width': 1.2 }));
  ITEMS.push({ update(T) {
    const on = T >= t0 - 0.01 && T < t1;
    for (const e of ps) e.style.display = on ? '' : 'none';
    if (!on) return;
    const [x, y, w, hh] = typeof box === 'function' ? box(T) : box;
    const k = E.p3o(clamp((T - t0) / 0.5));
    const cx = x + w / 2, cy = y + hh / 2;
    const bx = cx - (w / 2) * (0.6 + 0.4 * k), by = cy - (hh / 2) * (0.6 + 0.4 * k), bw = w * (0.6 + 0.4 * k), bh = hh * (0.6 + 0.4 * k);
    const c = [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]];
    c.forEach(([px, py, sx, sy], n) => {
      ps[n].setAttribute('points', `${px + sx * arm},${py} ${px},${py} ${px},${py + sy * arm}`);
      ps[n].style.opacity = vis(T, t0, t1);
    });
  } });
}

// 读数：小标签 + 数值（数值由函数给出）
export function readout({ t0, t1, x, y, label, value, align = 'left', size = 30 }) {
  t0 = I(t0); t1 = I(t1); value = wrapT(value);
  const box = h('div', { class: 'ro' });
  const lb = h('div', { class: 'ro-l' }); const vl = h('div', { class: 'ro-v' });
  vl.style.fontSize = `${size}px`;
  box.append(lb, vl);
  root.appendChild(box);
  Object.assign(box.style, { left: `${x}px`, top: `${y}px`, textAlign: align, transform: align === 'right' ? 'translateX(-100%)' : '' });
  ITEMS.push({ update(T) {
    const on = T >= t0 - 0.01 && T < t1;
    box.style.display = on ? '' : 'none';
    if (!on) return;
    box.style.opacity = vis(T, t0, t1);
    lb.textContent = scrambled(label, clamp((T - t0) / 0.5), T, 11);
    vl.textContent = value(T);
  } });
}

// 章节标记（左上角）：编号 + 细线 + 标题 + 年代
export function chapter({ t0, t1, num, title, sub }) {
  t0 = I(t0); t1 = I(t1);
  const box = h('div', { class: 'chap' });
  const n = h('span', { class: 'chap-n' }); const ln = h('span', { class: 'chap-l' }); const t = h('span', { class: 'chap-t' }); const s = h('span', { class: 'chap-s' });
  box.append(n, ln, t, s);
  root.appendChild(box);
  ITEMS.push({ update(T) {
    const on = T >= t0 - 0.01 && T < t1;
    box.style.display = on ? '' : 'none';
    if (!on) return;
    box.style.opacity = vis(T, t0, t1, 0.4, 0.6);
    const p = clamp((T - t0) / 0.8);
    n.textContent = scrambled(num, p, T, 21);
    ln.style.width = `${60 * E.p3o(clamp((T - t0 - 0.1) / 0.6))}px`;
    t.textContent = scrambled(title, clamp((T - t0 - 0.2) / 0.8), T, 23);
    s.textContent = scrambled(sub, clamp((T - t0 - 0.35) / 0.8), T, 25);
  } });
}

// 纯文字标签（固定在屏幕或世界坐标上）
// zone：屏幕像素矩形 [x0, y0, x1, y1]，标签碰到它就淡出（边缘 40 px 过渡）——例如大标题要出现的地方，背后的小字别先在那里出现
export function tag({ t0, t1, at, text, cls = '', dx = 0, dy = 0, center = true, scramble = true, fin = 0.35, occlude = false, zone = null }) {
  t0 = I(t0); t1 = I(t1); at = wrapT(at); text = wrapT(text);
  const el = h('div', { class: `tg ${cls}` });
  root.appendChild(el);
  ITEMS.push({ update(T) {
    const on = T >= t0 - 0.01 && T < t1;
    el.style.display = on ? '' : 'none';
    if (!on) return;
    const p = where(at, T);
    if (offscreen(p)) { el.style.display = 'none'; return; }
    el.style.opacity = vis(T, t0, t1, fin);
    const tx = typeof text === 'function' ? text(T) : text;
    el.textContent = scramble ? scrambled(tx, clamp((T - t0) / 0.6), T, 31) : tx;
    el.style.transform = `translate(${p.x + dx}px, ${p.y + dy}px) translate(${center === 'right' ? '-100%' : center ? '-50%' : '0'}, -50%)`;
    if ((occlude && OCCL.length) || zone) {
      let k = vis(T, t0, t1, fin);
      if (occlude && OCCL.length) k *= occluded(el);
      if (zone) {
        const w = el.offsetWidth, hh = el.offsetHeight, x = p.x + dx, y = p.y + dy;
        const L = center === 'right' ? x - w : center ? x - w / 2 : x;
        const gx = Math.max(zone[0] - (L + w), L - zone[2], 0), gy = Math.max(zone[1] - (y + hh / 2), y - hh / 2 - zone[3], 0);
        k *= smooth(clamp(Math.hypot(gx, gy) / 40));
      }
      el.style.opacity = k.toFixed(3);
    }
  } });
  return el;
}

// 世界坐标里的一段 SVG 折线（坐标轴、刻度、分隔线等 2D 细线），pts(T) 返回世界坐标点列
export function wline({ t0, t1, pts, color = 'rgba(244,239,232,.5)', width = 1, dash = '' }) {
  t0 = I(t0); t1 = I(t1); pts = wrapT(pts);
  const pl = svgEl('polyline', { fill: 'none', stroke: color, 'stroke-width': width });
  if (dash) pl.setAttribute('stroke-dasharray', dash);
  ITEMS.push({ update(T) {
    const on = T >= t0 - 0.01 && T < t1;
    pl.style.display = on ? '' : 'none';
    if (!on) return;
    const ps = pts(T).map((q) => (q.length === 2 ? { x: q[0], y: q[1] } : project(q[0], q[1], q[2])));
    pl.setAttribute('points', ps.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
    pl.style.opacity = vis(T, t0, t1, 0.5, 0.4);
  } });
  return pl;
}

// 条形读数：一组 [标签, 数值(0~1), 右侧文字, 是否强调]，条宽从 0 生长
// center：x 是整块的中线（默认 x 是左边）；nameW：名字列统一宽度，各行的条从同一个 x 开始、数值也对齐成一列
export function bars({ t0, t1, x, y, items, w = 360, row = 46, label = '', stagger = 0.12, center = false, nameW = 0 }) {
  t0 = I(t0); t1 = I(t1);
  const box = h('div', { class: 'bars' });
  Object.assign(box.style, { left: `${x}px`, top: `${y}px` });
  if (center) box.style.transform = 'translateX(-50%)';
  if (label) box.append(h('div', { class: 'bars-h' }, label));
  const rows = items.map(([name, v, txt, acc]) => {
    const r = h('div', { class: 'bars-r' });
    const n = h('span', { class: 'bars-n' }, name);
    if (nameW) n.style.minWidth = `${nameW}px`;
    const track = h('span', { class: 'bars-t' }); const fill = h('span', { class: 'bars-f' + (acc ? ' acc' : '') });
    track.style.width = `${w}px`; track.append(fill);
    const tv = h('span', { class: 'bars-v' + (acc ? ' acc' : '') }, txt);
    r.style.height = `${row}px`;
    r.append(n, track, tv);
    box.append(r);
    return { fill, v, tv };
  });
  root.appendChild(box);
  ITEMS.push({ update(T) {
    const on = T >= t0 - 0.01 && T < t1;
    box.style.display = on ? '' : 'none';
    if (!on) return;
    box.style.opacity = vis(T, t0, t1);
    rows.forEach((r, k) => {
      const p = E.p3o(clamp((T - t0 - 0.15 - k * stagger) / 0.7));
      r.fill.style.width = `${(r.v * 100 * p).toFixed(2)}%`;
      r.tv.style.opacity = clamp((T - t0 - 0.4 - k * stagger) / 0.3);
    });
  } });
}
