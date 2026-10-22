import {transcriptBlocks} from '../transcript-blocks.mjs';
import React,{useEffect,useState} from 'react';
import {Button} from '@gridware/ui/components/Button/Button';
import {Input} from '@gridware/ui/components/Input/Input';
import {Dialog} from '@gridware/ui/components/Dialog/Dialog';
type Segment={index:number;start:number;end:number;text:string;speaker:string|null};
type Transcript={revision?:string;segments:Segment[];names?:Record<string,string>;state:string;progress?:number;error?:string;paragraphStarts?:number[];formatState?:string;formatProgress?:number;formatError?:string};
const time=(seconds:number)=>{const n=Math.floor(seconds);return (n>=3600?Math.floor(n/3600)+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
export function RecordingTranscript({id,fallbackText}:{id:string;fallbackText?:string}){
  const [data,setData]=useState<Transcript|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState<string|null>(null),[name,setName]=useState('');
  const label=(speaker:string|null)=>speaker?(data?.names?.[speaker]||'Speaker '+speaker.replace('speaker-','')):'Speaker unassigned';
  useEffect(()=>{
    let cancelled=false,timer:ReturnType<typeof setTimeout>;
    const load=async()=>{try{const response=await fetch('/api/transcript?id='+encodeURIComponent(id));const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load transcript');if(!cancelled){setData(result);timer=setTimeout(load,(['running','queued','pending'].includes(result.state)||['queued','running'].includes(result.formatState))?3000:20000);}}catch(e){if(!cancelled)setError((e as Error).message);}};
    load();return()=>{cancelled=true;clearTimeout(timer);};
  },[id]);
  useEffect(()=>{
    if(!data?.revision||data.formatState!=='ready'||!data.segments.length)return;
    let cancelled=false;
    fetch('/api/transcript',{method:'POST',headers:{'Content-Type':'application/json','X-Second-Brain':'recordings'},body:JSON.stringify({id,action:'format'})}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not format paragraphs');if(!cancelled)setData(previous=>previous?{...previous,...result}:previous);}).catch(e=>{if(!cancelled)setError(e.message);});
    return()=>{cancelled=true;};
  },[id,data?.revision,data?.formatState]);
  async function change(action:string){setBusy(true);setError('');try{const response=await fetch('/api/transcript',{method:'POST',headers:{'Content-Type':'application/json','X-Second-Brain':'recordings'},body:JSON.stringify({id,action,revision:data?.revision,speaker:editing,name})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not update transcript');setData(previous=>action==='format'&&previous?{...previous,...result}:result);if(action==='rename')setEditing(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function seek(seconds:number){const audio=document.querySelector<HTMLAudioElement>('.recording-content audio');if(audio){audio.currentTime=seconds;audio.play().catch(()=>{});}}
  const processing=['queued','running'].includes(data?.state||'');
  return <div className="speaker-transcript">
    <div className="transcript-controls">{data?.segments.length? <><span>{processing?'Identifying speakers'+(data.progress?' · '+data.progress+'%':'')+'…':data.state==='done'?'Speaker labels are automatic. Select a name to rename it.':'Timestamped transcript · speakers not identified yet'}</span>{!processing&&data.state!=='done'&&<Button variant="outlined" scale="sm" loading={busy} onClick={()=>change('detect')}>{data.state==='error'?'Retry speaker detection':'Identify speakers'}</Button>}</>:<span>{data?.state==='pending'?'The transcript is not ready yet.':'Loading transcript…'}</span>}</div>
    {data?.state==='stale'&&<p className="transcript-notice">The transcript changed. Identify speakers again to refresh the labels.</p>}
    {(error||data?.error)&&<p role="alert" className="recording-error">{error||data?.error}</p>}
    {((error&&!data)||data?.state==='pending'||(data&&data.state!=='pending'&&!data.segments.length))&&fallbackText&&<p className="transcript-original">{fallbackText}</p>}
    {['queued','running'].includes(data?.formatState||'')&&<p className="transcript-notice" role="status">Organizing paragraphs by context{data?.formatProgress?' · '+data.formatProgress+'%':''}…</p>}
    {data?.formatError&&<p className="transcript-notice">{data.formatError} <Button variant="text" scale="sm" onClick={()=>change('format')}>Retry paragraph formatting</Button></p>}
    {transcriptBlocks(data?.segments||[],data?.paragraphStarts).map((block,i)=><section className="transcript-block" key={i}><div className="transcript-block-heading"><button className="transcript-time" aria-label={'Play from '+time(block.start)} onClick={()=>seek(block.start)}>{time(block.start)}</button>{block.speaker?<button className="speaker-name" onClick={()=>{setEditing(block.speaker);setName(label(block.speaker));}} title="Rename speaker throughout this recording">{label(block.speaker)}</button>:<span className="speaker-unassigned">{label(null)}</span>}</div>{block.paragraphs.map((paragraph,j)=><div className="transcript-paragraph" key={j}>{j>0&&<button className="transcript-paragraph-time" aria-label={'Play from '+time(paragraph.start)} onClick={()=>seek(paragraph.start)}>{time(paragraph.start)}</button>}<p>{paragraph.text.join(' ')}</p></div>)}</section>)}
    <Dialog open={editing!==null} onClose={()=>{if(!busy)setEditing(null);}} title="Rename speaker" description="This name will appear on every turn assigned to this speaker in this recording." footer={<><Button variant="outlined" disabled={busy} onClick={()=>setEditing(null)}>Cancel</Button><Button htmlType="submit" form="rename-speaker" loading={busy} disabled={!name.trim()}>Save name</Button></>}><form id="rename-speaker" onSubmit={e=>{e.preventDefault();change('rename');}}><label htmlFor="speaker-name">Speaker name</label><Input id="speaker-name" value={name} onChange={e=>setName(e.target.value)} maxLength={80} autoFocus/>{error&&<p role="alert">{error}</p>}</form></Dialog>
  </div>;
}
