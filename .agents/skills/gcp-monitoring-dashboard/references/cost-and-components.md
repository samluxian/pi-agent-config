# Cost And Components

Read this reference when the user asks about dashboard cost, telemetry-source
shutdown, or whether an observability component is necessary.

- Do not assume an OTel Collector, Managed Prometheus, Loki, or GKE sidecar is
  required for a dashboard. Tie each component to a metric, log, or trace
  source used by the dashboard.
- Separate dashboard cost from telemetry cost:
  - Cloud Monitoring dashboard resources have no separate dashboard fee.
  - Google Cloud native metrics are usually not the same cost bucket as
    user-defined metrics, Prometheus, logs, traces, or API reads.
  - Managed Prometheus, logs, traces, and frequent Monitoring API reads can
    materially change cost.
- Answer component-necessity questions from the dashboard's actual metric types
  and monitored resources, not from product naming.

Complete when every cost or removal claim identifies the billing/telemetry
source it affects and no component is declared necessary without a consuming
query, metric, log, or trace.
