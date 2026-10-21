// Agent work is a local source collection. Citations to external providers do not
// change the origin of a conversation insight or code-evidence note.
export function isAgentWork(note) {
  return note.category === 'notes' && (note.id.startsWith('documents/agent-work/') || ['agent-insight','code-evidence'].includes(note.kind));
}
