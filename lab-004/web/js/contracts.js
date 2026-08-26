export const CONTRACTS = Object.freeze({
  schemaVersion: 'lab004.static-scene-speed.v2', analysisMaxSide: 1280,
  targetAnalysisFps: 30, maxWorkingSetMiB: 320, defaultMethod: 'flow',
  minScaleLengthPx: 40, maxCameraDriftPx: 1.5, maxForwardBackwardErrorPx: 1.5,
  minTrackedPoints: 12, minInlierRatio: 0.6,
  quality: { stableConfidence: 0.8, referenceConfidence: 0.5 }, lengthUnit: 'metre',
});
export const ERROR_MESSAGES = Object.freeze({
  INVALID_FRAME: '帧尺寸无效。请重新选择视频或启动相机。',
  UNSUPPORTED_FORMAT: '只支持 MP4、WebM 视频或浏览器支持的相机。',
  DECODE_FAILED: '无法读取这个视频，请换一个文件再试。',
  INVALID_SCALE: '请在同一平面点击两个点，并输入大于 0 的实测距离（至少 40 像素）。',
  TARGET_TOO_SMALL: '静止物区域太小或超出画面，请框选更大的纹理区域。',
  LOW_TEXTURE: '这里纹理太少，换到地砖、砖墙、门框或路面标线。',
  LOW_CONTRAST: '画面对比度不足，请避开白墙、过曝和反光。',
  SCENE_CHANGED: '画面不是单一刚体，避开行人、车辆和会摆动的树叶。',
  CAMERA_ROTATION_TOO_LARGE: '手机转动太快，请沿一个方向平移，不要急转或变焦。',
  FLOW_LOST: '特征点跟丢了，请重新框选纹理并保持目标在画面内。',
  BACKGROUND_UNTRACKABLE: '静止背景无法跟踪，请选择更多纹理。',
  FPS_UNSTABLE: '视频时间戳不稳定，无法可靠计算速度。',
  RUNTIME_MISSING: '本地视觉运行时不可用，请刷新页面或改用视频导入。',
  PERMISSION_DENIED: '摄像头权限被拒绝。你仍可导入一段 MP4/WebM。', CANCELLED: '测量已取消。',
});
export function metresPerPixel(p1, p2, realDistance, unit = 'mm') {
  const factors = { mm: 1e-3, cm: 1e-2, m: 1 };
  const pixels = Math.hypot(Number(p2?.[0]) - Number(p1?.[0]), Number(p2?.[1]) - Number(p1?.[1]));
  const amount = Number(realDistance);
  if (!factors[unit] || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(pixels) || pixels < CONTRACTS.minScaleLengthPx) throw Object.assign(new Error(ERROR_MESSAGES.INVALID_SCALE), { code: 'INVALID_SCALE' });
  return amount * factors[unit] / pixels;
}
export function validateTarget(target, width, height) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || target.width < 32 || target.height < 32 || target.x < 0 || target.y < 0 || target.x + target.width > width || target.y + target.height > height) throw Object.assign(new Error(ERROR_MESSAGES.TARGET_TOO_SMALL), { code: 'TARGET_TOO_SMALL' });
  return target;
}
