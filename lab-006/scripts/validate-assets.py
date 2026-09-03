#!/usr/bin/env python3
"""验证LAB 006公共资源完整性"""

import sys
from pathlib import Path

# 项目根目录
repo_root = Path(__file__).parent.parent.parent
web_dir = repo_root / "web" / "lab-006"
lab_dir = repo_root / "lab-006"

# 必需的资源文件
required_assets = [
    # 示例图像
    "lab-006/assets/samples/left01.jpg",
    "lab-006/assets/samples/left02.jpg",
    "lab-006/assets/samples/left03.jpg",
    "lab-006/assets/samples/left04.jpg",
    "lab-006/assets/samples/left05.jpg",
    "lab-006/assets/samples/left06.jpg",
    "lab-006/assets/samples/left07.jpg",
    "lab-006/assets/samples/left08.jpg",
    "lab-006/assets/samples/left09.jpg",
    "lab-006/assets/samples/left11.jpg",
    "lab-006/assets/samples/left12.jpg",
    "lab-006/assets/samples/left13.jpg",
    "lab-006/assets/samples/left14.jpg",
    "lab-006/assets/samples/sample-calibration.json",
]

print("🔍 验证 LAB 006 公共资源...\n")

all_passed = True

for asset in required_assets:
    asset_path = repo_root / asset

    if asset_path.exists():
        size = asset_path.stat().st_size
        print(f"✅ {asset} ({size / 1024:.2f} KB)")
    else:
        print(f"❌ {asset} - 文件不存在")
        all_passed = False

print("\n📊 总结:")
if all_passed:
    print("✅ 所有公共资源验证通过")
    sys.exit(0)
else:
    print("❌ 部分资源缺失")
    print("\n💡 提示: 运行以下命令下载示例图像:")
    print("   python lab-006/scripts/download_opencv_samples.py")
    sys.exit(1)
