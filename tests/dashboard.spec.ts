import { type Page, expect, test } from '@playwright/test';

/**
 * Tests E2E del dashboard. Verifican render, navegación entre habitaciones,
 * agrupación por dominio en RoomView, y consistencia del contador de luces
 * encendidas. NO interactúan con toggles/sliders para no afectar hardware HA.
 *
 * Asumen `pnpm dev` corriendo y al menos un par de áreas + luces en el HA.
 */

async function waitForAreas(page: Page) {
  await expect(
    page.getByRole('complementary').getByRole('navigation').getByRole('link').first(),
  ).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  // Cada test arranca con localStorage limpio (modo edición OFF, etc).
  await context.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {}
  });
});

test.describe('overview', () => {
  test('carga con header, sidebar y lista de luces', async ({ page }) => {
    await page.goto('/');
    await waitForAreas(page);

    // Header
    await expect(page.getByRole('heading', { name: 'HA Dashboard' })).toBeVisible();
    await expect(
      page.getByText(/luces? encendidas?$/),
    ).toBeVisible();
    await expect(page.getByText(/^conectado$|^API ok|^desconectado$/)).toBeVisible();

    // Sidebar tiene Overview + al menos una Habitación
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(sidebar.getByText('Habitaciones')).toBeVisible();
    const roomLinks = sidebar.getByRole('navigation').getByRole('link');
    await expect(roomLinks).not.toHaveCount(0);

    // Main content: heading "Luces" + grilla de cards
    await expect(page.getByRole('heading', { name: 'Luces', exact: true })).toBeVisible();
    const switches = page.getByRole('main').getByRole('switch');
    await expect(switches).not.toHaveCount(0);
  });

  test('contador del header coincide con cantidad de switches checked', async ({ page }) => {
    await page.goto('/');
    await waitForAreas(page);

    const switches = page.getByRole('main').getByRole('switch');
    await expect(switches.first()).toBeVisible();

    const counter = page.getByTestId('lights-on-count');
    await expect(counter).toBeVisible();
    const counterText = (await counter.textContent()) ?? '';
    const m = counterText.match(/(\d+)/);
    expect(m, `parsing counter '${counterText}'`).not.toBeNull();
    const expected = Number(m![1]);

    const checked = await page.getByRole('main').getByRole('switch', { checked: true }).count();
    expect(checked).toBe(expected);
  });
});

test.describe('navegación entre habitaciones', () => {
  test('click en una habitación cambia URL y muestra su nombre', async ({ page }) => {
    await page.goto('/');
    await waitForAreas(page);

    const sidebar = page.getByRole('complementary');
    const firstRoom = sidebar
      .getByRole('navigation')
      .getByRole('link')
      .filter({ hasNotText: 'Overview' })
      .first();
    const roomName = (await firstRoom.textContent())?.trim() ?? '';
    expect(roomName.length).toBeGreaterThan(0);

    await firstRoom.click();
    await expect(page).toHaveURL(/\/room\/.+/);
    await expect(
      page.getByRole('main').getByRole('heading', { name: roomName, level: 2 }),
    ).toBeVisible();

    // El sidebar marca la habitación como activa
    await expect(firstRoom).toHaveAttribute('data-active', 'true');
  });

  test('volver a Overview restaura la lista de luces y URL /', async ({ page }) => {
    await page.goto('/room/jardin');
    await waitForAreas(page);
    await page.getByRole('complementary').getByRole('link', { name: 'Overview' }).click();
    await expect(page).toHaveURL('http://localhost:5173/');
    await expect(page.getByRole('heading', { name: 'Luces', exact: true })).toBeVisible();
  });
});

test.describe('RoomView', () => {
  test('agrupa entidades por dominio con headers y counts', async ({ page }) => {
    // Sala tiene varios dominios (luces, switches, media, sensores, ...)
    await page.goto('/room/sala');
    await waitForAreas(page);

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Sala', level: 2 })).toBeVisible();

    // Esperar a que cargue la grid (llegó initial_states + entity_areas)
    const lights = main.getByRole('heading', { name: /^Luces \(\d+\)$/, level: 3 });
    await expect(lights).toBeVisible();

    // Cada header tiene formato "<Dominio> (<n>)"
    const groupHeaders = await main.getByRole('heading', { level: 3 }).allTextContents();
    expect(groupHeaders.length).toBeGreaterThan(0);
    for (const h of groupHeaders) {
      expect(h, `header '${h}' should match '<name> (<n>)'`).toMatch(/^.+\s\(\d+\)$/);
    }
  });

  test('habitación sin entidades muestra empty state', async ({ page }) => {
    // Buscar dinámicamente un área sin entidades para no atarse a un area_id
    // específico (la config del HA cambia con el tiempo).
    await page.goto('/');
    await waitForAreas(page);
    const emptyAreaId = await page.evaluate(async () => {
      // Tomamos el dato directo del socket del backend para no depender del DOM.
      return await new Promise<string | null>((resolve) => {
        const ws = new WebSocket('ws://localhost:3001/socket.io/?EIO=4&transport=websocket');
        let map: Record<string, string | null> | null = null;
        let areas: { area_id: string }[] | null = null;
        const finish = () => {
          if (!map || !areas) return;
          const populated = new Set(Object.values(map).filter(Boolean) as string[]);
          const empty = areas.find((a) => !populated.has(a.area_id));
          ws.close();
          resolve(empty?.area_id ?? null);
        };
        const timer = setTimeout(() => {
          ws.close();
          resolve(null);
        }, 4000);
        ws.onmessage = (ev) => {
          if (typeof ev.data !== 'string' || !ev.data.startsWith('42[')) return;
          try {
            const a = JSON.parse(ev.data.slice(2));
            if (a[0] === 'initial_areas') areas = a[1];
            if (a[0] === 'initial_entity_areas') map = a[1];
            if (map && areas) {
              clearTimeout(timer);
              finish();
            }
          } catch {}
        };
        ws.onopen = () => ws.send('40');
      });
    });

    test.skip(!emptyAreaId, 'no hay áreas vacías en este HA para validar empty state');
    await page.goto(`/room/${emptyAreaId}`);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(main.getByText('No hay entidades asignadas a esta área.')).toBeVisible();
  });
});

test.describe('preferencias de UI', () => {
  test('modo edición off por default; toggle muestra controles en RoomView', async ({ page }) => {
    await page.goto('/room/sala');
    await waitForAreas(page);

    const main = page.getByRole('main');
    // Esperar a que la grid esté pintada.
    await expect(main.getByRole('switch').first()).toBeVisible();

    // Sin modo edición: cero controles de edit en cards.
    await expect(main.getByRole('button', { name: 'Arrastrar para reordenar' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Entrar a modo edición' }).click();
    await expect(page.getByRole('button', { name: 'Salir de modo edición' })).toBeVisible();

    // Ahora aparecen controles en cada card.
    const dragHandles = main.getByRole('button', { name: 'Arrastrar para reordenar' });
    await expect(dragHandles.first()).toBeVisible();
    const handleCount = await dragHandles.count();
    expect(handleCount).toBeGreaterThan(0);
  });

  test('theme toggle alterna la clase dark en <html> (idempotente)', async ({ page }) => {
    await page.goto('/');
    await waitForAreas(page);

    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    const toggleLabel = before ? 'Tema claro' : 'Tema oscuro';
    await page.getByRole('button', { name: toggleLabel }).click();

    // Esperar a que el cambio se propague (socket round-trip).
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.classList.contains('dark')),
      )
      .toBe(!before);

    // Volver al estado inicial para no dejar la pref en DB con un valor distinto.
    const reverseLabel = before ? 'Tema oscuro' : 'Tema claro';
    await page.getByRole('button', { name: reverseLabel }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.classList.contains('dark')),
      )
      .toBe(before);
  });
});
