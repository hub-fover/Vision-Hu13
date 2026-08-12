export const CORNER_ORDER = ['TL','TR','BR','BL'];
export const CONTRACTS = Object.freeze({
  schemaVersion:'lab004.contracts.v1', cornerOrder:CORNER_ORDER, lengthUnit:'metre',
  pixelFrame:'exif-corrected-analysis-image', analysisMaxSide:1280, maxWorkingSetMiB:320,
  stableMaxNormalizedRms:0.0015, referenceOnlyMaxNormalizedRms:0.0035,
  calibrationSchema:'lab004.camera-intrinsics.v1',
  trackingDefaults:{targetAnalysisFps:12,maxTrackedFeatures:300,minTrackedFeatures:12,minHomographyInlierRatio:.6,maxMedianForwardBackwardErrorPx:1.5,maxConsecutiveBadFrames:3}
});
export const ERROR_MESSAGES = Object.freeze({
 INVALID_DIMENSIONS:'尺寸必须是正数。', INVALID_QUAD:'四角点顺序或形状无效。', TARGET_TOO_SMALL:'目标区域过小。', TARGET_CLIPPED:'目标触碰了图像边界。', LOW_CONTRAST:'目标对比度不足。', LOW_TEXTURE:'目标纹理不足。', INSUFFICIENT_VIEW_DIVERSITY:'视角覆盖或倾斜多样性不足。', CALIBRATION_FAILED:'相机标定失败。', INVALID_CALIBRATION_FILE:'标定文件格式无效。', INTRINSICS_MISMATCH:'内参与当前图像不匹配。', POSE_FAILED:'无法求得有效姿态。', POSE_AMBIGUOUS:'存在多个同样可信的姿态。', HIGH_REPROJECTION_ERROR:'重投影误差过高。', TRACKING_LOST:'跟踪已丢失，请重新初始化。', CAMERA_CHANGED:'活动相机已改变。', PERMISSION_DENIED:'相机权限被拒绝，请在浏览器设置中允许。', UNSUPPORTED_CAMERA:'当前设备不支持相机或图像格式。', CANCELLED:'操作已取消。', BUILD_PREREQUISITE:'本地 OpenCV 运行时尚未构建。请运行 npm run build:opencv，或在 CI 中下载 vendor/opencv.js。'
});
export function cameraPoseError(code, message=ERROR_MESSAGES[code] || code){ const e=new Error(message); e.code=code; return e; }
export function buildObjectPoints(widthM,heightM){ if(!Number.isFinite(widthM)||!Number.isFinite(heightM)||widthM<=0||heightM<=0) throw cameraPoseError('INVALID_DIMENSIONS'); const w=widthM/2,h=heightM/2; return [[-w,h,0],[w,h,0],[w,-h,0],[-w,-h,0]]; }
export function estimateUncalibratedIntrinsics(width,height,{focalLengthPx,exifOrientation}={}){ if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0) throw cameraPoseError('INVALID_DIMENSIONS'); const f=Number.isFinite(focalLengthPx)&&focalLengthPx>0?focalLengthPx:Math.max(width,height); return {cameraMatrix:[[f,0,width/2],[0,f,height/2],[0,0,1]],distortion:[0,0,0,0,0],imageSizePx:[width,height],source:'estimated',estimationMethod:focalLengthPx?'exif-focal-length':'max-dimension-fallback',exifOrientation:exifOrientation ?? null}; }
export function qualityFromNormalizedRms(rms){ if(Number.isFinite(rms)&&rms<=CONTRACTS.stableMaxNormalizedRms)return 'stable'; if(Number.isFinite(rms)&&rms<=CONTRACTS.referenceOnlyMaxNormalizedRms)return 'reference-only'; return 'unstable'; }
