# LB/NEG Service Rename

Use this when a Kubernetes Service name changes and the GCP Load Balancer backend must move from the old Service NEG to the new Service NEG.

## Goal

Answer these questions with minimal evidence:

- Does the new Service exist in the intended cluster and namespace?
- Did GKE create the new standalone NEG from the Service annotation?
- Does the GCP Backend Service still point at the old NEG, the new NEG, or both?
- Are healthy endpoints present, or is the UI showing `0/0` because the NEG is empty?
- Can the old Service or old backend group be removed safely by the user?

## Context Guard

Before live checks, verify context and project:

```bash
kubectl config current-context
gcloud config get-value project
```

Use explicit `--context` and `--project` when the user is switching environments frequently.

## Read-Only Checks

Check Services first:

```bash
kubectl --context <context> -n <namespace> get svc <new-service> <old-service> -o wide
kubectl --context <context> -n <namespace> get svc <new-service> -o yaml
```

Interpretation:

- If the new Service does not exist, the new NEG cannot exist yet.
- If the old Service still exists and has the same selector, the old NEG can still be healthy and carry traffic.
- If both Services exist and select the same pods, both NEGs may have the same endpoint.

Check endpoints:

```bash
kubectl --context <context> -n <namespace> get endpoints,endpointslice -l app.kubernetes.io/instance=<app> -o wide
```

Check NEGs:

```bash
gcloud compute network-endpoint-groups list \
  --project=<project> \
  --filter='name~"<namespace>-<app>"' \
  --format='table(name,zone,networkEndpointType,size)'
```

Check backend binding:

```bash
gcloud compute backend-services list \
  --project=<project> \
  --global \
  --filter='backends.group~"<app>" OR name~"<app>|bff"' \
  --format='table(name,protocol,loadBalancingScheme,backends[].group)'
```

Check health:

```bash
gcloud compute backend-services get-health <backend-service> \
  --project=<project> \
  --global \
  --format=json
```

## Interpreting `0/0`

`0/0` usually means the backend group has no endpoints to evaluate. It is not proof that traffic is healthy.

Common cases:

- New NEG has `size 1` in one zone and `size 0` in other zones: normal when pods only run in one zone.
- Old NEG has `size 0` in all zones: old Service is gone or no longer selects pods.
- Old NEG has `size 1` and shows healthy: old Service still exists and still selects the pods.
- Backend health output has no `healthStatus`: the backend group is empty.

## Safe Cutover Order

Do not remove old backend groups first.

User-operated order:

1. Ensure new Service exists with `cloud.google.com/neg` annotation.
2. Wait for the new NEG to appear.
3. Add or replace the Backend Service backend group with the new NEG.
4. Confirm the new NEG has healthy endpoints.
5. Remove the old NEG backend group.
6. Remove the old Service only after traffic is confirmed on the new backend and GitOps desired state will not recreate it.

## Reporting

Use this shape:

```text
結論:
- LB backend currently points to <old/new/both>.

證據:
- Service: <new exists?>, <old exists?>
- NEG: <new size/health>, <old size/health>
- Backend Service: <bound groups>

下一步:
- <user-operated backend or cleanup action>

風險:
- <traffic/rollback/0 endpoint risk>
```
