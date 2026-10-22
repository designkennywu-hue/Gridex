export const mapLayers=[{value:'type',label:'Entity types'},{value:'project',label:'Projects'},{value:'provider',label:'Sources'},{value:'assessment',label:'Assessment'}];
export const typeColors={project:'#9c8cff',insight:'#51c4d5',recording:'#edb25d',source:'#e0809f',mapping:'#85bb72',external:'#7ca8f6',topic:'#cc94dc',person:'#d1ce6d'};
export const assessmentColors={'not-assessed':'#8a929d',referenced:'#51c4d5',proposed:'#7ca8f6',applied:'#85bb72','no-change':'#b7c0ca','needs-recheck':'#edb25d',unavailable:'#ef8585',mixed:'#cc94dc','not-applicable':'#59616e'};
export function mapLayerKey(node,layer,project='all'){
 if(layer==='type')return node.type;
 if(layer==='provider')return node.provider||'local';
 if(layer==='project'){
  const projects=node.projects||[];
  if(project!=='all'&&projects.includes(project))return project;
  return projects.length>1?'multiple-projects':projects[0]||'unassigned';
 }
 if(!['insight','recording'].includes(node.type))return 'not-applicable';
 const reviews=(node.assessments||[]).filter(r=>project==='all'||r.project===project);
 const states=[...new Set(reviews.map(r=>Object.hasOwn(assessmentColors,r.state)?r.state:'unavailable'))];
 return states.length>1?'mixed':states[0]||'not-assessed';
}
export function mapLayerColor(key,layer){
 if(layer==='type')return typeColors[key]||'#8a929d';
 if(layer==='assessment')return assessmentColors[key]||assessmentColors.unavailable;
 if(key==='unassigned')return '#8a929d';
 if(key==='multiple-projects')return '#e0809f';
 let hash=5381;for(const char of key)hash=(Math.imul(hash,33)^char.charCodeAt(0))>>>0;
 return `hsl(${hash%360} 58% 66%)`;
}
