const DEFAULT_OPTIONS = Object.freeze({
  blendMode: "multiply",
  opacity: 0.78,
  blurPx: 0.7,
  brightnessMatch: true,
  tintStrength: 0.18,
  textureStrength: 0.35,
  saturation: 1,
  shadow: Object.freeze({
    enabled: false, offsetX: 0, offsetY: 0, blur: 0, opacity: 0,
  }),
  fitMode: "fill",
});

function cloneOptions(options) {
  return { ...options, shadow: { ...(options.shadow || DEFAULT_OPTIONS.shadow) } };
}

function invalidateRender(state, changes = {}) {
  return {
    ...state,
    ...changes,
    rendered: null,
    renderVersion: state.renderVersion + 1,
  };
}

export function createEditorState() {
  return {
    points: [],
    currentError: null,
    lastValidPreview: null,
    preset: "wall",
    options: cloneOptions(DEFAULT_OPTIONS),
    assetType: "text",
    asset: null,
    background: null,
    compare: 1,
    rendered: null,
    renderVersion: 0,
    selectedPoint: null,
  };
}

export function addPoint(state, point) {
  if (state.points.length >= 4) return state;
  return invalidateRender(state, {
    points: [...state.points, [...point]],
    currentError: null,
    selectedPoint: state.points.length,
  });
}

export function movePoint(state, index, point) {
  if (index < 0 || index >= state.points.length) return state;
  const points = state.points.map((current, item) => item === index ? [...point] : current);
  return invalidateRender(state, { points });
}

export function setGeometryError(state, code) {
  return { ...state, currentError: code || null };
}

export function markPreviewValid(state, preview) {
  return { ...state, currentError: null, lastValidPreview: preview };
}

export function setBackground(state, background) {
  return invalidateRender(state, { background });
}

export function setAsset(state, asset) {
  return invalidateRender(state, {
    asset,
    assetType: asset?.kind || state.assetType,
  });
}

export function applyPreset(state, name, options) {
  return invalidateRender(state, { preset: name, options: cloneOptions(options) });
}

export function updateOption(state, path, value) {
  const [group, key] = path.split(".");
  const options = cloneOptions(state.options);
  if (key) options[group] = { ...(options[group] || {}), [key]: value };
  else options[group] = value;
  return invalidateRender(state, { options });
}

export function setCompare(state, value) {
  return { ...state, compare: Math.max(0, Math.min(1, Number(value) || 0)) };
}

export function selectPoint(state, index) {
  const selectedPoint = Number.isInteger(index) && index >= 0 && index < state.points.length
    ? index : null;
  return { ...state, selectedPoint };
}

export function nudgeSelectedPoint(state, deltaX, deltaY, width, height) {
  if (state.selectedPoint === null) return state;
  const point = state.points[state.selectedPoint];
  return movePoint(state, state.selectedPoint, [
    Math.max(0, Math.min(width, point[0] + deltaX)),
    Math.max(0, Math.min(height, point[1] + deltaY)),
  ]);
}

export function addDefaultCorner(state, width, height) {
  if (state.points.length >= 4) return state;
  const defaults = [
    [0.15 * width, 0.15 * height],
    [0.85 * width, 0.15 * height],
    [0.85 * width, 0.85 * height],
    [0.15 * width, 0.85 * height],
  ];
  return addPoint(state, defaults[state.points.length].map(Math.round));
}

export function removeSelectedPoint(state) {
  if (state.selectedPoint === null) return state;
  const points = state.points.filter((_, index) => index !== state.selectedPoint);
  return invalidateRender(state, {
    points,
    selectedPoint: points.length ? Math.min(state.selectedPoint, points.length - 1) : null,
    currentError: null,
    lastValidPreview: null,
  });
}

export function setRendered(state, rendered) {
  return { ...state, rendered };
}

export function beginRender(state) {
  const pending = invalidateRender(state);
  return { state: pending, version: pending.renderVersion };
}

export function acceptRendered(state, version, rendered) {
  if (version !== state.renderVersion) return state;
  return { ...state, rendered };
}

export function canExport(state) {
  return Boolean(
    state.background && state.asset && state.points.length === 4 &&
    !state.currentError && state.lastValidPreview,
  );
}

export function resetEditor(state) {
  return invalidateRender(state, {
    points: [],
    currentError: null,
    lastValidPreview: null,
    compare: 1,
    selectedPoint: null,
  });
}
