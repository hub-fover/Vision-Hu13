export const MODEL_ID = 'onnx-community/depth-anything-v2-small';
export const MODEL_REVISION = '4472b7362082ad9968fee890ca0f1e5aca36b93d';
export const MODEL_NAME = 'Depth Anything V2 Small';

export function createInferencePlan({ hasWebGpu = false } = {}) {
  const wasm = { backend: 'wasm', device: 'wasm', dtype: 'q4' };
  return hasWebGpu
    ? [{ backend: 'webgpu', device: 'webgpu', dtype: 'q4' }, wasm]
    : [wasm];
}

export function configureTransformers(env, runtimeBase) {
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = runtimeBase;
  return env;
}
