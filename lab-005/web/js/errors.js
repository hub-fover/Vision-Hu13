export const ERROR_CODES = Object.freeze([
  'INVALID_FRAME_COUNT', 'UNSUPPORTED_FORMAT', 'DECODE_FAILED', 'CAMERA_MOVED', 'SCENE_CHANGED',
  'FOCUS_SPREAD_TOO_SMALL', 'LOW_TEXTURE', 'LOW_PEAK_PROMINENCE', 'ALIGNMENT_FAILED',
  'CALIBRATION_FAILED', 'DEPTH_SCALE_UNCALIBRATED', 'INTRINSICS_MISMATCH', 'MEMORY_BUDGET_EXCEEDED',
  'RUNTIME_MISSING', 'CANCELLED'
]);

const messages = {
  INVALID_FRAME_COUNT: '需要恰好五张照片。', UNSUPPORTED_FORMAT: '只支持 JPEG、PNG 或 WebP。', DECODE_FAILED: '照片无法解码，请换一张原图。',
  CAMERA_MOVED: '相机移动太多，五张照片没有对齐。', SCENE_CHANGED: '场景在拍摄期间发生变化。', FOCUS_SPREAD_TOO_SMALL: '五张照片的焦点跨度太小，请拉开近焦和远焦。',
  LOW_TEXTURE: '画面纹理太少，无法可靠判断清晰度。', LOW_PEAK_PROMINENCE: '清晰度峰值不明显，该区域会标为无效。', ALIGNMENT_FAILED: '照片对齐失败，请保持相机不动。',
  CALIBRATION_FAILED: '标定视角不足或棋盘格未检测到。', DEPTH_SCALE_UNCALIBRATED: '尚未完成三距离尺度标定，当前只显示相对深度。', INTRINSICS_MISMATCH: '标定文件与当前镜头或分辨率不匹配。',
  MEMORY_BUDGET_EXCEEDED: '输入太大，请降低照片分辨率后重试。', RUNTIME_MISSING: '处理运行时未就绪，请刷新页面后重试。', CANCELLED: '处理已取消。'
};
export function messageFor(code) { return messages[code] || `处理失败（${code}）。`; }
export function makeError(code, detail = '') { const error = new Error(messageFor(code)); error.code = code; error.detail = detail; return error; }
