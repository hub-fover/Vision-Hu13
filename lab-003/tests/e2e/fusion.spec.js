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
  const comparisonLayout = await page.evaluate(() => {
    const result = document.querySelector("#result-preview");
    const middle = document.querySelector("#middle-preview");
    const frame = document.querySelector(".result-frame");
    return {
      resultPosition: getComputedStyle(result).objectPosition,
      middlePosition: getComputedStyle(middle).objectPosition,
      middleWidth: middle.getBoundingClientRect().width,
      frameWidth: frame.getBoundingClientRect().width,
    };
  });
  expect(comparisonLayout.middlePosition).toBe(comparisonLayout.resultPosition);
  expect(comparisonLayout.middleWidth).toBeCloseTo(comparisonLayout.frameWidth, 1);
  const summary = await page.locator("#result-summary").textContent();
  expect(Number(summary.match(/运动保护 ([\d.]+)%/)[1])).toBeLessThan(15);
  await expect(page.getByRole("button", { name: "下载 JPEG" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "系统分享" })).toBeEnabled();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  expect(errors).toEqual([]);
});

test("public article copy writes rich clipboard content and preserves images", async ({ page }) => {
  await page.addInitScript(() => {
    window.__copyItems = [];
    window.ClipboardItem = class {
      constructor(items) { this.items = items; this.types = Object.keys(items); }
      getType(type) { return Promise.resolve(this.items[type]); }
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: async (items) => { window.__copyItems.push(items[0]); } },
    });
  });
  await page.goto("/article-copy.html");
  await expect(page.locator("#copy-content img")).toHaveCount(11);
  await page.locator("#copy-button").click();
  await expect(page.locator("#copy-status")).toContainText("\u5df2\u590d\u5236");
  const payload = await page.evaluate(async () => {
    const item = window.__copyItems[0];
    return {
      html: await (await item.getType("text/html")).text(),
      plain: await (await item.getType("text/plain")).text(),
    };
  });
  expect(payload.html).toContain("https://hub-fover.github.io/Vision-Hu13/lab-003/assets/figures/");
  expect(payload.html).toContain("https://hub-fover.github.io/Vision-Hu13/lab-003/assets/public/lab-003-qr.png");
  expect((payload.html.match(/<img /g) ?? []).length).toBe(11);
  expect(payload.html).toContain("<h1 style=");
  expect(payload.html).toContain("<h3 style=");
  expect(payload.html).not.toContain("copy-toolbar");
  expect(payload.html).not.toContain("copy-button");
  expect(payload.html).not.toContain("href=");
  expect(payload.plain).toContain("LAB 003");
  expect(payload.plain).not.toContain("\u590d\u5236\u4e0b\u65b9\u6b63\u6587");
  const pasted = await page.evaluate((html) => {
    const target = document.createElement("div");
    target.contentEditable = "true";
    target.id = "paste-target";
    document.body.append(target);
    target.focus();
    document.execCommand("insertHTML", false, html);
    return {
      images: target.querySelectorAll("img").length,
      headings: target.querySelectorAll("h1, h3").length,
      styled: target.querySelectorAll("[style]").length,
      text: target.textContent,
    };
  }, payload.html);
  expect(pasted.images).toBe(11);
  expect(pasted.headings).toBe(10);
  expect(pasted.styled).toBeGreaterThan(20);
  expect(pasted.text).toContain("\u4e00\u5f20\u7167\u7247\u88c5\u4e0d\u4e0b\u7684\u660e\u6697");
  expect(pasted.text).toContain("LAB \u7cfb\u5217\u627f\u8bfa");
});

test("public article copy selects the article when clipboard permission fails", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: async () => { throw new Error("permission denied"); } },
    });
    document.execCommand = () => false;
  });
  await page.goto("/article-copy.html");
  await page.locator("#copy-button").click();
  await expect(page.locator("#copy-status")).toContainText("\u5df2\u9009\u4e2d\u5168\u6587");
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
