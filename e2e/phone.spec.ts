import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.goto('/pindou-draw-vue/')
  await page.getByRole('button', { name: '手机 Phone' }).click()
  await expect(page.locator('.phone-tools')).toBeVisible()
})

test('portrait drawing, palette, underlay, and secondary menus', async ({ page }) => {
  await expect(page.locator('.phone-tools button')).toHaveCount(5)
  await expect(page.locator('.left-toolbar')).toHaveCount(0)
  const canvas = page.locator('.main-canvas')
  const box = (await canvas.boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByRole('button', { name: '撤回', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '撤回', exact: true }).click()
  await expect(page.getByRole('button', { name: '回退', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '颜色', exact: true }).click()
  await expect(page.locator('.palette-tools')).toHaveCount(0)
  await page.locator('.palette-card-select').selectOption({ label: 'MARD-48' })
  await page.locator('.palette-swatch-cell').first().click()
  await page.getByRole('button', { name: '完成选色' }).click()
  await page.screenshot({ path: 'test-results/phone-editor.png' })
  await page.getByRole('button', { name: '菜单', exact: true }).click()
  await page.getByRole('button', { name: '底图设置', exact: true }).click()
  await expect(page.locator('.floating-section')).toHaveCount(0)
  await page.locator('.underlay-section input[type=file]').setInputFiles({
    name: 'underlay.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>',
    ),
  })
  await expect(page.locator('.phone-sheet')).toHaveCount(0)
  await expect(page.locator('.phone-underlay-bar')).toBeVisible()
  await expect(page.getByRole('button', { name: '铅笔', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.getByRole('button', { name: '铅笔', exact: true })).toBeEnabled()
  await page.setViewportSize({ width: 320, height: 568 })
  await expect(page.locator('.phone-tools')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('imports a single project, rejects groups, and exports PNG and project files', async ({
  page,
}) => {
  await page.getByRole('button', { name: '菜单', exact: true }).click()
  await page
    .locator('.phone-editor > input[type=file]')
    .first()
    .setInputFiles({
      name: 'sample.pindou.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ version: 1, name: '手机测试', cols: 16, rows: 12, grid: [['#cf0053']] }),
      ),
    })
  await expect(page.locator('.phone-project-title strong')).toHaveText('手机测试')
  await page.getByRole('button', { name: '菜单', exact: true }).click()
  const dialogPromise = page.waitForEvent('dialog')
  await page
    .locator('.phone-editor > input[type=file]')
    .first()
    .setInputFiles({
      name: 'group.pindou.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":4,"type":"group"}'),
    })
  const dialog = await dialogPromise
  expect(dialog.message()).toContain('仅支持单画布')
  await dialog.dismiss()
  await expect(page.locator('.phone-project-title strong')).toHaveText('手机测试')
  const projectDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存工程文件', exact: true }).click()
  expect((await projectDownload).suggestedFilename()).toContain('.pindou.json')
  await page.getByRole('button', { name: '菜单', exact: true }).click()
  await page.getByRole('button', { name: '导出草图', exact: true }).click()
  await expect(page.locator('.phone-export-preview')).toBeVisible()
  await page.screenshot({ path: 'test-results/phone-export.png' })
  const pngDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 PNG 草图' }).click()
  expect((await pngDownload).suggestedFilename()).toContain('.png')
})

test('two-finger zoom does not leave accidental strokes', async ({ page, context }) => {
  const session = await context.newCDPSession(page)
  const box = (await page.locator('.main-canvas').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x - 30, y, id: 1 }],
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - 30, y, id: 1 },
      { x: x + 30, y, id: 2 },
    ],
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: x - 120, y, id: 1 },
      { x: x + 120, y, id: 2 },
    ],
  })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('button', { name: '撤回', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '菜单', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存工程文件', exact: true }).click()
  const stream = await (await download).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  for (const layer of project.layers) {
    expect(layer.grid.flat().every((color: string) => !color)).toBe(true)
  }
  await session.detach()
})

test('image generation stays within one canvas', async ({ page }) => {
  await page
    .locator('.phone-editor > input[type=file]')
    .last()
    .setInputFiles({
      name: 'large.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="#cf0053"/></svg>',
      ),
    })
  await expect(page.locator('.editor-title span')).toHaveText('画布 64 x 48')
  await page.screenshot({ path: 'test-results/phone-image-editor.png' })
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.locator('.image-editor')).toHaveCount(0)
  await expect(page.locator('.phone-project-title small')).toHaveText('64 x 48')
  await expect(page.locator('.canvas-tabs')).toHaveCount(0)
})
