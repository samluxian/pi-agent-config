---
name: application-ci-delivery
description: Design or maintain isolated application image build and GitOps handoff pipelines using Jib or rootless BuildKit. Use for service-owned GitLab CI build identity, registry, DAG, and fleet separation. Do not use for shared runners, platform provisioning, shared charts, or live incident diagnosis.
---

# Application CI Delivery

Deliver an application image through an isolated CI path without changing an
existing environment's runner, authentication, image, or deployment behavior.
Use repository evidence and the matching adapter in `references/`.

## Boundary

This skill owns application-repository CI, build configuration, build context,
and service-owned handoff variables. It does not own runner installation,
Kubernetes ServiceAccount or IAM provisioning, registry creation, shared chart
APIs, or live infrastructure. Treat those as prerequisites and route platform
changes to their owning workflow.

Follow `analyze -> propose bounded patch and validation -> wait for approval ->
edit`. Never read credentials or prove authorization by printing tokens.

## Discovery

1. Recheck the target repository branch, status, staged changes, and callers.
2. Identify every existing environment path and preserve its behavior explicitly.
3. Select one build adapter:
   - Gradle/Maven Jib: read `references/jib.md`.
   - Dockerfile: read `references/rootless-buildkit.md`.
4. Resolve these contracts from repository evidence; never invent values:
   - runner selector and job image;
   - workload identity/ADC prerequisite and effective registry host;
   - image repository and immutable tag input;
   - build inputs, outputs, and dependency DAG;
   - GitOps project, ref, configuration path, environment, and fleet selector.
5. For GitLab Kubernetes executor builds that move only some jobs to a dedicated
   pool, identify four separate contracts before choosing the change: runner
   manager placement, default job Pod placement, opt-in build job Pod placement,
   and narrowly allowed scheduling overrides. Runner tags select a runner, not
   a build process inside a Pod. Prefer one shared CI template for repeated
   opt-in build jobs; preserve ordinary job placement. Confirm the node pool
   exists before opt-in jobs run, and validate expanded jobs and rollout order.
   Do not apply this executor-specific pattern to unrelated CI systems.
6. Query the LLM Wiki for stable mechanisms when identity, BuildKit, Jib, or a
   known toolchain failure is involved. Wiki notes are precedent, not proof of
   the target's current configuration.
7. Before choosing validation commands, perform a bounded capability preflight
   for repository wrappers and required parsers/CLIs. Record unavailable tools
   once and use the narrowest available alternative; do not repeatedly probe or
   install tools during the task.

For the first repository in an unfamiliar layout, inspect the full path. For a
second similar repository, compare the differences. From the third demonstrated
same-layout case onward, use this fast path first: status, CI job blocks, build
configuration, ignore file, and handoff variables. Expand discovery only when a
contract differs or evidence is missing.

## Isolation Contract

- Keep legacy and new environment jobs explicit; do not rely on inherited fleet,
  registry, runner, or authentication defaults across trust boundaries.
- A new build path depends only on prerequisites it actually consumes. It must
  not wait for or reuse a legacy image build unless reuse is an explicit
  requirement.
- Build and deploy jobs for one path use the same image identity and handoff
  variables. Make every fleet/environment selector explicit at the job boundary.
- Runner authentication supplies short-lived credentials; authorization remains
  a least-privilege resource-level IAM prerequisite.
- Do not use Docker-in-Docker when Jib or daemonless rootless BuildKit satisfies
  the build contract.
- Keep credential files, VCS metadata, dependency caches, and unrelated outputs
  outside the Docker build context.
- Do not add broad fallback credentials or project-wide IAM roles to make a
  pipeline pass.

## Validation

Before editing, state affected files and success criteria. After editing, run the
smallest checks that exercise the selected adapter and CI graph:

1. parse CI/config with duplicate-key rejection when the available parser
   supports it;
2. inspect the expanded DAG or bounded job relationships;
3. verify each environment path has an explicit runner, registry/image, build
   dependency, and fleet/environment selector;
4. verify build context exclusions and credential-helper placement;
5. run repository-owned build/config checks without exposing credentials;
6. leave actual pipeline, registry push, GitOps reconciliation, and runtime
   behavior as explicit validation gaps until target-system evidence proves them.

## Stop Conditions

Stop and ask for one decision when the requested path needs an unapproved platform
or shared-chart change, the target identity is ambiguous, a required identifier
cannot be discovered safely, credentials would need inspection, or existing
changes overlap the proposed files.

## Output

Report the preserved path, isolated path, selected adapter, changed files,
validation evidence, external prerequisites, and remaining pipeline/runtime gap.
