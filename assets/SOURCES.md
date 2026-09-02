# 素材来源台账

产品内置背景使用经过裁切、缩放和轻微校色的真实场景照片。五张照片均来自 Pexels，继续适用 [Pexels License](https://www.pexels.com/legal-pages/license/)；署名不替代许可。仓库不收录未经修改的原始大图。

| 文件 | 类型 | 作者与原始页面 | 本地处理 | 许可 |
|---|---|---|---|---|
| `examples/court.jpg` | 真实篮球场背景 | Joaquin Carfagna，[Basketball Court in a City](https://www.pexels.com/photo/basketball-court-in-a-city-17274508/) | 裁切至 4:3 并突出场地平面，缩放至 1600×1200，轻微调整对比度和色彩，JPEG 优化 | Pexels License |
| `examples/facade.jpg` | 真实楼体背景 | Miks Bergmanis，[White Concrete Building](https://www.pexels.com/photo/white-concrete-building-542411/) | 围绕低机位外立面裁切至 4:3，缩放至 1600×1200，轻微调整对比度和色彩，JPEG 优化 | Pexels License |
| `examples/wall.jpg` | 真实广告牌背景 | Peter Dyllong，[Blank Billboard in Urban Street Setting](https://www.pexels.com/photo/blank-billboard-in-urban-street-setting-36519146/) | 裁去右侧道路标牌，缩放至 1600×1200，轻微调整对比度和色彩，JPEG 优化 | Pexels License |
| `examples/packaging.jpg` | 真实包装盒背景 | mockupbee，[White Cardboard Box on White Surface](https://www.pexels.com/photo/white-cardboard-box-on-white-surface-12039676/) | 居中裁切为 4:3，缩放至 1600×1200，轻微调整对比度和色彩，JPEG 优化 | Pexels License |
| `examples/screen.jpg` | 真实显示屏背景 | Lisa Anna，[TV in a Living Room](https://www.pexels.com/photo/tv-in-a-living-room-19866439/) | 围绕无品牌电视裁切，缩放至 1600×1200，轻微调整对比度和色彩，JPEG 优化 | Pexels License |
| `examples/court-ad.png` | 原创透明素材 | `scripts/generate_assets.py`，无第三方品牌的赞助广告 | 1200×800 RGBA | CC BY 4.0 |
| `examples/facade-logo.png` | 原创透明素材 | `scripts/generate_assets.py`，Vision Hu13 原创标识 | 1200×800 RGBA | CC BY 4.0 |
| `examples/lab-poster.png` | 原创透明素材 | `scripts/generate_assets.py`，Pillow 矢量式原创绘制 | 1200×800 RGBA | CC BY 4.0 |
| `examples/screen-ui.png` | 原创透明素材 | `scripts/generate_assets.py`，无品牌界面原创绘制 | 1200×800 RGBA | CC BY 4.0 |
| `examples/vision-hub-mark.png` | 项目标识素材 | 项目提供的 `assets/source/vision-hub-logo-corrected.png` | 去近白背景、裁切并缩放；源文件 SHA-256：`260f7d0618333219809927590195721d41acca312bd40ea7e86300178e2d254b` | CC BY 4.0 |
| `examples/synthetic/*` | 离线备用背景 | `scripts/generate_assets.py`，固定种子 101／202／303 | 程序化生成，不作为默认展示 | CC BY 4.0 |
| `../docs/figures/*` | 原创技术图 | `scripts/generate_figures.py` 原创生成 SVG 并导出 PNG | 1080×675 | CC BY 4.0 |
| `../docs/cases/*` | 产品案例状态图 | `scripts/generate_case_studies.py` 调用实际 Python 渲染与消影辅助 | 三个场景各五张 1600×1200 JPEG | 编排 CC BY 4.0；照片部分仍适用 Pexels License |
| `../demo/*` | 篮球场操作演示 | Playwright 操作实际 Web 页面录制，再转换为 MP4 和 GIF | 同一段内容的 WebM、MP4、GIF | 编排 CC BY 4.0；照片部分仍适用 Pexels License |

下载日期均为 2026-07-29。完整机器可读元数据见 [`asset-manifest.json`](asset-manifest.json)，确定性裁切参数见 [`scripts/prepare_real_assets.py`](../scripts/prepare_real_assets.py)。

第三方背景不适用 CC BY 4.0。项目的 CC BY 4.0 只覆盖原创叠加层、程序化备用背景、技术图和演示编排，不改变照片作者及 Pexels 授予的权利。
