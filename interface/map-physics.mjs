import {forceSimulation,forceLink,forceManyBody,forceCollide,forceX,forceY} from 'd3-force';

export function layoutLinks(edges,ids) {
  const pairs=new Map();
  for(const edge of edges){
    if(edge.from===edge.to||!ids.has(edge.from)||!ids.has(edge.to))continue;
    const ends=[edge.from,edge.to].sort(),key=JSON.stringify(ends);
    if(!pairs.has(key))pairs.set(key,{source:ends[0],target:ends[1]});
  }
  return [...pairs.values()];
}

export function createGraphPhysics({positions={},topology='',reducedMotion=false,onTick=()=>{},onEnd=()=>{}}={}) {
  const cache=new Map(Object.entries(positions).filter(([,p])=>Number.isFinite(p.x)&&Number.isFinite(p.y)).map(([id,p])=>[id,{id,x:p.x,y:p.y,vx:0,vy:0}]));
  let signature='',visible=[],running=false,paused=false;
  const simulation=forceSimulation().stop().velocityDecay(.45).alphaDecay(.035)
    .force('charge',forceManyBody().strength(-360).distanceMax(900))
    .force('collision',forceCollide(n=>(n.type==='project'?20:n.type==='person'?16:n.type==='mapping'?9:7)+8).iterations(2))
    .force('x',forceX(600).strength(.008)).force('y',forceY(420).strength(.008))
    .on('tick',onTick).on('end',()=>{running=false;for(const n of visible){n.vx=0;n.vy=0;}onTick();onEnd();});
  const snapshot=()=>Object.fromEntries([...cache].map(([id,n])=>[id,{x:n.x,y:n.y}]));
  function run(){
    simulation.stop();running=false;
    if(reducedMotion){simulation.alphaTarget(0);simulation.tick(240);for(const n of visible){n.vx=0;n.vy=0;}onTick();onEnd();}
    else if(!paused&&visible.length){running=true;simulation.restart();}
  }
  return {
    point:id=>cache.get(id)||{x:600,y:420},snapshot,topology:()=>signature,
    update(nodes,edges){
      const ids=new Set(nodes.map(n=>n.id)),links=layoutLinks(edges,ids);
      const next=JSON.stringify(['high-repulsion-v2',nodes.map(n=>[n.id,n.type]).sort(),links.map(e=>[e.source,e.target]).sort()]);
      if(next===signature)return false;
      const restored=!signature&&next===topology&&nodes.length>0&&nodes.every(n=>cache.has(n.id));
      signature=next;simulation.stop();
      const projects=nodes.filter(n=>n.type==='project');
      for(const [i,n] of nodes.entries()){
        if(!cache.has(n.id)){
          const neighbor=links.find(e=>(e.source===n.id&&cache.has(e.target))||(e.target===n.id&&cache.has(e.source)));
          const anchor=neighbor?cache.get(neighbor.source===n.id?neighbor.target:neighbor.source):null;
          const projectIndex=projects.findIndex(p=>p.id===n.id),angle=i*2.399963;
          const a=projectIndex>=0?projectIndex/Math.max(1,projects.length)*Math.PI*2:angle;
          cache.set(n.id,{id:n.id,x:anchor?anchor.x+Math.cos(angle)*45:600+Math.cos(a)*(projectIndex>=0?220:80+Math.sqrt(i)*12),y:anchor?anchor.y+Math.sin(angle)*45:420+Math.sin(a)*(projectIndex>=0?180:80+Math.sqrt(i)*12),vx:0,vy:0});
        }
        cache.get(n.id).type=n.type;
      }
      visible=nodes.map(n=>cache.get(n.id));
      simulation.nodes(visible).force('link',forceLink(links).id(n=>n.id).distance(115).strength(.12)).alphaTarget(0).alpha(.65);
      onTick();if(restored){simulation.alpha(0);running=false;}else run();return true;
    },
    beginDrag(id){const n=cache.get(id);if(!n)return;n.fx=n.x;n.fy=n.y;if(!reducedMotion&&!paused){simulation.alpha(Math.max(simulation.alpha(),.18)).alphaTarget(.12).restart();running=true;}},
    dragTo(id,x,y){const n=cache.get(id);if(!n)return;n.x=n.fx=x;n.y=n.fy=y;n.vx=n.vy=0;onTick();},
    endDrag(id){const n=cache.get(id);if(n){n.fx=null;n.fy=null;}simulation.alphaTarget(0);if(reducedMotion){onTick();onEnd();}},
    setReducedMotion(value){if(value===reducedMotion)return;reducedMotion=value;if(value)run();},
    pause(){paused=true;running=false;simulation.stop();onEnd();},
    resume(){paused=false;if(!reducedMotion&&simulation.alpha()>simulation.alphaMin()&&visible.length){simulation.restart();running=true;}},
    stop(){running=false;simulation.stop();},
    isRunning:()=>running,
    // Deterministic advancement for behavior checks without a running timer.
    tick(iterations=1){simulation.tick(iterations);onTick();},
  };
}
