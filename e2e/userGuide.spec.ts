import { test, expect } from '@playwright/test'

for (const platform of [
  { key: 'pc', label: '电脑端', count: 4, width: 1280, height: 800 },
  { key: 'tb', label: '平板端', count: 4, width: 1024, height: 768 },
  { key: 'ph', label: '手机端', count: 3, width: 320, height: 568 },
]) {
  test(`${platform.label} opens illustrated help with matching platform content`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: platform.width, height: platform.height })
    await page.addInitScript((key) => {
      localStorage.setItem('pindou-device', key)
      localStorage.setItem('pindou-phone-intro-seen', '1')
      localStorage.setItem('pindou-announcement-rebuild-v1-seen', '1')
      localStorage.setItem(`pindou-tutorial-v1-${key}`, '1')
    }, platform.key)
    await page.goto('/pindou-draw/')
    await page
      .getByRole('button', { name: platform.key === 'ph' ? '菜单' : '设置', exact: true })
      .click()
    await page.getByRole('button', { name: /^使用教程/ }).click()
    const guide = page.getByRole('dialog', { name: `使用教程 · ${platform.label}` })
    await expect(guide).toBeVisible()
    await expect(guide.locator('.user-guide-section')).toHaveCount(platform.count)
    for (const image of await guide.locator('.user-guide-image').all()) {
      await expect(image).toHaveAttribute('alt', new RegExp(platform.label))
      await expect
        .poll(() =>
          image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
        )
        .toBe(true)
    }
    const copy = guide.locator('.user-guide-copy').first()
    await expect(copy).toContainText(
      platform.key === 'pc' ? '摁住中键拖动画布' : '单指绘制，双指拖动或缩放',
    )
    await guide.locator('.user-guide-section').last().scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '关闭使用教程' })).toBeInViewport()
    await expect(guide).toContainText('没有 AI 参与')
    if (platform.key !== 'ph') {
      await expect(guide.locator('.user-guide-warning')).toHaveCSS('color', 'rgb(220, 38, 38)')
      await expect(guide).toContainText(platform.key === 'tb' ? '点击列头或行头' : '右键列头或行头')
    }
    await page.screenshot({ path: `test-results/user-guide-${platform.key}.png` })
    await page.getByRole('button', { name: '关闭使用教程' }).click()
    await expect(guide).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: platform.key === 'ph' ? '菜单' : '设置', exact: true }),
    ).toBeVisible()
  })
}
