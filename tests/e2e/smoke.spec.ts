import { expect, test } from '@playwright/test';

const SHOTS = process.env.SCREENSHOT_DIR;

test('shows the theater map with the panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Energy terminal' })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  // Attribution appears once the basemap style has loaded.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap', { timeout: 15_000 });
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/light.png` });
});

test('panel collapses and expands', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await expect(page.getByRole('button', { name: 'Expand panel' })).toBeVisible();
  expect((await page.locator('aside').boundingBox())?.width).toBeLessThan(60);
  await page.keyboard.press('[');
  await expect(page.getByRole('button', { name: 'Collapse panel' })).toBeVisible();
});

for (const [scheme, background] of [
  ['light', 'rgb(244, 244, 242)'],
  ['dark', 'rgb(17, 19, 21)'],
] as const) {
  test(`theme follows the system setting: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS('background-color', background);
    if (SHOTS && scheme === 'dark') {
      await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap', { timeout: 15_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${SHOTS}/dark.png` });
    }
  });
}

test('selection and camera live in the URL', async ({ page }) => {
  await page.goto('/');
  await page.goto('/?sel=pipeline/nord-stream-1');
  await expect(page.getByRole('heading', { name: 'nord-stream-1' })).toBeVisible();
  await page.locator('.maplibregl-canvas').click();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/sel=/);
  await expect(page.getByRole('heading', { name: 'Theater' })).toBeVisible();

  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -400);
  await expect(page).toHaveURL(/at=-?\d+\.\d{4},-?\d+\.\d{4},\d+\.\d{2}/);
});
