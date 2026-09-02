# LAB 006 部署指南

## 当前状态

✅ 所有代码已完成并在本地提交
❌ 网络连接 GitHub 受限，需要稍后手动推送

## 本地提交列表

```
707fe4e docs(lab006): add comprehensive README with usage guide
33293d0 chore(lab006): add pages validation script
6293155 docs: add LAB 006 camera calibration tool to README
cd4d36f feat(lab006): add build script and stage pages to web/lab-006
8c2c34e fix(lab006): move web files to web/ subdirectory for GitHub Pages
1fd9709 feat(lab006): add camera calibration and measurement tool with Apple-style UI
```

共 6 个提交，新增约 3500 行代码。

## 推送到 GitHub

当网络恢复后，在 `D:\Vision-Hu13` 目录运行：

```powershell
git push origin main
```

## 验证部署

推送成功后，等待 1-3 分钟 GitHub Pages 自动部署，然后访问：

### 在线地址
```
https://hub-fover.github.io/Vision-Hu13/lab-006/
```

### 各个页面
- 主页: https://hub-fover.github.io/Vision-Hu13/lab-006/index.html
- 标定: https://hub-fover.github.io/Vision-Hu13/lab-006/calibration.html
- 测量: https://hub-fover.github.io/Vision-Hu13/lab-006/measurement.html
- 教程: https://hub-fover.github.io/Vision-Hu13/lab-006/tutorial.html

## 本地测试

本地测试服务器正在运行（端口 8080）：

```
http://localhost:8080/lab-006/
```

测试所有页面功能：
- ✅ 主页导航和 FAQ
- ✅ 标定页面相机访问和棋盘格检测
- ✅ 测量页面距离和矩形测量
- ✅ 教程页面内容展示
- ✅ 响应式布局（调整浏览器窗口）

## 项目文件清单

### 源代码 (lab-006/web/)
- `index.html` - 主页 (5.2 KB)
- `calibration.html` - 标定页面 (4.8 KB)
- `measurement.html` - 测量页面 (4.3 KB)
- `tutorial.html` - 教程页面 (6.1 KB)
- `css/style.css` - 样式文件 (15.4 KB)
- `js/calibration.js` - 标定逻辑 (5.8 KB)
- `js/measurement.js` - 测量逻辑 (3.2 KB)
- `js/utils.js` - 工具函数 (2.1 KB)
- `assets/checkerboard-template.html` - 打印模板 (3.4 KB)

### 构建输出 (web/lab-006/)
所有文件已复制到 GitHub Pages 发布目录

### 文档
- `lab-006/README.md` - 项目文档 (7.2 KB)
- 根 `README.md` - 已添加 LAB 006 说明

### 脚本
- `lab-006/scripts/stage-pages.mjs` - 构建脚本
- `lab-006/scripts/validate-pages.mjs` - 验证脚本

## 构建命令

```powershell
# 构建 Pages 版本
npm run build:lab006

# 验证构建结果
npm run validate:lab006:pages
```

## 功能特性总结

### 🎨 设计
- 苹果风格 UI（浅色主题、大圆角、流畅动画）
- 完全响应式（375px - 1920px）
- Toast 通知系统
- 进度指示器

### 📐 标定
- WebRTC 实时相机预览
- OpenCV.js 自动角点检测
- 智能引导提示（距离、角度、光线）
- 10+ 张图像采集
- 标定结果可视化（重投影误差、焦距）
- localStorage 持久化存储

### 📏 测量
- 距离测量模式（两点间距离）
- 矩形测量模式（长宽尺寸）
- 实时画布标注
- 测量历史记录
- mm/cm 单位切换
- 一键复制结果

### 📚 文档
- 主页功能介绍
- 可折叠 FAQ
- 完整新手教程
- 打印标定板模板
- 使用流程指导

## 下一步

1. **等待网络恢复** - 推送代码到 GitHub
2. **验证部署** - 访问在线地址确认可用
3. **手机测试** - 用真实手机测试相机标定
4. **分享使用** - 将网址分享给需要的用户

## 故障排除

### 如果推送失败
```powershell
# 检查远程连接
git remote -v

# 尝试使用 SSH 而不是 HTTPS
git remote set-url origin git@github.com:hub-fover/Vision-Hu13.git
git push origin main
```

### 如果 Pages 404
1. 确认 GitHub Pages 设置指向 `main` 分支
2. 检查 `web/lab-006/` 目录是否存在
3. 等待 3-5 分钟重新部署

### 如果相机无法访问
- 确保使用 HTTPS 连接（HTTP 不允许访问相机）
- 检查浏览器权限设置
- 尝试不同的浏览器

## 技术支持

如有问题，请检查：
- 浏览器控制台的错误信息
- OpenCV.js 是否成功加载（从 CDN）
- localStorage 是否可用
- 相机权限是否授予

---

**创建时间**: 2026-09-02
**Git 分支**: main
**待推送提交数**: 6
**项目状态**: ✅ 本地完成，等待推送
