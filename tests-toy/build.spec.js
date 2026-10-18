import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const catalog = JSON.parse(await readFile('dist-toy/scenes.json', 'utf8'));
const selected = catalog.scenes.find(scene => scene.id === catalog.defaultScene);
const metadata = JSON.parse(await readFile(join('public', selected.url), 'utf8'));

test('Toy subpath loads remote coarse chunks before fine chunks without local scene data', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  // Serve real fixture bytes at the configured remote origin without contacting COS.
  await page.route(`${catalog.assetBaseUrl}**`, async route => {
    const relative = route.request().url().slice(catalog.assetBaseUrl.length);
    const chunk = relative.match(/\/(\d+_\d+)\//)?.[1];
    if (chunk && !chunk.startsWith(`${metadata.lodLevels - 1}_`)) await gate;
    await route.fulfill({
      body: await readFile(join('public', relative)),
      contentType: relative.endsWith('.json') ? 'application/json' : 'image/webp',
      headers: { 'access-control-allow-origin': '*' }
    });
  });
  try {
    await page.goto('./?debug');
    await page.waitForFunction(() => window.__viewer?.snapshot().ready);
    const state = await page.evaluate(() => window.__viewer.snapshot());
    expect(state.renderedSplats).toBeGreaterThan(0);
    expect(state.renderedSplats).toBeLessThanOrEqual(metadata.counts.at(-1));
    await expect(page.locator('#status')).toBeHidden();
    const sceneRequests = requests.filter(url => url.includes('/scenes/'));
    expect(sceneRequests.length).toBeGreaterThan(1);
    expect(sceneRequests.every(url => url.startsWith(catalog.assetBaseUrl))).toBe(true);
    expect(requests.some(url => /\.ply(?:\?|$)/i.test(url))).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/toy-coarse.png' });
  } finally { release(); }
});

test('missing remote scene index shows a recoverable error', async ({ page }) => {
  await page.route(`${catalog.assetBaseUrl}**`, route => route.fulfill({
    status: 404, body: 'Missing scene', headers: { 'access-control-allow-origin': '*' }
  }));
  await page.goto('./');
  await expect(page.locator('#status')).toHaveClass('error', { timeout: 30000 });
  await expect(page.locator('#status a')).toHaveText('重新加载');
});

test('missing remote texture shows a chunk error', async ({ page }) => {
  await page.route(`${catalog.assetBaseUrl}**`, async route => {
    const relative = route.request().url().slice(catalog.assetBaseUrl.length);
    await route.fulfill({
      status: relative.endsWith('.webp') ? 404 : 200,
      body: relative.endsWith('.webp') ? 'Missing chunk' : await readFile(join('public', relative)),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }
    });
  });
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('场景数据块加载失败', { timeout: 30000 });
});
