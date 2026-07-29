import { ERROR_CODES } from "./contracts.js";

export class StitchError extends Error {
  constructor(code, message, {
    pairIndex = null,
    pairNames = null,
    cause,
  } = {}) {
    if (!ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown panorama error code: ${code}`);
    }
    super(message, cause ? { cause } : undefined);
    this.name = "StitchError";
    this.code = code;
    this.pairIndex = pairIndex;
    this.pairNames = pairNames ? [...pairNames] : null;
  }
}

const messages = {
  NOT_ENOUGH_IMAGES: "请至少选择两张有共同画面的照片。",
  UNSUPPORTED_FORMAT: "仅支持 JPEG、PNG 和 WebP 照片。",
  DECODE_FAILED: "照片无法读取，请换一张原始文件后重试。",
  LOW_TEXTURE: "画面细节太少，换用包含纹理或明显边缘的照片。",
  INSUFFICIENT_OVERLAP: "重叠不足。请多保留一些共同画面后重拍。",
  AMBIGUOUS_MATCHES: "重复纹理太多，无法确认对应位置；请减少重复图案。",
  HOMOGRAPHY_UNSTABLE: "透视关系不稳定，请保持机位并增加相邻重叠。",
  HIGH_REPROJECTION_ERROR: "对齐误差过大，请绕同一机位缓慢转动拍摄。",
  OUTPUT_TOO_LARGE: "预计内存超过 384MiB，请减少照片或先缩小尺寸。",
  CANCELLED: "已取消拼接。",
};

export function pairErrorMessage(error) {
  const guidance = messages[error?.code] ?? "拼接失败，请检查照片顺序后重试。";
  if (
    Number.isInteger(error?.pairIndex) &&
    Array.isArray(error?.pairNames) &&
    error.pairNames.length === 2
  ) {
    return `第 ${error.pairIndex + 1} 组（${error.pairNames[0]} → ${error.pairNames[1]}）${guidance}`;
  }
  return guidance;
}

export function serializeError(error) {
  return {
    code: error?.code ?? "DECODE_FAILED",
    message: error?.message ?? String(error),
    pairIndex: error?.pairIndex ?? null,
    pairNames: error?.pairNames ?? null,
  };
}

export function deserializeError(value) {
  return new StitchError(
    ERROR_CODES.includes(value?.code) ? value.code : "DECODE_FAILED",
    value?.message ?? "Unknown Worker failure",
    {
      pairIndex: value?.pairIndex ?? null,
      pairNames: value?.pairNames ?? null,
    },
  );
}
