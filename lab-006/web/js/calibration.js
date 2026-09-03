// calibration.js - 相机标定功能（增强版）
let video, canvas, ctx;
let stream = null;
let capturedImages = [];
let calibrationData = null;
let boardWidth = 8, boardHeight = 5, squareSize = 25;
let isDetecting = false;

document.addEventListener('DOMContentLoaded', function() {
    // 显示OpenCV加载状态
    const statusEl = document.getElementById('opencvStatus');
    if (statusEl && !opencvReady) {
        statusEl.style.display = 'block';
    }

    video = document.getElementById('videoElement');
    canvas = document.getElementById('overlayCanvas');
    ctx = canvas.getContext('2d');

    document.getElementById('startCamera').onclick = startCamera;
    document.getElementById('stopCamera').onclick = stopCamera;
    document.getElementById('captureImage').onclick = captureImage;
    document.getElementById('clearImages').onclick = clearImages;
    document.getElementById('calibrateButton').onclick = performCalibration;
    document.getElementById('loadSample').onclick = loadSampleData;
    document.getElementById('boardWidth').onchange = e => boardWidth = parseInt(e.target.value);
    document.getElementById('boardHeight').onchange = e => boardHeight = parseInt(e.target.value);
    document.getElementById('squareSize').onchange = e => squareSize = parseInt(e.target.value);

    updateImageCount();
    showGuideCard('initial');
});

function onOpenCVLoad() {
    console.log('OpenCV 准备就绪');
}

// 更新引导卡片
function showGuideCard(state) {
    const guideCard = document.getElementById('guideCard');
    const guideTitle = document.getElementById('guideTitle');
    const guideContent = document.getElementById('guideContent');

    guideCard.style.display = 'block';

    switch(state) {
        case 'initial':
            guideTitle.innerHTML = '📷 准备开始';
            guideContent.innerHTML = `
                <p>• 请确保棋盘格平整且光线充足</p>
                <p>• 点击"启动相机"按钮开始</p>
            `;
            break;
        case 'searching':
            guideTitle.innerHTML = '🔍 正在寻找棋盘格...';
            guideContent.innerHTML = `
                <p>• 将棋盘格完整放入画面</p>
                <p>• 调整角度和距离</p>
                <p>• 出现绿色标记即表示检测成功</p>
            `;
            break;
        case 'found':
            guideTitle.innerHTML = '✅ 检测成功！';
            guideContent.innerHTML = `
                <p>• 保持稳定，点击"拍摄"按钮</p>
                <p>• 已拍摄 ${capturedImages.length}/10 张</p>
                <p>• 建议：从不同角度拍摄以提高精度</p>
            `;
            break;
    }
}

// 更新进度指示器
function updateStepIndicator(step) {
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');

    if (step === 3) {
        step2.classList.remove('active');
        step2.classList.add('completed');
        step3.classList.add('active');
    }
}

async function startCamera() {
    if (!opencvReady) {
        showStatus('statusMessage', '⏳ OpenCV.js 正在加载中，请稍候...', 'warning');
        return;
    }

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

        showStatus('statusMessage', '✓ 相机已启动，正在检测棋盘格...', 'success');
        showGuideCard('searching');
        isDetecting = false;

        requestAnimationFrame(detectInRealTime);
    } catch (error) {
        showStatus('statusMessage', '❌ 无法访问相机，请检查权限设置', 'error');
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
    showGuideCard('initial');
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

            if (!isDetecting) {
                isDetecting = true;
                showGuideCard('found');
            }
        } else {
            if (isDetecting) {
                isDetecting = false;
                showGuideCard('searching');
            }
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
        showStatus('statusMessage', 'OpenCV 加载中，请稍候...', 'warning');
        return;
    }

    try {
        const src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
        new cv.VideoCapture(video).read(src);
        const patternSize = new cv.Size(boardWidth, boardHeight);
        const result = detectChessboardCorners(src, patternSize);

        if (result.found) {
            const imageData = {
                width: src.cols,
                height: src.rows,
                data: Array.from(src.data),
                corners: []
            };

            for (let i = 0; i < result.corners.rows; i++) {
                imageData.corners.push({
                    x: result.corners.data32F[i * 2],
                    y: result.corners.data32F[i * 2 + 1]
                });
            }

            capturedImages.push(imageData);
            updateImageCount();
            updateImageGrid();
            updateProgressBar();
            showGuideCard('found');

            showStatus('statusMessage', `✓ 成功采集第 ${capturedImages.length} 张图像`, 'success');

            if (capturedImages.length >= 10) {
                document.getElementById('calibrateButton').disabled = false;
                document.getElementById('imageHint').innerHTML = '<p>✓ 已采集足够图像，可以开始标定了！</p>';
                document.getElementById('imageHint').className = 'status-message status-success mt-3';
                showToast('已达到最少图像数量，可以开始标定！', 'success');
            }
        } else {
            showStatus('statusMessage', '❌ 未检测到棋盘格，请调整角度和距离', 'error');
        }

        result.corners.delete();
        src.delete();
    } catch (error) {
        showStatus('statusMessage', '拍摄失败: ' + error.message, 'error');
    }
}

function clearImages() {
    if (capturedImages.length === 0) return;

    if (confirm('确定要清空所有已采集的图像吗？')) {
        capturedImages = [];
        updateImageCount();
        updateImageGrid();
        updateProgressBar();

        document.getElementById('calibrateButton').disabled = true;
        document.getElementById('imageHint').innerHTML = '<p>📍 请从不同角度拍摄至少 10 张照片以开始标定</p>';
        document.getElementById('imageHint').className = 'status-message status-info mt-3';

        showStatus('statusMessage', '已清空所有图像', 'info');
    }
}

function updateImageCount() {
    document.getElementById('imageCount').textContent = capturedImages.length;
}

function updateProgressBar() {
    const progress = Math.min((capturedImages.length / 20) * 100, 100);
    document.getElementById('imageProgress').style.width = progress + '%';
}

function updateImageGrid() {
    const grid = document.getElementById('imageGrid');
    grid.innerHTML = '';

    capturedImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'image-item';
        item.innerHTML = `
            <canvas id="thumb-${index}" width="${img.width}" height="${img.height}"></canvas>
            <button class="delete-btn" onclick="deleteImage(${index})">×</button>
        `;
        grid.appendChild(item);

        // 绘制缩略图
        setTimeout(() => {
            const thumbCanvas = document.getElementById(`thumb-${index}`);
            if (thumbCanvas) {
                const thumbCtx = thumbCanvas.getContext('2d');
                const imgData = thumbCtx.createImageData(img.width, img.height);
                imgData.data.set(new Uint8ClampedArray(img.data));
                thumbCtx.putImageData(imgData, 0, 0);
            }
        }, 10);
    });
}

function deleteImage(index) {
    capturedImages.splice(index, 1);
    updateImageCount();
    updateImageGrid();
    updateProgressBar();

    if (capturedImages.length < 10) {
        document.getElementById('calibrateButton').disabled = true;
        document.getElementById('imageHint').innerHTML = '<p>📍 请从不同角度拍摄至少 10 张照片以开始标定</p>';
        document.getElementById('imageHint').className = 'status-message status-info mt-3';
    }

    showToast('已删除图像', 'info');
}

function performCalibration() {
    updateStepIndicator(3);

    const resultDiv = document.getElementById('calibrationResult');
    resultDiv.innerHTML = '<p>⏳ 正在计算标定参数，请稍候...</p>';
    resultDiv.className = 'status-message status-info mt-3';

    setTimeout(() => {
        const result = calibrateCamera();
        if (result) {
            const quality = result.error < 0.5 ? '优秀' : result.error < 1.0 ? '良好' : '一般';
            const qualityColor = result.error < 0.5 ? 'success' : result.error < 1.0 ? 'info' : 'warning';

            resultDiv.innerHTML = `
                <h3 style="color: var(--color-success); margin-bottom: var(--spacing-sm);">✅ 标定完成！</h3>
                <div style="display: grid; gap: var(--spacing-sm); text-align: left;">
                    <p><strong>重投影误差：</strong>${result.error.toFixed(3)} 像素 <span class="status-message status-${qualityColor}" style="display: inline; padding: 4px 12px;">${quality}</span></p>
                    <p><strong>焦距：</strong>fx = ${result.fx.toFixed(2)}, fy = ${result.fy.toFixed(2)}</p>
                    <p><strong>图像数量：</strong>${capturedImages.length} 张</p>
                    <p style="color: var(--color-text-secondary); font-size: var(--font-size-small); margin-top: var(--spacing-sm);">
                        标定数据已保存到本地，现在可以进入测量页面使用。
                    </p>
                </div>
                <div class="controls mt-3">
                    <button onclick="location.href='measurement.html'" class="btn btn-primary">立即测量</button>
                    <button onclick="location.reload()" class="btn btn-secondary">重新标定</button>
                </div>
            `;
            resultDiv.className = 'card mt-3';
            resultDiv.style.background = 'linear-gradient(135deg, #d1f4e0 0%, #e3f2fd 100%)';

            showToast('标定成功！', 'success');
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
            error: error,
            date: new Date().toISOString(),
            squareSize: squareSize
        };

        saveCalibration(calibData);

        // 清理内存
        objectPoints.forEach(mat => mat.delete());
        imagePoints.forEach(mat => mat.delete());
        cameraMatrix.delete();
        distCoeffs.delete();
        rvecs.delete();
        tvecs.delete();

        return { error, fx: cameraMatrix.data64F[0], fy: cameraMatrix.data64F[4] };
    } catch (error) {
        const resultDiv = document.getElementById('calibrationResult');
        resultDiv.innerHTML = `<p>❌ 标定失败: ${error.message}</p><p style="font-size: var(--font-size-small); color: var(--color-text-secondary);">请尝试重新采集图像或调整参数。</p>`;
        resultDiv.className = 'status-message status-error mt-3';
        return null;
    }
}

// 加载示例数据
async function loadSampleData() {
    console.log('[loadSampleData] 开始执行');
    console.log('[loadSampleData] opencvReady:', opencvReady);

    const statusDiv = document.getElementById('statusMessage');

    // 检查OpenCV是否已加载
    if (!opencvReady) {
        console.warn('[loadSampleData] OpenCV未就绪，中止加载');
        statusDiv.innerHTML = '<p>⏳ OpenCV.js 正在加载中，请稍候再试...</p>';
        statusDiv.className = 'status-message status-warning mt-3';
        return;
    }

    statusDiv.innerHTML = '<p>⏳ 正在加载示例数据...</p>';
    statusDiv.className = 'status-message status-info mt-3';

    try {
        // 加载manifest
        console.log('[loadSampleData] 开始加载manifest.json');
        const response = await fetch('assets/samples/manifest.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: 无法加载示例数据清单`);
        }
        const manifest = await response.json();
        console.log('[loadSampleData] manifest加载成功:', manifest);

        // 更新标定参数
        boardWidth = manifest.boardConfig.width;
        boardHeight = manifest.boardConfig.height;
        squareSize = manifest.boardConfig.squareSize;

        document.getElementById('boardWidth').value = boardWidth;
        document.getElementById('boardHeight').value = boardHeight;
        document.getElementById('squareSize').value = squareSize;

        // 清空之前的图像
        capturedImages = [];
        let successCount = 0;

        // 加载并处理每张图像
        for (const imgInfo of manifest.calibrationImages) {
            try {
                console.log(`[loadSampleData] 加载图像: ${imgInfo.path}`);
                const imgResponse = await fetch(`assets/samples/${imgInfo.path}`);
                if (!imgResponse.ok) {
                    console.warn(`[loadSampleData] 跳过图像 ${imgInfo.path}: HTTP ${imgResponse.status}`);
                    continue;
                }

                const blob = await imgResponse.blob();
                const bitmap = await createImageBitmap(blob);

                // 创建临时canvas处理图像
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = bitmap.width;
                tempCanvas.height = bitmap.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(bitmap, 0, 0);
                const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

                // 转换为OpenCV格式并检测角点
                const src = cv.matFromImageData(imageData);
                const gray = new cv.Mat();
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

                const corners = new cv.Mat();
                const patternSize = new cv.Size(boardWidth, boardHeight);
                const found = cv.findChessboardCorners(gray, patternSize, corners);

                if (found) {
                    // 亚像素精度角点优化
                    const criteria = new cv.TermCriteria(
                        cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 30, 0.001
                    );
                    cv.cornerSubPix(gray, corners, new cv.Size(11, 11), new cv.Size(-1, -1), criteria);

                    // 保存图像数据和角点
                    const cornersArray = [];
                    for (let i = 0; i < corners.rows; i++) {
                        cornersArray.push({
                            x: corners.data32F[i * 2],
                            y: corners.data32F[i * 2 + 1]
                        });
                    }

                    capturedImages.push({
                        width: tempCanvas.width,
                        height: tempCanvas.height,
                        data: Array.from(imageData.data),
                        corners: cornersArray
                    });
                    successCount++;
                    console.log(`[loadSampleData] 成功检测角点: ${imgInfo.path} (${successCount}/${manifest.calibrationImages.length})`);
                }

                // 清理内存
                src.delete();
                gray.delete();
                corners.delete();

            } catch (err) {
                console.error(`[loadSampleData] 处理图像 ${imgInfo.path} 失败:`, err);
            }
        }

        console.log(`[loadSampleData] 完成，成功加载 ${successCount} 张图像`);

        // 更新UI
        updateImageCount();
        updateImageGrid();

        if (successCount >= 10) {
            statusDiv.innerHTML = `<p>✅ 成功加载 ${successCount} 张示例图像</p>`;
            statusDiv.className = 'status-message status-success mt-3';
            document.getElementById('calibrateButton').disabled = false;
            showGuideCard('ready');
        } else {
            throw new Error(`只成功加载了 ${successCount} 张图像，至少需要10张`);
        }

    } catch (error) {
        console.error('[loadSampleData] 失败:', error);
        statusDiv.innerHTML = `<p>❌ 加载示例数据失败: ${error.message}</p>`;
        statusDiv.className = 'status-message status-error mt-3';
    }
}
}
