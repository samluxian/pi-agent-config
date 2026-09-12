# Context Pipeline

Context Pipeline 在 tool result 進入模型前執行 deterministic projection：

- Terraform／OpenTofu text plans；
- Helm template與install／upgrade dry-run manifests；
- TAP、Node test、pytest與unittest results；
- `environment-scout` 的 Kubernetes、pod logs與Cloud Logging結果；
- environment與subagent共用的model-facing text budgets。

它不使用模型、網路服務、telemetry、背景更新或persistent metrics，也不建立第二份raw output。

## Bash result routing

支援的單一`bash`或worker `safe_bash` command有兩種輸入路徑：

1. 完整result尚未觸及Pi原生truncation，但已超過8 KiB；processor直接讀event text。
2. Pi已截斷result；processor從`details.fullOutputPath`讀取完整的安全temp file。

Native nonzero shell errors可能只在固定footer保留temp path。Test processor可抽取該path，但仍要求它位於系統temp directory、符合`pi-bash-<16 hex>.log`、是regular file而非symlink，且不超過64 MiB。Terraform與Helm nonzero results維持fail open。

只有processor回傳完整、可辨識schema，而且包含來源提示的summary仍小於原模型輸入時才替換。Abort、timeout、unsafe path、unsupported command、malformed output、missing helper、processor nonzero或expansion全部保留原結果。Content patch不改寫tool details、error state、usage或images。

## Test results

`test-result-summary/v1`支援：

- Node TAP與`node --test`；
- npm、pnpm、yarn或bun test wrappers輸出的TAP；
- Python unittest；
- pytest summary與可辨識failure records。

Summary保留runner、result、suite/test pass/fail/skip/todo counts、原始行數、failure IDs、bounded diagnostics、redaction、emitted/omitted failure groups與completeness。可辨識的assertion failure即使command nonzero仍會處理；command-not-found、timeout、signal、runner crash或未知格式不會被當成test failure壓縮。

Test summary最多16 KiB。超過budget時先保留counts與failure identities，再移除detail groups並設定`content_complete=false`。原始truncated output沿用Pi temp recovery path；完整event text不另存raw copy。Worker profile載入`safe_bash`時會同時載入Context Pipeline，避免child model直接承受大型test output。

## Terraform與Helm

Domain parser由repository-owned scripts單一維護：

- Terraform：`.agents/skills/terraform-repository-maintenance/scripts/summarize_terraform_plan.py --json`
- Helm：`.agents/skills/gitops-state-diagnostics/scripts/summarize_manifest_json.py --helm-output`

Extension只從自身source repository或installed-workspace layout尋找helper，不執行target repository提供的同名程式。Terraform不接受saved plan、state或JSON plan。Helm只輸出resource identities、counts與allowlisted projections；Secret與ConfigMap只列keys。

## Environment projections

`environment-processors.ts`只負責routing。Kubernetes、pod logs、Cloud Logging與final structured budget分別由：

- `environment/kubernetes.ts`
- `environment/pod-logs.ts`
- `environment/gcloud-logging.ts`
- `environment/output-budget.ts`

Kubernetes只接收fixed `custom-columns --no-headers` allowlisted projection，不讀取完整Pod specs、environment、annotations、service selectors或endpoint addresses。Resource index最多100筆，detail最多40筆，且保留omitted counts。

Cloud Logging驗證descending timestamps，保留coverage與severity counts，只折疊連續且完全相同的訊息；最多25組並標示omitted count。原始filter只留下短hash。

Pod logs維持順序並折疊連續相同行。Structured strings最多2,048 characters、object keys 30、array items 20、depth 4；任何projection或redaction都設定`content_complete=false`。

Structured environment output採schema-aware pruning，最多120行／24 KiB。它先保留status、counts、completeness與omitted metadata，再依序縮減resource index與detail arrays，不再由`environment-inspect.ts`盲目切斷JSON。未經structured processor的table text才使用UTF-8-safe head/tail bound。

`environment-inspect.ts`仍擁有read-only argv、query limits、timeouts、abort與exit handling。`text-budget.ts`提供environment與subagent共用的UTF-8 byte/line budget；`redaction.ts`是敏感文字規則的唯一owner。

## Safety and completeness

- Unknown、malformed、unsafe或unsupported input fail open。
- Processor summary必須比原模型輸入小。
- Raw Terraform、state、kubeconfig、credentials與private fixtures不會持久化。
- `input_complete`／`source_complete`表示processor看過完整輸入。
- `content_complete=false`表示projection省略details；omitted counts與recovery path必須可見。
- Summary不取代完整Terraform V3 review、API-server acceptance、controller convergence或runtime trace。

## Validation

Unit tests使用synthetic public-safe fixtures，不呼叫模型、網路、Terraform、Helm、kubectl或gcloud。Live smoke tests只允許明確target與bounded read-only query；no-hit不能證明dependency健康。
