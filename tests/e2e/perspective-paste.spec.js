import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const example = (name) =>
  fileURLToPath(new URL(`../../assets/examples/${name}`, import.meta.url));

async function addValidQuad(page) {
  const canvas = page.locator("#editor-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("editor canvas has no bounding box");
  const points = [
    [0.72, 0.72],
    [0.22, 0.24],
    [0.26, 0.68],
    [0.76, 0.29],
  ];
  for (const [x, y] of points) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  }
  // Full-resolution blending deliberately runs in a worker. On Windows CI,
  // a cold worker can take longer than the interaction timeout under load.
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 60_000 });
}

test("first-load sample, presets, comparison, uploads, and exports stay local", async ({ page }) => {
  const outbound = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") {
      outbound.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/透视贴图实验室/);
  await expect(page.locator("#protocol-warning")).toBeHidden();
  await expect(page.locator("#empty-message")).toBeHidden();
  await expect(page.locator("#point-status")).toHaveText("透视区域有效");
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator("#vanishing-toggle")).toBeChecked();

  await page.locator("#font-input").setInputFiles({
    name: "invalid-font.ttf",
    mimeType: "font/ttf",
    buffer: Buffer.from("not a font"),
  });
  await expect(page.locator("#render-status")).toContainText("字体加载失败");

  await page.locator("#background-input").setInputFiles(example("packaging.jpg"));
  await expect(page.locator("#point-status")).toContainText("0/4");
  await page.locator('[data-asset-tab="text"]').click();
  await page.locator("#asset-input").setInputFiles(example("lab-poster.png"));
  await expect(page.locator('[data-asset-tab="png"]')).toHaveClass(/active/);
  await page.locator("#preset-select").selectOption("poster");
  await expect(page.locator("#blur")).toHaveValue("0.8");
  await addValidQuad(page);
  await page.locator("#compare-slider").fill("42");
  await expect(page.locator("#compare-value")).toHaveText("42%");

  let pngWithGuide;
  for (const [button, suffix] of [["#export-png", ".png"], ["#export-jpeg", ".jpg"]]) {
    const downloadPromise = page.waitForEvent("download");
    await page.locator(button).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(`${suffix.replace(".", "\\.")}$`));
    const path = await download.path();
    if (suffix === ".png") pngWithGuide = await readFile(path);
  }
  await page.locator("#vanishing-toggle").uncheck();
  await expect(page.locator("#vanishing-toggle")).not.toBeChecked();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-png").click();
  const pngWithoutGuide = await readFile(await (await downloadPromise).path());
  expect(pngWithoutGuide.equals(pngWithGuide)).toBe(true);
  expect(outbound).toEqual([]);
});

test("invalid geometry explains the failure and keeps export disabled", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#empty-message")).toBeHidden();
  await page.locator("#reset-button").click();
  await expect(page.locator("#point-status")).toContainText("0/4");
  const canvas = page.locator("#editor-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("editor canvas has no bounding box");

  // Keep each point outside the editor's 16 px hit radius, while the
  // resulting roughly 30×30 px preview quad remains below the area threshold.
  for (const [x, y] of [[.5, .5], [.525, .5], [.525, .533], [.5, .533]]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  }
  await expect(page.locator("#geometry-error")).not.toBeEmpty();
  await expect(page.locator("#export-png")).toBeDisabled();
});
