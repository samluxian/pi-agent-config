# Public Repository Safety

Use this contract for every change to `AGENTS.md`, `.agents/skills/`,
`extensions/`, repository scripts, fixtures, configuration, or documentation.
Treat the complete current repository snapshot as public source.

## Prohibited Content

Do not add real company or client information, including:

- organization, product, project, repository, service, chart, module, or package
  names that are not already intentional public identities
- environment, cluster, namespace, cloud project, registry, image, route, topic,
  subscription, database, bucket, service account, or infrastructure identifiers
- private domains, internal URLs, private IP addresses, employee email addresses,
  account identifiers, ticket identifiers, or customer names
- copied incident details, topology inventories, pipeline IDs, MR/PR URLs, logs,
  manifests, plans, or examples derived from a private target repository

Public third-party names, standards, and this repository's intentional public
identity are allowed when they are necessary and correctly attributed.

## Safe Examples

Use descriptive placeholders such as:

```text
<organization>
<application-repository>
<service>
<environment>
<namespace>
<cloud-project>
https://git.example.test/<organization>/<repository>
example-service@example-project.iam.gserviceaccount.com
```

Use reserved example domains and clearly synthetic identifiers. Do not anonymize
one field while retaining enough surrounding topology to identify the private
system. A reusable workflow should describe the evidence shape and ownership
rule, not preserve a company inventory.

## Evidence Boundary

Private target-repository and runtime evidence may be read when the selected
domain workflow permits it, but it stays in the active investigation. Do not
copy it into this repository, fixtures, tests, documentation, session notes, or
commit-message suggestions. Record only a generalized lesson after explicit
approval.

## Deterministic Check

Run:

```bash
python3 .agents/skills/pi-agent-maintenance/scripts/check_public_safety.py
```

The scanner always checks current repository paths and text for generic private
patterns. An optional machine-local denylist adds literal case-insensitive terms:

```bash
PI_PUBLIC_SAFETY_TERMS_FILE=/path/outside/repository/private-terms.txt \
  python3 .agents/skills/pi-agent-maintenance/scripts/check_public_safety.py
```

Keep the terms file outside this repository. Use one literal term per line;
blank lines and lines beginning with `#` are ignored. The scanner reports only
category and location, never the matched term. A configured but missing,
unreadable, empty, or repository-local terms file is a failure.

The generic scanner cannot recognize every private proper noun. Final review
must inspect changed examples and identifiers semantically, confirm placeholders
are synthetic, and report a missing machine-local denylist as a validation gap
when organization-specific coverage is required.

## History Boundary

A clean current snapshot does not sanitize Git history. Before first public
publication, inspect history separately. If private information exists, prefer a
new repository containing one reviewed clean snapshot. The agent must not rewrite
history, create commits, or mutate remotes.
