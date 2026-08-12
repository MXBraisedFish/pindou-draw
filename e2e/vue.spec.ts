import { test, expect } from '@playwright/test'

test('visits the app root url', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.device-modal-title')).toHaveText('欢迎使用拼豆绘制')
})
