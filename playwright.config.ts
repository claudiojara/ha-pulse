import { defineConfig, devices } from '@playwright/test';

/**
 * Tests E2E corren contra el dev server local. Los tests son UI-only:
 * verifican render, navegación, agrupación por dominio, empty states.
 * NO tocan hardware (no toggles, no sliders) para evitar afectar al HA real.
 *
 * Pre-requisito: tener `pnpm dev` corriendo (api en :3001 + web en :5173).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
