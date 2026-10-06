import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

const legacy = readFileSync('src/__tests__/fixtures/legacy-v2.pd')
test.use({ hasTouch: true })

async function downloadProject(page: Page, phone: boolean) {
  await page.getByRole('button', { name: phone ? '菜单' : '保存', exact: true }).click()
  const promise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存工程文件' }).click()
  const download = await promise
  expect(download.suggestedFilename()).toMatch(/\.pindou\.json$/)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function importProject(page: Page, phone: boolean, name: string, buffer: Buffer) {
  if (phone) {
    await page.locator('.phone-editor > input[type=file]').first().setInputFiles({
      name,
      mimeType: 'application/json',
      buffer,
    })
  } else {
    await page.getByRole('button', { name: '导入', exact: true }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '从文件导入' }).click()
    await (await chooser).setFiles({ name, mimeType: 'application/json', buffer })
    await expect(page.locator('.palette-card-select')).toHaveValue('旧版测试色卡')
  }
}

for (const platform of [
  { key: 'pc', label: '电脑', width: 1440, height: 900 },
  { key: 'tb', label: '平板', width: 1024, height: 768 },
  { key: 'ph', label: '手机', width: 390, height: 844 },
]) {
  test.describe(`${platform.label} palette and project compatibility`, () => {
    const phone = platform.key === 'ph'
    const selectMethod = platform.key === 'pc' ? 'click' : 'tap'
    async function openPalette(page: Page) {
      if (phone) await page.getByRole('button', { name: '颜色', exact: true }).click()
    }

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: platform.width, height: platform.height })
      await page.goto('/pindou-draw/')
      await page.getByRole('button', { name: platform.label, exact: true }).click()
      if (platform.key === 'ph')
        await page.getByRole('button', { name: '知道了', exact: true }).click()
      await page.getByRole('button', { name: '知道了', exact: true }).click()
      await page.getByRole('button', { name: '跳过引导' }).click()
    })

    test('five recent colors, reuse, card switch, refresh, and touch layout', async ({ page }) => {
      await openPalette(page)
      const history = page.locator('.palette-history')
      await expect(history).toBeVisible()
      await expect(history.locator('button')).toHaveCount(0)
      const cells = page.locator('.palette-grid .palette-swatch-cell')
      const ids: string[] = []
      for (let i = 0; i < 6; i++) {
        ids.push((await cells.nth(i).locator('.swatch-id').textContent())!.trim())
        await cells.nth(i)[selectMethod]()
      }
      await expect(history.locator('.swatch-id')).toHaveText(ids.slice(1).reverse())
      const reused = ids[2]!
      await history
        .getByRole('button', { name: `使用历史颜色 ${reused}`, exact: true })
        [selectMethod]()
      await expect(history.locator('.swatch-id').first()).toHaveText(reused)
      await expect(page.locator('.preview-id')).toHaveText(reused)
      await page.setViewportSize(phone ? { width: 320, height: 568 } : platform)
      const previewBox = (await page.locator('.palette-preview').boundingBox())!
      const historyBox = (await history.boundingBox())!
      const filtersBox = (await page.locator('.palette-filters').boundingBox())!
      expect(historyBox.y).toBeGreaterThanOrEqual(previewBox.y + previewBox.height)
      expect(filtersBox.y).toBeGreaterThanOrEqual(historyBox.y + historyBox.height)
      for (const button of await history.locator('button').all()) {
        await expect(button).toBeInViewport({ ratio: 1 })
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `test-results/history-${platform.key}.png`,
        animations: 'disabled',
      })
      await expect(cells.first()).toBeInViewport({ ratio: 1 })
      await page.locator('.palette-card-select').selectOption({ label: 'MARD-48' })
      await expect(history.locator('button')).toHaveCount(0)
      await page.locator('.palette-grid .palette-swatch-cell').first().click()
      await expect(history.locator('button')).toHaveCount(1)
      await page.reload()
      await openPalette(page)
      await expect(history.locator('button')).toHaveCount(0)
    })

    test('imports the last legacy PD payload and reimports its v4 export', async ({ page }) => {
      await importProject(page, phone, '旧版样本.pd', legacy)
      const saved = await downloadProject(page, phone)
      expect(saved.version).toBe(4)
      expect(saved.type).toBe('single')
      expect(saved.name).toBe('旧版样本')
      expect([saved.cols, saved.rows]).toEqual([6, 2])
      expect(saved.layers[0].grid[0]).toEqual([
        '#cf0053',
        '#d0d4d8',
        '#7850c8',
        '#f0fab4',
        '#ff0000',
        '#ffffff',
      ])
      expect(saved.layers[0].grid[1][0]).toBe('')
      expect(saved.colorCard.colors.map((entry: { type: string }) => entry.type)).toEqual([
        'solid',
        'transparent',
        'pearl',
        'glow',
        'thermo',
        'photo',
      ])
      expect(saved.recentColorIds).toEqual([])
      page.on('dialog', (dialog) => dialog.accept())
      await importProject(page, phone, '新版样本.pindou.json', Buffer.from(JSON.stringify(saved)))
      const reloaded = await downloadProject(page, phone)
      expect(reloaded.layers).toEqual(saved.layers)
      expect(reloaded.colorCard).toEqual(saved.colorCard)
    })
  })
}
