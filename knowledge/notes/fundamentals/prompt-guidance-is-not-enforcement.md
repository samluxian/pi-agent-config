---
id: prompt-guidance-is-not-enforcement
title: Prompt guidance is not enforcement
type: fundamental
status: draft
topic: agent-architecture
summary: Prompt guidance can influence an agent but must be paired with deterministic controls for authority and execution boundaries.
when_to_read: Adding Pi promptGuidelines, tool descriptions, profiles, or policies that must resist ambiguous or hostile task text.
keywords: [prompt-guidelines, enforcement, trust-boundary]
aliases: [prompt-policy, tool-allowlist]
scope: repository-public-case
created: 2026-09-12
updated: 2026-09-12
---

# Prompt guidance is not enforcement

## TL;DR

Pi adds an active custom tool's `promptGuidelines` to the default system-prompt
Guidelines section. [S1] That can improve tool selection and explain intended
workflow, but it does not validate inputs, restrict host access, or establish
user approval.

This repository pairs guidance with deterministic controls: schemas, fixed
operation sets, execution gates, timeouts, output budgets, and explicit approval
and file-ownership checks. Those pairings are repository design choices observed
in current local source and tests; an immutable public permalink is pending.

## When To Read

- Use when a safety rule currently exists only in a prompt or profile.
- Use when exposing a custom Pi tool to the model.
- Do not claim a natural-language instruction prevents an extension from
  executing arbitrary host code.

## Knowledge

### Two Different Mechanisms

Prompt guidance changes the information presented to a model. A custom tool's
parameters define structured input that Pi validates after optional argument
preparation. [S1] Pi's extension type defines the TypeBox parameter interface
and the execution abort signal. [S2] These mechanisms have different failure
modes:

```text
prompt: "Use only read-only inspection."
  -> model may follow, misunderstand, or ignore it

schema + fixed operation builder
  -> unsupported operation is rejected before command construction
```

A schema narrows accepted data; it does not make an authorized operation safe by
itself. A fixed command builder can prevent shell-string interpolation, while
host permissions and extension provenance remain separate trust boundaries.

### Control Placement

Put each rule where it can be checked deterministically:

- capability selection: explicit tool registration and profile tool lists;
- input shape: TypeBox parameters and local validation;
- operation scope: allowlisted operations and fixed argument construction;
- concurrency: an execution gate;
- duration and cancellation: timeouts and abort signals;
- sensitive output: redaction and bounded result handling;
- authorization: user approval and exact file ownership, checked by the parent.

Pi documents that extensions run arbitrary code with full system permissions and
should come from trusted sources. [S1] A prompt cannot reduce that authority.

### Common Mistakes

- **Calling a prompt an allowlist:** words do not reject an unsupported call.
- **Using a schema as authorization:** valid input can still be outside approved
  scope.
- **Hiding failures in a short result:** truncation must stay visible.
- **Trusting an extension because its prompt sounds safe:** inspect its code and
  installation source.

### Minimal Example

```text
Guidance: "Use the inspection tool for status."
Enforcement: operation ∈ {pods, workloads, events}; name grammar is validated;
             argv is built from constants; timeout and output cap apply.
Authorization: parent confirms the user's approved target before calling it.
```

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [Pi extensions documentation](https://github.com/earendil-works/pi/blob/38f18be44727e669eb0a6e2eb8edb51b0232d83c/packages/coding-agent/docs/extensions.md) | 2026-09-12 | `promptGuidelines`, custom-tool schema preparation and validation, and the extension security boundary. |
| S2 | [Pi extension types](https://github.com/earendil-works/pi/blob/38f18be44727e669eb0a6e2eb8edb51b0232d83c/packages/coding-agent/src/core/extensions/types.ts) | 2026-09-12 | Custom tools expose TypeBox parameters and receive an abort signal during execution. |

## Related Notes

- [Keep authority with the subagent parent](subagent-parent-authority.md)
- [Intent routing and adapter verification](intent-routing-and-adapter-verification.md)
