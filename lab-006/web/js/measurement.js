let video;
let sampleImage;
let canvas;
let ctx;
let stream = null;
let sampleMode = false;
let calibData = null;
let measureMode = 'distance';
let measurePoints = [];
let currentUnit = 'mm';
let measurementHistory = [];
let boardCorners = null;
let boardHomography = null;
let frameBusy = false;
let lastBoardDetection = 0;

document.addEventListener('DOMContentLoaded', () => {
    video = document.getElementById('videoElement');
    sampleImage = document.getElementById('sampleImageElement');
    canvas = document.getElementById('measureCanvas');
    ctx = canvas.getContext('2d');
    document.getElementById('startCamera').onclick = startCamera;
    document.getElementById('loadMeasurementSample').onclick = loadMeasurementSample;
    document.getElementById('stopCamera').onclick = stopCamera;
    document.getElementById('clearPoints').onclick = clearPoints;
    canvas.onclick = handleCanvasClick;
    checkCalibration();
    loadMeasurementHistory();
    updateOperationGuide();
});

function onOpenCVLoad() { console.log('OpenCV ready for measurement'); }

function selectMode(mode) {
    measureMode = mode;
    clearPoints();
    document.getElementById('distanceModeCard').classList.toggle('active', mode === 'distance');
    document.getElementById('rectangleModeCard').classList.toggle('active', mode === 'rectangle');
    updateOperationGuide();
}

function checkCalibration() {
    calibData = loadCalibration();
    renderCalibrationStatus(false);
}

function renderCalibrationStatus(isSample) {
    const status = document.getElementById('calibrationStatus');
    if (!calibData) {
        status.innerHTML = '<p><strong>未找到有效标定数据</strong></p><p>请先完成相机标定，或加载示例标定数据。</p><div class="controls mt-2"><a href="calibration.html" class="btn btn-primary">前往标定</a><button onclick="loadSampleCalibration()" class="btn btn-secondary">加载示例标定</button></div>';
        status.className = 'status-message status-warning measurement-calibration-status';
        return;
    }
    const error = Number.isFinite(calibData.error) ? calibData.error.toFixed(3) : '未知';
    const label = isSample ? '已加载测量示例标定（不会覆盖已保存标定）' : '已加载标定数据';
    status.innerHTML = `<p><strong>${label}</strong></p><p>重投影误差：${error} 像素</p><p>测量时必须让棋盘格与目标物体共面。</p>`;
    status.className = 'status-message status-success measurement-calibration-status';
}

function measurementSourceActive() { return Boolean(stream || sampleMode); }

function setMeasurementAspect(width = 16, height = 9) {
    const container = document.querySelector('.measurement-video-container');
    if (container && width > 0 && height > 0) container.style.aspectRatio = `${width} / ${height}`;
}

function setMappingStatus(state, text) {
    const status = document.getElementById('measurementMappingStatus');
    const label = document.getElementById('measurementMappingText');
    if (!status || !label) return;
    status.dataset.state = state;
    label.textContent = text;
}

function updateSourceControls(active) {
    document.getElementById('startCamera').disabled = active;
    document.getElementById('loadMeasurementSample').disabled = active;
    document.getElementById('clearPoints').disabled = !active;
    document.getElementById('stopCamera').disabled = !active;
}

async function startCamera() {
    if (sampleMode) stopCamera();
    if (!calibData) { showToast('请先完成相机标定', 'error'); return; }
    try {
        await waitForOpenCv();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
        video.srcObject = stream;
        await video.play();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        setMeasurementAspect(video.videoWidth, video.videoHeight);
        video.hidden = false;
        sampleImage.hidden = true;
        updateSourceControls(true);
        updateOperationGuide();
        updateMeasurement();
        requestAnimationFrame(processFrame);
        showToast('相机已启动，请将棋盘格与目标物体放在同一平面', 'success');
    } catch (error) {
        showToast(`无法启动测量：${error.message}`, 'error');
    }
}

function stopCamera() {
    const wasSample = sampleMode;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = false;
    sampleMode = false;
    sampleImage.hidden = true;
    sampleImage.removeAttribute('src');
    boardCorners = null;
    boardHomography = null;
    measurePoints = [];
    setMeasurementAspect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateSourceControls(false);
    if (wasSample) checkCalibration();
    updateMeasurement();
    updateOperationGuide();
}

function clearPoints() {
    measurePoints = [];
    updateMeasurement();
    updateOperationGuide();
    drawOverlay();
}

function updateOperationGuide() {
    const guide = document.getElementById('operationGuide');
    guide.style.display = 'block';
    const title = document.getElementById('guideTitle');
    const text = document.getElementById('guideText');
    if (!measurementSourceActive()) {
        title.textContent = '准备测量';
        text.textContent = '启动相机或加载测量示例。';
        setMappingStatus('idle', '等待启动测量');
        return;
    }
    if (!boardHomography) {
        title.textContent = '等待棋盘格';
        text.textContent = '请让完整的 9×6 棋盘格进入画面，并与目标物体共面。';
        setMappingStatus('searching', '正在寻找 9×6 棋盘格');
        return;
    }
    const required = measureMode === 'distance' ? 2 : 4;
    title.textContent = measurePoints.length === required ? '测量完成' : sampleMode ? '示例棋盘格已锁定' : '棋盘格已锁定';
    text.textContent = measurePoints.length === required ? '点击清除标记开始下一次测量。' : `点击画面标记 ${required} 个点（已标记 ${measurePoints.length} 个）。`;
    setMappingStatus('found', `平面映射有效 · 已标记 ${measurePoints.length}/${required}`);
}

function processFrame() {
    if (!stream) return;
    const now = performance.now();
    if (!frameBusy && now - lastBoardDetection >= 200) {
        frameBusy = true;
        lastBoardDetection = now;
        let src = null;
        let result = null;
        try {
            src = captureVideoFrame(video);
            result = detectChessboardCorners(src, new cv.Size(calibData.boardConfig.width, calibData.boardConfig.height));
            boardCorners = result.found ? undistortPointList(cornersToPoints(result.corners), calibData) : null;
            if (boardCorners) boardHomography = buildBoardHomography(boardCorners);
            else boardHomography = null;
            updateOperationGuide();
        } catch (error) {
            console.error('测量帧处理失败', error);
            boardCorners = null;
            boardHomography = null;
        } finally {
            if (result?.corners) result.corners.delete();
            if (src) src.delete();
            frameBusy = false;
        }
    }
    drawOverlay();
    requestAnimationFrame(processFrame);
}

function cornersToPoints(corners) {
    const points = [];
    for (let i = 0; i < corners.rows; i += 1) points.push({ x: corners.data32F[i * 2], y: corners.data32F[i * 2 + 1] });
    return points;
}

function buildBoardHomography(corners) {
    const width = calibData.boardConfig.width;
    const height = calibData.boardConfig.height;
    const source = [corners[0], corners[width - 1], corners[(height - 1) * width + width - 1], corners[(height - 1) * width]];
    const target = [{ x: 0, y: 0 }, { x: (width - 1) * calibData.squareSize, y: 0 }, { x: (width - 1) * calibData.squareSize, y: (height - 1) * calibData.squareSize }, { x: 0, y: (height - 1) * calibData.squareSize }];
    return solveHomography(source, target);
}

function drawOverlay() {
    if (!measurementSourceActive()) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (boardCorners) {
        ctx.fillStyle = '#2ecc71';
        boardCorners.forEach(point => { ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI); ctx.fill(); });
    }
    ctx.strokeStyle = '#0071e3';
    ctx.lineWidth = 3;
    if (measurePoints.length > 1) {
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
        for (let i = 1; i < measurePoints.length; i += 1) ctx.lineTo(measurePoints[i].x, measurePoints[i].y);
        if (measureMode === 'rectangle' && measurePoints.length === 4) ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
    }
    measurePoints.forEach((point, index) => {
        ctx.fillStyle = '#0071e3'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(index + 1, point.x, point.y);
    });
}

function handleCanvasClick(event) {
    if (!measurementSourceActive() || !boardHomography) { showToast('请先让棋盘格进入画面并保持共面', 'warning'); return; }
    const rect = canvas.getBoundingClientRect();
    const rawPoint = { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
    const point = undistortPointList([rawPoint], calibData)[0];
    const maxPoints = measureMode === 'distance' ? 2 : 4;
    if (measurePoints.length >= maxPoints) return;
    measurePoints.push(point);
    updateMeasurement();
    updateOperationGuide();
    drawOverlay();
    if (measurePoints.length === maxPoints) addToHistory();
}

function mapMeasurePoints() { return measurePoints.map(point => mapPointWithHomography(point, boardHomography)); }

function updateMeasurement() {
    const result = document.getElementById('measurementResult');
    if (!boardHomography) { result.textContent = '等待棋盘格检测，无法进行毫米测量'; result.style.color = 'var(--color-text-secondary)'; return; }
    try {
        const points = mapMeasurePoints();
        const unitFactor = currentUnit === 'mm' ? 1 : 0.1;
        const unit = currentUnit === 'mm' ? '毫米' : '厘米';
        if (measureMode === 'distance' && points.length === 2) {
            result.innerHTML = `<strong>测量距离：</strong>${(calculateDistance(points[0], points[1]) * unitFactor).toFixed(2)} ${unit}`;
        } else if (measureMode === 'rectangle' && points.length === 4) {
            const width = calculateDistance(points[0], points[1]) * unitFactor;
            const height = calculateDistance(points[1], points[2]) * unitFactor;
            result.innerHTML = `<strong>矩形尺寸：</strong>${width.toFixed(2)} × ${height.toFixed(2)} ${unit}`;
        } else result.textContent = `点击画面标记${measureMode === 'distance' ? '两个' : '四个'}测量点`;
        result.style.color = 'var(--color-primary)';
    } catch (error) { result.textContent = `测量失败：${error.message}`; result.style.color = 'var(--color-danger)'; }
}

function addToHistory() {
    try {
        const points = mapMeasurePoints();
        const item = { type: measureMode, timestamp: new Date().toISOString(), calibrationVersion: calibData.version || 1 };
        if (measureMode === 'distance') item.value = calculateDistance(points[0], points[1]);
        else { item.width = calculateDistance(points[0], points[1]); item.height = calculateDistance(points[1], points[2]); }
        measurementHistory = [item, ...measurementHistory].slice(0, 20);
        saveMeasurementHistory();
        updateHistoryDisplay();
    } catch (error) { showToast(`无法保存测量：${error.message}`, 'error'); }
}

function toggleUnit() { currentUnit = currentUnit === 'mm' ? 'cm' : 'mm'; document.getElementById('unitToggle').textContent = `单位: ${currentUnit}`; updateMeasurement(); updateHistoryDisplay(); }
function saveMeasurementHistory() { try { localStorage.setItem('measurementHistory', JSON.stringify(measurementHistory)); } catch (error) { console.error(error); } }
function loadMeasurementHistory() { try { const value = JSON.parse(localStorage.getItem('measurementHistory') || '[]'); measurementHistory = Array.isArray(value) ? value.filter(item => Number.isFinite(item.value) || Number.isFinite(item.width)) : []; updateHistoryDisplay(); } catch { measurementHistory = []; } }

function updateHistoryDisplay() {
    const list = document.getElementById('historyList');
    if (!measurementHistory.length) { list.innerHTML = '<li class="status-message status-info">暂无测量记录</li>'; return; }
    const factor = currentUnit === 'mm' ? 1 : 0.1;
    list.innerHTML = measurementHistory.map((item, index) => {
        const text = item.type === 'distance' ? `${(item.value * factor).toFixed(2)} ${currentUnit}` : `${(item.width * factor).toFixed(2)} × ${(item.height * factor).toFixed(2)} ${currentUnit}`;
        return `<li class="history-item"><div><span class="history-value">${item.type === 'distance' ? '距离' : '矩形'} ${text}</span><div class="history-date">${formatDate(item.timestamp)}</div></div><div class="history-actions"><button class="icon-btn" onclick="copyMeasurement(${index})" title="复制">复制</button><button class="icon-btn" onclick="deleteHistoryItem(${index})" title="删除">删除</button></div></li>`;
    }).join('');
}

function copyMeasurement(index) { const item = measurementHistory[index]; const factor = currentUnit === 'mm' ? 1 : 0.1; const text = item.type === 'distance' ? `距离: ${(item.value * factor).toFixed(2)} ${currentUnit}` : `矩形: ${(item.width * factor).toFixed(2)} × ${(item.height * factor).toFixed(2)} ${currentUnit}`; copyToClipboard(text); showToast('已复制到剪贴板', 'success'); }
function deleteHistoryItem(index) { measurementHistory.splice(index, 1); saveMeasurementHistory(); updateHistoryDisplay(); }
function clearMeasurementHistory() { if (measurementHistory.length && confirm('确定要清空所有测量历史吗？')) { measurementHistory = []; saveMeasurementHistory(); updateHistoryDisplay(); } }

async function loadSampleCalibration() {
    try {
        const response = await fetch('assets/samples/sample-calibration.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const sample = await response.json();
        if (!sample.boardConfig) sample.boardConfig = { width: 9, height: 6 };
        if (!saveCalibration(sample)) throw new Error('示例标定数据格式无效');
        calibData = loadCalibration();
        checkCalibration();
        showToast('已加载示例标定数据', 'success');
    } catch (error) { showToast(`加载示例标定失败：${error.message}`, 'error'); }
}

async function loadMeasurementSample() {
    const button = document.getElementById('loadMeasurementSample');
    button.disabled = true;
    try {
        await waitForOpenCv();
        const [calibrationResponse, cornersResponse] = await Promise.all([
            fetch('assets/samples/sample-calibration.json'),
            fetch('assets/samples/sample-corners.json')
        ]);
        if (!calibrationResponse.ok) throw new Error(`示例标定 HTTP ${calibrationResponse.status}`);
        if (!cornersResponse.ok) throw new Error(`示例角点 HTTP ${cornersResponse.status}`);
        const sampleCalibration = normalizeCalibrationData(await calibrationResponse.json());
        const validation = validateCalibrationData(sampleCalibration);
        if (!validation.valid) throw new Error(validation.reason);
        const sampleCorners = await cornersResponse.json();
        const samplePath = 'left01.jpg';
        const sampleEntry = sampleCorners.images?.find(item => item.path === samplePath);
        const expectedCorners = sampleCalibration.boardConfig.width * sampleCalibration.boardConfig.height;
        if (sampleCorners.schema !== 'lab006.sample-corners.v1' || !sampleEntry || sampleEntry.corners.length !== expectedCorners) {
            throw new Error('示例角点数据无效');
        }
        if (sampleEntry.corners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
            throw new Error('示例角点包含无效数值');
        }

        if (measurementSourceActive()) stopCamera();
        await new Promise((resolve, reject) => {
            sampleImage.onload = resolve;
            sampleImage.onerror = () => reject(new Error('示例图像加载失败'));
            sampleImage.src = `assets/samples/${samplePath}`;
        });
        if (sampleImage.naturalWidth !== sampleCalibration.imageSize.width || sampleImage.naturalHeight !== sampleCalibration.imageSize.height) {
            throw new Error('示例图像尺寸与标定数据不一致');
        }

        calibData = sampleCalibration;
        sampleMode = true;
        video.hidden = true;
        sampleImage.hidden = false;
        canvas.width = sampleImage.naturalWidth;
        canvas.height = sampleImage.naturalHeight;
        setMeasurementAspect(sampleImage.naturalWidth, sampleImage.naturalHeight);
        boardCorners = undistortPointList(sampleEntry.corners, calibData);
        boardHomography = buildBoardHomography(boardCorners);
        measureMode = 'distance';
        document.getElementById('distanceModeCard').classList.add('active');
        document.getElementById('rectangleModeCard').classList.remove('active');
        measurePoints = [boardCorners[0], boardCorners[calibData.boardConfig.width - 1]];
        updateSourceControls(true);
        renderCalibrationStatus(true);
        updateMeasurement();
        updateOperationGuide();
        drawOverlay();
        showToast('测量示例已加载：标记线长度为 200 mm', 'success');
    } catch (error) {
        if (sampleMode) stopCamera();
        showToast(`加载测量示例失败：${error.message}`, 'error');
    } finally {
        if (!measurementSourceActive()) button.disabled = false;
    }
}
