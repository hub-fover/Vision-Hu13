# 素材和许可

本项目原创课程代码遵循仓库根目录MIT许可证。原理实验的合成数据由算法产生；真实实验包含第三方照片、开源运行时与模型，分别适用各自许可，不能仅依据本仓库MIT许可证使用。

教学结构依据用户提供的004-三维重建1、005-三维重建2、006-视觉感知、007-机器学习、008-深度学习课件；课件原文件与原始幻灯片图像不在网站、发布目录或交付包内。网站提供重新撰写的说明与页码索引。原课件内容不因代码MIT许可而自动授权。

真实实验调用 JSFeat（MIT）、TensorFlow.js 与官方视觉模型（许可与版本见 `assets/` 来源记录）。发布包保留相应许可文本、照片来源和哈希。双目匹配教学代码为本项目实现，调用 JSFeat 进行图像预处理与特征计算，不声称调用完整 OpenCV StereoBM。

Depth Anything 扩展调用本仓库已发布的 LAB 007。其依赖、Small 模型版本与图像出处见 [LAB 007 第三方说明](https://github.com/hub-fover/Vision-Hu13/blob/main/lab-007/web/THIRD_PARTY_NOTICES.md) 和 [照片来源](https://github.com/hub-fover/Vision-Hu13/blob/main/lab-007/web/assets/samples/SOURCES.md)。该扩展不在本课程部署包中复制 ONNX 权重。

Playwright仅用于开发验收，许可见仓库锁文件对应的Apache-2.0包；不进入发布目录。
