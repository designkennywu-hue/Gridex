import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const queues = new Map();
const validAssignment = value => value === null || valid(value) || (Array.isArray(value) && value.length <= 500 && value.every(valid) && new Set(value).size === value.length);
const invalid = message => Object.assign(new Error(message), { status: 400 });
const valid = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 100;
export async function readProjects(root) {
  const file = path.join(root, '.projects.json');
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Project settings must be a regular file.');
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(data.order) || !Array.isArray(data.archived) || ![...data.order, ...data.archived].every(valid)) throw new Error('Project settings are invalid.');
    if(data.names!==undefined&&(!data.names||typeof data.names!=='object'||Array.isArray(data.names)||Object.entries(data.names).some(([id,name])=>!valid(id)||typeof name!=='string'||!name.trim()||name.length>100||/[\x00-\x1f\x7f]/.test(name))))throw new Error('Project names are invalid.');
    if(data.assignments!==undefined&&(!data.assignments||typeof data.assignments!=='object'||Array.isArray(data.assignments)||Object.entries(data.assignments).some(([id,project])=>!id||id.length>1024||!validAssignment(project))))throw new Error('Project assignments are invalid.');
    return { order: [...new Set(data.order)], archived: [...new Set(data.archived)], ...(data.names?{names:data.names}:{}), ...(data.assignments?{assignments:data.assignments}:{}) };
  } catch (e) { if (e.code === 'ENOENT') return { order: [], archived: [] }; throw e; }
}
export async function updateProjects(root, input, allowed, allowedNotes=[]) {
  const previous = queues.get(root) || Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const data = await readProjects(root);
    if (Array.isArray(input?.order) && Object.keys(input).length === 1) {
      if (input.order.length > 500 || !input.order.every(id => valid(id) && allowed.includes(id)) || new Set(input.order).size !== input.order.length) throw invalid('Invalid project order.');
      data.order = [...input.order, ...data.order.filter(id => !input.order.includes(id))];
    } else if (valid(input?.id) && allowed.includes(input.id) && typeof input.archived === 'boolean' && Object.keys(input).length === 2) {
      data.archived = data.archived.filter(id => id !== input.id);
      if (input.archived) data.archived.push(input.id);
    } else if(valid(input?.id)&&allowed.includes(input.id)&&typeof input.name==='string'&&Object.keys(input).length===2){
      const name=input.name.trim();
      if(!name||name.length>100||/[\x00-\x1f\x7f]/.test(name))throw invalid('Use a project name of 1–100 characters.');
      data.names={...data.names,[input.id]:name};
    } else if(typeof input?.noteId==='string'&&allowedNotes.includes(input.noteId)&&Object.keys(input).length===2&&Array.isArray(input.projects)&&validAssignment(input.projects)&&input.projects.every(id=>allowed.includes(id))){
      data.assignments={...data.assignments,[input.noteId]:input.projects};
    } else if(typeof input?.noteId==='string'&&allowedNotes.includes(input.noteId)&&Object.keys(input).length===2&&(input.project===null||(valid(input.project)&&allowed.includes(input.project)))){
      data.assignments={...data.assignments,[input.noteId]:input.project};
    } else throw invalid('Choose an existing project and a valid change.');
    const temp = path.join(root, '.projects-' + randomUUID() + '.tmp');
    try { await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); await fs.rename(temp, path.join(root, '.projects.json')); }
    finally { await fs.rm(temp, { force: true }); }
    return data;
  });
  queues.set(root, work);
  try { return await work; } finally { if (queues.get(root) === work) queues.delete(root); }
}
