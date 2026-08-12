import { test, expect } from '@playwright/test';

test('tool is first viewport and never overflows', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: '用样例体验' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('sample exposes corners and actionable runtime prerequisite', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '用样例体验' }).click();
  await expect(page.locator('#estimateButton')).toBeEnabled();
  await page.locator('#estimateButton').click();
  await expect(page.locator('#status')).toContainText(/OpenCV|构建|姿态/);
});

test('permission denial has recovery text', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '实时跟踪' }).click();
  await page.getByRole('button', { name: '开始相机' }).click();
  await expect(page.locator('#liveStatus')).toContainText(/权限|不支持/);
});

test('calibration import rejects malformed JSON', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '相机标定' }).click();
  await page.locator('#importCalibration').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('#calibrationStatus')).toContainText('无效');
});
