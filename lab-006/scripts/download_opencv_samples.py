#!/usr/bin/env python3
"""
下载OpenCV官方标定示例图像
"""
import urllib.request
import ssl
from pathlib import Path

def download_opencv_samples():
    base_url = "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/"

    # OpenCV示例图像列表 (left01.jpg - left14.jpg)
    image_files = [f"left{i:02d}.jpg" for i in range(1, 15)]

    samples_dir = Path('assets/samples')
    samples_dir.mkdir(parents=True, exist_ok=True)

    print(f"Download directory: {samples_dir.absolute()}")

    # 创建SSL上下文以避免证书验证问题
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    success_count = 0
    for img_file in image_files:
        url = base_url + img_file
        output_path = samples_dir / img_file

        try:
            print(f"Downloading {img_file}...", end=' ')
            with urllib.request.urlopen(url, context=ssl_context) as response:
                with open(output_path, 'wb') as out_file:
                    out_file.write(response.read())
            print("OK")
            success_count += 1
        except Exception as e:
            print(f"FAILED ({e})")

    print(f"\nSuccessfully downloaded {success_count}/{len(image_files)} images")
    return success_count

if __name__ == '__main__':
    download_opencv_samples()
