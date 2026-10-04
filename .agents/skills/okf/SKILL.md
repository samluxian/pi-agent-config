---
name: okf
description: Create, validate, enrich, index, convert, or prepare serving of Open Knowledge Format bundles. Use for OKF knowledge-base maintenance and format migration.
---

# Open Knowledge Format

Use OKF v0.2 for the repository's `knowledge/` bundle. Read
`references/format.md` before editing; read `references/workflows.md` for the
requested operation. This is a local adaptation of the official OKF skill,
not an installed cloud integration.

## Operations

- **Create:** write one concept per Markdown file using `assets/concept.md`.
  Choose a type that describes the concept; preserve existing taxonomy.
- **Validate:** run `python3 scripts/okf.py check` from this skill directory.
  The default bundle is the repository's `knowledge/`. Report errors separately
  from recommendations and link warnings.
- **Enrich:** add warranted descriptions, tags, schema tables, examples,
  cross-links, or optional source metadata. Preserve unknown fields and claims.
  Never invent schemas, URLs, generation history, or verification.
- **Generate:** maintain directory listings in `index.md`; add an optional
  `log.md` only for known changes with accurate ISO dates.
- **Convert:** map existing properties and links to OKF without losing content,
  unknown metadata, evidence status, or source support. Confirm ambiguous types.
- **Serve:** prepare a bundle for a user-selected consumer. See the serving
  boundary in `references/workflows.md`; format adoption grants no cloud access,
  publication, upload, MCP setup, or execution permission.

## Repository Boundaries

Work only on the requested operation. Do not ingest sources, enrich content,
update notes, or publish merely because a bundle was read. Knowledge navigation
starts at `knowledge/index.md`; follow relevant indexes and links rather than
loading the entire corpus. There is no required search engine or lookup command.

Keep prose and human-readable metadata in English; apply
`references/writing-style.md`. Preserve uncertainty and exact technical meaning.
For newly authored synthetic educational cases, also read
`references/private-to-synthetic.md`; do not access or copy private records.

Use `evidence_status` for the repository's existing evidence distinctions. OKF
`status: stable` is not proof of verification. Never add `verified` metadata
without an actual known verification event. Notes are prior knowledge, not proof
of current infrastructure or runtime state.

Before delivery, validate the bundle and manually review public safety. Stop on
ambiguous types/targets, leakage risk, unsupported additions, or validation errors.
Report changed concepts/indexes, validation and warning results, and unverified
external integration. Do not execute computations embedded in concepts.
