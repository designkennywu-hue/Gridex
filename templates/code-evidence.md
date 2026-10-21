---
id: "<stable ID>"
type: document
content_type: code-evidence
title: "<Capability and inspected scope>"
source_kind: code
source_date: unknown
captured_at: "<ISO-8601 with offset>"
updated_at: "<ISO-8601 with offset>"
review_status: needs-review
document_status: unknown
author: unknown
version: "<commit plus working-tree snapshot ID, or unknown>"
import_batch: "<batch ID>"
labels: []
sources: []
related: []
supersedes: []
---

# <Capability and inspected scope>

## Summary

<What the inspected implementation supports and its main planning implication.>

## Inspected baseline

<Repository locator, branch/commit, dirty/untracked status, capture time, covered paths and excluded areas. Link manifest and file snapshots/hashes. Do not imply the entire repo was audited.>

## Capabilities and gaps

| Claim | Evidence status | Source locator | UX or planning implication |
| --- | --- | --- | --- |
| <Specific behavior or gap> | <Observed in code / verified / agent-reported / proposed / unknown> | <Snapshot path and line range/symbol; check output where relevant> | <What follows, distinguishing inference> |

## Relevant history

<Inspected diffs/commits, user corrections and previous snapshots. If history unavailable, say so. Never derive authorship or sequence from file dates alone.>

## Validation

<Actual check, date, environment, result, covered scope and limitations. If none ran, state Not run. Present code and passing checks do not establish engineering acceptance or release.>

## Handoff and proposed planning

<Current capability, demonstrated gaps, dependencies and proposed acceptance criteria. Owners/dates/estimates/metrics unknown unless sourced. Link discussion evidence for intended UX and actual decisions.>

## Sources and capture notes

<Portable relative links to preserved selected code, history, manifest and check outputs; original repository location as provenance. Record omissions/redactions and stale evidence.>

## Open questions

<What needs verification or explicit agreement before a stronger planning claim.>
