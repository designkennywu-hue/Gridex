import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const queues = new Map();
const invalid = message => Object.assign(new Error(message), { status: 400 });
const valid = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 100;
export async function readProjects(root) {
  const file = path.join(root, '.projects.json');
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Project settings must be a regular file.');
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(data.order) || !Array.isArray(data.archived) || ![...data.order, ...data.archived].every(valid)) throw new Error('Project settings are invalid.');
    return { order: [...new Set(data.order)], archived: [...new Set(data.archived)] };
  } catch (e) { if (e.code === 'ENOENT') return { order: [], archived: [] }; throw e; }
}
export async function updateProjects(root, input, allowed) {
  const previous = queues.get(root) || Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const data = await readProjects(root);
    if (Array.isArray(input?.order) && Object.keys(input).length === 1) {
      if (input.order.length > 500 || !input.order.every(id => valid(id) && allowed.includes(id)) || new Set(input.order).size !== input.order.length) throw invalid('Invalid project order.');
      data.order = [...input.order, ...data.order.filter(id => !input.order.includes(id))];
    } else if (valid(input?.id) && allowed.includes(input.id) && typeof input.archived === 'boolean' && Object.keys(input).length === 2) {
      data.archived = data.archived.filter(id => id !== input.id);
      if (input.archived) data.archived.push(input.id);
    } else throw invalid('Choose an existing project and a valid change.');
    const temp = path.join(root, '.projects-' + randomUUID() + '.tmp');
    try { await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); await fs.rename(temp, path.join(root, '.projects.json')); }
    finally { await fs.rm(temp, { force: true }); }
    return data;
  });
  queues.set(root, work);
  try { return await work; } finally { if (queues.get(root) === work) queues.delete(root); }
}
