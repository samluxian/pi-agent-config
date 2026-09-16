---
id: runner-identity-for-artifact-registry
title: Authorize a Kubernetes CI runner to push to Artifact Registry
type: fundamental
status: verified
topic: cloud-identity
summary: A Kubernetes CI job can use its service account and Workload Identity Federation to obtain short-lived credentials while repository-level IAM authorizes Artifact Registry pushes.
when_to_read: Configuring a GitLab Kubernetes runner to push images to Artifact Registry without a service account key, or diagnosing token-versus-IAM failures.
keywords: [artifact-registry, gitlab-runner, iam, kubernetes-service-account, workload-identity]
aliases: [runner-adc, registry-writer, keyless-ci-auth]
scope: public-source
created: 2026-09-16
updated: 2026-09-16
---

# Authorize a Kubernetes CI runner to push to Artifact Registry

## TL;DR

Set the GitLab Runner Kubernetes executor's job-pod service account to a dedicated
Kubernetes ServiceAccount. Use Workload Identity Federation for GKE to represent
that workload directly where supported, or link it to one IAM service account
when impersonation is required. Grant only the pushing principal
`roles/artifactregistry.writer` on the target repository. Configure
`docker-credential-gcr` for the required registry host so the build process uses
Application Default Credentials (ADC). [S1] [S2] [S3] [S4]

Authentication and authorization are separate: obtaining ADC does not prove the
principal can push to a repository.

## When To Read

- Use when a Kubernetes-executor CI job must push an image without a JSON key.
- Use when a helper obtains a token but the registry denies upload.
- Use when deciding whether the runner, job pod, or deployment workload owns a
  cloud identity.
- Do not use this note to mutate runner, IAM, or registry configuration through an
  agent; those remain platform-owner actions.

## Knowledge

### Identity Path

```text
GitLab Runner
  → job pod using example-runner-job
  → GKE metadata server / Workload Identity Federation
  → direct workload principal or impersonated IAM service account
  → repository-level Artifact Registry Writer role
  → registry.example.test/example-service
```

The Runner `service_account` setting selects the Kubernetes ServiceAccount used
by job/executor pods. [S1] It does not grant Google Cloud permissions.

Google recommends direct federated-principal access where the target API supports
it. When IAM service account impersonation is required, the documented KSA-to-IAM
service-account path needs both the `roles/iam.workloadIdentityUser` binding and
the `iam.gke.io/gcp-service-account` annotation. [S2]

Artifact Registry roles can be scoped to one repository.
`roles/artifactregistry.writer` permits reading and writing artifacts; it should
not be widened to a project when one repository is the required boundary. [S3]

### Credential Helper

The standalone `docker-credential-gcr` helper discovers credentials through ADC
and can configure selected `LOCATION-docker.pkg.dev` hosts in Docker's
`credHelpers` map. [S4] The helper must be installed on `PATH`, and the Docker
configuration must belong to the user running the build client.

```json
{
  "credHelpers": {
    "us-central1-docker.pkg.dev": "gcr"
  }
}
```

This configuration delegates credential retrieval. It contains no credential,
and it does not replace IAM authorization.

### Validation Sequence

1. Confirm the job pod uses the intended Kubernetes ServiceAccount.
2. Resolve whether access is direct federation or IAM-service-account
   impersonation.
3. Confirm the helper is on `PATH` and the exact registry hostname is configured.
4. Inspect repository-level IAM for the effective principal.
5. Test one bounded push and pull through the intended CI path.
6. Prove an unrelated repository is denied.
7. Confirm no service-account key file is mounted, copied, or stored in CI
   variables.

### Common Mistakes

- Granting a role to the node service account while the job uses workload
  identity.
- Setting a Kubernetes ServiceAccount but omitting its IAM authorization.
- Configuring the wrong regional registry hostname in `credHelpers`.
- Granting project-wide Editor or Owner instead of repository-level Writer.
- Treating a successful ADC token request as proof of registry write access.
- Using the deployment workload's identity for image building without an explicit
  ownership reason.

### Boundaries

- Runner selection, Kubernetes identity, ADC credential delivery, IAM policy, and
  registry repository are separate control layers.
- Direct federation is preferred where supported; impersonation remains a valid
  compatibility path. [S2]
- Public documentation cannot prove a target runner's current identity or IAM
  bindings. Inspect those through bounded, non-secret target evidence.

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [GitLab Runner Kubernetes executor settings](https://docs.gitlab.com/runner/executors/kubernetes/#other-configtoml-settings) | 2026-09-16 | Job-pod Kubernetes ServiceAccount selection |
| S2 | [Authenticate GKE workloads with Workload Identity Federation](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity) | 2026-09-16 | Direct principals, impersonation, required binding, and KSA annotation |
| S3 | [Artifact Registry access control](https://cloud.google.com/artifact-registry/docs/access-control) | 2026-09-16 | Repository-level grants and Artifact Registry Writer semantics |
| S4 | [Artifact Registry Docker authentication](https://cloud.google.com/artifact-registry/docs/docker/authentication#standalone-helper) | 2026-09-16 | ADC-backed standalone helper and registry-host configuration |

## Related Notes

- [Prefer workload identity over service account key files](workload-identity-over-service-account-keys.md)
