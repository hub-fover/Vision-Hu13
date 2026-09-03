#!/usr/bin/env python3
"""验证LAB 006公共资源完整性"""

import sys
import os
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

# 设置UTF-8输出（Windows兼容）
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

print("Validating LAB 006 assets...\n")

all_passed = True

for asset in required_assets:
    asset_path = repo_root / asset

    if asset_path.exists():
        size = asset_path.stat().st_size
        print(f"[OK] {asset} ({size / 1024:.2f} KB)")
    else:
        print(f"[FAIL] {asset} - File not found")
        all_passed = False

print("\nSummary:")
if all_passed:
    print("[OK] All assets validated successfully")
    sys.exit(0)
else:
    print("[FAIL] Some assets are missing")
    print("\nHint: Run the following command to download sample images:")
    print("   python lab-006/scripts/download_opencv_samples.py")
    sys.exit(1)
