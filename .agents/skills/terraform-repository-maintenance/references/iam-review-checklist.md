# IAM Review Checklist

Use for service-account, Workload Identity, and human-access Terraform roots.

## Evidence to collect

- Target service path and environment.
- Exact project ID from the target repository's verified defaults source.
- Terraform resource type:
  - `google_service_account`
  - `google_service_account_iam_member`
  - `google_project_iam_member`
- Exact IAM member string.
- Exact role string.
- Terraform execution principal and whether it can read and write the specific
  IAM policy surface required by the provider resource.

## Review questions

1. Is this for a human user, group, Google service account, or Kubernetes
   workload identity member?
2. Is the environment correct: `dev`, `qa`, `uat`, `prod`, or `infra`?
3. Is the member string well formed?
4. Is the role least-privilege for the stated task?
5. Does this grant access to production or infra?
6. Does the plan include removal of existing access?
7. Does the Terraform runner have both read and write policy permissions needed
   by this resource type, such as `getIamPolicy` and `setIamPolicy` on the exact
   project, service account, bucket, or logging surface?
8. Are runner prerequisites being kept separate from the IAM granted to the
   workload or human subject?

## High-risk role patterns

Flag and explain before proposing or approving:

```text
roles/owner
roles/editor
roles/resourcemanager.projectIamAdmin
roles/iam.serviceAccountAdmin
roles/iam.serviceAccountKeyAdmin
roles/secretmanager.admin
roles/storage.admin
roles/container.admin
```

High-risk does not always mean wrong, but it requires a clear reason, scope, and
reviewer acknowledgement.

## Workload Identity member pattern

A typical service account IAM member uses this shape:

```hcl
member = "serviceAccount:${module.defaults.project_id}.svc.id.goog[${var.namespace}/${each.key}]"
```

Before adding a service, confirm the Kubernetes namespace and KSA name from the
target repository and deployed identity contract. Do not infer either value from
naming alone.

## Safer report format

```text
IAM change:
- Env/project:
- Member:
- Role:
- Resource address:
- Plan action:
- Runner prerequisite:
- Risk:
- Safer alternative if applicable:
```
