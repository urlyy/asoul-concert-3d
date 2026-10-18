import { test, expect } from '@playwright/test';

const state = page => page.evaluate(() => window.__viewer.snapshot());
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('flight can pitch through a full loop, roll and fly toward view', async ({ page }) => {
  await page.goto('./?debug');
  await expect(page.locator('#screen-controls')).toBeVisible({ timeout: 30000 });
  const home = await state(page);
  // 600px at the configured default sensitivity (0.15) is a 90-degree pitch.
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(360, 700);
    await page.mouse.down();
    await page.mouse.move(360, 100, { steps: 12 });
    await page.mouse.up();
    const turned = await state(page);
    expect([...turned.forward, ...turned.up].every(Number.isFinite)).toBe(true);
    if (i === 0) expect(turned.forward.reduce((sum, value, index) => sum + value * home.up[index], 0)).toBeGreaterThan(0.99);
    if (i === 1) {
      expect(turned.up.reduce((sum, value, index) => sum + value * home.up[index], 0)).toBeLessThan(-0.99);
      await page.screenshot({ path: 'test-results/flight-inverted.png' });
    }
  }
  expect(distance((await state(page)).forward, home.forward)).toBeLessThan(0.001);
  const beforeRoll = await state(page);
  await page.keyboard.down('q');
  await page.waitForTimeout(450);
  await page.keyboard.up('q');
  expect(distance((await state(page)).up, beforeRoll.up)).toBeGreaterThan(0.2);
  await page.getByRole('button', { name: '重置视角' }).click();
  const leveled = await state(page);

  // Pitch up, then fly along the camera's forward axis rather than a flat ground plane.
  await page.mouse.move(360, 500);
  await page.mouse.down();
  await page.mouse.move(360, 300, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  expect((await state(page)).position[1]).toBeGreaterThan(leveled.position[1]);
  await page.keyboard.up('w');
  expect(Math.hypot(...(await state(page)).velocity)).toBeGreaterThan(0);
  await page.waitForTimeout(700);
  expect(Math.hypot(...(await state(page)).velocity)).toBe(0);

  await page.getByRole('button', { name: '重置视角' }).click();
  const reset = await state(page);
  expect(distance(reset.position, home.position)).toBeLessThan(0.0001);
  expect(distance(reset.up, home.up)).toBeLessThan(0.001);
});

test('looking around without movement input keeps the camera in place', async ({ page }) => {
  await page.goto('./?debug');
  await page.waitForFunction(() => window.__viewer?.snapshot().ready);
  const home = await state(page);
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(650, 320, { steps: 8 });
  await page.mouse.up();
  expect(distance((await state(page)).position, home.position)).toBeLessThan(0.0001);

  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  const moving = await state(page);
  expect(distance(moving.position, home.position)).toBeGreaterThan(0.01);
  expect(Math.hypot(...moving.velocity)).toBeGreaterThan(0.1);
  await page.keyboard.up('w');
  expect(Math.hypot(...(await state(page)).velocity)).toBeGreaterThan(0.1);
  await page.mouse.move(500, 400);
  await page.mouse.down();
  const stopped = await state(page);
  expect(Math.hypot(...stopped.velocity)).toBe(0);
  await page.mouse.move(700, 300, { steps: 12 });
  await page.waitForTimeout(150);
  expect(distance((await state(page)).position, stopped.position)).toBeLessThan(0.0001);
  await page.mouse.up();
});

test('a closed mouse drag returns to the same view without drifting', async ({ page }) => {
  await page.goto('./?debug');
  await page.waitForFunction(() => window.__viewer?.snapshot().ready);
  const before = await state(page);
  await page.mouse.move(550, 350);
  await page.mouse.down();
  for (const [x, y] of [[700, 350], [700, 500], [550, 500], [550, 350]]) {
    await page.mouse.move(x, y, { steps: 12 });
  }
  await page.mouse.up();
  const after = await state(page);
  expect(distance(after.position, before.position)).toBeLessThan(0.0001);
  expect(distance(after.forward, before.forward)).toBeLessThan(0.0001);
  expect(distance(after.up, before.up)).toBeLessThan(0.0001);

  await page.mouse.down();
  await page.keyboard.down('q');
  await page.waitForTimeout(250);
  await page.keyboard.up('q');
  const rolled = await state(page);
  for (const [x, y] of [[700, 350], [700, 500], [550, 500], [550, 350]]) {
    await page.mouse.move(x, y, { steps: 12 });
  }
  await page.mouse.up();
  expect(distance(rolled.up, before.up)).toBeGreaterThan(0.1);
  expect(distance((await state(page)).up, rolled.up)).toBeLessThan(0.0001);
});

test('saved quaternion entrance survives reload and reset including roll and FOV', async ({ page }) => {
  await page.goto('./?debug');
  await page.waitForFunction(() => window.__viewer?.snapshot().ready);
  await page.mouse.move(400, 400);
  await page.mouse.down();
  await page.mouse.move(580, 250, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.down('q');
  await page.waitForTimeout(400);
  await page.keyboard.up('q');
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  await page.evaluate(() => {
    window.__viewer.controller.clearInput();
    window.__viewer.camera.camera.fov = 72;
  });
  const saved = await state(page);
  await page.route('**/scenes.json', async route => {
    const response = await route.fetch();
    const catalog = await response.json();
    const scene = catalog.scenes.find(scene => scene.id === saved.sceneId);
    scene.camera = { ...scene.camera, position: saved.position, quaternion: saved.quaternion, fov: saved.fov };
    await route.fulfill({ json: catalog });
  });
  await page.reload();
  await page.waitForFunction(() => window.__viewer?.snapshot().ready);
  const verify = async () => {
    const current = await state(page);
    expect(distance(current.position, saved.position)).toBeLessThan(0.0001);
    expect(distance(current.forward, saved.forward)).toBeLessThan(0.0001);
    expect(distance(current.up, saved.up)).toBeLessThan(0.0001);
    expect(current.fov).toBe(saved.fov);
  };
  await verify();
  await page.keyboard.down('e');
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.up('e');
  await page.keyboard.up('w');
  expect(distance((await state(page)).up, saved.up)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: '重置视角' }).click();
  await verify();
  expect(Math.hypot(...(await state(page)).velocity)).toBe(0);
});
