# 第三方组件

这些文件随仓库一起分发，各自保留原来的许可：

| 组件 | 版本 | 文件 | 许可 |
|---|---|---|---|
| three.js | 0.186.1 | `video/web/vendor/three.module.min.js`、`three.core.js`、`addons/postprocessing/*`、`addons/shaders/*` | MIT，Copyright © 2010–2026 three.js authors（https://threejs.org） |
| GSAP（gsap、CustomEase、SplitText、DrawSVGPlugin） | 3.15.0 | `video/web/vendor/*.min.js` | GSAP 标准免费许可（Standard "No Charge" GSAP License，许可方 Webflow），条款见 https://gsap.com/standard-license；文件头里 GreenSock 的版权声明原样保留 |
| Inter | 4.001 | `video/web/fonts/Inter.ttf` | SIL Open Font License 1.1，Copyright 2016 The Inter Project Authors |
| JetBrains Mono | 2.211 | `video/web/fonts/JetBrainsMono.ttf` | SIL Open Font License 1.1，Copyright 2020 The JetBrains Mono Project Authors |
| Noto Sans SC | 2.004 | `video/web/fonts/NotoSansSC.ttf` | SIL Open Font License 1.1，(c) 2014-2021 Adobe, with Reserved Font Name 'Source' |

三款字体的许可证全文见 [licenses/OFL-1.1.txt](licenses/OFL-1.1.txt)。

运行时通过 pip 安装、不随仓库分发的依赖：numpy、scipy、soundfile、matplotlib、Pillow、Playwright、imageio-ffmpeg（自带 FFmpeg 可执行文件，FFmpeg 采用 LGPL/GPL 许可）。
