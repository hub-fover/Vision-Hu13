# LAB 006: 相机标定与测量工具

基于张正友标定法的手机相机标定与平面测量Web应用

## 🎯 功能

- **相机标定**：使用棋盘格标定板标定手机相机内参和畸变参数
- **平面测量**：基于标定结果对同平面物体进行精确测量
- **纯前端实现**：完全运行在浏览器中，基于OpenCV.js
- **移动优先设计**：专为手机浏览器优化

## 🚀 在线体验

访问：[https://hub-fover.github.io/Vision-Hu13/lab-006/](https://hub-fover.github.io/Vision-Hu13/lab-006/)

## 📖 使用指南

### 1. 准备标定板

下载并打印棋盘格模板（9×6 内角点，10×7 方格，每格 25mm）

### 2. 相机标定

1. 进入"开始标定"页面
2. 启动相机
3. 从不同角度拍摄 10-20 张棋盘格图像
4. 点击"开始标定"计算相机参数

### 3. 测量

1. 完成标定后进入"测量工具"
2. 选择测量模式（两点距离/矩形测量）
3. 标记测量点，查看结果

## 🛠️ 技术栈

- OpenCV.js 4.8.0（WebAssembly）
- WebRTC getUserMedia
- 原生 JavaScript
- localStorage

## 📐 标定原理

采用**张正友标定法**：

1. 多角度采集棋盘格图像
2. 检测棋盘格角点（亚像素精度）
3. 建立世界坐标与图像坐标映射
4. 求解相机内参矩阵和畸变系数

## 项目结构

```
lab-006/
├── index.html              # 主页
├── calibration.html        # 标定页面
├── measurement.html        # 测量页面
├── css/style.css          # 样式
├── js/
│   ├── utils.js           # 工具函数
│   ├── calibration.js     # 标定逻辑
│   └── measurement.js     # 测量逻辑
└── assets/
    └── checkerboard-template.html  # 标定板模板
```

## ⚠️ 注意事项

- 需要 HTTPS 或 localhost 才能访问相机
- 首次加载 OpenCV.js 约 8-9MB
- 标定时保持光线均匀，避免反光
- 测量仅适用于与标定板同平面的物体

## 📄 许可证

MIT License