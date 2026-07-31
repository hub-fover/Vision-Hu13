import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { closeStaticServer, startStaticServer } from "../tests/e2e/server.mjs";

const root = resolve(import.meta.dirname, "..");
const temporary = resolve(root, "tmp/browser-video");
const output = resolve(root, "assets/public/lab-003-browser-demo.webm");
await mkdir(temporary, { recursive: true });
const server = await startStaticServer({ port: 4473 });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 1,
  recordVideo: { dir: temporary, size: { width: 412, height: 915 } },
});
const page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:4473/");
  await page.getByRole("button", { name: "用样例体验" }).click();
  await page.locator("#analysis-status").waitFor({ state: "visible" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "开始融合" }).click();
  await page.locator("#result-panel").waitFor({ state: "visible", timeout: 80_000 });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "中间曝光" }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "运动区域" }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "融合结果" }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(root, "artifacts/mobile-result.png"), fullPage: true });
} finally {
  const video = page.video();
  await context.close();
  if (!video) throw new Error("Browser did not produce a recording.");
  await copyFile(await video.path(), output);
  await browser.close();
  await closeStaticServer(server);
}
await writeFile(resolve(root, "assets/public/demo-metadata.json"), `${JSON.stringify({
  kind: "real-browser-recording",
  browser: "Chromium via Playwright",
  viewport: "412x915",
  recorded: "2026-07-31",
  flow: ["load pinned sample", "run real Worker", "switch result views"],
  disclaimer: "Browser recording; not presented as a physical-device camera capture.",
}, null, 2)}\n`);
process.stdout.write(`${output}\n`);
