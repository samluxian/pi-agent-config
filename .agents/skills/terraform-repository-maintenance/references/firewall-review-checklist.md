# Firewall Review Checklist

Use for Terraform roots that own shared or workload-specific firewall rules.

## Evidence to collect

- Target project: verified application project or Shared VPC project.
- Firewall name.
- Direction: `INGRESS` or `EGRESS`.
- Priority: lower number wins.
- Action: allow or deny.
- Protocol and ports.
- Source ranges for ingress.
- Destination ranges for egress.
- Target tags or target service accounts.

## Review questions

1. Does the rule live in the correct project/network?
2. Is `0.0.0.0/0` required, or can the source be narrower?
3. Does an allow rule with lower priority override a deny rule?
4. Are target tags/service accounts narrow enough?
5. Are ports minimal and documented?
6. Does this expose SSH/RDP/admin endpoints, databases, or internal service
   ports?

## Priority reminder

GCP firewall priority is ordered by number:

```text
priority 100  wins before priority 900
priority 900  wins before priority 950
priority 1000 is default-ish lower precedence than 900/950
```

If an allow rule at priority `900` matches traffic, a deny rule at priority
`950` will not block that same traffic.

## High-risk patterns

Flag before approving:

```text
source_ranges = ["0.0.0.0/0"]
destination_ranges = ["0.0.0.0/0"]
ports = ["22"]
ports = ["3389"]
protocol = "all"
wide target_tags shared by many workloads
```

## Safer report format

```text
Firewall change:
- Project/network:
- Direction/action/priority:
- Source/destination:
- Protocol/ports:
- Target:
- Plan action:
- Risk:
- Narrower alternative if applicable:
```
