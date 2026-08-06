import { cameraPoseError } from './contracts.js';
export function estimatePose(){ throw cameraPoseError('BUILD_PREREQUISITE','姿态估计必须由 OpenCV Worker 执行，当前运行时不可用。'); }
