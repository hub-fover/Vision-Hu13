import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('runs the mobile-first relative-depth flow with real controls', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?e2e=1');
  await expect(page).toHaveTitle(/LAB 007/);
  await expect(page.getByRole('heading', { level: 1, name: 'LAB 007 单目深度' })).toBeVisible();
  await expect(page.locator('input[type=file][capture=environment]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^使用.*示例$/ })).toHaveCount(3);
  const undersized = await page.locator('button, label[for], summary').evaluateAll(nodes => nodes
    .filter(node => node.getClientRects().length > 0)
    .map(node => ({ label: node.getAttribute('aria-label') || node.textContent.trim(), height: node.getBoundingClientRect().height }))
    .filter(item => item.height < 48));
  expect(undersized).toEqual([]);

  await page.getByRole('button', { name: '使用街道示例' }).click();
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
  await expect(page.getByText('仅表示相对深浅，不是实际距离')).toBeVisible();
  const pixels = await page.locator('#depth-canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return data.some(value => value !== 0);
  });
  expect(pixels).toBe(true);

  await page.getByRole('button', { name: '深度图' }).click();
  await expect(page.locator('#result-visual')).toHaveAttribute('data-view', 'depth');
  await page.getByRole('button', { name: '对比' }).click();
  await page.locator('#compare-slider').fill('70');
  await expect(page.locator('#result-visual')).toHaveAttribute('style', /--compare: 70%/);
  await page.locator('#result-visual').click({ position: { x: 180, y: 160 } });
  await expect(page.locator('.depth-marker')).toHaveCount(1);
  await expect(page.getByText(/相对深度 \d+%/)).toBeVisible();
  await expect(page.getByRole('button', { name: '米制深度未连接' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('cancels an obsolete task and retries the retained image', async ({ page }) => {
  await page.goto('/?e2e=1&e2eDelay=700');
  await page.getByRole('button', { name: '使用室内示例' }).click();
  await expect(page.locator('[data-screen="processing"]')).toBeVisible();
  await page.getByRole('button', { name: '取消处理' }).click();
  await expect(page.getByText('处理已取消')).toBeVisible();
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
});

test('recovers from inference failure and downloads the share PNG', async ({ page }) => {
  await page.goto('/?e2e=1&e2eFailOnce=1');
  await page.getByRole('button', { name: '使用人物示例' }).click();
  await expect(page.getByRole('heading', { name: '深度模型运行失败' })).toBeVisible();
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '分享结果' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('lab-007-depth.png');
  const png = await readFile(await download.path());
  expect(png.byteLength).toBeGreaterThan(10_000);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});
