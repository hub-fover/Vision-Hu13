# LAB 006 - 相机标定与测量工具

基于张正友标定法的移动端相机标定与精确测量Web应用。

[在线体验](https://hub-fover.github.io/Vision-Hu13/lab-006/)

## 功能特点

### 📐 相机标定
- **WebRTC 实时相机访问** - 使用手机后置摄像头
- **自动棋盘格检测** - OpenCV.js 实时角点检测
- **智能引导系统** - 动态提示最佳拍摄角度和距离
- **进度可视化** - 三步进度指示器和采集计数
- **标定结果分析** - 显示重投影误差、焦距等内参
- **本地存储** - 标定结果保存在浏览器 localStorage

### 📏 精确测量
- **距离测量** - 两点间的毫米级距离测量
- **矩形测量** - 测量物体的长宽尺寸
- **实时预览** - 画布标注测量点和连线
- **测量历史** - 自动保存所有测量记录
- **单位切换** - 支持毫米/厘米显示
- **一键复制** - 快速复制测量结果

### 🎓 零基础友好
- **完整教程页面** - 从打印标定板到完成测量的全流程指导
- **FAQ 折叠面板** - 常见问题解答
- **操作提示** - 每个步骤都有清晰的文字和图标引导
- **打印模板** - 内置标准 8×6 棋盘格模板

## 技术架构

- **OpenCV.js 4.x** - WebAssembly 版本的 OpenCV，在浏览器中运行计算机视觉算法
- **张正友标定法** - 经典的相机标定算法（1998）
- **纯前端实现** - HTML5 + CSS3 + Vanilla JavaScript
- **响应式设计** - 支持 375px - 1920px 屏幕
- **零依赖构建** - 无需 npm 依赖，直接从 CDN 加载 OpenCV.js

## 目录结构

```
lab-006/
├── README.md                          # 本文档
├── web/                               # 源代码目录
│   ├── index.html                     # 主页
│   ├── calibration.html               # 标定页面
│   ├── measurement.html               # 测量页面
│   ├── tutorial.html                  # 教程页面
│   ├── css/
│   │   └── style.css                  # 苹果风格样式
│   ├── js/
│   │   ├── calibration.js             # 标定逻辑（角点检测、标定计算）
│   │   ├── measurement.js             # 测量逻辑（畸变校正、距离计算）
│   │   └── utils.js                   # 工具函数（状态管理、存储）
│   └── assets/
│       └── checkerboard-template.html # 8×6 棋盘格打印模板
└── scripts/
    └── stage-pages.mjs                # GitHub Pages 构建脚本
```

## 构建与部署

### 本地开发

在仓库根目录启动 HTTP 服务器：

```powershell
python -m http.server 8080
```

访问 `http://localhost:8080/web/lab-006/`

### 构建 GitHub Pages 版本

```powershell
npm run build:lab006
```

此命令会将 `lab-006/web/` 的内容复制到 `web/lab-006/` 供 GitHub Pages 发布。

### 验证构建

```powershell
npm run validate:lab006:pages
```

检查所有必需文件是否已正确复制到发布目录。

## 使用流程

### 1. 打印标定板

- 访问主页，点击"打印标定板"按钮
- 下载并打印 8×6 棋盘格（每个方格 25mm）
- 将标定板贴在硬质平板上保持平整

### 2. 相机标定

- 用手机访问标定页面
- 允许相机访问权限
- 按照智能引导提示拍摄 10+ 张不同角度的标定板照片：
  - 正面、左倾、右倾、上倾、下倾
  - 近距离、远距离
  - 不同位置（中心、边缘）
- 等待标定计算完成
- 查看标定结果（重投影误差应 < 1.0 像素）

### 3. 精确测量

- 进入测量页面（自动加载标定参数）
- 选择测量模式（距离/矩形）
- 在画面中点击标记测量点
- 查看实时测量结果
- 所有记录自动保存到历史列表

## 技术细节

### 张正友标定法

使用多张不同角度的棋盘格图像标定相机：

1. **角点检测** - `cv.findChessboardCorners()` 检测棋盘格角点
2. **亚像素精化** - `cv.cornerSubPix()` 提高角点精度
3. **标定计算** - `cv.calibrateCamera()` 求解相机矩阵和畸变系数
4. **畸变校正** - `cv.undistort()` 消除镜头畸变

### 测量原理

基于针孔相机模型和已知的标定板方格尺寸：

```
realDistance = pixelDistance × squareSize / focalLength
```

其中：
- `pixelDistance` - 图像平面上的像素距离
- `squareSize` - 标定板方格的实际尺寸（25mm）
- `focalLength` - 相机内参矩阵中的焦距 `fx`

### 数据存储

所有数据存储在浏览器 localStorage：

- `calibrationData` - 相机内参矩阵、畸变系数、图像尺寸、重投影误差
- `measurementHistory` - 测量记录数组（时间、类型、结果、单位）

## 能力边界

- ✅ 适用于平面物体测量
- ✅ 精度取决于标定质量（通常 ±2-5mm）
- ❌ 不适用于曲面、三维物体
- ❌ 不支持多相机或立体视觉
- ❌ 不支持实时追踪或 AR 叠加

## 浏览器兼容性

- Chrome 90+ / Edge 90+ / Safari 14+ / Firefox 88+
- 需要支持 WebRTC、WebAssembly、ES6
- 移动端推荐使用后置摄像头

## 许可证

与主仓库保持一致：
- 代码：MIT License
- 文档：CC BY 4.0

## 参考资料

- [Zhang's Calibration Method (1998)](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr98-71.pdf)
- [OpenCV.js Documentation](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
- [Camera Calibration Tutorial](https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html)
