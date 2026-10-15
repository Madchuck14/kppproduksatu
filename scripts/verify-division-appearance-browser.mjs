import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('shared/utils/book-divisions.ts', 'utf8')
const compiled = ts
  .transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  .outputText.replace("from 'zod'", `from '${import.meta.resolve('zod')}'`)
const { bookDivisions, getDivisionAppearance, additionalDivisionIcons, additionalDivisionStyles } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
for (const builtin of bookDivisions) {
  assert.deepEqual(getDivisionAppearance(builtin.code), {
    icon: builtin.icon,
    style: builtin.style,
  })
}
const additions = Array.from({ length: 16 }, (_, index) => ({
  code: `divisi-tambahan-${index + 1}`,
  name: `Divisi Tambahan ${index + 1}`,
}))
const options = [...bookDivisions, ...additions].map(({ code, name }) => ({
  kind: 'division',
  code,
  name,
  education_level: '',
}))
assert.equal(new Set(additions.map(({ code }) => getDivisionAppearance(code).style)).size, 8)
assert.ok(new Set(additions.map(({ code }) => getDivisionAppearance(code).icon)).size >= 6)
for (const { code } of additions) {
  assert.ok(additionalDivisionIcons.includes(getDivisionAppearance(code).icon))
  assert.ok(additionalDivisionStyles.includes(getDivisionAppearance(code).style))
  assert.deepEqual(getDivisionAppearance(code), getDivisionAppearance(code))
}
if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('PLAYWRIGHT_MODULE_PATH belum ditentukan.')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultNavigationTimeout(90000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text())
  })
  const response = await page.goto('http://localhost:3000/divisi', {
    waitUntil: 'domcontentloaded',
  })
  assert.equal(response.status(), 200)
  await page.route('**/api/catalog/classifications', (route) => route.fulfill({ json: options }))
  await page.route('**/api/catalog/browse?*', (route) =>
    route.fulfill({
      json: {
        source: 'demo',
        groups: options.map(({ code }) => ({ code, total: 0, products: [] })),
      },
    }),
  )
  async function openFixtures() {
    await page.goto('http://localhost:3000/contact', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
          ?.isHydrating === false,
    )
    await page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .getByRole('link', { name: 'Divisi', exact: true })
      .click()
    await page
      .getByRole('heading', { name: 'Divisi Tambahan 16', exact: true, level: 2 })
      .waitFor()
      .catch(async (error) => {
        console.log('Browser state', page.url(), await page.locator('h2').allTextContents(), errors)
        await page.screenshot({ path: join(tmpdir(), 'kpp-division-debug.png'), fullPage: true })
        throw error
      })
  }
  await openFixtures()
  const cards = page.locator('.division-card')
  assert.equal(await cards.count(), options.length)
  for (const { code, name } of additions) {
    const card = cards.filter({ has: page.getByRole('heading', { name, exact: true }) })
    const appearance = getDivisionAppearance(code)
    assert.ok((await card.getAttribute('class')).includes(appearance.style))
    const icon = card.locator('.group-icon .iconify')
    await icon.waitFor()
    assert.ok(
      (await icon.getAttribute('class')).includes(
        appearance.icon.replace('i-lucide-', 'i-lucide:'),
      ),
    )
    assert.notEqual(
      await card.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgba(0, 0, 0, 0)',
    )
  }
  await page.screenshot({
    path: join(tmpdir(), 'kpp-division-appearance-desktop.png'),
    fullPage: true,
  })
  const classes = await cards.evaluateAll((elements) =>
    elements.map((element) => element.className),
  )
  await openFixtures()
  assert.deepEqual(
    await cards.evaluateAll((elements) => elements.map((element) => element.className)),
    classes,
  )
  await cards.filter({ hasText: 'Divisi Tambahan 1' }).first().click()
  await page.waitForURL('**/divisi?division=divisi-tambahan-1')
  assert.equal(await page.locator('.book-shelf').count(), 1)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({
    path: join(tmpdir(), 'kpp-division-appearance-mobile.png'),
    fullPage: true,
  })
  assert.deepEqual(errors, [])
  console.log(
    'PASS port 3000: live SSR, 16 fixture additions, 8 palettes, varied icons, stable repeat visits, selection, mobile overflow, no hydration errors. No database writes.',
  )
} finally {
  await browser.close()
}
