# Rootless BuildKit Adapter

Use daemonless rootless BuildKit when a Dockerfile build is required and the
runner supports the required non-root security context.

## Contract

- Pin the BuildKit job image by digest when repository policy supports it.
- Run `buildctl-daemonless.sh` and push with an image output; do not start a Docker
  daemon or privileged Docker-in-Docker service.
- Treat `--oci-worker-no-process-sandbox` as a Kubernetes workaround with reduced
  isolation, not as a harmless default. Require the runner/platform owner to
  confirm the permitted security profile.
- Put Docker-compatible `credHelpers` in the executing user's Docker config and
  ensure the helper binary is on `PATH`. Prefer ADC-backed short-lived
  credentials.
- Download tools only at exact versions and verify a publisher-provided checksum,
  or use a reviewed job image that already contains them.
- Maintain `.dockerignore` so credentials, `.git`, package caches, test outputs,
  local environment files, and unrelated build artifacts never enter the context.

## Minimal Shape

```yaml
build-image:
  image: moby/buildkit:rootless@sha256:<verified-digest>
  variables:
    BUILDKITD_FLAGS: --oci-worker-no-process-sandbox
  script:
    - mkdir -p "$HOME/.docker"
    - <configure-reviewed-credential-helper>
    - buildctl-daemonless.sh build \
        --frontend dockerfile.v0 \
        --local context=. \
        --local dockerfile=. \
        --output "type=image,name=registry.example.test/service:${CI_COMMIT_SHA},push=true"
```

This example is structural. Discover the actual registry, image, digest, helper,
security context, and tag contract from the target repository and runner owner.

## Validation

Check YAML with duplicate-key rejection, shell syntax for extracted script blocks,
Dockerfile inputs, `.dockerignore`, image/helper pinning, and the CI DAG. A local
parse cannot prove rootless kernel support, security-policy admission, ADC
identity, registry authorization, or a successful push.

## Public References

- BuildKit rootless deployment and security tradeoffs:
  https://github.com/moby/buildkit/blob/9bc3354b43dd7a5cb70984fabf6a2730afa58038/docs/rootless.md
- BuildKit image registry output:
  https://github.com/moby/buildkit/blob/9bc3354b43dd7a5cb70984fabf6a2730afa58038/README.md#imageregistry
- GitLab Kubernetes executor security profiles:
  https://docs.gitlab.com/runner/executors/kubernetes/#set-a-security-policy-for-the-container
- Docker build-context exclusions:
  https://docs.docker.com/build/building/context/#dockerignore-files
