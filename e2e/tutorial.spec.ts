import { test, expect, type Page } from '@playwright/test'
test.use({ hasTouch: true })

async function next(page: Page, step: number, total: number) {
  // A short guard prevents double taps from accidentally skipping a step.
  await page.waitForTimeout(280)
  if (total === 3) await page.locator('.tutorial-instructions strong').tap()
  else await page.locator('.tutorial-instructions strong').click()
  if (step <= total)
    await expect(page.locator('.tutorial-progress')).toHaveText(`${step} / ${total}`)
  else await expect(page.locator('.tutorial-overlay')).toHaveCount(0)
}

for (const platform of [
  { label: '电脑', key: 'pc' },
  { label: '平板', key: 'tb' },
  { label: '手机', key: 'ph' },
]) {
  test(`${platform.label} first-use guide, positioning, persistence and replay`, async ({
    page,
  }) => {
    if (platform.key === 'ph') await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pindou-draw-vue/')
    await page.getByRole('button', { name: platform.label, exact: true }).click()
    if (platform.key === 'ph')
      await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0)
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    const total = platform.key === 'ph' ? 3 : 4
    await expect(page.locator('.tutorial-progress')).toHaveText(`1 / ${total}`)
    await expect(page.locator('.tutorial-instructions strong')).toHaveText(
      platform.key === 'pc' ? '左键下一步' : '点击下一步',
    )
    const tools = page.locator(platform.key === 'ph' ? '.phone-tools' : '.left-toolbar')
    await expect
      .poll(async () => {
        const target = (await tools.boundingBox())!
        const frame = (await page.locator('.tutorial-frame').boundingBox())!
        return Math.abs(target.y - frame.y) < 6 && Math.abs(target.width - frame.width) < 10
      })
      .toBe(true)
    await next(page, 2, total)
    await expect(page.locator('.tutorial-instructions p')).toContainText(
      platform.key === 'pc' ? 'ctrl+滚轮缩放画布' : '单指绘制，双指缩放和移动画布',
    )
    if (platform.key === 'ph') {
      await page.setViewportSize({ width: 320, height: 568 })
      await expect(page.locator('.tutorial-instructions')).toBeInViewport({ ratio: 1 })
    }
    await next(page, 3, total)
    if (total === 4) await next(page, 4, total)
    await expect
      .poll(async () => {
        const frame = (await page.locator('.tutorial-frame').boundingBox())!
        return frame.y < 50
      })
      .toBe(true)
    await page.screenshot({
      path: `test-results/tutorial-${platform.key}.png`,
      animations: 'disabled',
    })
    await next(page, total + 1, total)
    expect(
      await page.evaluate((key) => localStorage.getItem(`pindou-tutorial-v1-${key}`), platform.key),
    ).toBe('1')
    await page.reload()
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0)
    if (platform.key !== 'ph') {
      if (platform.key === 'tb')
        await page.getByRole('button', { name: '收起工具栏', exact: true }).click()
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page.getByRole('button', { name: '教程小动画重播', exact: true }).click()
      await expect(page.locator('.settings-overlay')).toHaveCount(0)
      await expect(page.locator('.tutorial-progress')).toHaveText('1 / 4')
      await next(page, 2, 4)
      await next(page, 3, 4)
      if (platform.key === 'tb')
        await expect(page.locator('.right-panels')).not.toHaveClass(/tablet-collapsed/)
      await page.getByRole('button', { name: '跳过引导' }).click()
      if (platform.key === 'tb')
        await expect(page.locator('.right-panels')).toHaveClass(/tablet-collapsed/)
    }
  })
}
