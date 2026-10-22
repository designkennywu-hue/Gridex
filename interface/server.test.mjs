import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createAppServer, getLibrary, readNote, safePath } from './server.mjs';
import { isAgentWork } from './library-sources.mjs';
import { isSlides, isGitHub } from './library-sources.mjs';
import {evidenceRevision,projectRevision,reviewState,projectSourceLocations} from './project-reviews.mjs';
import {createHash} from 'node:crypto';

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

test('Project impact states require current evidence, explicit approval and actual project change records',()=>{
  const note={title:'A finding',kind:'note',body:'Evidence',sourceLinks:[]};
  const project={phase:'Planning'};
  const entry={state:'proposed',reviewedAt:'2026-10-21T20:00:00Z',evidenceRevision:evidenceRevision(note),projectRevision:projectRevision(project),proposal:'documents/.project-updates/review.md'};
  assert.equal(reviewState(note,'field-app',undefined,project).state,'not-assessed');
  assert.equal(reviewState(note,'field-app',entry,project).state,'proposed');
  assert.equal(reviewState({...note,body:'Changed'},'field-app',entry,project).state,'needs-recheck');
  assert.equal(reviewState(note,'field-app',entry,{phase:'Changed'}).state,'needs-recheck');
  assert.equal(reviewState(note,'field-app',entry,project,false).state,'needs-recheck');
  const applied={...entry,state:'applied',appliedAt:'2026-10-21T20:01:00Z',changes:[{path:'topics/project-progress.json#projects.field-app',beforeRevision:'0'.repeat(64),afterRevision:projectRevision(project)}]};
  assert.equal(reviewState(note,'field-app',applied,project).state,'needs-recheck');
  assert.equal(reviewState(note,'field-app',{...applied,approvalReference:'fixture user approval'},project).state,'applied');
  assert.equal(reviewState(note,'field-app',{...entry,state:'no-change'},project).state,'needs-recheck');
  assert.equal(reviewState(note,'field-app',{...entry,state:'no-change',rationale:'Existing decision already covers this.'},project).state,'no-change');
});

test('Historical references require exact live source locations without asserting approval',()=>{
  const note={id:'documents/evidence.md',title:'Evidence',body:'Finding',kind:'note',sourceLinks:[]};
  const project={sources:[note.id],decisions:[{sources:[note.id]}]};
  const locations=projectSourceLocations(project,note.id);
  assert.deepEqual(locations,['/decisions/0/sources','/sources']);
  const entry={state:'referenced',reviewedAt:'2026-10-21T20:00:00Z',rationale:'Audited current citations only.',sourceLocations:locations,evidenceRevision:evidenceRevision(note),projectRevision:projectRevision(project)};
  assert.equal(reviewState(note,'example',entry,project,false).state,'referenced');
  assert.equal(reviewState(note,'example',{...entry,sourceLocations:['/sources']},project).state,'needs-recheck');
  assert.equal(reviewState(note,'example',{...entry,sourceLocations:['/not-a-source']},project).state,'needs-recheck');
  assert.equal(reviewState(note,'example',{...entry,state:'applied'},project).state,'needs-recheck');
  assert.equal(reviewState({...note,body:'New evidence'},'example',entry,project).state,'needs-recheck');
  const uncited={sources:['documents/other.md']};
  assert.equal(reviewState(note,'example',{...entry,projectRevision:projectRevision(uncited),sourceLocations:[]},uncited).state,'needs-recheck');
});

test('Inline review context exposes actual citations and keeps draft comparisons revision-bound',async t=>{
  const root=await fixture(t);
  const note=(await getLibrary(root)).notes.find(n=>n.id==='documents/sample.md');
  const project={phase:'Planning',asOf:'2026-10-21',note:'Current brief',sources:[note.id],decisions:[{text:'Existing decision',kind:'recorded',sources:[note.id]}]};
  await fs.mkdir(path.join(root,'topics'));
  await fs.writeFile(path.join(root,'topics/project-progress.json'),JSON.stringify({version:1,projects:{'field-app':project}}));
  const entry={noteId:note.id,project:'field-app',checkedAt:'2026-10-21T20:00:00Z',evidenceRevision:evidenceRevision(note),projectRevision:projectRevision(project),current:'Existing external requirement',after:'Draft evidence link',sources:[{label:'Unsafe',url:'javascript:alert(1)'},{label:'Verified tracker',url:'https://linear.app/example'}]};
  await fs.writeFile(path.join(root,'.project-review-context.json'),JSON.stringify({version:1,entries:[entry]}));
  let result=(await getLibrary(root)).notes.find(n=>n.id===note.id);
  assert.equal(result.projectReviews[0].state,'not-assessed');
  assert.equal(result.projectContexts[0].after,'Draft evidence link');
  assert.deepEqual(result.projectContexts[0].references.map(r=>r.label),['Key decision','Project context']);
  assert.deepEqual(result.projectContexts[0].sources.map(s=>s.label),['Verified tracker']);
  await fs.writeFile(path.join(root,'topics/project-progress.json'),JSON.stringify({version:1,projects:{'field-app':{...project,note:'Changed brief'}}}));
  result=(await getLibrary(root)).notes.find(n=>n.id===note.id);
  assert.equal(result.projectContexts[0].stale,true);
  assert.equal(result.projectContexts[0].after,undefined);
  await fs.writeFile(path.join(root,'.projects.json'),JSON.stringify({version:1,order:[],archived:[],assignments:{[note.id]:['other-project']}}));
  result=(await getLibrary(root)).notes.find(n=>n.id===note.id);
  assert.equal(result.projectContexts[0].project,'other-project');
  assert.equal(result.projectContexts[0].after,undefined);
});

test('Impact reviews are per-project, validate proposal bytes, and expose unavailable records honestly',async t=>{
  const root=await fixture(t);
  const note=(await getLibrary(root)).notes.find(n=>n.id==='documents/sample.md');
  assert.equal(note.projectReviews[0].state,'not-assessed');
  const dir=path.join(root,'documents/.project-updates');await fs.mkdir(dir);
  const proposal='# Proposed change';await fs.writeFile(path.join(dir,'field-app.md'),proposal);
  const entry={noteId:note.id,project:'field-app',state:'proposed',reviewedAt:'2026-10-21T20:00:00Z',evidenceRevision:evidenceRevision(note),projectRevision:projectRevision(null),proposal:'documents/.project-updates/field-app.md',proposalRevision:createHash('sha256').update(proposal).digest('hex')};
  await fs.writeFile(path.join(root,'.project-reviews.json'),JSON.stringify({version:1,entries:[entry]}));
  let library=await getLibrary(root);
  assert.equal(library.notes.find(n=>n.id===note.id).projectReviews[0].state,'proposed');
  assert.equal(library.notes.some(n=>n.id===entry.proposal),false);
  await fs.writeFile(path.join(dir,'field-app.md'),'Changed proposal');
  assert.equal((await getLibrary(root)).notes.find(n=>n.id===note.id).projectReviews[0].state,'needs-recheck');
  await fs.writeFile(path.join(root,'.project-reviews.json'),'{broken');
  library=await getLibrary(root);
  assert.equal(library.notes.find(n=>n.id===note.id).projectReviews[0].state,'unavailable');
  assert.ok(library.warnings.some(w=>w.file==='.project-reviews.json'));
});

test('GitHub insight cards retain project scope without reclassifying citations or preserved sources',async t=>{
  const root=await fixture(t);
  await fs.mkdir(path.join(root,'documents/github'),{recursive:true});
  await fs.writeFile(path.join(root,'documents/github/insight.md'),'---\ncontent_type: github-insight\nsource_kind: github\nreview_status: needs-review\nlabels: ["project:design-system"]\nsources: ["https://github.com/gridware/shared-ui-components/pull/39"]\n---\n# Captured compatibility boundary\n');
  const notes=(await getLibrary(root)).notes;
  const cards=notes.filter(isGitHub);
  assert.equal(cards.length,1);
  assert.deepEqual(cards[0].labels,['project:design-system']);
  assert.equal(cards[0].review,'needs-review');
  assert.equal(isGitHub({id:'sources/github/response.md',category:'sources',kind:'github-insight'}),false);
  assert.equal(isGitHub({id:'documents/agent-work/code/note.md',category:'notes',kind:'code-evidence',sourceLinks:['https://github.com/example/repo']}),false);
  assert.equal(isGitHub({id:'documents/github-other/note.md',category:'notes',kind:'note'}),false);
});

test('Preserved slide images are available only within sources and never parsed as notes',async t=>{
  const root=await fixture(t);
  await fs.mkdir(path.join(root,'sources/slides'),{recursive:true});
  const png=Buffer.from('89504e470d0a1a0a','hex');
  await fs.writeFile(path.join(root,'sources/slides/page.png'),png);
  await fs.writeFile(path.join(root,'documents/page.png'),png);
  await fs.symlink(path.join(root,'documents/page.png'),path.join(root,'sources/slides/outside.png'));
  await assert.rejects(safePath(root,'documents/page.png'));
  await assert.rejects(safePath(root,'sources/slides/outside.png'));
  await assert.rejects(readNote(root,'sources/slides/page.png'),error=>error.status===415);
  const server=createAppServer(root);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/raw?path=sources/slides/page.png');
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  assert.equal((await getLibrary(root)).notes.length,2);
  assert.equal(isSlides({id:'documents/slides/pages.md',category:'notes'}),true);
  assert.equal(isSlides({id:'sources/slides/pages.md',category:'sources',kind:'slides'}),false);
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
  assert.equal((await patch({id:'field-app',name:'  Field experience  '})).status,200);
  state = await (await fetch(base + '/api/projects')).json();
  assert.equal(state.names['field-app'],'Field experience');
  assert.deepEqual(state.order,['design-system','field-app']);
  assert.deepEqual(state.archived,[]);
  assert.equal((await getLibrary(root)).notes.find(n=>n.title==='Example PRD').labels[0],'project:field-app');
  assert.equal((await patch({id:'field-app',archived:true})).status,200);
  assert.equal((await (await fetch(base + '/api/projects')).json()).names['field-app'],'Field experience');
  for(const name of ['', '   ', 'x'.repeat(101), 'bad\u0000name'])assert.equal((await patch({id:'field-app',name})).status,400);
  assert.equal((await patch({id:'missing',name:'New name'})).status,400);
  assert.equal((await patch({id:'__other',name:'New name'})).status,400);
  await fs.rm(path.join(root,'.projects.json'));
  await fs.symlink(path.join(root,'documents/sample.md'),path.join(root,'.projects.json'));
  assert.equal((await patch({id:'field-app',archived:true})).status,500);
  assert.equal((await readNote(root,'documents/sample.md')).title,'Example PRD');
});

test('Card project assignments persist without rewriting source files',async t=>{
  const root=await fixture(t);
  await fs.writeFile(path.join(root,'documents/other.md'),'---\nlabels: ["project:design-system"]\n---\n# Design');
  await fs.mkdir(path.join(root,'sources/batch'),{recursive:true});
  await fs.writeFile(path.join(root,'sources/batch/original.md'),'# Preserved original');
  const original=await fs.readFile(path.join(root,'documents/sample.md'));
  const server=createAppServer(root);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const headers={Origin:base,'Content-Type':'application/json','X-Second-Brain':'projects'};
  const patch=data=>fetch(base+'/api/projects',{method:'PATCH',headers,body:JSON.stringify(data)});
  assert.equal((await patch({noteId:'documents/sample.md',project:'design-system'})).status,200);
  let note=(await getLibrary(root)).notes.find(n=>n.id==='documents/sample.md');
  assert.deepEqual(note.labels,['project:design-system']);
  assert.deepEqual(note.sourceLabels,['project:field-app']);
  assert.deepEqual((await (await fetch(base+'/api/note?path=documents/sample.md')).json()).labels,['project:design-system']);
  assert.equal(note.projectAssigned,true);
  assert.equal((await patch({noteId:note.id,projects:['design-system','field-app']})).status,200);
  note=(await getLibrary(root)).notes.find(n=>n.id===note.id);
  assert.deepEqual(note.labels,['project:design-system','project:field-app']);
  assert.deepEqual(note.sourceLabels,['project:field-app']);
  for(const projects of [['missing'],['field-app','field-app'],'field-app'])assert.equal((await patch({noteId:note.id,projects})).status,400);
  assert.equal((await patch({noteId:note.id,projects:[]})).status,200);
  assert.deepEqual((await getLibrary(root)).notes.find(n=>n.id===note.id).labels,[]);
  assert.equal((await patch({noteId:note.id,project:null})).status,200);
  note=(await getLibrary(root)).notes.find(n=>n.id===note.id);
  assert.deepEqual(note.labels,[]);
  assert.deepEqual(await fs.readFile(path.join(root,'documents/sample.md')),original);
  assert.equal((await patch({noteId:'sources/batch/original.md',project:'field-app'})).status,200);
  assert.equal((await getLibrary(root)).notes.find(n=>n.id==='sources/batch/original.md').category,'sources');
  assert.equal(await fs.readFile(path.join(root,'sources/batch/original.md'),'utf8'),'# Preserved original');
  for(const data of [{noteId:'../outside.md',project:null},{noteId:'documents/missing.md',project:null},{noteId:note.id,project:'missing'}])assert.equal((await patch(data)).status,400);
  assert.equal((await fetch(base+'/api/projects',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({noteId:note.id,project:null})})).status,403);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'.projects.json'),'utf8')).assignments[note.id],null);
  assert.equal((await patch({noteId:'inbox/test-recording/audio.mp3',projects:['field-app','design-system']})).status,200);
  assert.deepEqual((await getLibrary(root)).notes.find(n=>n.id==='inbox/test-recording/audio.mp3').labels,['project:field-app','project:design-system']);
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

test('Speaker alignment preserves recurring IDs and leaves overlapping voices unassigned',async()=>{
 const {alignSpeakers}=await import('./speakers.mjs');
 assert.deepEqual(alignSpeakers([{start:0,end:2},{start:2,end:4},{start:4,end:6},{start:6,end:8},{start:8,end:10}],[{start:0,end:2,speaker:7},{start:2,end:4,speaker:9},{start:4,end:6,speaker:7},{start:6,end:8,speaker:7},{start:6,end:8,speaker:9}]),['speaker-1','speaker-2','speaker-1',null,null]);
});
test('Speaker names persist separately and reject stale or foreign edits',async t=>{
 const root=await fixture(t),id='inbox/test-recording/audio.mp3',dir=path.join(root,'inbox/test-recording');
 const original=JSON.stringify({text:'Hello again',segments:[{start:0,end:2,text:'Hello'},{start:2,end:4,text:'again'}]});
 await fs.writeFile(path.join(dir,'transcript.json'),original);
 const revision=createHash('sha256').update(original).digest('hex');
 await fs.writeFile(path.join(dir,'speakers.json'),JSON.stringify({version:1,transcriptRevision:revision,assignments:['speaker-1','speaker-1'],names:{}}));
 const server=createAppServer(root);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,body={id,action:'rename',revision,speaker:'speaker-1',name:'Kenny'};
 const post=(data,headers={Origin:base,'Content-Type':'application/json','X-Second-Brain':'recordings'})=>fetch(base+'/api/transcript',{method:'POST',headers,body:JSON.stringify(data)});
 assert.equal((await post(body)).status,200);
 const data=await (await fetch(base+'/api/transcript?id='+encodeURIComponent(id))).json();
 assert.equal(data.names['speaker-1'],'Kenny');assert.equal(data.segments[1].speaker,'speaker-1');
 assert.equal(await fs.readFile(path.join(dir,'transcript.json'),'utf8'),original);
 assert.equal((await post({...body,revision:'stale'})).status,409);
 assert.equal((await post({...body,speaker:'invented'})).status,400);
 assert.equal((await post(body,{'Content-Type':'application/json'})).status,403);
 assert.equal((await post({...body,id:'../outside/audio.mp3'})).status,400);
 await fs.writeFile(path.join(dir,'transcript.json'),original+'\n');
 const changed=await (await fetch(base+'/api/transcript?id='+encodeURIComponent(id))).json();
 assert.equal(changed.state,'stale');assert.equal(changed.segments[0].speaker,null);assert.deepEqual(changed.names,{});
});

test('Transcript paragraphs follow thought boundaries without turning a one-minute cutoff into a speaker change',async()=>{
 const {transcriptBlocks}=await import('./transcript-blocks.mjs');
 const segments=[{index:0,start:1007,end:1058,text:'then having the engineers',speaker:null},{index:1,start:1060,end:1100,text:'review his code and merge it',speaker:null},{index:2,start:1100,end:1130,text:'A separate question about planning',speaker:null},{index:3,start:1130,end:1140,text:'The answer',speaker:'speaker-1'}];
 const blocks=transcriptBlocks(segments,[2]);
 assert.equal(blocks.length,2);
 assert.deepEqual(blocks[0].paragraphs.map(p=>p.text),[['then having the engineers','review his code and merge it'],['A separate question about planning']]);
 assert.equal(blocks[0].end,1130);
 assert.deepEqual(blocks.flatMap(b=>b.paragraphs.flatMap(p=>p.text)),segments.map(s=>s.text));
});

test('Knowledge graph distinguishes assignments, citations and exact section evidence without inventing links',async()=>{
 const {buildKnowledgeGraph,resolveGraphLink}=await import('./knowledge-graph.mjs');
 const note={id:'documents/slack/update.md',title:'Update',summary:'An observed update',category:'notes',kind:'slack-insight',labels:['project:design-system','project:field-app'],sourceLinks:['../../sources/batch/original.json','https://example.com/evidence'],body:'[Related](../related.md)',projectAssigned:true};
 const graph=await buildKnowledgeGraph({notes:[note,{...note,id:'documents/related.md',title:'Related',labels:[],sourceLinks:[],body:''}],preferences:{order:['design-system','field-app'],archived:['field-app']},progress:{projects:{'design-system':{sources:[note.id],note:'Brief',nextActions:[{text:'Review baseline',sources:[note.id]}]}}},index:'[Update](documents/slack/update.md)',fileExists:async file=>file==='sources/batch/original.json'});
 assert.equal(graph.edges.filter(e=>e.from===note.id&&e.relation==='assignment').length,2);
 assert.ok(graph.edges.some(e=>e.from===note.id&&e.to==='sources/batch/original.json'&&e.relation==='source'));
 assert.ok(graph.edges.some(e=>e.from===note.id&&e.to==='mapping:design-system:nextActions.0'&&e.relation==='evidence'));
 assert.ok(graph.edges.some(e=>e.from===note.id&&e.relation==='indexed'));
 assert.ok(graph.nodes.find(n=>n.id==='project:field-app').archived);
 assert.equal(graph.edges.filter(e=>e.relation==='evidence'&&e.from==='documents/related.md').length,0);
 assert.deepEqual(graph.nodes.find(n=>n.id==='sources/batch/original.json').projects,['design-system','field-app']);
 assert.equal(resolveGraphLink(note.id,'../../../outside.md'),null);
 assert.equal(resolveGraphLink(note.id,'javascript:alert(1)'),null);
 assert.equal(resolveGraphLink(note.id,'https://user:secret@example.com'),null);
 assert.ok(graph.edges.every(e=>graph.nodes.some(n=>n.id===e.from)&&graph.nodes.some(n=>n.id===e.to)));
});

test('Knowledge map API is local and read only with no dangling edges',async t=>{
 const root=await fixture(t),server=createAppServer(root);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,response=await fetch(base+'/api/knowledge-map');
 assert.equal(response.status,200);const graph=await response.json();assert.ok(graph.nodes.some(n=>n.id==='project:field-app'));
 const ids=new Set(graph.nodes.map(n=>n.id));assert.ok(graph.edges.every(e=>ids.has(e.from)&&ids.has(e.to)));
 assert.equal((await fetch(base+'/api/knowledge-map',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/knowledge-map',{headers:{Origin:'https://foreign.example'}})).status,403);
});

test('Map color layers encode metadata without changing assignments or conflating per-project reviews',async()=>{
 const {mapLayerKey,mapLayerColor}=await import('./map-layers.mjs');
 const node={type:'insight',provider:'slack',projects:['design-system','field-app'],assessments:[{project:'design-system',state:'referenced'},{project:'field-app',state:'not-assessed'}]};
 assert.equal(mapLayerKey(node,'type'),'insight');assert.equal(mapLayerKey(node,'provider'),'slack');
 assert.equal(mapLayerKey(node,'project'),'multiple-projects');assert.equal(mapLayerKey(node,'project','field-app'),'field-app');
 assert.equal(mapLayerKey(node,'assessment'),'mixed');assert.equal(mapLayerKey(node,'assessment','design-system'),'referenced');
 assert.equal(mapLayerKey({type:'source'},'assessment'),'not-applicable');assert.equal(mapLayerKey({type:'recording'},'assessment'),'not-assessed');
 assert.equal(mapLayerKey({...node,assessments:[{project:'design-system',state:'invalid'}]},'assessment'),'unavailable');
 assert.equal(mapLayerColor('slack','provider'),mapLayerColor('slack','provider'));
 assert.notEqual(mapLayerColor('mixed','assessment'),mapLayerColor('applied','assessment'));
 assert.deepEqual(node.projects,['design-system','field-app']);
});
