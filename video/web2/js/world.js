// 光粒子世界：一个共享的 3D 场景贯穿全片（一镜到底）。
// 管线：粒子（景深 + 加色混合）+ 线段 + 字符粒子 → 高质量辉光 → 合成（径向模糊、色散、曝光）→ 色调映射输出
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setGLRenderer } from '../../web/js/engine.js';

export { THREE };
export const W = 1920, H = 1080, PR = 1.5;

export const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(PR);
renderer.setSize(W, H, false);
renderer.setClearColor(0x020203, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

export const world = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 5000);

const QUAD_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// ---------------------------------------------------------------- 高质量辉光
// 普通辉光显得廉价，是因为扩散范围失控：宽的模糊层和窄的一样亮，整幅画面蒙上一层灰雾。
// 这里的做法（参考 CoD: AW / Unity 的物理辉光）：
//   1) 软阈值（二次膝部）只取真正的高光（在降采样之前逐点做，细小亮点不被平均掉），并钳制极亮的单点；
//   2) 13 点滤波逐级降采样到 1/64；
//   3) 逐级升采样累加，但每往"更宽"走一级，权重乘 spread（< 1）。
// 于是光晕 = 紧致明亮的核心 + 按指数衰减的很淡的外圈，接近真实镜头的点扩散函数。spread 就是"扩散范围"旋钮。
const DOWN13 = /* glsl */`
  vec3 down13(sampler2D tex, vec2 uv, vec2 t, bool karis) {
    vec3 a = texture2D(tex, uv + t * vec2(-2.0,  2.0)).rgb, b = texture2D(tex, uv + t * vec2(0.0,  2.0)).rgb, c = texture2D(tex, uv + t * vec2(2.0,  2.0)).rgb;
    vec3 d = texture2D(tex, uv + t * vec2(-2.0,  0.0)).rgb, e = texture2D(tex, uv).rgb,                        f = texture2D(tex, uv + t * vec2(2.0,  0.0)).rgb;
    vec3 g = texture2D(tex, uv + t * vec2(-2.0, -2.0)).rgb, h = texture2D(tex, uv + t * vec2(0.0, -2.0)).rgb, i = texture2D(tex, uv + t * vec2(2.0, -2.0)).rgb;
    vec3 j = texture2D(tex, uv + t * vec2(-1.0,  1.0)).rgb, k = texture2D(tex, uv + t * vec2(1.0,  1.0)).rgb;
    vec3 l = texture2D(tex, uv + t * vec2(-1.0, -1.0)).rgb, m = texture2D(tex, uv + t * vec2(1.0, -1.0)).rgb;
    vec3 g0 = (j + k + l + m) * 0.25, g1 = (a + b + d + e) * 0.25, g2 = (b + c + e + f) * 0.25, g3 = (d + e + g + h) * 0.25, g4 = (e + f + h + i) * 0.25;
    if (!karis) return g0 * 0.5 + (g1 + g2 + g3 + g4) * 0.125;
    vec3 L = vec3(0.2126, 0.7152, 0.0722);
    float w0 = 0.5 / (1.0 + dot(g0, L)), w1 = 0.125 / (1.0 + dot(g1, L)), w2 = 0.125 / (1.0 + dot(g2, L)), w3 = 0.125 / (1.0 + dot(g3, L)), w4 = 0.125 / (1.0 + dot(g4, L));
    return (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  }`;

class HQBloomPass extends Pass {
  constructor(w, h, levels = 6) {
    super();
    this.needsSwap = false;
    this.levels = levels;
    this.threshold = 0.45; this.knee = 0.4; this.clampMax = 16.0; this.spread = 0.5;
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.down = []; this.up = [];
    let mw = Math.round(w / 2), mh = Math.round(h / 2);
    for (let k = 0; k < levels; k++) {
      this.down.push(new THREE.WebGLRenderTarget(mw, mh, opt));
      if (k < levels - 1) this.up.push(new THREE.WebGLRenderTarget(mw, mh, opt));
      mw = Math.max(2, Math.round(mw / 2)); mh = Math.max(2, Math.round(mh / 2));
    }
    this.mPre = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 }, uKnee: { value: 0 }, uClamp: { value: 0 } },
      vertexShader: QUAD_VS,
      // 阈值在"降采样之前"对每个采样点单独做：细小的亮粒子不会被周围的黑色平均掉，暗的尘埃也不会被抬成一层雾
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee; uniform float uClamp; varying vec2 vUv;
        vec3 bright(vec2 uv) {
          vec3 c = texture2D(tSrc, uv).rgb;
          float br = max(c.r, max(c.g, c.b));
          float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
          rq = rq * rq / (4.0 * uKnee + 1e-4);
          c *= max(rq, br - uThreshold) / max(br, 1e-4);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          return l > uClamp ? c * (uClamp / l) : c;
        }
        void main() {
          vec2 t = uTexel, uv = vUv;
          vec3 a = bright(uv + t * vec2(-2.0,  2.0)), b = bright(uv + t * vec2(0.0,  2.0)), c = bright(uv + t * vec2(2.0,  2.0));
          vec3 d = bright(uv + t * vec2(-2.0,  0.0)), e = bright(uv),                        f = bright(uv + t * vec2(2.0,  0.0));
          vec3 g = bright(uv + t * vec2(-2.0, -2.0)), h = bright(uv + t * vec2(0.0, -2.0)), i = bright(uv + t * vec2(2.0, -2.0));
          vec3 j = bright(uv + t * vec2(-1.0,  1.0)), k = bright(uv + t * vec2(1.0,  1.0));
          vec3 l = bright(uv + t * vec2(-1.0, -1.0)), m = bright(uv + t * vec2(1.0, -1.0));
          vec3 g0 = (j + k + l + m) * 0.25, g1 = (a + b + d + e) * 0.25, g2 = (b + c + e + f) * 0.25, g3 = (d + e + g + h) * 0.25, g4 = (e + f + h + i) * 0.25;
          gl_FragColor = vec4(g0 * 0.5 + (g1 + g2 + g3 + g4) * 0.125, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.mDown = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv; ${DOWN13}
        void main() { gl_FragColor = vec4(down13(tSrc, vUv, uTexel, false), 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.mUp = new THREE.ShaderMaterial({
      uniforms: { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 0.5 } },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTexel; uniform float uSpread; varying vec2 vUv;
        void main() {
          vec2 t = uTexel;
          vec3 s = texture2D(tLow, vUv + t * vec2(-1.0, -1.0)).rgb + 2.0 * texture2D(tLow, vUv + t * vec2(0.0, -1.0)).rgb + texture2D(tLow, vUv + t * vec2(1.0, -1.0)).rgb
                 + 2.0 * texture2D(tLow, vUv + t * vec2(-1.0, 0.0)).rgb + 4.0 * texture2D(tLow, vUv).rgb + 2.0 * texture2D(tLow, vUv + t * vec2(1.0, 0.0)).rgb
                 + texture2D(tLow, vUv + t * vec2(-1.0, 1.0)).rgb + 2.0 * texture2D(tLow, vUv + t * vec2(0.0, 1.0)).rgb + texture2D(tLow, vUv + t * vec2(1.0, 1.0)).rgb;
          gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + uSpread * s / 16.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(null);
  }
  get texture() { return this.levels > 1 ? this.up[0].texture : this.down[0].texture; }
  get norm() { let s = 0, w = 1; for (let k = 0; k < this.levels; k++) { s += w; w *= this.spread; } return s; }
  setSize() {}
  render(renderer, writeBuffer, readBuffer) {
    const q = this.quad;
    const texel = (rt) => new THREE.Vector2(1 / rt.width, 1 / rt.height);
    q.material = this.mPre;
    Object.assign(this.mPre.uniforms, {});
    this.mPre.uniforms.tSrc.value = readBuffer.texture;
    this.mPre.uniforms.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    this.mPre.uniforms.uThreshold.value = this.threshold;
    this.mPre.uniforms.uKnee.value = this.knee;
    this.mPre.uniforms.uClamp.value = this.clampMax;
    renderer.setRenderTarget(this.down[0]); q.render(renderer);
    q.material = this.mDown;
    for (let k = 1; k < this.levels; k++) {
      this.mDown.uniforms.tSrc.value = this.down[k - 1].texture;
      this.mDown.uniforms.uTexel.value.copy(texel(this.down[k - 1]));
      renderer.setRenderTarget(this.down[k]); q.render(renderer);
    }
    q.material = this.mUp;
    this.mUp.uniforms.uSpread.value = this.spread;
    for (let k = this.levels - 2; k >= 0; k--) {
      const low = k === this.levels - 2 ? this.down[k + 1] : this.up[k + 1];
      this.mUp.uniforms.tLow.value = low.texture;
      this.mUp.uniforms.tHigh.value = this.down[k].texture;
      this.mUp.uniforms.uTexel.value.copy(texel(low));
      renderer.setRenderTarget(this.up[k]); q.render(renderer);
    }
  }
}

const rt = new THREE.WebGLRenderTarget(W * PR, H * PR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(PR);
composer.setSize(W, H);
composer.addPass(new RenderPass(world, camera));
export const bloom = new HQBloomPass(W * PR, H * PR, 6);
bloom.strength = 2.2;
composer.addPass(bloom);

// 合成：场景 + 辉光，再做径向（变焦）模糊、色散、曝光（线性 HDR 空间），最后给文字所在区域压暗
export const NBOX = 16;
export const fx = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, uBloom: { value: 1 }, uZoom: { value: 0 }, uCA: { value: 0.0 },
              uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uExposure: { value: 1 }, uAspect: { value: W / H }, uCABase: { value: 0.0042 },
              uBox: { value: Array.from({ length: NBOX }, () => new THREE.Vector4()) }, uBoxK: { value: new Float32Array(NBOX) }, uNBox: { value: 0 } },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float uBloom; uniform float uZoom; uniform float uCA; uniform vec2 uCenter;
    uniform float uExposure; uniform float uAspect; uniform float uCABase;
    uniform vec4 uBox[${NBOX}]; uniform float uBoxK[${NBOX}]; uniform float uNBox;
    varying vec2 vUv;
    // 文字保护：字幕、标注所在的矩形（像素，中心 + 半宽高）下面的画面压暗，边缘 90 px 柔和过渡
    float protect(vec2 px) {
      float m = 0.0;
      for (int k = 0; k < ${NBOX}; k++) {
        if (float(k) >= uNBox) break;
        vec4 b = uBox[k];
        vec2 q = abs(px - b.xy) - b.zw;
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        m = max(m, (1.0 - smoothstep(-10.0, 130.0, d)) * uBoxK[k]);
      }
      return m;
    }
    vec3 col(vec2 uv) { return texture2D(tDiffuse, uv).rgb + uBloom * texture2D(tBloom, uv).rgb; }
    vec3 tap(vec2 uv, float ca) {
      vec2 d = uv - uCenter;
      return vec3(col(uCenter + d * (1.0 + ca)).r, col(uv).g, col(uCenter + d * (1.0 - ca)).b);
    }
    void main() {
      vec2 d = vUv - uCenter;
      float r = length(d * vec2(uAspect, 1.0));
      // 色散：全片有一层很轻的底（按半径平方增长：中心锐利，越往边缘红蓝越分开，像真实镜头），冲击时再叠加
      float ca = uCA * r + uCABase * r * r;
      vec3 c;
      if (uZoom < 0.0005) {
        c = ca < 1e-5 ? col(vUv) : tap(vUv, ca);
      } else {
        vec3 acc = vec3(0.0); float ws = 0.0;
        for (int k = 0; k < 24; k++) {
          float f = float(k) / 23.0;
          float w = 1.0 - 0.6 * f;
          acc += tap(uCenter + d * (1.0 - uZoom * f * r * 1.6), ca) * w;
          ws += w;
        }
        c = acc / ws;
      }
      // 只压亮处：暗背景几乎不变（不会显出一个"框"），亮粒子被压到文字下面
      if (uNBox > 0.5) { float m = protect(vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0)); float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c *= 1.0 / (1.0 + 5.0 * m * max(l - 0.015, 0.0)); }
      gl_FragColor = vec4(c * uExposure, 1.0);
    }`,
});
composer.addPass(fx);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- 景深粒子
// size：世界单位的直径；uPx：深度 1 处每世界单位对应的像素数（随视场角变化）
// 弥散圆按薄透镜近似：coc ∝ 光圈 × |1 − 对焦距离/深度|；离焦后能量守恒地摊薄
const PVS = /* glsl */`
  attribute float size; attribute float alpha; attribute vec3 color;
  uniform float uPR; uniform float uPx; uniform float uFocus; uniform float uAperture; uniform float uGain; uniform float uMaxPx;
  varying vec3 vColor; varying float vAlpha; varying float vBokeh;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = -mv.z;
    if (depth < 0.2 || alpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
    float base = size * uPx / depth;
    float coc = uAperture * abs(1.0 - uFocus / depth) * 1080.0;
    float s = sqrt(base * base + coc * coc);
    float a = alpha * (base * base) / max(s * s, 1e-6);
    if (s < 1.3) { a *= s * s / 1.69; s = 1.3; }
    if (s > uMaxPx) { a *= min((s * s) / (uMaxPx * uMaxPx), 4.0); s = uMaxPx; }   // 截到最大尺寸时补亮度最多 4 倍（原来不设上限：贴着镜头飞过的粒子会亮几十倍，闪一帧）
    a *= smoothstep(1.0, 3.5, depth);                                            // 离镜头 3.5 以内的粒子淡出
    gl_PointSize = s * uPR;
    vAlpha = a * uGain;
    vBokeh = clamp(coc / max(s, 1e-3) * 1.2 - 0.25, 0.0, 1.0) * step(6.0, s);
    vColor = color;
    gl_Position = projectionMatrix * mv;
  }`;
const PFS = /* glsl */`
  varying vec3 vColor; varying float vAlpha; varying float vBokeh;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float g = exp(-d * d * 5.0) * 1.3;
    float disk = (1.0 - smoothstep(0.62, 1.0, d)) * (0.8 + 0.2 * d * d) * 0.4;
    float a = mix(g, disk, vBokeh) * vAlpha;
    if (a < 0.0008) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
  }`;

function dynAttr(arr, k) { const a = new THREE.BufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); return a; }

export class Particles {
  constructor(n) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', dynAttr(this.pos, 3));
    g.setAttribute('color', dynAttr(this.col, 3));
    g.setAttribute('size', dynAttr(this.size, 1));
    g.setAttribute('alpha', dynAttr(this.alpha, 1));
    this.u = { uPR: { value: PR }, uPx: { value: 1158 }, uFocus: { value: 60 }, uAperture: { value: 0.01 }, uGain: { value: 1.25 }, uMaxPx: { value: 90 } };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: PVS, fragmentShader: PFS, transparent: true,
      depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.geo = g;
    world.add(this.points);
  }
  commit() { for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true; }
}

// ---------------------------------------------------------------- 线段（拖尾、网络连线、网格、弧线……）
export class Lines {
  constructor(cap) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 6);
    this.col = new Float32Array(cap * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', dynAttr(this.pos, 3));
    g.setAttribute('color', dynAttr(this.col, 3));
    this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.lines.frustumCulled = false;
    world.add(this.lines);
    this.count = 0;
  }
  begin() { this.count = 0; }
  // 两端各自的颜色（已乘亮度）
  seg(x1, y1, z1, r1, g1, b1, x2, y2, z2, r2, g2, b2) {
    if (this.count >= this.cap) return;
    const i = this.count++ * 6;
    const p = this.pos, c = this.col;
    p[i] = x1; p[i + 1] = y1; p[i + 2] = z1; p[i + 3] = x2; p[i + 4] = y2; p[i + 5] = z2;
    c[i] = r1; c[i + 1] = g1; c[i + 2] = b1; c[i + 3] = r2; c[i + 4] = g2; c[i + 5] = b2;
  }
  // 头亮尾黑的拖尾
  streak(x, y, z, tx, ty, tz, r, g, b) { this.seg(x, y, z, r, g, b, tx, ty, tz, 0, 0, 0); }
  commit() {
    this.geo.setDrawRange(0, this.count * 2);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- 字符粒子（代码、提示词：每个粒子是一个发光的字）
// 字形图集 32×32 格、每格 64 px（最多 1024 个字）；离焦时用 mipmap 偏移做模糊，所以格子留了足够的边距
const GVS = /* glsl */`
  attribute float size; attribute float alpha; attribute vec3 color; attribute float glyph;
  uniform float uPR; uniform float uPx; uniform float uFocus; uniform float uAperture; uniform float uGain;
  varying vec3 vColor; varying float vAlpha; varying float vBias; varying vec2 vCell;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = -mv.z;
    if (depth < 0.2 || alpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
    float base = size * uPx / depth;
    float coc = uAperture * abs(1.0 - uFocus / depth) * 1080.0;
    float s = base + 0.6 * coc;
    gl_PointSize = min(s, 220.0) * uPR;
    vAlpha = alpha * uGain * (base * base) / max(s * s, 1e-6) * smoothstep(2.0, 5.0, base);
    vBias = log2(1.0 + coc / max(base, 0.5)) * 1.6;
    vColor = color;
    vCell = vec2(mod(glyph, 32.0), floor(glyph / 32.0));
    gl_Position = projectionMatrix * mv;
  }`;
const GFS = /* glsl */`
  uniform sampler2D uAtlas;
  varying vec3 vColor; varying float vAlpha; varying float vBias; varying vec2 vCell;
  void main() {
    vec2 pc = gl_PointCoord;
    vec2 uv = vec2((vCell.x + pc.x) / 32.0, 1.0 - (vCell.y + pc.y) / 32.0);
    float a = texture2D(uAtlas, uv, vBias).r * vAlpha;
    if (a < 0.002) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
  }`;

export class Glyphs {
  constructor(n, chars) {
    this.n = n;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 2048;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2048, 2048);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    this.index = new Map();
    if ([...chars].length > 1024) console.warn(`[glyphs] 字形数 ${[...chars].length} 超过图集容量 1024`);
    [...chars].slice(0, 1024).forEach((ch, k) => {
      const cjk = ch.charCodeAt(0) > 0x2e80;
      ctx.font = cjk ? '400 40px "Noto Sans SC"' : '500 40px "JetBrains Mono", "Segoe UI Symbol"';
      ctx.fillText(ch, (k % 32) * 64 + 32, Math.floor(k / 32) * 64 + 34);
      this.index.set(ch, k);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.glyph = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', dynAttr(this.pos, 3));
    g.setAttribute('color', dynAttr(this.col, 3));
    g.setAttribute('size', dynAttr(this.size, 1));
    g.setAttribute('alpha', dynAttr(this.alpha, 1));
    g.setAttribute('glyph', dynAttr(this.glyph, 1));
    this.u = { uPR: { value: PR }, uPx: { value: 1158 }, uFocus: { value: 60 }, uAperture: { value: 0.0 }, uGain: { value: 1.0 }, uAtlas: { value: tex } };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: GVS, fragmentShader: GFS, transparent: true,
      depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.geo = g;
    world.add(this.points);
  }
  id(ch) { return this.index.has(ch) ? this.index.get(ch) : 0; }
  commit() { for (const k of ['position', 'color', 'size', 'alpha', 'glyph']) this.geo.attributes[k].needsUpdate = true; }
}

// 深度 1 处每世界单位的像素数（竖直方向）
export const pxPerUnit = () => H / (2 * Math.tan((camera.fov * Math.PI) / 360));

// 世界坐标 → 屏幕像素（1920×1080 舞台坐标）；在相机后方时 z < 0
const _v = new THREE.Vector3();
export function project(x, y, z) {
  _v.set(x, y, z).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, z: _v.z < 1 ? 1 : -1 };
}

// ---------------------------------------------------------------- 帧循环
const updates = [];
export function onFrame(fn) { updates.push(fn); }
setGLRenderer((T) => {
  for (const fn of updates) fn(T);
  fx.uniforms.tBloom.value = bloom.texture;
  fx.uniforms.uBloom.value = bloom.strength / bloom.norm;
  composer.render();
});
