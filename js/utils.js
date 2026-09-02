// OpenCV.js 加载状态
let opencvReady = false;

// OpenCV.js 加载完成回调
function onOpenCvReady() {
    opencvReady = true;
    console.log('OpenCV.js 已加载');
    if (typeof onOpenCVLoad === 'function') {
        onOpenCVLoad();
    }
}

// 显示状态消息
function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.textContent = message;
    element.className = 'status-message';

    if (type === 'success') {
        element.classList.add('status-success');
    } else if (type === 'error') {
        element.classList.add('status-error');
    } else {
        element.classList.add('status-info');
    }
}

// 保存标定结果到 localStorage
function saveCalibration(data) {
    try {
        localStorage.setItem('cameraCalibration', JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('保存标定数据失败:', e);
        return false;
    }
}

// 加载标定结果
function loadCalibration() {
    try {
        const data = localStorage.getItem('cameraCalibration');
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('加载标定数据失败:', e);
        return null;
    }
}

// 清除标定结果
function clearCalibration() {
    localStorage.removeItem('cameraCalibration');
}

// 检测棋盘格角点
function detectChessboardCorners(imageMat, patternSize) {
    const corners = new cv.Mat();
    const found = cv.findChessboardCorners(
        imageMat,
        patternSize,
        corners,
        cv.CALIB_CB_ADAPTIVE_THRESH + cv.CALIB_CB_NORMALIZE_IMAGE
    );

    if (found) {
        // 亚像素精细化
        const gray = new cv.Mat();
        cv.cvtColor(imageMat, gray, cv.COLOR_RGBA2GRAY);
        const criteria = new cv.TermCriteria(
            cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER,
            30,
            0.001
        );
        cv.cornerSubPix(gray, corners, new cv.Size(11, 11), new cv.Size(-1, -1), criteria);
        gray.delete();
    }

    return { found, corners };
}

// 在图像上绘制角点
function drawChessboardCorners(imageMat, patternSize, corners, found) {
    cv.drawChessboardCorners(imageMat, patternSize, corners, found);
}

// 格式化数字
function formatNumber(num, decimals = 2) {
    return Number(num).toFixed(decimals);
}

// 计算两点间的欧氏距离
function calculateDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// 将 OpenCV Mat 转换为 Canvas
function matToCanvas(mat, canvasId) {
    cv.imshow(canvasId, mat);
}