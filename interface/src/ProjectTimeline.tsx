import React, {useState} from 'react';
import {Checkbox} from '@gridware/ui/components/Checkbox/Checkbox';
import {Chip} from '@gridware/ui/components/Chip/Chip';
import {Icon} from '@gridware/ui/icons/Icon';

type BriefItem = {text:string;kind:string;sources:string[]};
type NextAction = {text:string;kind:string;owner:string|null;due:string|null;sources:string[]};
export type ProjectOverview = {emptySections?:'blank';milestones?:(ProjectOverview & {id:string;title:string})[];team?:{name:string;role:string;sources:string[]}[];nextActions?:NextAction[];assumptions?:BriefItem[];decisions?:BriefItem[];kpis?:BriefItem[];phase:string;asOf:string;note?:string;newerNotes:boolean;sources:string[];steps:{label:string;state:'recorded'|'current'|'planned';date:string|null;sources:string[]}[];nextAction:{text:string;kind:'recorded'|'suggested';owner:string|null;due:string|null;sources:string[]}|null};
const date=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
export function ProjectTeam({team=[],onOpen}:{team?:ProjectOverview['team'];onOpen:(id:string)=>void}) {
  return <section className="project-team" aria-label="Project team"><h3>Team</h3><div>{team.length?team.map((member,i)=><button type="button" className="team-member" key={member.name} title={member.role} disabled={!member.sources[0]} onClick={()=>onOpen(member.sources[0])}><Chip color={['blue','purple','cyan','green','orange'][i%5]}>{member.name}</Chip></button>):<span>Not confirmed</span>}</div></section>;
}
export function ProjectTimeline({overview,other,onOpen,milestoneId,onSelectMilestone}: {milestoneId?:string;overview?:ProjectOverview;other:boolean;onOpen:(id:string)=>void;onSelectMilestone:(id:string)=>void}) {
  const rootOverview=overview;
  const selectedMilestone=overview?.milestones?.find(m=>m.id===milestoneId);
  const milestoneOverview=!selectedMilestone&&!!rootOverview?.milestones?.length;
  overview=selectedMilestone||overview;
  const [checked,setChecked]=useState<Record<string,boolean>>(()=>{try{return JSON.parse(localStorage.getItem('gridex-action-checklist')||'{}');}catch{return {};}});
  const actionKey=(action:NextAction)=>JSON.stringify([action.sources.slice().sort(),action.text]);
  const toggleAction=(action:NextAction)=>{const key=actionKey(action);setChecked(previous=>{const next={...previous,[key]:!previous[key]};try{localStorage.setItem('gridex-action-checklist',JSON.stringify(next));}catch{}return next;});};
  const actions=milestoneOverview?[]:overview?.nextActions || (overview?.nextAction?[overview.nextAction]:[]);
  const actionHeading=selectedMilestone?`Issues (${actions.length})`:'Next actions';
  return <section className="project-overview" aria-label="Project progress">

    <div className="project-progress-top"><div className="project-progress-heading">
    <div className="project-overview-header"><h2>{selectedMilestone?.title.replace(/^\d+\s*·\s*/,'')||(milestoneOverview?`Milestones (${rootOverview!.milestones!.length})`:'Project progress')}</h2><Chip variant="secondary">{overview?.phase||(other?'Unassigned insights':'Phase not established')}</Chip></div>
    {overview?.newerNotes&&<p className="project-overview-update" role="status">Newer notes are available. This timeline and TL;DR need a fresh review.</p>}
    </div></div>

    <div className="project-overview-body" role="tabpanel" aria-label={selectedMilestone?.title||'Overview'}>
      {milestoneOverview?<div className="project-timeline-wrap"><ol className="project-timeline project-milestone-timeline" aria-label="Project milestone timeline">{rootOverview!.milestones!.map((milestone,i)=><li key={milestone.id} className="timeline-planned">
        <span className="timeline-node" aria-hidden="true"/>
        <span className="timeline-caption">Milestone {i+1}</span>
        <button onClick={()=>onSelectMilestone(milestone.id)}>{milestone.title.replace(/^\d+\s*·\s*/,'')}</button>
        <span className="timeline-milestone-phase">{milestone.phase}</span>
      </li>)}</ol></div>:<div className="project-timeline-wrap">{overview?.steps.length?<ol className="project-timeline" aria-label="Project phase timeline">{overview.steps.map((step,i)=><li key={i} className={'timeline-'+step.state} aria-current={step.state==='current'?'step':undefined}>
        <span className="timeline-node" aria-hidden="true"/>
        <span className="timeline-caption">{step.state==='planned'?'Planned':step.state==='current'?'Latest known':'Recorded'}</span>
        <button onClick={()=>onOpen(step.sources[0])}>{step.label}</button>
        <time>{step.date?date(step.date):'Date not set'}</time>
      </li>)}</ol>:<p className="project-timeline-empty">{other?'These insights span several areas and do not share a project timeline.':'The notes do not establish a reliable project phase yet.'}</p>}</div>}
      {actions.length>0&&<section className="timeline-action-section" aria-label={actionHeading}><h3>{actionHeading}</h3><ul className="timeline-action-list">{actions.map((action,i)=><li key={actionKey(action)} className={checked[actionKey(action)]?'action-checked':''}><Checkbox className="action-check-row" scale="sm" checked={!!checked[actionKey(action)]} onChange={()=>toggleAction(action)} label={action.text}/>{action.kind==='suggested'&&<span> · Proposed follow-up</span>}{action.owner&&<span> · {action.owner}</span>} <button onClick={()=>onOpen(action.sources[0])}>Source</button></li>)}</ul></section>}
      <div className="project-next-action"><div className="project-next-heading"><Icon name="arrow-right" size="sm"/><h3>TL;DR</h3></div>
        {overview?.note&&<p>{overview.note}</p>}

      </div>
      <div className="project-brief-sections">{([
        ['Key assumptions',overview?.assumptions,'No assumptions documented in this project brief.'],
        ['Key decisions',overview?.decisions,'No confirmed decisions documented in this project brief.'],
        ['KPIs',overview?.kpis,'No KPI definitions, baselines or targets documented in this project brief.'],
      ] as [string,BriefItem[]|undefined,string][]).map(([heading,items,empty])=><section key={heading}><h3>{heading}</h3>{items?.length?<ul>{items.map((item,i)=><li key={i}>{item.kind!=='recorded'&&<Chip variant="secondary" className="brief-qualifier">{item.kind==='proposed'?'Proposed':'To validate'}</Chip>}<p>{item.text}</p><button onClick={()=>onOpen(item.sources[0])}>View source</button></li>)}</ul>:overview?.emptySections==='blank'?null:<p>{empty}</p>}</section>)}</div>
    </div>
  </section>;
}
