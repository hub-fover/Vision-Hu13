#!/usr/bin/env python3
"""
LAB 006构建脚本：复制示例数据到web目录
"""
from pathlib import Path
import shutil
import hashlib

OPENCV_FILES = {
    'opencv.js': '9e80c53ca941f90ba3a629e6148bc1d830323d903b2f111d36398281bf8efa85',
    'opencv.wasm': '93d75757b940d81c7ff694e53259b96bd5f695eab905116f7b65f1c6d2c5340c',
}

def build():
    lab_root = Path(__file__).parent.parent
    web_dir = lab_root / 'web'
    assets_src = lab_root / 'assets'
    assets_dst = web_dir / 'assets'
    vendor_src = web_dir / 'node_modules' / 'fast-opencv-wasm'
    vendor_dst = web_dir / 'vendor'

    print("Building LAB 006...")
    print(f"Source: {assets_src}")
    print(f"Destination: {assets_dst}")

    # 创建目标目录
    assets_dst.mkdir(parents=True, exist_ok=True)

    # 复制samples目录
    samples_src = assets_src / 'samples'
    samples_dst = assets_dst / 'samples'

    if samples_src.exists():
        if samples_dst.exists():
            shutil.rmtree(samples_dst)
        shutil.copytree(samples_src, samples_dst)

        # 统计文件
        jpg_count = len(list(samples_dst.glob('*.jpg')))
        json_count = len(list(samples_dst.glob('*.json')))

        print(f"Copied {jpg_count} images and {json_count} JSON files")
    else:
        print("Warning: samples directory not found")

    # 复制其他资源文件
    for file in ['sample-manifest.json', 'SAMPLES_LICENSE.txt']:
        src_file = assets_src / file
        if src_file.exists():
            shutil.copy2(src_file, assets_dst / file)
            print(f"Copied {file}")

    vendor_dst.mkdir(parents=True, exist_ok=True)
    sources = {'opencv.js': vendor_src / 'opencv.min.js', 'opencv.wasm': vendor_src / 'opencv.wasm'}
    for name, expected in OPENCV_FILES.items():
        source = sources[name]
        if not source.exists():
            raise FileNotFoundError(f'Missing fixed OpenCV runtime: {source}; run npm ci --prefix lab-006/web')
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if digest != expected:
            raise RuntimeError(f'{name} checksum mismatch: {digest}')
        shutil.copy2(source, vendor_dst / name)
        print(f'Verified {name} SHA-256: {digest}')

    print("\nBuild complete!")
    print(f"Test at: http://localhost:8006/calibration.html")

if __name__ == '__main__':
    build()
