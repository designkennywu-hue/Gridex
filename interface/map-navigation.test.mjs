import test from 'node:test';
import assert from 'node:assert/strict';
import {zoomCamera,fitCamera} from './map-navigation.mjs';

test('Zoom keeps the world position under the pointer fixed, including at zoom limits',()=>{
  const camera={x:-220,y:85,k:1.7},anchor={x:230,y:640};
  for(const factor of [0.001,0.8,1.25,100]){
    const next=zoomCamera(camera,factor,anchor);
    assert.ok(Math.abs((anchor.x-next.x)/next.k-(anchor.x-camera.x)/camera.k)<1e-8);
    assert.ok(Math.abs((anchor.y-next.y)/next.k-(anchor.y-camera.y)/camera.k)<1e-8);
    assert.ok(next.k>=0.1&&next.k<=6);
  }
});

test('Fit includes widely dragged nodes and centers the visible bounds',()=>{
  const points=[{x:-4000,y:200},{x:6500,y:3100},{x:0,y:-2000}];
  const camera=fitCamera(points);
  for(const p of points){
    assert.ok(p.x*camera.k+camera.x>=60&&p.x*camera.k+camera.x<=1140);
    assert.ok(p.y*camera.k+camera.y>=60&&p.y*camera.k+camera.y<=780);
  }
  assert.ok(Math.abs(((-4000+6500)/2)*camera.k+camera.x-600)<1e-8);
});

test('Empty and single-node views fit without invalid camera values',()=>{
  assert.deepEqual(fitCamera([]),{x:0,y:0,k:1});
  const camera=fitCamera([{x:900,y:-700}]);
  assert.equal(900*camera.k+camera.x,600);
  assert.equal(-700*camera.k+camera.y,420);
});
