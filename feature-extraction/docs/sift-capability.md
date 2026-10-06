# SIFT 运行能力与实现记录

2026-10-05，使用 `node scripts/check-opencv.mjs` 实际加载现有 `D:/Vision-Hu13/opencv-build/output/opencv.js` 及 `package/opencv.js`。两者均成功初始化 OpenCV 4.5.3 的 Mat；ORB 为 function，SIFT 和 SIFT_create 为 undefined。没有将 ORB 改名为 SIFT，没有复制这些构建为网页运行依赖。

实现路径：本项目独立 JavaScript 数值实现，参考 [OpenCV SIFT 官方说明](https://docs.opencv.org/4.x/da/df5/tutorial_py_sift_intro.html)。中间图来自同一算法实际计算，非说明动画。

目前核心已实现并通过定向测试：

- 多 octave 高斯尺度空间，每 octave 三个尺度间隔，六层 Gaussian、五层 DoG；下一 octave 从尺度翻倍层抽取。
- 每个 DoG 候选与全部26个邻域比较。
- 三维 Taylor/Hessian 定位、最多五次离散位置调整、低对比与空间曲率比筛除。
- 高斯加权36方向直方图，平滑、峰值插值与80%次峰。
- 4×4×8三线性投票描述子，L2归一化、0.2截断、重新归一化。

明确区别：从输入原分辨率开始，不执行初始2倍放大；假设输入光学平滑σ=0.5，基础σ=1.6；核截断3σ，reflect-101边界。描述子为单位L2浮点向量，不使用OpenCV的512倍输出尺度。不宣称逐位等同OpenCV结果。

测试证据：常量Gaussian/零DoG；真实高斯光斑尺度极值及26邻域；已知小数三维极值恢复、边缘曲率拒绝；90°梯度旋转归一化、亮度偏置不变、描述子128维与单位范数。

已接通端到端SIFT和场景08。真实山景作为默认输入，支持旋转、缩放、亮度增益、模糊、对比门限；显示每层Gaussian/DoG、候选/筛选、选中关键点主方向和4×4×8描述子。点击右图选最近关键点；本次所有阶段来自实际计算。Chrome实测默认照片、旋转改变结果、选点写入JSON配置、描述子阶段、平坦区无特征反馈；无页面错误和外部请求。数值增加端到端已知小数光斑定位及每点128维描述子单位范数。npm test 39 passed /0 failed。

内存收口：Gaussian/DoG阶段保持各octave原尺寸，不再44层全尺寸复制。四octave三间隔层的标量总数小于16倍输入像素（相较原44倍），测试直接计算保存的数组长度。显示按与此前相同最近邻坐标扩展，DoG映射仍为128+8D。Worker结果使用去重ArrayBuffer transfer，重复引用及子视图保留同一缓冲区；structuredClone真实转移测试确认发送端分离、接收端数值保持。Chrome实测1280px真实山景、取消/恢复以及octave2常量DoG中心像素[128,128,128,255]。全量48 passed /0 failed。

尚未完成：跨图像旋转/缩放重复定位与描述子相似度量化验证、完整内存工作集上限估计/压力、所有场景取消/快速参数竞态验收。匹配场景已经接通，详见matching-verification.md。不把现有通过测试视为全目标完成。
