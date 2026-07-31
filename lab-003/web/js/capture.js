import { FusionError } from "./errors.js";

export const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateFiles(files) {
  if (files.length !== 3) throw new FusionError("INVALID_IMAGE_COUNT", "Choose exactly three images.");
  for (const file of files) {
    const extensionSupported = /\.(?:jpe?g|png|webp)$/i.test(file.name ?? "");
    if ((file.type && !SUPPORTED_TYPES.has(file.type)) || (!file.type && !extensionSupported)) {
      throw new FusionError("UNSUPPORTED_FORMAT", `${file.name} is not a supported image.`);
    }
  }
  return files;
}

export async function filesFromSample(manifestUrl = "./assets/samples/manifest.json") {
  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) throw new FusionError("DECODE_FAILED", "The installed sample is unavailable.");
  const manifest = await manifestResponse.json();
  const files = await Promise.all(manifest.files.map(async (path, index) => {
    const response = await fetch(new URL(path, manifestResponse.url));
    if (!response.ok) throw new FusionError("DECODE_FAILED", `Sample frame ${index + 1} is unavailable.`);
    return new File([await response.blob()], path.split("/").at(-1), { type: "image/jpeg" });
  }));
  return validateFiles(files);
}
