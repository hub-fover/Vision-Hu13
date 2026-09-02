// measurement.js - 测量功能
let video, canvas, ctx;
let stream = null;
let calibData = null;
let measureMode = 'distance';
let measurePoints = [];

document.addEventListener('DOMContentLoaded', function() {
    video = document.getElementById('videoElement');
    canvas = document.getElementById('measureCanvas');
    ctx = canvas.getContext('2d');

    document.getElementById('startCamera').onclick = startCamera;
    document.getElementById('stopCamera').onclick = stopCamera;
    document.getElementById('clearPoints').onclick = clearPoints;
    document.getElementById('distanceMode').onclick = () => setMode('distance');
    document.getElementById('rectangleMode').onclick = () => setMode('rectangle');

    canvas.onclick = handleCanvasClick;

    checkCalibration();
});

function onOpenCVLoad() {
    console.log('OpenCV 准备就绪');
}

function checkCalibration() {
    calibData = loadCalibration();
    const statusEl = document.getElementById('calibrationStatus');

    if (calibData) {
        statusEl.innerHTML = `✓ 已加载标定数据（误差: ${calibData.error.toFixed(3)} 像素）`;
        statusEl.className = 'status-message status-success';
    } else {
        statusEl.innerHTML = '⚠ 未找到标定数据，请先进行相机标定';
        statusEl.className = 'status-message status-error';
    }
}

async function startCamera() {
    if (!calibData) {
        alert('请先完成相机标定');
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

        requestAnimationFrame(updateCanvas);
    } catch (error) {
        alert('无法访问相机');
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
}

function setMode(mode) {
    measureMode = mode;
    clearPoints();
}

function clearPoints() {
    measurePoints = [];
    updateMeasurement();
}

function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (measureMode === 'distance') {
        measurePoints.push({ x, y });
        if (measurePoints.length > 2) measurePoints.shift();
    } else if (measureMode === 'rectangle') {
        measurePoints.push({ x, y });
        if (measurePoints.length > 4) measurePoints.shift();
    }

    updateMeasurement();
}

function updateCanvas() {
    if (!stream) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    measurePoints.forEach((p, i) => {
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillText(i + 1, p.x + 10, p.y - 10);
    });

    if (measurePoints.length === 2 && measureMode === 'distance') {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
        ctx.lineTo(measurePoints[1].x, measurePoints[1].y);
        ctx.stroke();
    }

    requestAnimationFrame(updateCanvas);
}

function updateMeasurement() {
    const resultEl = document.getElementById('measurementResult');

    if (measurePoints.length === 2 && measureMode === 'distance') {
        const dist = calculateDistance(measurePoints[0], measurePoints[1]);
        const realDist = (dist * squareSize) / calibData.cameraMatrix[0];
        resultEl.innerHTML = `<strong>测量距离:</strong> ${realDist.toFixed(2)} 毫米`;
    } else if (measurePoints.length === 4 && measureMode === 'rectangle') {
        const width = calculateDistance(measurePoints[0], measurePoints[1]);
        const height = calculateDistance(measurePoints[1], measurePoints[2]);
        const realWidth = (width * squareSize) / calibData.cameraMatrix[0];
        const realHeight = (height * squareSize) / calibData.cameraMatrix[0];
        resultEl.innerHTML = `<strong>矩形尺寸:</strong> ${realWidth.toFixed(2)} × ${realHeight.toFixed(2)} 毫米`;
    } else {
        resultEl.innerHTML = `<p>点击画面标记${measureMode === 'distance' ? '两个' : '四个'}测量点</p>`;
    }
}
