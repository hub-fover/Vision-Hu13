import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const files = (names) => names.map((name) => ({
  name,
  mimeType: "image/png",
  buffer: png,
}));

async function installFakeWorker(page, scenario = "success") {
  await page.addInitScript(({ selectedScenario }) => {
    globalThis.__LAB002_WORKER_FACTORY__ = () => {
      const listeners = new Set();
      const send = (data) => listeners.forEach((listener) => listener({ data }));
      return {
        addEventListener(type, listener) {
          if (type === "message") listeners.add(listener);
        },
        removeEventListener(type, listener) {
          if (type === "message") listeners.delete(listener);
        },
        postMessage(message) {
          if (message.type === "cancel") {
            send({
              type: "error",
              jobId: message.jobId,
              error: { code: "CANCELLED", message: "cancelled" },
            });
            return;
          }
          send({ type: "progress", jobId: message.jobId, stage: "特征提取", progress: 0.25 });
          if (selectedScenario === "pending") return;
          queueMicrotask(async () => {
            if (selectedScenario === "failure") {
              send({
                type: "error",
                jobId: message.jobId,
                error: {
                  code: "INSUFFICIENT_OVERLAP",
                  pairIndex: 0,
                  pairNames: ["left.png", "right.png"],
                },
              });
              return;
            }
            const canvas = new OffscreenCanvas(1000, 400);
            const context = canvas.getContext("2d");
            context.fillStyle = "#546d2f";
            context.fillRect(0, 0, canvas.width, canvas.height);
            const jpeg = await canvas.convertToBlob({
              type: "image/jpeg",
              quality: 0.92,
            });
            const seam = await canvas.convertToBlob({ type: "image/png" });
            send({
              type: "result",
              jobId: message.jobId,
              result: {
                jpeg,
                seam,
                width: 1000,
                height: 400,
                crop: { x: 10, y: 10, width: 980, height: 380 },
                warnings: [],
              },
            });
          });
        },
        terminate() {},
      };
    };
  }, { selectedScenario: scenario });
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([size, typeBytes, data, checksum]);
}

function overlappingPng(name, offsetX, width = 360, height = 220) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const worldX = x + offsetX;
      let hash = Math.imul(worldX + 17, 374761393) ^
        Math.imul(y + 31, 668265263);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      const value = hash ^ (hash >>> 16);
      const pixel = row + 1 + x * 3;
      rows[pixel] = (value >>> 16) & 0xff;
      rows[pixel + 1] = (value >>> 8) & 0xff;
      rows[pixel + 2] = value & 0xff;
    }
  }
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(rows, { level: 9 })),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
  };
}

test("selection, camera append, accessible reorder, and pointer drag work", async ({ page }) => {
  await installFakeWorker(page);
  await page.goto("/");

  await page.locator("#gallery-input").setInputFiles(files(["left.png", "middle.png"]));
  await page.locator("#camera-input").setInputFiles(files(["right.png"]));
  await expect(page.locator("[data-image-id]")).toHaveCount(3);
  await expect(page.locator("[data-image-name]")).toHaveText([
    "left.png",
    "middle.png",
    "right.png",
  ]);

  await page.getByRole("button", { name: "middle.png 前移" }).click();
  await expect(page.locator("[data-image-name]")).toHaveText([
    "middle.png",
    "left.png",
    "right.png",
  ]);

  const source = page.locator("[data-image-id]").last();
  const target = page.locator("[data-image-id]").first();
  await source.dragTo(target);
  await expect(page.locator("[data-image-name]")).toHaveText([
    "right.png",
    "middle.png",
    "left.png",
  ]);
});

test("touch movement reorders through the element under the pointer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "touch is covered on Pixel 7");
  await installFakeWorker(page);
  await page.goto("/");
  await page.locator("#gallery-input").setInputFiles(files([
    "left.png",
    "middle.png",
    "right.png",
  ]));
  const source = page.locator("[data-image-id]").last();
  const target = page.locator("[data-image-id]").first();
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  const session = await page.context().newCDPSession(page);
  const point = (box) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(sourceBox)],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [point(targetBox)],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await expect(page.locator("[data-image-name]")).toHaveText([
    "right.png",
    "left.png",
    "middle.png",
  ]);
});

test("success exposes seam, inward crop, JPEG download, and save guidance", async ({ page }) => {
  await installFakeWorker(page);
  await page.goto("/");
  await page.locator("#gallery-input").setInputFiles(files(["left.png", "right.png"]));
  await page.getByRole("button", { name: "开始拼接" }).click();

  await expect(page.getByText("拼接完成")).toBeVisible();
  await page.getByLabel("显示接缝").check();
  await expect(page.locator("#seam-preview")).toBeVisible();

  await page.getByLabel("左侧内收").fill("20");
  await expect(page.locator("#crop-summary")).toContainText("左 20");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 JPEG" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/panorama.*\.jpg/);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    });
  });
  await page.getByRole("button", { name: "分享" }).click();
  await expect(page.locator("#share-status")).toContainText("长按上方结果图");
  await expect(page.locator("#result-preview")).toBeVisible();
});

test("active work can be cancelled with a clear terminal state", async ({ page }) => {
  await installFakeWorker(page, "pending");
  await page.goto("/");
  await page.locator("#gallery-input").setInputFiles(files(["left.png", "right.png"]));
  await page.getByRole("button", { name: "开始拼接" }).click();
  await expect(page.getByText("特征提取")).toBeVisible();
  await page.getByRole("button", { name: "取消拼接" }).click();
  await expect(page.getByText("已取消拼接。")).toBeVisible();
});

test("pair-specific failures are Chinese and name both files", async ({ page }) => {
  await installFakeWorker(page, "failure");
  await page.goto("/");
  await page.locator("#gallery-input").setInputFiles(files(["left.png", "right.png"]));
  await page.getByRole("button", { name: "开始拼接" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "第 1 组（left.png → right.png）重叠不足",
  );
});

test("selecting and stitching never sends image data off origin", async ({ page }) => {
  await installFakeWorker(page);
  const offOrigin = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    ) {
      offOrigin.push(request.url());
    }
  });
  await page.goto("/");
  await page.locator("#gallery-input").setInputFiles(files(["left.png", "right.png"]));
  await page.getByRole("button", { name: "开始拼接" }).click();
  await expect(page.getByText("拼接完成")).toBeVisible();
  expect(offOrigin).toEqual([]);
});

test("default committed mountain sample completes in the real Worker", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one real default-sample pass is sufficient");
  test.setTimeout(120_000);
  const offOrigin = [];
  const uploads = [];
  const mountainRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("/assets/samples/mountains/")) {
      mountainRequests.push(url.pathname);
    }
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    ) {
      offOrigin.push(request.url());
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      uploads.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.addInitScript(() => {
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class DiagnosticWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", ({ data }) => {
          if (data?.type === "error") {
            globalThis.__LAB002_LAST_WORKER_ERROR__ = data.error;
          }
          if (data?.type === "result") {
            globalThis.__LAB002_LAST_WORKER_RESULT__ = data.result;
          }
        });
      }
    };
  });
  await page.goto("/");
  await page.locator("#sample-button").click();
  await expect(page.locator("#sample-status")).toContainText(
    "已载入 3 张真实Camera Panning Over Mountains照片",
  );
  await expect(page.locator("#sample-status")).toContainText("Pexels License");
  await expect(page.locator("[data-image-name]")).toHaveText([
    "mountains-1.jpg",
    "mountains-2.jpg",
    "mountains-3.jpg",
  ]);
  expect(mountainRequests).toEqual([
    "/assets/samples/mountains/01.jpg",
    "/assets/samples/mountains/02.jpg",
    "/assets/samples/mountains/03.jpg",
  ]);

  await page.locator("#run-button").click();
  const terminal = await page.waitForFunction(() => {
    if (document.querySelector("#app-status")?.textContent === "拼接完成") {
      return { type: "result" };
    }
    if (globalThis.__LAB002_LAST_WORKER_ERROR__) {
      return {
        type: "error",
        error: globalThis.__LAB002_LAST_WORKER_ERROR__,
      };
    }
    return null;
  }, null, { timeout: 60_000 }).then((handle) => handle.jsonValue());
  expect(terminal).toEqual({ type: "result" });

  const preview = await page.evaluate(async () => {
    const blob = await fetch(document.querySelector("#result-preview").src)
      .then((response) => response.blob());
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let minimum = 255;
    let maximum = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      minimum = Math.min(minimum, pixels[index]);
      maximum = Math.max(maximum, pixels[index]);
    }
    const result = {
      size: blob.size,
      type: blob.type,
      width: bitmap.width,
      height: bitmap.height,
      range: maximum - minimum,
    };
    bitmap.close();
    return result;
  });
  expect(preview.type).toBe("image/jpeg");
  expect(preview.size).toBeGreaterThan(10_000);
  expect(preview.width).toBeGreaterThan(1600);
  expect(preview.height).toBeGreaterThan(500);
  expect(preview.range).toBeGreaterThan(40);

  const alignment = await page.evaluate(async () => {
    const result = globalThis.__LAB002_LAST_WORKER_RESULT__;
    const [jpegBitmap, seamBitmap] = await Promise.all([
      createImageBitmap(result.jpeg),
      createImageBitmap(result.seam),
    ]);
    const jpegCanvas = new OffscreenCanvas(jpegBitmap.width, jpegBitmap.height);
    const seamCanvas = new OffscreenCanvas(seamBitmap.width, seamBitmap.height);
    const jpegContext = jpegCanvas.getContext("2d");
    const seamContext = seamCanvas.getContext("2d");
    jpegContext.drawImage(jpegBitmap, 0, 0);
    seamContext.drawImage(seamBitmap, 0, 0);
    const jpegPixels = jpegContext.getImageData(
      0,
      0,
      jpegBitmap.width,
      jpegBitmap.height,
    ).data;
    const seamPixels = seamContext.getImageData(
      0,
      0,
      seamBitmap.width,
      seamBitmap.height,
    ).data;
    let samples = 0;
    let absoluteError = 0;
    for (let y = 0; y < jpegBitmap.height; y += 8) {
      for (let x = 0; x < jpegBitmap.width; x += 8) {
        const jpegOffset = (y * jpegBitmap.width + x) * 4;
        const seamOffset = (
          (y + result.crop.y) * seamBitmap.width +
          x + result.crop.x
        ) * 4;
        const seamRed = seamPixels[seamOffset];
        const seamGreen = seamPixels[seamOffset + 1];
        const seamBlue = seamPixels[seamOffset + 2];
        const looksLikeOverlay =
          seamRed - seamGreen > 45 &&
          seamBlue - seamGreen > 20;
        if (looksLikeOverlay) continue;
        for (let channel = 0; channel < 3; channel += 1) {
          absoluteError += Math.abs(
            jpegPixels[jpegOffset + channel] -
            seamPixels[seamOffset + channel],
          );
        }
        samples += 1;
      }
    }
    jpegBitmap.close();
    seamBitmap.close();
    return {
      samples,
      meanAbsoluteError: absoluteError / Math.max(1, samples * 3),
    };
  });
  expect(alignment.samples).toBeGreaterThan(1_000);
  expect(alignment.meanAbsoluteError).toBeLessThan(12);

  await page.locator("#crop-left").fill("8");
  await page.locator("#crop-right").fill("4");
  await page.locator("#crop-top").fill("3");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-button").click();
  const bytes = await readFile(await (await downloadPromise).path());
  expect(bytes.length).toBeGreaterThan(10_000);
  expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
  const cropped = await page.evaluate(async (values) => {
    const bitmap = await createImageBitmap(new Blob(
      [new Uint8Array(values)],
      { type: "image/jpeg" },
    ));
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, [...bytes]);
  expect(cropped.width).toBe(preview.width - 12);
  expect(cropped.height).toBe(preview.height - 3);
  const downloadedAlignment = await page.evaluate(async (values) => {
    const result = globalThis.__LAB002_LAST_WORKER_RESULT__;
    const [downloadedBitmap, seamBitmap] = await Promise.all([
      createImageBitmap(new Blob(
        [new Uint8Array(values)],
        { type: "image/jpeg" },
      )),
      createImageBitmap(result.seam),
    ]);
    const downloadedCanvas = new OffscreenCanvas(
      downloadedBitmap.width,
      downloadedBitmap.height,
    );
    const seamCanvas = new OffscreenCanvas(seamBitmap.width, seamBitmap.height);
    const downloadedContext = downloadedCanvas.getContext("2d");
    const seamContext = seamCanvas.getContext("2d");
    downloadedContext.drawImage(downloadedBitmap, 0, 0);
    seamContext.drawImage(seamBitmap, 0, 0);
    const downloadedPixels = downloadedContext.getImageData(
      0,
      0,
      downloadedBitmap.width,
      downloadedBitmap.height,
    ).data;
    const seamPixels = seamContext.getImageData(
      0,
      0,
      seamBitmap.width,
      seamBitmap.height,
    ).data;
    let samples = 0;
    let absoluteError = 0;
    for (let y = 0; y < downloadedBitmap.height; y += 8) {
      for (let x = 0; x < downloadedBitmap.width; x += 8) {
        const downloadedOffset =
          (y * downloadedBitmap.width + x) * 4;
        const seamOffset = (
          (y + result.crop.y + 3) * seamBitmap.width +
          x + result.crop.x + 8
        ) * 4;
        const seamRed = seamPixels[seamOffset];
        const seamGreen = seamPixels[seamOffset + 1];
        const seamBlue = seamPixels[seamOffset + 2];
        const looksLikeOverlay =
          seamRed - seamGreen > 45 &&
          seamBlue - seamGreen > 20;
        if (looksLikeOverlay) continue;
        for (let channel = 0; channel < 3; channel += 1) {
          absoluteError += Math.abs(
            downloadedPixels[downloadedOffset + channel] -
            seamPixels[seamOffset + channel],
          );
        }
        samples += 1;
      }
    }
    downloadedBitmap.close();
    seamBitmap.close();
    return {
      samples,
      meanAbsoluteError: absoluteError / Math.max(1, samples * 3),
    };
  }, [...bytes]);
  expect(downloadedAlignment.samples).toBeGreaterThan(1_000);
  expect(downloadedAlignment.meanAbsoluteError).toBeLessThan(12);
  expect(offOrigin).toEqual([]);
  expect(uploads).toEqual([]);
});

test("real Worker and OpenCV export a cropped JPEG with decoded pixels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one real runtime pass is sufficient");
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class DiagnosticWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", ({ data }) => {
          if (data?.type === "error") {
            globalThis.__LAB002_LAST_WORKER_ERROR__ = data.error;
          }
        });
      }
    };
  });
  await page.goto("/");
  await page.locator("#gallery-input").setInputFiles([
    overlappingPng("left.png", 0),
    overlappingPng("right.png", 180),
  ]);
  await page.getByRole("button", { name: "开始拼接" }).click();
  const terminal = await page.waitForFunction(() => {
    if (document.querySelector("#app-status")?.textContent === "拼接完成") {
      return { type: "result" };
    }
    if (globalThis.__LAB002_LAST_WORKER_ERROR__) {
      return {
        type: "error",
        error: globalThis.__LAB002_LAST_WORKER_ERROR__,
      };
    }
    return null;
  }, null, { timeout: 60_000 }).then((handle) => handle.jsonValue());
  expect(terminal).toEqual({ type: "result" });

  const preview = await page.evaluate(async () => {
    const blob = await fetch(document.querySelector("#result-preview").src)
      .then((response) => response.blob());
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let minimum = 255;
    let maximum = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      minimum = Math.min(minimum, pixels[index]);
      maximum = Math.max(maximum, pixels[index]);
    }
    const result = {
      type: blob.type,
      width: bitmap.width,
      height: bitmap.height,
      range: maximum - minimum,
    };
    bitmap.close();
    return result;
  });
  expect(preview.type).toBe("image/jpeg");
  expect(preview.width).toBeGreaterThan(500);
  expect(preview.height).toBeGreaterThan(200);
  expect(preview.range).toBeGreaterThan(40);

  await page.getByLabel("左侧内收").fill("8");
  await page.getByLabel("右侧内收").fill("4");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 JPEG" }).click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
  const exported = await page.evaluate(async (values) => {
    const bitmap = await createImageBitmap(new Blob(
      [new Uint8Array(values)],
      { type: "image/jpeg" },
    ));
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, [...bytes]);
  expect(exported.width).toBe(preview.width - 12);
  expect(exported.height).toBe(preview.height);
});
