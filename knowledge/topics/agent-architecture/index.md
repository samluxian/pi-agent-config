# agent-architecture

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Deterministic context projection for tool results](../../notes/fundamentals/deterministic-context-projection.md) | fundamental | draft | draft | A tool-result projection can reduce model context only when its bounded replacement preserves explicit completeness and fails open. |
| [Evidence layers and causal restraint](../../notes/fundamentals/evidence-layers-and-causal-restraint.md) | fundamental | draft | draft | Separate desired state, observed state, and runtime evidence before making a causal claim about agent behavior. |
| [Intent routing and adapter verification](../../notes/fundamentals/intent-routing-and-adapter-verification.md) | fundamental | draft | draft | Typed intent routing narrows inspection commands, while adapters must validate and preserve the limits of their projections. |
| [Prompt guidance is not enforcement](../../notes/fundamentals/prompt-guidance-is-not-enforcement.md) | fundamental | draft | draft | Prompt guidance can influence an agent but must be paired with deterministic controls for authority and execution boundaries. |
| [Keep authority with the subagent parent](../../notes/fundamentals/subagent-parent-authority.md) | fundamental | draft | draft | A parent agent owns edits, approval, reconciliation, validation, and delivery while children return bounded read-only evidence. |
