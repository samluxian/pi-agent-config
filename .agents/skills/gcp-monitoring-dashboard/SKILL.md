---
name: gcp-monitoring-dashboard
description: "Design, diagnose, or maintain GCP Cloud Monitoring dashboards, dashboard JSON/Terraform, metric queries, filters, metrics scopes, and cost/component requirements."
---

# GCP Monitoring Dashboard

## Overview

Use this skill to make Cloud Monitoring dashboard work repeatable and safe:
identify the data source, validate metric descriptors before changing filters,
choose the management path, and separate dashboard cost from the monitored
systems that generate metrics.

## Workflow

1. Establish authority and scope.
   - Identify the scoping project, dashboard ID or display name, target
     monitored projects, intended environment, and whether the source of truth
     is Console, exported JSON, Terraform, or another repo artifact.
   - If live GCP mutation is needed, provide a user-operated command. Do not run
     `gcloud monitoring dashboards create`, `update`, or `delete`.
   - Completion criterion: project, dashboard identity, source of truth, and
     mutation boundary are explicit.

2. Inspect inputs before editing.
   - Read the current dashboard JSON or Terraform resource when available.
   - Check metrics scope when cross-project metrics are expected.
   - Check metric descriptors for every metric type used by changed widgets,
     especially label `valueType`.
   - Completion criterion: every changed query has a known metric type,
     resource type, label set, and label type.

3. Design the dashboard as an operator view.
   - Prefer a small set of actionable widgets: traffic, errors, error rate,
     latency percentiles, saturation, and dependency/back-end latency.
   - Use dashboard filters for dimensions the operator will actually switch,
     such as `resource.labels.url_map_name`, project, cluster, namespace, or
     service. Remove filters that no chart references.
   - Completion criterion: every widget has a reason to exist and every filter
     affects at least one chart.

4. Choose the update path.
   - For repo-managed dashboards, use `tf-services-terraform-maintenance` before
     editing Terraform and keep the plan scoped to the dashboard service.
   - For one-off updates, produce an exported JSON plus a user-operated
     `gcloud monitoring dashboards update` command that preserves the current
     `etag`.
   - For diagnosis only, do not edit files unless the user approves.
   - Completion criterion: the chosen path cannot accidentally create a
     duplicate dashboard or destroy unrelated IAM/dashboard resources.

5. Verify the change.
   - Validate JSON with `jq empty` when a dashboard JSON file changes.
   - Run `git diff --check` for repo changes.
   - For risky filters, test the filter with Cloud Monitoring time series API or
     the closest available read-only command before claiming the query is valid.
   - Completion criterion: syntax checks pass and changed query filters are
     type-compatible with their metric descriptors.

## References

- Read `references/dashboard-workflow.md` when selecting JSON vs Terraform vs
  gcloud management, or when producing user-operated commands.
- Read `references/metric-query-pitfalls.md` when debugging dashboard query
  errors, changing filters, or using load balancer, GKE, Prometheus, or
  application metrics.
- Read `references/cost-and-components.md` only when the user asks about cost,
  telemetry-source shutdown, or whether a collector, sidecar, or monitoring
  component is necessary.
