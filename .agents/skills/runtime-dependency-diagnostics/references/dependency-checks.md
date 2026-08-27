# Dependency Checks

All checks are read-only. Never print secret values.

## Kubernetes

Start compact:

```bash
kubectl get deploy,hpa,pod -n <namespace> -l app.kubernetes.io/name=<service> -o wide
kubectl get events -n <namespace> --sort-by=.lastTimestamp | rg '<service>|BackOff|Failed|Unhealthy|Killing'
```

For worker services, check leases:

```bash
kubectl get lease -n <namespace>
kubectl get lease -n <namespace> <lease-name> -o yaml
```

Important lease fields:

- `holderIdentity`: current leader pod.
- `renewTime`: current leader heartbeat.
- `leaseDurationSeconds`: expiration threshold.
- `leaseTransitions`: leader handoff count.

## ServiceAccount And IAM

For GKE Workload Identity, check the KSA annotation:

```bash
kubectl get sa -n <namespace> <service-account> -o yaml
```

Then check IAM metadata for the cloud service account:

```bash
gcloud projects get-iam-policy <project> \
  --flatten='bindings[].members' \
  --filter='bindings.members:<service-account-email>' \
  --format='table(bindings.role,bindings.members)'
```

Do not suggest broad roles such as Owner or Editor as target state. If the live
role is broad, report it as evidence and recommend least-privilege review.

## Secret Manager

Only check metadata and references:

```bash
gcloud secrets describe <secret> --project=<project>
gcloud secrets versions list <secret> --project=<project> --limit=5
```

Do not access secret payloads.

## Databases

Discover endpoints from desired state, mounted config references, application
config names, or logs. Do not reuse another environment's endpoint.

Useful MongoDB signals:

- `ReplicaSetNoPrimary`
- `server selection error`
- `context deadline exceeded`
- all Atlas hosts shown as `Type: Unknown`

If only one pod fails while sibling pods with the same image/config work,
prioritize pod/node/network path or transient database reachability before
global config blame.

## Pub/Sub Or Queues

For Pub/Sub, verify topic and subscription together:

```bash
gcloud pubsub topics describe <topic> --project=<project>
gcloud pubsub subscriptions describe <subscription> --project=<project> \
  --format='yaml(name,topic,filter,ackDeadlineSeconds,deadLetterPolicy,expirationPolicy,labels)'
```

Checks that matter:

- Subscription exists in the same project/account the app uses.
- `topic` points to the expected topic.
- `filter` matches the worker route/resource attributes.
- `deadLetterPolicy.deadLetterTopic` points to the expected deadletter topic
  when deadlettering is required.
- Service account has enough queue permissions.

Do not conclude "subscription is healthy" until filter/routing and deadletter
policy have also been checked.

## Redis / Memorystore / Valkey

Discover host and port from live config or desired state. Do not assume Redis,
Memorystore, and Valkey are interchangeable; report which product/resource is
actually used.

Compact GCP checks:

```bash
gcloud redis instances list --project=<project> --region=<region>
gcloud memorystore instances list --project=<project> --location=<location>
```

Use whichever command is supported by the installed cloud CLI and report missing
CLI components as a validation gap.

For historical Cloud Monitoring queries, first request a small `HEADERS` view for
one known metric. Read the returned monitored-resource labels, then use the exact
instance resource identifier in the bounded value query. An empty query with a
short instance name is a filter-validation gap, not evidence that no metric data
exists.

## Buckets

Check bucket existence and IAM metadata only:

```bash
gcloud storage buckets describe gs://<bucket>
gcloud storage buckets get-iam-policy gs://<bucket> --format='table(bindings.role,bindings.members)'
```

Do not list object contents unless the user specifically asks and object names
are not sensitive for the task.
