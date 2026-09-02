// calibration.js - 相机标定功能
let video, canvas, ctx;
let stream = null;
let capturedImages = [];
let calibrationData = null;
let boardWidth = 8, boardHeight = 5, squareSize = 25;

document.addEventListener('DOMContentLoaded', function() {
    video = document.getElementById('videoElement');
    canvas = document.getElementById('overlayCanvas');
    ctx = canvas.getContext('2d');

    document.getElementById('startCamera').onclick = startCamera;
    document.getElementById('stopCamera').onclick = stopCamera;
    document.getElementById('captureImage').onclick = captureImage;
    document.getElementById('clearImages').onclick = clearImages;
    document.getElementById('calibrateButton').onclick = performCalibration;
    document.getElementById('boardWidth').onchange = e => boardWidth = parseInt(e.target.value);
    document.getElementById('boardHeight').onchange = e => boardHeight = parseInt(e.target.value);
    document.getElementById('squareSize').onchange = e => squareSize = parseInt(e.target.value);

    updateImageCount();
});

function onOpenCVLoad() {
    console.log('OpenCV 准备就绪');
}

async function startCamera() {
    const constraints = {
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    };

    try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        };

        document.getElementById('startCamera').disabled = true;
        document.getElementById('captureImage').disabled = false;
        document.getElementById('stopCamera').disabled = false;
        showStatus('statusMessage', '相机已启动', 'success');
        requestAnimationFrame(detectInRealTime);
    } catch (error) {
        showStatus('statusMessage', '无法访问相机', 'error');
    }
}

function stopCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('startCamera').disabled = false;
    document.getElementById('captureImage').disabled = true;
    document.getElementById('stopCamera').disabled = true;
    showStatus('statusMessage', '相机已关闭', 'info');
}

function detectInRealTime() {
    if (!stream || !opencvReady) {
        if (stream) requestAnimationFrame(detectInRealTime);
        return;
    }

    try {
        const src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
        new cv.VideoCapture(video).read(src);
        const patternSize = new cv.Size(boardWidth, boardHeight);
        const result = detectChessboardCorners(src, patternSize);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (result.found) {
            const displayMat = src.clone();
            drawChessboardCorners(displayMat, patternSize, result.corners, true);
            cv.imshow('overlayCanvas', displayMat);
            displayMat.delete();
        }

        result.corners.delete();
        src.delete();
    } catch (error) {
        console.error('检测错误:', error);
    }

    requestAnimationFrame(detectInRealTime);
}

function captureImage() {
    if (!opencvReady) {
        showStatus('statusMessage', 'OpenCV 加载中...', 'error');
        return;
    }

    try {function captureImage() {
    if (!opencvReady) {
        showStatus('statusMessage', 'OpenCV 加载中...', 'error');
        return;
    }
    const src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    new cv.VideoCapture(video).read(src);
    const patternSize = new cv.Size(boardWidth, boardHeight);
    const result = detectChessboardCorners(src, patternSize);
    if (result.found) {
        const imageData = { width: src.cols, height: src.rows, data: Array.from(src.data), corners: [] };
        for (let i = 0; i < result.corners.rows; i++) {
            imageData.corners.push({
                x: result.corners.data32F[i * 2], y: result.corners.data32F[i * 2 + 1]
            });
        }
        capturedImages.push(imageData);
        updateImageCount(); updateImageGrid();
        showStatus('statusMessage', `采集第 ${capturedImages.length} 张`, 'success');
        if (capturedImages.length >= 10) document.getElementById('calibrateButton').disabled = false;
    } else {
        showStatus('statusMessage', '未检测到棋盘格', 'error');
    }
    result.corners.delete(); src.delete();
}

function clearImages() {
    capturedImages = []; updateImageCount(); updateImageGrid();
    document.getElementById('calibrateButton').disabled = true;
    showStatus('statusMessage', '已清空所有图像', 'info');
}

function updateImageCount() { document.getElementById('imageCount').textContent = capturedImages.length; }

function updateImageGrid() {
    const grid = document.getElementById('imageGrid');
    grid.innerHTML = '';
    // 显示缩略图（简化版）
}

function deleteImage(index) {
    capturedImages.splice(index, 1);
    updateImageCount(); updateImageGrid();
}

function performCalibration() {
    showStatus('calibrationResult', '正在标定，请稍候...', 'info');
    setTimeout(() => {
        const result = calibrateCamera();
        if (result) {
            const msg = `标定完成！<br>重投影误差: ${result.error.toFixed(3)} 像素<br>
                        焦距: fx=${result.fx.toFixed(1)}, fy=${result.fy.toFixed(1)}`;
            document.getElementById('calibrationResult').innerHTML = msg;
            document.getElementById('calibrationResult').className = 'status-message status-success';
        }
    }, 100);
}
function calibrateCamera() {
    try {
        const objectPoints = [];
        const imagePoints = [];
        const imageSize = new cv.Size(capturedImages[0].width, capturedImages[0].height);

        for (let i = 0; i < capturedImages.length; i++) {
            const objPts = [];
            for (let r = 0; r < boardHeight; r++) {
                for (let c = 0; c < boardWidth; c++) {
                    objPts.push(c * squareSize, r * squareSize, 0);
                }
            }
            objectPoints.push(cv.matFromArray(boardHeight * boardWidth, 1, cv.CV_32FC3, objPts));

            const imgPts = [];
            capturedImages[i].corners.forEach(p => imgPts.push(p.x, p.y));
            imagePoints.push(cv.matFromArray(boardHeight * boardWidth, 1, cv.CV_32FC2, imgPts));
        }

        const cameraMatrix = cv.Mat.eye(3, 3, cv.CV_64F);
        const distCoeffs = cv.Mat.zeros(5, 1, cv.CV_64F);
        const rvecs = new cv.MatVector();
        const tvecs = new cv.MatVector();

        const error = cv.calibrateCamera(
            objectPoints, imagePoints, imageSize,
            cameraMatrix, distCoeffs, rvecs, tvecs, 0
        );

        const calibData = {
            cameraMatrix: Array.from(cameraMatrix.data64F),
            distCoeffs: Array.from(distCoeffs.data64F),
            imageSize: { width: imageSize.width, height: imageSize.height },
            error: error
        };

        saveCalibration(calibData);
        return { error, fx: cameraMatrix.data64F[0], fy: cameraMatrix.data64F[4] };
    } catch (error) {
        showStatus('calibrationResult', '标定失败: ' + error.message, 'error');
        return null;
    }
}
