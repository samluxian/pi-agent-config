# OKF Skill

Local adaptation of [Open Knowledge Format](https://okf.md/) and the
[official OKF skill](https://okf.md/skill/), using v0.2 semantics.

The `okf` skill supports create, validate, enrich, generate, convert, and serving
preparation. It is available for automatic selection when an OKF maintenance task
matches, or explicit selection by its skill name. Selection never grants write,
source-ingestion, cloud, execution, or publication permission.

- `SKILL.md`: operation routing and authorization boundaries.
- `references/format.md`: conformance, metadata and migration mapping.
- `references/workflows.md`: operation details and serving prerequisites.
- `references/writing-style.md`: preserved English editing guidance.
- `references/private-to-synthetic.md`: preserved synthetic/public-safety guidance.
- `assets/concept.md`: minimal concept template.
- `scripts/okf.py`: read-only validator; Python 3 and PyYAML are required.
- `scripts/tests/okf_test.py`: format and complete-bundle regression tests.
- `requirements.txt`: Python dependency declaration.

The repository task `test:okf` runs tests and validates `knowledge/`. No dedicated
search CLI is retained. Local Markdown reading works immediately; cloud/catalog
serving has not been installed, configured, tested, or enabled.

## Migration

Replaces `llm-wiki` and its keyword-search/checker contract. All 37 original
concept bodies and existing safety/evidence distinctions are preserved. Indexes
use lowercase `index.md`; `summary` maps to `description`, `keywords` to `tags`,
and previous status is retained in `evidence_status` alongside OKF lifecycle
status. The bundle README is a documentation concept.

This is independently written repository guidance, not a vendored upstream
implementation. Upstream references may evolve; review the referenced spec
before adopting new metadata or remote integrations.
