import { test, expect, chromium } from '@playwright/test';

test('launch a real Chrome browser', async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://example.com');

    await expect(page).toHaveTitle(/Example Domain/);
    await expect(page.locator('h1')).toHaveText('Example Domain');
  } finally {
    await browser.close();
  }
});