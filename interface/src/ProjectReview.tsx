import React,{useState} from 'react';
import {Button} from '@gridware/ui/components/Button/Button';
import {assessmentStates,AssessmentSymbol,type ImpactReview} from './ProjectImpact';

export type ReviewContext={project:string;references:{path:string;label:string;text:string}[];stale?:boolean;checkedAt?:string;source?:string;locator?:string;current?:string;target?:string;before?:string;after?:string;decision?:string;gap?:string;sources?:{label:string;url:string}[]};
const when=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});

export function ProjectReview({noteId,title,contexts=[],reviews=[],projectName,onOpen}:{noteId:string;title:string;contexts?:ReviewContext[];reviews?:ImpactReview[];projectName:(id:string)=>string;onOpen:(path:string)=>void}){
  const [message,setMessage]=useState('');
  const pairs:ReviewContext[]=contexts.length?contexts:[{project:'',references:[]}];
  return <section className="inline-project-review" aria-label="Project review">
    <h2>Project review</h2>
    {pairs.map(context=>{
      const review=reviews.find(r=>r.project===context.project);
      const state=assessmentStates[review?.state||'not-assessed']||assessmentStates.unavailable;
      const refs=context.references||[];
      return <div key={context.project} className="inline-review-project">
        <div className="inline-review-heading"><h3>{context.project?projectName(context.project):'No project assigned'}</h3><span className="inline-review-state"><AssessmentSymbol state={review?.state||'not-assessed'}/>{state.label}</span></div>
        {!context.project?<p>Choose a project above to review how this insight affects it.</p>:<>
          <div className="inline-review-block"><h4>Current project references</h4>{refs.length?<><p>{refs.length} verified source location{refs.length===1?'':'s'} in the current local project.</p><ReferenceList references={refs}/></>:<p>No direct citation of this card is recorded in the local project. This does not establish whether its evidence was used elsewhere.</p>}</div>
          {context.stale?<p className="inline-review-warning">The source or local project changed since these review notes were prepared. Recheck the comparison before using its recommendations.</p>:context.checkedAt?<>
            <div className="inline-review-block"><h4>Evidence and meaning</h4><p>{context.source}</p>{context.locator&&<p className="inline-review-caption">{context.locator}</p>}</div>
            <div className="inline-review-block"><h4>Already documented</h4><p>{context.current}</p><p className="inline-review-caption">Comparison recorded {when(context.checkedAt)} · dated capture, not a live sync.</p><div className="inline-review-links">{context.sources?.map(s=><a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a>)}</div></div>
            <div className="inline-review-block"><h4>Suggested alignment · draft</h4><p>{context.decision}</p>{context.target&&<p className="inline-review-caption">Affects: {context.target}</p>}<div className="inline-review-change"><span>Current</span><p>{context.before}</p></div><div className="inline-review-change proposed"><span>Proposed</span><p>{context.after}</p></div><p className="inline-review-caption">This recommendation has not been approved or applied.</p></div>
            {context.gap&&<div className="inline-review-block"><h4>Needs confirmation</h4><p>{context.gap}</p></div>}
          </>:<div className="inline-review-block"><h4>Suggested changes</h4><p>{review?.proposal?'A versioned proposal is available for review.':review?.state==='no-change'&&review.rationale?review.rationale:'No source-specific proposal is documented yet.'}</p></div>}
          {review?.proposal&&<Button variant="outlined" scale="sm" onClick={()=>onOpen(review.proposal!)}>Open recorded proposal</Button>}
          <details className="inline-review-history"><summary>Review history</summary>{review?.reviewedAt?<><p>{when(review.reviewedAt)} · {review.state==='referenced'?'Historical reference audit':state.label}</p>{review.summary&&<p>{review.summary}</p>}{review.rationale&&<p>{review.rationale}</p>}{review.state==='applied'&&review.appliedAt&&<p>Applied {when(review.appliedAt)} · Approval: {review.approvalReference}</p>}</>:<p>No completed assessment, approval or application history is recorded for this source and project.</p>}{context.checkedAt&&<p>{when(context.checkedAt)} · Draft alignment notes prepared. These do not establish approval or an applied change.</p>}</details>
          <div className="inline-review-actions"><Button variant="outlined" scale="sm" onClick={async()=>{try{await navigator.clipboard.writeText(`Review “${title}” (${noteId}) against project:${context.project}. Confirm the exact evidence and current project/tracker content. Compare existing decisions, milestones and issues before proposing new work. Show specific before/after changes, source locators and unresolved questions. Request my approval before applying project changes; do not invent owners, dates, acceptance or historical approvals.`);setMessage('Review request copied. Paste it into this project chat.');}catch{setMessage('Copy unavailable. Ask this project chat to review '+noteId);}}}>Copy review request</Button></div>
        </>}
      </div>;
    })}
    {message&&<p className="inline-review-caption" role="status">{message}</p>}
  </section>;
}

function ReferenceList({references}:{references:ReviewContext['references']}){
  const items=(values:ReviewContext['references'])=><ul>{values.map(ref=><li key={ref.path}><strong>{ref.label}</strong>{ref.text&&<p>{ref.text}</p>}</li>)}</ul>;
  return <>{items(references.slice(0,3))}{references.length>3&&<details><summary>{references.length-3} more reference locations</summary>{items(references.slice(3))}</details>}</>;
}
