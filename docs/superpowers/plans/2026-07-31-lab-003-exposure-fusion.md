# LAB 003 多帧曝光融合实施计划

## Summary

在 Vision-Hu13 中新增 `lab-003/`，实现手机优先、完全本地运行的三帧曝光融合实验。用户可用系统相机拍摄偏暗、正常、偏亮三张 JPEG，或直接使用内置真实样例；照片不上传，也不要求精确 EV 或第三方相机 App。

算法边界为 Mertens Exposure Fusion：执行曝光分析、轻微手抖对齐、多尺度融合和基础运动保护；不恢复绝对 HDR 辐亮度，不复刻手机厂商 HDR 管线。

标题：`LAB 003｜一张照片装不下的明暗，怎样用三次曝光合成？`

副标题：`不用专业模式：手机拍暗、正常、亮三张，网页本地合成曝光融合`

## Tasks

### 1. 仓库契约与 Python 管线

- 在 `lab-003/shared/contracts.json` 固定输入、资源预算、对齐阈值、融合权重、运动保护和 JPEG 输出默认值。
- 定义公开类型、统一错误码和契约文档。
- 实现 Python 图像读取、EXIF 校正、曝光排序、ORB 对齐、有效区域裁切、Mertens 权重、Gaussian/Laplacian 金字塔、运动保护、融合、诊断输出与 CLI。
- 覆盖输入校验、曝光排序、对齐质量、权重、金字塔、运动保护、裁切、预算、CLI 和全部错误码。

### 2. 手机优先 Web 应用

- 实现三个相机拍摄位、相册三选、内置样例和仅驻留内存的状态管理。
- 在 Worker 中延迟加载同源 OpenCV.js，完成曝光分析、排序、对齐、融合、取消和资源释放。
- 提供阶段进度、结果/中间曝光/运动区域三视图、前后比较、重拍、JPEG 下载和系统分享回退。
- 补齐 Web 单测与桌面、Pixel 7 E2E 测试。

### 3. 真实素材与公众号交付

- 固定并记录 Peyrou、Kebun、Mobil 三组 MIT 许可素材的提交、路径、SHA-256、许可证、下载日期、处理方式和使用位置。
- 产出九节 Markdown 正文、brief、claims、事实审阅、sources 和去 AI 化报告。
- 生成石墨极简公众号 HTML、预览 HTML、审阅 PDF、封面、分享图、真实样例动图/静态替代，以及 10 张技术图。
- 不以 Playwright 模拟素材冒充真机录屏。

### 4. CI、Pages 与跨运行时验收

- 更新根目录命令、CI、Pages 和 README，保持 LAB 001/002 路径与行为不变。
- 验证 Python 3.11/3.12、Windows/Linux、Python/JavaScript 对齐与融合一致性、4MP/320MiB 预算、OpenCV.js 体积及子路径资源。
- 验证公众号 HTML、图片、PDF 和公开素材来源。

### 5. 完成验证

- 运行 LAB 001、LAB 002、LAB 003 的 Python、Web、E2E、文章与资产验收。
- 在桌面和 Pixel 7 视口检查首屏、输入、进度、结果及失败状态。
- 使用 `superpowers:finishing-a-development-branch` 完成分支交付。

## Fixed Defaults

共享契约使用三张输入、1280 分析长边、单张 48MP、4MP 输出、320MiB 工作集、2000 ORB 特征、0.75 ratio、30 最少内点、0.30 最少内点比例、2px 中位重投影误差、5 层金字塔、三类权重各 1.0、适曝 sigma 0.2、默认运动保护和 JPEG 0.92。

错误码：`INVALID_IMAGE_COUNT`、`UNSUPPORTED_FORMAT`、`DECODE_FAILED`、`EXPOSURE_SPREAD_TOO_SMALL`、`SCENE_MISMATCH`、`LOW_TEXTURE`、`ALIGNMENT_FAILED`、`EXCESSIVE_CROP`、`OUTPUT_TOO_LARGE`、`CANCELLED`。

## Assumptions

- 基线为已包含 LAB 002 的 `origin/main`。
- v1 仅处理三张常规图片，不支持任意张数、RAW/DNG、云端 API、生成式修复、圆柱投影或完整去鬼影。
- “偏暗/正常/偏亮”只表示相对曝光。
- Android 与 iPhone 均使用系统相机或相册。
