import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
try {
  const catalog = JSON.parse(await readFile('public/scenes.json', 'utf8'));
  if (!Array.isArray(catalog.scenes) || !catalog.scenes.length || !catalog.scenes.some(scene => scene.id === catalog.defaultScene)) throw new Error('场景目录缺少默认场景');
  const ids = new Set();
  for (const scene of catalog.scenes) {
    if (!/^[a-f0-9]{20}$/.test(scene.id) || ids.has(scene.id) || scene.url !== `scenes/${scene.id}/lod-meta.json`) throw new Error('场景 ID 或路径无效');
    ids.add(scene.id);
    await access(resolve('public', scene.url));
  }
} catch {
  console.error('场景目录无效或缺少已转换场景。检查 public/scenes.json，或运行 npm run convert -- assets/你的文件.ply');
  process.exit(1);
}
