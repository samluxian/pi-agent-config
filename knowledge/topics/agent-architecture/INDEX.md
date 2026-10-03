# agent-architecture Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| deterministic-context-projection | fundamental | draft | context-projection, tool-result, output-budget | result-summarization, context-pipeline | A tool-result projection can reduce model context only when its bounded replacement preserves explicit completeness and fails open. | [Note](../../notes/fundamentals/deterministic-context-projection.md) |
| subagent-parent-authority | fundamental | draft | delegation, parent-authority, subagent | child-agent | A parent agent owns edits, approval, reconciliation, validation, and delivery while children return bounded read-only evidence. | [Note](../../notes/fundamentals/subagent-parent-authority.md) |
| prompt-guidance-is-not-enforcement | fundamental | draft | prompt-guidelines, enforcement, trust-boundary | prompt-policy, tool-allowlist | Prompt guidance can influence an agent but must be paired with deterministic controls for authority and execution boundaries. | [Note](../../notes/fundamentals/prompt-guidance-is-not-enforcement.md) |
| intent-routing-and-adapter-verification | fundamental | draft | intent-routing, adapters, validation | typed-operations, fixed-argv | Typed intent routing narrows inspection commands, while adapters must validate and preserve the limits of their projections. | [Note](../../notes/fundamentals/intent-routing-and-adapter-verification.md) |
| evidence-layers-and-causal-restraint | fundamental | draft | evidence-layers, causality, gitops | desired-state, causal-inference | Separate desired state, observed state, and runtime evidence before making a causal claim about agent behavior. | [Note](../../notes/fundamentals/evidence-layers-and-causal-restraint.md) |
