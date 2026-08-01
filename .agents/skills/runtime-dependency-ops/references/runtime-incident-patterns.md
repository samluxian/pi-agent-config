# Runtime Incident Patterns

## One Pod Degraded, Sibling Pods Healthy

Likely causes:

- transient external dependency reachability;
- node or pod network path issue;
- HPA or rollout replacement window;
- startup dependency timeout without application retry.

Do not call it a global config failure unless all pods using the same
image/config fail or the config/render evidence shows a shared wrong value.

## Database Startup Failure

Common log shape:

```text
ping database failed
server selection error
context deadline exceeded
ReplicaSetNoPrimary
```

Interpretation:

- Image pull and scheduling may be healthy.
- The process exits because application startup depends on database reachability.
- If another pod with same Deployment/image/config is healthy, prefer transient
  network or database reachability evidence over config blame.

## Worker Lease Acquired, Worker Still Fails

Common flow:

```text
successfully acquired lease <namespace>/<lease-name>
worker acquired lease
worker stopped with dependency error
```

Interpretation:

- Lease acquisition only means the pod became leader.
- The error happens after leader election, inside worker dependency handling.
- Check queue project/account, subscription/consumer, topic, filter/routing,
  deadletter policy, and service account IAM before blaming Kubernetes.

## HPA Makes A Problem Appear To Self-Heal

If a degraded pod disappears and a new healthy pod appears:

- Check HPA events for scale actions.
- Check ReplicaSet events for deleted and created pods.
- Compare old and new node names.

This is replacement, not proof the original pod recovered.
