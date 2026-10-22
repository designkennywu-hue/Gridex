import {promises as fs} from 'node:fs';
import path from 'node:path';
import {evidenceRevision,projectRevision,projectSourceLocations} from './project-reviews.mjs';

export function referenceDetails(project,noteId){
  return projectSourceLocations(project,noteId).map(pointer=>{
    const keys=pointer.split('/').slice(1,-1).map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~'));
    let item=project;
    for(const key of keys)item=item?.[key];
    const titles={sources:'Project context',assumptions:'Key assumption',decisions:'Key decision',kpis:'KPI',team:'Team',steps:'Timeline',nextAction:'Next action',nextActions:'Issue'};
    const section=keys.filter(k=>!/^\d+$/.test(k)).at(-1)||'sources';
    const milestone=keys[0]==='milestones'?project?.milestones?.[Number(keys[1])]:null;
    const label=(milestone?milestone.title+' · ':'')+(titles[section]||'Project reference')+(section==='team'&&item?.name?' · '+item.name:'');
    return {path:pointer,label,text:String(item?.text||item?.label||item?.role||item?.note||'').slice(0,600)};
  });
}

export async function attachReviewContext(root,notes,projects,warnings){
  let entries=[];
  try{
    const file=path.join(root,'.project-review-context.json'),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw new Error('Invalid context registry');
    const data=JSON.parse(await fs.readFile(file,'utf8'));
    if(data.version!==1||!Array.isArray(data.entries))throw new Error('Invalid context registry');
    entries=data.entries;
  }catch(error){if(error.code!=='ENOENT')warnings.push({file:'.project-review-context.json',error:'Project review notes could not be read'});}
  const string=value=>typeof value==='string'?value.slice(0,2000):'';
  for(const note of notes){
    note.projectContexts=note.labels.filter(l=>l.startsWith('project:')).map(label=>{
      const project=label.slice(8),raw=projects[project],entry=entries.find(e=>e?.noteId===note.id&&e.project===project);
      const base={project,references:referenceDetails(raw,note.id)};
      if(!entry)return base;
      if(entry.evidenceRevision!==evidenceRevision(note)||entry.projectRevision!==projectRevision(raw))return {...base,stale:true};
      if(!Number.isFinite(Date.parse(entry.checkedAt)))return {...base,stale:true};
      return {...base,checkedAt:entry.checkedAt,source:string(entry.source),locator:string(entry.locator),current:string(entry.current),target:string(entry.target),before:string(entry.before),after:string(entry.after),decision:string(entry.decision),gap:string(entry.gap),
        sources:(Array.isArray(entry.sources)?entry.sources:[]).filter(s=>s&&typeof s.label==='string'&&typeof s.url==='string'&&/^https:\/\//.test(s.url)).map(s=>({label:string(s.label),url:s.url.slice(0,2000)}))};
    });
  }
}
