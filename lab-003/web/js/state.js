export function createState() {
  return {
    files: [null, null, null],
    phase: "empty",
    progress: 0,
    stage: "",
    error: null,
    result: null,
    view: "fusion",
  };
}

export function replaceFiles(state, files) {
  const slots = [files[0] ?? null, files[1] ?? null, files[2] ?? null];
  return {
    ...state,
    files: slots,
    phase: slots.every(Boolean) ? "ready" : "selecting",
    error: null,
    result: null,
  };
}

export function setFileAt(state, index, file) {
  const files = [...state.files];
  files[index] = file;
  return replaceFiles(state, files);
}

export function setProgress(state, stage, progress) {
  return { ...state, phase: "processing", stage, progress };
}
