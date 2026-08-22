# LAB 004 结果视频与 DETAIL 文章设计

## 目标

让 LAB 004 形成一条能被普通读者看懂、也能被专业用户复现的闭环：用户先看到目标相对第一帧的变化，再看到像素、毫米和频率结果；文章以 DETAIL 系列的“现象—系统—边界”方式解释这条链路。

## 用户体验

首屏保留“样例回放”和“实时测量”两个入口。样例不再只有抽象 motion 数组，而是生成确定性的 640×360 Canvas 帧序列：深色网格、带纹理矩形目标和 2 Hz 正弦位移。点击样例后，结果区显示相对于第一帧的当前帧预览、像素/毫米位移、曲线和主频。

真实素材路径继续支持本地视频、照片序列和后置相机。实时模式先冻结首帧供用户框选 ROI 和两点标尺，再采集后续帧；冻结帧不作为运动帧重复使用。目标或背景质量连续失败时，清空旧测量并提示重新初始化。

结果视频由处理后的 Canvas 帧生成 WebM。每帧包含当前画面、初始 ROI 轮廓、从初始中心到当前中心的箭头、Δx、Δy、合位移、毫米位移、帧序号、时间和置信度。浏览器不支持 MediaRecorder 时不生成伪视频，只显示可用的曲线和下载回退。

## 模块边界

- capture.js 负责视频、图片、实时帧采集和统一的 640×360 帧。
- measurement.js 继续负责样例 motion 和测量编排，并让样例帧与 motion 使用同一确定性函数。
- 新增 video.js 负责逐帧标注、MediaRecorder、Blob URL 替换和释放。
- app.js 只负责状态、DOM 绑定和资源生命周期，不在结果视频模块中重复计算位移。
- state.js 增加 resultVideoUrl、resultVideoBlob 和 resultVideoError 的可清理状态。

视频模块输入为 frames、samples、roi、scale、fps 和可选的 options.shouldCancel()。其中 samples[0] 必须代表相对于第一帧的零位移。createAnnotatedVideo 返回带正确 MIME 类型的 Blob；URL 由应用层通过 replaceVideoUrl 管理，或返回稳定错误码 VIDEO_RECORDING_UNSUPPORTED。shouldCancel 返回 true 时必须停止 MediaRecorder、停止 captureStream 的 tracks、释放临时 Canvas，并抛出稳定错误码 CANCELLED。

## 文章结构

文章唯一源仍为 lab-004/article/article.md，本地生成 graphite-minimal 排版 HTML 和公众号复制页。结构采用：问题式标题与副标题、开场体验、01–08 编号章节、边界、思考、结语、延伸阅读。每个章节只回答一个问题，并提供一个可跳过的 Engineer Note。

开场先给结果视频和四步操作：加载样例或视频 → 框选目标 → 选择两点并输入真实长度 → 开始测量。随后分别解释像素到毫米、模板匹配、光流、频谱和相机稳定。官方 OpenCV 图片和 GIF 只作为算法方向参考，图注注明来源与不代表本网页录制。结尾沿用 DETAIL 的证据边界、作者签名、CTA、二维码和 END。

## 非目标与边界

不引入边录边测的实时结果视频流、不增加服务器上传、不使用 Storage、Cookie、IndexedDB、不宣称测量级精度。结果视频是浏览器本地生成的 annotated result video，不冒充用户录屏或真机证据。

## 验证

单测覆盖样例帧尺寸与时间戳、初始帧零位移、标注文字和箭头、MediaRecorder 不支持回退及 Blob URL 释放。Playwright 覆盖样例结果视频可见和可下载、视频文案含“相对于初始帧”、结果旁边显示 Δx、Δy、位移，以及 Pixel 7 无横向溢出。现有 Python、Web、cross-runtime、acceptance、public-assets 回归必须继续通过。
