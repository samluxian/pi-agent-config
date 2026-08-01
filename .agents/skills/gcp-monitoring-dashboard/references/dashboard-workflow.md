# Dashboard workflow

## Source of truth decision

Use this order:

1. If a dashboard is already represented in Terraform or a dashboard-specific
   repo path, treat that file as intended source of truth.
2. If only a Console dashboard exists, export JSON before proposing changes.
3. If the user wants Terraform management, create or update Terraform only after
   checking the target service state and plan scope.
4. If the user wants an immediate one-off update, generate JSON and provide a
   user-operated `gcloud monitoring dashboards update` command.

Completion criterion: the response names the chosen source of truth and the
reason it will not create a duplicate dashboard or touch unrelated resources.

## Read-only inspection commands

Use narrow commands and summarize output:

```bash
gcloud monitoring dashboards list \
  --project=<scoping-project> \
  --format='table(name,displayName)'
```

```bash
gcloud monitoring dashboards describe <dashboard-id-or-name> \
  --project=<scoping-project> \
  --format=json
```

```bash
gcloud monitoring metrics-scopes describe <scoping-project-number> \
  --format=json
```

```bash
gcloud monitoring metrics descriptors describe <metric-type> \
  --project=<project> \
  --format=json
```

If a `gcloud monitoring time-series` path is unavailable, use the Cloud
Monitoring REST API with a token from `gcloud auth print-access-token`.

## User-operated update command

Use `update` for an existing dashboard. Preserve `etag` to avoid overwriting a
newer Console edit silently.

```bash
DASHBOARD_ID="<dashboard-id>"
SOURCE="<dashboard-json>"
OUTPUT="/tmp/<dashboard-name>.json"

ETAG=$(gcloud monitoring dashboards describe "$DASHBOARD_ID" \
  --project=<scoping-project> --format='value(etag)')

jq --arg etag "$ETAG" '.etag = $etag' "$SOURCE" > "$OUTPUT"

gcloud monitoring dashboards update "$DASHBOARD_ID" \
  --project=<scoping-project> \
  --config-from-file="$OUTPUT"
```

State expected effect before the command: one existing dashboard is updated in
the scoping project; no new dashboard should be created.

## Terraform management

When using Terraform:

- Confirm the target service directory and environment before editing.
- Keep dashboard resources separate from IAM changes unless the user asked for
  both.
- Use dashboard import blocks or import commands when taking over an existing
  Console dashboard.
- Review `terraform plan` for unrelated destroys. Stop if the plan touches IAM,
  service accounts, buckets, clusters, or unrelated dashboards.
- Prefer `google_monitoring_dashboard` with JSON produced from a reviewed file
  or template.

Completion criterion: the plan changes only the intended dashboard resources, or
the response calls out the exact unrelated changes and tells the user not to
apply.
