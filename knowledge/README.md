---
type: documentation
title: OKF knowledge bundle
description: Entry points, maintenance operations, and validation for the repository's OKF v0.2 knowledge bundle.
tags: [okf, knowledge, markdown]
---

# OKF Knowledge Bundle

This directory is an [Open Knowledge Format](https://okf.md/spec/) v0.2 bundle.
Start at [index.md](index.md), then follow relevant topic indexes or the
[concept directory](notes/index.md). Concepts remain ordinary Markdown files;
no database, dedicated search strategy, or serving platform is required.

## Layout

- `index.md`: bundle version and topic navigation.
- `topics/<topic>/index.md`: curated concept links and descriptions.
- `notes/fundamentals/`: reusable technical concepts.
- `notes/incidents/`: synthetic educational incident patterns.
- `notes/.obsidian/`: preserved editor preferences, outside the concept format.

Each non-reserved Markdown file has YAML frontmatter with a non-empty `type`.
`title`, `description`, and `tags` improve readability. Unknown metadata is
preserved. Existing body citations, IDs, topics, scopes, and dates remain intact.

## Maintenance

Use the `okf` skill for create, validate, enrich, generate, convert, and serving
preparation. It is a local adaptation of the [official skill](https://okf.md/skill/).
See `.agents/skills/okf/references/format.md` and
`.agents/skills/okf/references/workflows.md` in the owning repository.

These operations are available when requested; reading knowledge does not
trigger ingestion, enrichment, automatic updates, or publication. Enrichment
must not invent content or verification history. Source metadata is optional.
Serving requires an explicitly chosen consumer; no cloud adapter, upload, MCP
integration, or server has been configured by this migration.

All prose and human-readable metadata use English. Apply the
writing contract at `.agents/skills/okf/references/writing-style.md` and manually
review public safety. Never copy private evidence or credentials into this bundle.

## Evidence And Lifecycle

The original note status is preserved as `evidence_status`. OKF lifecycle status
is `stable` for previously verified notes, `draft` for draft/open notes, and
`deprecated` for superseded/archived notes. This mapping is not new verification.
An open incident still has an unverified cause or fix. No `verified` attestation
or generation history was invented during conversion.

Knowledge is prior context, not proof of current configuration, deployments, or
runtime behavior. Use the owning evidence layer for current-state claims.

## Validation

The repository's `test:okf` task runs local unit tests and checks the complete
bundle with `.agents/skills/okf/scripts/okf.py`. It requires Python 3 and PyYAML;
the dependency is declared in `.agents/skills/okf/requirements.txt`.

The checker distinguishes format errors from recommendations and inline Markdown
link warnings; reference-style and HTML links need manual review.
It does not fetch sources, execute computations, attest technical correctness,
or replace semantic privacy review. Broken links and missing indexes are not OKF
format failures, although this repository maintains complete navigation.
