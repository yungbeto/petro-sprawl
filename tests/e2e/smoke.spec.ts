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
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/sel=/);
  await expect(page.getByRole('heading', { name: 'Theater' })).toBeVisible();

  await page.waitForFunction(() => (window as unknown as { __etMap?: MapHandle }).__etMap?.loaded());
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -400);
  await expect(page).toHaveURL(/at=-?\d+\.\d{4},-?\d+\.\d{4},\d+\.\d{2}/);
});

type MapHandle = { project: (p: [number, number]) => { x: number; y: number }; loaded: () => boolean };

/** Viewport coordinates of a lon/lat, through the dev-only map handle. */
async function screenPoint(page: import('@playwright/test').Page, lonLat: [number, number]) {
  await page.waitForFunction(() => (window as unknown as { __etMap?: MapHandle }).__etMap?.loaded());
  const local = await page.evaluate(
    (p) => (window as unknown as { __etMap: MapHandle }).__etMap.project(p),
    lonLat,
  );
  const box = (await page.locator('.map__canvas').boundingBox())!;
  return { x: box.x + local.x, y: box.y + local.y };
}

test('hovering and clicking a chokepoint opens its detail', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Chokepoints').first()).toBeVisible();
  const hormuz = await screenPoint(page, [56.8598, 26.2969]);
  await page.mouse.move(hormuz.x, hormuz.y);
  await expect(page.getByRole('tooltip')).toContainText('Strait of Hormuz');
  await page.mouse.click(hormuz.x, hormuz.y);
  await expect(page).toHaveURL(/sel=chokepoint\/hormuz/);
  await expect(page.getByRole('heading', { name: 'Strait of Hormuz' })).toBeVisible();
  await expect(page.getByLabel('Panel').getByText('20.7 mb/d')).toBeVisible();
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/hormuz.png` });
});

test('a basin link selects and shows its detail', async ({ page }) => {
  await page.goto('/?sel=basin/usgs-1174');
  await expect(page.getByRole('heading', { name: 'West Siberian Basin' })).toBeVisible();
  await expect(page.getByText('Priority province')).toBeVisible();
  // No camera in the link, so the map frames the basin and writes the camera back.
  await expect(page).toHaveURL(/at=/);
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/basin.png` });
});

test('the layer control toggles layers and L hides it', async ({ page }) => {
  await page.goto('/');
  const chokepoints = page.getByRole('checkbox', { name: /Chokepoints/ });
  await expect(chokepoints).toBeChecked();
  await chokepoints.uncheck();
  await expect(chokepoints).not.toBeChecked();
  await chokepoints.blur();
  await page.keyboard.press('l');
  await expect(chokepoints).toBeHidden();
});

test('clicking a pipeline selects it and shows its detail', async ({ page, request }) => {
  const pipelines = (await (await request.get('/data/pipelines.json')).json()) as {
    id: string;
    name: string;
    geometry: { type: string; coordinates: number[][] | number[][][] };
  }[];
  const turkstream = pipelines.find((p) => p.name === 'TurkStream Gas Pipeline · 1')!;
  const coords = (
    turkstream.geometry.type === 'LineString' ? turkstream.geometry.coordinates : turkstream.geometry.coordinates.flat()
  ) as [number, number][];
  // The middle of the line is offshore in the Black Sea, away from other pipelines.
  const middle = coords[Math.floor(coords.length / 2)]!;

  await page.goto(`/?at=${middle[0]},${middle[1]},6`);
  await expect(page.getByText('Pipelines').first()).toBeVisible();
  const point = await screenPoint(page, middle);
  await page.waitForTimeout(500);
  await page.mouse.click(point.x, point.y);
  // TurkStream's two strings run side by side offshore, so either may be picked.
  await expect(page).toHaveURL(/sel=pipeline\/gem-p\d+/);
  await expect(page.getByRole('heading', { name: /^TurkStream Gas Pipeline · [12]$/ })).toBeVisible();
  await expect(page.getByLabel('Panel').getByText('RU → TR')).toBeVisible();
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/pipeline.png` });
});

test('the panel shows data age, and flags stale or failed datasets', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByLabel('Panel');
  const transits = panel.getByRole('row', { name: /Chokepoint transits/ });
  await expect(transits).toBeVisible();
  await expect(transits).toContainText(/ago|just now/);
  await expect(transits).toContainText(/\d{4}-\d{2}-\d{2}/);
  await expect(panel.getByText(/^Updated .* UTC$/)).toBeVisible();

  // Serve a meta file whose last good fetch is two days old and whose latest run failed.
  await page.route('**/data/meta/chokepoint-transits.json', async (route) => {
    const real = await (await route.fetch()).json();
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await route.fulfill({
      json: { ...real, fetchedAt: old, lastAttempt: { at: new Date().toISOString(), ok: false, error: 'test' } },
    });
  });
  await page.reload();
  await expect(panel.getByRole('row', { name: /Chokepoint transits/ })).toContainText('stale');
  await expect(panel.getByRole('row', { name: /Chokepoint transits/ })).toContainText('fetch failed');
  await expect(panel.getByText('check data freshness')).toBeVisible();
});
