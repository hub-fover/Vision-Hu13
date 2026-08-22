# LAB 004 结果视频与 DETAIL 文章 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: 为 LAB 004 增加相对于初始帧的可下载结果视频，并按 DETAIL 系列重写本地公众号文章。

Architecture: 样例由确定性 Canvas 帧和 motion 数据共同生成；真实视频、照片和实时采集复用统一帧结构。video.js 只负责 Canvas 标注和 MediaRecorder，app.js 管理结果状态与资源释放；文章仍以本地 Markdown 为唯一源。

Tech Stack: 原生 ES modules、Canvas 2D、MediaRecorder WebM、Playwright、Python Markdown 生成器、graphite-minimal。

---

### Task 1: 建立结果视频失败测试

Files:
- Create: lab-004/web/tests/video.test.js
- Modify: lab-004/web/tests/e2e/app.spec.js

- [ ] Step 1: 写单测，断言 buildSampleFrames(12, 30) 返回 12 个 640×360 Canvas 帧，每帧有 timeS 和 offsetX/offsetY；drawAnnotatedFrame 对首帧绘制零位移标签；getRecordingMimeType 在空能力集合中返回 null。
- [ ] Step 2: 写 E2E，点击“用样例体验”，等待结果完成，断言 #motionVideo 可见且含 src、#downloadVideo 可用、页面出现“相对于初始帧”和 Δx/Δy/位移 文案，桌面和 Pixel 7 无横向溢出。
- [ ] Step 3: 运行 RED：npm.cmd --prefix lab-004/web test 与 npm.cmd --prefix lab-004/web run test:e2e -- --grep 结果视频，确认因缺少函数或元素失败。

### Task 2: 生成确定性样例帧

Files:
- Modify: lab-004/web/js/measurement.js
- Modify: lab-004/web/js/capture.js
- Test: lab-004/web/tests/video.test.js

- [ ] Step 1: 实现 buildSampleFrames(count=240,fps=30)，每帧创建 640×360 Canvas，绘制网格、带内部条纹和编号的目标，使用同一正弦函数填充 offsetX、offsetY、timeS、score。
- [ ] Step 2: 保持兼容：buildSampleMotion 从样例帧映射 motion 字段，现有测量结果的 2 Hz 和尺度换算不变。
- [ ] Step 3: 运行单测：npm.cmd --prefix lab-004/web test，确认样例帧测试与既有测试通过。

### Task 3: 实现 annotated video 模块

Files:
- Create: lab-004/web/js/video.js
- Test: lab-004/web/tests/video.test.js

- [ ] Step 1: 实现 drawAnnotatedFrame(canvas, frame, initialFrame, sample, roi, scale, index, total)：绘制当前帧、初始 ROI 虚线、位移箭头、中文指标、时间、帧序号和置信度。
- [ ] Step 2: 实现 getRecordingMimeType() 按 vp9、vp8、webm 检查 MediaRecorder.isTypeSupported；实现 createAnnotatedVideo(frames, samples, roi, fps, options)，用 canvas.captureStream(fps) 和 MediaRecorder 收集 Blob，并在无 API 时抛出 VIDEO_RECORDING_UNSUPPORTED。options.shouldCancel() 返回 true 时停止 recorder 和全部 captureStream tracks、释放临时 Canvas，并抛出 CANCELLED。
- [ ] Step 3: 实现 replaceVideoUrl(video, blob) 和 releaseVideoUrl(url)，替换前撤销旧 Blob URL。
- [ ] Step 4: 运行单测：npm.cmd --prefix lab-004/web test。

### Task 4: 接入结果页和资源生命周期

Files:
- Modify: lab-004/web/index.html
- Modify: lab-004/web/styles.css
- Modify: lab-004/web/js/app.js
- Modify: lab-004/web/js/state.js
- Test: lab-004/web/tests/e2e/app.spec.js

- [ ] Step 1: 增加结果视频区：video#motionVideo、downloadVideo、videoStatus，明确标注“相对于初始帧”。
- [ ] Step 2: 在 renderResult 中调用 createAnnotatedVideo，以真实帧和结果样本生成视频；视频不支持时保留曲线、JSON、CSV并显示原因。
- [ ] Step 3: 在 clearResultView、模式切换、取消和 pagehide 释放视频 URL、Canvas 和 Worker；实时模式冻结首帧只用于编辑，采集时丢弃占位帧并从后续时间戳开始。
- [ ] Step 4: 增加结果视频响应式样式和下载按钮，确保 Pixel 7 不横向溢出。
- [ ] Step 5: 运行 Web 单测与 E2E。

### Task 5: 按 DETAIL 系列重写文章唯一源

Files:
- Modify: lab-004/article/article.md
- Modify: lab-004/article/sources.yaml
- Modify: lab-004/article/brief.yaml
- Modify: lab-004/article/claims.yaml
- Modify: lab-004/article/fact-review.md
- Modify: lab-004/article/de-ai-report.md

- [ ] Step 1: 以“结果视频 + 四步操作”重写导语，标题为“LAB 004｜普通摄像头，能不能拍出物体动了多少？”，副标题为“从第一帧到当前帧：像素位移、毫米位移和一段可回放的视频”。
- [ ] Step 2: 写 01–08、边界、思考、结语、延伸阅读，每章一个 Engineer Note；覆盖普通样例、专业素材、尺度、模板、光流、频谱、相机稳定和参考级边界。
- [ ] Step 3: 加入网页结果视频截图或说明和官方 OpenCV 素材图注，明确官方素材不是本网页录制；保留二维码、作者签名、CTA、END。
- [ ] Step 4: 更新来源和事实口径，不把本地生成视频冒充真机录制。

### Task 6: 生成与验收本地文章产物

Files:
- Run: lab-004/article/build_local_outputs.py
- Validate: C:\Users\biaoh\.codex\skills\gzh-design\scripts\validate_gzh_html.py

- [ ] Step 1: 生成排版 HTML、预览和一键复制页，确认正文无工具栏、脚本和本地路径。
- [ ] Step 2: 运行 python C:\Users\biaoh\.codex\skills\gzh-design\scripts\validate_gzh_html.py lab-004/article/LAB-004_排版_石墨极简(graphite-minimal).html，要求 0 ERROR / 0 WARNING。
- [ ] Step 3: 检查 DETAIL 结构、Engineer Note 数量、二维码和图片资源。

### Task 7: 完整回归和最终审查

Files:
- Modify only if fixes are required by test evidence.

- [ ] Step 1: 运行 npm.cmd --prefix lab-004/web test。
- [ ] Step 2: 运行 npm.cmd --prefix lab-004/web run test:e2e。
- [ ] Step 3: 运行 Python、cross-runtime、acceptance、public-assets 和 Pages staging 验收。
- [ ] Step 4: 用 Playwright 检查桌面与 Pixel 7 的首屏、样例结果视频和错误回退；记录视频 URL、控制台和下载按钮证据。
- [ ] Step 5: 检查 git diff --check、文章目录仍被忽略、LAB 001–003/005 未产生变化，提交并准备发布。
