import http from 'node:http';
import path from 'node:path';
import { promises as fs, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import createRecorder from './recorder/engine.cjs';
import { readProjects, updateProjects } from './projects.mjs';
import { buildProjectOverviews } from './project-progress.mjs';
import { mutateRecording, renameRecording, deleteRecording, restoreRecording, assignRecording } from './recordings.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');
const folders = new Set(['documents', 'topics', 'meetings', 'sources', 'inbox']);
const rootFiles = new Set(['INDEX.md', 'LABELS.md', 'IMPORTS.md']);
const extensions = new Set(['.md', '.txt', '.json', '.mp3']);

export async function safePath(root, input) {
  if (typeof input !== 'string' || input.includes('\0') || path.isAbsolute(input)) throw Object.assign(new Error('Invalid file path'), { status: 400 });
  const relative = path.normalize(input);
  if (!rootFiles.has(relative) && !folders.has(relative.split(path.sep)[0])) throw Object.assign(new Error('File is outside the knowledge base'), { status: 403 });
  if (!extensions.has(path.extname(relative))) throw Object.assign(new Error('Unsupported file'), { status: 403 });
  const base = await fs.realpath(root);
  const resolved = await fs.realpath(path.resolve(base, relative));
  const actualRelative = path.relative(base, resolved);
  if (!resolved.startsWith(base + path.sep) || (!rootFiles.has(actualRelative) && !folders.has(actualRelative.split(path.sep)[0])) || !extensions.has(path.extname(actualRelative))) throw Object.assign(new Error('File is outside the knowledge base'), { status: 403 });
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw Object.assign(new Error('Not a file'), { status: 400 });
  return { resolved, relative: path.relative(base, resolved), stat };
}

function parse(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let meta = {};
  if (match) {
    try { meta = yaml.load(match[1], { schema: yaml.JSON_SCHEMA }) || {}; } catch { meta = {}; }
  }
  return { meta: typeof meta === 'object' && !Array.isArray(meta) ? meta : {}, body: match ? text.slice(match[0].length).trim() : text.trim() };
}

async function walk(root, dir) {
  let entries;
  try { entries = await fs.readdir(path.join(root, dir), { withFileTypes: true }); } catch { return []; }
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(root, relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}

export async function readNote(root, relative) {
  const file = await safePath(root, relative);
  if (file.stat.size > 4 * 1024 * 1024) throw Object.assign(new Error('This file is too large to preview; use the original download.'), { status: 413 });
  const text = await fs.readFile(file.resolved, 'utf8');
  const { meta, body } = parse(text);
  if (relative.startsWith('sources/') && relative.endsWith('.md')) {
    try {
      const metadataPath = relative.slice(0, -3) + '.metadata.json';
      const sourceMeta = JSON.parse(await fs.readFile((await safePath(root, metadataPath)).resolved, 'utf8'));
      meta.title ||= sourceMeta.title;
      meta.source_updated_at ||= sourceMeta.version?.createdAt;
      meta.sources ||= sourceMeta.url ? [sourceMeta.url] : [];
    } catch { /* source metadata is optional */ }
  }
  const heading = body.match(/^#\s+(.+)$/m)?.[1];
  const title = String(meta.title || heading || path.basename(relative, path.extname(relative)));
  const summary = (typeof meta.summary === 'string' && meta.summary.trim()) || body.match(/## Summary\s+([\s\S]*?)(?:\n## |$)/)?.[1]?.trim()
    || body.replace(/^#+.*$/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*|`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 190);
  const category = relative.startsWith('sources/') ? 'sources' : relative.startsWith('inbox/') ? 'inbox' : 'notes';
  return {
    id: relative, title, body, summary, category,
    kind: String(meta.content_type || meta.type || (category === 'sources' ? 'source' : 'note')),
    labels: Array.isArray(meta.labels) ? meta.labels.filter(x => typeof x === 'string') : [],
    updated: String(meta.source_updated_at || meta.updated_at || meta.captured_at || file.stat.mtime.toISOString()),
    review: String(meta.review_status || (category === 'sources' ? 'original' : 'needs-review')),
    status: String(meta.document_status || ''),
    sourceLinks: Array.isArray(meta.sources) ? meta.sources.filter(x => typeof x === 'string') : [],
  };
}

export async function getLibrary(root) {
  const files = (await Promise.all([...folders].map(dir => walk(root, dir)))).flat();
  const notes = [];
  const warnings = [];
  for (const relative of files.filter(f => /\.(md|txt)$/.test(f) && !f.startsWith('inbox/'))) {
    try { notes.push(await readNote(root, relative)); } catch (e) { warnings.push({ file: relative, error: e.message }); }
  }
  let metadata = {};
  try { metadata = JSON.parse(await fs.readFile(path.join(root, 'inbox/.metadata.json'), 'utf8')); } catch { /* optional Cord metadata */ }
  const recordingDirs = new Set(files.filter(f => f.startsWith('inbox/') && path.basename(f) === 'audio.mp3').map(f => path.dirname(f)));
  for (const dir of recordingDirs) {
    const base = path.basename(dir);
    const record = metadata[base] || {};
    const transcript = path.join(dir, 'transcript.txt');
    const summary = path.join(dir, 'summary.md');
    let text = '';
    try { text = await fs.readFile((await safePath(root, transcript)).resolved, 'utf8'); } catch { /* transcription pending */ }
    let cordSummary = '';
    try { cordSummary = await fs.readFile((await safePath(root, summary)).resolved, 'utf8'); } catch { /* summary optional */ }
    notes.push({ id: path.join(dir, 'audio.mp3'), title: record.title || base,
      body: `${cordSummary ? cordSummary.replace(/<!--[\s\S]*?-->/g,'').replace(/^\s*# [^\n]+\n*/,'').trim() : 'Recording saved. Transcription may still be processing.'}\n\n## Transcript\n\n${text || 'The transcript is not ready yet.'}`,
      summary: cordSummary ? cordSummary.replace(/<!--[\s\S]*?-->/g,'').replace(/^\s*# [^\n]+\n*/,'').trim().split(/\n\n|\n## /)[0].replace(/^## [^\n]+\n*/,'').slice(0,240) : text ? text.replace(/\s+/g,' ').slice(0,190) : 'Recording saved. Waiting for a transcript.',
      category: 'inbox', kind: 'recording', labels: typeof record.project === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.project) ? ['project:' + record.project] : [], updated: record.createdAt || (await fs.stat(path.join(root, dir))).mtime.toISOString(),
      review: 'not-ingested', status: text ? 'transcribed' : 'processing', sourceLinks: [],
      audio: '/api/raw?path=' + encodeURIComponent(path.join(dir, 'audio.mp3')), duration: record.duration || null });
  }
  for (const relative of files.filter(f => f.startsWith('inbox/') && /\.(md|txt)$/.test(f) && ![...recordingDirs].some(d => f.startsWith(d + '/')))) {
    try { notes.push(await readNote(root, relative)); } catch (e) { warnings.push({ file: relative, error: e.message }); }
  }
  notes.sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title));
  let projectOverviews = {};
  try {
    const file = await safePath(root, 'topics/project-progress.json');
    projectOverviews = buildProjectOverviews(JSON.parse(await fs.readFile(file.resolved, 'utf8')), notes);
  } catch (error) { if(error.code !== 'ENOENT') warnings.push({file:'topics/project-progress.json',error:'Project progress could not be read'}); }
  return { notes, warnings, projectOverviews, refreshedAt: new Date().toISOString() };
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
export function createAppServer(root = defaultRoot, dist = path.join(here, 'dist'), recorder = createRecorder({recordingsDir:path.join(root,'inbox'), withMutation:operation => mutateRecording(root,operation)})) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      if (!/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) return json(403, { error: 'Local access only' });
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(403, { error: 'Cross-origin access denied' });
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/capture/')) {
        const action = url.pathname.slice('/api/capture/'.length);
        if (req.method === 'GET' && action === 'capabilities') return json(200, await recorder.capabilities());
        if (req.method === 'GET' && action === 'status') return json(200, recorder.status(Math.max(0, Number(url.searchParams.get('since')) || 0)));
        if (req.method === 'GET' && action === 'recordings') return json(200, await recorder.list());
        if (req.method !== 'POST' || !['start','pause','resume','stop','transcribe','summarize'].includes(action)) return json(405,{error:'Unsupported recording action.'});
        if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-second-brain'] !== 'capture' || !req.headers['content-type']?.startsWith('application/json')) return json(403,{error:'Recording controls must come from Gridex.'});
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) return json(413,{error:'Request too large.'}); }
        let input; try { input = JSON.parse(body); } catch { return json(400,{error:'Invalid request.'}); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) return json(400,{error:'Invalid request.'});
        if (action === 'stop') {
          if (typeof input.title !== 'string' || input.title.length > 200 || /[\x00-\x1f]/.test(input.title)) return json(400,{error:'Enter a recording title up to 200 characters.'});
          if (input.project) {
            const allowed = (await getLibrary(root)).notes.some(n => n.labels.includes('project:' + input.project));
            if (typeof input.project !== 'string' || !allowed) return json(400,{error:'Choose an existing project.'});
          }
          const item = await recorder.stop(input.title,input.project);
          return json(200,{...item, noteId:'inbox/' + item.id + '/audio.mp3'});
        }
        if (['transcribe','summarize'].includes(action)) {
          const file = input.id;
          if (typeof file !== 'string' || !/^inbox\/[^/.][^/]*\/audio\.mp3$/.test(file)) return json(400,{error:'Choose an inbox recording.'});
          await safePath(root,file);
          return json(202,await recorder[action](file.split('/')[1]));
        }
        return json(200,await recorder[action]());
      }
      if (url.pathname === '/api/projects') {
        if (req.method === 'GET') return json(200, await readProjects(root));
        if (req.method !== 'PATCH') return json(405, { error: 'Method not allowed' });
        if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-second-brain'] !== 'projects' || !req.headers['content-type']?.startsWith('application/json')) return json(403, { error: 'Project changes must come from this interface.' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 65536) return json(413, { error: 'Request is too large.' }); }
        let input; try { input = JSON.parse(body); } catch { return json(400, { error: 'Invalid request.' }); }
        const allowed = [...new Set((await getLibrary(root)).notes.flatMap(n => n.labels.filter(l => l.startsWith('project:')).map(l => l.slice(8))))];
        return json(200, await updateProjects(root, input, allowed));
      }
      if (['PATCH', 'DELETE', 'POST'].includes(req.method) && ['/api/recordings', '/api/recordings/restore'].includes(url.pathname)) {
        if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-second-brain'] !== 'recordings' || !req.headers['content-type']?.startsWith('application/json')) return json(403, { error: 'Recording changes must come from this interface.' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) return json(413, { error: 'Request is too large.' }); }
        let input; try { input = JSON.parse(body); } catch { return json(400, { error: 'Invalid request.' }); }
        const result = await mutateRecording(root, async () => {
          if (url.pathname === '/api/recordings/restore' && req.method === 'POST') return restoreRecording(root, input?.token);
          if (url.pathname === '/api/recordings' && req.method === 'PATCH') {
            if (input && Object.hasOwn(input,'project')) {
              if (input.project !== null && input.project !== '' && (typeof input.project !== 'string' || !(await getLibrary(root)).notes.some(n => n.labels.includes('project:' + input.project)))) throw Object.assign(new Error('Choose an existing project.'),{status:400});
              return assignRecording(root,input.id,input.project);
            }
            return renameRecording(root, input?.id, input?.title);
          }
          if (url.pathname === '/api/recordings' && req.method === 'DELETE') { if (typeof input?.id === 'string' && recorder.busy?.(input.id.split('/')[1])) throw Object.assign(new Error('Wait for transcription and summary to finish before deleting.'),{status:409}); return deleteRecording(root, input?.id); }
          throw Object.assign(new Error('Method not allowed'), { status: 405 });
        });
        return json(200, result);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Changes are supported only for inbox recordings.' });
      if (url.pathname === '/api/health') return json(200, { app: 'second-brain', root: path.resolve(root) });
      if (url.pathname === '/api/library') return json(200, await getLibrary(root));
      if (url.pathname === '/api/note') {
        const requested = url.searchParams.get('path');
        if (requested?.endsWith('.mp3')) {
          await safePath(root, requested);
          const note = (await getLibrary(root)).notes.find(n => n.id === requested && n.audio);
          return note ? json(200, note) : json(404, { error: 'Recording not found' });
        }
        return json(200, await readNote(root, requested));
      }
      let resolved, stat;
      if (url.pathname === '/api/raw') {
        ({ resolved, stat } = await safePath(root, url.searchParams.get('path')));
      } else {
        const filename = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
        if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) return json(404, { error: 'Not found' });
        resolved = path.join(dist, filename);
        stat = await fs.stat(resolved);
      }
      const headers = { 'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      let start = 0, end = stat.size - 1, code = 200;
      if (req.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!range || Number(range[1]) >= stat.size || (range[2] && Number(range[2]) < Number(range[1]))) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end();
        }
        start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`; code = 206;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      res.writeHead(code, headers);
      if (req.method === 'HEAD' || stat.size === 0) return res.end();
      const stream = createReadStream(resolved, { start, end }); stream.on('error', () => res.destroy()); stream.pipe(res);
    } catch (e) { if (!res.headersSent) json(e.status || (e.code === 'ENOENT' ? 404 : 500), { error: e.message || 'Could not read file' }); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAppServer();
  const port = Number(process.env.PORT || 4180);
  server.listen(port, '127.0.0.1', () => console.log(`Gridex: http://127.0.0.1:${port}`));
}
