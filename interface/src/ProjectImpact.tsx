import React from 'react';
import {Chip} from '@gridware/ui/components/Chip/Chip';
import {Icon} from '@gridware/ui/icons/Icon';
import {Tooltip} from '@gridware/ui/components/Tooltip/Tooltip';

export type ImpactReview={project:string;state:string;proposal?:string;summary?:string;reviewedAt?:string;rationale?:string;appliedAt?:string;approvalReference?:string};
export const assessmentStates:Record<string,{label:string;description:string}>={
  'not-assessed':{label:'No review recorded',description:'No project-impact review or verified project reference is recorded. This does not establish whether the evidence was considered previously.'},
  referenced:{label:'Referenced in project',description:'This insight is cited in the current project content. Verified from existing source links; historical approval and a before/after change are not established.'},
  proposed:{label:'Update proposed',description:'A specific project update is ready for your review. The project has not been changed by this proposal.'},
  applied:{label:'Project updated',description:'An approved update was recorded against this insight and the current project revision.'},
  'no-change':{label:'Reviewed · no change',description:'This insight was assessed against the project; the recorded conclusion required no update.'},
  'needs-recheck':{label:'Needs recheck',description:'The evidence, project or proposal differs from the recorded review, or the review record is incomplete.'},
  unavailable:{label:'Review unavailable',description:'The project-review records could not be read.'},
};
export function visibleAssessments(reviews:ImpactReview[]=[],project?:string){
  const visible=project&&project!=='__other'?reviews.filter(r=>r.project===project):reviews;
  return visible.length?visible:[{project:project||'',state:'not-assessed'}];
}
export function AssessmentSymbol({state,dotOnly=false}:{state:string;dotOnly?:boolean}){
  const resolved=assessmentStates[state]?state:'unavailable';
  const names:Record<string,string>={referenced:'arrow-up-right',proposed:'plus',applied:'check','no-change':'info-dot',unavailable:'question-mark'};
  return <span className={'assessment-symbol assessment-'+resolved} aria-hidden="true">{dotOnly||['not-assessed','needs-recheck'].includes(resolved)?<span className="assessment-dot"/>:<Icon name={names[resolved] as any} size="lg"/>}</span>;
}
export function AssessmentIndicators({reviews=[],project,projectName}:{reviews?:ImpactReview[];project?:string;projectName:(id:string)=>string}){
  return <span className="card-assessments">{visibleAssessments(reviews,project).map(review=>{
    const state=assessmentStates[review.state]||assessmentStates.unavailable;
    const label=(review.project?projectName(review.project)+' · ':'')+state.label;
    return <Tooltip key={review.project} content={label} openDelay={250}><span className="assessment-trigger" tabIndex={0} role="img" aria-label={label}><AssessmentSymbol state={review.state}/></span></Tooltip>;
  })}</span>;
}
export function ProjectImpact({reviews=[],project,projectName,onOpen}:{reviews?:ImpactReview[];project?:string;projectName:(id:string)=>string;onOpen:(path:string)=>void}){
  const visible=visibleAssessments(reviews,project);
  return <div className="project-impact" aria-label="Project impact">{visible.map(review=>{
    const state=assessmentStates[review.state]||assessmentStates.unavailable;
    const content=<>{visible.length>1&&<span>{projectName(review.project)} · </span>}{state.label}</>;
    const title=(review.project?projectName(review.project)+': ':'')+state.description+(review.summary?' '+review.summary:'');
    const color=review.state==='proposed'?'info':review.state==='applied'?'success':['needs-recheck','unavailable'].includes(review.state)?'warning':undefined;
    const chip=<Chip variant="secondary" color={color}>{content}</Chip>;
    return review.proposal?<button key={review.project} className={'impact-tag assessment-'+review.state} title={title} onClick={()=>onOpen(review.proposal!)}>{chip}</button>:<span key={review.project} className={'impact-tag assessment-'+review.state} title={title}>{chip}</span>;
  })}</div>;
}
