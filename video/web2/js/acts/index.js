// 整片：按顺序登记各幕（每一幕照旧用自己原来的时间写），再按各幕的时间映射换算成成片时间，然后构建时间线
import { build, markReg, warpSince, ACT } from '../film.js';
import { setSceneWarp } from '../../../web/js/engine.js';
import { setHudWarp } from '../hud.js';
import { makeWarp } from '../warp.js';
import { a0 } from './a0_now.js';
import { a1 } from './a1_question.js';
import { a2 } from './a2_ignite.js';
import { a3 } from './a3_boom.js';
import { a4 } from './a4_race.js';
import { a5 } from './a5_agents.js';
import { a6, A6_END } from './a6_now.js';

// 各幕的"停留窗口"（本幕原来的时间 [a, b, 加长秒数]）：只加在内容出完、需要观众看清的地方。
// 每一幕加长的总量取整小节（2 s 的倍数），后面各幕整体后移，配乐的小节线才对得上。
export const HOLDS = [
  [[4.45, 11.1, 2.0]],                           // 0 此刻：AI 工作的每一步多停一会儿（重击仍落在 14.0 的小节首拍）
  [[40.3, 41.8, 1.0], [44.2, 45.2, 1.0],         // 1 一个问题：模仿游戏的两句问话
   [61.95, 63.1, 1.0],                           //   感知机"全部分对"
   [70.6, 72.1, 1.0]],                           //   ELIZA"它并不理解你"
  [[113.3, 113.7, 1.0], [122.0, 123.3, 0.5],     // 2 点燃：深蓝、第 37 手
   [134.2, 135.9, 0.5],                          //   注意力
   [150.75, 151.95, 0.5], [152.85, 153.95, 0.5], [155.3, 155.85, 1.0], [157.25, 158.0, 2.0],   //   规模：每一级数字、16 个 GPT-3
   [159.75, 160.5, 1.5],                         //   规模定律
   [162.95, 163.3, 1.0], [164.55, 165.05, 2.5], [167.1, 167.8, 1.0]],   //   RLHF：之前 / 排名 / 之后
  [[179.75, 181.05, 2.0],                        // 3 爆发：为什么火
   [193.4, 194.3, 1.0], [194.4, 196.1, 1.5], [197.55, 197.95, 3.5]],   //   算力：标题、数据点、换算
  [[261.3, 263.0, 2.0]],                         // 4 竞赛：两张成绩卡片
  [[269.6, 271.2, 1.0],                          // 5 智能体：循环（转速按成片时间算，不受影响）
   [272.35, 275.5, 1.0], [275.65, 275.95, 1.0],  //   操作电脑
   [278.3, 279.7, 1.0]],                         //   MCP
  [],                                            // 6 现在（本幕按新的节奏重写）
];
// 加长量都是半拍（0.5 s）的整数倍，每一幕的总量是整小节：画面上的重音仍然落在 120 BPM 的拍点上
export const WARPS = [];
{
  let ofs = 0;
  for (const H of HOLDS) { const W = makeWarp(ofs, H); WARPS.push(W); ofs += W.total; }
}
window.__warps = WARPS;

function run(fn, W) {
  const m = markReg();
  setSceneWarp(W); setHudWarp(W); ACT.W = W;
  fn();
  warpSince(m, W);
  setSceneWarp(null); setHudWarp(null); ACT.W = null;
}

export function buildFilm() {
  [a0, a1, a2, a3, a4, a5, a6].forEach((f, k) => run(f, WARPS[k]));
  build();
  return WARPS[6].inv(A6_END);
}
