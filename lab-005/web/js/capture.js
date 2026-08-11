import { makeError } from './errors.js';
import { setFrame } from './state.js';

export const FOCUS_LABELS = ['近焦', '近中焦', '中焦', '远中焦', '远焦'];
export async function decodeFile(file, maxSide = 1280) {
  if (!file?.type?.startsWith('image/')) throw makeError('UNSUPPORTED_FORMAT');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch (error) {
    const url = URL.createObjectURL(file); const image = new Image(); image.src = url; await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    const fallback = document.createElement('canvas'); fallback.width = image.naturalWidth; fallback.height = image.naturalHeight; fallback.getContext('2d').drawImage(image, 0, 0); URL.revokeObjectURL(url); bitmap = await createImageBitmap(fallback);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return { bitmap, width: bitmap.width, height: bitmap.height };
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return { bitmap: await createImageBitmap(canvas), width: canvas.width, height: canvas.height };
}
export async function addFileToSlot(state, index, file) { const decoded = await decodeFile(file); const url = URL.createObjectURL(file); return setFrame(state, index, file, decoded.bitmap, url); }
export async function loadSampleManifest(base = '../assets/samples/manifest.json') { const response = await fetch(base); if (!response.ok) throw makeError('DECODE_FAILED'); return response.json(); }
export async function requestCamera() { if (!navigator.mediaDevices?.getUserMedia) throw makeError('RUNTIME_MISSING', 'camera unavailable'); return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
export async function getFocusCapabilities(track) {
  const capabilities = track?.getCapabilities?.() || {};
  const focusDistance = capabilities.focusDistance;
  return { supported: Boolean(focusDistance), min: focusDistance?.min ?? null, max: focusDistance?.max ?? null, step: focusDistance?.step ?? null };
}
export async function setFocusDistance(track, value) {
  const capabilities = await getFocusCapabilities(track);
  if (!capabilities.supported || typeof track.applyConstraints !== 'function') return false;
  await track.applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: Number(value) }] });
  return true;
}
