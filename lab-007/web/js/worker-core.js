import { normalizeDepth } from './depth-utils.js';

export function extractDepthTensor(result) {
  const tensor = result?.predicted_depth;
  if (!tensor?.data || !Array.isArray(tensor.dims)) {
    throw new Error('模型没有返回可读取的深度矩阵');
  }
  if (tensor.dims.length < 2) throw new Error('模型返回的深度尺寸无效');
  const height = Number(tensor.dims.at(-2));
  const width = Number(tensor.dims.at(-1));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || tensor.data.length !== width * height) {
    throw new Error('模型返回的深度尺寸无效');
  }
  return { width, height, depth: normalizeDepth(tensor.data) };
}

export async function loadPipelineWithFallback({ plan, createPipeline, modelId, revision, onProgress }) {
  const failures = [];
  for (const option of plan) {
    try {
      const pipeline = await createPipeline('depth-estimation', modelId, {
        device: option.device,
        dtype: option.dtype,
        revision,
        progress_callback: info => onProgress({ ...info, backend: option.backend }),
      });
      return { pipeline, backend: option.backend };
    } catch (error) {
      failures.push(`${option.backend}: ${error?.message || error}`);
    }
  }
  throw new Error(`无法初始化深度模型（${failures.join('; ')}）`);
}
