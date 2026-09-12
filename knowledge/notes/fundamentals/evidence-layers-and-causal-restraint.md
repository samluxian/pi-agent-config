---
id: evidence-layers-and-causal-restraint
title: Evidence layers and causal restraint
type: fundamental
status: draft
topic: agent-architecture
summary: Separate desired state, observed state, and runtime evidence before making a causal claim about agent behavior.
when_to_read: Explaining an agent or GitOps outcome when source, tool output, deployment state, and runtime observations may disagree.
keywords: [evidence-layers, causality, gitops]
aliases: [desired-state, causal-inference]
scope: repository-public-case
created: 2026-09-12
updated: 2026-09-12
---

# Evidence layers and causal restraint

## TL;DR

A repository change shows intended behavior. Extension registration shows that
a configuration selects an extension, not that a particular runtime loaded or
executed it. Pi tool-result events expose tool input, content, error state, and
tool-specific details. [S2] None of those alone proves the runtime cause of an
outcome.

OpenGitOps distinguishes declarative desired state, versioned history, and
continuous reconciliation against actual state. [S1] This repository applies the
same separation to agent architecture: retain evidence-layer labels and state
what each layer cannot establish. The labels below are a local reasoning
contract whose immutable public source permalink is pending.

## When To Read

- Use when a source change is being offered as proof of a live behavior.
- Use when a projected tool result appears to explain an incident or test change.
- Do not name a root cause when the evidence only shows correlation or a possible
  contributing design factor.

## Knowledge

### Evidence Stack

```text
source and tests
  -> packaged or registered extension
  -> intended configuration or desired state
  -> tool invocation and result
  -> external system observation
  -> runtime behavior over a defined time window
```

Each transition can fail independently. A test can validate a local branch while
a deployed instance runs another revision. A tool can return no results because
of its query bounds, permissions, or external retention. A context projection
can faithfully summarize an incomplete source and still be insufficient for a
causal conclusion.

### Causal Claim Discipline

State the strongest supported claim, then name the missing discriminator:

- **Observed:** a tool returned a particular result at a stated layer.
- **Source-proven:** local code contains a mechanism that could produce it.
- **Contributing factor:** the mechanism plausibly increases the outcome's
  likelihood, pending a link to the running behavior.
- **Root cause:** evidence connects the trigger, mechanism, and outcome and
  competing explanations were tested or excluded.

The labels are this repository's reasoning convention. They do not turn a source
citation into live-system proof.

### Common Mistakes

- **Configuration equals deployment:** reconciliation can be delayed or fail.
- **No output equals no event:** the query's scope is an evidence boundary.
- **Test passes equals production fixed:** tests establish selected behavior, not
  rollout identity or runtime conditions.
- **One plausible mechanism equals root cause:** preserve alternatives and the
  next falsifying check.

### Minimal Example

```text
Observed: the inspection adapter returned no matching log entries.
Not established: the workload emitted no logs.
Next evidence: query window, project scope, permissions, routing, retention,
and source emission must be checked separately.
```

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [OpenGitOps principles](https://opengitops.dev/) | 2026-09-12 | Declarative desired state, version history, and continuous reconciliation against actual state. |
| S2 | [Pi extension types](https://github.com/earendil-works/pi/blob/38f18be44727e669eb0a6e2eb8edb51b0232d83c/packages/coding-agent/src/core/extensions/types.ts) | 2026-09-12 | Tool-result events expose tool input, content, error state, and tool-specific details rather than external runtime truth. |

## Related Notes

- [Deterministic context projection for tool results](deterministic-context-projection.md)
- [Coverage-backed Fallow refactoring](../runbooks/coverage-backed-fallow-refactoring.md)
