import { renderFrame, cues, FPS, TEXTS } from '../../web/js/engine.js';

const q = new URLSearchParams(location.search);
const CUT = q.get('cut') || 'film';          // film = 整片；teaser = 38 秒风格样片

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '·—–→←…「」“”‘’、，。：；！？（）';
async function loadFonts(text) {
  const fams = [['Noto Sans SC', [200, 300, 400, 500, 600, 700]], ['Inter', [200, 300, 400, 600, 700, 800]], ['JetBrains Mono', [300, 400, 500]]];
  await Promise.all(fams.flatMap(([f, ws]) => ws.map((w) => document.fonts.load(`${w} 40px "${f}"`, text))));
  await document.fonts.ready;
}

await loadFonts(ASCII + '把这个项目重构一下，补全测试，然后提交。▍✓');
let DUR = 38;
try {
  if (CUT === 'teaser') { const m = await import('./teaser.js'); m.build(); DUR = m.DUR; }
  else { const m = await import('./acts/index.js'); DUR = m.buildFilm(); }
} catch (e) {
  console.error(`[build] ${e && e.stack ? e.stack : e}`);
  window.__buildError = String(e && e.stack ? e.stack : e);
}
await loadFonts(ASCII + [...TEXTS].join('') + document.getElementById('scenes').textContent);
await renderFrame(0);

window.renderFrame = renderFrame;
window.getCues = () => cues;
window.titleReport = async () => (await import('./kit.js')).titleReport();
window.qaText = async (...a) => (await import('../../qa_text.js')).qaText(...a);
window.qaSync = async () => (await import('../../qa_sync.js')).qaSync();   // 质检：文字重叠 / 出画 / 一闪而过
window.DURATION = DUR;
window.ready = true;

// 开发预览：?dev=1 显示播放/拖动条，?t=秒 跳到指定时间
if (q.has('dev')) {
  const bar = document.getElementById('dev');
  bar.hidden = false;
  const scrub = document.getElementById('scrub'), tc = document.getElementById('tc'), play = document.getElementById('play');
  scrub.max = DUR;
  const stage = document.getElementById('stage');
  const fit = () => { const k = Math.min(innerWidth / 1920, (innerHeight - 40) / 1080); stage.style.transform = `scale(${k})`; stage.style.transformOrigin = '0 0'; };
  fit(); addEventListener('resize', fit);
  let t = +(q.get('t') || 0), playing = false, last = 0;
  const go = async (x) => { t = Math.min(DUR, Math.max(0, x)); scrub.value = t; tc.textContent = t.toFixed(2); await renderFrame(Math.round(t * FPS)); };
  scrub.oninput = () => go(+scrub.value);
  play.onclick = () => { playing = !playing; play.textContent = playing ? '❚❚' : '▶'; last = performance.now(); if (playing) loop(); };
  const loop = async () => { if (!playing) return; const now = performance.now(); await go(t + (now - last) / 1000); last = now; requestAnimationFrame(loop); };
  go(t);
}
