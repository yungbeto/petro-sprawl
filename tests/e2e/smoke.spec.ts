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
  await expect(page.getByRole('tooltip')).toContainText('of five-year average');
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/hormuz.png` });
});

test('a basin link selects and shows its detail', async ({ page }) => {
  await page.goto('/?sel=basin/usgs-1174');
  await expect(page.getByRole('heading', { name: 'West Siberian Basin' })).toBeVisible();
  await expect(page.getByText('Priority province')).toBeVisible();
  const panel = page.getByLabel('Panel');
  await expect(panel.locator('dt', { hasText: 'Countries' }).locator('xpath=following-sibling::dd[1]')).toHaveText('Russia');
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
  const turkstream = pipelines.find((p) => p.id === 'turkstream')!;
  const coords = (
    turkstream.geometry.type === 'LineString' ? turkstream.geometry.coordinates : turkstream.geometry.coordinates[0]
  ) as [number, number][];
  // The middle of the line is offshore in the Black Sea, away from other pipelines.
  const middle = coords[Math.floor(coords.length / 2)]!;

  await page.goto(`/?at=${middle[0]},${middle[1]},6`);
  await expect(page.getByText('Pipelines').first()).toBeVisible();
  const point = await screenPoint(page, middle);
  await page.waitForTimeout(500);
  await page.mouse.click(point.x, point.y);
  // GEM's two strings are merged into the curated TurkStream record.
  await expect(page).toHaveURL(/sel=pipeline\/turkstream/);
  await expect(page.getByRole('heading', { name: 'TurkStream' })).toBeVisible();
  const panel = page.getByLabel('Panel');
  await expect(panel.getByText('RU → TR')).toBeVisible();
  await expect(panel.locator('dt', { hasText: 'Measured flow' }).locator('xpath=following-sibling::dd[1]')).toContainText('GWh/d');
  await expect(panel.getByRole('img', { name: /Daily physical gas flow for TurkStream/ })).toBeVisible();
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
  await expect(panel.getByText('some data stale')).toBeVisible();
});

for (const id of ['hormuz', 'malacca', 'suez', 'babelm', 'danish', 'turkish', 'panama']) {
  test(`chokepoint ${id} shows its flow index and a 90-day sparkline`, async ({ page }) => {
    await page.goto(`/?sel=chokepoint/${id}`);
    const panel = page.getByLabel('Panel');
    await expect(panel.locator('.flow-headline__figure')).toHaveText(/^(<1|\d+)%$/);
    await expect(panel.getByText(/^(Below|Near|Above) baseline$/)).toBeVisible();
    await expect(panel.locator('dt', { hasText: 'Trailing year' })).toBeVisible();
    await expect(panel.getByRole('img', { name: /Daily tanker transits/ })).toBeVisible();
    const points = await panel.locator('.sparkline__line').getAttribute('d');
    expect(points?.split('L').length).toBeGreaterThanOrEqual(80);
  });
}

test('Hormuz lists its sourced disruption', async ({ page }) => {
  await page.goto('/?sel=chokepoint/hormuz');
  const panel = page.getByLabel('Panel');
  await expect(panel.getByRole('heading', { name: 'Disruptions' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'News On AIR (All India Radio)' })).toBeVisible();
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/hormuz-flow.png` });
});

test('Nord Stream 1 shows offline with its cited evidence and the sabotage', async ({ page }) => {
  await page.goto('/?sel=pipeline/nord-stream-1');
  const panel = page.getByLabel('Panel');
  const status = panel.locator('dt', { hasText: 'Status' }).locator('xpath=following-sibling::dd[1]');
  await expect(status).toContainText('Offline');
  await expect(status.getByRole('link', { name: /Hamburg sabotage trial/ })).toHaveAttribute('href', /aljazeera\.com/);
  await expect(status).toContainText('2026-10-14');
  await expect(panel.getByText(/2022-09-26, ongoing · sabotage/)).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Status history' })).toBeVisible();
});

test('Ukraine transit shows no measured flow beside the January 2025 claim', async ({ page }) => {
  await page.goto('/?sel=pipeline/urengoy-pomary-uzhhorod');
  const status = page.getByLabel('Panel').locator('dt', { hasText: 'Status' }).locator('xpath=following-sibling::dd[1]');
  await expect(status).toContainText('Idle');
  await expect(status).toContainText('Velké Kapušany');
  await expect(status).toContainText('Latest claim, offline');
  await expect(status).toContainText('2025-01-01');
});

test('a dated claim older than 30 days is marked unverified', async ({ page }) => {
  await page.goto('/?sel=pipeline/druzhba-south');
  await expect(page.getByLabel('Panel').getByText(/unverified since/)).toBeVisible();
});

test('storage fills a country and opens its detail', async ({ page }) => {
  // Test-only series: storage needs an AGSI+ key, so the smoke test serves its own file.
  const days = Array.from({ length: 400 }, (_, i) =>
    new Date(Date.parse('2026-10-27T00:00:00Z') - (399 - i) * 86_400_000).toISOString().slice(0, 10),
  );
  const series = [
    {
      id: 'agsi-de',
      metric: 'storage_fill_pct',
      unit: '%',
      label: 'Germany',
      points: days.map((date, i) => ({ date, value: 40 + (i % 100) / 2 })),
    },
  ];
  await page.route('**/data/gas-storage.json', (route) => route.fulfill({ json: series }));
  await page.goto('/?sel=storage/de');
  await expect(page.getByRole('heading', { name: 'Germany' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /EU gas storage/ })).toBeChecked();
  const panel = page.getByLabel('Panel');
  await expect(panel.locator('dt', { hasText: 'Same date last year' })).toBeVisible();
  await expect(panel.getByRole('img', { name: /Gas storage fill in Germany/ })).toBeVisible();
});

test('the summary counts the theater and every row opens its asset', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByLabel('Panel');
  const glance = panel.locator('.glance');
  await expect(glance.locator('dt', { hasText: 'Pipelines' }).locator('xpath=following-sibling::dd[1]')).toContainText('Operating');
  await expect(glance).toContainText(/\d of 7 away from their five-year baseline/);
  await expect(glance).toContainText(/\d+ of \d+ countries below the same date last year|No storage data/);

  await panel.getByRole('button', { name: 'Strait of Hormuz' }).click();
  await expect(page).toHaveURL(/sel=chokepoint\/hormuz/);
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Nord Stream 1' }).click();
  await expect(page).toHaveURL(/sel=pipeline\/nord-stream-1/);
  await expect(page.getByRole('heading', { name: 'Nord Stream 1' })).toBeVisible();
  if (SHOTS) await page.goto('/'), await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/summary.png` });
});

test('search finds assets by name or alias and opens them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chokepoints' })).toBeVisible();
  await page.keyboard.press('/');
  const search = page.getByRole('combobox', { name: 'Search' });
  await expect(search).toBeFocused();
  await search.fill('bratstvo');
  await expect(page.getByRole('option').first()).toContainText('Urengoy');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sel=pipeline\/urengoy-pomary-uzhhorod/);
  await expect(search).toHaveValue('');

  // A country opens its storage and turns the storage layer on.
  await search.fill('germ');
  await page.getByRole('option', { name: /^Germany/ }).click();
  await expect(page).toHaveURL(/sel=storage\/de/);
  await expect(page.getByRole('checkbox', { name: /EU gas storage/ })).toBeChecked();

  // First Esc clears the query, the next leaves the box.
  await search.fill('zzzz');
  await expect(page.getByText('No matches')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).not.toBeFocused();
});

test('what changed since last visit lists changes that link to their asset', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/First visit on this browser/)).toBeVisible();
  // Pretend the last visit, two days ago, saw TurkStream offline and German storage at 10%.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('et.visits')!);
    const current = raw.current;
    current.savedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    current.pipelines.turkstream = 'offline';
    if ('de' in current.storage) current.storage.de = 10;
    localStorage.setItem('et.visits', JSON.stringify({ previous: null, current }));
  });
  await page.reload();
  const changes = page.locator('.changes');
  const turkstream = changes.getByRole('button', { name: /TurkStream/ });
  await expect(turkstream).toContainText('Status offline → operating');
  // A reload within the same visit keeps the comparison.
  await page.reload();
  await expect(turkstream).toBeVisible();
  await turkstream.click();
  await expect(page).toHaveURL(/sel=pipeline\/turkstream/);
});

test('a dataset that fails to load is named, and the rest still shows', async ({ page }) => {
  await page.route('**/data/pipelines.json', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText("Couldn't load pipelines");
  await expect(page.getByRole('heading', { name: 'Chokepoints' })).toBeVisible();
});

test('every source is attributed on the map and in the panel', async ({ page }) => {
  await page.goto('/');
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  for (const name of ['Global Energy Monitor', 'USGS', 'IMF PortWatch', 'EIA', 'ENTSOG', 'GIE AGSI+', 'Natural Earth', 'OpenStreetMap']) {
    await expect(attribution).toContainText(name, { timeout: 15_000 });
  }
  const sources = page.getByLabel('Panel').locator('.sources');
  for (const name of ['USGS', 'IMF PortWatch', 'Natural Earth', 'ENTSOG Transparency Platform', 'GIE AGSI+', 'Global Energy Monitor', 'OpenStreetMap contributors']) {
    await expect(sources.getByRole('link', { name, exact: true })).toBeVisible();
  }
});

test('the summary is ready within two seconds on a warm cache', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chokepoints' })).toBeVisible();
  const start = Date.now();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chokepoints' })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(2000);
});
