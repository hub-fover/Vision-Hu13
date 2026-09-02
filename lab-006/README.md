# LAB 006 相机标定工具

基于张正友标定法的手机相机标定与测量Web应用。

## ✨ 功能特点

- 📐 **相机标定**：使用棋盘格标定板精确标定手机相机内参和畸变参数
- 📏 **精确测量**：基于标定结果对平面物体进行毫米级精度测量
- 🎯 **一键示例**：无需实际拍摄，使用OpenCV标准数据集体验完整流程
- 💾 **数据持久化**：标定结果自动保存到浏览器本地存储

## 🚀 快速开始

### 方式一：使用示例数据（推荐新手）

1. 打开[标定页面](https://hub-fover.github.io/Vision-Hu13/lab-006/calibration.html)
2. 点击"加载示例数据"按钮
3. 自动加载13张OpenCV标准标定图像
4. 点击"开始标定"查看标定结果
5. 前往[测量页面](https://hub-fover.github.io/Vision-Hu13/lab-006/measurement.html)体验测量功能

### 方式二：实际标定自己的相机

1. **准备标定板**
   - 下载[9×6棋盘格模板](assets/checkerboard-9x6.pdf)
   - 打印到A4纸上（确保方格尺寸准确）
   - 将纸张平整粘贴到硬质板上

2. **采集标定图像**
   - 打开标定页面并允许相机访问
   - 从不同角度拍摄标定板10-20张
   - 确保：
     - 整个标定板在画面内
     - 覆盖画面中心和四角
     - 包含不同旋转角度
     - 避免模糊和过曝

3. **执行标定**
   - 采集足够图像后点击"开始标定"
   - 查看重投影误差（通常<1像素为良好）
   - 标定参数自动保存

4. **开始测量**
   - 前往测量页面
   - 选择测量模式（距离/矩形）
   - 在相机画面中点击测量点

## 📊 示例数据说明

本工具包含OpenCV官方标定数据集：

- **图像数量**：13张
- **标定板规格**：9×6内角点
- **方格尺寸**：25mm
- **图像分辨率**：640×480
- **数据来源**：[OpenCV GitHub](https://github.com/opencv/opencv/tree/4.x/samples/data)
- **许可证**：Apache 2.0 License

示例标定结果：
- **重投影误差**：0.41像素
- **焦距**：fx=536.07, fy=536.02
- **主点**：cx=342.37, cy=235.54

## 🛠️ 技术栈

- **前端**：HTML5 + CSS3 + Vanilla JavaScript
- **计算机视觉**：OpenCV.js 4.5+
- **相机访问**：WebRTC getUserMedia API
- **数据存储**：localStorage

## 📁 项目结构

```
lab-006/
├── web/                    # Web应用（发布目录）
│   ├── index.html         # 首页
│   ├── calibration.html   # 标定页面
│   ├── measurement.html   # 测量页面
│   ├── css/
│   │   └── style.css     # 样式文件
│   ├── js/
│   │   ├── calibration.js   # 标定逻辑
│   │   ├── measurement.js   # 测量逻辑
│   │   └── utils.js        # 工具函数
│   └── assets/
│       ├── samples/        # 示例图像和标定数据
│       ├── checkerboard-9x6.pdf
│       └── sample-manifest.json
├── scripts/               # 构建和生成脚本
│   ├── build.py
│   ├── download_opencv_samples.py
│   └── generate_sample_calibration.py
└── README.md
```

## 🎯 标定质量标准

**优秀**（可用于精密测量）：
- 重投影误差 < 0.5像素
- 采集图像数 ≥ 15张
- 覆盖角度多样

**良好**（可用于一般测量）：
- 重投影误差 < 1.0像素
- 采集图像数 ≥ 10张

**需要重新标定**：
- 重投影误差 > 1.5像素
- 采集图像数 < 10张
- 图像质量差（模糊、反光）

## 🔧 本地开发

```bash
# 下载示例数据
cd lab-006
python scripts/download_opencv_samples.py
python scripts/generate_sample_calibration.py

# 构建
python scripts/build.py

# 启动本地服务器
cd web
python -m http.server 8006

# 浏览器访问
open http://localhost:8006/calibration.html
```

## 📖 相关资源

- [张正友标定法论文](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr98-71.pdf)
- [OpenCV.js 文档](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
- [相机标定原理](https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html)

## 📝 已知限制

- 仅支持单相机标定（不支持双目）
- 测量功能仅适用于平面物体
- 需要HTTPS环境才能访问相机（本地localhost除外）
- OpenCV.js首次加载较慢（约8MB）

## 📄 许可证

- 代码：MIT License
- 示例数据：Apache 2.0 License（来自OpenCV项目）

## 🙋 常见问题

**Q: 为什么相机访问被拒绝？**  
A: 检查浏览器权限设置，确保允许网站访问相机。HTTPS环境是必需的（GitHub Pages自动提供）。

**Q: 检测不到棋盘格角点？**  
A: 确保光线充足、标定板完整在画面内、避免反光和模糊。

**Q: 测量结果不准确？**  
A: 确保标定质量良好（误差<1像素）、测量物体与标定板在同一平面、相机垂直于测量平面。

**Q: 可以用于非平面物体吗？**  
A: 不可以。本工具基于平面单应性变换，仅适用于平面物体测量。

---

🔗 **在线体验**: https://hub-fover.github.io/Vision-Hu13/lab-006/
