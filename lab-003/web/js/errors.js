import { ERROR_CODES } from "./contracts.js";

export class FusionError extends Error {
  constructor(code, message, details = {}) {
    if (!ERROR_CODES.includes(code)) throw new TypeError(`Unknown LAB 003 error: ${code}`);
    super(message);
    this.name = "FusionError";
    this.code = code;
    this.details = details;
  }
}

export const ERROR_MESSAGES = Object.freeze({
  INVALID_IMAGE_COUNT: "请选择正好三张照片。",
  UNSUPPORTED_FORMAT: "图片无法读取，请使用 JPEG、PNG 或 WebP。",
  DECODE_FAILED: "图片解码失败，请重新拍摄或从相册选择。",
  EXPOSURE_SPREAD_TOO_SMALL: "三张照片亮度太接近，请补拍更暗和更亮的画面。",
  SCENE_MISMATCH: "三张照片的构图差异过大，请保持手机位置不变后重拍。",
  LOW_TEXTURE: "画面细节不足，程序无法稳定对齐。",
  ALIGNMENT_FAILED: "轻微手抖没有成功对齐，请重新拍摄这组三张照片。",
  EXCESSIVE_CROP: "对齐后需要裁掉太多画面，请保持构图一致。",
  OUTPUT_TOO_LARGE: "图片尺寸超出手机处理预算，请降低分辨率后重试。",
  CANCELLED: "已取消曝光融合。",
});

export function serializeError(error) {
  return { code: error.code ?? "DECODE_FAILED", message: error.message, details: error.details ?? {} };
}

export function deserializeError(value) {
  return new FusionError(value?.code ?? "DECODE_FAILED", value?.message ?? ERROR_MESSAGES.DECODE_FAILED, value?.details);
}

export function messageForError(error) {
  return ERROR_MESSAGES[error?.code] ?? ERROR_MESSAGES.DECODE_FAILED;
}
