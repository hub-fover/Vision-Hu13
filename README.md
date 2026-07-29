# Perspective Paste

Perspective Paste 是 Vision Hub「LAB｜实战实验室」的第一个项目：在照片中的近似平面上点选四个角，把文字或透明 PNG 按正确透视贴入场景，再用亮度、环境色、纹理、模糊、阴影和混合模式消除“浮贴感”。

[在线体验](https://hub-fover.github.io/Vision-Hu13/) · [GitHub 源码](https://github.com/hub-fover/Vision-Hu13) · [公众号文章](article/article.md) · [设计文档](docs/superpowers/specs/2026-07-28-lab-001-perspective-paste-design.md)

![贴图前后对比](docs/figures/01-before-after.png)

## 项目包含什么

- Python 教学版：OpenCV 窗口交互，Pillow 文字／PNG 图层，NumPy 几何与融合。
- 原生 Web 版：HTML、CSS、JavaScript、Canvas 2D 与 Web Worker；运行时无前端第三方依赖。
- 共享契约：两端使用相同的点序、错误码、参数语义、预设和 JSON 几何夹具，但算法独立实现。
- 可复现内容：3 张背景、3 个透明素材、10 张 SVG／PNG 技术图，以及 MP4、WebM、GIF 演示。

浏览器只在本机读取用户选择的背景、PNG 和字体；应用代码不包含用户图片上传请求。

## 快速开始

### Web

Windows 可直接双击仓库根目录的 `start-web.cmd`，它会启动本地服务器并打开浏览器。也可以在仓库根目录执行：

```powershell
npm run serve
```

打开 `http://127.0.0.1:4173/`。不要直接双击 `web/index.html`：`file://` 模式会被浏览器拦截 ES Module、Web Worker 和本地资源读取，页面会给出启动提示。首次进入会载入可编辑示例；桌面宽度不足 960px 时页面改为上下布局，并提示桌面端体验更完整。

### Python

支持 Python 3.11–3.12：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m perspective_paste
```

不传参数时加载内置墙面示例。也可以明确指定背景、文字或透明 PNG：

```powershell
.\.venv\Scripts\python -m perspective_paste `
  --background assets/examples/packaging.jpg `
  --asset assets/examples/vision-hub-mark.png `
  --preset packaging `
  --output packaging-result.png
```

文字示例：

```powershell
.\.venv\Scripts\python -m perspective_paste `
  --background assets/examples/wall.jpg `
  --text "先贴得准，再融得真" `
  --preset wall
```

四个预设为 `wall`、`poster`、`packaging` 和 `screen`。PNG 无损导出，JPEG 质量固定为 92。

## Python 交互

| 操作 | 作用 |
|---|---|
| 鼠标左键 | 添加控制点；16px 范围内选中已有点 |
| 拖动 | 移动选中的控制点 |
| 鼠标右键 | 删除命中范围内最近点 |
| `Enter` | 确认当前有效四边形 |
| `T` | 在终端输入文字 |
| `P` | 在终端输入透明 PNG 路径 |
| `G` | 开关网格 |
| `V` | 开关消失点辅助 |
| `M` | 循环切换 Normal、Multiply、Soft Light |
| `[` / `]` | 每次降低／提高不透明度 0.05 |
| `B` | 在 0／0.5／1／1.5／2／2.5px 间循环模糊值 |
| `S` | 按原图分辨率导出 |
| `R` | 重置控制点 |
| `Esc` | 退出 |

拖动预览的最长边限制为 1200px；导出会使用原图分辨率重新渲染。无效四边形不会覆盖最后一次有效预览，也不能导出。

## 几何契约

点使用 `{x, y}`，四边形统一排序为 `TL → TR → BR → BL`。公共接口在 Python 中使用 snake_case，在 Web 中使用 camelCase：

| Python | Web |
|---|---|
| `order_quad` | `orderQuad` |
| `validate_quad` | `validateQuad` |
| `compute_homography` | `computeHomography` |
| `compute_vanishing_points` | `computeVanishingPoints` |
| `warp_asset` | `warpAsset` |
| `blend_composite` | `blendComposite` |

固定错误码：

`OUT_OF_BOUNDS`、`DUPLICATE_POINTS`、`SELF_INTERSECTION`、`NON_CONVEX`、`NEAR_COLLINEAR`、`AREA_TOO_SMALL`、`TOO_SLENDER`、`SINGULAR_HOMOGRAPHY`。

## 测试与再生成

```powershell
.\.venv\Scripts\python -m pytest
npm install
npm test
npx playwright install chromium
npm run test:e2e
.\.venv\Scripts\python scripts\validate_cross_runtime.py
```

原创叠加层和离线备用背景可重复生成：

```powershell
.\.venv\Scripts\python scripts\generate_assets.py
.\.venv\Scripts\python scripts\generate_figures.py
.\.venv\Scripts\python scripts\generate_demo.py
npm run record:demo
```

从素材台账列出的 Pexels 原图重新制作默认真实背景：

```powershell
.\.venv\Scripts\python scripts\prepare_real_assets.py `
  --wall C:\path\to\wall-original.jpg `
  --packaging C:\path\to\packaging-original.jpg `
  --screen C:\path\to\screen-original.jpg
```

脚本会按已审定的裁剪框生成 1600×1200 派生图，并同步到 Python 与 Web 的资源目录；未经修改的原始大图不提交到仓库。

公众号 HTML 校验：

```powershell
.\.venv\Scripts\python scripts\validate_article_html.py `
  "article\Perspective_Paste_排版_石墨极简风(graphite-minimal).html"
```

## 目录

```text
python/perspective_paste/  Python 包与交互入口
web/                       GitHub Pages 静态应用
shared/                    预设、错误码与跨端测试夹具
assets/examples/           示例背景与透明 PNG
article/                   Markdown、来源、审校报告与公众号 HTML
docs/figures/              10 张 SVG 源图及 PNG
demo/                      MP4、WebM 与 GIF
scripts/                   资产、技术图、录屏和校验脚本
tests/                     Python、Web 与 Playwright 测试
```

## 能力边界

单应性描述近似平面到平面的映射。圆柱、衣物褶皱、曲面屏、前景遮挡、强镜面反射和复杂三维起伏不适合只用四点透视处理。本项目不实现自动平面检测、遮挡分割、曲面变形、多图层、完整撤销、PSD 或生成式补全。

## 素材来源与许可

三张默认背景是来自 Pexels 的真实场景派生图，分别由 Peter Dyllong、mockupbee 和 Lisa Anna 拍摄，继续适用 Pexels License，不属于本项目的 CC BY 4.0 内容。原创海报、屏幕 UI、程序化备用背景、技术图和文章采用 CC BY 4.0；Vision Hub 标识从项目提供的已校正标识非破坏性处理得到。逐文件来源、修改方法和许可见 [素材台账](assets/SOURCES.md) 与机器可读的 [`asset-manifest.json`](assets/asset-manifest.json)。

- 代码： [MIT](LICENSE)
- 文章与原创资产： [CC BY 4.0](LICENSE-CONTENT.md)
