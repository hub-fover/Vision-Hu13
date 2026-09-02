# LAB 006 部署指南

## 准备工作

### 1. 检查仓库状态

```bash
cd /c/Users/biaoh/Documents/Vision-Hu13
git status
```

### 2. 构建发布版本

```bash
npm run build:lab006
```

这个命令会：
- 复制示例图像到 `lab-006/web/assets/samples/`
- 复制标定数据 `sample-calibration.json`
- 将所有web资源staging到 `web/lab-006/`

### 3. 验证构建结果

```bash
# 列出staged文件
find web/lab-006 -type f

# 应该看到22个文件：
# - 4个HTML文件 (index, calibration, measurement, tutorial)
# - 3个JS文件 (utils, calibration, measurement)
# - 1个CSS文件
# - 13张示例图像
# - 1个标定数据JSON
```

## 部署到GitHub Pages

### 方法1: 直接推送（推荐）

```bash
# 1. 添加lab-006目录和web/lab-006目录
git add lab-006/
git add web/lab-006/

# 2. 提交
git commit -m "feat: add LAB 006 camera calibration tool

- Zhang's calibration method implementation
- Real-time chessboard detection with OpenCV.js
- Sample data (13 images) for one-click demo
- Measurement tools based on calibration results
- Mobile-responsive UI
- Published at /Vision-Hu13/lab-006/"

# 3. 推送到GitHub
git push origin main
```

### 方法2: 创建PR（推荐用于review）

```bash
# 1. 创建feature分支
git checkout -b feat/lab-006-camera-calibration

# 2. 添加并提交
git add lab-006/ web/lab-006/
git commit -m "feat: add LAB 006 camera calibration tool"

# 3. 推送分支
git push origin feat/lab-006-camera-calibration

# 4. 在GitHub创建Pull Request
gh pr create --title "Add LAB 006: Camera Calibration Tool" \
  --body "张正友标定法相机标定工具，包含示例数据和测量功能"
```

## GitHub Pages 配置

确保仓库设置正确：

1. 访问 https://github.com/hub-fover/Vision-Hu13/settings/pages
2. 确认设置：
   - **Source**: Deploy from a branch
   - **Branch**: main
   - **Folder**: / (root)
3. 保存后等待1-2分钟部署完成

## 验证部署

### 检查部署状态

访问: https://github.com/hub-fover/Vision-Hu13/actions

查看最新的 "pages build and deployment" workflow

### 访问应用

主页: https://hub-fover.github.io/Vision-Hu13/lab-006/

各功能页面：
- https://hub-fover.github.io/Vision-Hu13/lab-006/calibration.html
- https://hub-fover.github.io/Vision-Hu13/lab-006/measurement.html
- https://hub-fover.github.io/Vision-Hu13/lab-006/tutorial.html

### 功能测试

使用 [VERIFICATION.md](VERIFICATION.md) 中的清单逐项验证。

## 更新现有部署

如果需要更新：

```bash
# 1. 修改源文件在 lab-006/web/
# 例如：编辑 lab-006/web/js/calibration.js

# 2. 重新构建
npm run build:lab006

# 3. 提交并推送
git add lab-006/ web/lab-006/
git commit -m "fix: update calibration algorithm"
git push origin main
```

## 回滚部署

如果发现问题需要回滚：

```bash
# 1. 查看历史提交
git log --oneline web/lab-006/

# 2. 回滚到指定版本
git revert <commit-hash>

# 3. 推送
git push origin main
```

## 故障排查

### 问题1: 404 Not Found

**原因**: GitHub Pages可能还在构建中
**解决**: 等待2-5分钟，刷新页面

### 问题2: 样式/脚本加载失败

**原因**: 路径问题
**检查**: HTML中的资源路径应该是相对路径
```html
<!-- 正确 -->
<link rel="stylesheet" href="css/style.css">
<script src="js/utils.js"></script>

<!-- 错误 -->
<link rel="stylesheet" href="/css/style.css">
```

### 问题3: 示例图像加载失败

**原因**: 图像未正确staging或路径错误
**检查**:
```bash
# 确认文件存在
ls web/lab-006/assets/samples/*.jpg

# 确认HTML中的路径
grep -r "assets/samples" web/lab-006/*.html
```

### 问题4: CORS错误

**原因**: 本地测试时的CORS限制
**解决**: 使用http-server而不是file://协议
```bash
cd web/lab-006
python -m http.server 8006
```

## 分享链接

部署成功后，可以通过以下方式分享：

### 短链接（推荐）
使用bit.ly或类似服务创建短链接：
```
https://bit.ly/camera-calibration-tool
→ https://hub-fover.github.io/Vision-Hu13/lab-006/
```

### QR码
为移动端用户生成QR码：
```bash
# 使用在线工具
https://www.qr-code-generator.com/
输入: https://hub-fover.github.io/Vision-Hu13/lab-006/
```

### 嵌入HTML
如果需要在其他网站嵌入：
```html
<iframe 
  src="https://hub-fover.github.io/Vision-Hu13/lab-006/" 
  width="100%" 
  height="600" 
  frameborder="0">
</iframe>
```

## 监控和分析

### GitHub Insights
查看访问统计: https://github.com/hub-fover/Vision-Hu13/graphs/traffic

### 添加Google Analytics（可选）
在HTML的`<head>`中添加：
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```
