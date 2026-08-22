# Terraform State Handoffs and Failed Apply Recovery

Use this procedure for existing-resource imports, ownership transfers between
Terraform roots, `removed` blocks, saved plans, or recovery after an apply that
may have completed only some actions. It does not authorize the agent to mutate
remote state or run `apply`.

## Keep Three Kinds of Ownership Separate

Record these independently before proposing a transition:

| Layer | Required evidence |
| --- | --- |
| Configuration | Root, environment, resource block, import/move/remove block, and exact address |
| State | Backend identity and exact address currently bound to the remote object |
| Live infrastructure | Provider ID, existence, and only the bounded attributes needed to identify it |

One remote object should have one active Terraform state owner. A matching
resource name in two roots is not evidence that ownership has moved. Do not
print state files or values that may contain secrets; prefer bounded address and
resource summaries.

## Preconditions

Before writing a handoff patch, establish:

1. Source and destination repository paths, branches, roots, environments, and
   backend identities.
2. Exact source and destination addresses, including `for_each` keys or `count`
   indexes where applicable.
3. Provider object ID and current live existence without reading secret values.
4. Terraform and provider versions used by the repository automation.
5. The plan/apply wrapper, working directory, execution principal, and required
   provider/API permissions.
6. Whether another plan, apply, or state lock is active for either root.
7. The accepted runtime gap: source-first handoff briefly leaves no Terraform
   owner; destination-first handoff temporarily creates two state owners.

Stop if any root, backend, address, object ID, lock owner, or accepted gap is
unknown. Do not infer CI ordering from file layout or job names.

## Choose the State Mechanism

- Use a `moved` block for an address change Terraform can represent within the
  same state ownership boundary.
- Use an `import` block plus a matching destination `resource` block for an
  existing object not yet bound in the destination state.
- Use a `removed` block with `lifecycle { destroy = false }` when the source
  state must release an object without deleting the live object.
- Do not use `-target` as a routine ownership-transfer mechanism. Terraform
  documents targeting as an exceptional recovery tool, not a decomposition
  strategy.
- For values produced by another Terraform root, prefer reviewed remote-state
  outputs. Use provider data sources for unmanaged objects, not as an implicit
  dependency on objects managed by another root.

Validate the installed Terraform version and exact block syntax before proposing
`moved`, `removed`, or `import`. Collection addresses require special care: a
whole resource address and one resource instance are different scopes.

## Cross-Root Handoff Sequence

Use an explicit phase table in the proposal. The usual source-first sequence is:

1. **Prepare configuration:** source contains a valid non-destroying removal;
   destination contains the matching resource and import declaration. Review
   both root plans from the same bounded change before any state mutation.
2. **Freeze competing writes:** identify the one user-operated apply at each
   phase; do not allow both roots to apply concurrently.
3. **Release source:** require a fresh source plan whose only ownership action is
   state removal and whose live action is not destroy or replacement. The user
   applies that reviewed source plan.
4. **Re-read evidence:** confirm the source address is absent, the destination
   address is not already bound, and the live object still exists.
5. **Acquire destination:** generate a fresh destination plan. The expected
   action is import plus any explicitly reviewed in-place convergence, not
   create, delete, or replacement. The user applies that new reviewed plan.
6. **Prove convergence:** generate fresh plans for every affected root and
   require no unexpected actions.
7. **Clean up deliberately:** import and removed blocks may be retained as
   historical configuration. Remove temporary handoff files only when repository
   convention calls for it and fresh plans remain no-op after cleanup.

If source-first is not acceptable because the temporary management gap is too
risky, stop and design a provider-specific maintenance window. Do not silently
reverse the order and accept dual state ownership.

## Plan Review Contract

Report exact addresses, not only `N to add, M to change, K to destroy` totals.
A replacement contributes both an add and a destroy.

For each root, classify every action as one of:

- expected import or state-only removal;
- expected in-place convergence;
- unexpected create, destroy, replacement, or unrelated drift;
- unknown until apply because the provider/API validates semantics server-side.

A successful `fmt`, `validate`, or plan does not prove that a provider API will
accept IAM bindings, logging filters, or other server-side constraints. Preflight
the execution principal's read and write permissions and check primary provider
or API constraints when a new resource type is introduced.

## Saved Plan Rules

A saved plan is an apply artifact, not a reusable review summary.

- Connect approval to one exact commit and one exact saved-plan artifact.
- Preserve the same absolute working path, operating system, architecture,
  Terraform version, provider plugins, initialized directory, and relevant
  credential scope between plan and apply when the automation contract requires
  them.
- Use the repository wrapper consistently. If `-chdir` or relative plan paths are
  involved, show the exact plan and apply invocations and resolve the artifact
  path before handoff.
- Protect plan artifacts. HashiCorp documents that they can include the full
  configuration, state, and variable values; never commit, print, or casually
  archive them.
- Invalidate the saved plan after any configuration, state, provider, execution
  environment, credential-scope, or partial-apply change.
- A speculative review plan is not an apply artifact. Generate the apply plan
  from the approved delivery flow after merge when that is the repository
  contract.

## Partial Apply Recovery

Do not blindly retry the failed job.

1. Confirm the job/process ended and identify whether its lock was released.
2. Read the bounded job trace to list completed, failed, and not-started
   addresses. Do not rely only on the final summary.
3. Compare current configuration, state addresses, and live object existence.
4. Generate a fresh plan from the exact intended commit and normal wrapper.
5. Classify stale imports, already-completed actions, new drift, and any
   replacement or destruction.
6. Correct configuration or handoff blocks only after the current owner is
   proven, then request a new reviewed plan and user-operated apply.

Do not use `-lock=false` to bypass contention. Use `force-unlock` only when the
user has proven the lock belongs to their failed operation and no writer remains;
the agent provides the command but does not run it.

## Handoff Packet

```text
State handoff:
- Source root/backend/address:
- Destination root/backend/address:
- Provider object ID:
- Live existence evidence:
- Expected source plan:
- Expected destination plan:
- Apply order and temporary gap:
- Saved-plan invocation/path:
- Runner/API prerequisites:
- Recovery stop conditions:
- Cleanup and final no-op proof:
```

## Primary Evidence

- HashiCorp import overview:
  <https://developer.hashicorp.com/terraform/language/import>
- HashiCorp `removed` block reference:
  <https://developer.hashicorp.com/terraform/language/block/removed>
- HashiCorp `moved` block reference:
  <https://developer.hashicorp.com/terraform/language/block/moved>
- HashiCorp plan and automation guidance:
  <https://developer.hashicorp.com/terraform/cli/commands/plan>
  <https://developer.hashicorp.com/terraform/tutorials/automation/automate-terraform>
- HashiCorp state locking:
  <https://developer.hashicorp.com/terraform/language/state/locking>
- Google Cloud cross-configuration guidance:
  <https://docs.cloud.google.com/docs/terraform/best-practices/cross-config-communication>
