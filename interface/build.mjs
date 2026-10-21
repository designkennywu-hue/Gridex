import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const library = process.env.GRIDWARE_UI_DIR || '/Users/Kenny@gridware.io/Desktop/Dev/shared-ui-components';
if (!existsSync(path.join(library, 'src/components/Button/Button.tsx'))) {
  throw new Error('Set GRIDWARE_UI_DIR to your shared-ui-components folder before building.');
}
mkdirSync(path.join(here, 'dist'), { recursive: true });
await build({
  absWorkingDir: here,
  entryPoints: ['src/App.tsx'],
  bundle: true,
  outdir: 'dist',
  entryNames: 'app',
  minify: true,
  jsx: 'automatic',
  sourcemap: true,
  loader: { '.ttf': 'file', '.woff2': 'file', '.svg': 'file' },
  alias: {
    '@gridware/ui': path.join(library, 'src'),
    react: path.join(here, 'node_modules/react'),
    'react-dom': path.join(here, 'node_modules/react-dom'),
    '@mui/material': path.join(here, 'node_modules/@mui/material'),
    '@emotion/react': path.join(here, 'node_modules/@emotion/react'),
    '@emotion/styled': path.join(here, 'node_modules/@emotion/styled'),
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
writeFileSync(path.join(here, 'dist/index.html'), `<!doctype html>
<html lang="en" data-theme="light" data-viewport="desktop"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>Gridex · Kenny</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='12' fill='%2325272b'/%3E%3Ctext x='20' y='27' text-anchor='middle' fill='white' font-family='sans-serif' font-size='23'%3EG%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);
console.log('Built with the current shared-ui-components source, as requested.');
