import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphPhysics,layoutLinks} from './map-physics.mjs';

const nodes=[{id:'a',type:'project'},{id:'b',type:'insight'},{id:'c',type:'insight'},{id:'isolated',type:'source'}];
const edges=[{from:'a',to:'b',relation:'source'},{from:'b',to:'c',relation:'reference'}];

test('Repeated and reversed citations create one layout spring without altering evidence',()=>{
 const input=[...edges,{from:'a',to:'b',relation:'reference'},{from:'b',to:'a',relation:'source'},{from:'a',to:'missing'}];
 const before=JSON.stringify(input);
 assert.equal(layoutLinks(input,new Set(nodes.map(n=>n.id))).length,2);
 assert.equal(JSON.stringify(input),before);
});

test('Dragging moves connected neighbors; releasing frees the node to settle',()=>{
 const physics=createGraphPhysics();
 try{
  const before=JSON.stringify({nodes,edges});physics.update(nodes,edges);physics.stop();physics.tick(220);
  const old={x:physics.point('a').x,y:physics.point('a').y},neighbor={x:physics.point('b').x,y:physics.point('b').y};
  physics.beginDrag('a');physics.stop();physics.dragTo('a',old.x+180,old.y+60);physics.tick(25);
  assert.equal(physics.point('a').x,old.x+180);
  assert.ok(Math.hypot(physics.point('b').x-neighbor.x,physics.point('b').y-neighbor.y)>3);
  physics.endDrag('a');assert.equal(physics.point('a').fx,null);physics.tick(260);
  assert.ok(Math.hypot(physics.point('a').x-old.x-180,physics.point('a').y-old.y-60)>1);
  assert.ok(nodes.every(n=>Number.isFinite(physics.point(n.id).x)&&Number.isFinite(physics.point(n.id).y)));
  assert.equal(JSON.stringify({nodes,edges}),before);
 }finally{physics.stop();}
});

test('Same topology does not restart physics, and saved positions restore exactly',()=>{
 const physics=createGraphPhysics();
 try{
  physics.update(nodes,edges);physics.stop();physics.tick(240);
  const saved=physics.snapshot();assert.equal(physics.update([...nodes],[...edges]),false);
  assert.deepEqual(physics.snapshot(),saved);
  const restored=createGraphPhysics({positions:saved,topology:physics.topology()});
  try{restored.update(nodes,edges);assert.equal(restored.isRunning(),false);assert.deepEqual(restored.snapshot(),saved);}finally{restored.stop();}
 }finally{physics.stop();}
});

test('Reduced motion settles without an animation timer and keeps dragging direct',()=>{
 const physics=createGraphPhysics({reducedMotion:true});
 try{
  physics.update(nodes,edges);assert.equal(physics.isRunning(),false);
  physics.beginDrag('a');physics.dragTo('a',350,450);physics.endDrag('a');
  assert.equal(physics.isRunning(),false);assert.deepEqual({x:physics.point('a').x,y:physics.point('a').y},{x:350,y:450});
 }finally{physics.stop();}
});

test('Pausing a hidden map stops ticks and preserves its layout',async()=>{
 let ticks=0;const physics=createGraphPhysics({onTick:()=>ticks++});
 try{
  physics.update(nodes,edges);physics.pause();const saved=physics.snapshot(),count=ticks;
  await new Promise(resolve=>setTimeout(resolve,65));
  assert.equal(ticks,count);assert.deepEqual(physics.snapshot(),saved);assert.equal(physics.isRunning(),false);
 }finally{physics.stop();}
});
