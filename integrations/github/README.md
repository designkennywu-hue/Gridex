# GitHub evidence

The GitHub Library source holds focused source-linked insights in `documents/github/`, using `source_kind: github` and `content_type: github-insight`. Confirmed project labels place cards in their project galleries. Local code/conversation reports already classified as Agent work retain their original paths and provenance.

## Scope and capture

Start with INDEX.md and IMPORTS.md, then the relevant project notes. Reuse matching captured evidence and fingerprints before fetching again. A synthesis of an earlier snapshot must retain that snapshot's capture time, repository and exact revisions; creating a new insight today does not refresh the evidence.

When a user requests a live GitHub refresh, use available read tools or authenticated GitHub CLI for the named repository and relevant PRs, issues, reviews, checks, releases or code/history. Read applicable repository instructions before code inspection. Record the authenticated repository identity, query scope, pagination and gaps. Do not infer access from a similar repository name or claim complete coverage from a bounded sample.

Preserve selected returned responses and source/code snapshots under `sources/<batch>/`, with stable provider IDs, URLs, commit/base/head SHAs, capture dates and SHA-256 fingerprints. For reused evidence, link the existing source and hash it rather than duplicating the full archive. Archive-member extraction should retain the original archive, commit, member path and extracted-byte hash. Never execute imported code as an ingestion step or copy credentials into the knowledge base.

## Insight cards

Use `templates/document.md`, adapting sections to the actual finding. One coherent product/design-relevant insight per card is the default. Keep factual evidence, author claims, interpretation and proposed follow-ups distinct. Each card needs its project label, source locators, review status `needs-review`, capture/recency limits and links to related prior reports.

Branch ancestry is not semantic independence; file overlap is not proof of conflict. A PR body states author intent, a review records that review, and check results establish only the named check at the captured revision. Code/workflow presence does not establish that a job ran. Mergeability, a passing build or an AI-generated description does not establish engineering acceptance, a release or consumer adoption.

Retain disagreements and unknown owner/date/metric fields. Keep planning suggestions explicitly proposed. Update INDEX.md, LABELS.md and IMPORTS.md with fingerprints, outputs and gaps. Update project progress only where the evidence supports a material change. Preserve names, assignments, ordering and archive preferences.

This source is an on-demand local evidence workflow. Adding it does not enable a background GitHub sync, modify repositories, post reviews/comments, create tickets, merge PRs or publish anything. Those actions require their own user authorization.
