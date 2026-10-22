export function zoomCamera(camera, factor, anchor = {x:600,y:420}) {
  const k = Math.max(0.1, Math.min(6, camera.k * factor));
  const ratio = k / camera.k;
  return {x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio,k};
}

export function fitCamera(points, width=1200, height=840, padding=60) {
  if (!points.length) return {x:0,y:0,k:1};
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const left=Math.min(...xs)-padding,right=Math.max(...xs)+padding;
  const top=Math.min(...ys)-padding,bottom=Math.max(...ys)+padding;
  const k=Math.min(2,(width-2*padding)/(right-left),(height-2*padding)/(bottom-top));
  return {x:width/2-(left+right)/2*k,y:height/2-(top+bottom)/2*k,k};
}
