import { blendComposite } from "./blending.js";

self.onmessage = ({ data }) => {
  const { id, background, asset, quad, options } = data;
  try {
    const fullResolution = {
      data: background.data instanceof Uint8ClampedArray
        ? background.data : new Uint8ClampedArray(background.data),
      width: background.width,
      height: background.height,
    };
    const source = {
      data: asset.data instanceof Uint8ClampedArray
        ? asset.data : new Uint8ClampedArray(asset.data),
      width: asset.width,
      height: asset.height,
    };
    const result = blendComposite(fullResolution, source, quad, options);
    self.postMessage({ id, result }, [result.data.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
