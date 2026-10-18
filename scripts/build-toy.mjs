import { cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist-toy');
const archive = resolve(root, 'dist-toy.zip');
const config = JSON.parse(await readFile(resolve(root, 'toy-build.config.json'), 'utf8'));
const remote = new URL(config.assetBaseUrl);
if (remote.protocol !== 'https:' || remote.username || remote.password || remote.search || remote.hash) {
  throw new Error('assetBaseUrl 必须是无凭据、查询参数或片段的 HTTPS 目录地址');
}
if (!remote.pathname.endsWith('/')) remote.pathname += '/';
// Check the packaging prerequisite before replacing any previous output.
execFileSync('zip', ['-v'], { stdio: 'ignore' });
await rm(archive, { force: true });
await build({ root, publicDir: false, build: { outDir: output, emptyOutDir: true } });
for (const name of ['viewer-config.json', 'licenses']) {
  await cp(resolve(root, 'public', name), resolve(output, name), { recursive: true });
}
const catalog = JSON.parse(await readFile(resolve(root, 'public/scenes.json'), 'utf8'));
catalog.assetBaseUrl = remote.href;
await writeFile(resolve(output, 'scenes.json'), `${JSON.stringify(catalog, null, 2)}\n`);

async function totalBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    bytes += entry.isDirectory() ? await totalBytes(path) : (await stat(path)).size;
  }
  return bytes;
}
const bytes = await totalBytes(output);
if (bytes >= 50_000_000) throw new Error(`Toy 解压后体积 ${bytes} 字节，必须小于 50 MB`);
if ((await stat(resolve(output, 'index.html'))).size > 1_000_000) {
  throw new Error('Toy 入口 index.html 超过 1 MB');
}
execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: output, stdio: 'inherit' });
const zipBytes = (await stat(archive)).size;
if (zipBytes >= 50_000_000) {
  await rm(archive);
  throw new Error('Toy ZIP 超过 50 MB，已移除');
}
console.log(`Toy: ${bytes} bytes unpacked; ${zipBytes} bytes ZIP\n${archive}\nScene assets: ${remote.href}`);
