import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function workerLoadOpenCv(importedValue) {
  const source = await readFile(
    new URL("../../web/js/panorama.worker.js", import.meta.url),
    "utf8",
  );
  const context = vm.createContext({
    clearInterval,
    clearTimeout,
    console,
    setInterval,
    setTimeout,
  });
  context.self = context;
  context.importScripts = () => {
    context.cv = importedValue;
  };
  vm.runInContext(
    `${source}\nglobalThis.__loadOpenCv = loadOpenCv;`,
    context,
    { filename: "panorama.worker.js" },
  );
  return context.__loadOpenCv();
}

test("OpenCV readiness wraps a fulfilled thenable Module without resolving to it", async () => {
  const module = {
    Mat() {},
    then(onFulfilled) {
      onFulfilled(module);
      return module;
    },
  };
  const originalThen = module.then;

  const ready = await workerLoadOpenCv(module);

  assert.equal(ready.module, module);
  assert.equal(module.then, originalThen);
});

test("OpenCV readiness supplies ORB.create for the pinned constructor-only build", async () => {
  function ORB(maxFeatures) {
    this.maxFeatures = maxFeatures;
  }
  const module = {
    Mat() {},
    ORB,
    then(onFulfilled) {
      onFulfilled(module);
      return module;
    },
  };

  const ready = await workerLoadOpenCv(module);
  const orb = ready.module.ORB.create(750);

  assert.ok(orb instanceof ORB);
  assert.equal(orb.maxFeatures, 750);
});
