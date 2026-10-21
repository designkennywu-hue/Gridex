import React, {useEffect, useRef, useState} from 'react';
import {Button} from '@gridware/ui/components/Button/Button';
import {Input} from '@gridware/ui/components/Input/Input';
import {Select} from '@gridware/ui/components/Select/Select';
import {Icon} from '@gridware/ui/icons/Icon';
import {Spinner} from '@gridware/ui/components/Spinner/Spinner';

export type RecordingJob = {id:string;title:string;transcript:{state:string;progress?:number;error?:string};summary:{state:string;error?:string}};
export async function captureRequest(action:string, data:object = {}) {
  const response = await fetch('/api/capture/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Second-Brain':'capture'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Recording could not be updated.');
  return result;
}
const stamp = (seconds:number) => { const n=Math.max(0,Math.floor(seconds)); return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':'); };
const stored = (key:string) => {try{return localStorage.getItem(key)||'';}catch{return '';}};
export function processingLabel(job?:RecordingJob) {
  if (!job) return '';
  if (job.transcript.state==='error') return 'Transcription failed';
  if (job.transcript.state==='running') return 'Transcribing'+(job.transcript.progress ? ` · ${job.transcript.progress}%` : '…');
  if (job.transcript.state==='queued') return 'Transcription queued';
  if (job.summary.state==='running' || job.summary.state==='queued') return 'Preparing summary…';
  if (job.summary.state==='error') return 'Summary failed';
  if (job.summary.state==='done') return 'Transcript and summary ready';
  if (job.transcript.state==='done') return 'Transcript ready';
  return 'Awaiting transcription';
}
export const isProcessing = (job?:RecordingJob) => !!job && [job.transcript.state,job.summary.state].some(state=>['running','queued'].includes(state));
export function RecordingProcessing({job,compact=false}: {job?:RecordingJob;compact?:boolean}) {
  const loading=isProcessing(job);
  if(!job)return null;
  const label=processingLabel(job);
  if(compact)return loading?<span className="recording-processing-inline"><Spinner size="2xs" aria-hidden="true"/><span>{label}</span></span>:null;
  return <div className={'recording-processing '+(loading?'is-loading':'')} aria-busy={loading}>
    <div className="recording-processing-heading" role="status" aria-live="polite">{loading&&<Spinner size="xs" aria-hidden="true"/>}<span>{label}</span></div>
    {loading&&<>
      <p>You can keep browsing. Your recording is saved, and this page updates automatically.</p>
      <ol className="recording-processing-steps" aria-label="Recording processing steps">{[['Transcript',job.transcript.state],['Summary',job.summary.state]].map(([name,state])=><li key={name} className={state}><span aria-hidden="true">{state==='done'?<Icon name="check" size="sm"/>:state==='running'?<Spinner size="2xs" aria-hidden="true"/>:<span className="processing-step-dot"/>}</span><span>{name}</span><small>{state==='done'?'Ready':state==='running'?'In progress':state==='error'?'Failed':'Waiting'}</small></li>)}</ol>
      {job.transcript.state==='running'&&Number.isFinite(job.transcript.progress)&&<progress className="transcription-progress" aria-label="Transcription progress" max={100} value={job.transcript.progress}/>}
    </>}
  </div>;
}
export function RecorderWidget({projects,onSaved,onJobs,onOpen}: {projects:{value:string;label:string}[];onSaved:(id:string)=>Promise<void>;onJobs:(jobs:RecordingJob[])=>void;onOpen:(id:string)=>void}) {
  const [mode,setMode]=useState<'hidden'|'expanded'|'mini'>('hidden');
  const [optionsOpen,setOptionsOpen]=useState(false);
  const [position,setPosition]=useState(()=>{try{return JSON.parse(stored('index-recorder-position')) || {x:window.innerWidth-364,y:window.innerHeight-350};}catch{return {x:window.innerWidth-364,y:window.innerHeight-350};}});
  const panel=useRef<HTMLElement|null>(null);
  const drag=useRef<{id:number;x:number;y:number;left:number;top:number;moved:boolean}|null>(null);
  const [dragging,setDragging]=useState(false);
  const actionPending=useRef(false);
  const actionVersion=useRef(0);
  function clampPosition(x:number,y:number) {
    const r=panel.current?.getBoundingClientRect();
    return {x:Math.max(12,Math.min(x,window.innerWidth-(r?.width||340)-12)),y:Math.max(12,Math.min(y,window.innerHeight-(r?.height||300)-12))};
  }
  useEffect(()=>{
    if(mode==='hidden')return;
    const fit=()=>setPosition((p:{x:number;y:number})=>{const next=clampPosition(p.x,p.y);return next.x===p.x&&next.y===p.y?p:next;});
    fit(); const observer=new ResizeObserver(fit);if(panel.current)observer.observe(panel.current);
    window.addEventListener('resize',fit);return()=>{observer.disconnect();window.removeEventListener('resize',fit);};
  },[mode]);
  useEffect(()=>{if(!dragging)try{localStorage.setItem('index-recorder-position',JSON.stringify(position));}catch{}},[position,dragging]);
  function beginDrag(e:React.PointerEvent<HTMLElement>){
    if(e.button!==0 || (e.target as HTMLElement).closest('button,input,[role=combobox]'))return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:position.x,top:position.y,moved:false};
  }
  function moveDrag(e:React.PointerEvent<HTMLElement>){
    const d=drag.current;if(!d||d.id!==e.pointerId)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<4)return;
    d.moved=true;setDragging(true);setPosition(clampPosition(d.left+e.clientX-d.x,d.top+e.clientY-d.y));
  }
  function endDrag(){drag.current=null;setDragging(false);}

  const [state,setState]=useState({state:'idle',elapsed:0,error:'',levels:[] as number[],next:0});
  const [cap,setCap]=useState<any>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [pendingAction,setPendingAction]=useState('');
  const [title,setTitle]=useState(()=>stored('index-recording-title'));
  const [project,setProject]=useState(()=>stored('index-recording-project'));
  const cursor=useRef(0);
  const callbacks=useRef({onJobs});callbacks.current={onJobs};
  useEffect(()=>{try{localStorage.setItem('index-recording-title',title);localStorage.setItem('index-recording-project',project);}catch{}},[title,project]);
  useEffect(()=>{
    let alive=true,polling=false,count=0;
    async function poll(){
      if(polling || actionPending.current)return;polling=true;const version=actionVersion.current;
      try {
        const response=await fetch('/api/capture/status?since='+cursor.current);
        if(!response.ok)throw new Error('The recording engine is unavailable. Reload Gridex or reopen Open Gridex.command.');
        const data=await response.json();if(!alive || version!==actionVersion.current)return;
        cursor.current=data.next||0;
        setState(previous=>({...data,levels:data.state==='idle'?[]:[...previous.levels,...(data.levels||[])].slice(-48)}));
        if(count++%4===0){const r=await fetch('/api/capture/recordings');if(r.ok){const list=await r.json();if(alive){callbacks.current.onJobs(list);}}}
      }catch(e){if(alive)setError((e as Error).message);}finally{polling=false;}
    }
    poll();const timer=setInterval(poll,800);
    return()=>{alive=false;clearInterval(timer);};
  },[]);
  useEffect(()=>{if(mode==='hidden')return;let alive=true;fetch('/api/capture/capabilities').then(async r=>{if(!r.ok)throw new Error('Could not load recording capabilities.');const data=await r.json();if(alive)setCap(data);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[mode]);
  const active=['starting','recording','paused','stopping'].includes(state.state);
  const recoverable=state.state==='error' && state.elapsed>0;
  useEffect(()=>{if(active)setMode(current=>current==='hidden'?'mini':current);},[active]);
  useEffect(()=>{if(state.state==='error')setMode('expanded');},[state.state]);

  async function action(name:string){
    if(actionPending.current)return;actionPending.current=true;actionVersion.current++;setBusy(true);setPendingAction(name);setError('');
    try {
      const data=await captureRequest(name,name==='stop'?{title,project:projects.some(p=>p.value===project)?project:null}:{});
      if(name==='start'){cursor.current=0;setState({state:'starting',elapsed:0,error:'',levels:[],next:0});setMode('mini');}
      else if(name==='stop'){cursor.current=0;setState({state:'idle',elapsed:0,error:'',levels:[],next:0});setTitle('');setProject('');try{const jobs=await fetch('/api/capture/recordings');if(jobs.ok)callbacks.current.onJobs(await jobs.json());}catch{/* Next poll retries processing status; the recording is already saved. */}await onSaved(data.noteId);setMode('hidden');}
      else setState(previous=>({...previous,state:data.state}));
    }catch(e){setError((e as Error).message);setMode('expanded');}finally{actionPending.current=false;setBusy(false);setPendingAction('');}
  }
  const saving=busy&&pendingAction==='stop' || state.state==='stopping';
  const statusText=saving?'Saving recording…':state.state==='idle'?'Ready to record':state.state==='starting'?'Starting…':state.state==='stopping'?'Saving…':state.state==='paused'?'Paused':state.state==='error'?'Needs attention':'Recording';
  const selectedProject=projects.find(p=>p.value===project);
  const pauseControl=state.state==='recording' || state.state==='paused' ? <Button variant="text" aria-label={state.state==='paused'?'Resume recording':'Pause recording'} title={state.state==='paused'?'Resume':'Pause'} disabled={busy} icon={<Icon name={state.state==='paused'?'play':'pause'} size="sm"/>} onClick={()=>action(state.state==='paused'?'resume':'pause')}/> : null;
  const stopControl=<Button className="floating-record-stop" variant="subtle" aria-label="Stop and save recording" title="Stop and save" disabled={busy||state.state==='starting'||state.state==='stopping'} loading={busy} icon={<span className="record-stop-square"/>} onClick={()=>action('stop')}/>;
  return <>
    <button className={'record-widget-trigger '+(active?'is-recording':'')} onClick={()=>{setError('');setMode('expanded');}} aria-label={active?'Open active recording':'Record a meeting'}><Icon name="mic" size="sm"/><span>{saving?'Saving…':active?(state.state==='paused'?'Paused':'Recording'):'Record a meeting'}</span>{active&&<time>{stamp(state.elapsed)}</time>}</button>
    {mode!=='hidden' && <section ref={panel} role={mode==='expanded'?'dialog':'region'} aria-modal={mode==='expanded'?false:undefined} aria-label={mode==='expanded'?'Recording controls':'Minimized recorder'} className={'floating-recorder '+(mode==='mini'?'is-mini ':'')+(dragging?'is-moving':'')} style={{left:position.x,top:position.y}}>
      <header className="floating-recorder-header" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="floating-recorder-status">{saving?<Spinner size="2xs" aria-hidden="true"/>:<span className={'record-status-dot '+(state.state==='recording'?'is-live':'')}/>}<span>{mode==='mini'?statusText:'Recorder'}</span></div>
        {mode==='mini' && <time className="floating-record-time">{stamp(state.elapsed)}</time>}
        <div className="floating-recorder-actions">
          {mode==='mini' && (active||recoverable) && <>{pauseControl}{stopControl}</>}
          <Button variant="text" aria-label={mode==='mini'?'Expand recorder':'Minimize recorder'} title={mode==='mini'?'Expand':'Minimize'} icon={<Icon name={mode==='mini'?'maximize':'minimize'} size="sm"/>} onClick={()=>setMode(mode==='mini'?'expanded':'mini')}/>
          {!active&&!recoverable && <Button variant="text" aria-label="Close recorder" icon={<Icon name="cross" size="sm"/>} onClick={()=>setMode('hidden')}/>}
        </div>
      </header>
      {mode==='expanded' && <div className="floating-recorder-body">
        <Input id="index-record-title" aria-label="Recording title" placeholder="New recording" maxLength={200} value={title} disabled={state.state==='stopping'} onChange={e=>setTitle(e.target.value)}/>
        <div className="floating-recorder-wave" aria-hidden="true">{Array.from({length:48},(_,i)=><i key={i} style={{height:Math.max(2,(state.levels[i]||0)*64)+'px'}}/>)}</div>
        <div className="floating-recorder-transport"><div><time>{stamp(state.elapsed)}</time><span role="status">{statusText}</span></div><div className="floating-recorder-actions">{active||recoverable ? <>{pauseControl}{stopControl}</> : <Button className="floating-record-start" aria-label="Start recording" title="Start recording" loading={busy} disabled={busy||!cap?.capture?.system} icon={<span className="record-start-dot"/>} onClick={()=>action('start')}/>}</div></div>
        {(error||state.error) && <p role="alert" className="recording-error">{error||state.error}</p>}
        <button className="floating-recorder-options" aria-expanded={optionsOpen} onClick={()=>setOptionsOpen(!optionsOpen)}><span>{selectedProject?.label||'Save to Recordings'}</span><Icon name={optionsOpen?'caret-up':'caret-down'} size="sm"/></button>
        {optionsOpen && <div className="floating-recorder-settings"><Select aria-label="Recording project" scale="md" value={selectedProject?project:''} onChange={setProject} options={[{value:'',label:'Recordings · assign later'},...projects]}/><p>{cap?.whisper?'Local transcription ready':'Checking transcription…'} · {cap?.summary?.available?'Local summaries ready':'Summary engine unavailable'}</p><p>System audio + microphone · Stays on your Mac</p></div>}
      </div>}
    </section>}
  </>;
}
