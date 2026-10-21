'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

module.exports = function createRecorder({recordingsDir, withMutation = operation => operation(), assetsDir = __dirname}) {
const ROOT = assetsDir;
const PUBLIC_DIR = path.join(ROOT, 'public');
const MODELS_DIR = path.join(ROOT, 'models');
const RECORDINGS_DIR = recordingsDir;
const META_PATH = path.join(RECORDINGS_DIR,'.metadata.json');

// ---------- native recording (system audio + mic via ScreenCaptureKit) ----------

const CAPTURE_BIN = path.join(ROOT, 'bin', 'cord-capture');
const CAPTURE_RATE = 48000;

let lamejsMod = null;
function loadLame() {
  if (!lamejsMod) {
    const src = fs.readFileSync(path.join(PUBLIC_DIR, 'vendor', 'lame.min.js'), 'utf8');
    lamejsMod = new Function('window', src + '; return typeof lamejs !== "undefined" ? lamejs : window.lamejs;')({});
  }
  return lamejsMod;
}

function captureAvailable() {
  return fs.existsSync(CAPTURE_BIN);
}

let recSession = null;

function permissionHint(msg) {
  if (/permission|TCC|declined/i.test(msg || '')) {
    return (msg || '') + ' — enable “node” under System Settings → Privacy & Security → Screen Recording (and Microphone), then try again.';
  }
  return msg;
}

function startRecordSession() {
  const lame = loadLame();
  const child = spawn(CAPTURE_BIN, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  const s = {
    child,
    encoder: new lame.Mp3Encoder(1, CAPTURE_RATE, 128),
    chunks: [],
    samples: 0,
    paused: false,
    state: 'starting', // starting | recording | paused | stopping | error
    error: null,
    exited: false,
    levels: [],
    levelPeak: 0,
    levelCount: 0,
    remainder: Buffer.alloc(0),
    stderrTail: '',
    startedAt: new Date(),
  };
  child.stdout.on('data', (d) => {
    if (s.state === 'starting') s.state = s.paused ? 'paused' : 'recording';
    if (s.paused || s.state === 'stopping') return;
    const buf = s.remainder.length ? Buffer.concat([s.remainder, d]) : d;
    const usable = buf.length - (buf.length % 2);
    s.remainder = buf.subarray(usable);
    if (!usable) return;
    const pcm = new Int16Array(usable / 2);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = buf.readInt16LE(i * 2);
      const v = Math.abs(pcm[i]) / 32768;
      if (v > s.levelPeak) s.levelPeak = v;
      if (++s.levelCount >= 4096) { // ~85ms per level sample
        s.levels.push(Math.round(s.levelPeak * 1000) / 1000);
        s.levelPeak = 0;
        s.levelCount = 0;
      }
    }
    const out = s.encoder.encodeBuffer(pcm);
    if (out.length) s.chunks.push(Buffer.from(out));
    s.samples += pcm.length;
  });
  child.stderr.on('data', (d) => {
    s.stderrTail = (s.stderrTail + d.toString()).slice(-500);
  });
  child.on('error', (err) => {
    s.state = 'error';
    s.error = permissionHint(err.message);
  });
  child.on('close', (code) => {
    s.exited = true;
    if (code !== 0 && s.state !== 'stopping') {
      s.state = 'error';
      s.error = permissionHint((s.stderrTail.split('\n').filter(Boolean).pop() || `capture helper exited ${code}`).replace(/^cord-capture:\s*/, ''));
    }
  });
  return s;
}

function endRecordChild(s) {
  return new Promise((resolve) => {
    if (s.exited) return resolve();
    const t = setTimeout(() => {
      try { s.child.kill('SIGKILL'); } catch {}
      resolve();
    }, 3000);
    s.child.once('close', () => {
      clearTimeout(t);
      resolve();
    });
    try { s.child.kill('SIGTERM'); } catch {}
  });
}

async function finalizeRecordSession(s, title, project) {
  s.state = 'stopping';
  await endRecordChild(s);
  const tail = s.encoder.flush();
  if (tail.length) s.chunks.push(Buffer.from(tail));
  const body = Buffer.concat(s.chunks);
  const duration = s.samples / CAPTURE_RATE;
  if (s.error && duration < 0.3) throw Object.assign(new Error(s.error), { status: 500 });
  if (body.length < 128 || duration < 0.3) {
    throw Object.assign(new Error('nothing was captured'), { status: 400 });
  }
  const finalTitle = (title || '').trim().slice(0, 200) || defaultTitle(s.startedAt);
  const id = makeRecordingId(finalTitle, s.startedAt);
  await fsp.mkdir(recDir(id), { recursive: true });
  await fsp.writeFile(audioPath(id), body);
  let record;
  await withMutation(async () => {
    const meta = loadMeta();
    meta[id] = {
    title: finalTitle,
    project: project || null,
    duration,
    createdAt: s.startedAt.toISOString(),
  };
    await saveMeta(meta);
    record = meta[id];
  });
  if (findWhisperBin() && findModel()) enqueueTranscription(id);
  return { id, ...record, size: body.length };
}

// ---------- summarization backends ----------

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

const SUMMARY_SYSTEM_PROMPT = require('./summary-style.cjs');

async function ollamaAvailable() {
  try {
    const res = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const data = await res.json();
    return (data.models || []).some((m) => m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL.split(':')[0] + ':'));
  } catch {
    return false;
  }
}

function resolveOllamaModel(models) {
  const names = models.map((m) => m.name);
  if (names.includes(OLLAMA_MODEL)) return OLLAMA_MODEL;
  const family = OLLAMA_MODEL.split(':')[0];
  return names.find((n) => n.startsWith(family + ':')) || names[0];
}

async function summarizeWithOllama(transcriptText, context) {
  const tags = await (await fetch(OLLAMA_URL + '/api/tags')).json();
  const model = resolveOllamaModel(tags.models || []);
  if (!model) throw new Error('no Ollama models installed — run: ollama pull ' + OLLAMA_MODEL);
  const res = await fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      options: { num_ctx: 16384 },
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: context + '\n\nTranscript:\n\n' + transcriptText },
      ],
    }),
  });
  if (!res.ok) throw new Error('Ollama returned ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = data.message && data.message.content;
  if (!text || !text.trim()) throw new Error('Ollama returned an empty summary');
  return { markdown: text.trim(), backend: 'ollama', model };
}

async function resolveSummaryBackend() { return await ollamaAvailable() ? 'ollama' : null; }

// ---------- metadata ----------

function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch {
    return {};
  }
}

let metaWriteChain = Promise.resolve();
function saveMeta(meta) {
  const work = metaWriteChain.catch(() => {}).then(async () => {
    const temp = META_PATH + '.index-' + require('crypto').randomUUID() + '.tmp';
    try { await fsp.writeFile(temp, JSON.stringify(meta, null, 2) + '\n', {flag:'wx'}); await fsp.rename(temp, META_PATH); }
    finally { await fsp.rm(temp, {force:true}); }
  });
  metaWriteChain = work;
  return work;
}

// Each recording is a folder named "<title> <date time>" containing
// audio.mp3, transcript.json, transcript.txt, and summary.md.
// The folder name is the recording's id.
function isValidId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 220 &&
    !id.includes('/') && !id.includes('\\') && !id.includes('\0') &&
    !id.startsWith('.') && id !== '..';
}

function recDir(id) { return path.join(RECORDINGS_DIR, id); }
function audioPath(id) { return path.join(recDir(id), 'audio.mp3'); }

function sanitizeTitle(title) {
  return String(title || '')
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/, '') || 'Recording';
}

function folderStamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}.${p(date.getMinutes())}`;
}

// "<title> <YYYY-MM-DD HH.MM>", uniquified with " (2)", " (3)" … if taken
function makeRecordingId(title, date) {
  const base = sanitizeTitle(title) + ' ' + folderStamp(date);
  let id = base;
  for (let n = 2; fs.existsSync(recDir(id)); n++) id = `${base} (${n})`;
  return id;
}

// ---------- transcription (local whisper.cpp) ----------

function firstExisting(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function findWhisperBin() {
  return firstExisting([
    process.env.WHISPER_BIN,
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
  ]);
}

// Prefer the most capable model present in ./models (or WHISPER_MODEL override).
const MODEL_PREFERENCE = [
  'large-v3-turbo', 'large-v3', 'large', 'medium.en', 'medium',
  'small.en', 'small', 'base.en', 'base', 'tiny.en', 'tiny',
];
function findModel() {
  if (process.env.WHISPER_MODEL && fs.existsSync(process.env.WHISPER_MODEL)) {
    return process.env.WHISPER_MODEL;
  }
  let files = [];
  try {
    files = fs.readdirSync(MODELS_DIR).filter((f) => f.startsWith('ggml-') && f.endsWith('.bin'));
  } catch {
    return null;
  }
  for (const name of MODEL_PREFERENCE) {
    const hit = files.find((f) => f === `ggml-${name}.bin`);
    if (hit) return path.join(MODELS_DIR, hit);
  }
  return files.length ? path.join(MODELS_DIR, files[0]) : null;
}

function transcriptPaths(id) {
  return {
    json: path.join(recDir(id), 'transcript.json'),
    txt: path.join(recDir(id), 'transcript.txt'),
    whisperOut: path.join(recDir(id), 'whisper-tmp'),
  };
}

function summaryPath(id) {
  return path.join(recDir(id), 'summary.md');
}

// ---------- summary jobs ----------

const summaryJobs = new Map(); // id -> {status, error, backend}
const summaryQueue = [];
let summaryActive = false;

function summaryStatus(id) {
  const job = summaryJobs.get(id);
  if (job && (job.status === 'queued' || job.status === 'running')) {
    return { state: job.status, backend: job.backend };
  }
  if (fs.existsSync(summaryPath(id))) return { state: 'done' };
  if (job && job.status === 'error') return { state: 'error', error: job.error };
  return { state: 'none' };
}

function enqueueSummary(id, backend) {
  const existing = summaryJobs.get(id);
  if (existing && (existing.status === 'queued' || existing.status === 'running')) return existing;
  const job = { status: 'queued', error: null, backend };
  summaryJobs.set(id, job);
  summaryQueue.push(id);
  processSummaryQueue();
  return job;
}

async function processSummaryQueue() {
  if (summaryActive) return;
  const id = summaryQueue.shift();
  if (!id) return;
  summaryActive = true;
  const job = summaryJobs.get(id);
  try {
    job.status = 'running';
    await runSummary(id, job);
    job.status = 'done';
  } catch (err) {
    console.error('summary failed for', id, err.message);
    job.status = 'error';
    job.error = String(err.message || err).slice(0, 300);
  } finally {
    summaryActive = false;
    processSummaryQueue();
  }
}

async function runSummary(id, job) {
  const transcript = JSON.parse(await fsp.readFile(transcriptPaths(id).json, 'utf8'));
  if (!transcript.text || !transcript.text.trim()) {
    throw new Error('the transcript is empty — nothing to summarize');
  }
  const meta = loadMeta();
  const m = meta[id] || {};
  const mins = Math.round(((m.duration || 0) / 60) * 10) / 10;
  const context =
    `Meeting: ${m.title || id}\n` +
    (m.createdAt ? `Recorded: ${m.createdAt}\n` : '') +
    (mins ? `Duration: ~${mins} minutes\n` : '');

  const result = job.backend === 'claude'
    ? await summarizeWithOllama(transcript.text, context)
    : await summarizeWithOllama(transcript.text, context);

  const header =
    `<!-- generated by ${result.backend}:${result.model} on ${new Date().toISOString()} -->\n\n` +
    `# ${m.title || id}\n\n`;
  await fsp.writeFile(summaryPath(id), header + result.markdown + '\n');
}

// One transcription at a time — whisper saturates the GPU/CPU on its own.
const jobs = new Map(); // id -> {status, progress, error}
const jobQueue = [];
let jobActive = false;

function transcriptStatus(id) {
  const job = jobs.get(id);
  if (job && (job.status === 'queued' || job.status === 'running')) {
    return { state: job.status, progress: job.progress };
  }
  if (fs.existsSync(transcriptPaths(id).json)) return { state: 'done' };
  if (job && job.status === 'error') return { state: 'error', error: job.error };
  return { state: 'none' };
}

function enqueueTranscription(id) {
  const existing = jobs.get(id);
  if (existing && (existing.status === 'queued' || existing.status === 'running')) return existing;
  const job = { status: 'queued', progress: 0, error: null };
  jobs.set(id, job);
  jobQueue.push(id);
  processQueue();
  return job;
}

async function processQueue() {
  if (jobActive) return;
  const id = jobQueue.shift();
  if (!id) return;
  jobActive = true;
  const job = jobs.get(id);
  try {
    await runWhisper(id, job);
    job.status = 'done';
    // chain: summarize automatically once the transcript exists
    if (!fs.existsSync(summaryPath(id))) {
      resolveSummaryBackend()
        .then((backend) => { if (backend) enqueueSummary(id, backend); })
        .catch(() => {});
    }
  } catch (err) {
    console.error('transcription failed for', id, err.message);
    job.status = 'error';
    job.error = String(err.message || err).slice(0, 300);
  } finally {
    jobActive = false;
    processQueue();
  }
}

function spawnWhisper(bin, args, job) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let errTail = '';
    child.stderr.on('data', (d) => {
      const s = d.toString();
      errTail = (errTail + s).slice(-4000);
      const matches = s.match(/progress\s*=\s*(\d+)%/g);
      if (matches) {
        const last = /(\d+)%/.exec(matches[matches.length - 1]);
        if (last) job.progress = Math.min(99, Number(last[1]));
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`whisper exited ${code}: ${errTail.slice(-250)}`));
    });
  });
}

async function runWhisper(id, job) {
  const bin = findWhisperBin();
  const model = findModel();
  if (!bin) throw new Error('whisper-cli not found — install with: brew install whisper-cpp');
  if (!model) throw new Error('no whisper model in ./models — see README');

  job.status = 'running';
  const audio = audioPath(id);
  const { json, txt, whisperOut } = transcriptPaths(id);
  const lang = /\.en\.bin$/.test(model) ? 'en' : 'auto';
  const baseArgs = ['-m', model, '-oj', '-of', whisperOut, '--print-progress', '-l', lang];

  let tmpWav = null;
  try {
    try {
      await spawnWhisper(bin, [...baseArgs, '-f', audio], job);
    } catch (err) {
      // Fallback for whisper builds without built-in MP3 decoding:
      // convert with macOS's afconvert, then retry on the WAV.
      tmpWav = path.join(os.tmpdir(), 'recorder-' + process.pid + '-' + Date.now() + '.wav');
      await new Promise((resolve, reject) => {
        const c = spawn('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', audio, tmpWav]);
        c.on('error', reject);
        c.on('close', (code) => (code === 0 ? resolve() : reject(err)));
      });
      await spawnWhisper(bin, [...baseArgs, '-f', tmpWav], job);
    }

    const raw = JSON.parse(await fsp.readFile(whisperOut + '.json', 'utf8'));
    const segments = (raw.transcription || []).map((s) => ({
      start: (s.offsets ? s.offsets.from : 0) / 1000,
      end: (s.offsets ? s.offsets.to : 0) / 1000,
      text: (s.text || '').trim(),
    })).filter((s) => s.text);
    const text = segments.map((s) => s.text).join('\n');

    const meta = loadMeta();
    const normalized = {
      id,
      title: (meta[id] && meta[id].title) || id,
      language: (raw.result && raw.result.language) || lang,
      model: path.basename(model),
      createdAt: new Date().toISOString(),
      text,
      segments,
    };
    await fsp.writeFile(json, JSON.stringify(normalized, null, 2));
    await fsp.writeFile(txt, text + '\n');
  } finally {
    await fsp.unlink(whisperOut + '.json').catch(() => {});
    if (tmpWav) await fsp.unlink(tmpWav).catch(() => {});
  }
}

async function listRecordings() {
  const meta = loadMeta();
  let entries = [];
  try {
    entries = await fsp.readdir(RECORDINGS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const id = entry.name;
    let stat;
    try {
      stat = await fsp.stat(audioPath(id));
    } catch {
      continue; // folder without audio.mp3 — not a recording
    }
    const m = meta[id] || {};
    items.push({
      id,
      // strip the "YYYY-MM-DD HH.MM" stamp for folders created by hand
      title: m.title || id.replace(/ \d{4}-\d{2}-\d{2} \d{2}\.\d{2}( \(\d+\))?$/, ''),
      // 128 kbps CBR fallback estimate for files dropped in by hand
      duration: typeof m.duration === 'number' ? m.duration : (stat.size * 8) / 128000,
      size: stat.size,
      createdAt: m.createdAt || stat.mtime.toISOString(),
      transcript: transcriptStatus(id),
      summary: summaryStatus(id),
    });
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return items;
}

function defaultTitle(date) {
  return 'Recording ' + date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const fail = (message, status = 400) => Object.assign(new Error(message), {status});
function validateId(id) {
  if (!isValidId(id) || ['__proto__','constructor','prototype'].includes(id)) throw fail('Invalid recording.');
  const dir = recDir(id);
  if (!fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink() || !fs.existsSync(audioPath(id)) || fs.lstatSync(audioPath(id)).isSymbolicLink()) throw fail('Recording not found.', 404);
}
return {
  async capabilities() { return {capture:{system:captureAvailable()}, whisper:!!(findWhisperBin() && findModel()), model:findModel() ? path.basename(findModel()).replace(/^ggml-|\.bin$/g,'') : null, summary:{available:!!(await resolveSummaryBackend()), backend:'ollama', model:OLLAMA_MODEL}, recordingsDir:RECORDINGS_DIR}; },
  status(since = 0) {
    if (!recSession) return {state:'idle',elapsed:0,levels:[],next:0};
    const s = recSession;
    if (s.exited && !['stopping','error'].includes(s.state)) { s.state='error'; s.error='Audio capture ended unexpectedly. Save the captured audio before starting again.'; }
    return {state:s.state,error:s.error,elapsed:s.samples / CAPTURE_RATE,levels:s.levels.slice(Math.max(0,since)).slice(-80),next:s.levels.length};
  },
  start() {
    if (!captureAvailable()) throw fail('Audio capture helper is unavailable.',503);
    if (recSession && !(recSession.state === 'error' && recSession.samples === 0 && recSession.exited)) throw fail('A recording is already open. Save it before starting another.',409);
    recSession = startRecordSession(); return {state:'starting'};
  },
  pause() { if (!recSession || recSession.exited || recSession.state === 'stopping') throw fail('No recording to pause.',409); recSession.paused=true; recSession.state='paused'; return {state:'paused'}; },
  resume() { if (!recSession || recSession.exited || recSession.state === 'stopping') throw fail('No recording to resume.',409); recSession.paused=false; recSession.state='recording'; return {state:'recording'}; },
  async stop(title, project) {
    if (!recSession) throw fail('No recording to save.',409);
    if (recSession.state === 'stopping') throw fail('Recording is being saved.',409);
    const session = recSession;
    try { const result = await finalizeRecordSession(session,title,project); recSession=null; return result; }
    catch (e) { session.state='error'; session.error=e.message; if (session.samples / CAPTURE_RATE < 0.3) recSession=null; throw e; }
  },
  list: listRecordings,
  busy(id) { return ['queued','running'].includes(jobs.get(id)?.status) || ['queued','running'].includes(summaryJobs.get(id)?.status); },
  async transcribe(id) { validateId(id); if (!findWhisperBin() || !findModel()) throw fail('Local transcription model is unavailable.',503); if (!fs.existsSync(transcriptPaths(id).json)) enqueueTranscription(id); return transcriptStatus(id); },
  async summarize(id) { validateId(id); if (!fs.existsSync(transcriptPaths(id).json)) throw fail('Wait for transcription first.',409); const backend=await resolveSummaryBackend(); if (!backend) throw fail('Local summaries need Ollama running with '+OLLAMA_MODEL+'.',503); if (!fs.existsSync(summaryPath(id))) enqueueSummary(id,backend); return summaryStatus(id); }
};
};
