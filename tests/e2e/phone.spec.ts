import { expect, test, type Page } from '@playwright/test';

const sheetOf = (page: Page) => page.locator('.app');

test('on a phone the map fills the screen, Home peeks from the bottom and the rail is a tab bar', async ({ page }) => {
  await page.goto('/');
  await expect(sheetOf(page)).toHaveAttribute('data-sheet', 'peek');
  const tabs = page.getByRole('navigation', { name: 'Views' });
  await expect(tabs.getByRole('button')).toHaveCount(6);
  await expect(tabs.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeHidden();
  // The map reaches the screen's edges, behind the sheet.
  const map = await page.locator('.map').boundingBox();
  const viewport = page.viewportSize()!;
  expect(map).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  // At peek the hero's headline shows above the tab bar.
  const headline = page.getByRole('region', { name: 'Situation' }).getByRole('heading', { level: 3 }).first();
  const tabBar = (await tabs.boundingBox())!;
  const headlineBox = (await headline.boundingBox())!;
  expect(headlineBox.y + headlineBox.height).toBeLessThanOrEqual(tabBar.y);
});

test('a tab opens its surface at half; the handle steps up and a drag brings the sheet down', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Chokepoints' }).click();
  await expect(page).toHaveURL(/view=chokepoints/);
  await expect(sheetOf(page)).toHaveAttribute('data-sheet', 'half');
  await page.getByRole('button', { name: 'Expand panel to full height' }).click();
  await expect(sheetOf(page)).toHaveAttribute('data-sheet', 'full');
  // Let the sheet finish rising before finding its handle.
  await page.waitForTimeout(400);

  const handle = (await page.locator('.sheet-handle').boundingBox())!;
  const x = handle.x + handle.width / 2;
  await page.mouse.move(x, handle.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x, handle.y + 10 + i * 50);
  await page.mouse.up();
  await expect(sheetOf(page)).toHaveAttribute('data-sheet', 'peek');
});

test('opening an item frames the map above the sheet', async ({ page }) => {
  await page.goto('/?view=chokepoints');
  await page.getByLabel('Panel', { exact: true }).getByRole('button', { name: /^Strait of Hormuz/ }).click();
  await expect(page).toHaveURL(/sel=chokepoint\/hormuz/);
  await expect(page.getByRole('heading', { name: 'Strait of Hormuz' })).toBeVisible();
  // The camera's bottom padding is the sheet and the tab bar, so the strait sits in the map left showing.
  // Measured once the sheet and the camera have both settled.
  const gap = async () => {
    const padding = await page.evaluate(() => (window as unknown as { __etMap: { getPadding(): { top: number; bottom: number } } }).__etMap.getPadding());
    const sheetTop = (await page.getByLabel('Panel', { exact: true }).boundingBox())!.y;
    return { bottom: Math.abs(padding.bottom - (page.viewportSize()!.height - sheetTop)), top: padding.top };
  };
  await expect.poll(async () => (await gap()).bottom).toBeLessThan(4);
  expect((await gap()).top).toBeGreaterThan(0);
});

test('search opens over the whole screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Search pipelines/ }).click();
  const dialog = page.getByRole('dialog', { name: /Search/ });
  await expect(dialog).toBeVisible();
  // Measured once its entrance has played.
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(page.viewportSize()!.width);
  expect(await dialog.boundingBox()).toMatchObject({ x: 0, y: 0 });
  await dialog.getByRole('button', { name: 'Close search' }).click();
  await expect(dialog).toHaveCount(0);
});

test('below full a drag on the page moves the sheet; at full the page scrolls and a pull from its top lowers it', async ({ page }) => {
  await page.goto('/?view=pipelines');
  await expect(sheetOf(page)).toHaveAttribute('data-sheet', 'half');
  await page.waitForTimeout(400);
  const body = page.locator('.panel__body');

  // At half, dragging the list upward raises the sheet instead of scrolling it.
  const box = (await body.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 80;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, y - i * 40);
  await page.mouse.up();
  await expect(sheetOf(page)).toHaveAttribute('data-sheet', 'full');
  await expect(page).toHaveURL(/view=pipelines/);
  await page.waitForTimeout(400);

  // At full the list scrolls; scrolled down, a pull down scrolls it back rather than moving the sheet.
  await body.evaluate((el) => el.scrollTo({ top: 300 }));
  const cdp = await page.context().newCDPSession(page);
  const full = (await body.boundingBox())!;
  const swipe = async (fromY: number, toY: number) => {
    const point = (py: number) => [{ x: full.x + full.width / 2, y: py }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(fromY) });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(fromY + ((toY - fromY) * i) / 10) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipe(full.y + 100, full.y + 160);
  await expect(sheetOf(page)).toHaveAttribute('data-sheet', 'full');

  // From the top, the same pull hands off to the sheet.
  await body.evaluate((el) => el.scrollTo({ top: 0 }));
  await swipe(full.y + 100, full.y + 500);
  await expect(sheetOf(page)).not.toHaveAttribute('data-sheet', 'full');
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
});
