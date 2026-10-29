import { expect, test } from '@playwright/test';

const SHOTS = process.env.SCREENSHOT_DIR;

test('shows the theater map with the panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('search')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  // Attribution appears once the basemap style has loaded.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap', { timeout: 15_000 });
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/light.png` });
});

test('the panel minimizes to a floating search and reopens on a selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await expect(page.getByLabel('Panel', { exact: true })).toBeHidden();
  const search = page.getByRole('combobox', { name: 'Search' });
  await expect(search).toBeVisible();
  expect((await page.locator('.map').boundingBox())?.x).toBe(0);

  // / focuses the floating search; picking a result opens the panel on its detail.
  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  await search.fill('turkstream');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'TurkStream' })).toBeVisible();

  await page.keyboard.press('[');
  await expect(page.getByLabel('Panel', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await expect(page.getByRole('button', { name: 'Collapse panel' })).toBeVisible();

  // A new visit always opens on the summary.
  await page.keyboard.press('[');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
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
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();

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
  // Related pipelines are counted, with a few rows showing and the rest behind Show all.
  const related = panel.getByRole('region', { name: /Pipelines crossing it/ });
  const total = Number((await related.locator('.section__count').textContent())!.replace(/,/g, ''));
  expect(total).toBeGreaterThan(6);
  await expect(related.getByRole('listitem')).toHaveCount(6);
  await related.getByRole('button', { name: `Show all ${total.toLocaleString('en-US')}` }).click();
  await expect(related.getByRole('listitem')).toHaveCount(Math.min(total, 300));
  // No camera in the link, so the map frames the basin and writes the camera back.
  await expect(page).toHaveURL(/at=/);
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/basin.png` });
});

test('an LNG terminal link shows its units, and search and the layer list know the layer', async ({ page }) => {
  await page.goto('/?sel=lng/gem-t100000130594-export');
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(panel.getByRole('heading', { name: 'QatarEnergy LNG (N)' })).toBeVisible();
  await expect(panel.getByText('LNG export terminal')).toBeVisible();
  await expect(panel.locator('dt', { hasText: 'Operating' }).locator('xpath=following-sibling::dd[1]')).toContainText('40.8 mtpa');
  // Cited reports set the status over GEM's; GEM's own claim stays in the history.
  const status = panel.locator('dt', { hasText: 'Status' }).locator('xpath=following-sibling::dd[1]');
  await expect(status).toContainText('Reduced');
  await expect(status.getByRole('link', { name: /restored LNG exports in September/ })).toHaveAttribute('href', /semafor\.com/);
  await expect(panel.getByRole('heading', { name: 'Disruptions' })).toBeVisible();
  await expect(panel.getByText(/Global Energy Monitor's, as of/)).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Units' })).toBeVisible();
  await expect(panel.getByRole('table').getByRole('row')).toHaveCount(5);

  await page.goto('/');
  const search = page.getByRole('combobox');
  await search.fill('wilhelmshaven');
  await page.getByRole('option', { name: /Wilhelmshaven FSRU/ }).click();
  await expect(page).toHaveURL(/sel=lng%2Fgem-t100000130458-import|sel=lng\/gem-t100000130458-import/);
  await expect(page.getByText('LNG import terminal · floating')).toBeVisible();

  await openLayers(page);
  await expect(page.getByRole('checkbox', { name: /LNG terminals/ })).toBeChecked();
});

test('an EU import terminal takes its status from measured send-out, with a chart and the GEM claim beside it', async ({ page }) => {
  await page.goto('/?sel=lng/gem-t100000130492-import');
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(panel.getByRole('heading', { name: 'Gate LNG Terminal' })).toBeVisible();
  const status = panel.locator('dt', { hasText: 'Status' }).locator('xpath=following-sibling::dd[1]');
  await expect(status).toContainText('Operating');
  await expect(status.getByRole('link', { name: /of declared send-out capacity \(GIE ALSI\)/ })).toHaveAttribute('href', /alsi\.gie\.eu/);
  await expect(status).toContainText('Latest claim, operating');
  await expect(panel.locator('dt', { hasText: 'Send-out' }).locator('xpath=following-sibling::dd[1]')).toContainText('GWh/d');
  await expect(panel.getByRole('heading', { name: 'Daily send-out, last 90 days' })).toBeVisible();
  await expect(panel.getByText('The status above comes from measured send-out.')).toBeVisible();
  await expect(panel.locator('.source').getByRole('link', { name: 'GIE ALSI' })).toBeVisible();
});

test('the layers button opens the list; L, Esc and an outside click close it', async ({ page }) => {
  await page.goto('/');
  const chokepoints = page.getByRole('checkbox', { name: /Chokepoints/ });
  await expect(chokepoints).toBeHidden();
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(chokepoints).toBeChecked();
  await chokepoints.uncheck();
  await expect(chokepoints).not.toBeChecked();
  await chokepoints.blur();
  await page.keyboard.press('l');
  await expect(chokepoints).toBeHidden();
  await page.keyboard.press('l');
  await expect(chokepoints).toBeVisible();
  // Esc closes the list without leaving the current view.
  await page.keyboard.press('Escape');
  await expect(chokepoints).toBeHidden();
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('region', { name: 'Overview' }).click({ position: { x: 2, y: 2 } });
  await expect(chokepoints).toBeHidden();
});

/** Layer checkboxes live in a list that opens from the Layers button. */
async function openLayers(page: import('@playwright/test').Page) {
  const button = page.getByRole('button', { name: 'Layers' });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

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
  // A few pixels off the line still picks it.
  await page.mouse.click(point.x, point.y + 5);
  // GEM's two strings are merged into the curated TurkStream record.
  await expect(page).toHaveURL(/sel=pipeline\/turkstream/);
  await expect(page.getByRole('heading', { name: 'TurkStream' })).toBeVisible();
  const panel = page.getByLabel('Panel');
  await expect(panel.getByText('RU → TR')).toBeVisible();
  await expect(panel.locator('dt', { hasText: 'Measured flow' }).locator('xpath=following-sibling::dd[1]')).toContainText('GWh/d');
  await expect(panel.getByRole('img', { name: /Daily physical gas flow for TurkStream/ })).toBeVisible();
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/pipeline.png` });
});

test('data age shows in the footer, and the menu flags stale or failed datasets', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByLabel('Panel', { exact: true });
  const footer = panel.getByRole('button', { name: /^Updated .* UTC/ });
  await expect(footer).toBeVisible();
  // The footer line opens the menu at the freshness table.
  await footer.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  const transits = menu.getByRole('row', { name: /Chokepoint transits/ });
  await expect(transits).toBeVisible();
  await expect(transits).toContainText(/ago|just now/);
  await expect(transits).toContainText(/\d{4}-\d{2}-\d{2}/);

  // Serve a meta file whose last good fetch is two days old and whose latest run failed.
  await page.route('**/data/meta/chokepoint-transits.json', async (route) => {
    const real = await (await route.fetch()).json();
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await route.fulfill({
      json: { ...real, fetchedAt: old, lastAttempt: { at: new Date().toISOString(), ok: false, error: 'test' } },
    });
  });
  await page.reload();
  await expect(panel.getByText('some data stale')).toBeVisible();
  await panel.getByRole('button', { name: /^Updated/ }).click();
  await expect(menu.getByRole('row', { name: /Chokepoint transits/ })).toContainText('stale');
  await expect(menu.getByRole('row', { name: /Chokepoint transits/ })).toContainText('fetch failed');
});

test('the menu holds app settings, closes on Esc, and returns focus', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const menuButton = page.getByRole('button', { name: 'Menu' });
  await menuButton.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  await menu.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 19, 21)');
  // Shortcuts wait while the menu is open: Esc closes it rather than going back.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
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

test('a pipeline shows its age, size and owners, with GEM gaps and cited owners called out', async ({ page }) => {
  await page.goto('/?sel=pipeline/btc');
  const panel = page.getByLabel('Panel');
  const fact = (label: string) => panel.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
  await expect(fact('In service since')).toContainText('2006');
  await expect(fact('In service since')).toContainText('20 years');
  await expect(fact('Runs from')).toHaveText('Sangachal Terminal to Ceyhan');
  await expect(fact('Length')).toContainText('1,768 km');
  await expect(fact('Parent companies')).toContainText('BP PLC');
  await expect(fact('Parent companies')).toContainText('Listed shares cover 89.2%');

  await page.goto('/?sel=pipeline/cpc');
  await expect(fact('Owners')).toContainText('IC CPC Company');
  await expect(fact('Owners').getByRole('link', { name: 'CPC', exact: true })).toHaveAttribute('href', /cpc\.ru/);
  await expect(panel.locator('dt', { hasText: 'Parent companies' })).toHaveCount(0);
});

test('a section of a split pipeline lists the other sections, which open', async ({ page }) => {
  await page.goto('/?sel=pipeline/arab-gas-jordan-syria');
  const panel = page.getByLabel('Panel');
  const sections = panel.getByRole('region', { name: /Other sections of Arab Gas Pipeline/ });
  await expect(sections).toContainText('Homs-Deir Ammar');
  await sections.getByRole('button', { name: /Egypt–Jordan/ }).click();
  await expect(page).toHaveURL(/sel=pipeline\/arab-gas-egypt-jordan/);
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('Egypt–Jordan');
});

test('a dated claim older than 30 days is marked unverified', async ({ page }) => {
  // Soyuz's only claim is from 2022 and describes a lasting stop, so it stays old.
  await page.goto('/?sel=pipeline/soyuz');
  await expect(page.getByLabel('Panel').getByText(/unverified since/i)).toBeVisible();
});

test('a pipeline ending at a reported port shows its tanker calls', async ({ page }) => {
  await page.goto('/?sel=pipeline/habshan-fujairah');
  const panel = page.getByLabel('Panel');
  await expect(panel.getByRole('heading', { name: 'Tanker calls at Fujairah, last 90 days' })).toBeVisible();
  await expect(panel.getByText(/not flow on this pipeline/)).toBeVisible();
});

test('an oil terminal opens with its claim, disruptions and route to sea', async ({ page }) => {
  await page.goto('/?sel=terminal/kharg');
  const panel = page.getByLabel('Panel');
  await expect(panel.getByRole('heading', { name: 'Kharg Island' })).toBeVisible();
  await expect(panel.getByText('Oil export terminal')).toBeVisible();
  await expect(panel.getByText(/resumed crude loading at Kharg Island/).first()).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Disruptions' })).toBeVisible();
  await panel.getByRole('button', { name: /Strait of Hormuz/ }).click();
  await expect(page).toHaveURL(/sel=chokepoint\/hormuz/);
  await expect(panel.getByRole('heading', { name: /Oil terminals that ship through it/ })).toBeVisible();
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
  await openLayers(page);
  await expect(page.getByRole('checkbox', { name: /EU gas storage/ })).toBeChecked();
  const panel = page.getByLabel('Panel');
  await expect(panel.locator('dt', { hasText: 'Same date last year' })).toBeVisible();
  await expect(panel.getByRole('img', { name: /Gas storage fill in Germany/ })).toBeVisible();
});

test('the dashboard tiles count the theater and open what they count', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByLabel('Panel', { exact: true });
  const overview = page.getByRole('region', { name: 'Overview' });
  const chokepoints = overview.getByRole('button', { name: /^Chokepoints/ });
  await expect(chokepoints).toContainText(/of 7 below baseline/);
  await expect(overview.getByRole('button', { name: /^Pipelines/ })).toContainText(/of [\d,]+ offline or idle/);
  await expect(overview.getByRole('button', { name: /^EU gas storage/ })).toContainText(/of \d+ below last year|No storage data/);
  await expect(overview.getByRole('button', { name: /^Since last visit/ })).toContainText('First visit on this browser');

  // A tile opens its filter; the storage tile turns the storage layer on.
  await chokepoints.click();
  await expect(page).toHaveURL(/f=below-baseline/);
  await page.keyboard.press('Escape');
  await overview.getByRole('button', { name: /^EU gas storage/ }).click();
  await openLayers(page);
  await expect(page.getByRole('checkbox', { name: /EU gas storage/ })).toBeChecked();

  await panel.getByRole('button', { name: 'Strait of Hormuz', exact: true }).click();
  await expect(page).toHaveURL(/sel=chokepoint\/hormuz/);
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Nord Stream 1', exact: true }).click();
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
  // The bar now titles what's open.
  await expect(search).toHaveValue('Urengoy–Pomary–Uzhhorod (Brotherhood)');

  // A country opens its storage and turns the storage layer on.
  await search.fill('germ');
  await page.getByRole('option', { name: /^Germany/ }).click();
  await expect(page).toHaveURL(/sel=storage\/de/);
  await openLayers(page);
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
  await expect(page.locator('#summary-changes').getByText(/First visit on this browser/)).toBeVisible();
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

test('the map credits the basemap, and the About page credits every source', async ({ page }) => {
  await page.goto('/');
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect(attribution).toContainText('OpenStreetMap', { timeout: 15_000 });
  await expect(attribution).not.toContainText('Global Energy Monitor');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: /^About/ }).click();
  const about = page.getByRole('dialog', { name: 'About' });
  await expect(about.getByRole('button', { name: 'Back to menu' })).toBeFocused();
  const sources = about.locator('.sources');
  for (const name of ['USGS', 'IMF PortWatch', 'Natural Earth', 'ENTSOG Transparency Platform', 'GIE AGSI+', 'GIE ALSI', 'Global Energy Monitor', 'OpenStreetMap contributors']) {
    await expect(sources.getByRole('link', { name, exact: true }).first()).toBeVisible();
  }
  // One row per dataset: GEM is credited for both pipelines and LNG terminals.
  await expect(sources.getByRole('listitem').filter({ hasText: /^LNG terminals:/ })).toContainText('Global Energy Monitor');
  await about.getByRole('button', { name: 'Back to menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: /^About/ })).toBeFocused();
});

test('the summary is ready within two seconds on a warm cache', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chokepoints' })).toBeVisible();
  const start = Date.now();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chokepoints' })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(2000);
});

test('a filter chip lists its matches, lives in the URL, and Esc clears it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  const chip = page.getByRole('toolbar', { name: 'Filters' }).getByRole('button', { name: /Offline or idle/ });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/f=offline/);
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(panel.getByRole('heading', { name: 'Offline or idle' })).toBeVisible();

  // A match opens its detail; back returns to the list, then to the summary.
  await panel.getByRole('button', { name: /Nord Stream 1/ }).click();
  await expect(page).toHaveURL(/sel=pipeline\/nord-stream-1/);
  await expect(page).toHaveURL(/f=offline/);
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('heading', { name: 'Offline or idle' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/f=/);
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();

  // A shared link opens straight onto the list.
  await page.goto('/?f=below-baseline');
  await expect(panel.getByRole('heading', { name: 'Below baseline' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Strait of Hormuz/ })).toBeVisible();
  await page.getByRole('search').getByRole('button', { name: 'Close' }).click();
  await expect(page).not.toHaveURL(/f=/);
});

test('the search bar titles what is open, and its × closes back to the previous view', async ({ page }) => {
  await page.goto('/?f=offline');
  const search = page.getByRole('combobox', { name: 'Search' });
  const bar = page.getByRole('search');
  await expect(search).toHaveValue('Offline or idle');

  const panel = page.getByLabel('Panel', { exact: true });
  await panel.getByRole('button', { name: /Nord Stream 1/ }).click();
  await expect(search).toHaveValue('Nord Stream 1');
  await expect(panel.getByRole('button', { name: 'Back' })).toHaveCount(0);

  // Typing swaps the × to clearing; leaving the bar puts the title back.
  await search.click();
  await page.keyboard.type('turk');
  await expect(bar.getByRole('button', { name: 'Clear search' })).toBeVisible();
  await bar.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await search.blur();
  await expect(search).toHaveValue('Nord Stream 1');

  // Close steps back: detail to the filter list, then to the summary.
  await bar.getByRole('button', { name: 'Close' }).click();
  await expect(page).not.toHaveURL(/sel=/);
  await expect(search).toHaveValue('Offline or idle');
  await bar.getByRole('button', { name: 'Close' }).click();
  await expect(page).not.toHaveURL(/f=/);
  await expect(search).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
});
