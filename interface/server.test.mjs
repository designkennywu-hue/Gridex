import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createAppServer, getLibrary, readNote, safePath } from './server.mjs';
import { isAgentWork } from './library-sources.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'second-brain-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'documents'), { recursive: true });
  await fs.mkdir(path.join(root, 'inbox', 'test-recording'), { recursive: true });
  await fs.writeFile(path.join(root, 'documents', 'sample.md'), '---\nid: sample\ntitle: Example PRD\ncontent_type: prd\nlabels: ["project:field-app"]\n---\n# Example PRD\n\n## Summary\n\nWorks offline.\n');
  await fs.writeFile(path.join(root, 'inbox', 'test-recording', 'audio.mp3'), Buffer.from([0, 1, 2, 3, 4, 5]));
  await fs.writeFile(path.join(root, 'inbox', 'test-recording', 'transcript.txt'), 'A recording transcript.');
  await fs.writeFile(path.join(root, 'inbox', 'test-recording', 'summary.md'), '# Summary\nA machine summary.');
  await fs.writeFile(path.join(root, 'inbox', '.metadata.json'), JSON.stringify({ 'test-recording': { title: 'Test meeting', duration: 12, createdAt: '2026-10-20T19:00:00Z' } }));
  return root;
}

test('Reads actual metadata and groups recording sidecars into one inbox item', async t => {
  const root = await fixture(t);
  const { notes, warnings } = await getLibrary(root);
  assert.equal(notes.length, 2);
  assert.equal(warnings.length, 0);
  const doc = notes.find(n => n.kind === 'prd');
  assert.equal(doc.title, 'Example PRD');
  assert.equal(doc.summary, 'Works offline.');
  assert.deepEqual(doc.labels, ['project:field-app']);
  const recording = notes.find(n => n.kind === 'recording');
  assert.equal(recording.title, 'Test meeting');
  assert.equal(recording.duration, 12);
  assert.match(recording.body, /A recording transcript/);
  assert.match(recording.body, /A machine summary/);
  await fs.writeFile(path.join(root, 'documents', 'new.md'), '# Newly added\nFresh content');
  assert.equal((await getLibrary(root)).notes.length, 3);
});

test('Agent work discovers both capture types without absorbing cited providers or raw sources', async t => {
  const root = await fixture(t);
  for (const [folder,kind,source] of [['insights','agent-insight','agent-conversation'],['code','code-evidence','code']]) {
    await fs.mkdir(path.join(root,'documents/agent-work',folder),{recursive:true});
    await fs.writeFile(path.join(root,'documents/agent-work',folder,'sample.md'),`---\ntitle: ${kind}\ncontent_type: ${kind}\nsource_kind: ${source}\nlabels: ["project:field-app"]\nreview_status: needs-review\nsources: ["https://linear.app/example"]\n---\n# ${kind}\n\nEvidence with scoped provenance.\n`);
  }
  const library = await getLibrary(root);
  const captures = library.notes.filter(isAgentWork);
  assert.deepEqual(captures.map(n=>n.kind).sort(),['agent-insight','code-evidence']);
  assert.ok(captures.every(n=>n.review==='needs-review'&&n.labels.includes('project:field-app')));
  assert.equal(isAgentWork({id:'sources/capture/documents/agent-work/code/sample.md',category:'sources'}),false);
  assert.equal(isAgentWork({id:'documents/agent-work-other/sample.md',category:'notes'}),false);
  assert.equal(isAgentWork({id:'documents/design-system/existing.md',category:'notes',kind:'code-evidence'}),true);
  assert.equal(isAgentWork({id:'sources/capture/existing.md',category:'sources',kind:'code-evidence'}),false);
  assert.equal(library.notes.filter(n=>n.category==='notes').length,3);
  assert.equal(library.warnings.length,0);
});

test('Restricts reads to knowledge files, including resolved symlink targets', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'interface'));
  await fs.writeFile(path.join(root, 'interface', 'private.md'), 'Not knowledge');
  await fs.symlink(path.join(root, 'interface', 'private.md'), path.join(root, 'documents', 'shortcut.md'));
  await assert.rejects(safePath(root, '../outside.md'));
  await assert.rejects(safePath(root, 'interface/private.md'));
  await assert.rejects(safePath(root, 'documents/shortcut.md'));
  await assert.rejects(safePath(root, '/etc/passwd'));
  await assert.rejects(safePath(root, null));
  assert.equal((await readNote(root, 'documents/sample.md')).title, 'Example PRD');
});

test('Local API supports recording deep links and audio ranges; rejects writes and other origins', async t => {
  const root = await fixture(t);
  const server = createAppServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const record = await fetch(base + '/api/note?path=' + encodeURIComponent('inbox/test-recording/audio.mp3'));
  assert.equal(record.status, 200);
  assert.equal((await record.json()).kind, 'recording');
  const audio = await fetch(base + '/api/raw?path=inbox/test-recording/audio.mp3', { headers: { Range: 'bytes=1-3' } });
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get('content-range'), 'bytes 1-3/6');
  assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())], [1, 2, 3]);
  assert.equal((await fetch(base + '/api/library', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/library', { headers: { Origin: 'https://other.example' } })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(base + '/api/library', { headers: { Host: 'other.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
});

test('Recording rename keeps paths and sidecars stable; delete and undo preserve the full recording', async t => {
  const root = await fixture(t);
  const server = createAppServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const id = 'inbox/test-recording/audio.mp3';
  const headers = { Origin: base, 'Content-Type': 'application/json', 'X-Second-Brain': 'recordings' };
  const change = (method, endpoint, data) => fetch(base + endpoint, { method, headers, body: JSON.stringify(data) });
  const originalAudio = await fs.readFile(path.join(root, id));
  const originalTranscript = await fs.readFile(path.join(root, 'inbox/test-recording/transcript.txt'), 'utf8');
  const denied = await fetch(base + '/api/recordings', { method: 'PATCH', body: JSON.stringify({ id, title: 'Not allowed' }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(denied.status, 403);
  assert.equal((await change('PATCH', '/api/recordings', { id, title: '   ' })).status, 400);
  assert.equal((await change('DELETE', '/api/recordings', { id: 'documents/sample.md' })).status, 400);
  assert.equal((await change('PATCH', '/api/recordings', { id, title: '  Product planning  ' })).status, 200);
  let record = (await getLibrary(root)).notes.find(n => n.id === id);
  assert.equal(record.title, 'Product planning');
  assert.equal(record.duration, 12);
  assert.deepEqual(await fs.readFile(path.join(root, id)), originalAudio);
  assert.equal(await fs.readFile(path.join(root, 'inbox/test-recording/transcript.txt'), 'utf8'), originalTranscript);
  const deleted = await change('DELETE', '/api/recordings', { id });
  assert.equal(deleted.status, 200);
  const { undoToken } = await deleted.json();
  assert.equal((await getLibrary(root)).notes.some(n => n.id === id), false);
  assert.equal((await getLibrary(root)).notes.length, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'inbox/.metadata.json'), 'utf8'))['test-recording'], undefined);
  assert.deepEqual(await fs.readFile(path.join(root, 'inbox/.trash', undoToken, 'recording/audio.mp3')), originalAudio);
  assert.equal((await change('POST', '/api/recordings/restore', { token: '../no' })).status, 400);
  assert.equal((await change('POST', '/api/recordings/restore', { token: undoToken })).status, 200);
  record = (await getLibrary(root)).notes.find(n => n.id === id);
  assert.equal(record.title, 'Product planning');
  assert.equal(record.duration, 12);
  assert.deepEqual(await fs.readFile(path.join(root, id)), originalAudio);
  assert.equal(await fs.readFile(path.join(root, 'inbox/test-recording/transcript.txt'), 'utf8'), originalTranscript);
  assert.equal((await change('DELETE', '/api/recordings', { id: 'inbox/../documents/audio.mp3' })).status, 400);
});

test('Project order and archive state persist; unarchive preserves notes and invalid writes are rejected', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'documents', 'other.md'), '---\nlabels: ["project:design-system"]\n---\n# Design note');
  const server = createAppServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { Origin: base, 'Content-Type': 'application/json', 'X-Second-Brain': 'projects' };
  const patch = data => fetch(base + '/api/projects', {method: 'PATCH', headers, body: JSON.stringify(data)});
  assert.deepEqual(await (await fetch(base + '/api/projects')).json(), {order: [], archived: []});
  assert.equal((await fetch(base + '/api/projects', {method:'PATCH', headers:{'Content-Type':'application/json'}, body:'{}'})).status,403);
  assert.equal((await patch({order:['design-system','field-app']})).status,200);
  assert.equal((await patch({id:'field-app',archived:true})).status,200);
  let state = await (await fetch(base + '/api/projects')).json();
  assert.deepEqual(state,{order:['design-system','field-app'],archived:['field-app']});
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'.projects.json'),'utf8')),state);
  assert.equal((await getLibrary(root)).notes.find(n => n.title === 'Example PRD').summary,'Works offline.');
  assert.equal((await patch({id:'field-app',archived:false})).status,200);
  state = await (await fetch(base + '/api/projects')).json();
  assert.deepEqual(state,{order:['design-system','field-app'],archived:[]});
  for (const data of [{order:['field-app','field-app']},{order:['../outside']},{id:'unknown',archived:true},{id:'__other',archived:true},{id:'field-app',archived:'yes'}]) assert.equal((await patch(data)).status,400);
  await fs.rm(path.join(root,'.projects.json'));
  await fs.symlink(path.join(root,'documents/sample.md'),path.join(root,'.projects.json'));
  assert.equal((await patch({id:'field-app',archived:true})).status,500);
  assert.equal((await readNote(root,'documents/sample.md')).title,'Example PRD');
});

test('Project drops distinguish before/after in both directions and retain hidden projects', async () => {
  const {moveProject} = await import('./project-order.mjs');
  const order = ['a','hidden','b','c'];
  assert.deepEqual(moveProject(order,'a','b','after'),['hidden','b','a','c']);
  assert.deepEqual(moveProject(order,'c','b','before'),['a','hidden','c','b']);
  assert.deepEqual(moveProject(order,'c','a','before'),['c','a','hidden','b']);
  assert.deepEqual(moveProject(order,'a','c','after'),['hidden','b','c','a']);
  assert.deepEqual(moveProject(order,'missing','b','after'),order);
  assert.deepEqual(moveProject(order,'a','a','after'),order);
  assert.deepEqual(order,['a','hidden','b','c']);
});

test('Integrated recording controls encode synthetic audio, preserve metadata, and assign the saved recording', async t => {
  const {default:createRecorder} = await import('./recorder/engine.cjs');
  const root = await fixture(t);
  const assets=path.join(root,'test-assets');
  await fs.mkdir(path.join(assets,'bin'),{recursive:true});
  await fs.mkdir(path.join(assets,'public/vendor'),{recursive:true});
  await fs.copyFile(new URL('./recorder/public/vendor/lame.min.js',import.meta.url),path.join(assets,'public/vendor/lame.min.js'));
  const helper=path.join(assets,'bin/cord-capture');
  await fs.writeFile(helper,`#!/usr/bin/env node
const pcm=Buffer.alloc(9600);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(Math.sin(i/16)*6000),i*2);
setInterval(()=>process.stdout.write(pcm),50);
process.on('SIGTERM',()=>process.exit(0));
`,{mode:0o755});
  const engine=createRecorder({recordingsDir:path.join(root,'inbox'),assetsDir:assets});
  const server=createAppServer(root,undefined,engine);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const headers={Origin:base,'Content-Type':'application/json','X-Second-Brain':'capture'};
  const action=(name,body={})=>fetch(base+'/api/capture/'+name,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/api/capture/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await action('unknown')).status,405);
  assert.equal((await action('transcribe',{id:'../../secret'})).status,400);
  assert.equal((await action('start')).status,200);
  assert.equal((await action('start')).status,409);
  for(let i=0;i<40&&engine.status().elapsed<0.4;i++)await new Promise(r=>setTimeout(r,50));
  assert.ok(engine.status().elapsed>=0.4,'Synthetic PCM reaches encoder');
  assert.equal((await action('pause')).status,200);
  assert.equal(engine.status().state,'paused');
  const paused=engine.status().elapsed;
  await new Promise(r=>setTimeout(r,100));
  assert.equal(engine.status().elapsed,paused);
  assert.equal((await action('resume')).status,200);
  assert.equal((await action('stop',{title:'Fixture recording',project:'unknown'})).status,400);
  const saved=await action('stop',{title:'Fixture recording',project:'field-app'});
  assert.equal(saved.status,200);
  const result=await saved.json();
  assert.match(result.noteId,/^inbox\/Fixture recording .*\/audio\.mp3$/);
  assert.equal(engine.status().state,'idle');
  const audio=await fs.readFile(path.join(root,result.noteId));
  assert.ok(audio.length>128,'Actual MP3 bytes written');
  const library=await getLibrary(root);const recording=library.notes.find(n=>n.id===result.noteId);
  assert.equal(recording.title,'Fixture recording');assert.deepEqual(recording.labels,['project:field-app']);
  const meta=JSON.parse(await fs.readFile(path.join(root,'inbox/.metadata.json'),'utf8'));
  assert.equal(meta['test-recording'].title,'Test meeting');
  const projectHeaders={Origin:base,'Content-Type':'application/json','X-Second-Brain':'recordings'};
  assert.equal((await fetch(base+'/api/recordings',{method:'PATCH',headers:projectHeaders,body:JSON.stringify({id:result.noteId,project:null})})).status,200);
  assert.deepEqual((await getLibrary(root)).notes.find(n=>n.id===result.noteId).labels,[]);
  assert.equal((await action('stop',{title:''})).status,409);
});

test('Summaries generate recording titles while preserving manual names and concurrent edits', async t => {
  const {default:createRecorder}=await import('./recorder/engine.cjs');
  const {mutateRecording,renameRecording}=await import('./recordings.mjs');
  const root=await fixture(t);
  const records={auto:{title:'Recording Oct 20, 2026 5:04 PM',project:'field-app'},manual:{title:'My planning session',titleSource:'manual'},race:{title:'Recording Oct 20, 2026 5:04 PM',titleSource:'default'},invalid:{title:'Recording Oct 20, 2026 5:04 PM',titleSource:'default'}};
  for(const id of Object.keys(records)){
    const dir=path.join(root,'inbox',id);await fs.mkdir(dir);
    await fs.writeFile(path.join(dir,'audio.mp3'),Buffer.from([1,2,3]));
    await fs.writeFile(path.join(dir,'transcript.json'),JSON.stringify({text:'We agreed to simplify the device setup flow.'}));
  }
  await fs.writeFile(path.join(root,'inbox/.metadata.json'),JSON.stringify(records));
  let requests=0,release;
  const model=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'llama3.1:8b'}]}));return;}
    let body='';for await(const part of req)body+=part;
    const request=JSON.parse(body);assert.equal(request.format.type,'object');
    requests++;await new Promise(resolve=>{release=resolve;});
    res.end(JSON.stringify({message:{content:requests===4?'invalid JSON':JSON.stringify({title:'Simplifying device setup',summary:'The team agreed to simplify device setup.'})}}));
  });
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>model.close(resolve)));
  const previous=process.env.OLLAMA_URL;process.env.OLLAMA_URL='http://127.0.0.1:'+model.address().port;
  const engine=createRecorder({recordingsDir:path.join(root,'inbox'),withMutation:op=>mutateRecording(root,op)});
  if(previous===undefined)delete process.env.OLLAMA_URL;else process.env.OLLAMA_URL=previous;
  const wait=async predicate=>{for(let i=0;i<200;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Timed out waiting for summary');};
  for(const [i,id] of ['auto','manual','race','invalid'].entries()){
    await engine.summarize(id);await wait(()=>requests===i+1);
    if(id==='race')await mutateRecording(root,()=>renameRecording(root,'inbox/race/audio.mp3','My own title'));
    release();await wait(()=>!engine.busy(id));
  }
  const metadata=JSON.parse(await fs.readFile(path.join(root,'inbox/.metadata.json'),'utf8'));
  assert.equal(metadata.auto.title,'Simplifying device setup');
  assert.equal(metadata.auto.titleSource,'generated');
  assert.equal(metadata.auto.project,'field-app');
  assert.equal(metadata.manual.title,'My planning session');
  assert.equal(metadata.race.title,'My own title');
  assert.equal(metadata.race.titleSource,'manual');
  assert.equal(metadata.invalid.title,records.invalid.title);
  assert.equal((await engine.list()).find(x=>x.id==='invalid').summary.state,'error');
  assert.match(await fs.readFile(path.join(root,'inbox/auto/summary.md'),'utf8'),/# Simplifying device setup/);
  assert.match(await fs.readFile(path.join(root,'inbox/race/summary.md'),'utf8'),/# My own title/);
  assert.deepEqual([...await fs.readFile(path.join(root,'inbox/auto/audio.mp3'))],[1,2,3]);
});

test('Project overviews retain evidence dates and planned phases without adding gallery items', async t => {
  const root=await fixture(t);
  await fs.mkdir(path.join(root,'topics'));
  const config={version:1,projects:{'field-app':{
    phase:'Schema definition',asOf:'2026-01-01',sources:['documents/sample.md'],note:'Delivery is unconfirmed.',
    steps:[{label:'Requirements recorded',date:'2026-01-01',state:'current',sources:['documents/sample.md']},{label:'Planned launch',date:'2026-01-02',state:'planned',sources:['documents/sample.md']}],
    nextAction:{text:'Confirm the schema.',kind:'suggested',owner:null,due:null,sources:['documents/sample.md']},
  },unrelated:{phase:'Shipped',asOf:'2026-01-01',sources:['documents/sample.md']}}};
  const file=path.join(root,'topics/project-progress.json');
  await fs.writeFile(file,JSON.stringify(config));
  let library=await getLibrary(root);
  assert.equal(library.notes.length,2);
  assert.equal(library.projectOverviews['field-app'].phase,'Schema definition');
  assert.equal(library.projectOverviews['field-app'].steps[1].state,'planned','Elapsed dates never imply completed milestones');
  assert.equal(library.projectOverviews['field-app'].nextAction.owner,null);
  assert.equal(library.projectOverviews['field-app'].nextAction.kind,'suggested');
  assert.equal(library.projectOverviews['field-app'].newerNotes,true);
  assert.equal(library.projectOverviews.unrelated,undefined,'Evidence must belong to the project');
  config.projects['field-app'].sources=['../outside.md','https://example.com/unfetched'];
  await fs.writeFile(file,JSON.stringify(config));
  assert.deepEqual((await getLibrary(root)).projectOverviews,{});
  await fs.writeFile(file,'invalid JSON');
  library=await getLibrary(root);
  assert.equal(library.notes.length,2);
  assert.equal(library.warnings.length,1);
  assert.deepEqual(library.projectOverviews,{});
});
