---
id: rootless-buildkit-in-gitlab-ci
title: Build and push images with rootless BuildKit in GitLab CI
type: fundamental
status: verified
topic: ci-pipelines
summary: GitLab CI can run daemonless rootless BuildKit and push directly to a registry when runner security policy, credential helpers, and build context are configured explicitly.
when_to_read: Replacing Docker-in-Docker, configuring a Kubernetes executor image build, or diagnosing rootless BuildKit startup and registry authentication.
keywords: [buildkit, gitlab-ci, kubernetes-executor, rootless, registry]
aliases: [buildctl-daemonless, rootless-image-build, no-dind]
scope: public-source
created: 2026-09-16
updated: 2026-09-16
---

# Build and push images with rootless BuildKit in GitLab CI

## TL;DR

Use the `moby/buildkit:rootless` image and `buildctl-daemonless.sh` to start an
ephemeral daemon and run the client without Docker-in-Docker. Push with
`--output type=image,name=registry.example.test/example-service:build-123,push=true`. [S1] [S2]

On Kubernetes, `--oci-worker-no-process-sandbox` is a documented workaround, not
a harmless default. BuildKit warns that it weakens process isolation and can
leave processes outside normal termination control. The runner owner must approve
the compatible security profile. [S1]

## When To Read

- Use when a Dockerfile build must run without a Docker daemon.
- Use when BuildKit rootless startup fails under a Kubernetes executor.
- Use when registry authentication must use a Docker credential helper.
- Do not use when Jib or another daemonless language-native builder already owns
  the image contract.

## Knowledge

### Execution Model

`buildctl-daemonless.sh` starts `buildkitd`, waits for it, runs `buildctl`, and
stops the daemon for the job. The rootless image uses RootlessKit when the process
runs as a non-root user. [S1]

```yaml
build-image:
  image: moby/buildkit:rootless@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  variables:
    BUILDKITD_FLAGS: --oci-worker-no-process-sandbox
  script:
    - buildctl-daemonless.sh build \
        --frontend dockerfile.v0 \
        --local context=. \
        --local dockerfile=. \
        --output "type=image,name=registry.example.test/service:${CI_COMMIT_SHA},push=true"
```

The digest, registry, tag, and flag must come from the target's reviewed contract.
GitLab recommends digest-pinning CI images for integrity. [S6]

### Kubernetes Security Boundary

BuildKit documents `--oci-worker-no-process-sandbox` for Kubernetes environments
that cannot provide Docker's equivalent system-path relaxation. It also warns
that build processes can interact with processes in the daemon container and that
leftover `ExecOp` processes cannot be terminated normally. [S1]

GitLab's rootless BuildKit Kubernetes example uses non-root execution with
unconfined seccomp and AppArmor profiles. [S3] Cluster policy may reject those
profiles. Do not work around rejection by silently switching to privileged
Docker-in-Docker.

### Registry Credentials

Docker `credHelpers` maps one registry hostname to a helper suffix. [S4] The
helper executable must be on `PATH`, and the Docker config must be visible to the
BuildKit process. Prefer an ADC-backed helper and short-lived workload identity;
do not place raw credentials in the Dockerfile, build arguments, or context.

### Build Context

Docker removes `.dockerignore` matches before sending the build context. [S5]
Exclude at least VCS metadata, local environment files, credentials, dependency
caches, test reports, and build outputs that the Dockerfile does not consume.
This reduces transfer size and prevents accidental `COPY` access; it does not
remove a secret already embedded in an included source file.

### Validation

- Parse CI YAML with duplicate-key rejection.
- Confirm the BuildKit image reference uses a reviewed digest and downloaded
  helpers use exact versions with publisher-provided checksum verification. [S6]
- Confirm the runner permits the required non-root security profile.
- Inspect `.dockerignore` against actual Dockerfile `COPY` inputs.
- Confirm the credential helper host exactly matches the output registry.
- Validate that no Docker daemon service or privileged DinD dependency remains.
- Use pipeline evidence to prove rootless startup and an actual registry push.

### Common Mistakes

- Treating `--oci-worker-no-process-sandbox` as a generic security improvement.
- Configuring credentials under a different user's `$HOME`.
- Using a mutable BuildKit tag without reviewing the digest.
- Downloading a helper at runtime without a fixed version and checksum.
- Sending `.git`, package caches, or credential files in the build context.
- Assuming YAML and shell parsing proves kernel, admission, ADC, or registry
  behavior.

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [BuildKit rootless mode](https://github.com/moby/buildkit/blob/9bc3354b43dd7a5cb70984fabf6a2730afa58038/docs/rootless.md) | 2026-09-16 | Rootless image, Kubernetes flags, and process-sandbox risks |
| S2 | [BuildKit image and registry output](https://github.com/moby/buildkit/blob/9bc3354b43dd7a5cb70984fabf6a2730afa58038/README.md#imageregistry) | 2026-09-16 | `type=image`, image naming, and direct push |
| S3 | [GitLab Kubernetes executor security policy](https://docs.gitlab.com/runner/executors/kubernetes/#set-a-security-policy-for-the-container) | 2026-09-16 | Rootless BuildKit security-context example |
| S4 | [Docker credential helpers](https://docs.docker.com/reference/cli/docker/login/#credential-helpers) | 2026-09-16 | Registry-specific `credHelpers` behavior |
| S5 | [Docker build context and `.dockerignore`](https://docs.docker.com/build/building/context/#dockerignore-files) | 2026-09-16 | Excluding files before context transfer |
| S6 | [GitLab pipeline security](https://docs.gitlab.com/ci/pipeline_security/#docker-images) | 2026-09-16 | Digest pinning and downloaded-tool checksum guidance |

## Related Notes

- [Authorize a Kubernetes CI runner to push to Artifact Registry](runner-identity-for-artifact-registry.md)
