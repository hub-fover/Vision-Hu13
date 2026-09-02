# LAB 006 项目总结

## 项目概述

**项目名称**: 相机标定与测量工具 (Camera Calibration Tool)  
**实现方法**: 张正友标定法 (Zhang's Calibration Method)  
**技术栈**: HTML5 + CSS3 + JavaScript + OpenCV.js  
**部署平台**: GitHub Pages  
**目标URL**: https://hub-fover.github.io/Vision-Hu13/lab-006/

## 核心功能

### 1. 相机标定 (Camera Calibration)
- **输入**: 10-20张包含9×6棋盘格的图像
- **处理**: 
  - 自动检测棋盘格角点
  - 计算相机内参矩阵 (fx, fy, cx, cy)
  - 计算畸变系数 (k1, k2, p1, p2, k3)
  - 计算重投影误差
- **输出**: 标定结果保存到localStorage

### 2. 测量功能 (Measurement)
- **距离测量**: 点击两点，计算实际距离（毫米）
- **矩形测量**: 点击四个点，计算矩形尺寸
- **基础**: 使用标定结果进行畸变校正

### 3. 示例数据（一键体验）
- **13张示例图像**: 来自OpenCV官方stereo calibration数据集
- **预生成标定数据**: 跳过标定直接体验测量
- **完整流程演示**: 普通用户无需打印棋盘格

## 项目结构

```
lab-006/
├── web/                          # 前端应用
│   ├── index.html               # 首页
│   ├── calibration.html         # 标定页面
│   ├── measurement.html         # 测量页面
│   ├── tutorial.html            # 使用教程
│   ├── css/style.css            # 样式
│   ├── js/
│   │   ├── utils.js            # 工具函数
│   │   ├── calibration.js      # 标定逻辑
│   │   └── measurement.js      # 测量逻辑
│   └── assets/samples/         # 示例数据
│       ├── left01.jpg ~ left14.jpg  # 13张图像
│       └── sample-calibration.json  # 预生成标定数据
├── scripts/                     # 构建脚本
│   ├── build.py                # 复制示例数据
│   ├── stage-pages.mjs         # Staging到GitHub Pages
│   ├── download_opencv_samples.py    # 下载示例图像
│   └── generate_sample_calibration.py # 生成标定数据
├── assets/samples/             # 源示例数据
├── README.md                   # 项目说明
├── IMPLEMENTATION.md           # 实现细节
├── VERIFICATION.md             # 验证清单
└── DEPLOYMENT.md               # 部署指南
```

## 技术亮点

### 1. 纯前端实现
- 无需后端服务器
- 所有计算在浏览器中完成
- 图像数据不上传，保护隐私

### 2. OpenCV.js集成
```javascript
// 从CDN加载OpenCV.js
<script async src="https://docs.opencv.org/4.8.0/opencv.js"></script>

// 使用cv.calibrateCamera进行标定
const error = cv.calibrateCamera(
    objectPoints,  // 3D点（棋盘格世界坐标）
    imagePoints,   // 2D点（图像坐标）
    imageSize,     // 图像尺寸
    cameraMatrix,  // 输出：相机内参
    distCoeffs,    // 输出：畸变系数
    rvecs, tvecs,  // 输出：旋转和平移向量
    0              // 标志位
);
```

### 3. 响应式设计
- 移动端优化（手机相机访问）
- 深色主题（减少眼疲劳）
- 流畅动画和交互反馈

### 4. 一键示例功能
```javascript
// calibration.js
async function loadSampleData() {
    const sampleCount = 13;
    for (let i = 1; i <= 14; i++) {
        if (i === 10) continue;  // 跳过left10
        const img = new Image();
        img.src = `assets/samples/left${String(i).padStart(2, '0')}.jpg`;
        await img.decode();
        // 检测角点并存储
    }
}
```

## 标定参数说明

### 相机内参矩阵
```
[fx  0  cx]
[ 0 fy  cy]
[ 0  0   1]
```
- **fx, fy**: 焦距（像素单位）
- **cx, cy**: 主点坐标（通常在图像中心）

### 畸变系数
```
[k1, k2, p1, p2, k3]
```
- **k1, k2, k3**: 径向畸变系数
- **p1, p2**: 切向畸变系数

### 示例数据的标定结果
```json
{
  "cameraMatrix": [
    532.8, 0, 342.5,
    0, 532.9, 233.9,
    0, 0, 1
  ],
  "distCoeffs": [-0.287, 0.073, 0.001, -0.0006, -0.004],
  "imageSize": {"width": 640, "height": 480},
  "error": 0.503
}
```
- 重投影误差: 0.503像素（优秀）
- 图像尺寸: 640×480

## 使用流程

### 方式1: 使用示例数据（推荐初次使用）
1. 访问 https://hub-fover.github.io/Vision-Hu13/lab-006/calibration.html
2. 点击 **"加载示例数据"**
3. 等待13张图像自动加载（每张显示绿色角点）
4. 点击 **"开始标定"**
5. 查看标定结果（约2-5秒）
6. 进入测量页面测试

### 方式2: 使用自己的相机
1. 下载并打印9×6棋盘格（方格边长推荐20-30mm）
2. 访问标定页面，启动相机
3. 对准棋盘格，调整角度和距离
4. 当检测到角点时点击 **"拍摄"**
5. 采集10-20张不同角度的图像
6. 点击 **"开始标定"**
7. 完成后进入测量页面

## 构建和部署

### 本地开发
```bash
# 启动开发服务器
cd lab-006/web
python -m http.server 8006

# 访问
http://localhost:8006/
```

### 构建发布版本
```bash
# 在仓库根目录
npm run build:lab006

# 这会：
# 1. 复制示例数据到 lab-006/web/assets/samples/
# 2. Staging所有文件到 web/lab-006/
```

### 部署到GitHub Pages
```bash
# 1. 提交更改
git add lab-006/ web/lab-006/
git commit -m "feat: add LAB 006 camera calibration tool"

# 2. 推送到GitHub
git push origin main

# 3. GitHub Actions自动部署
# 等待1-2分钟后访问：
# https://hub-fover.github.io/Vision-Hu13/lab-006/
```

## 验证清单

### 本地测试
- [x] 加载示例数据功能
- [x] 棋盘格角点自动检测
- [x] 标定计算成功
- [x] 重投影误差 < 1.0像素
- [x] 标定数据保存到localStorage
- [x] 测量页面加载标定数据
- [x] 距离测量功能
- [x] 矩形测量功能
- [x] 移动端相机访问
- [x] 响应式布局

### GitHub Pages测试
- [ ] 所有HTML页面可访问
- [ ] CSS/JS正确加载
- [ ] 示例图像可加载
- [ ] OpenCV.js从CDN加载
- [ ] HTTPS相机权限正常
- [ ] 完整流程可运行

## 待办事项

### 短期改进
- [ ] 添加更多测量模式（角度、面积）
- [ ] 优化移动端UI（大按钮、触摸友好）
- [ ] 添加标定质量评估指标
- [ ] 支持导出/导入标定数据

### 长期规划
- [ ] 3D物体测量
- [ ] AR标尺功能
- [ ] 多相机标定
- [ ] 深度学习辅助角点检测

## 已知问题

1. **OpenCV.js加载慢**: 首次加载约8MB，建议添加本地缓存
2. **移动端性能**: 标定计算在低端手机上可能较慢
3. **相机权限**: HTTP环境无法访问相机，必须使用HTTPS
4. **示例图像大小**: 13张图像共约2MB，首次加载需时间

## 性能指标

### 标定性能
- **图像采集**: 10-20张（推荐15张）
- **标定时间**: 2-5秒（取决于图像数量和分辨率）
- **重投影误差**: 通常 < 0.5像素为优秀，< 1.0像素为可接受

### 测量精度
- **理论精度**: 取决于标定质量和测量距离
- **实际精度**: 在1米内可达1-2mm（标定误差0.5像素时）

## 参考资源

### 学术论文
- Zhang, Z. (2000). "A flexible new technique for camera calibration"
  IEEE Transactions on Pattern Analysis and Machine Intelligence

### OpenCV文档
- Camera Calibration: https://docs.opencv.org/4.8.0/dc/dbb/tutorial_py_calibration.html
- OpenCV.js: https://docs.opencv.org/4.8.0/d5/d10/tutorial_js_root.html

### 示例数据来源
- OpenCV Stereo Calibration Dataset
- https://github.com/opencv/opencv/tree/4.x/samples/data

## 许可证

- **代码**: MIT License
- **示例图像**: OpenCV BSD License
- **文档**: CC BY 4.0

## 贡献者

- 初始开发: Claude Opus 5 (1M context)
- 项目维护: hub-fover

## 联系方式

- GitHub Issues: https://github.com/hub-fover/Vision-Hu13/issues
- 项目主页: https://hub-fover.github.io/Vision-Hu13/

---

**创建日期**: 2026-09-02  
**最后更新**: 2026-09-03  
**版本**: 1.0.0  
**状态**: ✅ 开发完成，待部署
