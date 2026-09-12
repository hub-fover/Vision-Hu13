import { env, pipeline } from '../vendor/transformers.web.min.js';
import { configureTransformers, createInferencePlan, MODEL_ID, MODEL_NAME, MODEL_REVISION } from './model-config.js';
import { createWorkerController } from './worker-controller.js';
import { loadPipelineWithFallback } from './worker-core.js';

configureTransformers(env, new URL('../vendor/', import.meta.url).href);

const controller = createWorkerController({
  load: onProgress => loadPipelineWithFallback({
    plan: createInferencePlan({ hasWebGpu: Boolean(globalThis.navigator?.gpu) }),
    createPipeline: pipeline,
    modelId: MODEL_ID,
    revision: MODEL_REVISION,
    onProgress,
  }),
  post: (message, transfer) => globalThis.postMessage(message, transfer || []),
  modelName: MODEL_NAME,
  revision: MODEL_REVISION,
});

globalThis.addEventListener('message', event => controller.handle(event.data));
