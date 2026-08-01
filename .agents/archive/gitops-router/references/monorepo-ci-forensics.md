# Monorepo CI Forensics

Use when a GitLab pipeline in a monorepo looks slow, deploys more services than
expected, or the user asks why a deployment took so long.

## Timing Layers

Keep these layers separate:

- Queue time: GitLab runner availability and `queued_duration`.
- Pre-check time: change detection, previous tag lookup, module dependency map.
- Build time: compilation, tests, Jib/Docker image build, registry push.
- Deploy time: Helm/GitOps update commands and controller handoff.
- Rollout time: Kubernetes readiness, `helm --wait`, probes, PDB/HPA, image pull.
- Verification time: post-deploy rollout/image checks.

Do not infer slow queueing from a long pipeline duration. Check each job.

## Minimum Evidence

```bash
glab api projects/<project-id>/pipelines/<pipeline-id>
glab api projects/<project-id>/pipelines/<pipeline-id>/jobs --paginate
glab api projects/<project-id>/jobs/<pre-check-job-id>/trace \
  | rg -n "previous tag|Previous commit|Change detection range|Found .* changed files|Changed modules|API changes impacted services|Common changes detected|Impacted services|Detected changed services"
glab api projects/<project-id>/jobs/<build-job-id>/trace \
  | rg -n "Services to build|Downloading .*gradle|BUILD SUCCESSFUL|Built and pushed image|pushing manifest|cache"
glab api projects/<project-id>/jobs/<deploy-job-id>/trace \
  | rg -n "Services to deploy|helm upgrade|--wait|--atomic|--timeout|successfully rolled out|Image tag updated|SUCCESS|Warning:"
```

If the pipeline is still running, report current elapsed time and the currently
running job instead of waiting for completion unless the user asks for final
status.

## Monorepo Fan-Out Rules

- Tag pipelines often compare the current tag to the previous environment tag,
  not only the current commit title.
- A small final commit can still deploy many services if the tag range includes
  accumulated API, common-library, build-config, or shared chart changes.
- API module changes can impact every service that depends on those APIs.
- Common module changes usually mean all services are affected unless the repo's
  dependency detector proves a narrower scope.
- Gateway and non-gateway services may have separate build/deploy jobs; keep
  those timelines separate.
- The same image tag or commit SHA across services does not prove every service
  rolled out. Prove the services from `CHANGED_SERVICES`, values updates, or
  Helm `--set-string services.<key>.imageTag` entries.

## Interpretation

When explaining a slow deployment, answer in this shape:

```text
結論:
- queue | pre-check | build | deploy | rollout 哪一層慢

證據:
- pipeline ref/tag/status/timestamps
- job durations and queued durations
- changed-service detection result
- build/push/deploy commands that explain fan-out

下一步:
- wait, inspect current running job, split service scope, fix cache, or tune rollout

風險:
- whether this is normal fan-out, controller delay, runtime health, or CI config bug
```

## Borrowed But Localized Patterns

Use a build/deploy/ops lens from general DevOps skills, but keep this workspace's
boundaries: GitLab, Kubernetes, ArgoCD, GCP, and Git remotes are read-only
inspection surfaces. Do not retry, cancel, run, sync, roll back, or mutate
pipelines or clusters.
