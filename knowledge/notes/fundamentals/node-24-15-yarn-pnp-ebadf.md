---
id: node-24-15-yarn-pnp-ebadf
title: Recognize the Node 24.15 and Yarn PnP EBADF regression
type: fundamental
status: verified
topic: ci-pipelines
summary: Node 24.15.x changed ESM loader filesystem behavior in a way that triggered Yarn PnP EBADF failures; Yarn 4.14.1 worked around it and Node 24.16.0 restored compatibility.
when_to_read: Seeing EBADF from fstat in a Yarn PnP ESM loader on Node 24.15.x, especially when the same build worked on Node 24.14.x.
keywords: [ebadf, esm-loader, nodejs, regression, yarn-pnp]
aliases: [bad-file-descriptor-fstat, node-24-15-pnp, yarn-loader-failure]
scope: public-source
created: 2026-09-16
updated: 2026-09-16
---

# Recognize the Node 24.15 and Yarn PnP EBADF regression

## TL;DR

When Yarn PnP fails with `EBADF: bad file descriptor, fstat` under Node 24.15.x,
check the exact Node and Yarn versions before blaming BuildKit, the container
filesystem, or Kubernetes. Yarn reproduced the regression with Node 24.15.0 and
Yarn 4.14.0, then released a workaround in Yarn 4.14.1. Node 24.16.0 restored the
ESM-loader filesystem patchability needed by Yarn. [S1] [S2] [S3] [S4]

## When To Read

- Use when the stack points into Yarn PnP's ESM loader and `fstat` returns EBADF.
- Use when a build changes behavior after moving from Node 24.14.x to 24.15.x.
- Do not apply this diagnosis to other Node majors or unrelated EBADF stacks
  without reproducing the version boundary.

## Knowledge

### Version Boundary

```text
Node 24.14.x + Yarn 4.14.0  → reported working baseline
Node 24.15.x + Yarn 4.14.0  → EBADF regression can reproduce
Node 24.15.x + Yarn 4.14.1  → Yarn workaround available
Node 24.16.0+                → Node-side compatibility restored
```

Yarn issue 7103 ties the failure to an ESM-loader change backported in Node
24.15.0 and includes a 24.14.1 working comparison. [S1] Yarn 4.14.1 widened its
EBADF handling for Node 24.15.x. [S2] Node PR 62835 restored filesystem
patchability for custom loaders and was backported to Node 24.16.0. [S3] [S4]

### Diagnosis

1. Capture exact `node --version` and `yarn --version` values without dumping
   environment variables.
2. Confirm the stack enters Yarn PnP ESM-loader code and ends at `fstat` with
   EBADF.
3. Compare the same source and dependency lock under one known-good version.
4. Change one boundary only: Node to 24.16.0+ or Yarn to a release containing the
   24.15.x workaround.
5. Re-run the failing install/build path, not only a version command.

### Common Mistakes

- Changing BuildKit flags or Kubernetes security context before checking runtime
  versions and the stack owner.
- Disabling PnP or rewriting dependency configuration before testing the upstream
  fixed version.
- Calling every EBADF on Node 24.15.x this regression without matching the Yarn
  loader stack.
- Pinning a temporary workaround indefinitely without recording the upstream fix
  boundary.

### Boundaries

- This note identifies an upstream compatibility mechanism, not target-state
  proof.
- Node 24.16.0 is the Node-side fix boundary documented by the release and
  backport; later versions still require normal application compatibility tests.
- Yarn releases after the workaround can change their version gate. Yarn 4.16.0
  removed the workaround for Node 24.16.0 and later; check current release notes
  when upgrading. [S5]

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [Yarn issue 7103](https://github.com/yarnpkg/berry/issues/7103) | 2026-09-16 | Reproduction, stack signature, and Node 24.14.1 versus 24.15.0 boundary |
| S2 | [Yarn 4.14.1 release](https://github.com/yarnpkg/berry/releases/tag/%40yarnpkg%2Fcli%2F4.14.1) | 2026-09-16 | Yarn workaround for the Node 24.15 EBADF behavior |
| S3 | [Node PR 62835](https://github.com/nodejs/node/pull/62835) | 2026-09-16 | ESM-loader filesystem patchability fix and v24.16.0 backport |
| S4 | [Node 24.16.0 release](https://nodejs.org/en/blog/release/v24.16.0) | 2026-09-16 | Node release containing the compatibility fix |
| S5 | [Yarn 4.16.0 release](https://github.com/yarnpkg/berry/releases/tag/%40yarnpkg%2Fcli%2F4.16.0) | 2026-09-16 | Removal of the workaround for Node 24.16.0 and later |

## Related Notes

- [Build and push images with rootless BuildKit in GitLab CI](rootless-buildkit-in-gitlab-ci.md)
