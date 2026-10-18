import { test, expect } from '@playwright/test';

const state = page => page.evaluate(() => window.__viewer.snapshot());
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const open = async page => {
  await page.goto('./?debug');
  await expect(page.locator('#screen-controls')).toBeVisible({ timeout: 30000 });
};
const center = async locator => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test('desktop buttons move while held, release outside and reset', async ({ page }) => {
  await open(page);
  const home = await state(page);
  const forward = await center(page.getByRole('button', { name: '向前移动' }));
  await page.mouse.move(forward.x, forward.y);
  await page.mouse.down();
  await page.waitForTimeout(250);
  expect((await state(page)).position[2]).toBeLessThan(home.position[2]);
  await page.mouse.move(200, 300);
  await page.mouse.up();
  // Normal release has a short deceleration; explicit brake/cancel stops immediately.
  await page.waitForTimeout(700);
  const stopped = await state(page);
  await page.waitForTimeout(150);
  expect(distance(stopped.position, (await state(page)).position)).toBeLessThan(0.0001);
  await expect(page.locator('.held')).toHaveCount(0);
  await page.getByRole('button', { name: '重置视角' }).click();
  const reset = await state(page);
  expect(distance(reset.position, home.position)).toBeLessThan(0.0001);
  // Screen movement controls also work from the keyboard when focused.
  await page.getByRole('button', { name: '上升', exact: true }).focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(150);
  await page.keyboard.up('Space');
  expect((await state(page)).position[1]).toBeGreaterThan(home.position[1]);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('left-hand movement and right-hand look work together; cancel and reset stop movement', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page);
    const home = await state(page);
    const canvasBounds = await page.locator('#scene').boundingBox();
    expect(canvasBounds).toEqual({ x: 0, y: 0, width: 844, height: 390 });
    await expect(page.locator('#hint')).toBeHidden();
    const boostButton = page.getByRole('button', { name: '切换快速模式' });
    const boost = await center(boostButton);
    expect(boost.x).toBeGreaterThan(844 / 2);
    const cdp = await context.newCDPSession(page);
    const forward = { ...await center(page.getByRole('button', { name: '向前移动' })), id: 1 };
    expect(forward.x).toBeLessThan(844 / 2);
    let look = { x: 769, y: 180, id: 2 };
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [forward]);
    const boostTouch = { ...boost, id: 5 };
    await touch('touchStart', [forward, boostTouch]);
    await expect(boostButton).toHaveAttribute('aria-pressed', 'true');
    await touch('touchEnd', [forward]);
    await expect(boostButton).toHaveAttribute('aria-pressed', 'true');
    await touch('touchStart', [forward, look]);
    look = { ...look, x: 704, y: 130 };
    await touch('touchMove', [forward, look]);
    await page.waitForTimeout(250);
    const moving = await state(page);
    expect(distance(home.position, moving.position)).toBeGreaterThan(0.01);
    expect(Math.abs(moving.rotation[1] - home.rotation[1])).toBeGreaterThan(5);
    await touch('touchEnd', [look]);
    const stillMoving = await state(page);
    await page.waitForTimeout(150);
    expect(distance(stillMoving.position, (await state(page)).position)).toBeGreaterThan(0.01);
    await touch('touchCancel', []);
    const stopped = await state(page);
    await page.waitForTimeout(150);
    expect(distance(stopped.position, (await state(page)).position)).toBeLessThan(0.0001);
    await expect(page.locator('.held')).toHaveCount(0);
    // Tap reset with another finger while movement is still held.
    const reset = { ...await center(page.getByRole('button', { name: '重置视角' })), id: 3 };
    await touch('touchStart', [forward]);
    await touch('touchStart', [forward, reset]);
    await touch('touchEnd', [reset]);
    await page.waitForTimeout(150);
    expect(distance(home.position, (await state(page)).position)).toBeLessThan(0.0001);
    await touch('touchEnd', []);
    await expect(page.locator('.held')).toHaveCount(0);
    const roll = { ...await center(page.getByRole('button', { name: '向左侧倾' })), id: 4 };
    await touch('touchStart', [roll]);
    await page.waitForTimeout(250);
    await touch('touchEnd', []);
    expect(Math.abs((await state(page)).up[0])).toBeGreaterThan(0.1);
    await page.getByRole('button', { name: '重置视角' }).tap();
    await expect(boostButton).toHaveAttribute('aria-pressed', 'false');
    expect(distance((await state(page)).up, home.up)).toBeLessThan(0.0001);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/mobile-landscape.png' });
    for (const button of await page.locator('#screen-controls button:visible').all()) {
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(844);
      expect(box.y + box.height).toBeLessThanOrEqual(390);
    }
  });

  test('portrait requests landscape and rotation clears held movement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./?debug');
    await expect(page.getByRole('heading', { name: '请横屏浏览' })).toBeVisible();
    await expect(page.locator('#screen-controls')).toBeHidden();
    await page.evaluate(() => { Object.defineProperty(screen.orientation, 'lock', { configurable: true, value: undefined }); });
    await page.getByRole('button', { name: '进入横屏' }).tap();
    await expect(page.locator('#landscape-gate p')).toContainText('关闭手机的方向锁定');
    await page.screenshot({ path: 'test-results/mobile-portrait.png' });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#screen-controls')).toBeVisible({ timeout: 30000 });
    const button = await center(page.getByRole('button', { name: '向前移动' }));
    await page.mouse.move(button.x, button.y);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#landscape-gate')).toBeVisible();
    const stopped = await state(page);
    await page.waitForTimeout(150);
    expect(distance(stopped.position, (await state(page)).position)).toBeLessThan(0.0001);
    await page.mouse.up();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#screen-controls')).toBeVisible();
    await expect(page.locator('.held')).toHaveCount(0);
  });

  test('page disables browser zoom so two-finger input belongs to the viewer', async ({ page }) => {
    await open(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /maximum-scale=1/);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /user-scalable=no/);
    expect(await page.locator('html').evaluate(element => getComputedStyle(element).touchAction)).toBe('none');
    expect(await page.evaluate(() => {
      const event = new Event('gesturestart', { bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
  });
});
