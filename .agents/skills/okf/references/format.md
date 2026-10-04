# OKF v0.2 Contract

Upstream: [OKF specification](https://okf.md/spec/) and
[official skill](https://okf.md/skill/). This repository uses a local adaptation;
no upstream package, executable, or cloud integration is installed.

## Concepts

Every non-reserved `.md` file in a bundle begins with parseable YAML frontmatter
containing a non-empty string `type`. Types are open-ended. Recommended fields
are `title`, `description`, `tags`, and `resource` (omit the latter for abstract
concepts without a canonical asset URI). Body headings and folders are flexible.
Preserve unknown metadata. Use ordinary Markdown links, relative to the file or
starting `/` relative to the bundle root. Missing indexes and broken links are
warnings, not format failures.

Reserved filenames are exactly `index.md` and `log.md`. An index lists concepts
or subdirectories; only the bundle-root index may optionally declare frontmatter
with `okf_version: "0.2"`. Logs use ISO date headings, newest first. Neither file
is required. Other documents, including `README.md`, are concepts and need `type`.

## Optional Metadata

- `status`: `draft`, `stable`, or `deprecated`; omission defaults to `stable`.
  This describes lifecycle, not correctness or human review.
- `sources`: a list of source mappings, each with `resource`; use stable `id`
  values if body citations refer to entries.
- `generated`: known `by` and `at` information; omit unknown history.
- `verified`: one verification event or a list with known `by` and `at`.
  Never infer this from successful format validation.
- `stale_after`: ISO datetime with explicit UTC offset.

These fields are optional: using OKF does not require provenance management.
Existing body source tables remain valid content and are not auto-converted.

## Repository Migration Mapping

The existing 37 concepts retain their IDs, types, topics, aliases, dates, scopes,
body sections, citations, and related links. `summary` becomes `description`;
`keywords` becomes `tags`. The old `status` becomes custom `evidence_status`:

| Existing evidence status | OKF lifecycle status |
| --- | --- |
| verified | stable |
| draft, open | draft |
| superseded, archived | deprecated |

`evidence_status` is repository metadata, not an OKF requirement. In particular,
`open` remains visible and must not become a claim of verified resolution.
Future concepts may use other types or omit this legacy field. Existing
fundamental and incident subdirectories remain; no forced taxonomy is added.

## Validation Layers

The local checker uses Python 3 and PyYAML (`requirements.txt`). It checks YAML,
required type, reserved files, and shapes of recognized optional fields. Inline Markdown link
warnings are advisory; reference-style and HTML links are not checked. It does
not fetch URLs, run embedded computations,
verify claims, detect all secrets, or perform semantic privacy review.
English editing and public-safety review remain manual gates.
