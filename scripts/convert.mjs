import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join, basename } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  gpu: { type: 'string', default: 'auto' },
  'chunk-k': { type: 'string', default: '128' },
  'coarse-count': { type: 'string', default: '40000' },
  'sh-bands': { type: 'string', default: '3' },
  help: { type: 'boolean', default: false }
} });
if (values.help) {
  console.log('npm run convert -- [assets/scene.ply] [--gpu cpu|0] [--chunk-k 128] [--coarse-count 40000] [--sh-bands 3]');
  process.exit(0);
}
if (positionals.length > 1) throw new Error('只接受一个输入 PLY。');
for (const key of ['chunk-k', 'coarse-count']) {
  if (!Number.isInteger(Number(values[key])) || Number(values[key]) < 1) throw new Error(`${key} 必须为正整数`);
}
if (!/^[0-3]$/.test(values['sh-bands'])) throw new Error('sh-bands 必须为 0–3');
let input = positionals[0];
if (!input) {
  const candidates = (await readdir('assets')).filter(name => name.toLowerCase().endsWith('.ply'));
  if (candidates.length !== 1) throw new Error('assets 中需要恰好一个 PLY，或显式指定：npm run convert -- assets/文件.ply');
  input = join('assets', candidates[0]);
}
input = resolve(input);
const file = await open(input, 'r');
let header;
try {
  const buffer = Buffer.alloc(65536);
  const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
  header = buffer.subarray(0, bytesRead).toString('latin1').split('end_header')[0];
  if (!buffer.subarray(0, bytesRead).includes(Buffer.from('end_header'))) throw new Error('PLY 文件头无效或超过 64KB');
} finally { await file.close(); }
const count = Number(header.match(/^element vertex (\d+)\s*$/m)?.[1]);
if (!header.startsWith('ply') || !count) throw new Error('无效或空的 PLY 文件');
for (const field of ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']) {
  if (!new RegExp(`^property \\S+ ${field}\\s*$`, 'm').test(header)) throw new Error(`缺少 ${field}：此管线需要 3D Gaussian Splatting PLY，普通 XYZ/RGB 点云需使用 Potree 等点云管线。`);
}
const settings = { converter: '3.6.6', pipeline: 1, chunkK: Number(values['chunk-k']), coarseCount: Number(values['coarse-count']), shBands: Number(values['sh-bands']) };
const hash = createHash('sha256').update(JSON.stringify(settings));
for await (const chunk of createReadStream(input)) hash.update(chunk);
const id = hash.digest('hex').slice(0, 20);
const relativeDir = `scenes/${id}`;
const output = resolve('public', relativeDir);
await mkdir('public/scenes', { recursive: true });
let cached = false;
try { cached = JSON.parse(await readFile(join(output, 'conversion.json'), 'utf8')).id === id; } catch { /* first conversion */ }
if (!cached) {
  const work = resolve('.cache', `${id}-${process.pid}`);
  const stage = join(work, 'output');
  await mkdir(stage, { recursive: true });
  const cli = resolve('node_modules/@playcanvas/splat-transform/bin/cli.mjs');
  const run = args => new Promise((resolveRun, reject) => {
    const gpuArgs = values.gpu === 'auto' ? [] : ['--gpu', values.gpu];
    const child = spawn(process.execPath, [cli, ...gpuArgs, ...args], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolveRun() : reject(new Error(`转换失败 (${signal ?? code})，旧场景未更改。临时目录：${work}`)));
  });
  const lods = [input];
  let previousCount = count;
  console.log(`输入：${basename(input)} · ${count.toLocaleString()} 个高斯，生成通用分块 LOD`);
  // Repeatedly halve the preceding level. No scene-specific crops, colors or camera tuning.
  while (previousCount > settings.coarseCount) {
    const next = join(work, `lod${lods.length}.ply`);
    await run([lods.at(-1), '--filter-nan', '--filter-harmonics', String(settings.shBands), '--decimate', '50%', next]);
    lods.push(next);
    previousCount = Math.ceil(previousCount / 2);
  }
  const args = ['--lod-chunk-count', String(settings.chunkK)];
  for (let i = 0; i < lods.length; i++) args.push(lods[i], '--tag-lod', String(i));
  args.push(join(stage, 'lod-meta.json'), '--filter-nan', '--filter-harmonics', String(settings.shBands));
  await run(args);
  await writeFile(join(stage, 'conversion.json'), JSON.stringify({ id, sourceName: basename(input), sourceBytes: (await stat(input)).size, sourceCount: count, levels: lods.length, settings }, null, 2));
  // Never replace live data until conversion has succeeded. Versioned URLs avoid stale chunk caches.
  await rename(stage, output);
  await rm(work, { recursive: true, force: true });
} else console.log('源文件和转换参数未变化，复用已生成的分块。');
const sourceUp = header.match(/^comment Vertical axis:\s*([xyz])\s*$/mi)?.[1]?.toLowerCase();
const rotation = sourceUp === 'z' ? [-90, 0, 0] : sourceUp === 'x' ? [0, 0, 90] : [0, 0, 0];
const manifest = { id, name: basename(input).replace(/\.ply$/i, ''), url: `${relativeDir}/lod-meta.json`, rotation, sourceUp: sourceUp ?? 'unknown (assumed y)' };
let catalog;
try { catalog = JSON.parse(await readFile('public/scenes.json', 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  catalog = { defaultScene: id, showSwitcher: true, scenes: [] };
}
if (!Array.isArray(catalog.scenes)) throw new Error('public/scenes.json 的 scenes 必须是数组');
const existing = catalog.scenes.findIndex(scene => scene.id === id);
if (existing < 0) catalog.scenes.push(manifest);
else catalog.scenes[existing] = { ...manifest, ...catalog.scenes[existing], url: manifest.url, sourceUp: manifest.sourceUp };
catalog.defaultScene ??= id;
const catalogTemp = resolve('public', `scenes.${process.pid}.json`);
await writeFile(catalogTemp, JSON.stringify(catalog, null, 2) + '\n');
await rename(catalogTemp, resolve('public/scenes.json'));
console.log(`就绪：public/${relativeDir}/lod-meta.json\n运行 npm run dev 预览；npm run build 生成纯静态 dist/。`);
