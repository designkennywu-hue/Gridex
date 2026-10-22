import {KnowledgeMap} from './KnowledgeMap';
import {ProjectReview,type ReviewContext} from './ProjectReview';
import {RecordingTranscript} from './RecordingTranscript';
import {ProjectImpact,AssessmentIndicators,AssessmentSymbol,assessmentStates,visibleAssessments,type ImpactReview} from './ProjectImpact';
import {isAgentWork,isSlides,isGitHub} from '../library-sources.mjs';
import {Tabs} from '@gridware/ui/components/Tabs/Tabs';
import React, { useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GridwareAppProvider } from '@gridware/ui/providers/GridwareAppProvider';
import { Button } from '@gridware/ui/components/Button/Button';
import { Input } from '@gridware/ui/components/Input/Input';
import { Chip } from '@gridware/ui/components/Chip/Chip';
import { Select } from '@gridware/ui/components/Select/Select';
import { Empty } from '@gridware/ui/components/Empty/Empty';
import { Tooltip } from '@gridware/ui/components/Tooltip/Tooltip';
import { Icon } from '@gridware/ui/icons/Icon';
import { Kbd } from '@gridware/ui/components/Kbd/Kbd';
import { Dialog } from '@gridware/ui/components/Dialog/Dialog';
import '@gridware/ui/styles/tokens.css';
import '@gridware/ui/styles/theme.css';
import '@gridware/ui/styles/typography.css';
import '@gridware/ui/styles/fonts.css';
import './app.css';
import {RecorderWidget, captureRequest, RecordingProcessing, isProcessing, type RecordingJob} from './RecorderWidget';
import { Menu } from '@gridware/ui/components/Menu/Menu';
import { MenuItem } from '@gridware/ui/components/Menu/MenuItem';
import { moveProject } from '../project-order.mjs';
import {ProjectTimeline, ProjectTeam, type ProjectOverview} from './ProjectTimeline';

type Note = { id: string; title: string; body: string; summary: string; category: string; kind: string; labels: string[]; sourceLabels?:string[]; projectAssigned?:boolean; updated: string; review: string; status: string; sourceLinks: string[]; projectReviews?:ImpactReview[]; projectContexts?:ReviewContext[]; evidenceRevision?:string; audio?: string; duration?: number };
const projectNames: Record<string, string> = { 'design-system': 'Design system', 'field-app': 'Field App', 'pole-planning': 'Pole planning', 'device-lifecycle': 'Device lifecycle', 'alert-lookalike-labeling': 'Lookalike labeling', 'device-health': 'Device health', 'config-management': 'Config management', 'oda-fw33': 'ODAs & firmware', 'auto-reporting': 'Auto-reporting', 'events-v4': 'Events V4', '__other': 'Other' };
const projectIcon = 'project-folder';
const clean = (text: string) => text.replace(/[*`]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
const pretty = (text: string) => text==='github-insight'?'GitHub insight':projectNames[text] || text.replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());
const date = (value: string) => { const d = new Date(value.length === 10 ? value + 'T12:00:00' : value); return Number.isNaN(d.valueOf()) ? 'Undated' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
function SlackMark({size = 'sm'}: {size?: 'sm' | 'md' | 'lg'}) {
  const px = {sm:16, md:20, lg:24}[size];
  // Local vector mark: no remote image requests are needed to identify Slack sources.
  return <svg className="slack-mark" width={px} height={px} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    {[['#36C5F0',0],['#2EB67D',90],['#ECB22E',180],['#E01E5A',270]].map(([color, rotation]) => <g key={color} fill={String(color)} transform={`rotate(${rotation} 12 12)`}><rect x="2" y="8" width="8" height="3" rx="1.5"/><path d="M8.5 5H10V3.5A1.5 1.5 0 1 0 8.5 5Z"/></g>)}
  </svg>;
}
function ConfluenceMark({size = 'sm'}: {size?: 'sm' | 'md' | 'lg'}) {
  // Font Awesome Free 6.7.2, CC BY 4.0; original attribution in assets/confluence.svg.
  const px = {sm:16, md:20, lg:24}[size];
  return <svg className="confluence-mark" width={px} height={px} viewBox="0 0 512 512" fill="#579DFF" aria-hidden="true" focusable="false"><path d="M2.3 412.2c-4.5 7.6-2.1 17.5 5.5 22.2l105.9 65.2c7.7 4.7 17.7 2.4 22.4-5.3 0-.1.1-.2.1-.2 67.1-112.2 80.5-95.9 280.9-.7 8.1 3.9 17.8.4 21.7-7.7.1-.1.1-.3.2-.4l50.4-114.1c3.6-8.1-.1-17.6-8.1-21.3-22.2-10.4-66.2-31.2-105.9-50.3C127.5 179 44.6 345.3 2.3 412.2zm507.4-312.1c4.5-7.6 2.1-17.5-5.5-22.2L398.4 12.8c-7.5-5-17.6-3.1-22.6 4.4-.2.3-.4.6-.6 1-67.3 112.6-81.1 95.6-280.6.9-8.1-3.9-17.8-.4-21.7 7.7-.1.1-.1.3-.2.4L22.2 141.3c-3.6 8.1.1 17.6 8.1 21.3 22.2 10.4 66.3 31.2 106 50.4 248 120 330.8-45.4 373.4-112.9z"/></svg>;
}
function BookmarkMark({size = 'sm'}: {size?: 'sm' | 'md' | 'lg'}) {
  const px = {sm:16, md:20, lg:24}[size];
  return <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 2.5h8v11l-4-3-4 3z"/></svg>;
}
function ProjectPicker({note, projects, projectName, archived, currentProject, disabled, onChange}: {note:Note; projects:string[]; projectName:(id:string)=>string; archived:string[]; currentProject?:string; disabled:boolean; onChange:(values:string[])=>void}) {
  const trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [keyboard,setKeyboard]=useState(false);
  const values=note.labels.filter(label=>label.startsWith('project:')).map(label=>label.slice(8));
  const lead=currentProject&&values.includes(currentProject)?currentProject:values[0];
  const label=lead?projectName(lead)+(values.length>1?' +'+(values.length-1):''):'Other';
  return <><button ref={trigger} type="button" className="project-picker" aria-label={'Projects for '+note.title+': '+(values.map(projectName).join(', ')||'Other')} aria-haspopup="menu" aria-expanded={open} onClick={()=>{setKeyboard(false);setOpen(!open);}} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setKeyboard(true);setOpen(true);}}}><span>{label}</span>{icon('chevron-down')}</button><Menu open={open} anchorEl={trigger.current} onClose={()=>{setOpen(false);trigger.current?.focus({preventScroll:true});}} aria-label={'Select projects for '+note.title} matchAnchorWidth={false} highlightFirstOnOpen={keyboard}><MenuItem role="menuitemcheckbox" showCheck checked={!values.length} disabled={disabled} onSelect={()=>onChange([])}>Other</MenuItem>{projects.map(id=><MenuItem key={id} role="menuitemcheckbox" showCheck checked={values.includes(id)} disabled={disabled} onSelect={()=>onChange(values.includes(id)?values.filter(value=>value!==id):[...values,id])}>{projectName(id)}{archived.includes(id)?' (archived)':''}</MenuItem>)}</Menu></>;
}
function ProjectFolderMark({size = 'sm'}: {size?: 'sm' | 'md' | 'lg'}) {
  const px = {sm:16, md:20, lg:24}[size];
  return <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M2 5V3.5c0-.55.45-1 1-1h3l1.5 2H13c.55 0 1 .45 1 1v7c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1V5Z"/><path d="M2 5.5h12"/></svg>;
}
function BookMark({size = 'sm'}: {size?: 'sm' | 'md' | 'lg'}) {
  const px = {sm:16, md:20, lg:24}[size];
  return <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M8 3.5C6.4 2.3 4.2 2 1.5 2.5v10C4.2 12 6.4 12.3 8 13.5c1.6-1.2 3.8-1.5 6.5-1v-10C11.8 2 9.6 2.3 8 3.5Z"/><path d="M8 3.5v10"/></svg>;
}
function RecordingMark({size='sm'}:{size?:'sm'|'md'|'lg'}) {
  const px={sm:16,md:20,lg:24}[size];
  return <svg className="recording-mark" width={px} height={px} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeWidth="3" aria-hidden="true" focusable="false"><path stroke="#FF8A80" d="M3 10v4M7.5 6v12"/><path stroke="#FF5C7A" d="M12 3v18M16.5 7v10"/><path stroke="#D96CEF" d="M21 10v4"/></svg>;
}
function LinearMark({size='sm'}:{size?:'sm'|'md'|'lg'}) {
  const id=React.useId(); const px={sm:16,md:20,lg:24}[size];
  return <svg className="linear-mark" width={px} height={px} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><clipPath id={id}><circle cx="12" cy="12" r="10"/></clipPath></defs><g clipPath={'url(#'+id+')'} fill="currentColor"><path d="M0 0h24v24L0 0Z"/><path d="m-3 3 24 24 1.4-1.4-24-24Zm-3 3 24 24 1.4-1.4-24-24Zm-3 3 24 24 1.4-1.4-24-24Zm-3 3 24 24 1.4-1.4-24-24Z"/></g></svg>;
}
function ArchivedProjectMark() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="2.5" width="12" height="3" rx=".75"/><path d="M3 5.5v7.25c0 .4.35.75.75.75h8.5c.4 0 .75-.35.75-.75V5.5M6.5 8h3"/></svg>;
}
function GitHubMark({size='sm'}:{size?:'sm'|'md'|'lg'}) {
  const px={sm:16,md:20,lg:24}[size];
  return <svg width={px} height={px} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.09c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.72.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.01-.12-.28-.5-1.43.11-2.97 0 0 .95-.3 3.08 1.15a10.73 10.73 0 0 1 5.61 0c2.14-1.45 3.08-1.15 3.08-1.15.62 1.54.23 2.69.12 2.97.72.78 1.15 1.78 1.15 3.01 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"/></svg>;
}
function SlidesMark({size='sm'}:{size?:'sm'|'md'|'lg'}) {
  const px={sm:16,md:20,lg:24}[size];
  return <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="13" rx="1.5"/><path d="M12 16v4m-4 2 4-3 4 3M7 7h10M7 11h6"/></svg>;
}
const icon = (name: string, size: 'sm' | 'md' | 'lg' = 'sm') => name === 'slides' ? <SlidesMark size={size}/> : name === 'github' ? <GitHubMark size={size}/> : name === 'recording' ? <RecordingMark size={size} /> : name === 'linear' ? <LinearMark size={size} /> : name === 'book' ? <BookMark size={size} /> : name === 'project-folder' ? <ProjectFolderMark size={size} /> : name === 'slack' ? <SlackMark size={size} /> : name === 'confluence' ? <ConfluenceMark size={size} /> : name === 'bookmark' ? <BookmarkMark size={size} /> : <Icon name={name as any} size={size} />;
function sourceBrand(note: Note): 'slack' | 'confluence' | 'linear' | 'agent-work' | 'slides' | 'github' | undefined {
  if (isGitHub(note)) return 'github';
  if (isSlides(note)) return 'slides';
  if (isAgentWork(note)) return 'agent-work';
  if (note.id.startsWith('documents/linear/')) return 'linear';
  if (['slack-insight','slack-digest'].includes(note.kind) || /^sources\/[^/]+-slack-digest\//.test(note.id)) return 'slack';
  for (const link of note.sourceLinks) {
    try { const url = new URL(link); if (url.hostname==='linear.app') return 'linear'; if (url.hostname.endsWith('.slack.com') && url.pathname.startsWith('/archives/')) return 'slack'; if (url.hostname.endsWith('.atlassian.net') && url.pathname.startsWith('/wiki/')) return 'confluence'; } catch { /* Relative preserved-source links do not establish a provider. */ }
  }
}
const itemIcon = (note: Note) => {
  const brand = sourceBrand(note);
  if (brand) return icon(brand==='agent-work'?'code':brand==='slides'?'slides':brand);
  if (note.category === 'sources') return icon('database');
  const kinds: Record<string,string> = {recording:'recording', meeting:'users', research:'investigation', prd:'target', spec:'code', plan:'calendar', decision:'check-circle', reference:'reports', topic:'map', index:'rows', note:'pen'};
  return icon(kinds[note.kind] || 'file-text');
};
function readLocal<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
const slug = (text: string) => text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
function resolveLocal(href: string, base: string) {
  const [file, fragment] = href.split('#');
  const pieces = (base.slice(0, base.lastIndexOf('/') + 1) + decodeURIComponent(file)).split('/');
  const out: string[] = [];
  for (const part of pieces) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
  return { file: out.join('/'), fragment };
}

function ReadableNote({children,components,recording=false,transcriptView,reviewContent}: {children:string;components:any;recording?:boolean;transcriptView?:React.ReactNode;reviewContent?:React.ReactNode}) {
  if(recording) {
    const transcript=children.match(/(?:^|\n)## Transcript\s*\n/);
    const summary=(transcript?children.slice(0,transcript.index):children).trim();
    const summaryBody=summary.replace(/^## Summary\s*\n/i,'');
    return <>{summaryBody&&<><h2>Summary</h2><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>{summaryBody}</ReactMarkdown></>}{reviewContent}{transcript&&<><hr className="transcript-divider"/><h2>Transcript</h2><>{transcriptView||<ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>{children.slice(transcript.index!+transcript[0].length)}</ReactMarkdown>}</></>}</>;
  }
  const split=children.match(/\n## Sources and capture notes\s*\n/);
  const main=split?children.slice(0,split.index):children;
  // Keep material uncertainty in the note; collapse only provenance and capture bookkeeping.
  const tail=split?children.slice(split.index!+split[0].length):'';
  const transcript=tail.match(/\n## Transcript\s*\n/);
  const provenance=transcript?tail.slice(0,transcript.index):tail;
  const transcriptBody=transcript?tail.slice(transcript.index!+transcript[0].length):'';
  const summaryStart=main.match(/(?:^|\n)## Summary\s*\n/i);
  const summaryEnd=summaryStart?main.slice(summaryStart.index!+summaryStart[0].length).search(/\n## /):-1;
  const boundary=summaryStart?(summaryEnd<0?main.length:summaryStart.index!+summaryStart[0].length+summaryEnd):main.indexOf('\n\n');
  const cut=boundary<0?main.length:boundary;
  return <><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>{main.slice(0,cut)}</ReactMarkdown>{reviewContent}<ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>{main.slice(cut)}</ReactMarkdown>{split && <details className="note-provenance"><summary>Sources and capture notes</summary><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>{provenance}</ReactMarkdown></details>}{transcript && <><h2>Transcript</h2><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>{transcriptBody}</ReactMarkdown></>}</>;
}

function App() {
  const workspaceRef=useRef<HTMLElement|null>(null);
  useLayoutEffect(()=>{
    const workspace=workspaceRef.current;
    if(!workspace)return;
    let previousWidth=-1;
    const measure=()=>{
      // Measure the full workspace, never the shrinking detail-list column.
      const width=workspace.getBoundingClientRect().width;
      if(width===previousWidth)return;
      previousWidth=width;
      const available=Math.max(0,width-48-6);
      const columns=Math.max(1,Math.floor((available+12)/312));
      const cardWidth=Math.min(360,(available-(columns-1)*12)/columns);
      workspace.style.setProperty('--stable-card-width',cardWidth+'px');
      workspace.style.setProperty('--gallery-columns',String(columns));
    };
    measure();
    const observer=new ResizeObserver(measure);observer.observe(workspace);
    return()=>observer.disconnect();
  },[]);
  const [milestoneByProject,setMilestoneByProject]=useState<Record<string,string>>(()=>{
    const stored=readLocal<unknown>('gridex-project-tabs',{});
    return stored&&typeof stored==='object'&&!Array.isArray(stored)
      ? Object.fromEntries(Object.entries(stored).filter(([,value])=>typeof value==='string')) : {};
  });
  useEffect(()=>{try{localStorage.setItem('gridex-project-tabs',JSON.stringify(milestoneByProject));}catch{}},[milestoneByProject]);
  const [showCounts,setShowCounts]=useState(false);
  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{if(event.key==='Shift')setShowCounts(true);};
    const up=(event:KeyboardEvent)=>{if(event.key==='Shift')setShowCounts(false);};
    const reset=()=>setShowCounts(false);
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',reset);document.addEventListener('visibilitychange',reset);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',reset);};
  },[]);
  const [projectOverviews,setProjectOverviews]=useState<Record<string,ProjectOverview>>({});
  const [recordJobs, setRecordJobs] = useState<RecordingJob[]>([]);
  const [processingAction, setProcessingAction] = useState(false);
  const [projectSettings, setProjectSettings] = useState<{order: string[]; archived: string[]; names?:Record<string,string>}>({order: [], archived: []});
  const projectName=(id:string)=>Object.prototype.hasOwnProperty.call(projectSettings.names||{},id)?projectSettings.names![id]:pretty(id);
  const [renameProjectId,setRenameProjectId]=useState<string|null>(null);
  const [projectNameDraft,setProjectNameDraft]=useState('');
  const [projectRenameError,setProjectRenameError]=useState('');
  const [projectFilter, setProjectFilter] = useState('active');
  const [draggedProject, setDraggedProject] = useState('');
  const [assigningNote,setAssigningNote]=useState('');
  const [projectBusy, setProjectBusy] = useState(false);
  const [dropTarget, setDropTarget] = useState<{id: string; edge: 'before' | 'after'; top: number} | null>(null);
  const [projectMenu, setProjectMenu] = useState<{id: string; x: number; y: number; trigger: HTMLElement; keyboard: boolean} | null>(null);
  const projectRects = useRef(new Map<string, number>());
  const projectMutation = useRef(false);
  const dragPreview = useRef<HTMLElement | null>(null);
  const dragging = useRef('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [initialNavigation]=useState(()=>{
    const stored=readLocal<any>('gridex-navigation',{});
    return {view:['notes','inbox','slack','confluence','linear','agent-work','slides','github','saved','sources','map'].includes(stored?.view)?stored.view:'notes',project:typeof stored?.project==='string'?stored.project:''};
  });
  const [view, setView] = useState(initialNavigation.view);
  const [project, setProject] = useState(initialNavigation.project);
  const [indexMapProject,setIndexMapProject]=useState('');
  useEffect(()=>{try{localStorage.setItem('gridex-navigation',JSON.stringify({view,project}));}catch{}},[view,project]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [assessment,setAssessment]=useState('all');
  const [sort, setSort] = useState('newest');
  const navigationVersion = useRef(0);
  const cardTrigger = useRef<HTMLButtonElement|null>(null);
  const cardToReveal = useRef<string|null>(null);
  const [selected, setSelected] = useState<Note | null>(null);
  const [reading, setReading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readLocal('brain-theme', 'light'));
  const [saved, setSaved] = useState<string[]>(() => readLocal('brain-saved', []));
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [warnings, setWarnings] = useState(0);
  const [updated, setUpdated] = useState('');
  const [recordingDialog, setRecordingDialog] = useState<'rename' | 'delete' | null>(null);
  const [recordingTarget, setRecordingTarget] = useState<Note | null>(null);
  const [recordingName, setRecordingName] = useState('');
  const [savingRecording, setSavingRecording] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const [undoRecording, setUndoRecording] = useState<string | null>(null);

  async function refresh(quiet = false) {
    if (!quiet) setRefreshing(true);
    try {
      const [response, preferences] = await Promise.all([fetch('/api/library'), fetch('/api/projects')]);
      if (!preferences.ok) throw new Error('Could not load project settings.');
      const prefs = await preferences.json();
      if (!projectMutation.current && !dragging.current) setProjectSettings(prefs);
      if (!response.ok) throw new Error('Could not read your knowledge base. Try refreshing.');
      const data = await response.json();
      setNotes(data.notes); setProjectOverviews(data.projectOverviews||{}); setWarnings(data.warnings.length); setUpdated(data.refreshedAt); setError('');
      setSelected(current => current ? data.notes.find((n: Note) => n.id === current.id) || current : current);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
  }
  const previousJobStates = useRef('');
  useEffect(() => {
    const signature = JSON.stringify(recordJobs.map(j=>[j.id,j.transcript.state,j.summary.state]));
    if (signature !== previousJobStates.current) { previousJobStates.current=signature; if (recordJobs.length) refresh(true); }
  }, [recordJobs]);
  function openNote(note: Note, history = true) {
    navigationVersion.current++;
    setSelected(note); setReading(true); setMessage(''); setUndoRecording(null);
    if (history) window.history.pushState({}, '', '#note=' + encodeURIComponent(note.id));
    document.querySelector('.reader-scroll')?.scrollTo(0, 0);
  }
  async function navigate(file: string, fragment?: string, history = true) {
    const version = ++navigationVersion.current;
    try {
      const response = await fetch('/api/note?path=' + encodeURIComponent(file));
      const data = await response.json();
      if (version !== navigationVersion.current) return;
      if (!response.ok) throw new Error(data.error || 'Could not open this file');
      if (data.audio) { setView('inbox'); setProject(''); setKind('all'); }
      openNote(data, history);
      if (fragment) setTimeout(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }), 80);
    } catch (e) { setMessage((e as Error).message); }
  }
  useEffect(() => {
    refresh();
    const id = new URLSearchParams(location.hash.slice(1)).get('note');
    if (id) navigate(id, undefined, false);
    const timer = setInterval(() => { if (!document.hidden) refresh(true); }, 20000);
    const onPop = () => { const id = new URLSearchParams(location.hash.slice(1)).get('note'); if (id) navigate(id, undefined, false); else { navigationVersion.current++; setSelected(null); setReading(false); } };
    window.addEventListener('popstate', onPop);
    const onKey = (e: KeyboardEvent) => {
      const editing = (e.target as HTMLElement)?.closest('input,textarea,[contenteditable=true]');
      if ((e.key === '/' && !editing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); document.querySelector<HTMLInputElement>('input[aria-label="Search your knowledge"]')?.focus(); }
      if (e.key === 'Escape' && editing) { setQuery(''); (e.target as HTMLElement).blur(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(timer); window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop); };
  }, []);
  useEffect(()=>{
    const dismiss=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented||!reading)return;
      if((event.target as HTMLElement)?.closest('input,textarea,[contenteditable=true],[role=combobox]')||document.querySelector('[aria-modal=true],[role=menu],[role=listbox]'))return;
      event.preventDefault();closeReader();
    };
    window.addEventListener('keydown',dismiss);
    return()=>window.removeEventListener('keydown',dismiss);
  },[reading]);
  useEffect(() => { try { localStorage.setItem('brain-theme', JSON.stringify(theme)); } catch {} }, [theme]);
  useEffect(() => { try { localStorage.setItem('brain-saved', JSON.stringify(saved)); } catch {} }, [saved]);
  const projects = useMemo(() => [...new Set([...projectSettings.order,...projectSettings.archived,...Object.keys(projectSettings.names||{}),...notes.flatMap(n => [...n.labels,...(n.sourceLabels||[])].filter(l => l.startsWith('project:')).map(l => l.slice(8)))])].sort((a, b) => { const ai = projectSettings.order.indexOf(a), bi = projectSettings.order.indexOf(b); return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi) || projectName(a).localeCompare(projectName(b)); }), [notes, projectSettings]);
  const visibleProjects = projects.filter(p => projectFilter === 'all' || projectSettings.archived.includes(p) === (projectFilter === 'archived'));
  const activeMilestone=projectOverviews[project]?.milestones?.some(m=>m.id===milestoneByProject[project])?milestoneByProject[project]:'overview';
  const isSlack = (n: Note) => n.category === 'notes' && ['slack-insight', 'slack-digest'].includes(n.kind);
  const isOther = (n: Note) => (n.category!=='sources'||n.projectAssigned) && !n.labels.some(l => l.startsWith('project:'));
  const matchesCollection = (n:Note, key:string) => key==='github' ? isGitHub(n) : key==='slides' ? isSlides(n) : key==='agent-work' ? isAgentWork(n) : key==='saved' ? saved.includes(n.id) : key==='slack' ? isSlack(n) : key==='linear' ? n.category==='notes' && sourceBrand(n)==='linear' : key==='confluence' ? n.category==='notes' && sourceBrand(n)==='confluence' : key==='inbox' ? n.kind==='recording' : key==='notes' ? n.category!=='sources' : n.category===key;
  const base = notes.filter(n => matchesCollection(n,view)||(!!project&&n.projectAssigned));
  const scoped = base.filter(n => !project || (project === '__other' ? isOther(n) : n.labels.includes('project:' + project)));
  const kinds = [...new Set(scoped.map(n => n.kind))].sort();
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return scoped.filter(n => (assessment==='all'||visibleAssessments(n.projectReviews,project).some(review=>(assessmentStates[review.state]?review.state:'unavailable')===assessment)) && (kind === 'all' || n.kind === kind) && terms.every(t => `${n.title} ${n.body} ${n.labels.join(' ')} ${n.kind}`.toLowerCase().includes(t)))
      .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : b.updated.localeCompare(a.updated));
  }, [notes, view, project, query, kind, assessment, sort, saved]);
  useLayoutEffect(()=>{
    const targetId=reading?selected?.id:cardToReveal.current;
    if(!targetId)return;
    const frame=requestAnimationFrame(()=>{
      const card=Array.from(document.querySelectorAll<HTMLButtonElement>('.note-card')).find(el=>el.dataset.noteId===targetId);
      if(!card)return;
      const scroller=card.closest<HTMLElement>(reading?'.list-scroll':'.workspace');
      if(!scroller||getComputedStyle(card.closest('.note-list')!).visibility==='hidden')return;
      const bounds=scroller.getBoundingClientRect();
      let top=bounds.top;
      if(!reading){
        for(const header of scroller.querySelectorAll<HTMLElement>(':scope > .toolbar, :scope > .collection-navigation'))top=Math.max(top,header.getBoundingClientRect().bottom);
      }
      const rect=card.getBoundingClientRect();
      const visibleTop=top+12,visibleBottom=bounds.bottom-12;
      if(rect.top<visibleTop)scroller.scrollTop+=rect.top-visibleTop;
      else if(rect.bottom>visibleBottom)scroller.scrollTop+=rect.height>visibleBottom-visibleTop?rect.top-visibleTop:rect.bottom-visibleBottom;
      if(!reading){card.focus({preventScroll:true});cardToReveal.current=null;}
    });
    return()=>cancelAnimationFrame(frame);
  },[reading,selected?.id,loading]);
  const title = project ? projectName(project) : ({ notes: 'All', inbox: 'Recordings', sources: 'Original sources', saved: 'Saved', slack: 'Slack', confluence: 'Confluence', linear: 'Linear', 'agent-work': 'Agent work',slides:'Slides',github:'GitHub' }[view] || 'All');
  function captureProjectRects() {
    projectRects.current = new Map(Array.from(document.querySelectorAll<HTMLElement>('[data-project]')).map(el => [el.dataset.project!, el.getBoundingClientRect().top]));
  }
  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll<HTMLElement>('[data-project]').forEach(el => {
      const previous = projectRects.current.get(el.dataset.project!);
      const delta = previous === undefined ? 0 : previous - el.getBoundingClientRect().top;
      if (delta && !reduceMotion) el.animate([{transform: `translateY(${delta}px)`}, {transform: 'translateY(0)'}], {duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)'});
    });
    projectRects.current.clear();
  }, [projectSettings]);
  async function saveProjects(change: {order?: string[]; id?: string; archived?: boolean; name?:string}) {
    if (projectMutation.current) return;
    projectMutation.current = true;
    const previous = projectSettings;
    captureProjectRects();
    if (change.order) setProjectSettings(current => ({...current, order: change.order!}));
    setProjectBusy(true);
    try {
      const response = await fetch('/api/projects', {method: 'PATCH', headers: {'Content-Type': 'application/json', 'X-Second-Brain': 'projects'}, body: JSON.stringify(change)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save project settings.');
      captureProjectRects(); setProjectSettings(result);
      setMessage(change.name!==undefined?'Project renamed':'Project settings saved');
      return true;
    } catch (e) { captureProjectRects(); setProjectSettings(previous); setMessage((e as Error).message); if(change.name!==undefined)setProjectRenameError((e as Error).message); return false; }
    finally { projectMutation.current = false; setProjectBusy(false); }
  }
  function reorderProject(from: string, to: string, edge: 'before' | 'after' = 'before') {
    if (projectMutation.current) return;
    const order = moveProject(projects, from, to, edge);
    if (order.every((id: string, i: number) => id === projects[i])) return;
    saveProjects({order});
  }
  function finishDrag() {
    dragging.current = ''; setDraggedProject(''); setDropTarget(null);
    dragPreview.current?.remove(); dragPreview.current = null;
  }
  function startProjectDrag(e: React.DragEvent<HTMLElement>, id: string) {
    if (projectMutation.current) { e.preventDefault(); return; }
    setProjectMenu(null); dragging.current = id;
    const rect = e.currentTarget.getBoundingClientRect();
    const preview = e.currentTarget.cloneNode(true) as HTMLElement;
    preview.classList.add('project-drag-preview');
    Object.assign(preview.style, {position:'fixed', left:'-10000px', top:'0', width:rect.width + 'px'});
    document.body.appendChild(preview); dragPreview.current = preview;
    e.dataTransfer.setDragImage(preview, e.clientX - rect.left, e.clientY - rect.top);
    e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => setDraggedProject(id));
  }
  function dragOverProject(e: React.DragEvent<HTMLElement>, id: string) {
    if (!dragging.current || projectMutation.current) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const edge = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget({id, edge, top: el.offsetTop + (edge === 'after' ? el.offsetHeight : 0)});
    const scroller = el.closest('.sidebar-body');
    if (scroller) { const bounds = scroller.getBoundingClientRect(); if (e.clientY < bounds.top + 35) scroller.scrollTop -= 12; else if (e.clientY > bounds.bottom - 35) scroller.scrollTop += 12; }
  }
  function openProjectMenu(e: React.MouseEvent<HTMLElement>, id: string) {
    e.preventDefault(); setProjectMenu({id, x:e.clientX, y:e.clientY, trigger:e.currentTarget, keyboard:false});
  }
  function closeProjectMenu() { const trigger = projectMenu?.trigger; setProjectMenu(null); trigger?.focus({preventScroll:true}); }
  function closeReader(history = true) {
    cardToReveal.current=selected?.id||null;
    navigationVersion.current++; setReading(false); setSelected(null);
    if (history && location.hash) window.history.pushState({}, '', location.pathname + location.search);
  }
  function changeView(next: string, nextProject = '') { setIndexMapProject('');closeReader(); cardToReveal.current=null; setView(next); setProject(nextProject); setKind('all'); setAssessment('all'); setQuery(''); }
  const toggleSave = () => { if (selected) setSaved(s => s.includes(selected.id) ? s.filter(x => x !== selected.id) : [...s, selected.id]); };
  const externalSource = selected?.sourceLinks.find(s => /^https?:\/\//.test(s));
  function editRecording(mode: 'rename' | 'delete') {
    setRecordingTarget(selected); setRecordingName(selected?.title || ''); setRecordingError(''); setRecordingDialog(mode);
  }
  async function recordingRequest(method: string, endpoint: string, body: object) {
    const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json', 'X-Second-Brain': 'recordings' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update this recording.');
    return result;
  }
  async function commitRecording(e?: React.FormEvent) {
    e?.preventDefault();
    if (!recordingTarget || savingRecording) return;
    setSavingRecording(true); setRecordingError('');
    try {
      if (recordingDialog === 'rename') {
        const result = await recordingRequest('PATCH', '/api/recordings', { id: recordingTarget.id, title: recordingName });
        setSelected(current => current?.id === result.id ? { ...current, title: result.title } : current);
        setUndoRecording(null); setMessage('Recording renamed');
      } else {
        const result = await recordingRequest('DELETE', '/api/recordings', { id: recordingTarget.id });
        setSelected(current => current?.id === result.id ? null : current);
        setReading(false); changeView('inbox');
        window.history.replaceState({}, '', location.pathname);
        setUndoRecording(result.undoToken); setMessage('Recording deleted. You can undo this.');
      }
      setRecordingDialog(null); await refresh(true);
    } catch (e) { setRecordingError((e as Error).message); }
    finally { setSavingRecording(false); }
  }
  async function undoDelete() {
    if (!undoRecording || savingRecording) return;
    setSavingRecording(true);
    try {
      const result = await recordingRequest('POST', '/api/recordings/restore', { token: undoRecording });
      await refresh(true); await navigate(result.id); setUndoRecording(null); setMessage('Recording restored');
    } catch (e) { setMessage((e as Error).message); }
    finally { setSavingRecording(false); }
  }
  async function assignNoteProjects(note:Note,values:string[]) {
    if(assigningNote)return;
    setAssigningNote(note.id);
    try {
      const response=await fetch('/api/projects',{method:'PATCH',headers:{'Content-Type':'application/json','X-Second-Brain':'projects'},body:JSON.stringify({noteId:note.id,projects:values})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not update projects');
      setProjectSettings(result);
      await refresh(true);setMessage(values.length?'Projects updated':'Moved to Other');
    }catch(error){setMessage((error as Error).message);}finally{setAssigningNote('');}
  }
  async function processRecording(action: 'transcribe'|'summarize') {
    if (!selected || processingAction) return;
    setProcessingAction(true);
    try { await captureRequest(action,{id:selected.id}); const response=await fetch('/api/capture/recordings');if(response.ok)setRecordJobs(await response.json()); setMessage(action==='transcribe'?'Transcription queued':'Summary queued'); }
    catch(e) { setMessage((e as Error).message); }
    finally {setProcessingAction(false);}
  }
  const selectedJob = selected?.audio ? recordJobs.find(j => 'inbox/'+j.id+'/audio.mp3' === selected.id) : undefined;
  const heading = (level: number) => ({ children }: any) => React.createElement('h' + level, { id: slug(String(React.Children.toArray(children).map((x: any) => typeof x === 'string' ? x : x?.props?.children || '').join(''))) }, children);

  return <GridwareAppProvider theme={theme}>
    <div className={'brain-app'+(showCounts?' show-counts':'')}>
      <a className="skip-link" href="#knowledge-content">Skip to notes</a>
      <aside className="sidebar" aria-label="Knowledge navigation">
        <button className="brand" onClick={() => { changeView('notes'); }} aria-label="Gridex home">
          <span><strong>Gridex</strong><small>Kenny’s workspace</small></span>
        </button>
        <div className="sidebar-body">
          <RecorderWidget projects={projects.map(p=>({value:p,label:projectName(p)+(projectSettings.archived.includes(p)?' (archived)':'')}))} onJobs={setRecordJobs} onSaved={async id=>{changeView('inbox');await refresh(true);await navigate(id);}} onOpen={id=>{changeView('inbox');navigate(id);}}/>
          <button className={'nav-item knowledge-map-nav '+(view==='map'?'is-active':'')} aria-current={view==='map'?'page':undefined} onClick={()=>changeView('map')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 1M6 6l5 12M18 7l-7 11"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="7" r="3"/><circle cx="11" cy="18" r="3"/></svg><span>Knowledge map</span></button>
          <div className="section-heading"><p className="section-label">Projects</p></div>
          <div className="project-filter"><Select aria-label="Filter projects" scale="md" value={projectFilter} onChange={value => { finishDrag(); setProjectMenu(null); setProjectFilter(value); }} options={[{value:'active', label:'Active projects'}, {value:'archived', label:'Archived projects'}, {value:'all', label:'All projects'}]} /></div>
          <nav aria-label="Projects" className="project-list" onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null); }}>
            {visibleProjects.map(p => <div key={p} data-project={p} className={'project-row ' + (draggedProject === p ? 'is-dragging' : '')} onDragOver={e => dragOverProject(e, p)} onDrop={e => { e.preventDefault(); if (dragging.current) { const r = e.currentTarget.getBoundingClientRect(); reorderProject(dragging.current, p, e.clientY < r.top + r.height / 2 ? 'before' : 'after'); } finishDrag(); }}>
              <button draggable={!projectBusy} className={'nav-item project-item ' + (project === p ? 'is-active' : '')} onDragStart={e => startProjectDrag(e, p)} onDragEnd={finishDrag} onContextMenu={e => openProjectMenu(e, p)} aria-haspopup="menu" aria-expanded={projectMenu?.id === p} aria-label={projectSettings.archived.includes(p)?`${projectName(p)}, archived`:undefined} title="Drag to reorder · Right-click for actions" onClick={() => { if (!dragging.current) changeView('notes', p); }} aria-current={project === p ? 'page' : undefined} onKeyDown={e => {
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setProjectMenu({id:p, x:r.left + 12, y:r.bottom, trigger:e.currentTarget, keyboard:true}); }
                if (e.altKey && ['ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); const target = visibleProjects[visibleProjects.indexOf(p) + (e.key === 'ArrowUp' ? -1 : 1)]; if (target) reorderProject(p, target, e.key === 'ArrowUp' ? 'before' : 'after'); }
              }}>{projectSettings.archived.includes(p)?<ArchivedProjectMark/>:icon(projectIcon)}<span>{projectName(p)}</span><span className="count-chip nav-count">{notes.filter(n => (n.category === 'notes' || n.audio || n.projectAssigned) && n.labels.includes('project:' + p)).length}</span></button>
            </div>)}
            {draggedProject && dropTarget && dropTarget.id !== draggedProject && <div className="project-drop-line" aria-hidden="true" style={{top:dropTarget.top}} />}
            {!visibleProjects.length && <p className="project-empty">No {projectFilter === 'archived' ? 'archived' : 'active'} projects.</p>}
            {projectFilter !== 'archived' && <button className={'nav-item project-item ' + (project === '__other' ? 'is-active' : '')} aria-current={project === '__other' ? 'page' : undefined} onClick={() => changeView('notes', '__other')}>{icon(projectIcon)}<span>Other</span><span className="count-chip nav-count">{notes.filter(isOther).length}</span></button>}
          </nav>
          <p className="section-label">Library</p>
          <nav>
            {([{ key: 'notes', label: 'All', glyph: 'book' }, { key: 'inbox', label: 'Recordings', glyph: 'recording' }, { key: 'slack', label: 'Slack', glyph: 'slack' }, { key: 'confluence', label: 'Confluence', glyph: 'confluence' }, { key: 'linear', label: 'Linear', glyph: 'linear' }, {key:'github',label:'GitHub',glyph:'github'}, {key:'slides',label:'Slides',glyph:'slides'}, { key: 'agent-work', label: 'Agent work', glyph: 'code' }, { key: 'saved', label: 'Saved', glyph: 'bookmark' }, { key: 'sources', label: 'Sources', glyph: 'database' }]).map(item => {
              const count = notes.filter(n=>matchesCollection(n,item.key)).length;
              return <React.Fragment key={item.key}>{item.key==='saved' && <div className="library-divider" role="separator"/>}<button className={'nav-item ' + (view === item.key && !project ? 'is-active' : '')} aria-current={view === item.key && !project ? 'page' : undefined} onClick={() => changeView(item.key)}>{icon(item.glyph)}<span>{item.label}</span><span className="count-chip nav-count">{count}</span></button></React.Fragment>;
            })}
          </nav>
        </div>
        <div className="sidebar-footer" aria-label="Account: Kenny • Gridware"><span className="avatar" aria-hidden="true">K</span><p className="account-identity"><span>Kenny</span><span className="account-separator" aria-hidden="true">•</span><span className="account-workspace">Gridware</span></p></div>
      </aside>

      <main ref={workspaceRef} className="workspace" id="knowledge-content">
        <header className="toolbar">
          <div className="search-wrap"><Input prefix={icon('search')} scale="lg" placeholder="Search your knowledge…" aria-label="Search your knowledge" value={query} onChange={e => { setQuery(e.target.value); closeReader(); }} allowClear /><span className="search-shortcut"><Kbd>⌘ K</Kbd></span></div>
          <div className="toolbar-actions"><Tooltip content="Refresh from your files"><Button variant="text" aria-label="Refresh knowledge base" icon={icon('refresh')} loading={refreshing} onClick={() => refresh()} /></Tooltip><Tooltip content={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}><Button variant="text" aria-label="Toggle color theme" icon={icon(theme === 'light' ? 'moon' : 'swatch')} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} /></Tooltip></div>
        </header>
        {view==='map'&&!reading?<KnowledgeMap key={project||'global'} scopeProject={project||undefined} onReturnToIndex={project?()=>changeView('notes',project):undefined} query={query} refreshKey={updated} projectName={projectName} onClearSearch={()=>setQuery('')} onOpen={id=>{changeView(id.startsWith('sources/')?'sources':'notes');navigate(id);}} onProject={id=>changeView('notes',id)}/>:<>
        <div className="collection-navigation">
        <div className={'collection-header'+(reading?' is-compact':'')}><div><div className="collection-title-row">{reading&&<Button variant="text" icon={icon('arrow-left')} aria-label="Back to notes" onClick={()=>closeReader()}/>}<h1>{title}<Chip variant="secondary" className="count-chip">{filtered.length}</Chip></h1></div></div>{project&&project!=='__other'&&<ProjectTeam team={(projectOverviews[project]?.milestones?.find(m=>m.id===activeMilestone)?.team||projectOverviews[project]?.team)} onOpen={id=>navigate(id)}/>}</div>
        {!reading&&project&&project!=='__other'&&<div className="collection-milestones"><Tabs aria-label="Project views" bordered={false} items={[{key:'overview',label:'Overview'},...(projectOverviews[project]?.milestones||[]).map((m,i)=>({key:m.id,label:`Milestone ${i+1}`}))]} value={activeMilestone} onChange={id=>setMilestoneByProject(previous=>({...previous,[project]:id}))}/></div>}
        </div>
        {error && <div className="error-bar" role="alert">{error}<Button variant="text" onClick={() => refresh()}>Try again</Button></div>}
        {warnings > 0 && <div className="error-bar" role="status">{warnings} files could not be previewed. Other notes are available.</div>}
        {!reading&&project&&project!=='__other'&&!loading&&<ProjectTimeline milestoneId={activeMilestone} overview={projectOverviews[project]} other={project==='__other'} onOpen={id=>navigate(id)} onSelectMilestone={id=>setMilestoneByProject(previous=>({...previous,[project]:id}))}/>}
        <div className={'content-grid ' + (reading ? 'reading-open' : '')}>
          <section className="note-list" aria-label="Knowledge notes">
            <h2 className="knowledge-notes-heading">Index</h2>
            <div className="list-controls"><Select aria-label="Filter by content type" value={kind} onChange={setKind} scale="md" options={[{ value: 'all', label: 'All types' }, ...kinds.map(k => ({ value: k, label: pretty(k) }))]} /><Select aria-label="Filter by assessment" value={assessment} onChange={setAssessment} scale="md" options={[{value:'all',label:'All assessments'},...Object.entries(assessmentStates).map(([value,state])=>({value,label:<span className="assessment-option"><AssessmentSymbol state={value} dotOnly/><span>{state.label}</span></span>}))]} /><Select aria-label="Sort notes" value={sort} onChange={setSort} scale="md" options={[{ value: 'newest', label: 'Recently updated' }, { value: 'title', label: 'Title A–Z' }]} />{project&&project!=='__other'&&!reading&&<Button className="project-map-toggle" variant={indexMapProject===project?"subtle":"text"} scale="md" aria-pressed={indexMapProject===project} icon={icon('layers')} onClick={()=>setIndexMapProject(old=>old===project?'':project)}>Knowledge map</Button>}</div>
            {indexMapProject===project&&project&&!reading?<KnowledgeMap key={'index:'+project} embedded scopeProject={project} visibleNoteIds={kind!=='all'||assessment!=='all'||query?filtered.map(n=>n.id):undefined} query={query} refreshKey={updated} projectName={projectName} onClearSearch={()=>{setQuery('');setKind('all');setAssessment('all');}} onOpen={id=>navigate(id)} onProject={id=>changeView('notes',id)}/>:<div className="list-scroll" aria-busy={loading}>
              {loading ? <div className="loading-list" role="status">Reading your knowledge base…</div> : filtered.length === 0 ? <Empty icon={icon('file-search', 'lg')} title={query || kind!=='all' || assessment!=='all' ? 'Nothing found yet' : view==='agent-work' ? 'Capture insights and code evidence' : 'A little room for more'} description={query || kind!=='all' || assessment!=='all' ? 'Try another filter, or clear the filters.' : view==='agent-work' ? 'Ask in chat to save an insight from an agent conversation, or inspect code and its history for planning.' : view === 'saved' ? 'Use Save on a note to keep it here.' : 'Add files to your knowledge base, then refresh.'} actions={query || kind !== 'all' || assessment !== 'all' ? <Button variant="outlined" onClick={() => { setQuery(''); setKind('all'); setAssessment('all'); }}>Clear filters</Button> : undefined} /> : filtered.map(note => <article key={note.id} data-note-id={note.id} tabIndex={-1} className={'note-card ' + (selected?.id === note.id ? 'is-selected' : '')} aria-current={selected?.id === note.id ? 'true' : undefined}><button className="card-open" aria-label={note.title} onClick={event=>{cardTrigger.current=event.currentTarget;if(reading&&selected?.id===note.id)closeReader();else openNote(note);}}>
                <div className="card-meta"><h2>{note.title}</h2><AssessmentIndicators reviews={note.projectReviews} project={project} projectName={projectName}/></div>
                <time className="card-date">{date(note.updated)}</time>{note.audio&&<RecordingProcessing compact job={recordJobs.find(j=>'inbox/'+j.id+'/audio.mp3'===note.id)}/>}
                </button><div className="card-footer"><div className="card-project-select">{saved.includes(note.id)&&icon('bookmark')}<ProjectPicker note={note} projects={projects} projectName={projectName} archived={projectSettings.archived} currentProject={project} disabled={!!assigningNote} onChange={values=>assignNoteProjects(note,values)}/></div><span className="card-source"><span className={'kind-icon kind-' + note.kind}>{itemIcon(note)}</span><span>{note.kind === 'prd' ? 'PRD' : pretty(note.kind)}</span></span></div>
              </article>)}
            </div>}
          </section>

          <section className="reader" aria-label="Note reader" aria-hidden={!reading} inert={!reading ? '' : undefined}>
            {selected ? <>
              <div className="reader-toolbar"><div className="reader-location">{itemIcon(selected)}<span>{selected.category === 'sources' ? 'Original source' : selected.category === 'inbox' ? 'Recording' : 'Knowledge note'}</span></div><div className="reader-actions">{selected.audio && <><Tooltip content="Rename recording"><Button variant="text" aria-label="Rename recording" icon={icon('edit')} onClick={() => editRecording('rename')} /></Tooltip><Tooltip content="Delete recording"><Button variant="text" aria-label="Delete recording" icon={icon('trash')} onClick={() => editRecording('delete')} /></Tooltip></>}<Tooltip content={saved.includes(selected.id) ? 'Remove from saved' : 'Save for later'}><Button variant={saved.includes(selected.id) ? 'subtle' : 'text'} icon={icon('bookmark')} aria-label={saved.includes(selected.id) ? 'Unsave note' : 'Save note'} onClick={toggleSave} /></Tooltip><Tooltip content="Copy file path"><Button variant="text" icon={icon('copy')} aria-label="Copy file path" onClick={async () => { try { await navigator.clipboard.writeText(selected.id); setUndoRecording(null); setMessage('File path copied'); } catch { setMessage('Clipboard unavailable in this browser'); } }} /></Tooltip><div className="reader-project-shortcuts">{(selected.labels.filter(l=>l.startsWith('project:')).map(l=>l.slice(8)).length?selected.labels.filter(l=>l.startsWith('project:')).map(l=>l.slice(8)):['__other']).map(id=><Button key={id} variant="outlined" scale="sm" icon={icon(projectIcon)} aria-label={'Open project: '+projectName(id)} onClick={()=>changeView('notes',id)}>{projectName(id)}</Button>)}</div>{externalSource && <Button variant="outlined" scale="sm" iconEnd={icon('external-link')} href={externalSource} target="_blank" rel="noopener noreferrer">{sourceBrand(selected) === 'slack' ? 'Slack' : sourceBrand(selected) === 'confluence' ? 'Confluence' : sourceBrand(selected)==='github'?'GitHub':'Open source'}</Button>}</div></div>
              <div className="reader-scroll" key={selected.id}>
                <article className="document">
                  <div className="document-meta"><Chip color={selected.kind === 'recording' ? 'accent' : 'neutral'}>{selected.kind === 'prd' ? 'PRD' : pretty(selected.kind)}</Chip><span>{date(selected.updated)}</span><span className="meta-dot">·</span><span>{selected.review === 'not-ingested' ? 'Recording' : selected.review === 'original' ? 'Source snapshot' : selected.review === 'reviewed' ? 'Reviewed' : 'Needs review'}</span></div>
                  <h1 className="document-title">{selected.title}</h1>
                  {selected.labels.includes('topic:project-candidate') && <div className="research-candidate"><p>Possible project · Needs research across your sources.</p><Button variant="outlined" scale="sm" onClick={async () => { try { await navigator.clipboard.writeText('Research the possible project in ' + selected.id + '. Search our local knowledge base, Confluence and the connected project tracker. Check scope, aliases, owner/team and active work; decide whether to link an existing project, create a distinct project with evidence, or keep it in Other. Update the discovery record and classification.'); setMessage('Research request copied. Paste it into this project chat.'); } catch { setMessage('Ask this project chat to research ' + selected.id); } }}>Copy research request</Button></div>}
                  <ProjectImpact reviews={selected.projectReviews} project={selected.labels.includes('project:'+project)?project:undefined} projectName={projectName} onOpen={path=>navigate(path)}/><div className="detail-project-control" role="group" aria-label="Project assignment"><span>Project</span><ProjectPicker note={selected} projects={projects} projectName={projectName} archived={projectSettings.archived} currentProject={project} disabled={!!assigningNote} onChange={values=>assignNoteProjects(selected,values)}/></div>
                  {selected.audio && <div className="recording-content"><div>{icon('mic')}<strong>Original recording</strong><span>{selected.duration ? Math.floor(selected.duration / 60) + ':' + String(Math.round(selected.duration % 60)).padStart(2, '0') : ''}</span></div><audio controls preload="metadata" src={selected.audio} aria-label="Play original recording" />{(!selectedJob || selectedJob.transcript.state!=='done' || selectedJob.summary.state!=='done')&&<RecordingProcessing job={selectedJob}/>}{selectedJob?.transcript.error && <p className="recording-error">{selectedJob.transcript.error}</p>}{selectedJob?.summary.error && <p className="recording-error">{selectedJob.summary.error}</p>}{(selectedJob?.transcript.state==='error'||selectedJob?.summary.state==='error')&&<div className="recording-processing-actions"><Button variant="outlined" loading={processingAction} onClick={()=>processRecording(selectedJob?.transcript.state==='error'?'transcribe':'summarize')}>{selectedJob?.transcript.state==='error'?'Retry transcription':'Retry summary'}</Button></div>}</div>}
                  <div className="reading-content">
                    {selected.audio&&selected.status==='processing'&&isProcessing(selectedJob)?<ProjectReview key={selected.id} noteId={selected.id} title={selected.title} contexts={selected.projectContexts} reviews={selected.projectReviews} projectName={projectName} onOpen={path=>navigate(path)}/>:<div className="prose"><ReadableNote reviewContent={<ProjectReview key={selected.id} noteId={selected.id} title={selected.title} contexts={selected.projectContexts} reviews={selected.projectReviews} projectName={projectName} onOpen={path=>navigate(path)}/>} recording={!!selected.audio} transcriptView={selected.audio?<RecordingTranscript key={selected.id} id={selected.id} fallbackText={selected.body.split(/\n## Transcript\s*\n/)[1]}/>:undefined} components={{
                      h1: heading(2), h2: heading(2), h3: heading(3), h4: heading(4),
                      a: ({ href = '', children }) => /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children}{icon('arrow-up-right', 'sm')}</a> : href.startsWith('#') ? <a href={href} onClick={e => { e.preventDefault(); document.getElementById(href.slice(1))?.scrollIntoView({ block: 'start' }); }}>{children}</a> : <a href={'#note=' + encodeURIComponent(resolveLocal(href, selected.id).file)} onClick={e => { e.preventDefault(); const local = resolveLocal(href, selected.id); navigate(local.file, local.fragment); }}>{children}</a>,
                      img: ({src='',alt=''}) => {
                        const local=!/^(?:[a-z]+:|\/\/)/i.test(src)?resolveLocal(src,selected.id).file:'';
                        if(local.startsWith('sources/')&&/\.(png|jpe?g|webp)$/i.test(local)){const url='/api/raw?path='+encodeURIComponent(local);return <a href={url} target="_blank" rel="noopener noreferrer"><img className="preserved-slide" src={url} alt={alt} loading="lazy"/></a>;}
                        return <span className="image-placeholder">{icon('image')}{alt||'Image reference — open the original source to view'}</span>;
                      },
                    }}>{selected.body.replace(/^# [^\n]+\n*/, '').replace(selected.audio&&isProcessing(selectedJob)?/^Recording saved\. Transcription may still be processing\.\s*/:/^$/, '')}</ReadableNote></div>}
                  </div>
                  <div className="document-footnote">{icon('link')}<span>{selected.id}</span></div>
                </article>
              </div>
            </> : null}
          </section>
        </div>
        </>}
        <Menu open={!!projectMenu} anchorEl={projectMenu ? {getBoundingClientRect: () => new DOMRect(projectMenu.x, projectMenu.y, 0, 0)} : null} onClose={closeProjectMenu} role="menu" aria-label="Project actions" matchAnchorWidth={false} highlightFirstOnOpen={projectMenu?.keyboard}>
          <MenuItem disabled={projectBusy||!projectMenu} onSelect={()=>{if(projectMenu){setRenameProjectId(projectMenu.id);setProjectNameDraft(projectName(projectMenu.id));setProjectRenameError('');}closeProjectMenu();}}>Rename project</MenuItem>
          <MenuItem disabled={projectBusy || !projectMenu || !projectSettings.archived.includes(projectMenu.id)} onSelect={() => { if (projectMenu) saveProjects({id:projectMenu.id, archived:false}); closeProjectMenu(); }}>Mark as active</MenuItem>
          <MenuItem disabled={projectBusy || !projectMenu || projectSettings.archived.includes(projectMenu.id)} onSelect={() => { if (projectMenu) saveProjects({id:projectMenu.id, archived:true}); closeProjectMenu(); }}>Archive project</MenuItem>
        </Menu>
        <Dialog open={renameProjectId!==null} onClose={()=>{if(!projectBusy)setRenameProjectId(null);}} title="Rename project" footer={<><Button variant="outlined" disabled={projectBusy} onClick={()=>setRenameProjectId(null)}>Cancel</Button><Button htmlType="submit" form="rename-project-form" loading={projectBusy} disabled={!projectNameDraft.trim()}>Save name</Button></>}>
          <form id="rename-project-form" onSubmit={async event=>{event.preventDefault();if(!renameProjectId||projectBusy)return;setProjectRenameError('');if(await saveProjects({id:renameProjectId,name:projectNameDraft}))setRenameProjectId(null);}}><label className="recording-name-label" htmlFor="project-name">Project name</label><Input id="project-name" autoFocus maxLength={100} value={projectNameDraft} onChange={event=>setProjectNameDraft(event.target.value)} disabled={projectBusy}/>{projectRenameError&&<p role="alert" className="recording-error">{projectRenameError}</p>}</form>
        </Dialog>
        <Dialog open={recordingDialog !== null} onClose={() => { if (!savingRecording) setRecordingDialog(null); }} title={recordingDialog === 'rename' ? 'Rename recording' : 'Delete recording?'} description={recordingDialog === 'rename' ? 'Give this recording a name you’ll recognize.' : 'The recording, transcript, and summary will leave your inbox. You can undo this afterward.'} footer={<><Button variant="outlined" disabled={savingRecording} onClick={() => setRecordingDialog(null)}>Cancel</Button><Button htmlType={recordingDialog === 'rename' ? 'submit' : 'button'} form={recordingDialog === 'rename' ? 'rename-recording-form' : undefined} color={recordingDialog === 'delete' ? 'error' : 'neutral'} loading={savingRecording} disabled={recordingDialog === 'rename' && !recordingName.trim()} onClick={recordingDialog === 'delete' ? () => commitRecording() : undefined}>{recordingDialog === 'rename' ? 'Save name' : 'Delete recording'}</Button></>}>
          {recordingDialog === 'rename' ? <form id="rename-recording-form" onSubmit={commitRecording}><label className="recording-name-label" htmlFor="recording-name">Recording name</label><Input id="recording-name" value={recordingName} onChange={e => setRecordingName(e.target.value)} maxLength={200} autoFocus disabled={savingRecording} /></form> : <p className="recording-delete-name">{recordingTarget?.title}</p>}
          {recordingError && <p className="recording-error" role="alert">{recordingError}</p>}
        </Dialog>
        {message && <div className="feedback" role="status"><span>{message}</span>{undoRecording && <Button variant="outlined" scale="sm" loading={savingRecording} onClick={undoDelete}>Undo</Button>}<Button variant="text" aria-label="Dismiss notification" icon={icon('cross')} onClick={() => { setMessage(''); setUndoRecording(null); }} /></div>}
      </main>
    </div>
  </GridwareAppProvider>;
}

createRoot(document.getElementById('root')!).render(<App />);
