// 2012 的卷积网络（第 2 幕开场穿过的那一叠特征图）。第 1 幕末尾的深层网络要在 2012 重击时"原地展开"成这些层，
// 所以两幕共用同一份层定义和粒子编号：每个格子 2 个粒子，第 k 层占用粒子编号 CRANGE[k] = [起, 止)。
export const LAYERS = [
  { n: 40, w: 36, c: 1, z: 0 }, { n: 32, w: 32, c: 3, z: -24 }, { n: 24, w: 28, c: 4, z: -48 }, { n: 18, w: 24, c: 5, z: -72 },
  { n: 12, w: 19, c: 6, z: -96 }, { n: 8, w: 14, c: 6, z: -120 }, { n: 5, w: 16, c: 1, z: -146, row: true },
];
export const CELLS = [];
export const CRANGE = [];
for (let k = 0; k < LAYERS.length; k++) {
  const Ly = LAYERS[k], c0 = CELLS.length;
  for (let ch = 0; ch < Ly.c; ch++) for (let iy = 0; iy < (Ly.row ? 1 : Ly.n); iy++) for (let ix = 0; ix < Ly.n; ix++) {
    const s = Ly.w / Math.max(1, Ly.n - 1);
    CELLS.push({ k, ch, ix, iy, x: -Ly.w / 2 + ix * s, y: Ly.row ? 0 : Ly.w / 2 - iy * s, z: Ly.z - ch * 1.4 });
  }
  CRANGE.push([2 * c0, 2 * CELLS.length]);
}
export const NCNN = 2 * CELLS.length;                // 卷积网络用到的粒子数（其余的粒子在 2012 这段里不显示）
