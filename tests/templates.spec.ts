import { type Page, expect, test } from '@playwright/test';

/**
 * E2E del sistema de templates (Sprint 1):
 *  - default = base; sidebar muestra el switcher con `Base` y `Glass`.
 *  - click en `Glass` aplica `body.template-glass`, monta GlassBackground,
 *    y los cards de luz/switch/sensor se renderean con clases `g-light-card`,
 *    `g-sw-card`, `g-sensor-card` (estilo HAWeb).
 *  - volver a `Base` revierte body class y desmonta el background.
 *  - persiste tras reload.
 *
 * Asume `pnpm dev` corriendo y HA reachable.
 */

async function waitForReady(page: Page) {
  // Esperar que la conexión WS esté establecida Y los `initial_*` hayan
  // llegado (sección "Habitaciones" depende de `initial_areas`, que el
  // backend manda junto con `initial_preferences`).
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByText('Habitaciones')).toBeVisible();
  // También garantizar que el switcher tiene su estado hidratado: alguno de
  // los dos botones de template debe estar pressed=true.
  await expect(
    sidebar.locator('button[aria-pressed="true"]').filter({ hasText: /^(Base|Glass)$/ }),
  ).toBeVisible();
}

async function setTemplate(page: Page, name: 'Base' | 'Glass') {
  await page.getByRole('button', { name, pressed: false }).click();
  // Esperar el round-trip socket → preferences_updated.
  await expect(page.getByRole('button', { name, pressed: true })).toBeVisible();
}

// Estos tests comparten estado en SQLite (`user_prefs.active_template_id`)
// vía el backend. Serializamos para evitar que el cleanup de un test pise
// el setup del siguiente cuando corren en paralelo.
test.describe.configure({ mode: 'serial' });

test.describe('template system', () => {
  test.afterAll(async ({ browser }) => {
    // Garantiza que después de la suite la pref quede en `base` (no contamina
    // otros tests del repo).
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(
      page.getByRole('complementary').getByRole('navigation').getByRole('link').first(),
    ).toBeVisible();
    const baseButton = page.getByRole('button', { name: 'Base' });
    if (!(await baseButton.evaluate((el) => el.getAttribute('aria-pressed') === 'true'))) {
      await baseButton.click();
      await expect(page.getByRole('button', { name: 'Base', pressed: true })).toBeVisible();
    }
    await ctx.close();
  });

  test('default es Base, switcher en sidebar', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    // Sidebar tiene la sección Template con dos botones.
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('Template', { exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Base' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Glass' })).toBeVisible();

    // Por default `Base` está activo (aria-pressed=true).
    await expect(sidebar.getByRole('button', { name: 'Base', pressed: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Glass', pressed: false })).toBeVisible();

    // Body tiene `template-base`, NO `template-glass`.
    const bodyClass = await page.evaluate(() => document.body.className);
    expect(bodyClass).toContain('template-base');
    expect(bodyClass).not.toContain('template-glass');
  });

  test('switch a Glass aplica body class y monta cards glass', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);
    // Asegurar estado inicial estable (en caso de pref previa).
    if (
      !(await page.getByRole('button', { name: 'Base', pressed: true }).isVisible())
    ) {
      await setTemplate(page, 'Base');
    }

    await setTemplate(page, 'Glass');

    // Body class.
    await expect
      .poll(async () => page.evaluate(() => document.body.classList.contains('template-glass')))
      .toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.body.classList.contains('template-base')))
      .toBe(false);

    // GlassBackground está montado (4 orbs visibles en el DOM).
    const orbs = page.locator('.template-glass-bg-orb');
    await expect(orbs).toHaveCount(4);

    // En la home (`/`) hay luces. Esperamos que se rendericen como glass cards.
    const main = page.getByRole('main');
    const lightCards = main.locator('article.g-light-card');
    await expect(lightCards.first()).toBeVisible({ timeout: 5000 });

    // Cada glass light card tiene `glass-card` también (clase base).
    const firstCard = lightCards.first();
    await expect(firstCard).toHaveClass(/glass-card/);

    // Y trae el SVG de bulb (signal de fidelidad con HAWeb).
    await expect(firstCard.locator('svg.g-light-bulb')).toBeVisible();

    // Restaurar para no dejar pref alterada.
    await setTemplate(page, 'Base');
    await expect
      .poll(async () => page.evaluate(() => document.body.classList.contains('template-glass')))
      .toBe(false);
  });

  test('preferencia persiste tras reload', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);
    await setTemplate(page, 'Glass');

    await page.reload();
    await waitForReady(page);

    // Después del reload sigue activo Glass.
    await expect(
      page.getByRole('complementary').getByRole('button', { name: 'Glass', pressed: true }),
    ).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => document.body.classList.contains('template-glass')))
      .toBe(true);

    // Cleanup: dejar Base.
    await setTemplate(page, 'Base');
  });
});
