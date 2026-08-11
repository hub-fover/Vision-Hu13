import { test, expect } from '@playwright/test';

test('sample prepares five frames and exposes result workflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /手机拍五张照片/ })).toBeVisible();
  await page.getByRole('button', { name: '用样例体验' }).click();
  await expect(page.locator('#analysis-status')).toContainText('五张照片已准备好');
  await expect(page.locator('#run-button')).toBeEnabled();
});

test('calibration modes switch without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: '镜头标定' }).click();
  await expect(page.getByRole('heading', { name: '镜头标定' })).toBeVisible();
  await page.getByRole('tab', { name: '尺度标定' }).click();
  await expect(page.getByRole('heading', { name: '尺度标定' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
