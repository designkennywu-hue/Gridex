import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeLabels} from './map-labels.mjs';
const box=(id,x,y,priority=0,required=false)=>({id,left:x,right:x+100,top:y,bottom:y+16,priority,required});
test('active label wins over projects and neighbors in crowded space',()=>{
 assert.deepEqual(prioritizeLabels([box('neighbor',0,0),box('project',1,0,100),box('active',2,0,1000,true)]).map(x=>x.id),['active']);
});
test('zooming separates labels and reveals more without a count cap',()=>{
 const labels=[box('a',0,0),box('b',10,5),box('c',20,10)];
 assert.equal(prioritizeLabels(labels).length,1);
 assert.equal(prioritizeLabels(labels.map(b=>({...b,left:b.left*12,right:b.left*12+100,top:b.top*12,bottom:b.top*12+16}))).length,3);
});
test('strict spacing rejects even small text overlaps and nearby rows',()=>{
 assert.equal(prioritizeLabels([box('a',0,0),box('b',90,0)]).length,1);
 assert.equal(prioritizeLabels([box('a',0,0),box('b',0,30)]).length,1);
 assert.equal(prioritizeLabels([box('a',0,0),box('b',0,60)]).length,2);
});
test('ordering is stable regardless of candidate input order',()=>{
 const labels=[box('b',0,0),box('a',0,0)];
 assert.deepEqual(prioritizeLabels(labels),prioritizeLabels([...labels].reverse()));
});
