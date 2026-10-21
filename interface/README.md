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

Uses Gridware **Button, Input, Chip, Select, Empty, Tooltip, Icon, Kbd, Dialog, Menu, MenuItem**, and **GridwareAppProvider**, plus the library's generated tokens, theme, typography, and font assets. App layout is consumer-owned CSS. The library checkout was read without editing, checking out branches, installing into it, or rebuilding it.

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

Drag a project row to reorder it. A floating row follows the cursor, a line shows the exact before/after drop position, and rows animate into their saved order. Keyboard alternative: focus a project and press Alt + Up/Down. Right-click a project for Archive or Mark as active (restore an archived project); Shift + F10 opens the same menu from the keyboard. Sidebar navigation rows and the project filter are 32px tall. The project filter offers Active, Archived, or All projects. Archiving hides a project from the active sidebar; its files and all-knowledge search remain available. Unarchive restores it with its previous order. Preferences persist in `.projects.json` in the knowledge root. Other contains Slack insights without confirmed project labels and cannot be archived.

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
