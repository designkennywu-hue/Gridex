import {mapLayers,mapLayerKey,mapLayerColor} from '../map-layers.mjs';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '@gridware/ui/components/Button/Button';
import {Select} from '@gridware/ui/components/Select/Select';
import {Chip} from '@gridware/ui/components/Chip/Chip';
import {Checkbox} from '@gridware/ui/components/Checkbox/Checkbox';
import {Icon} from '@gridware/ui/icons/Icon';
import {Avatar} from '@gridware/ui/components/Avatar/Avatar';
import {assessmentStates} from './ProjectImpact';
import './knowledge-map.css';
import {zoomCamera,fitCamera} from '../map-navigation.mjs';
import {createGraphPhysics} from '../map-physics.mjs';
import {prioritizeLabels} from '../map-labels.mjs';
import {avatarTextColor} from '../color-contrast.mjs';
type Node={id:string;type:string;label:string;path?:string;url?:string;project?:string;projects:string[];provider:string;summary?:string;updated?:string;kind?:string;archived?:boolean;locator?:string;assignedBy?:string;assessments?:{project:string;state:string}[]};
type Edge={id:string;from:string;to:string;relation:string;locator:string};
type Graph={nodes:Node[];edges:Edge[];gaps:{from:string;target:string}[];coverage:string};
const types:Record<string,string>={project:'Projects',insight:'Insights & notes',recording:'Recordings',source:'Preserved sources',mapping:'Index & project sections',external:'External references',topic:'Topics',person:'People'};
const relations:Record<string,string>={assignment:'Assigned to project',source:'Cites source',reference:'References',tag:'Tagged with',evidence:'Used as section evidence',section:'Section of',indexed:'Listed in index'};
function saved(){try{return {...JSON.parse(localStorage.getItem('gridex-map-filters')||'{}'),...JSON.parse(sessionStorage.getItem('gridex-map-view')||'{}')};}catch{return {};}}
export function KnowledgeMap({query,refreshKey,projectName,onOpen,onProject,onClearSearch,scopeProject,onReturnToIndex,embedded=false,visibleNoteIds}:{embedded?:boolean;visibleNoteIds?:string[];scopeProject?:string;onReturnToIndex?:()=>void;query:string;refreshKey:string;projectName:(id:string)=>string;onOpen:(id:string)=>void;onProject:(id:string)=>void;onClearSearch:()=>void}){
 const initial=useRef(scopeProject?{...saved(),project:scopeProject,assessment:'all',selected:null,depth:0,mode:'graph',navigationVersion:undefined}:saved()).current;
 const [graph,setGraph]=useState<Graph|null>(null),[error,setError]=useState(''),[project,setProject]=useState(initial.project||'all'),[provider,setProvider]=useState(initial.provider||'all'),[assessment,setAssessment]=useState(initial.assessment||'all'),[colorBy,setColorBy]=useState(mapLayers.some(l=>l.value===initial.colorBy)?initial.colorBy:'type'),[age,setAge]=useState(initial.age||'all'),[relationship,setRelationship]=useState(initial.relationship||'all');
 const [enabled,setEnabled]=useState<string[]>(initial.enabled||['project','insight','recording','source','mapping']),[archived,setArchived]=useState(initial.archived||false),[orphans,setOrphans]=useState(initial.orphans??true),[selected,setSelected]=useState<string|null>(initial.selected||null),[depth,setDepth]=useState([0,1,2].includes(initial.depth)?initial.depth:0),[mode,setMode]=useState(initial.mode==='list'?'list':'graph'),[camera,setCamera]=useState(initial.navigationVersion===2&&initial.camera&&Number.isFinite(initial.camera.x)&&Number.isFinite(initial.camera.y)&&initial.camera.k>=.1&&initial.camera.k<=6?initial.camera:{x:0,y:0,k:1});
 const [hovered,setHovered]=useState<string|null>(null),[focused,setFocused]=useState<string|null>(null),[draggingNode,setDraggingNode]=useState<string|null>(null);
 const [,redraw]=useState(0);
 const labelMeasure=useRef<CanvasRenderingContext2D|null>(null);
 const labelWidths=useRef(new Map<string,number>());
 useEffect(()=>{let mounted=true;document.fonts.ready.then(()=>{if(mounted){labelWidths.current.clear();redraw(n=>n+1);}});return()=>{mounted=false;};},[]);
 const [viewportScale,setViewportScale]=useState(1);
 const defaultFramed=useRef(initial.navigationVersion===2);
 const frame=useRef<number|null>(null),persist=useRef(()=>{}),physics=useRef<any>(null);
 if(!physics.current)physics.current=createGraphPhysics({positions:initial.positions||{},topology:initial.layoutTopology||'',reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,onTick:()=>{if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;redraw(n=>n+1);});},onEnd:()=>persist.current()});
 persist.current=()=>{try{sessionStorage.setItem('gridex-map-view',JSON.stringify({navigationVersion:2,camera,depth,mode,positions:physics.current.snapshot(),layoutTopology:physics.current.topology()}));}catch{}};
 useEffect(()=>{persist.current();},[camera,depth,mode]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>physics.current.setReducedMotion(media.matches);media.addEventListener('change',change);const save=()=>persist.current();window.addEventListener('pagehide',save);return()=>{media.removeEventListener('change',change);window.removeEventListener('pagehide',save);physics.current.stop();persist.current();if(frame.current!==null)cancelAnimationFrame(frame.current);};},[]);
 const controlsRef=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(controlsRef.current&&!controlsRef.current.contains(e.target as globalThis.Node))controlsRef.current.open=false;};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const lastTap=useRef<{id:string;at:number;x:number;y:number}|null>(null);
 const drag=useRef<any>(null),svgRef=useRef<SVGSVGElement>(null);
 useEffect(()=>{let active=true;fetch('/api/knowledge-map').then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load map');if(active){setGraph(data);setError('');}}).catch(e=>active&&setError(e.message));return()=>{active=false;};},[refreshKey]);
 useEffect(()=>{try{localStorage.setItem('gridex-map-filters',JSON.stringify({project,provider,assessment,colorBy,enabled,archived,orphans,selected,age,relationship}));}catch{}},[project,provider,assessment,colorBy,enabled,archived,orphans,selected,age,relationship,visibleNoteIds]);
 const all=useMemo(()=>new Map((graph?.nodes||[]).map(n=>[n.id,n])),[graph]);
 const graphProjects=(graph?.nodes||[]).filter(n=>n.type==='project');
 const title=(n:Node)=>n.type==='project'?projectName(n.project!):n.type==='mapping'?n.label.replace(/\.\s.*$/,'.'):n.label;
 const filtered=useMemo(()=>{
  if(!graph)return {nodes:[] as Node[],edges:[] as Edge[]};
  const allowedProjects=new Set(graphProjects.filter(n=>archived||!n.archived).map(n=>n.project));
  const contextual=new Set(graph.nodes.filter(n=>project==='all'||n.projects.includes(project)).map(n=>n.id));
  if(project!=='all')for(let step=0;step<2;step++)for(const e of graph.edges)if(contextual.has(e.from)&&['source','reference','tag'].includes(e.relation))contextual.add(e.to);
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matched=new Set(graph.nodes.filter(n=>terms.every(t=>(n.label+' '+n.summary+' '+n.path+' '+n.provider).toLowerCase().includes(t))).map(n=>n.id));
  const searchVisible=new Set(matched);if(terms.length)for(const e of graph.edges)if(matched.has(e.from)||matched.has(e.to)){searchVisible.add(e.from);searchVisible.add(e.to);}
  let nodes=graph.nodes.filter(n=>enabled.includes(n.type)&&contextual.has(n.id)&&(archived||!n.archived)&&(archived||!n.projects.length||n.projects.some(p=>allowedProjects.has(p)))&&(provider==='all'||['project','mapping'].includes(n.type)||n.provider===provider)&&(!terms.length||searchVisible.has(n.id))&&(age==='all'||!['insight','recording'].includes(n.type)||!!n.updated&&Date.now()-Date.parse(n.updated)<Number(age)*86400000)&&(assessment==='all'||!['insight','recording'].includes(n.type)||(n.assessments?.length?n.assessments.filter(r=>project==='all'||r.project===project):[{state:'not-assessed'}]).some(r=>r.state===assessment)));
  if(assessment!=='all'){const seeds=new Set(nodes.filter(n=>['insight','recording'].includes(n.type)).map(n=>n.id)),keep=new Set(seeds);for(let i=0;i<2;i++)for(const e of graph.edges)if(keep.has(e.from)&&(!['insight','recording'].includes(all.get(e.to)?.type||'')||seeds.has(e.to)))keep.add(e.to);nodes=nodes.filter(n=>keep.has(n.id));}
  if(visibleNoteIds){const seeds=new Set(visibleNoteIds),keep=new Set(seeds);for(const e of graph.edges)if(seeds.has(e.from)||seeds.has(e.to)){keep.add(e.from);keep.add(e.to);}nodes=nodes.filter(n=>keep.has(n.id));}
  const ids=new Set(nodes.map(n=>n.id));let edges=graph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)&&(relationship==='all'||relationship===e.relation));
  if(depth&&selected&&ids.has(selected)){const neighborhood=new Set([selected]);for(let i=0;i<depth;i++){const next=new Set(neighborhood);for(const e of edges)if(neighborhood.has(e.from)||neighborhood.has(e.to)){next.add(e.from);next.add(e.to);}for(const id of next)neighborhood.add(id);}nodes=nodes.filter(n=>neighborhood.has(n.id));edges=edges.filter(e=>neighborhood.has(e.from)&&neighborhood.has(e.to));}
  if(!orphans){const linked=new Set(edges.flatMap(e=>[e.from,e.to]));nodes=nodes.filter(n=>linked.has(n.id));}
  return {nodes,edges};
 },[graph,project,provider,assessment,enabled,archived,orphans,query,depth,selected,age,relationship,visibleNoteIds]);
 useEffect(()=>{const svg=svgRef.current;if(!svg)return;const resize=()=>setViewportScale(Math.abs(svg.getScreenCTM()?.a||1));const observer=new ResizeObserver(resize);observer.observe(svg);resize();return()=>observer.disconnect();},[mode,!!graph,filtered.nodes.length>0]);
 useEffect(()=>{if(!graph||!svgRef.current||defaultFramed.current)return;defaultFramed.current=true;const scale=Math.abs(svgRef.current.getScreenCTM()?.a||1),k=Math.min(6,1.1/scale);setCamera({x:600-600*k,y:420-420*k,k});},[mode,!!graph,viewportScale,filtered.nodes.length>0]);
 const topology=JSON.stringify([filtered.nodes.map(n=>[n.id,n.type]),filtered.edges.map(e=>[e.from,e.to])]);
 useEffect(()=>{if(graph)physics.current.update(filtered.nodes,filtered.edges);},[topology,!!graph]);
 useEffect(()=>{const visibility=()=>{if(document.hidden||mode!=='graph')physics.current.pause();else physics.current.resume();};visibility();document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);},[mode]);
 const point=(id:string)=>physics.current.point(id);
 const colors=useMemo(()=>new Map(Object.keys(types).map(key=>[key,mapLayerColor(key,'type')])),[]);
 const color=(n:Node)=>mapLayerColor(mapLayerKey(n,colorBy,project),colorBy);
 const layerLabel=(key:string)=>colorBy==='type'?types[key]:colorBy==='assessment'?(assessmentStates[key]?.label||({mixed:'Mixed project reviews','not-applicable':'No assessment for this entity'} as Record<string,string>)[key]||key):colorBy==='project'?(key==='unassigned'?'Unassigned':key==='multiple-projects'?'Multiple projects':projectName(key)):({local:'Local notes',preserved:'Preserved files',recording:'Recordings',slack:'Slack',confluence:'Confluence',linear:'Linear',github:'GitHub',slides:'Slides','agent-work':'Agent work',web:'Web'} as Record<string,string>)[key]||key;
 const layerGroups=useMemo(()=>{const counts=new Map<string,number>();for(const n of filtered.nodes){const key=mapLayerKey(n,colorBy,project);counts.set(key,(counts.get(key)||0)+1);}return [...counts].sort((a,b)=>layerLabel(a[0]).localeCompare(layerLabel(b[0])));},[filtered.nodes,colorBy,project,projectName]);
 const emphasized=draggingNode||hovered||focused||selected;
 const highlighting=filtered.nodes.some(n=>n.id===emphasized);
 const screenZoom=Math.max(.01,camera.k*viewportScale);
 const detailOpacity=Math.max(0,Math.min(1,(screenZoom-.65)/.35));
 function openEntityProject(n:Node){const target=n.type==='project'?n.project:project!=='all'&&n.projects.includes(project)?project:n.project||n.projects[0];onProject(target||'__other');}
 const adjacent=new Set((graph?.edges||[]).filter(e=>e.from===emphasized||e.to===emphasized).flatMap(e=>[e.from,e.to]));
 const degree=new Map<string,number>();
 for(const edge of filtered.edges){degree.set(edge.from,(degree.get(edge.from)||0)+1);degree.set(edge.to,(degree.get(edge.to)||0)+1);}
 if(!labelMeasure.current)labelMeasure.current=document.createElement('canvas').getContext('2d');
 const labelFont=svgRef.current?getComputedStyle(svgRef.current).fontFamily:getComputedStyle(document.body).fontFamily;
 const labelCandidates=filtered.nodes.flatMap(n=>{
  const active=n.id===emphasized,connected=active||adjacent.has(n.id),projectNode=n.type==='project';
  const opacity=highlighting?(connected?1:0):projectNode?1:detailOpacity;
  if(opacity<=0)return [];
  const p=point(n.id),radius=n.type==='person'?12:projectNode?10:n.type==='mapping'?4.5:5,fullTitle=title(n),label=active?fullTitle:fullTitle.length>48?fullTitle.slice(0,47)+'…':fullTitle;
  const font=`${projectNode?500:350} 12px ${labelFont}`,key=font+label;
  let width=labelWidths.current.get(key);
  if(width===undefined){if(labelMeasure.current)labelMeasure.current.font=font;width=labelMeasure.current?.measureText(label).width||label.length*6;labelWidths.current.set(key,width);}
  const x=p.x*screenZoom,y=p.y*screenZoom+radius+16;
  const importance=projectNode?500:n.type==='insight'?300:n.type==='recording'?250:n.type==='source'?150:100;
  return [{id:n.id,label,opacity,projectNode,active,p,radius,left:x-width/2-1,right:x+width/2+1,top:y-11,bottom:y+3,required:active,priority:active?10000:importance+Math.min(99,degree.get(n.id)||0)}];
 });
 const visibleLabels=prioritizeLabels(labelCandidates).sort((a,b)=>Number(a.active)-Number(b.active));
 function choose(id:string){setSelected(id);setHovered(null);setFocused(null);}
 function reset(){onClearSearch();setProject(scopeProject||'all');setProvider('all');setAssessment('all');setAge('all');setRelationship('all');setEnabled(['project','insight','recording','source','mapping']);setArchived(false);setOrphans(true);setDepth(0);setCamera({x:0,y:0,k:1});setSelected(null);setHovered(null);setFocused(null);}
 function zoom(factor:number){setCamera(c=>{const p=selected&&filtered.nodes.some(n=>n.id===selected)?point(selected):null;return zoomCamera(c,factor,p?{x:c.x+p.x*c.k,y:c.y+p.y*c.k}:undefined);});}
 function fit(){setCamera(fitCamera(filtered.nodes.map(n=>point(n.id))));}
 function coords(e:React.PointerEvent){const matrix=svgRef.current?.getScreenCTM();return matrix?new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()):{x:0,y:0};}
 function start(e:React.PointerEvent,id?:string){
  if(e.button!==0&&e.button!==1)return;
  e.preventDefault();
  svgRef.current?.setAttribute('data-pointer-focus','true');
  svgRef.current?.focus({preventScroll:true});
  const panOnly=e.button===1;if(panOnly)id=undefined;
  const p=coords(e),origin=id?{x:point(id).x,y:point(id).y}:{...camera};
  drag.current={id,p,client:{x:e.clientX,y:e.clientY},origin,camera:{...camera},moved:false,panOnly,pointer:e.pointerId};
  svgRef.current?.setPointerCapture(e.pointerId);
 }
 function move(e:React.PointerEvent){
  const d=drag.current;if(!d||d.pointer!==e.pointerId)return;
  if(!d.moved){if(Math.hypot(e.clientX-d.client.x,e.clientY-d.client.y)<5)return;d.moved=true;if(d.id){setHovered(null);setDraggingNode(d.id);physics.current.beginDrag(d.id);}}
  const p=coords(e),dx=p.x-d.p.x,dy=p.y-d.p.y;
  if(d.id)physics.current.dragTo(d.id,d.origin.x+dx/d.camera.k,d.origin.y+dy/d.camera.k);
  else setCamera({...d.camera,x:d.origin.x+dx,y:d.origin.y+dy});
 }
 function end(cancel=false){
  const d=drag.current;if(!d)return;
  drag.current=null;
  if(d.id&&d.moved){lastTap.current=null;physics.current.endDrag(d.id);}
  else if(!cancel&&!d.panOnly){if(d.id){
   const now=performance.now(),previous=lastTap.current;
   if(previous?.id===d.id&&now-previous.at<450&&Math.hypot(previous.x-d.client.x,previous.y-d.client.y)<8){lastTap.current=null;const target=all.get(d.id);if(target)openEntityProject(target);}
   else{lastTap.current={id:d.id,at:now,x:d.client.x,y:d.client.y};choose(d.id);}
  }else{lastTap.current=null;setSelected(null);setDepth(0);setFocused(null);setHovered(null);}}
  setDraggingNode(null);persist.current();
  if(svgRef.current?.hasPointerCapture(d.pointer))svgRef.current.releasePointerCapture(d.pointer);
 }
 function canvasKey(e:React.KeyboardEvent){
  svgRef.current?.removeAttribute('data-pointer-focus');
  const step=e.shiftKey?120:40;
  const pan:Record<string,{x:number;y:number}>={ArrowLeft:{x:step,y:0},ArrowRight:{x:-step,y:0},ArrowUp:{x:0,y:step},ArrowDown:{x:0,y:-step}};
  if(pan[e.key]){e.preventDefault();const d=pan[e.key];setCamera(c=>({...c,x:c.x+d.x,y:c.y+d.y}));}
  else if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.25);}
  else if(e.key==='-'){e.preventDefault();zoom(1/1.25);}
  else if(e.key==='0'||e.key.toLowerCase()==='f'){e.preventDefault();fit();}
  else if(e.key==='Escape'){e.preventDefault();setSelected(null);setDepth(0);setHovered(null);setFocused(null);}
 }
 // Native non-passive wheel handling keeps trackpad gestures inside the canvas.
 useEffect(()=>{
  const svg=svgRef.current;if(!svg)return;
  const wheel=(e:WheelEvent)=>{
   const matrix=svg.getScreenCTM();if(!matrix)return;
   e.preventDefault();
   const unit=e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1;
   const inverse=matrix.inverse();
   const anchor=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse);
   if(e.ctrlKey||e.metaKey){setCamera(c=>zoomCamera(c,Math.exp(-Math.max(-100,Math.min(100,e.deltaY*unit))*0.01),anchor));}
   else {
    const dx=(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX)*unit,dy=(e.shiftKey&&!e.deltaX?0:e.deltaY)*unit;
    setCamera(c=>({...c,x:c.x-inverse.a*dx-inverse.c*dy,y:c.y-inverse.b*dx-inverse.d*dy}));
   }
  };
  svg.addEventListener('wheel',wheel,{passive:false});
  return()=>svg.removeEventListener('wheel',wheel);
 },[mode,!!graph,filtered.nodes.length>0,!!error]);
 const optionCount=[assessment!=='all',age!=='all',relationship!=='all',depth!==0,archived,!orphans,[...enabled].sort().join(',')!==['project','insight','recording','source','mapping'].sort().join(',')].filter(Boolean).length;
 if(error)return <div className="map-error" role="alert">{error}<Button onClick={()=>location.reload()}>Reload</Button></div>;
 return <section className={'knowledge-map'+(embedded?' knowledge-map--embedded':'')} aria-label="Knowledge map">
  {!embedded&&<>
  <header className="map-header"><div><span className="map-eyebrow">YOUR SECOND BRAIN</span><h1>Knowledge map <Chip variant="secondary">{filtered.nodes.length}</Chip></h1><p>Follow the evidence from a source to an insight to a project.</p></div><div className="map-view-switch" aria-label="Map display"><Button variant={mode==='graph'?'subtle':'text'} onClick={()=>setMode('graph')}>Graph</Button><Button variant={mode==='list'?'subtle':'text'} onClick={()=>setMode('list')}>Connections</Button></div></header>
  <div className="map-filters" aria-label="Map controls">
   <Select aria-label="Map project" disabled={!!scopeProject} scale="md" value={project} onChange={v=>{setProject(v);setDepth(0);}} options={scopeProject?[{value:scopeProject,label:projectName(scopeProject)}]:[{value:'all',label:'All projects'},...graphProjects.filter(n=>archived||!n.archived).map(n=>({value:n.project!,label:projectName(n.project!)}))]}/><Select aria-label="Map source" scale="md" value={provider} onChange={setProvider} options={[{value:'all',label:'All sources'},...[...new Set(graph?.nodes.map(n=>n.provider))].sort().map(p=>({value:p,label:p==='local'?'Local notes':p==='preserved'?'Preserved files':p.replace(/-/g,' ')}))]}/>
   <details ref={controlsRef} className="map-controls-disclosure" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();e.stopPropagation();}}}>
    <summary>Filters &amp; display{optionCount>0&&<span className="map-options-count">{optionCount}</span>}</summary>
    <div className="map-controls-panel">
     <fieldset className="map-controls-fields"><legend>Refine the map</legend><label className="map-control-label"><span>Assessment</span><Select aria-label="Map assessment" scale="md" value={assessment} onChange={setAssessment} options={[{value:'all',label:'All assessments'},...Object.entries(assessmentStates).map(([value,s])=>({value,label:s.label}))]}/></label><label className="map-control-label"><span>Date</span><Select aria-label="Map date range" scale="md" value={age} onChange={setAge} options={[{value:'all',label:'All time'},{value:'7',label:'Last 7 days'},{value:'30',label:'Last 30 days'},{value:'90',label:'Last 90 days'}]}/></label><label className="map-control-label"><span>Connections</span><Select aria-label="Map relationship" scale="md" value={relationship} onChange={setRelationship} options={[{value:'all',label:'All connections'},...Object.entries(relations).map(([value,label])=>({value,label}))]}/></label><label className="map-control-label"><span>Neighborhood</span><Select aria-label="Connection depth" scale="sm" disabled={!selected} value={String(depth)} onChange={v=>setDepth(Number(v))} options={[{value:'0',label:'Full graph'},{value:'1',label:'Direct connections'},{value:'2',label:'Two steps away'}]}/></label></fieldset>
     <fieldset className="map-controls-entities"><legend>Show on map</legend><div className="map-entity-choices" aria-label="Map entities">{Object.entries(types).map(([key,name])=><Checkbox key={key} scale="sm" checked={enabled.includes(key)} onChange={()=>setEnabled(old=>old.includes(key)?old.filter(t=>t!==key):[...old,key])} label={<span className="map-checkbox-label"><span className="map-swatch" aria-hidden="true" style={{background:colorBy==='type'?colors.get(key):undefined}}/>{name}</span>}/>)}</div></fieldset>
     <fieldset className="map-controls-visibility"><legend>Visibility</legend><Checkbox scale="sm" checked={archived} onChange={(_,checked)=>setArchived(checked)} label="Include archived projects"/><Checkbox scale="sm" checked={orphans} onChange={(_,checked)=>setOrphans(checked)} label="Show unconnected items"/></fieldset>

     <details className="map-controls-method"><summary>About these connections{graph?.gaps.length?' · '+graph.gaps.length+' unavailable references':''}</summary><p>{graph?.coverage}</p></details>
    </div>
   </details>
   <Button variant="text" scale="sm" onClick={reset}>Reset</Button>
   {onReturnToIndex&&<Button className="project-map-toggle" variant="subtle" scale="md" aria-pressed={true} icon={<Icon name="layers"/>} onClick={onReturnToIndex}>Knowledge map</Button>}
  </div>
  </>}
  <div className="map-body"><div className="map-stage">
   {!graph?<p className="map-empty" role="status">Tracing your knowledge…</p>:!filtered.nodes.length?<div className="map-empty"><h2>No matching connections</h2><p>Try a different filter or search.</p><Button onClick={reset}>Reset filters</Button></div>:mode==='graph'?<svg ref={svgRef} className="map-canvas" viewBox="0 0 1200 840" role="group" tabIndex={0} aria-describedby="map-navigation-help" aria-label="Interactive knowledge connections" onKeyDown={canvasKey} onBlur={()=>svgRef.current?.removeAttribute('data-pointer-focus')} onPointerLeave={()=>setHovered(null)} onPointerDown={e=>start(e)} onPointerMove={move} onPointerUp={()=>end()} onPointerCancel={()=>end(true)} onLostPointerCapture={()=>end(true)}>
    <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
     {filtered.edges.map(e=>{const a=point(e.from),b=point(e.to),active=highlighting&&emphasized&&(e.from===emphasized||e.to===emphasized);return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={'map-edge '+(active?'is-connected':'')+(highlighting&&emphasized&&!active?' is-dimmed':'')} vectorEffect="non-scaling-stroke" strokeDasharray={['evidence','indexed'].includes(e.relation)?'4 4':undefined}></line>;})}
     {filtered.nodes.map(n=>{
      const p=point(n.id),projectNode=n.type==='project',radius=n.type==='person'?12:projectNode?10:n.type==='mapping'?4.5:5,r=radius/screenZoom;
      const fullTitle=title(n);
      return <g role="button" tabIndex={0} aria-label={types[n.type]+': '+fullTitle} aria-pressed={selected===n.id} key={n.id} className={'map-node '+(projectNode?'is-project ':'')+(selected===n.id?'is-selected ':'')+(highlighting&&emphasized&&!adjacent.has(n.id)&&emphasized!==n.id?'is-dimmed':'')} transform={`translate(${p.x} ${p.y})`} onPointerEnter={()=>{if(!drag.current)setHovered(n.id);}} onPointerLeave={()=>setHovered(null)} onFocus={()=>setFocused(n.id)} onBlur={()=>setFocused(null)} onPointerDown={e=>{e.stopPropagation();start(e,n.id);}} onClick={e=>{if(e.detail===0)choose(n.id);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();openEntityProject(n);}else if(e.key===' '){e.preventDefault();choose(n.id);}}}>
       <circle className="map-node-hit" r={Math.max(radius+5,12)/screenZoom} fill="transparent"/>
       <circle className="map-node-selection" r={(radius+4)/screenZoom} fill="none" vectorEffect="non-scaling-stroke"/>
       {n.type==='person'?<><circle className="map-node-dot" vectorEffect="non-scaling-stroke" r={r+.5/screenZoom} fill={color(n)}/><foreignObject className="map-person-avatar" x={-12} y={-12} width={24} height={24} transform={`scale(${1/screenZoom})`} aria-hidden="true"><Avatar size="sm" shape="circle" initials={fullTitle.trim().charAt(0)||'?'} alt={fullTitle} color={color(n)} style={{color:avatarTextColor(color(n))}}/></foreignObject></>:projectNode?<rect x={-r} y={-r} width={r*2} height={r*2} rx={4/screenZoom} transform="rotate(45)" className="map-node-dot" vectorEffect="non-scaling-stroke" fill={color(n)}/>:n.type==='mapping'?<rect x={-r} y={-r} width={r*2} height={r*2} rx={1.5/screenZoom} className="map-node-dot" vectorEffect="non-scaling-stroke" fill={color(n)}/>:<circle className="map-node-dot" vectorEffect="non-scaling-stroke" r={r} fill={color(n)}/>}
      </g>;
     })}
     <g className="map-labels" aria-hidden="true">{visibleLabels.map(({id,label,opacity,projectNode,active,p,radius})=><text key={id} data-node-id={id} className={'map-label'+(projectNode?' is-project':'')+(active?' is-active':'')} x={p.x} y={p.y+(radius+16)/screenZoom} textAnchor="middle" style={{fontSize:12/screenZoom,strokeWidth:2/screenZoom,opacity}}>{label}</text>)}</g>
    </g></svg>:<div className="map-connection-list">{filtered.nodes.map(n=><button key={n.id} onClick={()=>choose(n.id)} onDoubleClick={()=>openEntityProject(n)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();openEntityProject(n);}}} className={selected===n.id?'is-selected':''}><span className="map-swatch" style={{background:color(n)}}/><span><strong>{title(n)}</strong><small>{types[n.type]} · {n.provider}</small></span><span>{graph.edges.filter(e=>e.from===n.id||e.to===n.id).length} links</span></button>)}</div>}
   <span id="map-navigation-help" className="map-navigation-help">Scroll to pan · Pinch to zoom · Double-click or Enter to open project · F to fit. {filtered.nodes.length} entities, {filtered.edges.length} connections.</span>
   {mode==='graph'&&graph&&<>
    <div className="map-layer-control"><Select aria-label="Map color layer" scale="md" value={colorBy} onChange={setColorBy} options={mapLayers.map(layer=>({value:layer.value,label:'Layer: '+layer.label,icon:<Icon name="layers" size="sm"/>}))}/></div>
    <div className="map-floating-legend" role="group" aria-label={colorBy==='type'?'Filter entity types':'Color layer legend'}><span className="map-legend-heading">{mapLayers.find(l=>l.value===colorBy)?.label}</span>{colorBy==='type'?Object.entries(types).map(([key,name])=><Button key={key} variant="text" scale="sm" className={'map-legend-filter'+(enabled.includes(key)?'':' is-hidden')} aria-pressed={enabled.includes(key)} onClick={()=>setEnabled(old=>old.includes(key)?old.filter(t=>t!==key):[...old,key])}><i aria-hidden="true" style={{background:mapLayerColor(key,'type')}}/><span>{name}</span></Button>):layerGroups.map(([key,count])=><div className="map-layer-key" key={key}><i aria-hidden="true" style={{background:mapLayerColor(key,colorBy)}}/><span>{layerLabel(key)}</span><small>{count}</small></div>)}{colorBy==='project'&&<p className="map-layer-note">Sources inherit their citing projects. Shared items use the multiple-project color.</p>}{colorBy==='assessment'&&<p className="map-layer-note">Reviews apply to insights and recordings. Different project review states appear as mixed.</p>}</div>
    <div className="map-floating-controls" role="group" aria-label="Map navigation">
     <Button variant="subtle" scale="lg" aria-label="Zoom in" title="Zoom in" icon={<Icon name="plus"/>} onClick={()=>zoom(1.25)}/>
     <Button variant="subtle" scale="lg" aria-label="Zoom out" title="Zoom out" icon={<Icon name="minus"/>} onClick={()=>zoom(1/1.25)}/>
     <Button variant="subtle" scale="lg" aria-label="Fit map" title="Fit map (F)" icon={<Icon name="focus"/>} onClick={fit}/>
    </div>
   </>}

  </div></div>
 </section>;
}
