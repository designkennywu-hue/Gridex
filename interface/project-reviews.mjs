import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const revision=value=>createHash('sha256').update(canonical(value)).digest('hex');
export const evidenceRevision=note=>revision({title:note.title,kind:note.kind,body:note.body,sourceLinks:note.sourceLinks});
export const projectRevision=project=>revision(project??null);
const digest=/^[a-f0-9]{64}$/;
const dated=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

// A citation proves a current reference, not historical approval or application.
export function projectSourceLocations(project,noteId){
  const locations=[];
  const escape=key=>key.replace(/~/g,'~0').replace(/\//g,'~1');
  function visit(value,pointer=''){
    if(Array.isArray(value))value.forEach((item,index)=>visit(item,`${pointer}/${index}`));
    else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
      const next=`${pointer}/${escape(key)}`;
      if(key==='sources'&&Array.isArray(item)){if(item.includes(noteId))locations.push(next);}
      else visit(item,next);
    }
  }
  visit(project);
  return locations.sort();
}

export function reviewState(note,project,entry,currentProject,proposalValid=true){
  if(!entry)return {project,state:'not-assessed'};
  const base={project,summary:typeof entry.summary==='string'?entry.summary.slice(0,600):undefined,reviewedAt:dated(entry.reviewedAt)?entry.reviewedAt:undefined,rationale:typeof entry.rationale==='string'?entry.rationale.slice(0,2000):undefined,appliedAt:dated(entry.appliedAt)?entry.appliedAt:undefined,approvalReference:typeof entry.approvalReference==='string'?entry.approvalReference.slice(0,1000):undefined};
  if(entry.evidenceRevision!==evidenceRevision(note)||entry.projectRevision!==projectRevision(currentProject))return {...base,state:'needs-recheck'};
  if(entry.state==='referenced'&&dated(entry.reviewedAt)&&typeof entry.rationale==='string'&&entry.rationale.trim()){
    const actual=projectSourceLocations(currentProject,note.id);
    if(actual.length&&Array.isArray(entry.sourceLocations)&&canonical([...entry.sourceLocations].sort())===canonical(actual))return {...base,state:'referenced'};
  }
  if(entry.state==='proposed'&&proposalValid&&dated(entry.reviewedAt))return {...base,state:'proposed',proposal:entry.proposal};
  if(entry.state==='no-change'&&dated(entry.reviewedAt)&&typeof entry.rationale==='string'&&entry.rationale.trim())return {...base,state:'no-change',proposal:proposalValid?entry.proposal:undefined};
  if(entry.state==='applied'&&proposalValid&&dated(entry.appliedAt)&&typeof entry.approvalReference==='string'&&entry.approvalReference.trim()&&Array.isArray(entry.changes)&&entry.changes.length&&entry.changes.every(c=>typeof c.path==='string'&&digest.test(c.beforeRevision)&&digest.test(c.afterRevision)&&c.beforeRevision!==c.afterRevision)&&entry.changes.some(c=>c.path===`topics/project-progress.json#projects.${project}`&&c.afterRevision===projectRevision(currentProject)))return {...base,state:'applied',proposal:entry.proposal};
  return {...base,state:'needs-recheck'};
}

export async function attachProjectReviews(root,notes,projects,safePath,warnings){
  let entries=[];
  try{
    const file=path.join(root,'.project-reviews.json');
    const stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw new Error('Invalid review registry');
    const data=JSON.parse(await fs.readFile(file,'utf8'));
    if(data.version!==1||!Array.isArray(data.entries))throw new Error('Invalid review registry');
    entries=data.entries;
  }catch(error){
    if(error.code!=='ENOENT'){
      warnings.push({file:'.project-reviews.json',error:'Project impact reviews could not be read'});
      for(const note of notes)note.projectReviews=note.labels.filter(l=>l.startsWith('project:')).map(l=>({project:l.slice(8),state:'unavailable'}));
      return;
    }
  }
  const indexed=new Map();
  for(const entry of entries)if(entry&&typeof entry.noteId==='string'&&typeof entry.project==='string')indexed.set(JSON.stringify([entry.noteId,entry.project]),entry);
  for(const note of notes){
    note.evidenceRevision=evidenceRevision(note);
    note.projectReviews=[];
    for(const label of note.labels.filter(l=>l.startsWith('project:'))){
      const project=label.slice(8),entry=indexed.get(JSON.stringify([note.id,project]));
      let proposalValid=false;
      if(entry&&/^documents\/\.project-updates\/[a-z0-9-]+\.md$/.test(entry.proposal||'')&&digest.test(entry.proposalRevision||'')){
        try{const file=await safePath(root,entry.proposal);const bytes=await fs.readFile(file.resolved);proposalValid=createHash('sha256').update(bytes).digest('hex')===entry.proposalRevision;}catch{/* Missing/changed proposals must never appear applied. */}
      }
      note.projectReviews.push(reviewState(note,project,entry,projects[project],proposalValid));
    }
  }
}
