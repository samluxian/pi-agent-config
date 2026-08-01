# Metric query pitfalls

## Descriptor first

Before changing filters, inspect the metric descriptor:

- `metricKind` and `valueType` determine valid alignment and aggregation.
- `metric.labels[].key` and `metric.labels[].valueType` determine valid filter
  operators.
- `monitoredResourceTypes` determine the correct `resource.type` and
  `resource.labels.*` keys.

Completion criterion: every edited filter uses a label that exists and an
operator compatible with that label's type.

## Regex only on strings

Cloud Monitoring regex restrictions apply to string fields. Do not use
`monitoring.regex.full_match()` on integer labels.

Example: for HTTPS load balancer request counts,
`metric.labels.response_code_class` is an integer class. Use equality:

```text
metric.label."response_code_class"=500
```

or an OR group:

```text
(metric.label."response_code_class"=400 OR metric.label."response_code_class"=500)
```

Do not write:

```text
metric.labels.response_code_class = monitoring.regex.full_match("400|500")
```

## Load balancer dashboard checks

For external HTTPS load balancer dashboards, common native metrics include:

- `loadbalancing.googleapis.com/https/request_count`
- `loadbalancing.googleapis.com/https/total_latencies`
- `loadbalancing.googleapis.com/https/backend_latencies`

Common resource type:

```text
resource.type="https_lb_rule"
```

Useful dimensions usually live under `resource.labels.*`, such as URL map or
backend target labels. Validate the exact label names against the descriptor and
sample time series before using them in legends or dashboard filters.

## Ratio widgets

For error-rate widgets:

- Make numerator and denominator filters differ only by the error condition.
- Use matching alignment and reduction windows.
- Set unit override to percent when the dashboard expression outputs a ratio
  intended for operators.

Completion criterion: numerator and denominator query scopes are equivalent
except for the intended status/error predicate.

## Metrics scope

If a dashboard in an infra project should show app or environment projects,
check the metrics scope. A correct query can return no data if the monitored
project is not attached to the scoping project.

Completion criterion: no-data diagnosis distinguishes "query invalid",
"metric valid but no samples", and "project missing from metrics scope".
