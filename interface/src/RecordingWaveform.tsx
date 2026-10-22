import React,{useEffect,useRef,useState} from 'react';
type Segment={id:number;level:number};

// Each segment keeps its height and identity. Only the whole strip slides.
export function RecordingWaveform({levels,next,running}:{levels:number[];next:number;running:boolean}){
 const viewport=useRef<HTMLDivElement>(null),seen=useRef(0);
 const [width,setWidth]=useState(288);
 const [segments,setSegments]=useState<Segment[]>(()=>Array.from({length:96},(_,i)=>({id:i-96,level:0})));
 const [position,setPosition]=useState(0);
 useEffect(()=>{const el=viewport.current;if(!el)return;const resize=()=>setWidth(el.clientWidth);const observer=new ResizeObserver(resize);observer.observe(el);resize();return()=>observer.disconnect();},[]);
 useEffect(()=>{
  const count=Math.ceil(width/6)+96;
  if(next===0||next<seen.current){setSegments(Array.from({length:count},(_,i)=>({id:i-count,level:0})));setPosition(0);seen.current=0;}
  const added=Math.max(0,next-seen.current);
  if(added){
   const incoming=levels.slice(-Math.min(added,levels.length));
   const first=next-incoming.length;
   setSegments(old=>[...old,...incoming.map((level,i)=>({id:first+i,level}))].slice(-count));
   setPosition(next);
  }
  seen.current=next;
 },[levels,next,width]);
 return <div ref={viewport} className="floating-recorder-wave" aria-hidden="true"><div className={'floating-recorder-wave-track'+(running&&position?' is-scrolling':'')} style={{transform:`translateX(${width-3-(position-1)*6}px)`}}>{segments.map(segment=><i key={segment.id} data-segment={segment.id} style={{left:segment.id*6,height:Math.max(2,segment.level*64)+'px'}}/>)}</div></div>;
}
