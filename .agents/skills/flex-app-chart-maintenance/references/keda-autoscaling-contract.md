# KEDA Autoscaling Contract

Read this reference only when changing KEDA or event-driven autoscaling.

- CPU and memory profiles render native KEDA triggers with explicit metric type
  and target utilization.
- If KEDA autoscaling is enabled by default, enable one safe default trigger so
  the default render is valid.
- Keep `scaleTargetRef` internal while `flex-app` supports only Deployment
  targets.
- Keep scale-to-zero fields such as `idleReplicaCount` out of recommended
  defaults unless scale-to-zero is part of the public contract.
- Pub/Sub scales on subscription backlog. Service values own subscription
  identity and thresholds; `global.gcpProjectId` may provide project plumbing.
- Keep one shared `autoscaling.authenticationRef` unless a demonstrated caller
  needs per-trigger authentication.
- Render `authenticationRef` on each trigger, not at ScaledObject spec root.
- Never render an ordinary HPA and KEDA ScaledObject for the same target.

Recommended Pub/Sub shape:

```yaml
autoscaling:
  profiles:
    pubsub:
      enabled: true
      subscriptions:
        - name: aile-message-sub
          threshold: 10
          activationThreshold: 0
      threshold: 1
      activationThreshold: 0
```

Validation is complete when exactly one ScaledObject renders, no competing HPA
exists, replica bounds and thresholds match values, the project source is
correct, and authentication is present on every trigger.
