import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4180);
const url = `http://127.0.0.1:${port}`;
async function healthy() {
  try {
    const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(1200) });
    const health = await response.json();
    return health.app === 'second-brain' && health.root === path.resolve(here, '..');
  } catch { return false; }
}
if (!existsSync(path.join(here, 'dist/index.html'))) throw new Error('Run npm run build in the interface folder first.');
const agent = path.join(os.homedir(),'Library/LaunchAgents/io.gridware.index.plist');
if (!await healthy() && existsSync(agent)) {
  spawnSync('/bin/launchctl',['kickstart',`gui/${process.getuid()}/io.gridware.index`],{stdio:'ignore'});
  for (let i=0;i<20 && !await healthy();i++) await new Promise(r=>setTimeout(r,200));
}
if (!await healthy()) {
  const log = openSync(path.join(here, '.server.log'), 'a');
  const child = spawn(process.execPath, [path.join(here, 'server.mjs')], { cwd: here, detached: true, stdio: ['ignore', log, log], env: process.env });
  child.unref(); closeSync(log);
  for (let i = 0; i < 20 && !await healthy(); i++) await new Promise(r => setTimeout(r, 200));
  if (!await healthy()) throw new Error('Could not start Index. Check interface/.server.log; port 4180 may be in use.');
}
spawn('open', [url], { stdio: 'ignore' }).unref();
console.log(`Index is running at ${url}`);
