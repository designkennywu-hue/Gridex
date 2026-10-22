import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,rename} from 'node:fs/promises';
const execute=promisify(execFile);
export function createZoomAutoRecorder({recorder,probe,now=Date.now,startDelay=4000,endDelay=15000,uncertainLimit=60000,maxDuration=4*3600000}) {
 let generation=0;
 let owned=null,suppressed=false,seenAt=null,absentAt=null,unknownAt=null,running=false,enabled=false;
 let state={enabled:false,phase:'off',message:'Automatic Zoom recording is off.'};
 const status=()=>({...state,ownsRecording:!!owned});
 const save=async()=>{const session=owned;owned=null;if(session&&recorder.status().sessionId===session.id){try{await recorder.stop('',null);}catch(error){if(recorder.status().sessionId===session.id)owned=session;throw error;}}};
 return {status,
  async configure(value){generation++;enabled=value;state.enabled=value;if(!value){await save();state.phase='off';state.message='Automatic Zoom recording is off.';}return status();},
  async tick(){if(running||!enabled)return;running=true;
   try {
    const revision=generation;
    const signal=await probe().catch(error=>({meeting:null,reason:'Zoom detection unavailable: '+error.message}));if(!enabled||generation!==revision)return;
    const time=now(),session=recorder.status();
    state.checkedAt=new Date(time).toISOString();state.message=signal.reason;
    if(owned&&session.sessionId!==owned.id){owned=null;suppressed=true;}
    if(signal.meeting===null){seenAt=null;absentAt=null;unknownAt??=time;state.phase='needs-attention';if(owned&&time-unknownAt>=uncertainLimit){await save();suppressed=true;state.message='Detection was lost. Recording saved; restart manually if needed.';}return;}
    unknownAt=null;
    if(signal.meeting===false){seenAt=null;absentAt??=time;if(time-absentAt>=endDelay){await save();suppressed=false;}state.phase=owned?'ending':'waiting';return;}
    absentAt=null;seenAt??=time;
    if(owned){state.phase='recording';if(time-owned.at>=maxDuration){await save();suppressed=true;state.message='Four-hour limit reached. Recording saved.';}return;}
    if(suppressed){state.phase='suppressed';state.message='Stopped for this meeting. Automatic recording resumes after you leave.';return;}
    if(session.state!=='idle'){suppressed=true;state.phase='manual';state.message='An existing recording is open; automatic recording will not interrupt it.';return;}
    if(time-seenAt>=startDelay){const result=recorder.start();owned={id:result.sessionId,at:time};state.phase='recording';state.message='Zoom meeting detected. Recording locally.';}
    else state.phase='confirming';
   }catch(error){state.phase='error';state.message=error.message;seenAt=null;suppressed=true;}
   finally{running=false;}
  }
 };
}
export async function startZoomAutoRecorder({recorder,root,helper}) {
 const configPath=root+'/.zoom-autorecord.json';
 const controller=createZoomAutoRecorder({recorder,probe:async()=>{const {stdout}=await execute(helper,[],{timeout:12000,maxBuffer:8192});return JSON.parse(stdout);}});
 let config={enabled:false};try{config=JSON.parse(await readFile(configPath,'utf8'));}catch{}
 await controller.configure(config.enabled===true);
 const timer=setInterval(()=>controller.tick(),5000);timer.unref();controller.tick();
 return {status:controller.status,close:()=>clearInterval(timer),async configure(enabled){if(typeof enabled!=='boolean')throw Object.assign(new Error('Choose on or off.'),{status:400});await writeFile(configPath+'.tmp',JSON.stringify({enabled},null,2)+'\n',{mode:0o600});await rename(configPath+'.tmp',configPath);return controller.configure(enabled);}};
}
