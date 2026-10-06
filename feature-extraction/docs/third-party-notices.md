# 第三方资源与实现说明

## 实拍素材

两张山景图片来自 cottonbro studio 的 Pexels 视频 *Camera Panning Over Mountains*，原页面：https://www.pexels.com/video/camera-panning-over-mountains-9943097/ 。许可页面：https://www.pexels.com/legal-pages/license/ 。文件、帧时间、下载日期、修改方式及 SHA-256 见 `web/assets/manifest.json`。

图片是第三方实拍视频的派生帧，不属于本项目原创素材，也不因署名而转为 MIT 或 CC BY 4.0。人工投影、模糊等对照预设必须与真实独立拍摄双帧区分；这些处理均在本机完成。

## 测试依赖

Playwright 与 playwright-core 固定为 1.62.0，项目为 Microsoft Corporation 的开源浏览器自动化工具，包内声明 Apache-2.0。仅用于测试，不在课堂页面加载。完整依赖与完整性摘要以 `package-lock.json` 为准，第三方许可证保留在安装包中。Google Chrome 为测试使用的本机软件，不随网页分发。

## 浏览器字体

微软雅黑、苹方与系统字体仅作为浏览器字体回退名称，不附带或分发字体文件。

## 算法实现与外部构建

页面运行时使用项目内 JavaScript 数值实现，不加载 OpenCV.js、第三方模型或 CDN。SIFT 是独立的实际尺度空间、关键点细化、方向及 128 维描述子实现，不使用 ORB 冒充；简化点和现有 OpenCV 构建检查记录见 `docs/sift-capability.md`，算法原理可参考 OpenCV 官方教程：https://docs.opencv.org/4.x/da/df5/tutorial_py_sift_intro.html 。引用算法文档不等于复制其代码或把其许可应用到实拍素材。

阶跃、亮线、屋顶、噪声点、几何真值、轮廓目标及重复纹理属于明确标注的数值教学数据，不是现场照片。此版本无全景拼接、人脸模型或摄像头功能。
