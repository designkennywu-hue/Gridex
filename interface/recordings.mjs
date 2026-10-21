import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { safePath } from './server.mjs';

const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const locks = new Map();
export function mutateRecording(root, operation) {
  const key = path.resolve(root);
  const pending = (locks.get(key) || Promise.resolve()).then(operation);
  const settled = pending.catch(() => {});
  locks.set(key, settled);
  settled.finally(() => { if (locks.get(key) === settled) locks.delete(key); });
  return pending;
}
function recordingId(input) {
  if (typeof input !== 'string' || !/^inbox\/[^/.][^/]*\/audio\.mp3$/.test(input) || input.includes('\\') || input.includes('\0')) throw failure('Choose a recording from the inbox.');
  if (['__proto__', 'constructor', 'prototype'].includes(input.split('/')[1])) throw failure('Invalid recording folder.');
  return input;
}
async function directory(root, relative, create = false) {
  const base = await fs.realpath(root);
  const pieces = relative.split('/');
  let current = base;
  for (const piece of pieces) {
    current = path.join(current, piece);
    if (create) await fs.mkdir(current).catch(e => { if (e.code !== 'EEXIST') throw e; });
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure('Recording folders cannot be symbolic links.', 403);
  }
  if (!(await fs.realpath(current)).startsWith(base + path.sep)) throw failure('Invalid recording folder.', 403);
  return current;
}
async function metadata(root) {
  const file = path.join(await directory(root, 'inbox'), '.metadata.json');
  let original = null;
  try { const stat = await fs.lstat(file); if (stat.isSymbolicLink()) throw failure('Invalid recording metadata.', 403); original = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let data;
  try { data = original === null ? {} : JSON.parse(original); } catch { throw failure('Recording metadata could not be read. Nothing was changed.', 409); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('Invalid recording metadata.', 409);
  return { file, original, data };
}
async function saveMetadata(state) {
  let current = null;
  try { const stat = await fs.lstat(state.file); if (stat.isSymbolicLink()) throw failure('Invalid recording metadata.', 403); current = await fs.readFile(state.file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (current !== state.original) throw failure('Cord updated the recordings. Refresh and try again.', 409);
  const temp = state.file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(state.data, null, 2) + '\n', { flag: 'wx' }); await fs.rename(temp, state.file); }
  finally { await fs.unlink(temp).catch(() => {}); }
}

export async function renameRecording(root, id, title) {
  recordingId(id);
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 || /[\x00-\x1f]/.test(title)) throw failure('Enter a recording name between 1 and 200 characters.');
  await directory(root, path.posix.dirname(id));
  await safePath(root, id);
  const state = await metadata(root);
  const key = id.split('/')[1];
  state.data[key] = { ...state.data[key], title: title.trim(), titleSource: 'manual' };
  await saveMetadata(state);
  return { id, title: title.trim(), titleSource: 'manual' };
}

export async function deleteRecording(root, id) {
  recordingId(id);
  const source = await directory(root, path.posix.dirname(id));
  await safePath(root, id);
  const state = await metadata(root);
  const key = id.split('/')[1];
  const token = randomUUID();
  const trash = await directory(root, 'inbox/.trash/' + token, true);
  await fs.writeFile(path.join(trash, 'manifest.json'), JSON.stringify({ id, record: state.data[key] || {}, deletedAt: new Date().toISOString() }), { flag: 'wx' });
  await fs.rename(source, path.join(trash, 'recording'));
  delete state.data[key];
  try { await saveMetadata(state); } catch (e) { await fs.rename(path.join(trash, 'recording'), source); throw e; }
  return { id, undoToken: token };
}

export async function restoreRecording(root, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token)) throw failure('Invalid recovery reference.');
  const trash = await directory(root, 'inbox/.trash/' + token);
  const manifest = path.join(trash, 'manifest.json');
  if ((await fs.lstat(manifest)).isSymbolicLink()) throw failure('Invalid recovery reference.', 403);
  const entry = JSON.parse(await fs.readFile(manifest, 'utf8'));
  recordingId(entry.id);
  const source = await directory(root, 'inbox/.trash/' + token + '/recording');
  const destination = path.join(await directory(root, 'inbox'), entry.id.split('/')[1]);
  try { await fs.lstat(destination); throw failure('A recording already exists at this location.', 409); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const state = await metadata(root);
  state.data[entry.id.split('/')[1]] = entry.record;
  await fs.rename(source, destination);
  try { await saveMetadata(state); } catch (e) { await fs.rename(destination, source); throw e; }
  return { id: entry.id };
}

export async function assignRecording(root, id, project) {
  recordingId(id); await directory(root, path.posix.dirname(id)); await safePath(root, id);
  const state = await metadata(root); const key = id.split('/')[1];
  state.data[key] = {...state.data[key], project: project || null};
  await saveMetadata(state); return {id, project: project || null};
}
