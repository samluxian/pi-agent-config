# Terraform Plan Replacement Review

Use this gate when a plan replaces a resource because its name or another
immutable field changed.

## Active Reference Inventory

Before recommending apply, list the exact relationship that must survive:

```text
consumer -> resource address -> cloud resource name -> attached target
```

For a routed backend, record each hostname or matcher, backend service, health
check, and endpoint group. Build the complete matrix before editing. Do not infer
that similarly named resources have the same owner or purpose.

## Replacement Order

Terraform text plans distinguish these actions:

| Symbol | Order | Review result when the old resource is actively referenced |
| --- | --- | --- |
| `+/-` | create, then destroy | Continue if the consumer update depends on the replacement and names do not conflict. |
| `-/+` | destroy, then create | Stop. The provider can reject deletion while the consumer still references the old resource. |

Use `lifecycle.create_before_destroy` only when the provider supports concurrent
old and new resource names and the replacement graph updates consumers before
old-resource deletion. A successful plan must show `+/-`; intent in source is
not sufficient.

Stop when the new and old resources require the same unique cloud name, when a
consumer is outside the affected state, or when the plan does not expose enough
dependency evidence. These cases need a staged handoff instead of an inferred
safe apply.

## Compact Evidence

Keep only:

- resource address and action symbol;
- immutable field before/after values;
- consumer references that change;
- warnings and errors;
- import/add/change/destroy/replace counts;
- an explicit unexpected-drift result.

Do not load a full plan when these fields answer the review. For a text plan,
pipe the captured output through `scripts/summarize_terraform_plan.py`. The
helper reports destroy-first replacements as unsafe review findings; it does not
prove that create-first dependency ordering is correct.

## Validation

A replacement is review-ready only when:

1. every renamed target appears once in the ownership matrix;
2. every active consumer change appears in the plan;
3. each referenced replacement is `+/-`, not `-/+`;
4. action counts match the named resources;
5. unrelated roots and resources show no drift;
6. a fresh post-apply plan is no-op after the user-operated apply.
