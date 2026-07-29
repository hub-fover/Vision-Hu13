import { expect, test } from "@playwright/test";

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
          queueMicrotask(() => {
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
            const jpeg = new Blob(["jpeg-result"], { type: "image/jpeg" });
            const seam = new Blob(["seam-overlay"], { type: "image/png" });
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

test("success exposes seam, inward crop, JPEG download, and share fallback", async ({ page }) => {
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
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => { throw new Error("share rejected"); },
    });
  });
  const fallbackPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "分享" }).click();
  await fallbackPromise;
  await expect(page.getByText("分享不可用，已改为下载 JPEG。")).toBeVisible();
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
