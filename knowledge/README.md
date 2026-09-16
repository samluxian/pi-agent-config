# LLM Wiki

This Markdown knowledge base serves human readers and coding agents. It records
technical fundamentals, real failure mechanisms, investigation paths, wrong
turns, resolutions, validation, and public sources.

All wiki content is written in English and edited under the pinned
[No AI Slop writing contract](../.agents/skills/llm-wiki/references/writing-style.md).
The edit must preserve technical detail, evidence grades, and uncertainty.

## Read The Wiki

Start with [`INDEX.md`](INDEX.md), choose one topic, and open that topic's index.
Do not load every note.

```text
INDEX.md
→ one topic index
→ one to three notes
→ public sources cited by the selected notes
```

Available topics:

- [`agent-architecture`](topics/agent-architecture/INDEX.md) covers Pi context projection, subagent authority, prompt enforcement boundaries, typed adapters, evidence layers, and coverage-backed refactoring.
- [`ci-pipelines`](topics/ci-pipelines/INDEX.md) covers runner capacity, critical-section serialization, rootless BuildKit, toolchain regressions, parallel jobs, and retry boundaries.
- [`cloud-identity`](topics/cloud-identity/INDEX.md) covers GKE workload identity, CI runner registry authorization, IAM authorization, and service account key replacement.
- [`gitops-delivery`](topics/gitops-delivery/INDEX.md) covers CI handoffs, immutable artifact references, desired-state changes, status RBAC, and GitOps reconciliation ownership.
- [`helm-contracts`](topics/helm-contracts/INDEX.md) covers shared values, schemas, templates, dependencies, and rendered-resource compatibility.
- [`kubernetes-delivery`](topics/kubernetes-delivery/INDEX.md) covers migration Job ordering and stateful workload rollout behavior.
- [`kubernetes-scaling`](topics/kubernetes-scaling/INDEX.md) covers HPA/KEDA ownership, scale targets, multi-signal scaling, and replica-writer conflicts.
- [`llm-agents`](topics/llm-agents/INDEX.md) covers agent knowledge retrieval,
  context use, and note design.
- [`logging-observability`](topics/logging-observability/INDEX.md) covers Cloud Logging routing, exclusions, sampling, and diagnostic evidence.
- [`runtime-diagnostics`](topics/runtime-diagnostics/INDEX.md) covers runtime
  evidence, causality, and behavior-level fix validation.
- [`terraform-state`](topics/terraform-state/INDEX.md) covers resource addresses, imports, state ownership handoffs, and migration validation.

## Agent Lookup

Run this from the repository root:

```text
.agents/skills/llm-wiki/scripts/wiki.py find --query <terms> --limit 5
```

Lookup returns index metadata, never note bodies. When no result applies, continue
the domain workflow or external research. Do not scan all notes to force a match.

## Add Or Update A Note

Load the manual skill:

```text
/skill:llm-wiki
```

The maintenance flow checks for an existing note, selects the narrowest template,
and updates one topic index. Public cases cite official sources or immutable public
repository permalinks. Private experience must be rebuilt as a complete synthetic
source packet; copied, masked, or lightly edited private artifacts are prohibited.

## Status

| Status | Meaning |
| --- | --- |
| `draft` | The structure or source support is incomplete. |
| `open` | The problem is recorded, but the cause or fix lacks validation. |
| `verified` | Evidence supports the cause, applied resolution, and behavior-level validation. |
| `superseded` | A newer note replaces this note and records the relationship. |
| `archived` | The note no longer applies but retains useful research history. |

A wiki note records prior knowledge. Check the current version, configuration,
artifact, runtime state, and time window before applying it to a target system.

## Validation

Run the deterministic checker:

```text
.agents/skills/llm-wiki/scripts/wiki.py check
```

The checker validates frontmatter, unique IDs, index coverage, links, size limits,
source permalink shape, English-only wiki prose, a bounded No AI Slop rule set,
synthetic-case markers, and verified-incident requirements. It cannot validate
source interpretation, publication authority, natural voice, or semantic
re-identification risk; those checks still require human review.
