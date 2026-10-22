# Gridex interface

A local browser for the knowledge base in the parent folder. Open **Open Gridex.command** in the knowledge-base root, or visit [Gridex](http://127.0.0.1:4180) while it is running.

## What it does

- Built-in floating Record a meeting widget above Projects: system audio + microphone, live levels/timer, pause/resume and stop/save. Capture, encoding, transcription and summaries run inside the Gridex server; no separate Recorder service or window is required. Processing progress and retries appear in the recording reader. Recordings can be assigned to existing projects.

- Includes a Slack insights collection of small project-linked updates. Other collects unassigned insights and project candidates. Refresh Slack through the project chat; the browser refresh button only reloads local files.
- Reads real Markdown notes from `documents/`, `topics/`, and `meetings/`.
- Shows preserved originals from `sources/` separately from synthesized notes.
- Groups each Cord recording and its transcript/summary into one inbox item, with original audio playback.
- Renames inbox recordings from the reader toolbar. Titles are stored in the shared Cord metadata; file paths remain stable.
- Deletes recordings after confirmation by moving the entire recording folder into `inbox/.trash/<recovery-reference>/recording/`. An Undo button restores it and its metadata. No automatic permanent purge is configured.
- Searches the full text within the chosen collection/project, filters by content kind, and sorts by source update date or title.
- Switching collections or projects clears the previous reader and expands the collection to a wrapping card grid, with cards capped at 360px. Type and sort filters hug their content with a 140px minimum and medium sizing. Clicking a note slides the reader in from the right and shrinks the list alongside it. Back to notes closes the reader; note deep links still open directly.
- Opens relative note/source links in the reading pane, and Confluence originals in a separate tab.
- Saves bookmarks and light/dark preference in this browser's local storage.
- Checks for file changes every 20 seconds while the page is visible. Refresh reads immediately.
- Supports deep links to notes and recordings, keyboard search with ⌘K or `/`, and a compact layout on small screens.

Ingestion and chat remain in the project conversation. The interface edits recording metadata and project navigation preferences, while knowledge ingestion and project research run through chat. Candidate insights offer a research request to copy into chat. Source timestamps use the browser's local timezone. Unreadable files are surfaced as preview warnings rather than silently omitted.

## Components and provenance

Built using the actual source from Kenny's `shared-ui-components` folder, with confirmation to use PR **117** rather than 177. [PR 117](https://github.com/gridware/shared-ui-components/pull/117) is “Docs: draft usage guidelines on every component page,” head `f05511cb9de3607b46d96be2d5f56f61f98d7edf`, open when checked on 2026-10-20. The build consumes the current working folder, including its uncommitted component work; it is not claimed to be a clean checkout of that PR.

Uses Gridware **Button, Input, Checkbox, Chip, Select, Empty, Tooltip, Icon, Kbd, Dialog, Menu, MenuItem**, and **GridwareAppProvider**, plus the library's generated tokens, theme, typography, and font assets. App layout is consumer-owned CSS. The library checkout was read without editing, checking out branches, installing into it, or rebuilding it.

The current default library location is `/Users/Kenny@gridware.io/Desktop/Dev/shared-ui-components`. To use another location, set `GRIDWARE_UI_DIR` before building. The compiled browser bundle is self-contained, so normal launches do not need to rebuild the library.

## Development and restart

Run these in this `interface` directory:

```sh
npm install --ignore-scripts
npm run build
npm test
npm start
```

`npm start` runs in the foreground at port 4180. `node launch.mjs` starts or reuses the local app in the background and opens it. The double-click launcher uses this helper. It requires Node on the Mac; the existing io.gridware.index user launch agent starts it at login and restarts it after a crash. Logs for the login service go to `~/Library/Logs/Index.log`; manually launched fallback servers log to `.server.log`. Set `PORT` to choose another local port.

After editing `server.mjs`, restart its process. After editing the browser app or shared components, rebuild and reload the page. To stop the background app, identify the process listening on its port and stop that specific process; do not stop unrelated Node processes.

## File access and validation

The server binds only to `127.0.0.1`, rejects foreign Host/Origin values, and limits file reads to knowledge folders and the root index/label/import files. Resolved symlink targets must also remain within that scope. Only recording-management, built-in capture, and project-preference endpoints allow writes, with same-origin and custom-header checks. Metadata writes are atomic and detect concurrent changes; knowledge notes remain read-only. Markdown renders without executing embedded HTML or scripts; image references do not fetch remote content automatically.

Automated tests cover metadata extraction, recording grouping, new-file discovery, restricted paths/symlinks, recording deep links, audio byte ranges, write/origin restrictions, and rename/delete/restore operations on temporary recording fixtures. Browser interaction checks cover search, projects, source navigation, bookmarks, formatted reading, the inbox, split Slack project/Other views, project sorting, archive filtering and unarchiving.

## Recovering a deleted recording after dismissing Undo

Deleted recordings remain in the hidden `inbox/.trash/` directory. Each recovery directory contains `recording/` with the full audio and sidecars, and `manifest.json` with its original inbox path and Cord metadata. Ask the agent to restore the recording using that recovery reference. This is a project-local recovery folder, not the macOS Trash.

## Project navigation

Projects appear above Library in the sidebar. The project map remains a searchable note; there is no separate sidebar shortcut.

Drag a project row to reorder it. A floating row follows the cursor, a line shows the exact before/after drop position, and rows animate into their saved order. Keyboard alternative: focus a project and press Alt + Up/Down. Right-click a project for Archive or Mark as active (restore an archived project); Shift + F10 opens the same menu from the keyboard. Sidebar navigation rows and the project filter are 32px tall. The project filter offers Active, Archived, or All projects. Archived projects use an archive-box icon without a secondary text label; their accessible name still identifies them as archived. Archiving hides a project from the active sidebar; its files and all-knowledge search remain available. Unarchive restores it with its previous order. Preferences persist in `.projects.json` in the knowledge root. Other contains Slack insights without confirmed project labels and cannot be archived.

## Item and navigation icons

Cards and reader headers use identified source logos for Slack and Confluence; document-type labels remain visible. Unidentified/local material uses content-type symbols (microphone, research, requirements target, code/specification, calendar/plan, decision check, reference reports, map and index). Saved uses a bookmark. Every project, including Other, uses the same folder outline icon in navigation and reader tags. Selected navigation text retains its normal weight.

Confluence mark: Font Awesome Free 6.7.2 by Fonticons, Inc., [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), from the [official SVG](https://github.com/FortAwesome/Font-Awesome/blob/6.x/svgs/brands/confluence.svg). Original licensed asset is preserved in `src/assets/confluence.svg`; the consumer renders its path locally.

## Recording migration

The recording engine is in `recorder/engine.cjs`, instantiated by `server.mjs`; it opens no second HTTP listener. Requests under `/api/capture/` allow only capabilities, session status, processing status, start/pause/resume/stop, and transcription/summary retries. Controls require same-origin JSON requests and a custom header. MP3s and sidecars go directly to the knowledge root’s `inbox/`. Existing delete/undo remains the only deletion path. Deleting during processing is blocked.

The original io.gridware.recorder service was unloaded and its launch configuration retained with a .disabled suffix. The new engine has its own helper, encoder and model paths, so the old Vibe Apps/Record folder is not required. Models are immutable hard links that survive deletion of the old filenames.

Summaries use local Ollama, matching the prior configuration; the migrated engine does not use cloud API keys. Native audio permissions still apply to the node process. Recording continues if the browser closes; the active session reappears when Gridex is reopened. The Gridex server must remain running. Capture tests use generated PCM without accessing a real microphone.

## Library and floating recorder

Library collections are All (notes and recordings), Recordings, Slack, Confluence (synthesized imports), Linear, Agent work, Saved, and Sources (preserved originals). Saved is separated from the source collections by a divider.

Agent work contains conversation insights and code-evidence documentation from `documents/agent-work/insights/` and `documents/agent-work/code/`. Confirmed project labels route them into project galleries; unassigned entries also appear in Other. Existing notes classified as `agent-insight` or `code-evidence` are included without moving their paths. External citations do not change their source collection. The workflow, evidence requirements and capture templates are linked from `integrations/agent-work/README.md`; collection setup does not ingest old chats or start background collection.

Recorder is a non-modal floating panel: drag its header, minimize/expand it, and continue using collections/search underneath. Starting a session automatically minimizes to a live timer with pause/resume and stop/save controls. Active sessions recovered after a page reload appear minimized. Capture errors expand the panel. The project picker and readiness details are tucked under the save-destination disclosure. Position is remembered in this browser and kept inside the viewport. Closing an idle panel hides it; an active recording remains accessible in the mini bar and sidebar.

## Readable-summary pilot · awaiting user audit

Current generated notes and recording summaries were revised to lead with the useful point, avoid summary/body repetition, and keep material uncertainty beside the relevant claim. Source and capture bookkeeping is available in an expandable section. All previous versions and hashes are preserved in `documents/.history/2026-10-20-readable-summaries/`. Source snapshots and transcripts were not rewritten.

The recorder uses the trial prompt in `recorder/summary-style.cjs` for new summaries. AGENTS.md, agent.md and ingestion templates have not been changed for this editorial pilot; promote the wording into agent rules only after Kenny audits it. Research basis: GOV.UK clear structure/plain language and Google’s documentation style guide (links in the pilot manifest).

## Recording processing feedback

Saved recordings show a shared Spinner with transcript/summary stages, real transcription progress when supplied, and automatic completion updates. Cards also display the current processing step. Pending transcript content uses a subtle placeholder; audio and navigation remain available. Stop/save shows Saving immediately while the local save finishes. Reading uses the formatted view directly, with no Read / Plain text switch.

Cards show the date, source, title and project label without summary-preview paragraphs. Full summaries remain available in the reader and search.

## Automatic recording titles

After summarization, the local model suggests a short title from the transcript in the same request. Gridex replaces only the default timestamp title. Typed titles and later manual renames are preserved, including renames made while processing. Title changes affect metadata, not recording folder paths, audio or deep links. Existing default-titled recordings can receive a title by choosing Summarize again; custom names remain untouched.

## Project gallery progress

Projects initially open on an Overview tab. The browser remembers the selected tab for each project and the last project or library collection across reloads and reopening; removed milestones fall back to Overview. Projects without milestones retain their existing progress content there. Projects with milestones show a project-level TL;DR and a linked milestone timeline on Overview, without Next actions; milestone tabs retain their individual timelines, actions and briefs. Selecting a milestone in the overview timeline opens its tab. Other retains its existing collection view.

Each project’s full gallery starts with its last-known phase, an evidence-linked timeline, and one next action. The section hides when an item opens, and returns on Back to notes. Other shows a classification next step; new projects without evidence show an explicit unknown phase.

Local project data lives in `topics/project-progress.json` (version 1, `projects` keyed by project label slug). Each entry has `phase`, `asOf` (evidence-through date), `note`, `sources` (local note IDs), `steps` (`label`, optional `date`, `state`: recorded/current/planned, `sources`), and `nextAction` (`text`, `kind`: recorded/suggested, optional `owner`/`due`, `sources`). Update this synthesis when ingesting relevant evidence; it is not an automatic external-status feed. Evidence references must resolve to loaded notes carrying the same project label.

The library refresh reloads the registry. Newer project notes trigger a review notice. Dates passing never advance a planned milestone or imply a missed commitment. Owners and due dates stay unset unless supported. The registry adds no gallery cards, preserves order/archive preferences, and remains excluded from Git. Malformed registries produce a preview warning while notes remain available.

When a detail opens, the collection heading collapses to its title/count and a single Back arrow. Clicking the selected card again or pressing Escape (outside inputs and menus/dialogs) closes it. The arrow in the reader toolbar is removed. Cards lead with the larger title, followed by the date; the gallery has no bottom count/sync bar.

Collection/project headers contain only title and count. Cards place their source label at bottom right and a 24px open arrow at top right; hover/keyboard focus fades the arrow in and shifts it gently upward/right, with reduced-motion support. The recording player and controls render inline in the reader without a surrounding card.

Project progress sits in its own full-width section between the collection heading and filters, without a card border/background or rounded corners. It hides in detail mode and retains the main 24px section inset.

## Gridex naming

The product name and browser title are Gridex. `Open Gridex.command` is the main launcher. `Open Index.command` remains a compatibility launcher; the existing service ID, log filename and browser storage keys are retained so launching and saved preferences continue working.

## Assessment indicators

Every card uses its top-right assessment symbol instead of a status chip. No review recorded is a red dot; Referenced in project is the existing arrow in the default text color; Update proposed is a purple plus; Project updated is a green check; Reviewed · no change is a blue information icon; Needs recheck is a yellow dot; Review unavailable is an orange question mark. Symbols remain visible and reveal the project/status tooltip on hover or keyboard focus. Multiple project assignments retain a separate indicator per project. The assessment filter uses a colored dot for each state; the reader retains its descriptive assessment chips and proposal links.

The red dot replaces the former unread Slack marker. Opening a card no longer clears it: only a recorded assessment/reference changes its status. Old browser read-state data is left untouched but is no longer used for card indicators. Source-note review remains independent.

Daily Slack collection runs through the Morning Slack ingestion chat automation at 08:30 America/Los_Angeles, including accessible DMs/group DMs. See `../integrations/slack/MANAGEMENT.md` for coverage, checkpoints, retries and gaps. No Slack credentials or collection logic are added to the browser.

Recording readers label the summary with a Summary heading and separate Transcript with a divider. These presentation changes do not rewrite preserved summaries or transcripts.

## Stable gallery and detail cards

Card width is calculated from the full workspace width, with 300px target minimum, 360px maximum, 12px gaps and a reserved scrollbar allowance. The same width and 184px minimum height apply in the gallery and detail list. Opening a reader changes the column layout immediately without resizing cards or animating column widths. The detail list fits one gallery-width card plus padding; geometry updates only when workspace width changes. Mobile still switches to the full reader.

Collection/project headers and their detail return rows share an 88px fixed height, 24px title size and centered alignment. Opening details does not compact or animate the header height; project milestone tabs remain a separate section.

The workspace search toolbar, collection/project title and project milestone tabs stay pinned while overview/gallery content scrolls. Opaque backgrounds and stacked offsets keep scrolled content from overlapping navigation. The same header remains in place in detail views, where reader and card-list content scroll separately.

Project titles and milestone tabs are grouped inside one sticky collection-navigation surface. Project title spacing returns to 24px above and 8px below, with 16px below tabs and no internal divider. Library/detail title rows retain the shared 88px height.

Switching between grid and detail reveals the selected card in the appropriate scroll container, accounting for sticky navigation. Returning to the grid also restores keyboard focus to that card; changing collections does not restore the previous collection’s card.

Project menus include Rename project. Display names persist in `.projects.json` under `names`, keyed by the existing project slug. Names update navigation, headings, cards and recording project pickers; labels, paths, note content, order and archive status stay stable. Renaming validates nonblank names up to 100 characters.

Recording preparation uses one status panel with a single activity indicator, real transcription progress when supplied, and Transcript/Summary stages. It covers queued, running, ready and failure states without duplicate spinners or placeholder paragraphs; audio and available transcript content remain accessible. Unknown progress is never presented as a percentage or an estimated completion time.

Each card has a project selector, separate from its open button. Choose Other to remove all project assignments. Recordings retain their existing metadata assignment flow. Other notes and source snapshots use user overrides in `.projects.json` under `assignments`, keyed by stable note path; original bytes and captured labels are preserved (`sourceLabels` in the API). Explicitly assigned source snapshots can appear in project/Other views while remaining in Sources. Other includes unassigned notes and recordings. Ingestion must preserve these user overrides.

Recording processing is unwrapped: no card background, border, radius or inset padding.

Project tags support multiple assignments. Within a project gallery, the tag leads with that project and shows the remaining count (for example, Design system +1). The menu keeps all selected projects checked and stays open while toggling. Other clears the selections. Assignments, including recording overrides, are saved in `.projects.json` without rewriting source labels or recording files; legacy single-project overrides remain readable.

Slides is a Library collection for `documents/slides/` notes or `content_type: slides`. Selected screenshot pages are displayed inline from preserved sources; PNG/JPEG/WebP reads remain limited to `sources/` with resolved-path checks, and remote Markdown images are not fetched. Screenshot notes retain page numbers, original images and partial-deck limits. Project sections can opt into `emptySections: blank` to leave unsupported team/brief sections empty rather than adding placeholders; Aspen and Utility value metrics use this setting.

GitHub is a Library collection for `documents/github/` or `content_type: github-insight` notes, with a local GitHub mark and confirmed project routing. Current Design system cards derive from preserved evidence, not a live feed. Each retains capture time/revisions, primary source links, validation limits and needs-review status. The ingestion workflow is in `integrations/github/README.md`.

Project-impact badges are separate from unread state and source-note review. They show No review recorded, Referenced in project, Update proposed, Project updated, Reviewed · no change or Needs recheck, per project. Proposals open from their badges. Private agent-maintained `.project-reviews.json` records exact evidence/project revisions, proposal digest, rationale or explicit approval/application evidence. Stale or incomplete records never appear applied. The workflow and proposal template are in `integrations/project-impact/README.md` and `templates/project-impact-review.md`; opening a card does not modify a project. Historical references are backfilled only from verified current project citations, with exact locations and revisions. Unmatched cards say No review recorded; no historical approvals or applied changes are inferred.

All index lists include an assessment filter alongside content type and sorting. Project galleries filter that project's assessment; library collections match any displayed project assessment. Items with no assessment match Not assessed. Clear filters resets search, content type and assessment. Project impact states use shared Chip components, preserving proposal navigation and the separate unread indicator.

Project teams appear at the right of the sticky project title header, replacing the Local files badge. The overview no longer repeats the team. Milestone-specific teams take precedence when present; otherwise the project team is used. Team names retain source navigation and keyboard access.

## Speaker-aware transcripts

Recording readers display timestamped paragraphs. Selecting a timestamp seeks and plays the original audio. Local speaker detection groups recurring voices as Speaker 1, Speaker 2, etc.; select a speaker name to rename it throughout that recording. Speaker numbers are local to each recording, and names are user supplied. Overlapping or poorly aligned passages remain unassigned; text segments are preserved verbatim rather than split or paraphrased from guessed speaker changes.

Newly completed transcriptions automatically queue a local speaker pass. Existing recordings offer Identify speakers. Jobs run one at a time, with progress and retry on failure. Speaker results and names are saved in `speakers.json` alongside the recording; audio, transcript JSON/text, and summary remain unchanged. A transcript fingerprint invalidates stale assignments after transcript changes. No audio is uploaded.

Runtime: `recorder/.speaker-runtime` (Python 3.11, sherpa-onnx 1.13.8, numpy), `recorder/speakers.py`, and models in `recorder/models/`. Segmentation uses the int8 pyannote 3.0 ONNX model and embeddings use English NeMo TitaNet Small (clustering threshold 0.85) from the official sherpa-onnx releases. See https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/ and model license/readme in the segmentation model folder. System afconvert prepares a temporary mono 16 kHz WAV, removed when processing finishes. Missing runtime/models surface as retryable processing errors, without blocking the original transcript or summaries.

Every detail header includes the multi-project assignment picker beneath the title and assessment, replacing the former project tag links. This includes recordings, synthesized insights, slide notes and original sources. Recordings use this common picker rather than duplicating one beside the audio player. Project navigation shortcuts appear in the reader toolbar immediately before the external source button, with one shortcut per assigned project (Other when unassigned). Assignments reuse the existing persistent preference flow.

Transcript paragraph boundaries are now based on meaning, separate from speaker turns: the local Ollama model selects original fragment indexes where a new coherent thought/question/response begins. It cannot add or replace transcript words. Layout is fingerprinted in `transcript-layout.json`; opening an existing recording formats its paragraphs locally when no current layout exists. New transcriptions queue this automatically. There is no fixed elapsed-time or fragment-count cutoff in the displayed turns. Paragraph timestamps remain playback links, and context breaks within a speaker's turn do not repeat the speaker label. Without a context layout, only a pause after existing sentence-ending punctuation starts a paragraph; unchanged continuous speech is kept together. Unassigned speaker text does not establish speaker identity. Voice clustering remains automatic and needs human review.

## Inline project review

Each detail renders Project review after its opening summary; recording reviews appear between Summary and Transcript. The section is part of the reader, without a side panel or overlay. It shows exact current local citation locations, dated evidence/target comparisons when documented, draft before/after recommendations, open questions, recorded review metadata and links to valid proposals. Multiple projects have separate sections; unassigned items invite assignment. Copy review request prepares a chat prompt without changing the project.

Optional private `.project-review-context.json` (version 1, entries keyed by noteId/project) stores agent-authored draft comparisons with source/project fingerprints, checkedAt, evidence locators and external source links. Source/project changes hide outdated recommendations behind a recheck notice. This context is distinct from the approved proposal/application ledger in `.project-reviews.json`; rendering it never advances a card assessment state. The ten initial Design system comparisons use the October 21 read-only examination preserved at `sources/2026-10-21-project-review-examination/linear-comparison.json`. External state is a dated capture, not a live sync. Missing comparisons remain explicitly undocumented.

## Knowledge map

The Knowledge map button sits directly below Record a meeting and above Projects. It is a read-only overview of actual relationships in the current knowledge base: project assignments (including user overrides), captured source metadata, Markdown references, entries in INDEX.md, and source lists attached to project overviews, milestones, phases, decisions, assumptions, KPIs and next actions. Single-click selects a node and highlights its connections. Double-click or Enter opens its project; multi-project entities prefer the current project filter, then their first recorded project, while unassigned entities open Other. There is no right-side inspector. A reference is not proof of approval or delivery. Unresolved local references are counted rather than represented as real files. External references are URLs only; opening the graph does not fetch them. Raw source bodies are not recursively expanded.

Graph and Connections list views share project, provider, assessment, date, relationship and entity-type filters. The graph’s top-right Layer selector switches colors between entity types, projects, sources and assessment, with a matching legend and visible counts. Project and source colors remain stable across filtering. Shared items appear as Multiple projects globally and use the selected project when scoped. Assessment respects the selected project; global items with different review states show Mixed project reviews. Entities without assessment show a separate neutral category. Layer and filter preferences persist in this browser. Node shapes and text labels remain available alongside color. Archived projects and unconnected items are independently toggled in Filters & display. Selecting a node highlights direct relationships; the depth control narrows the view to one or two steps. Drag nodes or the background. Two-finger trackpad scrolling pans horizontally and vertically; pinch or Ctrl/Cmd+wheel zooms around the pointer without scrolling the page. Zoom buttons anchor on the selected node when available, otherwise the canvas center. Focus the canvas for arrow-key panning (Shift moves faster), +/− zoom, and F or 0 to fit the visible nodes, including manually dragged positions. Fit frames the current node bounds rather than resetting the camera. The Connections list and keyboard-focusable graph nodes provide a text-based alternative. The map refreshes with the library.

The graph model lives in `knowledge-graph.mjs`, delivered by the local GET-only `/api/knowledge-map` endpoint. Source scopes inherit the projects of citing notes only for map filtering; the note labels and source bytes are unchanged. Graph implementation uses the existing Gridware components and a consumer-owned SVG layout; no graph service or external upload is involved.

Research: [Obsidian graph view](https://obsidian.md/help/plugins/graph) informs filters, color groups and local neighborhoods; [Forte Labs second-brain workflow](https://fortelabs.com/blog/12-steps-to-build-a-second-brain/) informs project-centered organization. Gridex retains its existing knowledge model rather than migrating notes into PARA folders.


## Elastic graph interactions

The Knowledge map uses `d3-force` for link attraction, repulsion, shape-aware collision spacing and weak centering. Duplicate/reversed citations share one layout spring while all evidence relationships remain in the underlying model. Simulation objects are separate from source records. Node positions are retained by ID across filtering; initial positions and new neighbors are seeded without replacing existing coordinates.

A node drag starts after 5 screen pixels and temporarily fixes that node under the pointer. Neighbors respond, and releasing the node lets the graph cool to rest. Pan, zoom, hover and ordinary selection do not restart the simulation. Clicking empty canvas clears selection; background dragging only pans. Hover and keyboard focus reveal direct connections and the inline title while keeping selection independent. Browser-native SVG titles and floating hover tooltips are removed. Escape clears selection.

Camera, local depth, view mode and node positions are retained in this tab's session storage when opening content and returning. Filter/selection preferences retain their existing browser storage. Physics pauses while hidden or in Connections view, and stops on unmount. Reduced-motion preference uses a pre-settled layout and direct node dragging without animated settling. The engine and navigation checks run with `npm test`; visual interaction checks remain necessary for target browsers and physical trackpads.


The map uses the full available width. High repulsion (-360 charge, 115 preferred link distance) spreads clusters further apart. Node glyphs and labels keep consistent screen sizes while zoom changes their spacing. Project labels remain visible at every zoom; non-project labels fade in between 65% and 100% effective zoom, and hovered/selected labels stay visible. A fresh navigation session starts at 110% effective zoom to show detail. Node glyphs have thin surface-colored outlines and a separate light selection/focus ring. Non-project text uses weight 350; project text uses 500. Unrelated nodes retain 22% opacity during highlighting. A single compact toolbar keeps Project and Source visible; Filters & display groups assessment, date, relationship, color, neighborhood depth, entity types, visibility and coverage information in one dismissible panel. The panel shows an active-option count and closes on outside click or Escape.

All checkboxes use the shared Gridware `Checkbox` component, including Knowledge map filters and project action lists. New UI must follow the checkbox convention in the root `AGENTS.md`; consumer CSS controls placement, while the shared component owns appearance and interaction states.

Clicking, hovering, keyboard focus and dragging reveal the active node and its directly connected label candidates, hiding unrelated labels; overlap priority decides which candidates fit at the current zoom. Unrelated nodes use 22% opacity and edges 10%. Glyphs have a thin surface-colored outline; text has a thin surface-colored halo. Labels render in a separate final SVG layer above all edges and glyphs, with the active label last.

The graph has no bottom status bar. Shared icon-only zoom-in, zoom-out and fit buttons float at the lower right. A background-free entity-type legend at the upper left shows all eight types with circular swatches. Each shared Button toggles the same persistent entity filter as the Filters & display checkboxes; hidden types are muted. The legend stays available when filters leave the graph empty. Navigation instructions and counts remain available to assistive technology.

Graph labels use measured text widths and screen-space overlap checks. The active entity is always labeled, followed by projects, insights, recordings and other connected entities, with connection count as a tie-breaker. Strict culling reserves 24px horizontal and 14px vertical clearance around every label and allows at most 3% pairwise overlap of these padded bounds; crowded lower-priority labels are omitted. Pan, zoom and moving nodes recalculate available space without a fixed label-count cap. Font loading refreshes measurements. Hover and click both reveal connected candidates subject to this spacing rule.

Project Index filter rows have a right-aligned Knowledge map toggle. It replaces only the Index cards with an embedded graph scoped to that project. The project overview, milestones and Index filter row remain in place; the same toggle restores the cards. The embedded graph has no duplicate page header or filter toolbar. Index search, content-type and assessment filters restrict its note candidates and their direct connections. The sidebar Knowledge map remains the global entry point.

People nodes use the shared round Avatar component with a name-derived monogram and stable identity color. Avatars stay 24px on screen across zoom levels; their names remain in the overlap-aware label layer. Collision spacing, hit targets and focus rings account for the larger avatar glyph. No profile photos are assumed or fetched.

Automatic local Zoom recording is now available in the expanded recorder. See `recorder/README.md` for setup, permissions, lifecycle rules and current live-validation limits. It runs in the existing Gridex login service, independent of Zoom recordings; transcript/summary preparation is local and knowledge ingestion uses the existing daily workflow.

The recorder waveform uses immutable audio segments: each bar retains its measured height while the strip translates smoothly right-to-left as new level batches arrive. Older bars leave at the left, with no height morphing. Paused/idle state and reduced-motion preferences disable scrolling animation.

Map avatar initials select dark or white text from the actual layer background using WCAG relative luminance, with a 4.5:1 minimum contrast. Yellow People avatars use dark initials. The shared Avatar component is retained, with its supported style prop supplying the foreground color.
