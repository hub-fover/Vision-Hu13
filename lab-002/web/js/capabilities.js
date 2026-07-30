export function supportsImageBitmap(scope = globalThis) {
  return typeof scope?.createImageBitmap === "function";
}

export function compatibilityMessage(scope = globalThis) {
  if (supportsImageBitmap(scope)) return "";
  return "当前浏览器无法读取照片。iPhone 或 iPad 请更新 iOS 并使用 Safari；Android 请更新 Chrome，或换一台受支持的设备。";
}

export async function decodeImageBitmap(file, scope = globalThis) {
  if (!supportsImageBitmap(scope)) {
    throw new TypeError("createImageBitmap is unavailable");
  }
  try {
    return await scope.createImageBitmap(file, {
      imageOrientation: "from-image",
    });
  } catch (optionsError) {
    try {
      return await scope.createImageBitmap(file);
    } catch (decodeError) {
      decodeError.cause ??= optionsError;
      throw decodeError;
    }
  }
}

export function canShareFiles(navigatorLike, file) {
  if (
    typeof navigatorLike?.share !== "function" ||
    typeof navigatorLike?.canShare !== "function"
  ) {
    return false;
  }
  try {
    return navigatorLike.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function shareFallbackMessage() {
  return "当前浏览器不能直接分享图片。结果仍保留在上方：可长按上方结果图保存，或点“下载 JPEG”。";
}
