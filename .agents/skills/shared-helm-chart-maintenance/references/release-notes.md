# Flex App Release Notes

Read this reference after chart contract proof when authoring a `flex-app`
release note, and from `$helm-dependency-upgrade` when consuming published
notes for an upgrade plan.

## Evidence Gate

Establish these inputs before writing:

- target chart repository and clean/dirty state
- exact previous released tag and target tag or release commit
- `Chart.yaml` version and the full changed-file list for that range
- material values, schema, helper, template, default, and render differences
- accepted and rejected validation cases, including skipped gates
- release MR or issue and any evidence-backed originating project

A project driver such as VoiceHub may be named when supplied by the user, MR,
issue, or repository evidence. Explain how the project-specific need became a
reusable shared-chart capability. Do not infer a project name from workload,
branch, or resource naming alone.

Release notes are intent and communication evidence. Chart sources, effective
values, render output, and live compatibility remain authoritative. Do not turn
a commit subject into a compatibility claim without proving the behavior.

## Productized Note Contract

Lead with the service-owner outcome rather than a file list. Use the requested
language; default to concise Traditional Chinese when the user is communicating
in Chinese. Keep Kubernetes and values identifiers exact.

A complete note contains only applicable sections:

1. `版本摘要`
   - originating product need when evidence-backed
   - reusable capability and the operational problem it solves
   - a visible breaking-change warning when migration is required
2. `新增` / `變更` / `修正`
   - practical use cases before values or template details
   - non-secret examples that match the schema and rendered contract
   - security and ownership defaults such as explicit ServiceAccount or secret
     inheritance boundaries
3. `不相容變更`
   - removed or changed values, before/after configuration, affected callers,
     and the exact failure or rendered effect
   - rationale and tradeoff: distinguish availability, maintenance
     operability, security, cost, and controller behavior
4. `相容性與影響範圍`
   - unchanged callers and resource contracts
   - intermediate branches, commits, or proposals that are not in the release
5. `已知限制`
   - include only deterministic defects or validation gaps; state the affected
     input and safe adoption boundary
6. `升級建議`
   - bounded actions in execution order with a render or compatibility check

Include compare and MR links when verified. Do not claim zero downtime,
backward compatibility, or production safety merely because lint passed. For a
single-replica PDB tradeoff, state separately whether a setting improves
maintenance progress or service availability.

## Authoring Flow

1. Compare the complete release range, not only the feature commit title.
2. Build a private evidence table:

```text
claim -> values/schema/template evidence -> rendered effect -> caller impact
```

3. Classify every material difference as added, changed, fixed, breaking,
   known limitation, or intentionally not included.
4. Draft the public Markdown without raw manifests, secrets, internal tokens,
   or unsupported implementation promises.
5. Re-read the note against the diff and validation results. Surface conflicts
   instead of blending them.

Write the draft to a user-approved path. Use `/tmp/<tag>-release-notes.md` when
the note should not modify the chart repository.

## GitLab Publication Boundary

GitLab is read-only for the agent. Inspect an existing release before proposing
a replacement:

```bash
glab release view <tag> -R <group/project> --output json --jq '.description'
```

Preserve valuable existing content and call out whether the operation creates a
new release or replaces an existing description. Provide one user-operated,
single-line command to avoid shell line-continuation whitespace errors:

```bash
glab release create <tag> -R <group/project> --notes-file <release-note.md>
```

Never run release create, update, delete, or publication commands as the agent.
Report missing `glab`, authentication, permissions, release, tag, or remote
freshness as a validation gap.

## Consumer Contract

When a wrapper upgrade consumes a note:

- read every published release note in `(current version, target version]`
- extract breaking changes, defaults, migration actions, tradeoffs, known
  limitations, and explicitly unaffected contracts
- map each extracted claim to the exact chart diff and render evidence
- treat a missing note as `missing release evidence`, not `no changes`
- when a note conflicts with chart source or render output, report the conflict
  and follow source/render truth for the upgrade decision

The note may explain why a change exists; it does not replace wrapper-specific
values, app-of-apps globals, immutable-selector, or live compatibility checks.
