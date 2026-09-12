import { extractDepthTensor } from './worker-core.js';

export function createWorkerController({
  load,
  post,
  createSourceUrl = URL.createObjectURL,
  revokeSourceUrl = URL.revokeObjectURL,
  modelName,
  revision,
}) {
  let pipelinePromise = null;

  function getPipeline(requestId) {
    if (!pipelinePromise) {
      pipelinePromise = load(progress => post({ type: 'progress', requestId, progress }))
        .catch(error => {
          pipelinePromise = null;
          throw error;
        });
    }
    return pipelinePromise;
  }

  async function handle(message) {
    if (message?.type !== 'infer') return;
    const requestId = message.requestId;
    if (!(message.blob instanceof Blob)) {
      post({ type: 'error', requestId, message: '推理请求缺少图片数据' });
      return;
    }

    let sourceUrl = null;
    try {
      post({ type: 'progress', requestId, progress: { status: 'preparing', progress: 2 } });
      const loaded = await getPipeline(requestId);
      post({ type: 'progress', requestId, progress: { status: 'inferencing', progress: 96, backend: loaded.backend } });
      sourceUrl = createSourceUrl(message.blob);
      const output = await loaded.pipeline(sourceUrl);
      const { width, height, depth } = extractDepthTensor(output);
      post({
        type: 'result',
        requestId,
        width,
        height,
        depth: depth.buffer,
        model: modelName,
        revision,
        backend: loaded.backend,
      }, [depth.buffer]);
    } catch (error) {
      post({ type: 'error', requestId, message: error?.message || String(error) });
    } finally {
      if (sourceUrl) revokeSourceUrl(sourceUrl);
    }
  }

  return { handle };
}
