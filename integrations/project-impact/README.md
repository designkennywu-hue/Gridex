# Project impact review

An insight summary and a project update are separate artifacts. Opening a card, reading a transcript, marking a source reviewed or ingesting it does not demonstrate that its implications were considered or incorporated into a project.

## When Kenny points to evidence

1. Confirm the exact insight, source section/timestamp and relevant project(s). State what it establishes and what remains uncertain. Retrieve referenced sources where available; never claim unread material supports a change.
2. Read the current project overview, decisions, assumptions, next actions, milestones/issues and relevant evidence. Respect manual assignments, names and archive/order settings. Compare the new evidence against existing claims; newer does not automatically mean authoritative. Retain contradictions and source dates.
3. Prepare a specific proposal with the requested section or item before and after, source locators, rationale, what remains unchanged, and validation gaps. Distinguish explicit decisions/commitments from proposed follow-ups. Leave unsupported dates, owners, metrics and approval blank.
4. Save the proposal in `documents/.project-updates/<descriptive-id>.md` using `templates/project-impact-review.md`. This hidden folder avoids presenting a proposed project edit as another independently sourced insight card. Preserve exact source/project revisions in `.project-reviews.json`. Mark the relevant source/project pair `proposed`. Present the meaning and proposed changes to Kenny and ask for approval; the draft must be concrete before asking. Do not apply the changes while approval is pending.
5. Apply only what Kenny explicitly approves. Before applying, recheck source, project and proposal revisions. Changed evidence/baselines require reconciliation and a renewed proposal if the approved scope materially changes. Preserve the previous project state in history, edit only the approved project sections/items, and record the actual before/after revisions and user approval reference. Update source links and navigation as needed. External Linear/GitHub writes require separate authorization.
6. Mark `applied` only after the approved changes are saved and checked. Include the current project revision, the exact evidence revision, proposal digest, approval reference, applied date and changed project paths. “Reviewed · no change” requires a documented rationale, not a click or lack of a response. Keep prior records in registry history. Report the applied result or explain why no change is warranted.

This is the default process for future evidence-to-project updates, including evidence found during ingestion. Previously authorized, specific changes can still be completed in their agreed scope; general ingestion authorization no longer authorizes silently changing project decisions, actions, milestones or issues. Source ingestion, summaries, provenance and navigation can continue independently.

## Card states

| State | Meaning |
| --- | --- |
| No review recorded | Neither an impact review nor an audited project reference is recorded. Prior consideration is unknown. |
| Referenced in project | A backfill audit verified that the current project explicitly cites this note at recorded locations. This establishes citation usage, not approval, semantic validation of every claim, or a historical before/after change. |
| Update proposed | A versioned proposal is available; project edits await approval. |
| Project updated | The registry records explicit approval and an applied change matching current evidence and project state. |
| Reviewed · no change | A recorded assessment explains why the project needs no change. |
| Needs recheck | Source/project/proposal has changed, evidence is missing, or a record lacks required proof. |

The former unread card dot now represents No review recorded for all source types and is not cleared by opening a card. Source-note `review_status` remains independent. A source may affect multiple projects; track each pair separately. Reassignment does not transfer an assessment to another project. Invalid review metadata displays Review unavailable rather than a successful state.

## Storage and revision contract

Local registry `.project-reviews.json` uses `{ "version": 1, "entries": [], "history": [] }`. It stays private, alongside project preferences, and is maintained by the agent rather than a card toggle. Entries are keyed by `noteId` (stable Library path) and `project` (stable label slug). No background review or automatic project mutation is enabled by this UI.

Use the exported `evidenceRevision(note)` and `projectRevision(rawProject)` functions in `interface/project-reviews.mjs`; use the effective Library note and the raw project object at `topics/project-progress.json.projects[slug]`. Evidence hashes cover title, kind, body and source links, independently of assigned project or read/unread state. Project hashes use canonical JSON of that project's raw object, so unrelated projects do not invalidate its review. A nonexistent project hashes as null. `proposalRevision` is SHA-256 of the proposal file's actual bytes.

Each entry has `noteId`, `project`, `state` (`proposed`, `applied`, `no-change` or `referenced`), `evidenceRevision`, `projectRevision`, `reviewedAt`, and a concise `summary`. Proposals additionally require `proposal` matching `documents/.project-updates/<lowercase-hyphenated-id>.md` and `proposalRevision`. A no-change assessment requires `rationale`. Applied entries require `appliedAt`, `approvalReference` to an actual preserved user approval, and `changes` containing `{path, beforeRevision, afterRevision}`. At least one actual change must target `topics/project-progress.json#projects.<slug>` with the current project hash as `afterRevision`. Archive prior entries and project snapshots; never fabricate approval references or revision evidence.

Missing or changed proposal files cannot display Project updated. A current project hash is a consistency check, not independent proof that an approval was legitimate; the agent must verify the actual human approval and record a source reference. Existing project evidence links do not automatically backfill applied reviews.

## Backfilling historical usage

When authorized, audit the existing project registry rather than resetting all cards to an unassessed claim. Record `referenced` only for exact source-note/project pairs cited in the current raw project. Include `sourceLocations` as every matching JSON pointer to a `sources` array within that project, `reviewedAt` as the audit time, current evidence/project revisions, and a rationale explaining the limited proof. The server verifies those pointers against current citations; missing citations, incomplete location lists or changed revisions display Needs recheck. Preserve the previous registry and an audit report. This state needs no invented proposal or approval. Do not extend it to similar cards, original recordings, repositories or upstream sources merely because they concern the same topic. A synthesized meeting note can be referenced while its original recording has no separate project-impact review.

Keep uncited cards as No review recorded unless a separate supported assessment exists. Do not infer no-change, historical approval or applied updates from a citation. Historical backfill does not alter project content or source-note review status. The October 21 audit is recorded in `documents/.project-updates/2026-10-21-historical-reference-audit.md`.

Card presentation uses colored corner symbols with hover/focus status tooltips, without chips: red dot (No review recorded), default-text arrow (Referenced in project), purple plus (Update proposed), green check (Project updated), blue information icon (Reviewed · no change), yellow dot (Needs recheck), orange question mark (Review unavailable). Keep every project-specific state visible on multi-project cards. Reader chips and proposal links remain available.

The assessment filter presents all states as colored dots beside their labels; the card corner keeps its state-specific symbol.

## Inline insight detail

Project review lives inside each insight detail, following the opening summary and before a recording transcript. Current project citations are calculated from `topics/project-progress.json`; exact section/item text is displayed. Agent-maintained `.project-review-context.json` can hold draft source/project comparisons, source locators, current-versus-proposed wording and open questions. Bind comparisons to current evidence/project fingerprints and a check date; retain the external capture used for the comparison. Changes invalidate the draft display. These notes are not an approved proposal or application event and must not automatically advance card assessment states. A completed proposal still follows the versioned proposal and explicit approval contract above. No request is sent automatically; Copy review request copies a prompt for the project chat.
