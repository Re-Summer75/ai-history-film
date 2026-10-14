// 质检：导出画面上的"事件"（闪白、震屏、冲击环、形态段切换、镜头冲刺）和音效提示点，供 Python 对照音画是否同步
export async function qaSync() {
  const F = await import('./web2/js/film.js');
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    flash: F.FLASH.map(([t, a]) => [r3(t), r3(a)]),
    shake: F.SHAKE.map(([t, a]) => [r3(t), r3(a)]),
    rings: F.RINGS.map((r) => [r3(r.t), r.n, r3(r.R1)]),
    segs: F.SEGS.map((s) => [r3(s.t), s.tr ? s.tr.type : '', s.tr ? r3(s.tr.dur) : 0]),
    cam: F.CAMK.map((k) => [r3(k.t), k.ease ? 1 : 0]),
    cues: window.getCues().map((c) => [r3(c.t), c.type, c.gain ?? null, c.dur ?? null, c.size ?? null]),
  };
}
