# LAB 007 单目深度体验站

LAB 007 是面向手机浏览器的单目相对深度体验。用户可以拍照、从相册选择
图片或打开三张示例图，在 Dedicated Worker 中运行固定版本的 Depth Anything
V2 Small，并查看原图、伪彩深度图和可拖动对比视图。

## 在线体验

<https://hub-fover.github.io/Vision-Hu13/lab-007/>

首次推理需要联网下载浏览器运行时和约 27 MB 的模型权重。模型文件不在仓库
和 Pages 产物中，后续访问可使用浏览器缓存。

## 能力边界

- 默认结果是相对深度，只表达场景中的远近关系，不显示米制单位，也不能替代工程测量。
- 本地模式不会上传所选照片，也不会把照片写入持久化存储；下载运行时和模型仍属于网络活动。
- 可选米制接口默认关闭。配置后，只有用户明确确认上传才会请求远端服务。
- Pixel 7 Chromium 和 iPhone 13 WebKit 自动化用于验证布局与交互，不等同真实 Android、iPhone、Safari 或微信验收。

## 固定运行时

- Transformers.js `4.2.0`
- ONNX Runtime Web `1.26.0-dev.20260416-b7804b056c`
- 模型 `onnx-community/depth-anything-v2-small`
- revision `4472b7362082ad9968fee890ca0f1e5aca36b93d`
- 权重变体 `model_q4.onnx`

浏览器 JS、WASM、Lucide 与二维码依赖由锁文件安装并打包到同源
`vendor/`。`assets/samples/manifest.json` 使用 `lab007.samples.v1`，记录三张
示例图的尺寸、来源、许可和 SHA-256。

## 本地运行

从仓库根目录执行：

```powershell
npm.cmd ci
npm.cmd ci --prefix lab-007/web
npm.cmd run build:lab007
node lab-007/scripts/serve.mjs
```

打开 <http://127.0.0.1:4177/>。不要直接用 `file://` 打开 HTML，因为 ES
modules、Worker 和 WASM 需要 HTTP 环境。

## 验证

```powershell
npm.cmd run test:lab007:web
npm.cmd run test:lab007:e2e
npm.cmd run test:lab007:model
npm.cmd run test:lab007:release
```

真实模型烟测会联网获取固定 q4 权重。`build:lab007` 生成被根 `.gitignore`
排除的 `web/lab-007/` Pages 暂存目录，并校验同源运行时哈希、样例哈希、相对
资源路径、许可文件和无 `node_modules` 泄漏。
