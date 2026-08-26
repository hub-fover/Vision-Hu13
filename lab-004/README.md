# LAB 004｜手机对静止物反算速度

对准一面有纹理的静止墙面、地砖或门框，移动手机并观察画面中静止世界
的整体位移，LAB 004 会给出参考级的 m/s、km/h、方向和跟踪诊断。它不读
GPS，也不上传视频；速度是局部平面下的表观估计，不替代测量仪器。

实时后置相机是主入口，MP4/WebM 或帧目录是离线备用入口。开始前在同一
结构上选择两个点并输入实测距离，不能猜测门宽或地砖尺寸。LK 光流、前后
向检查和 RANSAC 仿射模型是唯一公开算法路径。

```powershell
python -m pip install -e lab-004
python -m camera_measurement analyze-frames frames \
  --target-roi roi.json --scale-points scale.json --fps 30 --output speed-report.json
python -m camera_measurement measure-video input.webm \
  --target-roi roi.json --scale-points scale.json --output speed-report.json
python -m camera_measurement track --camera 0 \
  --target-roi roi.json --scale-points scale.json --output speed-report.json
```

`roi.json` 使用 `xPx/yPx/widthPx/heightPx`，`scale.json` 使用
`p1Px/p2Px/realDistance/unit`（`mm`、`cm` 或 `m`）。所有处理均在本地内存
完成，不使用 Cookie、Storage、IndexedDB、遥测或云端运行时。
