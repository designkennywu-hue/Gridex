import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {safePath} from './server.mjs';
import {mutateRecording} from './recordings.mjs';
const assets=path.join(path.dirname(fileURLToPath(import.meta.url)),'recorder');
const jobs=new Map();let queue=Promise.resolve();
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function location(root,id){
  if(typeof id!=='string'||!/^inbox\/[^/.][^/]*\/audio\.mp3$/.test(id)||id.includes('\\'))throw fail('Choose an inbox recording.');
  const audio=(await safePath(root,id)).resolved;
  // Reject symlinked recording directories and files, including links inside the base.
  for(const file of [path.join(root,'inbox'),path.dirname(path.join(root,id)),path.join(root,id)])if((await fs.lstat(file)).isSymbolicLink())throw fail('Recording links are not supported.',403);
  return {audio,dir:path.dirname(audio),key:path.resolve(root)+'\0'+id};
}
async function source(root,id){
  const loc=await location(root,id);const file=path.join(loc.dir,'transcript.json');
  const stat=await fs.lstat(file);if(stat.isSymbolicLink()||stat.size>20*1024*1024)throw fail('Invalid transcript.',403);
  const bytes=await fs.readFile(file);const data=JSON.parse(bytes);
  const segments=(data.segments||[]).map((s,index)=>({index,start:Number(s.start),end:Number(s.end),text:String(s.text||'').trim()})).filter(s=>Number.isFinite(s.start)&&s.start>=0&&Number.isFinite(s.end)&&s.end>=s.start&&s.text);
  return {...loc,revision:hash(bytes),segments};
}
async function readSidecar(dir){
  try{const file=path.join(dir,'speakers.json');const stat=await fs.lstat(file);if(stat.isSymbolicLink()||stat.size>20*1024*1024)throw fail('Invalid speaker file.',403);return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function save(dir,data){
  const temp=path.join(dir,'.speakers-'+randomUUID()+'.tmp');
  try{await fs.writeFile(temp,JSON.stringify(data,null,2)+'\n',{flag:'wx'});await fs.rename(temp,path.join(dir,'speakers.json'));}finally{await fs.rm(temp,{force:true});}
}
export function alignSpeakers(segments,turns){
  const ids=new Map();
  return segments.map(s=>{
    const overlap=new Map();for(const t of turns){const amount=Math.max(0,Math.min(s.end,t.end)-Math.max(s.start,t.start));if(amount)overlap.set(t.speaker,(overlap.get(t.speaker)||0)+amount);}
    const ranked=[...overlap].sort((a,b)=>b[1]-a[1]);
    // Leave gaps and mixed/overlapping voices unattributed rather than inventing a turn.
    if(!ranked.length||ranked[0][1]<Math.max(0.1,(s.end-s.start)*0.45)||(ranked[1]&&ranked[0][1]<ranked[1][1]*1.5))return null;
    const voice=ranked[0][0];if(!ids.has(voice))ids.set(voice,'speaker-'+(ids.size+1));return ids.get(voice);
  });
}
export async function speakerTranscript(root,id){
  let src;try{src=await source(root,id);}catch(e){if(e.code==='ENOENT')return {segments:[],state:'pending'};throw e;}
  const side=await readSidecar(src.dir);const current=side?.transcriptRevision===src.revision;
  return {revision:src.revision,segments:src.segments.map((s,i)=>({...s,speaker:current?side.assignments[i]||null:null})),names:current?side.names||{}:{},state:['queued','running'].includes(jobs.get(src.key)?.state)?jobs.get(src.key).state:current?'done':side?'stale':jobs.get(src.key)?.state==='error'?'error':'ready',progress:jobs.get(src.key)?.progress,error:jobs.get(src.key)?.error};
}
function run(command,args,onLine){return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let pending='',errors='';
  child.stdout.on('data',b=>{pending+=b;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)onLine?.(line);});
  child.stderr.on('data',b=>{errors=(errors+b).slice(-1500);});child.on('error',reject);
  child.on('close',code=>{if(pending)onLine?.(pending);code===0?resolve():reject(new Error('Speaker processing failed. '+errors.slice(-300)));});
});}
export async function detectSpeakers(root,id){
  const src=await source(root,id);if(!src.segments.length)throw fail('Wait for the transcript first.',409);
  if(['queued','running'].includes(jobs.get(src.key)?.state))return speakerTranscript(root,id);
  const prior=await readSidecar(src.dir);if(prior?.transcriptRevision===src.revision)return speakerTranscript(root,id);
  if(['queued','running'].includes(jobs.get(src.key)?.state))return speakerTranscript(root,id);
  const job={state:'queued',progress:0};jobs.set(src.key,job);
  queue=queue.catch(()=>{}).then(async()=>{
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'gridex-speakers-'));const wav=path.join(temp,'audio.wav');
    try{
      job.state='running';await run('/usr/bin/afconvert',['-f','WAVE','-d','LEI16@16000','-c','1',src.audio,wav]);
      let turns;await run(path.join(assets,'.speaker-runtime/bin/python'),[path.join(assets,'speakers.py'),wav],line=>{try{const data=JSON.parse(line);if(data.progress!==undefined)job.progress=data.progress;if(data.turns)turns=data.turns;}catch{}});
      if(!Array.isArray(turns))throw new Error('Speaker model returned no results.');
      if(new Set(turns.map(t=>t.speaker)).size>20)throw new Error('The audio could not be separated into reliable speaker groups. Try a clearer recording.');
      await mutateRecording(root,async()=>{
        const current=await source(root,id);if(current.revision!==src.revision)throw new Error('Transcript changed. Run speaker detection again.');
        await save(src.dir,{version:1,transcriptRevision:src.revision,createdAt:new Date().toISOString(),method:'sherpa-onnx 1.13.8 / pyannote-segmentation-3.0 / nemo-en-titanet-small / threshold 0.85',turns,assignments:alignSpeakers(src.segments,turns),names:{}});
      });job.state='done';job.progress=100;
    }catch(e){job.state='error';job.error=e.message;}finally{await fs.rm(temp,{recursive:true,force:true});}
  });
  return speakerTranscript(root,id);
}
export async function renameSpeaker(root,input){return mutateRecording(root,async()=>{
  const src=await source(root,input.id);const side=await readSidecar(src.dir);
  if(src.revision!==input.revision||side?.transcriptRevision!==src.revision)throw fail('Transcript changed. Refresh before editing speakers.',409);
  if(typeof input.speaker!=='string'||!side.assignments.includes(input.speaker)||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>80||/[\x00-\x1f\x7f]/.test(input.name))throw fail('Enter a speaker name of 1–80 characters.');
  side.names={...side.names,[input.speaker]:input.name.trim()};await save(src.dir,side);return speakerTranscript(root,input.id);
});}

export {source as transcriptSource};
