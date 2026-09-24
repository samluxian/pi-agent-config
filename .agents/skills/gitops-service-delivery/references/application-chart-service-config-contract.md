# Application Chart Service Configuration Contract

Use this contract for every service onboarded to or maintained in the supported
GitOps repository layout. Select one repository-local compliant service as a
structural reference only. Never copy its application values, secret references,
identities, endpoints, resources, probes, or environment decisions.

## Required And Optional Files

```text
<project>/<service>/
├── Chart.yaml
├── values.yaml
├── values.<env>.yaml
├── values.ignore.<env>.yaml
└── app-config/
    ├── values.<env>-<config-name>.yaml
    └── values.<env>-common.yaml
```

| File | Requirement | Ownership |
| --- | --- | --- |
| `Chart.yaml` | required | application chart dependency, alias, version, chart metadata, environment tags |
| `values.yaml` | required | environment-independent deployment baseline and application config mount contract |
| `values.<env>.yaml` | required only for an enabled environment | environment-specific deployment overrides and image tag |
| `values.ignore.<env>.yaml` | optional; use instead of the enabled filename when intentionally disabled | offline preparation that bootstrap must not discover |
| `app-config/values.<env>-<config-name>.yaml` | required for each enabled service environment | service-owned application/runtime configuration and secret references |
| `app-config/values.<env>-common.yaml` | optional | application configuration proven to be shared by the intended service group |

Do not require or create a common file for an independent service. Empty
placeholder common files add ownership ambiguity.

## Config Name And Discovery

Derive `<config-name>` from the bootstrap template, never from assumption:

- ordinary services commonly use the service directory basename
- an established repository template may transform a standard service prefix
- a custom override or project template is authoritative when present

An enabled `values.<env>.yaml` is a deployment switch because bootstrap globbing
discovers it. Renaming `values.ignore.<env>.yaml` to that enabled form requires
explicit environment approval.

Before adding an optional common file, prove the Application value-file list
loads it. `ignoreMissingValueFiles: true` makes a listed common file optional;
it does not cause an unlisted file to load. A bootstrap change is separate scope
and requires approval.

## Values Ownership

### `values.yaml`: deployment baseline

Allowed responsibilities include:

- image repository, workload strategy, replicas and security contexts
- probes, resources, volumes, scheduling and termination behavior
- Services, autoscaling, PDB, ServiceAccount and RBAC
- fixed application startup wiring based on `global.envName`
- `configFiles` names and mount paths that define the application mount contract

Do not put environment-specific business content or secret references here.

### `values.<env>.yaml`: environment deployment override

Allowed responsibilities include:

- one environment tag and `global.envName`
- CI-managed image tag
- approved environment-specific replicas, resources, autoscaling and pod labels
- environment-specific Kubernetes delivery behavior

Do not put `config.configFiles.*.content`, business feature settings, external
application endpoints, data-store parameters, or secret references here.

### `app-config/values.<env>-<config-name>.yaml`: application config

Keep application/runtime values under the dependency alias's `config` surface:

- application environment variables
- ConfigMap-backed file content
- feature and framework settings
- non-secret external application configuration
- Secret Manager or ExternalSecret references and mount declarations

It must not own `deployment`, `services`, `autoscaling`, `pdb`,
`serviceAccount`, or `rbac`. Never store secret values in Git.

### Optional common application config

Create `values.<env>-common.yaml` only when the same application configuration
has an identified shared owner and multiple intended consumers. Service-specific
exceptions stay in the service file. Confirm merge order and override behavior
with a render.

## Secret Field Inventory And Fillable Templates

For a request to identify required Secret fields from code or prepare a YAML
structure for the operator to fill, use this order before recommending removal:

1. Identify the exact application, environment, and mounted file or environment
   variable reference from tracked deployment configuration. Do not read Secret
   payloads, ignored config files, credential files, or actual values.
2. Search tracked application code and safe configuration sources for property
   injections, binding classes, framework connection properties, config imports,
   dependency-backed auto-configuration, and their active consumers. Include
   cache and data-store clients even when application code only injects framework
   templates. Record source paths for each conclusion.
3. Compare property paths with tracked non-secret deployment config and runtime
   environment variable names. Distinguish keys already provided there from
   candidate Secret-owned keys; a property name alone does not prove ownership.
4. Classify each candidate as startup-required, feature-required (with its
   activation condition), non-secret deployment config, bound-but-unused, or
   unproven. Distinguish injection defaults from feature readiness. Do not label
   a key safe to delete without confirming its callers and effective precedence;
   a security credential with an empty or placeholder fallback deserves explicit
   caution even if startup succeeds.
5. In a fillable Markdown/YAML template, use synthetic placeholders only; label
   optional feature sections explicitly. Keep non-secret keys out of the Secret
   template unless documenting a temporary override and its migration risk.
   Warn that completed templates belong only in a protected operator workflow.
   If effective values or authentication mode are unknown, ask for key names or
   a user-confirmed non-secret value, never the Secret value itself.

For example, a framework connection URI may be a Secret candidate when it can
contain credentials; a host can be public configuration. Neither is proven
required in the Secret merely because the dependency exists. A commented-out
feature key must not be presented as required, and a required feature key must
not remain commented when the operator confirms that feature is used.

## Alias Shape

Use the aliases declared by `Chart.yaml`; do not add `beta` merely because
another service has it. A typical single-alias file is:

```yaml
common: &common
  deployment: {}

stable:
  !!merge <<: *common
```

Application config follows the same alias wrapper but owns only `config`:

```yaml
common: &common
  config:
    envs: {}
    configFiles: {}
    secretFiles: {}

stable:
  !!merge <<: *common
```

Read `helm-alias-overlays.md` when more than one alias is present.

## Effective Value Order

Read the generated Argo CD Application rather than assuming order. The expected
contract is:

```text
values.yaml
app-config/values.<env>-common.yaml              # optional when listed
app-config/values.<env>-<config-name>.yaml        # service application config
values.<env>.yaml                                 # environment deployment override
```

Because the last file wins, CI must reject application configuration in the
environment deployment overlay; otherwise it can bypass the ownership split.
Legacy `values.cm-*.yaml` files require an explicit migration decision rather
than silent copying into the new structure.

## Validation Contract

For every affected enabled environment, prove:

1. required files exist and disabled environments remain undiscovered
2. `Chart.yaml` pins the intended application chart version and aliases
3. application-config files contain no deployment-owned roots
4. environment deployment overlays contain no application-config content
5. bootstrap renders one Application with the intended path and value-file order
6. Helm renders with the exact listed files and injected globals/tags
7. rendered workload, Service, autoscaling, config objects and secret references
   match the approved intent
8. CI's image-tag expression still targets the approved path

A successful YAML parse or Helm command without these behavior checks is not
sufficient.
