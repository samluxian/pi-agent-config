# IAM Review Checklist

Use for `newaile/service-account-iam` and `newaile/user-access` changes.

## Evidence to collect

- Target service path and environment.
- Exact project ID from `newaile/modules/defaults/main.tf`.
- Terraform resource type:
  - `google_service_account`
  - `google_service_account_iam_member`
  - `google_project_iam_member`
- Exact IAM member string.
- Exact role string.

## Review questions

1. Is this for a human user, group, Google service account, or Kubernetes
   workload identity member?
2. Is the environment correct: `dev`, `qa`, `uat`, `prod`, or `infra`?
3. Is the member string well formed?
4. Is the role least-privilege for the stated task?
5. Does this grant access to production or infra?
6. Does the plan include removal of existing access?

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

Current service account IAM uses this pattern:

```hcl
member = "serviceAccount:${module.defaults.project_id}.svc.id.goog[newaile/${each.key}]"
```

Before adding a service, confirm the Kubernetes namespace and KSA name should be
`newaile/<service-key>`. Do not infer namespace or KSA from naming alone if the
user asks for deployment truth.

## Safer report format

```text
IAM change:
- Env/project:
- Member:
- Role:
- Resource address:
- Plan action:
- Risk:
- Safer alternative if applicable:
```
