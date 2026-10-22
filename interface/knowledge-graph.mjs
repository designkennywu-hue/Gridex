import path from 'node:path';
const label=id=>id.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase());
export const graphProvider=note=>note.audio?'recording':note.id.startsWith('documents/slack/')?'slack':note.id.startsWith('documents/confluence/')?'confluence':note.id.startsWith('documents/linear/')?'linear':note.id.startsWith('documents/github/')?'github':note.id.startsWith('documents/slides/')?'slides':note.id.startsWith('documents/agent-work/')?'agent-work':note.category==='sources'?'preserved':'local';
export function resolveGraphLink(from,reference){
 if(typeof reference!=='string')return null;
 let ref=reference.trim().replace(/^<|>$/g,'').replace(/\s+["'][^"']*["']$/,'');
 if(/^https?:\/\//i.test(ref)){try{const url=new URL(ref);if(url.username||url.password)return null;return {external:ref};}catch{return null;}}
 if(/^[a-z]+:/i.test(ref)||ref.startsWith('#')||ref.startsWith('/'))return null;
 try{ref=decodeURIComponent(ref);}catch{return null;}
 const [file,...fragment]=ref.split('#');
 const target=path.posix.normalize(path.posix.join(path.posix.dirname(from),file));
 if(target.startsWith('../')||!(/^(documents|topics|meetings|sources|inbox)\//.test(target)||target==='INDEX.md'))return null;
 return {path:target,fragment:fragment.join('#')};
}
function links(body){return [...String(body||'').matchAll(/(?<!!)\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g)].map(match=>match[1]);}
export async function buildKnowledgeGraph({notes,preferences={},progress={},index='',fileExists=async()=>false}){
 const nodes=new Map(),edges=new Map(),gaps=[];
 const add=node=>{if(!nodes.has(node.id))nodes.set(node.id,node);return node.id;};
 const edge=(from,to,relation,locator='')=>{if(from===to)return;const key=JSON.stringify([from,to,relation,locator]);if(!edges.has(key))edges.set(key,{id:'e'+edges.size,from,to,relation,locator});};
 const projects=new Set([...(preferences.order||[]),...(preferences.archived||[]),...Object.keys(preferences.names||{}),...notes.flatMap(n=>n.labels.filter(l=>l.startsWith('project:')).map(l=>l.slice(8)))]);
 for(const id of projects)add({id:'project:'+id,type:'project',label:preferences.names?.[id]||label(id),project:id,projects:[id],archived:preferences.archived?.includes(id)||false,provider:'local',summary:'Project assignments and source-linked project sections.'});
 for(const n of notes)add({id:n.id,path:n.id,type:n.audio?'recording':n.category==='sources'?'source':'insight',label:n.title,summary:n.summary?.slice(0,500)||'',kind:n.kind,provider:graphProvider(n),updated:n.updated,projects:n.labels.filter(l=>l.startsWith('project:')).map(l=>l.slice(8)),assessments:n.projectReviews||[],assignedBy:n.projectAssigned?'Your assignment':'Captured labels'});
 if(index)add({id:'INDEX.md',type:'mapping',label:'Knowledge base index',path:'INDEX.md',provider:'local',projects:[],summary:'Entries explicitly linked from INDEX.md.'});
 async function connect(from,reference,relation,locator){
  const resolved=resolveGraphLink(from,reference);if(!resolved)return;
  if(resolved.external){
   const url=new URL(resolved.external);let provider=url.hostname.includes('slack.com')?'slack':url.hostname.includes('atlassian.net')?'confluence':url.hostname==='linear.app'?'linear':url.hostname==='github.com'?'github':'web';
   const id=add({id:'url:'+resolved.external,type:'external',label:url.hostname+url.pathname.slice(0,100),url:resolved.external,provider,projects:[],summary:'External citation. Its contents are not loaded by this view.'});
   edge(from,id,relation,reference);return;
  }
  if(!nodes.has(resolved.path)){
   if(!(await fileExists(resolved.path))){gaps.push({from,target:resolved.path});return;}
   add({id:resolved.path,path:resolved.path,type:resolved.path==='INDEX.md'?'mapping':'source',label:path.posix.basename(resolved.path),provider:'preserved',projects:[],summary:'Linked local file; available through its preserved path.'});
  }
  edge(from,resolved.path,relation,locator||reference);
 }
 for(const n of notes){
  for(const p of n.labels.filter(l=>l.startsWith('project:')))edge(n.id,p,'assignment',n.projectAssigned?'User assignment override':'Note metadata labels');
  for(const tag of n.labels.filter(l=>/^(topic|person):/.test(l))){add({id:tag,type:tag.startsWith('topic:')?'topic':'person',label:label(tag.split(':')[1]),provider:'local',projects:[],summary:'Explicit metadata label.'});edge(n.id,tag,'tag','Note metadata labels');}
  for(const ref of n.sourceLinks||[])await connect(n.id,ref,'source',ref);
  if(n.category!=='sources')for(const ref of links(n.body))await connect(n.id,ref,'reference',ref);
 }
 for(const ref of links(index)){const resolved=resolveGraphLink('INDEX.md',ref);if(resolved?.path&&nodes.has(resolved.path))edge(resolved.path,'INDEX.md','indexed',ref);}
 function section(project,key,title,entry,parent){
  const id=add({id:'mapping:'+project+':'+key,type:'mapping',label:title,project,projects:[project],provider:'local',summary:typeof entry==='string'?entry:entry?.text||entry?.label||entry?.note||'',locator:'topics/project-progress.json#projects.'+project+'.'+key});
  edge(id,parent||'project:'+project,'section','topics/project-progress.json#projects.'+project+'.'+key);
  for(const ref of entry?.sources||[])if(nodes.has(ref))edge(ref,id,'evidence','topics/project-progress.json#projects.'+project+'.'+key+'.sources');else gaps.push({from:id,target:ref});
  return id;
 }
 for(const [project,p] of Object.entries(progress.projects||{})){
  if(!projects.has(project))continue;
  section(project,'overview','Project overview',{text:p.note,sources:p.sources});
  function parts(entry,prefix='',parent){
   for(const [key,name] of Object.entries({assumptions:'Assumption',decisions:'Decision',kpis:'KPI',nextActions:'Next action',steps:'Phase'}))for(const [i,item] of (entry[key]||[]).entries())section(project,prefix+key+'.'+i,name+': '+(item.text||item.label||'').slice(0,100),item,parent);
  }
  parts(p);
  for(const [i,m] of (p.milestones||[]).entries()){const id=section(project,'milestones.'+i,m.title,m);parts(m,'milestones.'+i+'.',id);}
 }
 // Source scope is inherited from its citing notes, without changing note assignments.
 for(let pass=0;pass<3;pass++)for(const e of edges.values()){
  const target=nodes.get(e.to),origin=nodes.get(e.from);
  if(['source','external','topic','person'].includes(target?.type)&&['source','reference','tag'].includes(e.relation))target.projects=[...new Set([...(target.projects||[]),...(origin?.projects||[])])];
 }
 return {nodes:[...nodes.values()],edges:[...edges.values()],gaps,generatedAt:new Date().toISOString(),coverage:'Explicit project labels, source metadata, Markdown links, INDEX.md entries and project-progress source references. Connections are references, not verification or approval.'};
}
