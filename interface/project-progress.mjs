// Project status is curated from local evidence, never inferred from elapsed dates.
export function buildProjectOverviews(raw, notes) {
  const output = {};
  if (!raw || raw.version !== 1 || !raw.projects || typeof raw.projects !== 'object') return output;
  const text = (v, limit) => typeof v === 'string' && v.trim() && v.length <= limit ? v.trim() : null;
  const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
  for (const [id, entry] of Object.entries(raw.projects)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !entry || typeof entry !== 'object') continue;
    const projectNotes = notes.filter(n => n.labels.includes('project:' + id));
    const known = new Set(projectNotes.map(n => n.id));
    const sources = values => Array.isArray(values) ? [...new Set(values.filter(v => known.has(v)))].slice(0, 5) : [];
    const phase = text(entry.phase, 100), asOf = day(entry.asOf), evidence = sources(entry.sources);
    if (!phase || !asOf || !evidence.length) continue;
    const steps = Array.isArray(entry.steps) ? entry.steps.slice(0, 6).flatMap(s => {
      if (!s || !text(s.label, 100) || !['recorded', 'current', 'planned'].includes(s.state)) return [];
      const refs = sources(s.sources);
      return refs.length ? [{label:s.label.trim(), state:s.state, date:day(s.date), sources:refs}] : [];
    }) : [];
    const action = entry.nextAction;
    const actionSources = sources(action?.sources);
    const nextAction = action && text(action.text, 400) && actionSources.length && ['recorded','suggested'].includes(action.kind) ? {
      text:action.text.trim(), kind:action.kind, owner:text(action.owner, 100), due:day(action.due), sources:actionSources,
    } : null;
    const nextActions = (Array.isArray(entry.nextActions) ? entry.nextActions : entry.nextAction ? [entry.nextAction] : []).flatMap(a => {
      const refs=sources(a?.sources);
      return text(a?.text,400)&&refs.length&&['recorded','suggested'].includes(a.kind) ? [{text:a.text.trim(),kind:a.kind,owner:text(a.owner,100),due:day(a.due),sources:refs}] : [];
    });
    const newerNotes = projectNotes.some(n => typeof n.updated === 'string' && n.updated.slice(0,10) > asOf);
    const briefItems = key => Array.isArray(entry[key]) ? entry[key].slice(0,4).flatMap(item => {
      const refs = sources(item?.sources);
      return text(item?.text,600) && refs.length && ['recorded','assumption','proposed'].includes(item.kind) ? [{text:item.text.trim(),kind:item.kind,sources:refs}] : [];
    }) : [];
    const team = Array.isArray(entry.team) ? entry.team.flatMap(member => {
      const refs=sources(member?.sources);
      return text(member?.name,100)&&text(member?.role,120)&&refs.length ? [{name:member.name.trim(),role:member.role.trim(),sources:refs}] : [];
    }) : [];
    const milestones = Array.isArray(entry.milestones) ? entry.milestones.flatMap(m => {
      if(!text(m?.id,80)||!text(m?.title,100)) return [];
      const merged={...entry,...m,milestones:undefined};
      const validated=buildProjectOverviews({version:1,projects:{[id]:merged}},notes)[id];
      return validated ? [{id:m.id,title:m.title,...validated}] : [];
    }) : [];
    output[id] = {emptySections:entry.emptySections==='blank'?'blank':undefined,milestones,team,assumptions:briefItems('assumptions'),decisions:briefItems('decisions'),kpis:briefItems('kpis'),phase, asOf, note:text(entry.note, 400), sources:evidence, steps, nextAction, nextActions, newerNotes};
  }
  return output;
}
