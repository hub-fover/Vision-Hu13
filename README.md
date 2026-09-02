# 📷 相机标定工具

基于张正友标定法的手机相机标定与测量Web应用

## ✨ 功能特点

- 📐 **相机标定**：使用棋盘格标定板精确标定手机相机内参和畸变参数
- 📏 **精确测量**：基于标定结果对平面物体进行毫米级精度测量
- 💾 **数据管理**：本地存储标定数据，无需重复标定
- 🌐 **纯前端**：完全运行在浏览器中，无需后端服务器
- 📱 **移动优先**：专为手机浏览器设计，支持实时相机预览

## 🚀 快速开始

### 在线使用

访问：[https://hub-fover.github.io/Vision-Hu13/](https://hub-fover.github.io/Vision-Hu13/)

### 本地运行

1. 克隆仓库：
```bash
git clone https://github.com/hub-fover/Vision-Hu13.git
cd Vision-Hu13
```

2. 启动本地服务器：
```bash
# 使用 Python 3
python -m http.server 8000

# 或使用 Node.js
npx serve
```

3. 在浏览器中打开：`http://localhost:8000`

## 📖 使用指南

### 1. 准备标定板

- 下载并打印棋盘格模板（9×6 内角点，10×7 方格）
- 使用 A4 纸，每个方格 25mm × 25mm
- 建议贴在硬纸板上保持平整

### 2. 相机标定

1. 进入"开始标定"页面
2. 配置棋盘格参数（默认值通常无需修改）
3. 启动相机
4. 从不同角度、距离拍摄 10-20 张棋盘格图像
   - 建议角度变化：0°, 15°, 30°, 45°
   - 建议距离：30-80cm
   - 确保整个棋盘格在画面内
5. 点击"开始标定"计算相机参数

### 3. 进行测量

1. 完成标定后进入"测量工具"
2. 选择测量模式：
   - **两点距离**：测量平面上两点间的距离
   - **矩形测量**：测量矩形物体的长宽
3. 启动相机并点击画面标记测量点
4. 查看实时测量结果

## 🛠️ 技术栈

- **OpenCV.js** 4.8.0 - 计算机视觉库（WebAssembly）
- **WebRTC** - 访问设备相机
- **原生 JavaScript** - 零依赖，纯前端实现
- **localStorage** - 本地数据存储

## 📐 标定原理

本工具使用**张正友标定法**（Zhang's Calibration Method）：

1. 采集多个角度的棋盘格图像
2. 检测棋盘格角点（亚像素精度）
3. 建立世界坐标系与图像坐标系的对应关系
4. 通过优化算法求解相机内参矩阵和畸变系数

标定结果包括：
- **内参矩阵**：焦距 (fx, fy)、光心 (cx, cy)
- **畸变系数**：径向畸变 (k1, k2, k3) 和切向畸变 (p1, p2)
- **重投影误差**：评估标定精度

## 📁 项目结构

```
Vision-Hu13/
├── index.html              # 主页
├── calibration.html        # 标定页面
├── measurement.html        # 测量页面
├── css/
│   └── style.css          # 样式文件
├── js/
│   ├── utils.js           # 工具函数
│   ├── calibration.js     # 标定逻辑
│   └── measurement.js     # 测量逻辑
├── assets/
│   └── checkerboard-template.html  # 标定板模板
└── README.md
```

## ⚠️ 注意事项

- 需要 HTTPS 或 localhost 环境才能访问相机
- 首次加载 OpenCV.js 需要下载约 8-9MB
- 标定时光线要均匀，避免反光和阴影
- 测量仅适用于与标定板同平面的物体
- 建议使用后置摄像头以获得更好的效果

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关资源

- [OpenCV.js 文档](https://docs.opencv.org/4.8.0/d5/d10/tutorial_js_root.html)
- [张正友标定法论文](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr98-71.pdf)
- [相机标定原理](https://opencv24-python-tutorials.readthedocs.io/en/latest/py_tutorials/py_calib3d/py_calibration/py_calibration.html)