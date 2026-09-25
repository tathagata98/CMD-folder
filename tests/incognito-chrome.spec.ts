import { test, expect, chromium } from '@playwright/test';

test('open Chrome in incognito mode', async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--incognito'],
  });

  const page = await browser.newPage();

  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);
  await page.screenshot({ path: 'screenshot.png', fullPage: true });

  await page.waitForTimeout(5000);
  await browser.close();
});
