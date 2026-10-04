# terraform-state

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Read Terraform plans as reconciliation proposals](../../notes/fundamentals/terraform-plan-refresh-and-state-reconciliation.md) | fundamental | stable | verified | A Terraform plan compares configuration with refreshed prior state and proposes provider-defined actions, so its result is time-bound evidence rather than a permanent prediction. |
| [Control Terraform replacement ordering explicitly](../../notes/fundamentals/terraform-replacement-ordering-and-lifecycle.md) | fundamental | stable | verified | Terraform lifecycle rules can alter replacement ordering or reject selected actions, but they cannot remove provider constraints or external name and dependency limits. |
| [Preserve resource identity during Terraform ownership migrations](../../notes/fundamentals/terraform-resource-ownership-migration.md) | fundamental | stable | verified | Terraform migrations must preserve one state binding per remote object and prove the source and destination plans before ownership changes. |
