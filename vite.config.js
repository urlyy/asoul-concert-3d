import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: {
    fs: { deny: ['**/*.ply', '**/.cache/**', '.env', '.env.*', '**/.git/**'] },
    watch: { ignored: ['**/assets/**', '**/.cache/**'] }
  }
});
