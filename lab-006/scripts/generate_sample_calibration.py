#!/usr/bin/env python3
"""
生成示例标定数据
基于OpenCV示例图像计算真实的标定参数
"""
import cv2
import numpy as np
import json
from pathlib import Path
from datetime import datetime

def generate_sample_calibration():
    # 标定板配置
    board_width = 9
    board_height = 6
    square_size = 25.0  # mm

    # 准备物体点
    objp = np.zeros((board_height * board_width, 3), np.float32)
    objp[:, :2] = np.mgrid[0:board_width, 0:board_height].T.reshape(-1, 2)
    objp *= square_size

    # 存储所有图像的物体点和图像点
    objpoints = []  # 3D点
    imgpoints = []  # 2D点

    samples_dir = Path('lab-006/assets/samples')
    if not samples_dir.exists():
        samples_dir = Path('assets/samples')

    image_files = sorted(samples_dir.glob('left*.jpg'))

    print(f"Search directory: {samples_dir.absolute()}")
    print(f"Found {len(image_files)} calibration images")

    img_size = None
    success_count = 0

    for img_path in image_files:
        img = cv2.imread(str(img_path))
        if img is None:
            print(f"Cannot read image: {img_path.name}")
            continue

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        if img_size is None:
            img_size = gray.shape[::-1]

        # 查找棋盘格角点
        ret, corners = cv2.findChessboardCorners(
            gray, (board_width, board_height), None
        )

        if ret:
            # 亚像素精度优化
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
            corners2 = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)

            objpoints.append(objp)
            imgpoints.append(corners2)
            success_count += 1
            print(f"OK {img_path.name}")
        else:
            print(f"SKIP {img_path.name} - no corners found")

    print(f"\nSuccessfully processed {success_count}/{len(image_files)} images")

    if success_count < 10:
        print("Error: At least 10 valid images required")
        return None

    # 执行标定
    print("\nStarting calibration...")
    ret, camera_matrix, dist_coeffs, rvecs, tvecs = cv2.calibrateCamera(
        objpoints, imgpoints, img_size, None, None
    )

    print(f"Calibration complete! Reprojection error: {ret:.4f} pixels")
    print(f"Focal length: fx={camera_matrix[0,0]:.2f}, fy={camera_matrix[1,1]:.2f}")
    print(f"Principal point: cx={camera_matrix[0,2]:.2f}, cy={camera_matrix[1,2]:.2f}")

    # 生成JSON格式
    calibration_data = {
        "cameraMatrix": camera_matrix.flatten().tolist(),
        "distCoeffs": dist_coeffs.flatten().tolist(),
        "imageSize": {
            "width": int(img_size[0]),
            "height": int(img_size[1])
        },
        "error": float(ret),
        "date": datetime.now().isoformat(),
        "squareSize": square_size,
        "boardConfig": {
            "width": board_width,
            "height": board_height
        },
        "note": "This is sample calibration data generated from OpenCV example images"
    }

    # 保存到文件
    output_path = samples_dir / 'sample-calibration.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(calibration_data, f, indent=2, ensure_ascii=False)

    print(f"\nSaved to: {output_path}")
    return calibration_data

if __name__ == '__main__':
    generate_sample_calibration()
