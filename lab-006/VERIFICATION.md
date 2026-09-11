# LAB 006 验证清单

## 本地测试

### 1. 加载示例数据功能
访问: http://localhost:8006/calibration.html

- [ ] 点击"加载示例数据"按钮
- [ ] 自动加载13张棋盘格图像
- [ ] 图像计数显示为13
- [ ] 每张图像显示绿色角点标记
- [ ] "开始标定"按钮自动启用

### 2. 标定计算
继续在标定页面：

- [ ] 点击"开始标定"
- [ ] 等待标定完成（约2-5秒）
- [ ] 显示标定结果：
  - 重投影误差 < 1.0 像素
  - 焦距 fx, fy 数值合理（约640左右）
- [ ] 标定数据自动保存到localStorage

### 3. 测量功能
访问: http://localhost:8006/measurement.html

- [ ] 页面加载时自动检测标定数据
- [ ] 显示"已加载标定数据"状态
- [ ] 启动相机按钮可用
- [ ] 点击“加载测量示例”后显示完整示例画面、54 个角点和 200.00 mm 参考线
- [ ] 清除标记后点击首行两个端点，结果约为 200 mm
- [ ] 矩形模式点击四个外侧内角点，结果约为 200 × 125 mm
- [ ] 停止示例后恢复原标定状态，且示例不覆盖 localStorage 中的标定数据

### 4. 完整流程
访问: http://localhost:8006/

- [ ] 首页显示项目介绍
- [ ] 导航链接正常工作
- [ ] 教程页面内容完整
- [ ] 所有页面响应式布局正常

## GitHub Pages 部署验证

The current measurement workflow requires the chessboard to remain visible and
coplanar with the object. Without a valid board homography, clicks are rejected
and no millimetre result is produced.

部署后访问: https://hub-fover.github.io/Vision-Hu13/lab-006/

- [ ] 所有HTML页面可访问
- [ ] CSS样式正确加载
- [ ] JavaScript文件正确加载
- [ ] 示例图像可加载 (13张)
- [ ] sample-calibration.json可加载
- [ ] OpenCV.js从CDN正确加载
- [ ] 相机权限请求正常（HTTPS）
- [ ] 完整标定流程可运行
- [ ] 测量功能可运行

## 预期结果

### 标定参数范围
基于示例数据的标定结果：
- **重投影误差**: 0.3-0.8 像素
- **fx**: 520-540
- **fy**: 520-540
- **cx**: 310-330 (图像宽度的一半)
- **cy**: 230-250 (图像高度的一半)
- **畸变系数**: k1 约 -0.3 到 -0.5

### 常见问题

**Q: 加载示例后图像计数为0**
A: 检查assets/samples/路径和CORS设置

**Q: 标定失败或误差过大**
A: 检查棋盘格配置是否为9×6

**Q: 测量页面提示"未找到标定数据"**
A: 先完成标定流程，或点击"加载示例标定"

**Q: GitHub Pages上相机无法访问**
A: HTTPS必需，HTTP不支持getUserMedia

## 构建命令

```bash
# 完整构建和staging
npm run build:lab006

# 仅复制示例数据
python lab-006/scripts/build.py

# 仅staging到web目录
node lab-006/scripts/stage-pages.mjs
```

## 测试环境

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- 移动端Safari/Chrome
