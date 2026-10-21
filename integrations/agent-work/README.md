# Agent work

Agent work connects insights from coding conversations with evidence from the resulting code. Gridex reads local notes; it has no background chat collector or live repository connection.

## Capture a conversation insight

Requests such as “Save the UX insight from this discussion” or “Capture this agent chat for Design system” authorize a scoped capture. Ongoing capture requires an explicit scope from Kenny. A routine discussion alone is not a request to save it.

1. Read INDEX.md, LABELS.md and IMPORTS.md; check existing origins, IDs and source fingerprints. Establish the project from evidence. Unknown project identity stays unassigned, visible in Other.
2. Preserve an exact available excerpt/export in `sources/<batch>/conversation.md` or its native format. Identify the agent/client, chat/turn IDs or link when available, capture time, participants by role, original attachment references and missing context. Mark excerpts as excerpts. Do not manufacture timestamps, unprovided attachments or a full-chat export.
3. Use `templates/agent-insight.md` in `documents/agent-work/insights/`. Capture the UX problem, useful reasoning, alternatives, explicit user corrections/decisions and unresolved validation. Give each material claim a turn/section locator. Keep agent proposals and reported results distinct from user instructions and checks.
4. Apply the general import rules: SHA-256 of preserved bytes, deduplication/version links, needs-review, a small number of existing labels, INDEX.md and IMPORTS.md entries. Link relevant code evidence; the same agent report is not a second independent source.

## Inspect code for planning

Requests such as “Document what this code actually supports” or “Check the design-system code and history before updating the plan” authorize scoped read-only inspection and local evidence capture. They do not authorize editing the source repository or creating external tasks.

1. Start with the relevant note and source links, then inspect the actual code location. Read its instructions and readme. Inventory relevant paths before reading content. Record the repository location separately from portable snapshot links.
2. Inspect current branch/commit and working-tree changes; follow the relevant file history and diffs. Include uncommitted/untracked files actually relied on. Dates and commit messages are contextual claims, not proof of implementation or release. Without Git, use selected file snapshots/hashes and record that history is unavailable.
3. Read the relevant implementation, callers, configuration, dependencies and tests. Inventory names/counts only within the inspected scope. Tests that exist are not tests that ran. Never execute imported code merely to document it. Record trusted checks already run, or run checks only within separately authorized implementation/validation work.
4. Preserve selected source files and history/diff/check excerpts under `sources/<batch>/`, retaining relative paths. Include a manifest with origin, captured time, exact commit, branch, dirty status, file hashes, covered and excluded paths, commands/results actually observed and gaps. Do not copy credentials, entire repositories, generated output or dependencies. If secrets require redaction, hash the preserved redacted bytes and label the omission; never claim an exact unredacted snapshot.
5. Write `documents/agent-work/code/<date>-<subject>.md` using `templates/code-evidence.md`. Link portable snapshots with original file line ranges or named symbols and commit. Distinguish present code, verified behavior, intended UX, engineering acceptance and release. Connect implications to the design-led engineering handoff plan as proposals unless explicitly accepted.
6. Before refreshing project status, recheck relevant current files/history, compare against prior snapshots and retain conflicts. Update project progress only for supported changes. Do not infer a milestone is complete because its tasks or code exist.

## Evidence standard

| Claim type | Supporting evidence | What it establishes |
| --- | --- | --- |
| User-stated | Exact user turn and context | The user's intent, correction or approval within its stated scope |
| Observed in code | Inspected file/symbol, preserved snapshot/hash, revision | Implementation present in that snapshot |
| Verified | Actual check output, time, environment and scope | The behavior covered by that check |
| Agent-reported | Exact agent turn | What the agent claimed; independent verification may be missing |
| Proposed | Labeled reasoning with supporting inputs | A suggested direction or acceptance criterion |
| Unknown | Explicit gap and next check | No supported conclusion yet |

Use care with contradictory sources. Preserve both claims and their scope; user corrections can clarify intent, while inspected code/checks establish implementation. Nobody's confident wording supplies missing validation.

## Library routing

- Sidebar: **Agent work**, icon: code; both insight and code-evidence notes appear here, in All, and in their confirmed projects.
- New notes: `documents/agent-work/insights/` and `documents/agent-work/code/`. The folder boundary or `content_type: agent-insight` / `code-evidence` identifies the collection even when a note cites Slack, Linear or Confluence. Existing notes can be classified in place using those content types; retain their stable IDs, paths and source links instead of duplicating them.
- `content_type`: `agent-insight` or `code-evidence`; `source_kind`: `agent-conversation` or `code`. These describe provenance, not a specific model vendor.
- Preserved originals stay under Sources, with backlinks from the note. Templates, workflow instructions and capture manifests are not independent insight cards.
- No automatic retroactive ingestion is enabled. Other clients must be configured to read this knowledge base's AGENTS.md; installing this local workflow does not configure them.
