# Reviewer Planning Contract

Use this reference after the final edit and before invoking reviewer.

## Repository Scope

Build one row per changed Git repository. Record its final changed paths,
existing user-change boundary, intended behavior, and validation gaps. Invoke one
final reviewer per repository with that repository root as `cwd`. A semantic
`pass` clears only that repository. Use `reviewMode: partial` for sharded evidence
that must not clear the gate and `reviewMode: final` for repository completion.

## Validation Matrix

For each changed path, map:

```text
path -> risk -> cheapest behavior proof -> mandatory command -> heavy unit
```

A remote Terraform plan, full Helm render, build, or test suite is one heavy
unit. Keep one reviewer to at most three independent heavy units. Split a larger
matrix before invocation. Prefer changed/new YAML, targeted contracts, and exact
behavior renders over all-profile or all-wrapper baseline reruns. A fresh review
must inspect the complete final diff, but it need not rerun every expensive
unchanged baseline check.

Resolve immutable inputs before reviewer. Give it exact chart source/package,
hash, Terraform root/environment, namespace, application, and other identifiers.
Do not spend reviewer time discovering private-package authentication paths.

## Failure Scope

Continue independent safe validation units after a root-local command or output
classification failure. Stop related units when shared authentication, state
lock, backend, ownership, or safety failure makes their evidence unreliable.
Never retry authentication or lock failures without a new decision.

Terraform no-op is proven by either:

```text
No changes. Your infrastructure matches the configuration.
```

or an explicit zero add/change/destroy summary with no replacement or error.

## Time Budget

Reviewer has a five-minute hard deadline. Require mandatory commands to finish
within four minutes and reserve the final minute for bounded findings. If the
matrix cannot fit, shard before invocation instead of waiting for timeout.
