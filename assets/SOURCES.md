# 素材来源台账

项目默认背景使用经过裁剪、缩放和轻微校色的真实场景照片。三张照片均来自 Pexels，继续适用 [Pexels License](https://www.pexels.com/legal-pages/license/)；署名不是授权的替代品。仓库不收录未经修改的原始大图。

| 文件 | 类型 | 作者与原始页面 | 本地处理 | 许可 |
|---|---|---|---|---|
| `examples/wall.jpg` | 真实广告牌背景 | Peter Dyllong，[Blank Billboard in Urban Street Setting](https://www.pexels.com/photo/blank-billboard-in-urban-street-setting-36519146/) | 裁去右侧道路标牌，缩放至 1600×1200，轻微调整对比度与色彩，JPEG 优化 | Pexels License |
| `examples/packaging.jpg` | 真实包装盒背景 | mockupbee，[White Cardboard Box on White Surface](https://www.pexels.com/photo/white-cardboard-box-on-white-surface-12039676/) | 居中裁剪为 4:3，缩放至 1600×1200，轻微调整对比度与色彩，JPEG 优化 | Pexels License |
| `examples/screen.jpg` | 真实显示屏背景 | Lisa Anna，[TV in a Living Room](https://www.pexels.com/photo/tv-in-a-living-room-19866439/) | 围绕无品牌电视裁剪，缩放至 1600×1200，轻微调整对比度与色彩，JPEG 优化 | Pexels License |
| `examples/lab-poster.png` | 透明素材 | `scripts/generate_assets.py`，Pillow 矢量式原创绘制 | 1200×800 RGBA | CC BY 4.0 |
| `examples/screen-ui.png` | 透明素材 | `scripts/generate_assets.py`，无品牌界面原创绘制 | 1200×800 RGBA | CC BY 4.0 |
| `examples/vision-hub-mark.png` | 透明素材 | 项目提供的 `assets/source/vision-hub-logo-corrected.png` | 去近白背景、裁剪并缩放；源文件 SHA-256：`260f7d0618333219809927590195721d41acca312bd40ea7e86300178e2d254b` | CC BY 4.0 |
| `examples/synthetic/*` | 离线备用背景 | `scripts/generate_assets.py`，固定种子 101／202／303 | 程序化生成，不作为默认展示 | CC BY 4.0 |
| `../docs/figures/*` | 技术图 | `scripts/generate_figures.py` 原创生成 SVG 并导出 PNG | 1080×675 | CC BY 4.0 |
| `../demo/*` | 演示媒体 | Playwright 操作实际 Web 页面录制，再由项目脚本转换为 MP4／GIF | 展示中包含上述真实背景的派生画面 | 演示编排 CC BY 4.0；照片部分仍适用 Pexels License |

下载日期均为 2026-07-29。完整机器可读元数据见 [`asset-manifest.json`](asset-manifest.json)，确定性裁剪参数见 [`scripts/prepare_real_assets.py`](../scripts/prepare_real_assets.py)。

第三方背景不适用 CC BY 4.0。项目的 CC BY 4.0 仅覆盖原创叠加层、程序化备用背景、技术图、文章和演示编排，不改变照片作者及 Pexels 授予的权利。
