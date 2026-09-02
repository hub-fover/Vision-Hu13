const pending = [];
let openCvPromise;

self.loadLab005OpenCv = function loadLab005OpenCv(runtimeUrl = '../vendor/opencv.js') {
  if (self.cv?.Mat) return Promise.resolve(self.cv);
  if (openCvPromise) return openCvPromise;
  openCvPromise = new Promise((resolve, reject) => {
    let poll; let settled = false;
    const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timeout); clearInterval(poll); callback(value); };
    // Emscripten exposes `cv` as a thenable during startup. Never resolve
    // with that thenable itself or Promise assimilation waits forever.
    const ready = value => { const runtime = value || self.cv; if (runtime && typeof runtime.then === 'function') { if (!runtime.Mat) return; const stable = Object.create(runtime); Object.defineProperty(stable, 'then', { value: undefined, configurable: true }); finish(resolve, stable); return; } if (runtime?.Mat) finish(resolve, runtime); };
    const timeout = setTimeout(() => finish(reject, Object.assign(new Error('OpenCV.js initialization timed out'), { code: 'RUNTIME_MISSING' })), 9_000);
    self.Module = { onRuntimeInitialized() { ready(self.cv); } };
    try {
      importScripts(runtimeUrl);
      poll = setInterval(() => ready(self.cv), 25);
      if (self.cv?.then) self.cv.then(ready, error => finish(reject, error)); else if (self.cv) { self.cv.onRuntimeInitialized = () => ready(self.cv); ready(self.cv); }
    } catch (error) { finish(reject, Object.assign(error, { code: 'RUNTIME_MISSING' })); }
  });
  return openCvPromise;
};

self.onmessage = event => pending.push(event);
import('./defocus.worker.js').then(() => { const moduleHandler = self.onmessage; self.onmessage = event => moduleHandler(event); pending.splice(0).forEach(event => moduleHandler(event)); }).catch(error => self.postMessage({ id: null, error: { code: 'RUNTIME_MISSING', message: error.message } }));
