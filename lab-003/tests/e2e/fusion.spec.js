import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const sample = (name) => fileURLToPath(new URL(`../../web/assets/samples/peyrou/${name}`, import.meta.url));

test("sample completes in the real Worker and exposes result actions", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("三次曝光");
  await page.getByRole("button", { name: "用样例体验" }).click();
  await expect(page.locator("#analysis-status")).toContainText("曝光跨度");
  await page.getByRole("button", { name: "开始融合" }).click();
  await expect(page.locator("#result-panel")).toBeVisible({ timeout: 80_000 });
  await expect(page.locator("#result-preview")).toHaveAttribute("src", /^blob:/);
  const summary = await page.locator("#result-summary").textContent();
  expect(Number(summary.match(/运动保护 ([\d.]+)%/)[1])).toBeLessThan(15);
  await expect(page.getByRole("button", { name: "下载 JPEG" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "系统分享" })).toBeEnabled();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  expect(errors).toEqual([]);
});

test("gallery validation, camera fallback and cancellation remain usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('input[capture="environment"]')).toHaveCount(3);
  await page.locator("#gallery-input").setInputFiles([
    sample("under.jpg"),
    sample("mean.jpg"),
  ]);
  await expect(page.locator("#error-message")).toContainText("正好三张");
  await page.getByRole("button", { name: "用样例体验" }).click();
  await page.getByRole("button", { name: "开始融合" }).click();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.locator("#analysis-status")).toContainText("已取消");
  await expect(page.getByRole("button", { name: "开始融合" })).toBeEnabled();
});
