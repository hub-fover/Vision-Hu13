# LAB 001｜Perspective Paste 完整实施计划

日期：2026-07-28  
状态：已批准并实施

## 摘要

在 `D:\Vision-Hu13` 创建完整的 Perspective Paste 项目，分阶段交付 Python 教学版、原生 Web 体验版、自动化测试、原创示例素材、技术图、公众号文章、演示视频及 GitHub Pages。

核心约束：

- Python 3.11–3.12、OpenCV、Pillow、NumPy、pytest；
- Web 使用原生 HTML／CSS／JavaScript、Canvas 2D 和 Web Worker，无后端、无用户图片上传；
- Python 与 Web 独立实现，共享 JSON 测试夹具和参数语义；
- 代码采用 MIT，文章与原创资产采用 CC BY 4.0；
- 最终推送 `origin/main`，仓库和 Pages 公开。

## 公共接口与目录

```text
python/perspective_paste/   Python 包、交互入口、几何与融合
web/                        GitHub Pages 静态应用
shared/                     预设、错误码、跨端测试向量
assets/examples/            3 张背景、3 个透明 PNG
article/                    公众号 Markdown 与可粘贴 HTML
docs/figures/               10 张 SVG 源图及 PNG
scripts/                    资产、截图、视频和跨端验证脚本
tests/python/
tests/web/
.github/workflows/
```

统一数据契约：

- `Point = {x, y}`，`Quad = [TL, TR, BR, BL]`；
- `RenderOptions` 包含 `blendMode`、`opacity`、`blurPx`、`brightnessMatch`、`tintStrength`、`textureStrength`、`saturation`、`shadow` 和 `fitMode`；
- 错误码固定为 `OUT_OF_BOUNDS`、`DUPLICATE_POINTS`、`SELF_INTERSECTION`、`NON_CONVEX`、`NEAR_COLLINEAR`、`AREA_TOO_SMALL`、`TOO_SLENDER`、`SINGULAR_HOMOGRAPHY`；
- 两端公开同义接口：`orderQuad`、`validateQuad`、`computeHomography`、`computeVanishingPoints`、`warpAsset`、`blendComposite`。

Python 入口：

```powershell
python -m perspective_paste --background <path> `
  [--text <text> | --asset <png>] `
  [--preset wall|poster|packaging|screen]
```

不传参数时加载内置墙面示例。

## 分阶段实施

### 1. 仓库与共享规范

- 建立 README、依赖配置、双许可证、忽略规则、资产台账、共享预设与几何夹具；
- 四点以质心角度、凸包方向和起始角联合排序；
- 点间距至少 `max(4px, 0.2% 对角线)`，面积至少 `max(256px², 0.1% 画布面积)`，最短边／最长边不低于 `0.02`，归一化单应性条件数不高于 `1e8`；
- 固定墙面、海报、包装和屏幕四组预设。

### 2. Python 教学版

- 以 pytest 驱动排序、校验、单应性、消失点、文字／PNG 和融合实现；
- Pillow 生成 RGBA 文字层，支持中英文、描边、字距、行距、横排、逐字直排、透明裁剪和用户字体；
- 处理顺序固定为透视、亮度、环境色、模糊、纹理、阴影、混合和 Alpha 合成；
- OpenCV 窗口实现选点、16px 命中拖动、右键删除、网格、消失辅助和状态栏；
- 拖动预览最长边 1200px，导出按原分辨率重渲染；PNG 无损、JPEG 质量 92。

### 3. Web 体验版

- 三栏桌面布局，首次进入直接加载可编辑示例；
- 自动排序和校验四点；无效拖动保留最后有效结果并显示问题；
- 拖动时使用 `requestAnimationFrame` 节流的自适应三角网格，松手后由 Web Worker 逆单应性逐像素重采样；
- 支持本地图片、透明 PNG 与字体，完整融合参数、辅助线、原图查看、对比、重置与 PNG／JPEG 下载；
- 小于 960px 攁为上下布局，不实现完整移动端触控编辑；
- 资源使用相对路径，支持 `/Vision-Hu13/` 子路径部署。

### 4. 原创内容资产

- 生成无品牌、无人物的墙面、包装和显示屏背景；
- 制作 Vision Hub 标识、LAB 海报和屏幕 UI 三个透明 PNG，并记录来源；
- 生成 10 张可编辑 SVG 技术图及 1080px 宽 PNG；
- 公众号文章按“先贴得准，再融得真”完成 Markdown 与石墨极简可粘贴 HTML；
- Playwright 驱动示例操作，生成约 12 秒、1080×1350 的 MP4，并提供 WebM／GIF。

### 5. 验收、CI 与发布

- Python、Node Test 与 Playwright 覆盖几何、渲染、融合和浏览器交互；
- 共享夹具要求角点重投影误差不超过 `0.5px`；忽略 2px 边缘后，标准示例有效区平均颜色误差不超过 `3%`；
- E2E 验证首次示例、上传、四点选择、错误提示、拖动、预设、对比和导出，并确认无用户图片上传请求；
- GitHub Actions 在 Windows／Linux 上测试 Python 3.11／3.12，并运行 Node 与 Playwright 测试；
- 全部通过后部署 `web/` 到 GitHub Pages，推送 `origin/main` 并在 README 记录在线地址。

## 固定预设

| 预设 | 混合 | 不透明度 | 模糊 | 环境色 | 纹理 | 阴影 |
|---|---:|---:|---:|---:|---:|---|
| 墙面印刷 | Multiply | 0.78 | 0.7px | 0.18 | 0.35 | 关闭 |
| 海报粘贴 | Normal | 0.95 | 0.8px | 0.12 | 0.12 | 6×8px、12px、0.22 |
| 包装印刷 | Multiply | 0.85 | 0.4px | 0.15 | 0.25 | 关闭 |
| 屏幕替换 | Normal | 1.00 | 0.2px | 0.08 | 0 | 关闭 |

## 默认假设

- `D:\Vision-Hu13` 为项目根目录，不改动既有公众号工程；
- 支持当前 Chrome、Edge、Firefox，重点验收 Chromium；
- 不实现自动平面检测、遮挡分割、曲面变形、多图层、完整撤销、PSD 或生成式补全；
- Python 使用项目本地虚拟环境；Node 只用于测试、录制和发布工具，Web 运行时零第三方依赖；
- Pages 启用属于外部 GitHub 变更，推送前确认授权并使用可用登录能力完成。

