import { expect, test } from '@playwright/test';
import { FEATURES, HOME_HERO } from '../../src/lib/config';

const SHOTS = process.env.SCREENSHOT_DIR;

test('shows the theater map with the panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('search')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  // Attribution appears once the basemap style has loaded.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap', { timeout: 15_000 });
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/light.png` });
});

test('the panel minimizes, leaving the header search, and reopens on a selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await expect(page.getByLabel('Panel', { exact: true })).toBeHidden();
  await expect(page.getByRole('search')).toBeVisible();
  // The map takes the panel's place, up to the rail.
  const rail = await page.getByRole('navigation', { name: 'Views' }).boundingBox();
  expect((await page.locator('.map').boundingBox())!.x).toBeLessThan(rail!.x + rail!.width + 16);

  // / opens search; picking a result opens the panel on its detail.
  await page.keyboard.press('/');
  const search = page.getByRole('dialog', { name: 'Search' }).getByRole('combobox', { name: 'Search' });
  await expect(search).toBeFocused();
  await search.fill('turkstream');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'TurkStream' })).toBeVisible();

  await page.keyboard.press('[');
  await expect(page.getByLabel('Panel', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await expect(page.getByRole('button', { name: 'Collapse panel' })).toBeVisible();

  // The rail's Home button reopens the panel on the summary from anywhere.
  await page.keyboard.press('[');
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(page).not.toHaveURL(/sel=/);

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
  await expect(page.getByRole('heading', { name: 'Nord Stream 1', exact: true })).toBeVisible();
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
  // USGS volumes as assessed in 2000: West Siberia's oil, in billion barrels.
  const oil = panel.getByRole('row', { name: /^Oil, billion barrels/ });
  await expect(oil.getByRole('cell')).toHaveText(['Oil, billion barrels', '46.5', '93.4', '55.2']);
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
  await expect(status).toContainText('Press report from Semafor, citing Bloomberg');
  // Each report is an item of its own under Reports, with a link out; GEM's claim is among them.
  const reports = panel.getByRole('region', { name: /^Reports/ });
  const semafor = reports.getByRole('listitem').filter({ hasText: 'restored LNG exports in September' });
  await expect(semafor.getByRole('link', { name: 'Read on semafor.com' })).toHaveAttribute('href', /semafor\.com/);
  await expect(reports).toContainText('Global Energy Monitor');
  await expect(panel.getByRole('heading', { name: 'Disruptions' })).toBeVisible();
  await panel.getByRole('button', { name: 'About the units' }).click();
  await expect(page.getByRole('note', { name: 'About the units' })).toContainText("Global Energy Monitor's, as of");
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('heading', { name: 'Units' })).toBeVisible();
  await expect(panel.getByRole('table').getByRole('row')).toHaveCount(5);

  await page.goto('/');
  const search = await openSearch(page);
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
  await panel.getByRole('button', { name: 'About the units' }).click();
  await expect(page.getByRole('note', { name: 'About the units' })).toContainText('The status above comes from measured send-out.');
  await page.keyboard.press('Escape');
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
/** Opens the search dialog from the header and returns its box. */
async function openSearch(page: import('@playwright/test').Page) {
  await page.getByRole('search').getByRole('button', { name: /^Search/ }).click();
  return page.getByRole('dialog', { name: 'Search' }).getByRole('combobox', { name: 'Search' });
}

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
  // The footer line opens the menu on its Data tab.
  await footer.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');
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
  // It opens on About, under the hero; the arrow keys move along the tabs.
  await expect(menu.getByRole('heading', { name: 'The sprawling empire of the petro-state' })).toBeVisible();
  await expect(menu.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
  await menu.getByRole('tab', { name: 'About' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(menu.getByRole('tab', { name: 'Settings' })).toBeFocused();
  await expect(menu.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  // The footer names who to write to and who made it.
  await expect(menu.getByRole('link', { name: 'hello@petrosprawl.fyi' })).toHaveAttribute('href', 'mailto:hello@petrosprawl.fyi');
  await expect(menu.getByRole('link', { name: 'Roby Saavedra' })).toHaveAttribute('href', 'https://robysaavedra.com');
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
    // The cargo chart has its own band; this is the headline's.
    await expect(panel.locator('.flow-headline').getByText(/^(Below|Near|Above) baseline$/)).toBeVisible();
    await expect(panel.locator('dt', { hasText: 'Trailing year' })).toBeVisible();
    await expect(panel.getByRole('img', { name: /Daily tanker transits/ })).toBeVisible();
    const points = await panel.getByRole('img', { name: /Daily tanker transits/ }).locator('.sparkline__line').getAttribute('d');
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
  await expect(status).toContainText('2026-10-14');
  await expect(panel.getByText(/2022-09-26, ongoing · sabotage/)).toBeVisible();
  const report = panel.getByRole('region', { name: /^Reports/ }).getByRole('listitem').filter({ hasText: /Hamburg sabotage trial/ });
  await expect(report.getByRole('link', { name: /^Read on / })).toHaveAttribute('href', /aljazeera\.com/);
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
  // Parents link to their home pages where GEM's ownership tracker gives one, and to GEM's page for the line.
  await expect(fact('Parent companies').getByRole('link', { name: 'BP PLC' })).toHaveAttribute('href', 'https://www.bp.com/');
  await expect(fact('Parent companies').getByRole('link', { name: 'Azerbaijan (BTC) Ltd' })).toHaveCount(0);
  await expect(fact('Parent companies').getByRole('link', { name: 'Global Energy Monitor' })).toHaveAttribute('href', /gem\.wiki\/Baku-Tbilisi-Ceyhan/);

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
  await panel.getByRole('button', { name: 'About tanker calls at Fujairah' }).click();
  await expect(page.getByRole('note', { name: 'About tanker calls at Fujairah' })).toContainText('not flow on this pipeline');
  await page.keyboard.press('Escape');
  await expect(panel.getByText(/Estimated exports by tanker: [\d,.]+ (million )?t per day/)).toBeVisible();
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
  test.skip(!FEATURES.gasStorage, 'FEATURES.gasStorage is off');
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
  // An old link from before M10, when a country page was storage/<code>, still opens it.
  await page.goto('/?sel=storage/de');
  await expect(page.getByRole('heading', { name: 'Germany' })).toBeVisible();
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(panel.locator('dt', { hasText: 'Same date last year' })).toBeVisible();
  await expect(panel.getByRole('img', { name: /Gas storage fill in Germany/ })).toBeVisible();
  await expect(panel).toContainText('GIE AGSI+');

  // Outside AGSI+, a country shows gas in storage from its own source, with that source's attribution.
  await page.goto('/?sel=country/ca');
  await expect(page.getByRole('heading', { name: 'Canada' })).toBeVisible();
  await expect(panel.locator('dt', { hasText: 'Same month last year' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'By province' })).toContainText('Alberta');
  await expect(panel).toContainText('This does not constitute an endorsement by Statistics Canada of this product.');
  // A country with storage but no regular series says so.
  await page.goto('/?sel=country/cn');
  await expect(panel).toContainText('No regular series');
});

test('the dashboard tiles count the theater and open what they count', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByLabel('Panel', { exact: true });
  const overview = page.getByRole('region', { name: 'Overview' });
  const chokepoints = overview.getByRole('button', { name: /^Chokepoints/ });
  await expect(chokepoints).toContainText(/of 7 below baseline/);
  await expect(overview.getByRole('button', { name: /^Pipelines/ })).toContainText(/of [\d,]+ offline or idle/);
  if (FEATURES.gasStorage) {
    await expect(overview.getByRole('button', { name: /^Gas storage/ })).toContainText(/of \d+ countries below last year|No storage data/);
  } else {
    // Basins take the storage figure's place while storage is switched off.
    await expect(overview.getByRole('button', { name: /^Gas storage/ })).toHaveCount(0);
    await expect(overview.getByRole('button', { name: /^Basins/ })).toContainText(/\d+\s*oil and gas provinces/);
  }
  await expect(overview.getByRole('button', { name: /^Terminals/ })).toContainText(/of [\d,]+ offline or idle/);
  const hero = page.getByRole('region', { name: 'Situation' });
  if (FEATURES.visitChanges) await expect(hero).toContainText('First visit on this browser');

  // A figure opens its surface; the storage figure turns the storage layer on.
  const rail = page.getByRole('navigation', { name: 'Views' });
  await chokepoints.click();
  await expect(page).toHaveURL(/view=chokepoints/);
  await panel.getByRole('button', { name: /^Strait of Hormuz/ }).click();
  await expect(page).toHaveURL(/sel=chokepoint\/hormuz/);
  await rail.getByRole('button', { name: 'Home' }).click();
  await overview.getByRole('button', { name: /^Pipelines/ }).click();
  await expect(page).toHaveURL(/view=pipelines/);
  await expect(rail.getByRole('button', { name: 'Pipelines' })).toHaveAttribute('aria-current', 'page');
  // Grouped by region: researched lines come first, so Nord Stream 1 is in the opened group's list.
  await panel.getByRole('button', { name: /^Europe and Central Asia/ }).click();
  await panel.getByRole('list', { name: 'Europe and Central Asia' }).getByRole('button', { name: /^Nord Stream 1/ }).first().click();
  // The camera can write `at` between the two, so each is checked on its own.
  await expect(page).toHaveURL(/view=pipelines(&|$)/);
  await expect(page).toHaveURL(/sel=pipeline\/nord-stream-1/);
  await expect(page.getByRole('heading', { name: 'Nord Stream 1' })).toBeVisible();
  await rail.getByRole('button', { name: 'Home' }).click();
  if (FEATURES.gasStorage) {
    await overview.getByRole('button', { name: /^Gas storage/ }).click();
    await expect(page).toHaveURL(/view=storage/);
  } else {
    await overview.getByRole('button', { name: /^Basins/ }).click();
    await expect(page).toHaveURL(/view=basins/);
    await expect(rail.getByRole('button', { name: 'Basins' })).toHaveAttribute('aria-current', 'page');
  }
  if (SHOTS) await page.goto('/'), await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/summary.png` });
});

test('the home hero lists disruptions in effect, newest report first, and measured changes, and opens them', async ({ page }) => {
  await page.goto('/');
  const hero = page.getByRole('region', { name: 'Situation' });
  // What the site is, then a row of cards for the disruptions with the newest reports, each opening its asset.
  await expect(hero.getByRole('heading', { level: 2 })).toHaveText("What's happening");
  const latest = hero.getByRole('region', { name: /^Latest updates/ });
  const cards = latest.getByRole('article');
  await expect(cards).toHaveCount(HOME_HERO.cards);
  const first = cards.first();
  await expect(first).toContainText(/^(today|yesterday|\d+ days ago|\d{4}-\d{2})/);
  await expect(first.getByRole('link')).toHaveAttribute('href', /^https:/);
  // The next button steps the row along; the first card scrolls out of view and back.
  const row = latest.getByRole('list', { name: /^Latest updates/ });
  await latest.getByRole('button', { name: 'Next update' }).click();
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(latest.getByRole('button', { name: 'Previous update' })).toBeEnabled();
  await latest.getByRole('button', { name: 'Previous update' }).click();
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(0);
  await first.getByRole('heading', { level: 4 }).getByRole('button').click();
  await expect(page).toHaveURL(/sel=/);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Home' }).click();
  const rest = hero.getByRole('region', { name: /^Also in effect/ });
  const items = rest.getByRole('list').getByRole('button');
  await expect(items).toHaveCount(3);
  await rest.getByRole('button', { name: /^Show all \d+/ }).click();
  await expect(items.nth(3)).toBeVisible();
  await items.first().click();
  await expect(page).toHaveURL(/sel=/);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Home' }).click();
  // Measured changes say what moved and which meter says so, or that nothing passed a threshold.
  const measured = hero.getByRole('region', { name: /^Measured changes/ });
  await measured.getByRole('button', { name: 'About measured changes' }).click();
  await expect(page.getByRole('note', { name: 'About measured changes' })).toContainText('What moved, not why.');
  await page.keyboard.press('Escape');
  const changes = measured.getByRole('list').getByRole('button');
  if (!(await changes.count())) await expect(measured).toContainText('Nothing past its threshold');
  if (await changes.count()) {
    await expect(changes.first()).toContainText(/\((IMF PortWatch|ENTSOG|GIE ALSI)\)/);
    await changes.first().click();
    await expect(page).toHaveURL(/sel=(chokepoint|pipeline|lng)\//);
  }
  await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Where is my fuel from?' })).toHaveCount(0);
});

test('search finds assets by name or alias and opens them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Overview' }).getByRole('button', { name: /^Chokepoints/ })).toContainText(/below baseline/);
  await page.keyboard.press('/');
  let search = page.getByRole('dialog', { name: 'Search' }).getByRole('combobox', { name: 'Search' });
  await expect(search).toBeFocused();
  await search.fill('bratstvo');
  await expect(page.getByRole('option').first()).toContainText('Urengoy');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sel=pipeline\/urengoy-pomary-uzhhorod/);
  await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0);
  await expect(page.getByLabel('Panel', { exact: true }).getByRole('heading', { name: 'Urengoy–Pomary–Uzhhorod (Brotherhood)' })).toBeVisible();

  // A country opens its storage and turns the storage layer on; while storage is off, countries aren't found.
  search = await openSearch(page);
  await search.fill('germ');
  if (FEATURES.gasStorage) {
    await page.getByRole('option', { name: /^Germany/ }).click();
    await expect(page).toHaveURL(/sel=country\/de/);
    await expect(page.getByLabel('Panel', { exact: true }).getByRole('heading', { name: 'Germany' })).toBeVisible();
  } else {
    await expect(page.getByRole('option', { name: /^Germany/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }

  // Results come grouped by kind, and a scope narrows them.
  search = await openSearch(page);
  await search.fill('ras');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await expect(dialog.getByRole('group', { name: 'Oil terminals' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Pipelines' })).toBeVisible();
  // A long list scrolls; it never squeezes the box.
  await page.setViewportSize({ width: 1280, height: 600 });
  expect((await search.boundingBox())!.height).toBeGreaterThan(40);
  await dialog.getByRole('toolbar', { name: 'Search in' }).getByRole('button', { name: 'Terminals' }).click();
  await expect(dialog.getByRole('group', { name: 'Pipelines' })).toHaveCount(0);
  await expect(search).toBeFocused();

  // Esc closes in one press, even after a click moved focus off the box, and focus returns to the bar.
  await search.fill('zzzz');
  await expect(page.getByText('No matches')).toBeVisible();
  await dialog.getByText('No matches').click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('search').getByRole('button', { name: /^Search/ })).toBeFocused();

  // So does its close button.
  await openSearch(page);
  await dialog.getByRole('button', { name: 'Close search' }).click();
  await expect(dialog).toHaveCount(0);

  // ⌘K opens it too, and an empty box lists the views.
  await page.keyboard.press('ControlOrMeta+k');
  await dialog.getByRole('option', { name: /^Chokepoints/ }).click();
  await expect(page).toHaveURL(/view=chokepoints/);
});

test('with visit changes off, nothing is stored and Home leaves them out', async ({ page }) => {
  test.skip(FEATURES.visitChanges, 'FEATURES.visitChanges is on');
  // A snapshot an earlier version stored is removed.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('et.visits', '{"previous":null,"current":null}');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/');
  const hero = page.getByRole('region', { name: 'Situation' });
  await expect(hero).toContainText(/Latest updates/);
  await expect(hero).not.toContainText(/since your last visit|First visit/);
  await expect(page.locator('#summary-changes')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('et.visits'))).toBeNull();
});

test('what changed since last visit lists changes that link to their asset', async ({ page }) => {
  test.skip(!FEATURES.visitChanges, 'FEATURES.visitChanges is off');
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
  await expect(page.getByRole('region', { name: 'Overview' }).getByRole('button', { name: /^Chokepoints/ })).toContainText(/below baseline/);
});

test('the map credits the basemap, and the menu\'s Data tab credits every source', async ({ page }) => {
  await page.goto('/');
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect(attribution).toContainText('OpenStreetMap', { timeout: 15_000 });
  await expect(attribution).not.toContainText('Global Energy Monitor');
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await menu.getByRole('tab', { name: 'Data' }).click();
  const sources = menu.locator('.sources');
  for (const name of ['USGS', 'IMF PortWatch', 'Natural Earth', 'ENTSOG Transparency Platform', 'GIE AGSI+', 'GIE ALSI', 'Global Energy Monitor', 'OpenStreetMap contributors']) {
    await expect(sources.getByRole('link', { name, exact: true }).first()).toBeVisible();
  }
  // One row per dataset: GEM is credited for both pipelines and LNG terminals.
  await expect(sources.getByRole('listitem').filter({ hasText: /^LNG terminals:/ })).toContainText('Global Energy Monitor');
});

test('the summary is ready within two seconds on a warm cache', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Overview' }).getByRole('button', { name: /^Chokepoints/ })).toContainText(/below baseline/);
  const start = Date.now();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Overview' }).getByRole('button', { name: /^Chokepoints/ })).toContainText(/below baseline/);
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
  await panel.getByRole('button', { name: 'Close, back to Home' }).click();
  await expect(page).not.toHaveURL(/f=/);
});

test('the panel bar goes back to what an item was opened from, and closes to the surface', async ({ page }) => {
  await page.goto('/?f=offline');
  const panel = page.getByLabel('Panel', { exact: true });
  // Opened from a link: nothing to go back to, only close.
  await expect(panel.getByRole('button', { name: /^Back to/ })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Close, back to Home' })).toBeVisible();

  // An item opened from the list names the list.
  await panel.getByRole('button', { name: /Nord Stream 1/ }).click();
  await expect(panel.getByRole('button', { name: 'Back to Offline or idle' })).toBeVisible();
  await panel.getByRole('button', { name: 'Back to Offline or idle' }).click();
  await expect(page).not.toHaveURL(/sel=/);
  await expect(panel.getByRole('heading', { name: 'Offline or idle' })).toBeVisible();

  // Close skips the steps and returns to the surface's own page, here the summary.
  await panel.getByRole('button', { name: /Nord Stream 1/ }).click();
  await panel.getByRole('button', { name: 'Close, back to Home' }).click();
  await expect(page).not.toHaveURL(/sel=|f=/);
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Close/ })).toHaveCount(0);

  // Searching and leaving without a pick keeps what's open.
  await page.goto('/?sel=pipeline/nord-stream-1');
  await openSearch(page);
  await page.keyboard.type('turk');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/sel=pipeline\/nord-stream-1/);

  // In a view, an item chain goes back step by step, and Close returns to the view's list.
  await page.goto('/?view=chokepoints');
  await panel.getByRole('list', { name: 'Chokepoints' }).getByRole('button', { name: /Strait of Hormuz/ }).click();
  await expect(panel.getByRole('button', { name: /^Back to/ })).toHaveCount(0);
  await panel.getByRole('button', { name: /^Ras Tanura/ }).first().click();
  await expect(panel.getByRole('button', { name: 'Back to Strait of Hormuz' })).toBeVisible();
  // A new page opens at its top.
  expect(await panel.locator('.panel__body').evaluate((el) => el.scrollTop)).toBe(0);
  await panel.getByRole('button', { name: 'Close, back to Chokepoints' }).click();
  await expect(page).not.toHaveURL(/sel=/);
  await expect(page).toHaveURL(/view=chokepoints/);
  await expect(panel.getByRole('list', { name: 'Chokepoints' })).toBeVisible();
});

test('where is my oil from: a ZIP code opens its region on gasoline, with crude and its chokepoints a click away', async ({ page }) => {
  test.skip(!FEATURES.fuelOrigins, 'FEATURES.fuelOrigins is off');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  let search = await openSearch(page);
  await search.fill('90012');
  await expect(page.getByRole('option').first()).toContainText('West Coast region');
  await page.keyboard.press('Enter');
  // Only the region goes in the URL, never the ZIP code; gasoline is the default, so no fuel either.
  await expect(page).toHaveURL(/sel=region\/padd-5/);
  expect(page.url()).not.toContain('90012');
  expect(page.url()).not.toContain('fuel=');
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(panel.getByRole('heading', { name: 'West Coast' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Gasoline' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByText('Made in the region or drawn from stocks')).toBeVisible();

  // Crude shows the chokepoints on cited routes; one opens the chokepoint.
  await panel.getByRole('tab', { name: 'Crude' }).click();
  await expect(page).toHaveURL(/fuel=crude/);
  await panel.getByRole('button', { name: /^Strait of Hormuz/ }).click();
  await expect(page).toHaveURL(/sel=chokepoint\/hormuz/);
  expect(page.url()).not.toContain('fuel=');

  // A state finds its region too; another region's row opens that region on crude.
  search = await openSearch(page);
  await search.fill('new york');
  await page.getByRole('option', { name: /^New York US state/ }).click();
  await expect(page).toHaveURL(/sel=region\/padd-1/);
  await panel.getByRole('button', { name: /^Gulf Coast/ }).click();
  await expect(page).toHaveURL(/sel=region\/padd-3.*fuel=crude/);
  await expect(panel.getByRole('tab', { name: 'Crude' })).toHaveAttribute('aria-selected', 'true');
});

test('the chokepoints view stays lit while you open a strait from it, and Back returns to its list', async ({ page }) => {
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'Views' });
  await rail.getByRole('button', { name: 'Chokepoints' }).click();
  await expect(page).toHaveURL(/view=chokepoints/);
  const panel = page.getByRole('complementary', { name: 'Panel' });
  const list = panel.getByRole('list', { name: 'Chokepoints' });
  await expect(list.getByRole('button').first()).toContainText('Strait of Hormuz');
  await expect(panel.getByRole('heading', { name: 'Chokepoints' })).toBeVisible();

  await list.getByRole('button', { name: /Bab el-Mandeb/ }).click();
  await expect(panel.getByRole('heading', { name: 'Bab el-Mandeb' })).toBeVisible();
  // The camera can write `at` between the two, so each is checked on its own.
  await expect(page).toHaveURL(/view=chokepoints(&|$)/);
  await expect(page).toHaveURL(/sel=chokepoint\/babelm/);
  await expect(rail.getByRole('button', { name: 'Chokepoints' })).toHaveAttribute('aria-current', 'page');

  await page.keyboard.press('Escape');
  await expect(list).toBeVisible();
  await rail.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  await expect(page).not.toHaveURL(/view=/);

  // A shared link opens on the view; with nothing in history, Esc steps up to home.
  await page.goto('/?view=chokepoints&sel=chokepoint/hormuz');
  await expect(panel.getByRole('heading', { name: 'Strait of Hormuz' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
});

test('each surface has its own filter chips, counted within it', async ({ page }) => {
  await page.goto('/');
  const chips = page.getByRole('toolbar', { name: 'Filters' });
  await expect(chips.getByRole('button')).toHaveText([/^Offline or idle/, /^Below baseline/, /^Unverified claims/]);
  await expect(page.getByRole('region', { name: 'Overview' }).getByRole('button', { name: /^Pipelines/ })).toContainText(/offline or idle/);
  const homeOffline = Number((await chips.getByRole('button', { name: /^Offline or idle/ }).textContent())!.replace(/\D/g, ''));

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Pipelines' }).click();
  await expect(chips.getByRole('button', { name: /^Metered flow/ })).toBeVisible();
  await expect(chips.getByRole('button', { name: /^Below baseline/ })).toHaveCount(0);
  // Pipelines only: Home's count also has LNG and oil terminals.
  const offline = chips.getByRole('button', { name: /^Offline or idle/ });
  expect(Number((await offline.textContent())!.replace(/\D/g, ''))).toBeLessThanOrEqual(homeOffline);
  await offline.click();
  await expect(page).toHaveURL(/view=pipelines&f=offline/);
  const panel = page.getByLabel('Panel', { exact: true });
  await panel.getByRole('button', { name: 'Close, back to Pipelines' }).click();
  await expect(page).not.toHaveURL(/f=/);
  await expect(panel.getByRole('list', { name: 'Pipelines by region' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Chokepoints' }).click();
  await expect(chips.getByRole('button')).toHaveText([/^Below baseline/]);
});

test('the terminals surface switches between LNG and oil, and keeps its group when you come back', async ({ page }) => {
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'Views' });
  await rail.getByRole('button', { name: 'Terminals' }).click();
  await expect(page).toHaveURL(/view=terminals/);
  const panel = page.getByRole('complementary', { name: 'Panel' });
  await expect(panel.getByRole('list', { name: 'LNG terminals by facility' })).toBeVisible();
  const chips = page.getByRole('toolbar', { name: 'Filters' });
  await expect(chips.getByRole('button')).toHaveText([/^Offline or idle/, /^Unverified claims/, /^Metered flow/]);

  await panel.getByRole('radio', { name: 'Oil' }).click();
  await expect(panel.getByRole('list', { name: 'Oil terminals by route' })).toBeVisible();
  await panel.getByRole('button', { name: /^Through Strait of Hormuz/ }).click();
  await panel.getByRole('list', { name: /^Through Strait of Hormuz/ }).getByRole('button', { name: /^Ras Tanura/ }).click();
  await expect(page).toHaveURL(/view=terminals.*sel=terminal\/ras-tanura/);
  await expect(panel.getByRole('heading', { name: 'Ras Tanura' })).toBeVisible();

  await panel.getByRole('button', { name: 'Close, back to Terminals' }).click();
  await expect(panel.getByRole('list', { name: /^Through Strait of Hormuz/ })).toBeVisible();
  await expect(panel.getByRole('radio', { name: 'Oil' })).toHaveAttribute('aria-checked', 'true');
});

test('the gas storage surface lists countries past Europe against last year and shows only storage on the map', async ({ page }) => {
  test.skip(!FEATURES.gasStorage, 'FEATURES.gasStorage is off');
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Gas storage' }).click();
  await expect(page).toHaveURL(/view=storage/);
  const panel = page.getByLabel('Panel', { exact: true });
  const list = panel.getByRole('list', { name: 'Gas storage by country' });
  await expect(list.getByRole('button').first()).toContainText(/vs last year|Nothing to compare last year/);
  // Each source's country, each with its cadence: AGSI+ daily, EIA weekly, the rest monthly.
  await expect(list.getByRole('button', { name: /^Germany/ })).toContainText('Daily');
  await expect(list.getByRole('button', { name: /^United States/ })).toContainText(/Bcf.*Weekly/);
  await expect(list.getByRole('button', { name: /^Japan/ })).toContainText('Monthly');
  await expect(panel.getByRole('region', { name: 'Not covered' })).toContainText('China');
  await expect(panel).toContainText('Joint Organizations Data Initiative (JODI) Database');
  await expect(page.getByRole('toolbar', { name: 'Filters' }).getByRole('button')).toHaveCount(0);
  // Only storage shows, so there's no layer list.
  await expect(page.getByRole('button', { name: 'Layers' })).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !(window as unknown as { __etMap: { isMoving(): boolean } }).__etMap.isMoving());
  const japan = await screenPoint(page, [138.5, 36.5]);
  await page.mouse.move(japan.x, japan.y);
  await expect(page.getByRole('tooltip')).toContainText(/Japan.*(vs last year|Nothing to compare)/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/storage.png` });
  await list.getByRole('button', { name: /^United States/ }).click();
  await expect(page).toHaveURL(/view=storage.*sel=country\/us/);
  await expect(panel.getByRole('region', { name: 'By storage region' })).toContainText('South Central');
});

test('the basins surface lists basins by oil remaining and shows only their outlines on the map', async ({ page }) => {
  await page.goto('/?view=basins');
  const panel = page.getByLabel('Panel', { exact: true });
  const list = panel.getByRole('list', { name: 'Basins' });
  await expect(list.getByRole('button').first()).toContainText('Mesopotamian Foredeep Basin');
  await expect(list.getByRole('button').first()).toContainText('Billion barrels of oil remaining');
  // Only the outlines show, so the layer list has nothing to switch.
  await expect(page.getByRole('button', { name: 'Layers' })).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !(window as unknown as { __etMap: { isMoving(): boolean } }).__etMap.isMoving());
  // Hormuz is a chokepoint on Home; here nothing but basins answers the pointer.
  const hormuz = await screenPoint(page, [56.8598, 26.2969]);
  await page.mouse.move(hormuz.x, hormuz.y);
  await expect(page.getByRole('tooltip')).not.toContainText('Strait of Hormuz');
  const siberia = await screenPoint(page, [72, 62]);
  await page.mouse.move(siberia.x, siberia.y);
  await expect(page.getByRole('tooltip')).toContainText('West Siberian Basin');
  await list.getByRole('button').first().click();
  await expect(page).toHaveURL(/view=basins/);
  await expect(page).toHaveURL(/sel=basin\/usgs-2024/);
  await expect(page.getByRole('button', { name: 'Layers' })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: 'Layers' })).toBeVisible();
});

test('the oil origins surface finds a US region through search and opens it on the chosen fuel', async ({ page }) => {
  test.skip(!FEATURES.fuelOrigins, 'FEATURES.fuelOrigins is off');
  await page.goto('/?view=origins');
  const panel = page.getByLabel('Panel', { exact: true });
  const regions = panel.getByRole('list', { name: 'US fuel regions' });
  await expect(regions.getByRole('button')).toHaveCount(5);

  await panel.getByRole('button', { name: /^Find your region/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await expect(dialog.getByRole('button', { name: 'US places' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('combobox').fill('90012');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/view=origins.*sel=region\/padd-5/);
  expect(page.url()).not.toContain('90012');

  await panel.getByRole('button', { name: 'Close, back to Oil origins' }).click();
  await panel.getByRole('tab', { name: 'Diesel and heating oil' }).click();
  await regions.getByRole('button', { name: /^Midwest/ }).click();
  await expect(page).toHaveURL(/sel=region\/padd-2.*fuel=diesel/);
  await expect(panel.getByRole('tab', { name: 'Diesel and heating oil' })).toHaveAttribute('aria-selected', 'true');
  // The fuel tabs move with the arrow keys, selecting as they go.
  await panel.getByRole('tab', { name: 'Diesel and heating oil' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('tab', { name: 'Jet fuel' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('tab', { name: 'Jet fuel' })).toBeFocused();
  await expect(page).toHaveURL(/fuel=jet/);
});

test('the oil origins surface lists importers, and a country opens from the map with where its crude comes from', async ({ page }) => {
  test.skip(!FEATURES.fuelOrigins, 'FEATURES.fuelOrigins is off');
  await page.goto('/?view=origins');
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(panel.getByRole('heading', { name: 'Oil origins' })).toBeVisible();
  const list = panel.getByRole('list', { name: 'Crude imports by country' });
  await expect(list.getByRole('button').first()).toContainText('China');
  await expect(page.getByRole('button', { name: 'Layers' })).toHaveCount(0);
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/origins.png` });
  // Let the camera settle on the world before finding India.
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !(window as unknown as { __etMap: { isMoving(): boolean } }).__etMap.isMoving());
  const india = await screenPoint(page, [78.5, 22]);
  await page.mouse.move(india.x, india.y);
  await expect(page.getByRole('tooltip')).toContainText('India');
  await expect(page.getByRole('tooltip')).toContainText('Largest source');
  await page.mouse.click(india.x, india.y);
  await expect(page).toHaveURL(/view=origins.*sel=country\/in/);
  await expect(panel.getByRole('heading', { name: 'India', level: 2 })).toBeVisible();
  // On oil origins the imports come before gas storage.
  const sections = panel.locator('.country-section__title');
  await expect(sections.first()).toHaveText('Where its crude comes from');
  await expect(panel.getByText(/Source: UN Comtrade\. Imports of crude petroleum/)).toBeVisible();
  if (SHOTS) await page.waitForTimeout(2500), await page.screenshot({ path: `${SHOTS}/origins-india.png` });
  await panel.getByRole('button', { name: 'Close, back to Oil origins' }).click();
  await expect(list).toBeVisible();
  // Back on Home the layers return.
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: 'Layers' })).toBeVisible();
});

test('a country from the storage list shows its gas storage first, then its crude imports', async ({ page }) => {
  test.skip(!FEATURES.gasStorage || !FEATURES.fuelOrigins, 'gas storage or oil origins is off');
  await page.goto('/?view=storage&sel=country/de');
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(panel.getByRole('heading', { name: 'Germany', level: 2 })).toBeVisible();
  await expect(panel.locator('.country-section__title')).toHaveText(['Gas storage', 'Where its crude comes from']);
  await expect(panel.getByText(/Eurostat, imports of oil and petroleum products/)).toBeVisible();
});

test('an ⓘ beside a title opens its explanation, and Escape closes it', async ({ page }) => {
  await page.goto('/?sel=basin/usgs-1174');
  await expect(page.getByRole('heading', { name: 'West Siberian Basin' })).toBeVisible();
  const note = page.getByRole('note', { name: 'About these volumes' });
  await expect(note).toBeHidden();
  await page.getByRole('button', { name: 'About these volumes' }).click();
  await expect(note).toBeVisible();
  await expect(note).toContainText('remaining is not what is left today');
  // It opens on screen, below its button.
  const button = (await page.getByRole('button', { name: 'About these volumes' }).boundingBox())!;
  const box = (await note.boundingBox())!;
  expect(box.y).toBeGreaterThan(button.y);
  expect(box.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();
});

test('while the data loads, the map shows the globe and the panel a page-shaped placeholder; both go when it arrives', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/data/**', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/?sel=chokepoint/hormuz');
  await expect(page.getByRole('status').filter({ hasText: 'Loading pipelines, terminals and flows' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Loading this chokepoint' })).toBeAttached();
  await expect(page.getByRole('button', { name: /Offline or idle/ })).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'Strait of Hormuz', exact: true })).toBeVisible();
  await expect(page.getByText('Loading pipelines, terminals and flows')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Offline or idle/ })).toBeVisible();
});

/** The camera once the map is at rest: centre and zoom. */
async function restingCamera(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const map = (window as unknown as { __etMap?: MapHandle & { isMoving(): boolean } }).__etMap;
    return map?.loaded() && !map.isMoving();
  });
  return page.evaluate(() => {
    const map = (window as unknown as { __etMap: { getCenter(): { lng: number; lat: number }; getZoom(): number } }).__etMap;
    const c = map.getCenter();
    return { lon: c.lng, lat: c.lat, zoom: map.getZoom() };
  });
}

const near = (a: { lon: number; lat: number; zoom: number }, b: { lon: number; lat: number; zoom: number }) =>
  Math.abs(a.lon - b.lon) < 0.5 && Math.abs(a.lat - b.lat) < 0.5 && Math.abs(a.zoom - b.zoom) < 0.1;

test('closing an item returns the map to where it was before, through a chain of items too', async ({ page }) => {
  // A basin, then one of its pipelines: Back returns to the basin's frame, Close to Home's.
  await page.goto('/');
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  const home = await restingCamera(page);
  const search = await openSearch(page);
  await search.fill('west siberian');
  await page.getByRole('option', { name: /West Siberian Basin/ }).first().click();
  await expect(panel.getByRole('heading', { name: 'West Siberian Basin' })).toBeVisible();
  await expect.poll(async () => near(await restingCamera(page), home)).toBe(false);
  const basin = await restingCamera(page);
  const related = panel.getByRole('region', { name: /Pipelines crossing it/ });
  await related.getByRole('listitem').first().getByRole('button').click();
  await expect(page).toHaveURL(/sel=pipeline\//);
  await expect.poll(async () => near(await restingCamera(page), basin)).toBe(false);
  await panel.getByRole('button', { name: /^Back to/ }).click();
  await expect(page).toHaveURL(/sel=basin\/usgs-1174/);
  await expect.poll(async () => near(await restingCamera(page), basin), { timeout: 10_000 }).toBe(true);
  await related.getByRole('listitem').first().getByRole('button').click();
  await expect(page).toHaveURL(/sel=pipeline\//);
  await panel.getByRole('button', { name: /^Close, back to/ }).click();
  await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
  await expect.poll(async () => near(await restingCamera(page), home), { timeout: 10_000 }).toBe(true);
});

test('closing an item opened from a link frames its surface', async ({ page }) => {
  await page.goto('/?view=chokepoints&sel=chokepoint/hormuz');
  const panel = page.getByLabel('Panel', { exact: true });
  await expect(panel.getByRole('heading', { name: 'Strait of Hormuz' })).toBeVisible();
  const strait = await restingCamera(page);
  await panel.getByRole('button', { name: 'Close, back to Chokepoints' }).click();
  // Every strait in view: zoomed well out from the one.
  await expect.poll(async () => (await restingCamera(page)).zoom, { timeout: 10_000 }).toBeLessThan(strait.zoom - 1);
});
