import { test, expect } from '@playwright/test'

test('phone introduction and announcement are shown once and fit portrait screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/pindou-draw-vue/')
  await expect(page.locator('.device-option-hint')).toHaveCount(0)
  await page.getByRole('button', { name: '手机', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '手机端使用提示' })).toBeVisible()
  await expect(page.locator('.notice-content')).toContainText('手机端适合快速绘制简洁草图')
  await page.getByRole('button', { name: '知道了', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '公告', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '知道了', exact: true })).toBeInViewport()
  await expect(page.locator('.notice-content')).toContainText('没有任何水印（包括隐形水印）')
  await expect(page.locator('.notice-content')).toContainText('本网站永远免费使用')
  await expect(page.locator('.notice-content')).toContainText('打赏纯自愿，不强制')
  await page.getByRole('button', { name: '关闭提示' }).click()
  await page.getByRole('button', { name: '跳过引导' }).click()
  await page.reload()
  await expect(page.locator('.phone-tools')).toBeVisible()
  await expect(page.locator('.notice-overlay')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('pindou-phone-intro-seen'))).toBe('1')
})

for (const platform of ['电脑', '平板']) {
  test(`${platform} can reopen announcement from settings`, async ({ page }) => {
    await page.goto('/pindou-draw-vue/')
    await page.getByRole('button', { name: platform }).click()
    await expect(page.getByRole('dialog', { name: '公告', exact: true })).toBeVisible()
    await expect(page.locator('.notice-links a').first()).toHaveAttribute(
      'href',
      'https://ifdian.net/a/mxfish520',
    )
    await expect(page.locator('.notice-links a').last()).toHaveAttribute(
      'href',
      'https://github.com/MXBraisedFish/pindou-draw',
    )
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await page.getByRole('button', { name: '跳过引导' }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: /公告.*查看版本公告/ }).click()
    await expect(page.getByRole('dialog', { name: '公告', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.settings-dialog')).toBeVisible()
    await page.getByRole('button', { name: /支持作者.*了解支持项目/ }).click()
    await expect(page.locator('.support-links a')).toHaveCount(2)
    await expect(page.locator('.sub-dialog > p')).toHaveCount(0)
    await expect(page.locator('.support-links a').first()).toContainText(
      '付费支持不是必须的，网页永远免费使用。',
    )
    await expect(page.locator('.support-links a').last()).toContainText('给一颗星星吧。')
    for (const link of await page.locator('.support-links a').all()) {
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    await page.reload()
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()
    await expect(page.locator('.notice-overlay')).toHaveCount(0)
  })
}
