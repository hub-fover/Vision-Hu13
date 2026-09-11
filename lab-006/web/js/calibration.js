let video, canvas, ctx;
let stream = null;
let capturedImages = [];
let boardWidth = 9, boardHeight = 6, squareSize = 25;
let isDetecting = false;
let detectionBusy = false;
let lastDetection = 0;

document.addEventListener('DOMContentLoaded', () => {
    video = document.getElementById('videoElement');
    canvas = document.getElementById('overlayCanvas');
    ctx = canvas.getContext('2d');
    document.getElementById('startCamera').onclick = startCamera;
    document.getElementById('stopCamera').onclick = stopCamera;
    document.getElementById('captureImage').onclick = captureImage;
    document.getElementById('clearImages').onclick = clearImages;
    document.getElementById('calibrateButton').onclick = performCalibration;
    document.getElementById('loadSample').onclick = loadSampleData;
    document.getElementById('boardWidth').onchange = event => { boardWidth = parseInt(event.target.value, 10); };
    document.getElementById('boardHeight').onchange = event => { boardHeight = parseInt(event.target.value, 10); };
    document.getElementById('squareSize').onchange = event => { squareSize = parseFloat(event.target.value); };
    updateImageCount();
    showGuideCard('initial');
});

function onOpenCVLoad() { console.log('OpenCV ready for calibration'); }

function showGuideCard(state) {
    const card = document.getElementById('guideCard');
    const title = document.getElementById('guideTitle');
    const content = document.getElementById('guideContent');
    const detectionStatus = document.getElementById('cameraDetectionStatus');
    const detectionText = document.getElementById('cameraDetectionText');
    card.style.display = 'block';
    detectionStatus.dataset.state = state;
    if (state === 'initial') {
        title.textContent = '准备开始';
        content.innerHTML = '<p>确保棋盘格平整且光线充足。</p><p>点击“启动相机”或“加载示例数据”。</p>';
        detectionText.textContent = '等待启动相机';
    } else if (state === 'searching') {
        title.textContent = '正在寻找棋盘格';
        content.innerHTML = '<p>让完整棋盘格进入画面并调整角度。</p>';
        detectionText.textContent = `正在寻找 ${boardWidth}×${boardHeight} 内角点`;
    } else if (state === 'found') {
        title.textContent = '检测成功';
        content.innerHTML = `<p>保持稳定后点击画面内的“拍摄图像”。</p><p>已采集 ${capturedImages.length}/20 张。</p>`;
        detectionText.textContent = `已检测 ${boardWidth * boardHeight} 个内角点`;
    } else {
        title.textContent = '示例数据已准备';
        content.innerHTML = `<p>已检测 ${capturedImages.length} 张图像，可以开始标定。</p>`;
        detectionText.textContent = `示例数据 ${capturedImages.length} 张`;
    }
}

function updateStepIndicator(step) {
    if (step === 3) { document.getElementById('step2').classList.add('completed'); document.getElementById('step2').classList.remove('active'); document.getElementById('step3').classList.add('active'); }
}

async function startCamera() {
    try {
        await waitForOpenCv();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
        video.srcObject = stream;
        await video.play();
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        document.getElementById('startCamera').disabled = true;
        document.getElementById('captureImage').disabled = false;
        document.getElementById('stopCamera').disabled = false;
        showStatus('statusMessage', '相机已启动，正在检测棋盘格…', 'success');
        showGuideCard('searching');
        requestAnimationFrame(detectInRealTime);
    } catch (error) { showStatus('statusMessage', `无法启动相机：${error.message}`, 'error'); }
}

function stopCamera() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null; video.srcObject = null; ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('startCamera').disabled = false;
    document.getElementById('captureImage').disabled = true;
    document.getElementById('stopCamera').disabled = true;
    showStatus('statusMessage', '相机已关闭', 'info'); showGuideCard('initial');
}

function readVideoFrame() {
    return captureVideoFrame(video);
}

function detectInRealTime() {
    if (!stream) return;
    const now = performance.now();
    if (detectionBusy || now - lastDetection < 200) { requestAnimationFrame(detectInRealTime); return; }
    detectionBusy = true;
    lastDetection = now;
    let source = null;
    let result = null;
    let display = null;
    try {
        source = readVideoFrame();
        result = detectChessboardCorners(source, new cv.Size(boardWidth, boardHeight));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (result.found) {
            display = source.clone();
            drawChessboardCorners(display, new cv.Size(boardWidth, boardHeight), result.corners, true);
            cv.imshow('overlayCanvas', display);
            if (!isDetecting) { isDetecting = true; showGuideCard('found'); }
        } else if (isDetecting) { isDetecting = false; showGuideCard('searching'); }
    } catch (error) { console.error('实时检测失败', error); }
    finally {
        if (display) display.delete();
        if (result?.corners) result.corners.delete();
        if (source) source.delete();
        detectionBusy = false;
    }
    requestAnimationFrame(detectInRealTime);
}

function captureImage() {
    let source = null;
    let result = null;
    try {
        source = readVideoFrame();
        result = detectChessboardCorners(source, new cv.Size(boardWidth, boardHeight));
        if (!result.found) throw new Error('未检测到棋盘格');
        const corners = [];
        for (let i = 0; i < result.corners.rows; i += 1) corners.push({ x: result.corners.data32F[i * 2], y: result.corners.data32F[i * 2 + 1] });
        capturedImages.push({ width: source.cols, height: source.rows, data: Array.from(source.data), corners });
        updateImageCount(); updateImageGrid(); updateProgressBar(); showGuideCard('found');
        showStatus('statusMessage', `成功采集第 ${capturedImages.length} 张图像`, 'success');
        updateCalibrationButton();
    } catch (error) { showStatus('statusMessage', `拍摄失败：${error.message}`, 'error'); }
    finally {
        if (result?.corners) result.corners.delete();
        if (source) source.delete();
    }
}

function clearImages() {
    if (!capturedImages.length || !confirm('确定要清空所有已采集的图像吗？')) return;
    capturedImages = []; updateImageCount(); updateImageGrid(); updateProgressBar(); updateCalibrationButton(); showStatus('statusMessage', '已清空所有图像', 'info');
}

function updateCalibrationButton() { document.getElementById('calibrateButton').disabled = capturedImages.length < 10; }
function updateImageCount() { document.getElementById('imageCount').textContent = capturedImages.length; }
function updateProgressBar() { document.getElementById('imageProgress').style.width = `${Math.min(capturedImages.length / 20 * 100, 100)}%`; }

function updateImageGrid() {
    const grid = document.getElementById('imageGrid'); grid.innerHTML = '';
    capturedImages.forEach((image, index) => {
        const item = document.createElement('div'); item.className = 'image-item';
        const thumb = document.createElement('canvas'); thumb.width = image.width; thumb.height = image.height; thumb.id = `thumb-${index}`;
        const remove = document.createElement('button'); remove.className = 'delete-btn'; remove.textContent = '×'; remove.onclick = () => deleteImage(index);
        item.append(thumb, remove); grid.appendChild(item);
        const imageData = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
        thumb.getContext('2d').putImageData(imageData, 0, 0);
    });
}

function deleteImage(index) { capturedImages.splice(index, 1); updateImageCount(); updateImageGrid(); updateProgressBar(); updateCalibrationButton(); }

function performCalibration() {
    updateStepIndicator(3);
    const resultDiv = document.getElementById('calibrationResult');
    resultDiv.textContent = '正在计算标定参数…'; resultDiv.className = 'status-message status-info mt-3';
    setTimeout(() => {
        const result = calibrateCamera();
        if (!result) return;
        const quality = result.error < 0.5 ? '优秀' : result.error < 1 ? '良好' : '一般';
        resultDiv.innerHTML = `<h3>标定完成</h3><p><strong>重投影误差：</strong>${result.error.toFixed(3)} 像素（${quality}）</p><p><strong>焦距：</strong>fx = ${result.fx.toFixed(2)}, fy = ${result.fy.toFixed(2)}</p><p>标定数据已保存到本地。</p><div class="controls mt-3"><a href="measurement.html" class="btn btn-primary">立即测量</a><button onclick="location.reload()" class="btn btn-secondary">重新标定</button></div>`;
        resultDiv.className = 'card mt-3'; showToast('标定成功', 'success');
    }, 50);
}

function calibrateCamera() {
    if (capturedImages.length < 10) { showStatus('statusMessage', '至少需要 10 张有效图像', 'error'); return null; }
    if (!Number.isInteger(boardWidth) || !Number.isInteger(boardHeight) || squareSize <= 0) { showStatus('statusMessage', '棋盘格配置无效', 'error'); return null; }
    const objectPoints = new cv.MatVector(), imagePoints = new cv.MatVector();
    let cameraMatrix, distCoeffs, rvecs, tvecs, stdIntrinsics, stdExtrinsics, perViewErrors;
    try {
        const expected = boardWidth * boardHeight;
        const imageSize = new cv.Size(capturedImages[0].width, capturedImages[0].height);
        for (const image of capturedImages) {
            if (image.width !== imageSize.width || image.height !== imageSize.height || image.corners.length !== expected) throw new Error('图像尺寸或角点数量不一致');
            const objectArray = [], imageArray = [];
            for (let row = 0; row < boardHeight; row += 1) for (let col = 0; col < boardWidth; col += 1) objectArray.push(col * squareSize, row * squareSize, 0);
            image.corners.forEach(point => imageArray.push(point.x, point.y));
            objectPoints.push_back(cv.matFromArray(expected, 1, cv.CV_32FC3, objectArray));
            imagePoints.push_back(cv.matFromArray(expected, 1, cv.CV_32FC2, imageArray));
        }
        cameraMatrix = cv.Mat.eye(3, 3, cv.CV_64F); distCoeffs = cv.Mat.zeros(5, 1, cv.CV_64F); rvecs = new cv.MatVector(); tvecs = new cv.MatVector();
        let error;
        if (typeof cv.calibrateCamera === 'function') {
            error = cv.calibrateCamera(objectPoints, imagePoints, imageSize, cameraMatrix, distCoeffs, rvecs, tvecs, 0);
        } else {
            stdIntrinsics = new cv.Mat(); stdExtrinsics = new cv.Mat(); perViewErrors = new cv.Mat();
            error = cv.calibrateCameraExtended(objectPoints, imagePoints, imageSize, cameraMatrix, distCoeffs, rvecs, tvecs, stdIntrinsics, stdExtrinsics, perViewErrors, 0);
        }
        const fx = cameraMatrix.data64F[0], fy = cameraMatrix.data64F[4];
        const data = { version: 2, cameraMatrix: Array.from(cameraMatrix.data64F), distCoeffs: Array.from(distCoeffs.data64F), imageSize: { width: imageSize.width, height: imageSize.height }, error, date: new Date().toISOString(), squareSize, boardConfig: { width: boardWidth, height: boardHeight } };
        if (!saveCalibration(data)) throw new Error('无法保存标定数据');
        return { error, fx, fy };
    } catch (error) {
        showStatus('statusMessage', `标定失败：${error.message}`, 'error'); return null;
    } finally {
        for (let i = 0; i < objectPoints.size(); i += 1) objectPoints.get(i).delete();
        for (let i = 0; i < imagePoints.size(); i += 1) imagePoints.get(i).delete();
        objectPoints.delete(); imagePoints.delete();
        if (cameraMatrix) cameraMatrix.delete(); if (distCoeffs) distCoeffs.delete(); if (rvecs) rvecs.delete(); if (tvecs) tvecs.delete();
        if (stdIntrinsics) stdIntrinsics.delete(); if (stdExtrinsics) stdExtrinsics.delete(); if (perViewErrors) perViewErrors.delete();
    }
}

async function loadSampleData() {
    const status = document.getElementById('statusMessage');
    try {
        await waitForOpenCv();
        const response = await fetch('assets/samples/manifest.json'); if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = await response.json();
        const cornersResponse = await fetch('assets/samples/sample-corners.json'); if (!cornersResponse.ok) throw new Error(`角点数据 HTTP ${cornersResponse.status}`);
        const sampleCorners = await cornersResponse.json();
        if (sampleCorners.schema !== 'lab006.sample-corners.v1') throw new Error('样例角点数据版本不兼容');
        const cornersByPath = new Map(sampleCorners.images.map(item => [item.path, item.corners]));
        boardWidth = manifest.boardConfig.width; boardHeight = manifest.boardConfig.height; squareSize = manifest.boardConfig.squareSize;
        document.getElementById('boardWidth').value = boardWidth; document.getElementById('boardHeight').value = boardHeight; document.getElementById('squareSize').value = squareSize;
        capturedImages = [];
        for (const imageInfo of manifest.calibrationImages) {
            try {
                const imageResponse = await fetch(`assets/samples/${imageInfo.path}`); if (!imageResponse.ok) continue;
                const bitmap = await createImageBitmap(await imageResponse.blob());
                const tempCanvas = document.createElement('canvas'); tempCanvas.width = bitmap.width; tempCanvas.height = bitmap.height;
                const tempCtx = tempCanvas.getContext('2d'); tempCtx.drawImage(bitmap, 0, 0); const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height); bitmap.close();
                const corners = cornersByPath.get(imageInfo.path);
                if (!Array.isArray(corners) || corners.length !== boardWidth * boardHeight || corners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('样例角点数据无效');
                capturedImages.push({ width: tempCanvas.width, height: tempCanvas.height, data: Array.from(imageData.data), corners });
                status.textContent = `正在加载示例图像：${capturedImages.length}/${manifest.calibrationImages.length}`; status.className = 'status-message status-info mt-3';
            } catch (error) { console.warn(`跳过 ${imageInfo.path}`, error); }
        }
        updateImageCount(); updateImageGrid(); updateProgressBar(); updateCalibrationButton();
        if (capturedImages.length < 10) throw new Error(`只检测到 ${capturedImages.length} 张有效图像`);
        status.textContent = `成功加载 ${capturedImages.length} 张示例图像`; status.className = 'status-message status-success mt-3'; showGuideCard('ready');
    } catch (error) { status.textContent = `加载示例数据失败：${error.message}`; status.className = 'status-message status-error mt-3'; }
}
