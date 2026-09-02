# 📚 LAB 006 文档导航

欢迎使用LAB 006相机标定工具！本目录包含完整的项目文档，帮助你快速了解和使用本工具。

---

## 🚀 新手快速开始

如果你是第一次使用，建议按以下顺序阅读：

1. **[README.md](README.md)** - 5分钟了解项目概况
2. **[QUICK-START.md](QUICK-START.md)** - 快速上手指南
3. **在线体验** - https://hub-fover.github.io/Vision-Hu13/lab-006/

---

## 📖 文档清单

### 用户文档（使用工具）

| 文档 | 描述 | 适合人群 | 阅读时间 |
|------|------|----------|----------|
| [README.md](README.md) | 项目说明、功能介绍、快速开始 | 所有用户 | 5分钟 |
| [QUICK-START.md](QUICK-START.md) | 详细的使用教程和常见问题 | 新手用户 | 10分钟 |
| [tutorial.html](web/tutorial.html) | 在线交互式教程 | 所有用户 | 在线阅读 |

### 开发文档（了解实现）

| 文档 | 描述 | 适合人群 | 阅读时间 |
|------|------|----------|----------|
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | 技术实现细节和算法说明 | 开发者 | 15分钟 |
| [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) | 项目总结、功能清单、技术亮点 | 开发者、管理者 | 20分钟 |
| [VERIFICATION.md](VERIFICATION.md) | 功能验证清单和测试指南 | 测试人员、开发者 | 10分钟 |

### 部署文档（发布到线上）

| 文档 | 描述 | 适合人群 | 阅读时间 |
|------|------|----------|----------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | 完整的部署流程和故障排查 | 运维人员 | 15分钟 |
| [DEPLOY-NOW.md](DEPLOY-NOW.md) | 快速部署命令清单 | 运维人员 | 2分钟 |
| [PRE-DEPLOYMENT-CHECKLIST.md](PRE-DEPLOYMENT-CHECKLIST.md) | 部署前检查清单 | 运维人员、开发者 | 10分钟 |

### 项目管理文档

| 文档 | 描述 | 适合人群 | 阅读时间 |
|------|------|----------|----------|
| [DELIVERY.md](DELIVERY.md) | 项目交付文档，完整总结 | 管理者、客户 | 15分钟 |
| [FINAL-REPORT.txt](FINAL-REPORT.txt) | 最终报告（纯文本格式） | 所有人 | 10分钟 |

---

## 🎯 按场景选择文档

### 场景1: 我想快速体验工具
1. 访问 https://hub-fover.github.io/Vision-Hu13/lab-006/calibration.html
2. 点击"加载示例数据"
3. 点击"开始标定"
4. 进入测量页面体验

不需要阅读任何文档，直接上手！

### 场景2: 我想用自己的相机标定
阅读：[QUICK-START.md](QUICK-START.md) → "使用自己的相机"部分

### 场景3: 我想了解技术原理
阅读顺序：
1. [README.md](README.md) - 了解概况
2. [IMPLEMENTATION.md](IMPLEMENTATION.md) - 技术细节
3. [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) - 完整总结

### 场景4: 我想在本地运行
```bash
cd lab-006/web
python -m http.server 8006
# 访问 http://localhost:8006/
```

详见：[README.md](README.md) → "本地开发"部分

### 场景5: 我想部署到GitHub Pages
阅读顺序：
1. [PRE-DEPLOYMENT-CHECKLIST.md](PRE-DEPLOYMENT-CHECKLIST.md) - 检查清单
2. [DEPLOY-NOW.md](DEPLOY-NOW.md) - 快速部署
3. [DEPLOYMENT.md](DEPLOYMENT.md) - 详细指南

### 场景6: 我想贡献代码
阅读顺序：
1. [IMPLEMENTATION.md](IMPLEMENTATION.md) - 了解架构
2. [VERIFICATION.md](VERIFICATION.md) - 测试标准
3. 查看代码注释

---

## 📂 目录结构

```
lab-006/
├── README.md                          # 项目说明（从这里开始）
├── QUICK-START.md                     # 快速开始指南
├── IMPLEMENTATION.md                  # 技术实现细节
├── PROJECT-SUMMARY.md                 # 项目总结
├── VERIFICATION.md                    # 验证清单
├── DEPLOYMENT.md                      # 部署指南
├── DEPLOY-NOW.md                      # 快速部署命令
├── PRE-DEPLOYMENT-CHECKLIST.md        # 部署前检查
├── DELIVERY.md                        # 交付文档
├── FINAL-REPORT.txt                   # 最终报告
├── INDEX.md                           # 本文档（文档导航）
│
├── web/                               # Web应用（发布目录）
│   ├── index.html                     # 首页
│   ├── calibration.html               # 标定页面
│   ├── measurement.html               # 测量页面
│   ├── tutorial.html                  # 教程页面
│   ├── css/style.css                  # 样式
│   ├── js/                            # JavaScript代码
│   │   ├── utils.js
│   │   ├── calibration.js
│   │   └── measurement.js
│   └── assets/samples/                # 示例数据
│       ├── left01.jpg ~ left14.jpg
│       └── sample-calibration.json
│
├── scripts/                           # 构建脚本
│   ├── build.py
│   ├── stage-pages.mjs
│   ├── download_opencv_samples.py
│   └── generate_sample_calibration.py
│
└── assets/                            # 源示例数据
    └── samples/
```

---

## 🔗 快速链接

### 在线应用
- 主页: https://hub-fover.github.io/Vision-Hu13/lab-006/
- 标定: https://hub-fover.github.io/Vision-Hu13/lab-006/calibration.html
- 测量: https://hub-fover.github.io/Vision-Hu13/lab-006/measurement.html
- 教程: https://hub-fover.github.io/Vision-Hu13/lab-006/tutorial.html

### 代码仓库
- GitHub: https://github.com/hub-fover/Vision-Hu13
- 分支: lab-006-camera-calibration

### 学习资源
- [张正友标定法论文](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr98-71.pdf)
- [OpenCV.js 文档](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
- [OpenCV标定教程](https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html)

---

## 🎓 文档阅读建议

### 按角色推荐

**普通用户**:
- README.md → QUICK-START.md → 在线体验

**技术爱好者**:
- README.md → IMPLEMENTATION.md → PROJECT-SUMMARY.md → 源代码

**开发者**:
- README.md → IMPLEMENTATION.md → VERIFICATION.md → 代码和构建脚本

**运维人员**:
- README.md → DEPLOYMENT.md → PRE-DEPLOYMENT-CHECKLIST.md → DEPLOY-NOW.md

**项目管理者**:
- DELIVERY.md → PROJECT-SUMMARY.md → FINAL-REPORT.txt

---

## 💡 提示

- 所有文档都使用Markdown格式，可以在GitHub、VSCode、Typora等工具中阅读
- 文档中的链接都是相对路径，可以离线阅读
- 代码示例都可以直接复制粘贴使用
- 遇到问题先查看 QUICK-START.md 的"常见问题"部分

---

## 📞 需要帮助？

- **Bug报告**: https://github.com/hub-fover/Vision-Hu13/issues
- **功能建议**: https://github.com/hub-fover/Vision-Hu13/issues
- **问题讨论**: https://github.com/hub-fover/Vision-Hu13/discussions

---

**最后更新**: 2026-09-03  
**文档版本**: 1.0.0  
**项目状态**: ✅ 开发完成，等待部署
