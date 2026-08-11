let timer;
self.onmessage = () => {
  let finished = false;
  const finish = message => { if (finished) return; finished = true; clearInterval(timer); clearTimeout(timeout); self.postMessage({ id: 77, ...message }); };
  const done = value => {
    const result = { Mat: typeof value?.Mat === 'function', findChessboardCorners: typeof value?.findChessboardCorners === 'function', findChessboardCornersSB: typeof value?.findChessboardCornersSB === 'function', calibrateCamera: typeof value?.calibrateCamera === 'function', calibrateCameraExtended: typeof value?.calibrateCameraExtended === 'function', checkerboardFallback: typeof value?.threshold === 'function' && typeof value?.connectedComponentsWithStats === 'function' && typeof value?.matFromArray === 'function', undistort: typeof value?.undistort === 'function' };
    const missing = ['Mat', 'undistort', 'calibrateCameraExtended', 'checkerboardFallback'].filter(name => !result[name]);
    if (missing.length) finish({ error: { code: 'RUNTIME_MISSING', message: `OpenCV.js calibration APIs missing: ${missing.join(', ')}` }, result });
    else finish({ result });
  };
  const timeout = setTimeout(() => finish({ error: { code: 'RUNTIME_MISSING', message: 'OpenCV.js runtime prerequisite probe timed out' } }), 8_000);
  self.Module = { onRuntimeInitialized: () => done(self.cv) };
  try { importScripts('../vendor/opencv.js'); timer = setInterval(() => { if (self.cv?.Mat) done(self.cv); }, 25); if (self.cv?.then) self.cv.then(done, error => finish({ error: { code: 'RUNTIME_MISSING', message: error.message } })); else if (self.cv?.Mat) done(self.cv); } catch (error) { finish({ error: { code: 'RUNTIME_MISSING', message: error.message } }); }
};
