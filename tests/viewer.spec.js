import { test, expect } from '@playwright/test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const snapshot = page => page.evaluate(() => window.__viewer.snapshot());
const ready = async page => {
  await page.goto('./?debug');
  await page.waitForFunction(() => window.__viewer?.snapshot().ready);
  await expect(page.locator('#status')).toBeHidden();
};
const hold = async (page, key, ms = 250) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('coarsest LOD is usable before fine chunks arrive; source PLY is never requested', async ({ page }) => {
  const catalog = JSON.parse(await readFile('public/scenes.json', 'utf8'));
  const manifest = catalog.scenes.find(scene => scene.id === catalog.defaultScene);
  const metadata = JSON.parse(await readFile(join('public', manifest.url), 'utf8'));
  const coarse = `${metadata.lodLevels - 1}_`;
  const requests = [];
  const errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  let unblock;
  const fineGate = new Promise(resolve => { unblock = resolve; });
  await page.route('**/scenes/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const chunk = path.match(/\/(\d+_\d+)\//)?.[1];
    if (chunk && !chunk.startsWith(coarse)) await fineGate;
    await route.continue();
  });
  try {
    await ready(page);
    const before = await snapshot(page);
    expect(before.renderedSplats).toBeGreaterThan(0);
    expect(before.renderedSplats).toBeLessThanOrEqual(metadata.counts.at(-1));
    await page.locator('#scene').click({ position: { x: 300, y: 300 } });
    await hold(page, 'w');
    expect(distance(before.position, (await snapshot(page)).position)).toBeGreaterThan(0.01);
    expect(requests.some(url => /\.ply(?:\?|$)/i.test(url))).toBe(false);
    expect(requests.filter(url => url.includes('/scenes/')).every(url => url.includes('/tour/scenes/'))).toBe(true);
    expect(errors).toEqual([]);
  } finally { unblock(); }
});

test('first-person movement, mouse look, flying toward view, focus loss and reset', async ({ page }) => {
  await ready(page);
  await page.locator('#scene').click({ position: { x: 500, y: 400 } });
  const home = await snapshot(page);
  await hold(page, 'w');
  expect((await snapshot(page)).position[2]).toBeLessThan(home.position[2]);
  await hold(page, 'd');
  expect((await snapshot(page)).position[0]).toBeGreaterThan(home.position[0]);
  const beforeUp = await snapshot(page);
  await hold(page, 'r');
  expect((await snapshot(page)).position[1]).toBeGreaterThan(beforeUp.position[1]);
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(680, 270, { steps: 10 });
  await page.mouse.up();
  const look = await snapshot(page);
  expect(distance(look.forward, home.forward)).toBeGreaterThan(0.2);
  const walk = await snapshot(page);
  await hold(page, 'w');
  expect((await snapshot(page)).position[1]).toBeGreaterThan(walk.position[1]);
  await page.keyboard.down('w');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await snapshot(page);
  await page.waitForTimeout(200);
  expect(distance(blurred.position, (await snapshot(page)).position)).toBeLessThan(0.00001);
  await page.keyboard.up('w');
  await page.keyboard.press('Home');
  const reset = await snapshot(page);
  expect(distance(reset.position, home.position)).toBeLessThan(0.0001);
  await page.screenshot({ path: 'test-results/viewer-webgpu.png' });
});

test('WebGL 2 fallback renders the streamed scene without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/viewer-config.json', async route => {
    const response = await route.fetch();
    const config = await response.json();
    config.renderer = 'webgl2';
    await route.fulfill({ json: config });
  });
  await ready(page);
  expect((await snapshot(page)).renderer).toBe('webgl2');
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/viewer-webgl2.png' });
});

test('scene menu opens, closes and switches to the selected entrance', async ({ page }) => {
  const catalog = JSON.parse(await readFile('public/scenes.json', 'utf8'));
  test.skip(catalog.scenes.length < 2, '需要两个已转换场景');
  const alternate = catalog.scenes.find(scene => scene.id !== catalog.defaultScene);
  const name = alternate.name || alternate.id;
  await ready(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/viewer-default-scene.png' });
  const toggle = page.getByRole('button', { name: '场景', exact: true });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('button', { name })).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('button', { name })).toBeHidden();
  await toggle.click();
  await page.getByRole('button', { name }).click();
  await page.waitForFunction(id => window.__viewer?.snapshot().sceneId === id && window.__viewer.snapshot().ready, alternate.id);
  expect(new URL(page.url()).searchParams.get('scene')).toBe(alternate.id);
  expect((await snapshot(page)).renderedSplats).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/viewer-alternate-scene.png' });
});

test('one scene still has a collapsible menu, and configuration can hide it', async ({ page }) => {
  const single = JSON.parse(await readFile('public/scenes.json', 'utf8'));
  single.scenes = single.scenes.filter(scene => scene.id === single.defaultScene);
  const name = single.scenes[0].name;
  await page.route('**/scenes.json', route => route.fulfill({ json: single }));
  await ready(page);
  const toggle = page.getByRole('button', { name: '场景', exact: true });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('button', { name })).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('button', { name })).toBeHidden();
  await page.unroute('**/scenes.json');
  single.showSwitcher = false;
  await page.route('**/scenes.json', route => route.fulfill({ json: single }));
  await page.reload();
  await page.waitForFunction(() => window.__viewer?.snapshot().ready);
  await expect(toggle).toBeHidden();
});

test('missing manifest and missing chunk show actionable errors', async ({ page }) => {
  await page.route('**/scenes.json', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('场景打开失败');
  await expect(page.getByRole('link', { name: '重新加载' })).toBeVisible();
  await page.unroute('**/scenes.json');
  await page.route('**/scenes/**/*.webp', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.reload();
  await expect(page.locator('#status')).toContainText('场景数据块加载失败', { timeout: 30000 });
});

test('deployment contains every referenced chunk and no original PLY', async () => {
  const catalog = JSON.parse(await readFile('dist/scenes.json', 'utf8'));
  for (const manifest of catalog.scenes) {
    const metadataPath = join('dist', manifest.url);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const root = metadataPath.slice(0, -'lod-meta.json'.length);
    for (const filename of metadata.filenames) {
      const path = join(root, filename);
      const chunk = JSON.parse(await readFile(path, 'utf8'));
      for (const value of Object.values(chunk)) {
        if (value && typeof value === 'object' && value.files) {
          for (const file of value.files) expect((await stat(join(path.slice(0, -'meta.json'.length), file))).size).toBeGreaterThan(0);
        }
      }
    }
  }
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(dir, entry.name));
      else expect(entry.name.endsWith('.ply')).toBe(false);
    }
  };
  await walk('dist');
});
