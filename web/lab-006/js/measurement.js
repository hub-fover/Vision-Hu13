// measurement.js - 测量功能（增强版）
let video, canvas, ctx;
let stream = null;
let calibData = null;
let measureMode = 'distance';
let measurePoints = [];
let currentUnit = 'mm'; // 'mm' or 'cm'
let measurementHistory = [];

document.addEventListener('DOMContentLoaded', function() {
    video = document.getElementById('videoElement');
    canvas = document.getElementById('measureCanvas');
    ctx = canvas.getContext('2d');

    document.getElementById('startCamera').onclick = startCamera;
    document.getElementById('stopCamera').onclick = stopCamera;
    document.getElementById('clearPoints').onclick = clearPoints;

    canvas.onclick = handleCanvasClick;

    checkCalibration();
    loadMeasurementHistory();
});

function onOpenCVLoad() {
    console.log('OpenCV 准备就绪');
}

// 选择测量模式
function selectMode(mode) {
    measureMode = mode;
    clearPoints();

    // 更新UI
    document.getElementById('distanceModeCard').classList.remove('active');
    document.getElementById('rectangleModeCard').classList.remove('active');
    document.getElementById(mode + 'ModeCard').classList.add('active');

    updateOperationGuide();
    showToast(mode === 'distance' ? '已切换到距离测量模式' : '已切换到矩形测量模式', 'info');
}

// 更新操作引导
function updateOperationGuide() {
    const guide = document.getElementById('operationGuide');
    const guideTitle = document.getElementById('guideTitle');
    const guideText = document.getElementById('guideText');

    if (!stream) {
        guide.style.display = 'none';
        return;
    }

    guide.style.display = 'block';

    const pointsNeeded = measureMode === 'distance' ? 2 : 4;
    const pointsMarked = measurePoints.length;

    if (pointsMarked === 0) {
        guideTitle.innerHTML = '🎯 开始标记';
        guideText.innerHTML = `点击画面标记第 1 个点（共需 ${pointsNeeded} 个点）`;
    } else if (pointsMarked < pointsNeeded) {
        guideTitle.innerHTML = '🎯 继续标记';
        guideText.innerHTML = `已标记 ${pointsMarked}/${pointsNeeded} 个点，点击标记第 ${pointsMarked + 1} 个点`;
    } else {
        guideTitle.innerHTML = '✅ 标记完成';
        guideText.innerHTML = '测量完成！点击"清除标记"开始新的测量';
    }
}

function checkCalibration() {
    calibData = loadCalibration();
    const statusEl = document.getElementById('calibrationStatus');

    if (calibData) {
        const date = calibData.date ? new Date(calibData.date).toLocaleString('zh-CN') : '未知';
        const quality = calibData.error < 0.5 ? '优秀' : calibData.error < 1.0 ? '良好' : '一般';

        statusEl.innerHTML = `
            <div style="display: grid; gap: var(--spacing-xs);">
                <p><strong>✓ 已加载标定数据</strong></p>
                <p>重投影误差：${calibData.error.toFixed(3)} 像素 (${quality})</p>
                <p>标定时间：${date}</p>
            </div>
        `;
        statusEl.className = 'status-message status-success';
    } else {
        statusEl.innerHTML = `
            <p><strong>⚠️ 未找到标定数据</strong></p>
            <p>请先完成相机标定才能进行测量</p>
            <div class="controls mt-2">
                <a href="calibration.html" class="btn btn-primary">前往标定</a>
                <button onclick="loadSampleCalibration()" class="btn btn-secondary">📦 加载示例标定</button>
            </div>
        `;
        statusEl.className = 'status-message status-warning';
    }
}

async function startCamera() {
    if (!calibData) {
        showToast('请先完成相机标定', 'error');
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
        document.getElementById('clearPoints').disabled = false;
        document.getElementById('stopCamera').disabled = false;

        updateOperationGuide();
        requestAnimationFrame(updateCanvas);
        showToast('相机已启动', 'success');
    } catch (error) {
        showToast('无法访问相机，请检查权限', 'error');
    }
}

function stopCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    document.getElementById('startCamera').disabled = false;
    document.getElementById('clearPoints').disabled = true;
    document.getElementById('stopCamera').disabled = true;

    clearPoints();
    document.getElementById('operationGuide').style.display = 'none';
    showToast('相机已关闭', 'info');
}

function clearPoints() {
    measurePoints = [];
    updateMeasurement();
    updateOperationGuide();
}

function handleCanvasClick(e) {
    if (!stream) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const maxPoints = measureMode === 'distance' ? 2 : 4;

    if (measurePoints.length < maxPoints) {
        measurePoints.push({ x, y });
        updateMeasurement();
        updateOperationGuide();

        // 如果标记完成，添加到历史
        if (measurePoints.length === maxPoints) {
            addToHistory();
        }
    }
}

function updateCanvas() {
    if (!stream) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制标记点
    measurePoints.forEach((p, i) => {
        ctx.fillStyle = '#0071e3';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // 绘制点序号
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, p.x, p.y);
    });

    // 绘制连线
    if (measurePoints.length === 2 && measureMode === 'distance') {
        ctx.strokeStyle = '#0071e3';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
        ctx.lineTo(measurePoints[1].x, measurePoints[1].y);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (measurePoints.length === 4 && measureMode === 'rectangle') {
        ctx.strokeStyle = '#0071e3';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(measurePoints[i].x, measurePoints[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
    }

    requestAnimationFrame(updateCanvas);
}

function updateMeasurement() {
    const resultEl = document.getElementById('measurementResult');

    if (measurePoints.length === 2 && measureMode === 'distance') {
        const dist = calculateDistance(measurePoints[0], measurePoints[1]);
        const realDist = (dist * calibData.squareSize) / calibData.cameraMatrix[0];
        const displayValue = currentUnit === 'mm' ? realDist : realDist / 10;
        const unit = currentUnit === 'mm' ? '毫米' : '厘米';

        resultEl.innerHTML = `<strong>测量距离：</strong>${displayValue.toFixed(2)} ${unit}`;
        resultEl.style.color = 'var(--color-primary)';
    } else if (measurePoints.length === 4 && measureMode === 'rectangle') {
        const width = calculateDistance(measurePoints[0], measurePoints[1]);
        const height = calculateDistance(measurePoints[1], measurePoints[2]);
        const realWidth = (width * calibData.squareSize) / calibData.cameraMatrix[0];
        const realHeight = (height * calibData.squareSize) / calibData.cameraMatrix[0];

        const displayWidth = currentUnit === 'mm' ? realWidth : realWidth / 10;
        const displayHeight = currentUnit === 'mm' ? realHeight : realHeight / 10;
        const unit = currentUnit === 'mm' ? '毫米' : '厘米';

        resultEl.innerHTML = `<strong>矩形尺寸：</strong>${displayWidth.toFixed(2)} × ${displayHeight.toFixed(2)} ${unit}`;
        resultEl.style.color = 'var(--color-primary)';
    } else {
        const pointsNeeded = measureMode === 'distance' ? '两个' : '四个';
        resultEl.innerHTML = `点击画面标记${pointsNeeded}测量点`;
        resultEl.style.color = 'var(--color-text-secondary)';
    }
}

// 单位切换
function toggleUnit() {
    currentUnit = currentUnit === 'mm' ? 'cm' : 'mm';
    document.getElementById('unitToggle').textContent = `单位: ${currentUnit}`;
    updateMeasurement();
    updateHistoryDisplay();
    showToast(`已切换到${currentUnit === 'mm' ? '毫米' : '厘米'}`, 'info');
}

// 添加到历史记录
function addToHistory() {
    const timestamp = new Date().toLocaleString('zh-CN');
    let measurement = {};

    if (measureMode === 'distance' && measurePoints.length === 2) {
        const dist = calculateDistance(measurePoints[0], measurePoints[1]);
        const realDist = (dist * calibData.squareSize) / calibData.cameraMatrix[0];
        measurement = {
            type: 'distance',
            value: realDist,
            timestamp: timestamp
        };
    } else if (measureMode === 'rectangle' && measurePoints.length === 4) {
        const width = calculateDistance(measurePoints[0], measurePoints[1]);
        const height = calculateDistance(measurePoints[1], measurePoints[2]);
        const realWidth = (width * calibData.squareSize) / calibData.cameraMatrix[0];
        const realHeight = (height * calibData.squareSize) / calibData.cameraMatrix[0];
        measurement = {
            type: 'rectangle',
            width: realWidth,
            height: realHeight,
            timestamp: timestamp
        };
    }

    if (measurement.type) {
        measurementHistory.unshift(measurement);
        if (measurementHistory.length > 20) {
            measurementHistory = measurementHistory.slice(0, 20);
        }
        saveMeasurementHistory();
        updateHistoryDisplay();
    }
}

// 保存测量历史
function saveMeasurementHistory() {
    try {
        localStorage.setItem('measurementHistory', JSON.stringify(measurementHistory));
    } catch (e) {
        console.error('保存测量历史失败:', e);
    }
}

// 加载测量历史
function loadMeasurementHistory() {
    try {
        const data = localStorage.getItem('measurementHistory');
        if (data) {
            measurementHistory = JSON.parse(data);
            updateHistoryDisplay();
        }
    } catch (e) {
        console.error('加载测量历史失败:', e);
    }
}

// 更新历史显示
function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');

    if (measurementHistory.length === 0) {
        historyList.innerHTML = '<li class="status-message status-info">暂无测量记录</li>';
        return;
    }

    historyList.innerHTML = measurementHistory.map((item, index) => {
        let valueText = '';
        if (item.type === 'distance') {
            const value = currentUnit === 'mm' ? item.value : item.value / 10;
            valueText = `${value.toFixed(2)} ${currentUnit}`;
        } else {
            const width = currentUnit === 'mm' ? item.width : item.width / 10;
            const height = currentUnit === 'mm' ? item.height : item.height / 10;
            valueText = `${width.toFixed(2)} × ${height.toFixed(2)} ${currentUnit}`;
        }

        const icon = item.type === 'distance' ? '📏' : '📐';

        return `
            <li class="history-item">
                <div>
                    <span class="history-value">${icon} ${valueText}</span>
                    <div class="history-date">${item.timestamp}</div>
                </div>
                <div class="history-actions">
                    <button class="icon-btn" onclick="copyMeasurement(${index})" title="复制">📋</button>
                    <button class="icon-btn" onclick="deleteHistoryItem(${index})" title="删除">🗑️</button>
                </div>
            </li>
        `;
    }).join('');
}

// 复制测量结果
function copyMeasurement(index) {
    const item = measurementHistory[index];
    let text = '';

    if (item.type === 'distance') {
        const value = currentUnit === 'mm' ? item.value : item.value / 10;
        text = `距离: ${value.toFixed(2)} ${currentUnit}`;
    } else {
        const width = currentUnit === 'mm' ? item.width : item.width / 10;
        const height = currentUnit === 'mm' ? item.height : item.height / 10;
        text = `矩形: ${width.toFixed(2)} × ${height.toFixed(2)} ${currentUnit}`;
    }

    copyToClipboard(text);
    showToast('已复制到剪贴板', 'success');
}

// 删除历史记录项
function deleteHistoryItem(index) {
    measurementHistory.splice(index, 1);
    saveMeasurementHistory();
    updateHistoryDisplay();
    showToast('已删除记录', 'info');
}

// 清空测量历史
function clearMeasurementHistory() {
    if (measurementHistory.length === 0) return;

    if (confirm('确定要清空所有测量历史吗？')) {
        measurementHistory = [];
        saveMeasurementHistory();
        updateHistoryDisplay();
        showToast('已清空历史记录', 'info');
    }
}

// 加载示例标定数据
async function loadSampleCalibration() {
    try {
        const response = await fetch('assets/samples/sample-calibration.json');
        if (!response.ok) {
            throw new Error('无法加载示例标定数据');
        }
        const sampleCalib = await response.json();

        // 保存到localStorage
        saveCalibration(sampleCalib);

        // 重新加载标定数据
        calibData = sampleCalib;
        checkCalibration();

        showToast('✅ 已加载示例标定数据', 'success');
    } catch (error) {
        showToast('❌ 加载示例数据失败: ' + error.message, 'error');
    }
}
