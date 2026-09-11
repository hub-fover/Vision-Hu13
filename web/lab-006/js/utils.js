let opencvReady = false;
let opencvLoadError = null;
let opencvReadyResolve;
let opencvReadyReject;
const opencvReadyPromise = new Promise((resolve, reject) => {
    opencvReadyResolve = resolve;
    opencvReadyReject = reject;
});

async function onOpenCvReady() {
    if (typeof cv === 'undefined') {
        onOpenCvError(new Error('OpenCV.js loaded without the cv global'));
        return;
    }
    const finish = () => {
        opencvReady = true;
        opencvReadyResolve(cv);
        const status = document.getElementById('opencvStatus');
        if (status) status.style.display = 'none';
        if (typeof showToast === 'function') showToast('OpenCV.js 已就绪', 'success');
        if (typeof onOpenCVLoad === 'function') onOpenCVLoad();
    };
    try {
        let runtime = cv;
        if (typeof runtime === 'function' && !runtime.Mat) {
            const response = await fetch('vendor/opencv.wasm?v=20260910-1');
            if (!response.ok) throw new Error(`OpenCV WASM 下载失败：HTTP ${response.status}`);
            const wasmBinary = await response.arrayBuffer();
            runtime = runtime({ wasmBinary });
        }
        runtime = typeof runtime.then === 'function' ? await runtime : runtime;
        globalThis.cv = runtime;
        const directDetector = runtime.findChessboardCornersSB || runtime.findChessboardCorners;
        const fallbackDetector = runtime.threshold && runtime.connectedComponentsWithStats && runtime.matFromArray;
        const calibrationApi = runtime.calibrateCamera || runtime.calibrateCameraExtended;
        if (!runtime.Mat || (!directDetector && !fallbackDetector) || !calibrationApi) throw new Error('OpenCV.js 缺少标定模块');
        finish();
    } catch (error) {
        onOpenCvError(error);
    }
}

function onOpenCvError(error) {
    opencvLoadError = error instanceof Error ? error : new Error(String(error));
    opencvReadyReject(opencvLoadError);
    const status = document.getElementById('opencvStatus');
    if (status) {
        status.style.display = 'block';
        status.textContent = `OpenCV.js 加载失败：${opencvLoadError.message}`;
        status.className = 'status-message status-error';
    }
}

function waitForOpenCv(timeoutMs = 30000) {
    if (opencvReady) return Promise.resolve(cv);
    if (opencvLoadError) return Promise.reject(opencvLoadError);
    return Promise.race([
        opencvReadyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('OpenCV.js 加载超时')), timeoutMs))
    ]);
}

function captureVideoFrame(videoElement) {
    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new Error('相机画面尚未就绪');
    }
    videoElement.width = width;
    videoElement.height = height;
    const frame = new cv.Mat(height, width, cv.CV_8UC4);
    try {
        new cv.VideoCapture(videoElement).read(frame);
        return frame;
    } catch (error) {
        frame.delete();
        throw error;
    }
}

function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message;
    element.className = `status-message status-${type === 'warning' ? 'warning' : type}`;
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function validateCalibrationData(data) {
    if (!data || !Array.isArray(data.cameraMatrix) || data.cameraMatrix.length !== 9) {
        return { valid: false, reason: '缺少 3x3 相机内参矩阵' };
    }
    if (!Array.isArray(data.distCoeffs) || data.distCoeffs.length < 4) {
        return { valid: false, reason: '缺少畸变参数' };
    }
    if (!data.imageSize || !isFiniteNumber(data.imageSize.width) || !isFiniteNumber(data.imageSize.height)) {
        return { valid: false, reason: '缺少有效图像尺寸' };
    }
    if (!isFiniteNumber(data.squareSize) || data.squareSize <= 0) {
        return { valid: false, reason: '方格尺寸必须为正数' };
    }
    if (!data.boardConfig || data.boardConfig.width < 2 || data.boardConfig.height < 2) {
        return { valid: false, reason: '缺少棋盘格配置' };
    }
    if (!data.cameraMatrix.every(isFiniteNumber) || !data.distCoeffs.every(isFiniteNumber)) {
        return { valid: false, reason: '标定参数包含无效数值' };
    }
    return { valid: true };
}

function normalizeCalibrationData(data) {
    if (!data || typeof data !== 'object') return data;
    return {
        ...data,
        version: data.version || 1,
        boardConfig: data.boardConfig || { width: 9, height: 6 }
    };
}

function saveCalibration(data) {
    const validation = validateCalibrationData(data);
    if (!validation.valid) return false;
    try {
        localStorage.setItem('cameraCalibration', JSON.stringify({ ...normalizeCalibrationData(data), version: 2 }));
        return true;
    } catch (error) {
        console.error('保存标定数据失败:', error);
        return false;
    }
}

function loadCalibration() {
    try {
        const raw = localStorage.getItem('cameraCalibration');
        if (!raw) return null;
        const data = normalizeCalibrationData(JSON.parse(raw));
        return validateCalibrationData(data).valid ? data : null;
    } catch (error) {
        console.error('加载标定数据失败:', error);
        return null;
    }
}

function clearCalibration() {
    localStorage.removeItem('cameraCalibration');
}

function detectChessboardCorners(imageMat, patternSize) {
    let corners = new cv.Mat();
    let gray = null;
    try {
        gray = new cv.Mat();
        if (imageMat.channels() === 1) imageMat.copyTo(gray);
        else cv.cvtColor(imageMat, gray, cv.COLOR_RGBA2GRAY);
        const detector = cv.findChessboardCornersSB || cv.findChessboardCorners;
        let found = false;
        if (typeof detector === 'function') {
            found = detector(gray, patternSize, corners, cv.CALIB_CB_ADAPTIVE_THRESH + cv.CALIB_CB_NORMALIZE_IMAGE);
        } else {
            corners.delete();
            corners = detectChessboardFallback(gray, patternSize.width, patternSize.height);
            found = Boolean(corners);
            if (!corners) corners = new cv.Mat();
        }
        if (found && typeof cv.cornerSubPix === 'function') {
            const criteria = new cv.TermCriteria(
                cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER,
                30,
                0.001
            );
            cv.cornerSubPix(gray, corners, new cv.Size(11, 11), new cv.Size(-1, -1), criteria);
        }
        return { found, corners };
    } finally {
        if (gray) gray.delete();
    }
}

function detectChessboardFallback(gray, columns, rows) {
    const contourCorners = detectChessboardBySquareContours(gray, columns, rows);
    if (contourCorners) return contourCorners;

    const cellsX = columns + 1;
    const cellsY = rows + 1;
    const expectedPerRow = Math.floor(cellsX / 2);
    const imageArea = gray.rows * gray.cols;
    const candidateSets = [];
    for (const polarity of [cv.THRESH_BINARY_INV, cv.THRESH_BINARY]) {
        const binary = new cv.Mat(), labels = new cv.Mat(), stats = new cv.Mat(), centroids = new cv.Mat();
        try {
            cv.threshold(gray, binary, 0, 255, polarity | (cv.THRESH_OTSU || 8));
            const count = cv.connectedComponentsWithStats(binary, labels, stats, centroids, 4, cv.CV_32S);
            const components = [];
            for (let index = 1; index < count; index += 1) {
                const area = stats.intAt(index, cv.CC_STAT_AREA);
                const width = stats.intAt(index, cv.CC_STAT_WIDTH);
                const height = stats.intAt(index, cv.CC_STAT_HEIGHT);
                const aspect = width / Math.max(1, height);
                if (area >= imageArea * 0.00003 && width >= 4 && height >= 4 && aspect >= 0.45 && aspect <= 2.2) {
                    components.push({ area, x: centroids.doubleAt(index, 0), y: centroids.doubleAt(index, 1) });
                }
            }
            if (components.length >= expectedPerRow * Math.max(3, cellsY - 1)) candidateSets.push(components);
        } finally { binary.delete(); labels.delete(); stats.delete(); centroids.delete(); }
    }
    let best = null;
    for (const components of candidateSets) {
        const areas = components.map(item => item.area).sort((a, b) => a - b);
        const median = areas[Math.floor(areas.length / 2)];
        const similar = components.filter(item => item.area >= median * 0.35 && item.area <= median * 2.8);
        const grouped = clusterChessboardRows(similar, cellsY);
        if (!grouped || grouped.some(row => row.length < expectedPerRow - 1)) continue;
        const score = grouped.reduce((sum, row) => sum + Math.min(row.length, expectedPerRow), 0);
        if (!best || score > best.score) best = { grouped, score };
    }
    if (!best) return null;
    let chosen = null;
    for (const baseParity of [0, 1]) {
        const cells = new Map();
        best.grouped.forEach((row, rowIndex) => {
            row.slice().sort((a, b) => a.x - b.x).forEach((item, itemIndex) => {
                const column = ((baseParity + rowIndex) & 1) + itemIndex * 2;
                if (column < cellsX) cells.set(`${column},${rowIndex}`, item);
            });
        });
        const points = [];
        for (let row = 1; row < cellsY; row += 1) for (let column = 1; column < cellsX; column += 1) {
            const neighbors = [[column - 1, row - 1], [column, row - 1], [column - 1, row], [column, row]].map(([x, y]) => cells.get(`${x},${y}`)).filter(Boolean);
            if (neighbors.length < 2) continue;
            points.push([neighbors.reduce((sum, item) => sum + item.x, 0) / neighbors.length, neighbors.reduce((sum, item) => sum + item.y, 0) / neighbors.length]);
        }
        if (!chosen || points.length > chosen.length) chosen = points;
    }
    return chosen?.length === columns * rows ? cv.matFromArray(chosen.length, 1, cv.CV_32FC2, chosen.flat()) : null;
}

function detectChessboardBySquareContours(gray, columns, rows) {
    const imageArea = gray.rows * gray.cols;
    const binaries = [];
    let kernel = null;
    try {
        const otsu = new cv.Mat();
        cv.threshold(gray, otsu, 0, 255, cv.THRESH_BINARY_INV | (cv.THRESH_OTSU || 8));
        binaries.push(otsu);
        if (typeof cv.adaptiveThreshold === 'function') {
            const adaptive = new cv.Mat();
            cv.adaptiveThreshold(gray, adaptive, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 5);
            binaries.push(adaptive);
        }
        kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        for (const binary of binaries) {
            const separated = new cv.Mat();
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            try {
                cv.erode(binary, separated, kernel);
                cv.findContours(separated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
                const squares = [];
                for (let index = 0; index < contours.size(); index += 1) {
                    const contour = contours.get(index);
                    const approximation = new cv.Mat();
                    try {
                        const perimeter = cv.arcLength(contour, true);
                        cv.approxPolyDP(contour, approximation, perimeter * 0.04, true);
                        if (approximation.rows !== 4) continue;
                        const area = Math.abs(cv.contourArea(approximation));
                        if (area < imageArea * 0.0002 || area > imageArea * 0.04) continue;
                        if (typeof cv.isContourConvex === 'function' && !cv.isContourConvex(approximation)) continue;
                        const bounds = cv.boundingRect(approximation);
                        const aspect = bounds.width / Math.max(1, bounds.height);
                        const fill = area / Math.max(1, bounds.width * bounds.height);
                        if (aspect < 0.4 || aspect > 2.5 || fill < 0.35) continue;
                        const vertices = [];
                        for (let row = 0; row < 4; row += 1) {
                            vertices.push({ x: approximation.data32S[row * 2], y: approximation.data32S[row * 2 + 1] });
                        }
                        squares.push({ area, vertices });
                    } finally {
                        approximation.delete();
                        contour.delete();
                    }
                }
                const ordered = findSharedCheckerboardCorners(squares, columns, rows);
                if (ordered) return cv.matFromArray(ordered.length, 1, cv.CV_32FC2, ordered.flatMap(point => [point.x, point.y]));
            } finally {
                separated.delete();
                contours.delete();
                hierarchy.delete();
            }
        }
        return null;
    } finally {
        binaries.forEach(binary => binary.delete());
        if (kernel) kernel.delete();
    }
}

function findSharedCheckerboardCorners(squares, columns, rows) {
    if (squares.length < Math.floor((columns + 1) * (rows + 1) / 2) * 0.65) return null;
    const areas = squares.map(square => square.area).sort((a, b) => a - b);
    const medianArea = areas[Math.floor(areas.length / 2)];
    const similar = squares.filter(square => square.area >= medianArea * 0.25 && square.area <= medianArea * 4);
    const mergeDistance = Math.max(3, Math.min(14, Math.sqrt(medianArea) * 0.24));
    const clusters = [];
    for (const square of similar) {
        for (const vertex of square.vertices) {
            let cluster = clusters.find(item => Math.hypot(item.x - vertex.x, item.y - vertex.y) <= mergeDistance);
            if (!cluster) {
                cluster = { x: vertex.x, y: vertex.y, count: 0, squareIds: new Set() };
                clusters.push(cluster);
            }
            if (!cluster.squareIds.has(square)) {
                cluster.x = (cluster.x * cluster.count + vertex.x) / (cluster.count + 1);
                cluster.y = (cluster.y * cluster.count + vertex.y) / (cluster.count + 1);
                cluster.count += 1;
                cluster.squareIds.add(square);
            }
        }
    }
    const shared = clusters.filter(cluster => cluster.count >= 2).map(({ x, y }) => ({ x, y }));
    if (shared.length !== columns * rows) return null;
    return orderCheckerboardCorners(shared, columns, rows);
}

function orderCheckerboardCorners(points, columns, rows) {
    const projectiveOrder = orderCheckerboardByProjectiveGrid(points, columns, rows);
    if (projectiveOrder) return projectiveOrder;

    const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
    let xx = 0, xy = 0, yy = 0;
    points.forEach(point => {
        const x = point.x - center.x, y = point.y - center.y;
        xx += x * x; xy += x * y; yy += y * y;
    });
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    const firstAxis = { x: Math.cos(angle), y: Math.sin(angle) };
    const secondAxis = { x: -firstAxis.y, y: firstAxis.x };
    return groupCheckerboardAlongAxes(points, center, firstAxis, secondAxis, columns, rows)
        || groupCheckerboardAlongAxes(points, center, secondAxis, firstAxis, columns, rows);
}

function orderCheckerboardByProjectiveGrid(points, columns, rows) {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
        upper.push(point);
    }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    if (hull.length < 4) return null;
    let quadrilateral = null;
    let largestArea = 0;
    for (let a = 0; a < hull.length - 3; a += 1) {
        for (let b = a + 1; b < hull.length - 2; b += 1) {
            for (let c = b + 1; c < hull.length - 1; c += 1) {
                for (let d = c + 1; d < hull.length; d += 1) {
                    const candidate = [hull[a], hull[b], hull[c], hull[d]];
                    const area = Math.abs(candidate.reduce((sum, point, index) => {
                        const next = candidate[(index + 1) % candidate.length];
                        return sum + point.x * next.y - point.y * next.x;
                    }, 0)) / 2;
                    if (area > largestArea) { largestArea = area; quadrilateral = candidate; }
                }
            }
        }
    }
    if (!quadrilateral) return null;
    const target = [
        { x: 0, y: 0 },
        { x: columns - 1, y: 0 },
        { x: columns - 1, y: rows - 1 },
        { x: 0, y: rows - 1 }
    ];
    let best = null;
    for (const direction of [1, -1]) {
        for (let start = 0; start < 4; start += 1) {
            const source = Array.from({ length: 4 }, (_, index) => quadrilateral[(start + direction * index + 8) % 4]);
            let homography;
            try { homography = solveHomography(source, target); } catch { continue; }
            const cells = new Map();
            let error = 0;
            let valid = true;
            for (const point of points) {
                const mapped = mapPointWithHomography(point, homography);
                const column = Math.round(mapped.x), row = Math.round(mapped.y);
                const distance = Math.hypot(mapped.x - column, mapped.y - row);
                if (column < 0 || column >= columns || row < 0 || row >= rows || distance > 0.35 || cells.has(`${column},${row}`)) {
                    valid = false;
                    break;
                }
                cells.set(`${column},${row}`, point);
                error += distance;
            }
            if (valid && cells.size === columns * rows && (!best || error < best.error)) best = { cells, error };
        }
    }
    if (!best) return null;
    const ordered = [];
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) ordered.push(best.cells.get(`${column},${row}`));
    return ordered;
}

function groupCheckerboardAlongAxes(points, center, horizontalAxis, verticalAxis, columns, rows) {
    let acrossAxis = horizontalAxis;
    let downAxis = verticalAxis;
    if (Math.abs(acrossAxis.x) >= Math.abs(acrossAxis.y) ? acrossAxis.x < 0 : acrossAxis.y < 0) acrossAxis = { x: -acrossAxis.x, y: -acrossAxis.y };
    if (Math.abs(downAxis.y) >= Math.abs(downAxis.x) ? downAxis.y < 0 : downAxis.x < 0) downAxis = { x: -downAxis.x, y: -downAxis.y };
    const projected = points.map(point => ({
        point,
        across: (point.x - center.x) * acrossAxis.x + (point.y - center.y) * acrossAxis.y,
        down: (point.x - center.x) * downAxis.x + (point.y - center.y) * downAxis.y
    }));
    const downValues = projected.map(item => item.down);
    const min = Math.min(...downValues), max = Math.max(...downValues);
    const centers = Array.from({ length: rows }, (_, index) => min + index * (max - min) / (rows - 1));
    let groups = [];
    for (let iteration = 0; iteration < 30; iteration += 1) {
        groups = Array.from({ length: rows }, () => []);
        projected.forEach(item => {
            let selected = 0;
            for (let index = 1; index < rows; index += 1) if (Math.abs(item.down - centers[index]) < Math.abs(item.down - centers[selected])) selected = index;
            groups[selected].push(item);
        });
        let changed = false;
        groups.forEach((group, index) => {
            if (!group.length) return;
            const next = group.reduce((sum, item) => sum + item.down, 0) / group.length;
            changed ||= Math.abs(next - centers[index]) > 0.01;
            centers[index] = next;
        });
        if (!changed) break;
    }
    if (groups.some(group => group.length !== columns)) return null;
    return groups
        .map((group, index) => ({ group, center: centers[index] }))
        .sort((a, b) => a.center - b.center)
        .flatMap(({ group }) => group.sort((a, b) => a.across - b.across).map(item => item.point));
}

function clusterChessboardRows(items, count) {
    if (items.length < count) return null;
    const ys = items.map(item => item.y), min = Math.min(...ys), max = Math.max(...ys);
    if (!(max > min)) return null;
    const centers = Array.from({ length: count }, (_, index) => min + ((index + 0.5) / count) * (max - min));
    for (let iteration = 0; iteration < 24; iteration += 1) {
        const groups = Array.from({ length: count }, () => []);
        for (const item of items) {
            let selected = 0;
            for (let index = 1; index < count; index += 1) if (Math.abs(item.y - centers[index]) < Math.abs(item.y - centers[selected])) selected = index;
            groups[selected].push(item);
        }
        let changed = false;
        groups.forEach((group, index) => { if (group.length) { const next = group.reduce((sum, item) => sum + item.y, 0) / group.length; changed ||= Math.abs(next - centers[index]) > 0.25; centers[index] = next; } });
        if (!changed) break;
    }
    const groups = Array.from({ length: count }, () => []);
    for (const item of items) {
        let selected = 0;
        for (let index = 1; index < count; index += 1) if (Math.abs(item.y - centers[index]) < Math.abs(item.y - centers[selected])) selected = index;
        groups[selected].push(item);
    }
    return groups.some(group => !group.length) ? null : groups;
}

function drawChessboardCorners(imageMat, patternSize, corners, found) {
    if (typeof cv.drawChessboardCorners === 'function') {
        cv.drawChessboardCorners(imageMat, patternSize, corners, found);
        return;
    }
    if (!found || imageMat.channels() !== 4) return;
    for (let index = 0; index < corners.rows; index += 1) {
        const centerX = Math.round(corners.data32F[index * 2]);
        const centerY = Math.round(corners.data32F[index * 2 + 1]);
        for (let y = centerY - 3; y <= centerY + 3; y += 1) for (let x = centerX - 3; x <= centerX + 3; x += 1) {
            if (x < 0 || y < 0 || x >= imageMat.cols || y >= imageMat.rows) continue;
            const offset = (y * imageMat.cols + x) * 4;
            imageMat.data[offset] = 46; imageMat.data[offset + 1] = 204; imageMat.data[offset + 2] = 113; imageMat.data[offset + 3] = 255;
        }
    }
}

function calculateDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function createBoardObjectPoints(width, height, squareSize) {
    const points = [];
    for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
            points.push({ x: col * squareSize, y: row * squareSize, z: 0 });
        }
    }
    return points;
}

function solveHomography(sourcePoints, targetPoints) {
    if (sourcePoints.length !== 4 || targetPoints.length !== 4) throw new Error('单应映射需要四个点');
    const matrix = [];
    const values = [];
    for (let i = 0; i < 4; i += 1) {
        const { x, y } = sourcePoints[i];
        const { x: u, y: v } = targetPoints[i];
        matrix.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); values.push(u);
        matrix.push([0, 0, 0, x, y, 1, -x * v, -y * v]); values.push(v);
    }
    const solution = gaussianSolve(matrix, values);
    if (!solution || solution.some(value => !Number.isFinite(value))) throw new Error('无法建立平面映射');
    return [...solution, 1];
}

function gaussianSolve(input, rightHandSide) {
    const a = input.map((row, index) => [...row, rightHandSide[index]]);
    for (let column = 0; column < 8; column += 1) {
        let pivot = column;
        for (let row = column + 1; row < 8; row += 1) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
        if (Math.abs(a[pivot][column]) < 1e-12) return null;
        [a[column], a[pivot]] = [a[pivot], a[column]];
        const divisor = a[column][column];
        for (let c = column; c <= 8; c += 1) a[column][c] /= divisor;
        for (let row = 0; row < 8; row += 1) {
            if (row === column) continue;
            const factor = a[row][column];
            for (let c = column; c <= 8; c += 1) a[row][c] -= factor * a[column][c];
        }
    }
    return a.map(row => row[8]);
}

function mapPointWithHomography(point, homography) {
    const denominator = homography[6] * point.x + homography[7] * point.y + homography[8];
    if (Math.abs(denominator) < 1e-12) throw new Error('点位于映射无效区域');
    return {
        x: (homography[0] * point.x + homography[1] * point.y + homography[2]) / denominator,
        y: (homography[3] * point.x + homography[4] * point.y + homography[5]) / denominator
    };
}

function undistortPointList(points, calibration) {
    if (!points.length || typeof cv.undistortPoints !== 'function') return points;
    let source, destination, cameraMatrix, distortion;
    try {
        source = cv.matFromArray(points.length, 1, cv.CV_32FC2, points.flatMap(point => [point.x, point.y]));
        destination = new cv.Mat();
        cameraMatrix = cv.matFromArray(3, 3, cv.CV_64F, calibration.cameraMatrix);
        distortion = cv.matFromArray(calibration.distCoeffs.length, 1, cv.CV_64F, calibration.distCoeffs);
        cv.undistortPoints(source, destination, cameraMatrix, distortion, cameraMatrix);
        const result = [];
        for (let i = 0; i < points.length; i += 1) result.push({ x: destination.data32F[i * 2], y: destination.data32F[i * 2 + 1] });
        return result;
    } finally {
        if (source) source.delete(); if (destination) destination.delete(); if (cameraMatrix) cameraMatrix.delete(); if (distortion) distortion.delete();
    }
}

function formatNumber(num, decimals = 2) { return Number(num).toFixed(decimals); }
function matToCanvas(mat, canvasId) { cv.imshow(canvasId, mat); }

function showToast(message, type = 'info') {
    const oldToast = document.querySelector('.toast');
    if (oldToast) oldToast.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => fallbackCopyToClipboard(text));
    else fallbackCopyToClipboard(text);
}

function fallbackCopyToClipboard(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } finally { area.remove(); }
}

function formatDate(date) {
    return new Date(date).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function debounce(func, wait) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; }
function throttle(func, limit) { let locked = false; return (...args) => { if (locked) return; func(...args); locked = true; setTimeout(() => { locked = false; }, limit); }; }
