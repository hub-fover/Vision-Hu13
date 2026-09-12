export const MODEL_ID = 'onnx-community/depth-anything-v2-small';
export const MODEL_REVISION = '4472b7362082ad9968fee890ca0f1e5aca36b93d';
export const MODEL_NAME = 'Depth Anything V2 Small';

export function createInferencePlan({ hasWebGpu = false, forceBackend } = {}) {
  const wasm = { backend: 'wasm', device: 'wasm', dtype: 'q4' };
  if (forceBackend === 'wasm') return [wasm];
  return hasWebGpu
    ? [{ backend: 'webgpu', device: 'webgpu', dtype: 'q4' }, wasm]
    : [wasm];
}

export async function hasUsableWebGpu(navigatorObject = globalThis.navigator) {
  if (typeof navigatorObject?.gpu?.requestAdapter !== 'function') return false;
  try {
    return Boolean(await navigatorObject.gpu.requestAdapter());
  } catch {
    return false;
  }
}

export function configureTransformers(env, runtimeBase) {
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = runtimeBase;
  return env;
}
