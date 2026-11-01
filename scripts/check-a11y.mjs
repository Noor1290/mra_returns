// Accessibility checks on the production build, in both themes:
//   - every control has a name;
//   - the keyboard focus ring is a visible 2px accent outline;
//   - text contrast is at least WCAG AA (4.5:1, or 3:1 for large text);
//   - reduced motion switches every animation and transition off.
// The files, templates and dialogs are walked through with scripts/lib/template-walk.mjs.
// The screens inside the dashboard are checked for names and contrast by check-bridge.mjs.
// Run after `npm run build`: node scripts/check-a11y.mjs
import { chromium } from 'playwright'
import { lowContrast, unnamedControls, settled } from './lib/a11y-page.mjs'
import { startPreview } from './lib/preview-server.mjs'
import { walkTemplates } from './lib/template-walk.mjs'

const problems = []
const fail = (theme, text) => problems.push(`[${theme}] ${text}`)

async function checkScreen(page, theme, name) {
  for (const html of await page.evaluate(unnamedControls)) fail(theme, `${name}: control without a name: ${html}`)
  for (const item of await page.evaluate(lowContrast)) fail(theme, `${name}: low contrast ${item}`)
}

async function checkFocusRing(page, theme, name, steps) {
  const accent = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    document.body.appendChild(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  })
  await page.locator('body').click({ position: { x: 2, y: 2 } })
  let focused = 0
  for (let step = 0; step < steps; step++) {
    await page.keyboard.press('Tab')
    const ring = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const style = getComputedStyle(el)
      return { what: el.outerHTML.slice(0, 80), style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor }
    })
    if (!ring) continue
    focused++
    if (ring.style === 'none' || ring.width !== '2px' || ring.color !== accent) {
      fail(theme, `${name}: focus ring is ${ring.width} ${ring.style} ${ring.color}, expected 2px solid ${accent}, on ${ring.what}`)
    }
  }
  if (focused === 0) fail(theme, `${name}: nothing could be reached with the keyboard`)
}

const server = await startPreview()
const browser = await chromium.launch()
try {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme })
    const page = await context.newPage()
    await page.goto(server.url)
    await page.getByRole('button', { name: 'Try with fake sample data' }).waitFor()
    await checkScreen(page, theme, 'on its own')
    await checkFocusRing(page, theme, 'on its own', 4)

    await page.getByRole('button', { name: 'Try with fake sample data' }).click()
    await page.getByTestId('run').waitFor()
    await checkScreen(page, theme, 'fake sample')
    await checkFocusRing(page, theme, 'fake sample', 6)

    // The theme switch works in both directions and is a real, named button.
    await page.getByRole('button', { name: theme === 'dark' ? 'Light theme' : 'Dark theme' }).click()
    await page.evaluate(settled)
    await checkScreen(page, `${theme} switched`, 'fake sample')
    // Every screen and dialog of the files and templates.
    await walkTemplates(page, async (name) => {
      await page.evaluate(settled)
      await checkScreen(page, `${theme} switched`, name)
    })
    await context.close()
  }

  // Reduced motion: nothing animates, nothing transitions.
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto(server.url)
  await page.getByRole('button', { name: 'Try with fake sample data' }).click()
  await page.getByTestId('run').waitFor()
  const moving = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((el) => {
        const style = getComputedStyle(el)
        const animated = style.animationName !== 'none' && parseFloat(style.animationDuration) > 0
        const transitions = style.transitionDuration.split(',').some((d) => parseFloat(d) > 0)
        return animated || transitions
      })
      .map((el) => el.outerHTML.slice(0, 80)),
  )
  for (const html of moving) fail('reduced motion', `still animates: ${html}`)
  await context.close()
} finally {
  await browser.close()
  await server.close()
}

if (problems.length > 0) {
  console.error(`Accessibility check FAILED (${problems.length}):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('Accessibility check passed: names, focus ring, contrast (both themes), reduced motion.')
