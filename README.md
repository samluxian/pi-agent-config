# DevOps / GitOps Agent Workspace

這個 repository 是可攜式的 workspace meta repo，用來版控 Codex 處理
DevOps / GitOps 任務時使用的工作規範、project-scoped skills，以及 session
notes。它不依賴固定的使用者名稱或絕對路徑。

它不是產品 monorepo。實際服務、部署、chart 與 infrastructure repositories
可以放在同一 workspace 的其他位置，各自維持自己的 Git history、branch、
remote、dirty state 與 delivery 規則。

## 在 Workspace 使用

將這個 repository checkout 到 workspace 中，然後在 skills repo 內執行初始化
工具。它會在 skills repo 的父目錄建立指向 canonical contract 的相對 symlink：

```bash
cd <workspace-root>/skills
./scripts/init-workspace.sh
```

如果 workspace root 不是 skills repo 的父目錄，可明確指定：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
```

工具會建立 workspace contract 與 project-scoped skills 兩個連結，並預設複製所有
`skills/extensions/` Pi extensions 到 `<workspace-root>/.pi/extensions/`，再以 npm
安裝其 runtime dependencies。它不會覆寫既有 extension 目錄或指向其他位置的
symlink；重複執行時保留已存在的 extension source，但會重新執行 npm install。

### Pi extensions

Pi 從 workspace root 啟動時，會在 project trust 後載入
`<workspace-root>/.pi/extensions/` 的 `bash-guard`、`lean-context`、
`subagents`、`web-fetch` 與 `web-search`。這只影響該
workspace；不會改變
`~/.pi/agent/extensions` 或其他 Pi workspace。

若只要建立 AGENTS/skills symlink 而不安裝 Pi extensions：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root> --no-pi-local
```

舊版 initializer 寫入的 `<workspace-root>/.pi/settings.json` package registration 會在
下一次預設初始化時移除，避免載入無關 extension dependencies。先用 `--check` 確認
symlink、Pi executable、每個 extension 與 dependencies，不改任何檔案。

初始化會複製當下 `skills/extensions/` 下的所有 extension 目錄；新增 extension 後，
重新執行 initializer 即可安裝到 workspace-local Pi scope。

### Context、loop 與 session baseline

- `lean-context` 將單次純文字 tool result 限制在最多 80 行 head、40 行 tail 與
  24 KiB，完整輸出寫入權限受限的 OS temp path；較舊的大型結果只在送入模型前壓成
  summary，不改寫 session truth。
- `lean-context` 以 non-context session entry 記錄 turn latency、tool calls/results、
  context usage 與可用的 response usage，供相同 prompt/model/settings benchmark。
- `bash-guard` 阻擋無 selector 的 all-namespace Kubernetes YAML/JSON dump，也避免同一
  agent run 重複執行剛成功的相同 command；失敗 command 與 repo edit 後的 validation
  仍可重試。
- `config/pi-settings-baseline.json` 是選用範例，不由 initializer 自動套用或覆寫既有
  project/personal settings。採用前應先對照目前 Pi 版本並手動 merge 所需欄位。

預設 thinking tier 是 `low`；跨 repo 衝突、陌生 chart/API 或非平凡 incident analysis
才升到 `medium`，`high` 只留給無法在 medium 收斂的高風險或高度模糊設計。Session
維持單一主要目標；舊 tool result 主導 context 或接近約 90k tokens 時先 compact，換成
無關目標、repo 或 evidence path 時開新 session 並用短 handoff note 接續。

Model 與 thinking 由使用者在 session 層級選擇，skills 不會自動切換 model。Subagent
只在使用者明確要求，或 selected workflow 要求 independent validation 時執行 bounded
read-only evidence task；parent 保留 planning、decisions、approval、reconciliation 與
implementation。`scout` 使用 Luna/low，`researcher` 使用 Terra/low，兩者都不繼承
parent context。Parallel mode 最多四個 tasks，每個 child 最長五分鐘，且不存在 editing
`worker`。

`skills/AGENTS.md` 是唯一 source of truth；不要在 symlink 位置維護另一份副本。
如果 checkout 使用其他目錄名稱，調整 symlink target 即可。移動整個 workspace
時，相對 symlink 仍然有效。

## 主要檔案

| 路徑 | 用途 |
| --- | --- |
| `AGENTS.md` | Workspace 層級的安全與路由契約。只保留高優先規則，詳細流程交給 skills。 |
| `.agents/skills/devops-pi-agent-maintenance/` | 維護此 repo 的 skills、Pi extensions、AGENTS/README agent contract、settings policy 與 regression gates；避免 trigger、context、loop 與文件行為漂移。 |
| `.agents/skills/gitops-implementation-workflow/` | 已批准的 repo-file 實作路徑，用於 desired state、Helm values、CI handoff、workspace AGENTS/README/skill/docs 改檔。 |
| `.agents/skills/gitops-mr-summary/` | 依 repo diff、branch/MR evidence 與 validation 結果產生精簡中文 MR 說明。 |
| `.agents/skills/gitops-diagnostics-workflow/` | Delivery-state mismatch 診斷：desired state、Helm render、Argo CD、Kubernetes、GitLab handoff 與 GCP prerequisites。 |
| `.agents/shared/gitops/scripts/` | Implementation 與 diagnostics 共用的 Git preflight、Helm render 與 compatibility helpers。 |
| `.agents/shared/gitops/references/` | 多個 GitOps skills 共用的 domain reference，例如 GKE Autopilot resource request 規則。 |
| `.agents/shared/skill-quality/` | Skill invocation regression fixtures 與 deterministic fixture validator。 |
| `.agents/skills/gitops-repo-audit/` | 不進入 live inspection 的 static desired-state、discovery、values overlays、chart metadata、CI handoff 與 MR readiness audit。 |
| `.agents/skills/flex-app-version-upgrade/` | Existing `k8s-deploy` service wrapper 從目前 `flex-app` 版本升到目標版本前的差異評估：current-vs-target chart behavior、live-vs-render selectors、app-of-apps globals、migration risk。 |
| `.agents/skills/flex-app-chart-maintenance/` | Shared `flex-app` deployment API 維護；核心流程留在 `SKILL.md`，values/KEDA/compatibility 細節按 branch 放在 references。 |
| `.agents/skills/gcp-monitoring-dashboard/` | GCP Cloud Monitoring dashboard、JSON/Terraform、metric query/filter、metrics scope 與 dashboard cost 維護。 |
| `.agents/skills/service-delivery-topology/` | 跨 repo delivery topology 與抽離影響：producer、contract、consumer、artifact handoff、route、config/state ownership。 |
| `.agents/skills/tf-services-terraform-maintenance/` | 面向新手的 `tf-services` Terraform 維護、概念教學、單一 service/env plan review、IAM/firewall/state 風險檢查。 |
| `.agents/skills/runtime-dependency-ops/` | Runtime dependency wiring：workload、identity、secret references、database、queue、cache、storage 與 worker health。 |
| `.agents/skills/orchestrator/` | 僅用於明確要求的 parallel/subagent work，或其他 selected skill 要求的 independent validation；不因一般 multi-step task 自動啟用。 |
| `extensions/` | Pi extensions：hard-block/output-loop guard、context truncation/metrics、read-only scout/researcher subagents、self-hosted SearXNG web search 與 HTTPS web fetch。 |
| `searxng/` | Loopback-only SearXNG Docker Compose templates, config generator, and deterministic JSON API verifier for `web-search`. |
| `.agents/archive/gitops-router/` | 已 deprecated 的舊 router 與 legacy references，保留作歷史查詢，不作為新工作入口。 |
| `docs/llm-wiki/` | 給 LLM/RAG 使用的 DevOps wiki：整理 evidence layers、repo ownership、`flex-app` chart contract、`k8s-deploy` desired-state 結構與機器可讀 indexes。 |
| `docs/session-notes/` | 給後續 session 接手用的紀錄。 |
| `tmp/` | 本機暫存資料夾，內容被 `.gitignore` 排除，可由使用者暫放 secret 明碼文件。 |
| Workspace 內其他 repositories | Product、delivery、chart 與 infrastructure repos；不在這個 meta repo 版控內。 |

## AGENTS.md 的角色

`AGENTS.md` 是 Codex 在這個 workspace 的操作契約。它不是完整的 GitOps runbook。

它只保留每個任務都應該載入的規則：

- 先分析再改檔，需求範圍模糊時先問清楚；
- 使用者對 Git、Kubernetes、Argo CD、GitLab 或 GCP 操作有疑慮時，先給短而清楚的
  推薦做法與原因，不主動展開長篇背景；
- GitOps delivery 變更維持 Human-in-the-Loop approval；
- 使用 evidence budget、stop condition 與窄輸出，避免把完整 manifest、diff、logs
  或 trace 放進 context；
- Kubernetes、Argo CD、GitLab、GCP、Git remotes，以及 inner repo 的 protected
  branch 都視為 non-mutating surfaces；
- 區分 skills meta repo 維護與實際 target repo 改動，不依賴固定目錄名稱；
- 不猜 deployment、CI、IAM、secret、runtime、branch 相關事實；
- `tmp/` 可放使用者自行產生的暫時 secret 明碼文件；agent 只能在明確要求下提供
  user-operated 指令，不能自行執行、讀取、列印或追蹤這些內容；
- 詳細工作流程交給 project-scoped skills。

當 `AGENTS.md` 或 `.agents/skills/**` 變更 human-facing workflow、skill inventory、
trigger boundary 或 maintenance rule 時，除非 README 已經準確，否則同一個
workspace-root change 也要同步更新 README。

### 回覆呈現原則

回覆風格直接由 `AGENTS.md` 管理，不再用額外 communication skill 觸發：

1. 先給答案、推薦動作或已完成結果，再補原因。
2. 教學與分析使用短標題，依序區分已驗證事實、判讀與建議；陌生名詞第一次出現時說明用途。
3. 多步驟工作使用編號，每步只有一個可完成動作；超過五項時拆成「現在做」與「稍後做」。
4. 跨回合工作重述目前步驟和可見進度；尚未完成時只留一個明確下一步。
5. 移除寒暄、filler、模糊主張、岔題、制式 recap 與結尾邀請，但不犧牲技術精度、不確定性或安全警告。

這些規則吸收原有 `caveman` 與 `stop-slop` 的有效部分，並參考
[`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd)（MIT）的
action-first、低工作記憶負擔與可見進度理念。它們是預設輸出契約，不假設使用者有
任何診斷，也不需要額外 skill invocation。

## Project-Scoped Skills

Workspace skills 放在 `.agents/skills/<skill-name>/`，並由這個 repo 版控。不要為
這個 workspace 建立 global skill，除非使用者明確要求 personal cross-project
skill。

標準結構：

```text
.agents/skills/<skill-name>/
├── SKILL.md
├── agents/openai.yaml
├── references/
├── scripts/
└── assets/
```

- `SKILL.md` 是簡短 router 與核心 workflow。
- `references/` 放較深的程序與 domain 說明。
- `scripts/` 放 deterministic、可重複的檢查。
- `assets/` 放可重用模板。
- `agents/openai.yaml` 放 UI metadata。
- 重複查證流程優先放進 script；症狀式排錯優先放 matrix/reference，不在
  `SKILL.md` 展開長 SOP。

## Skill Routing

依照 request 選最窄的 skill：

| 工作意圖 | Skill |
| --- | --- |
| 修改此 `devops-pi-agent` repo 的 skill、Pi extension、AGENTS/README agent contract、settings baseline 或 maintenance regression | `devops-pi-agent-maintenance`；改檔時搭配 `gitops-implementation-workflow` |
| 已批准的 delivery 或 workspace guidance 改檔 | `gitops-implementation-workflow` |
| MR descriptions、MR summaries、merge request copy、branch-ready notes，或一邊/兩邊 MR handoff text | `gitops-mr-summary` |
| Existing `k8s-deploy` service wrapper 從目前 `flex-app` chart version 升到目標 version 前的差異評估 | `flex-app-version-upgrade`，並依是否改檔搭配 implementation/diagnostics |
| Shared `flex-app` chart API/default/KEDA profile/app-of-apps contract 維護或 chart release guidance | `flex-app-chart-maintenance`，並依是否改檔搭配 implementation/audit |
| GCP Cloud Monitoring dashboard、dashboard JSON/Terraform、metric query/filter、metrics scope 或 dashboard cost | `gcp-monitoring-dashboard` |
| Read-only 檢查、排錯、驗證或解釋現況 | `gitops-diagnostics-workflow` |
| Static desired-state 或 MR readiness audit | `gitops-repo-audit` |
| 跨 repo service delivery topology、frontend/BFF/backend 依賴圖、hosting vs Kubernetes 部署分流、CI/CD handoff、或服務抽離/monorepo split 影響評估 | `service-delivery-topology` |
| 使用者明確要求 parallel/subagent work，或 selected skill 要求 independent validation | `orchestrator` |
| `tf-services` Terraform 學習、read-only inspection、plan review 或已批准的小維護 | `tf-services-terraform-maintenance` |
| 跨環境 runtime dependency 維運或 desired-state dependency inventory：Pod/Deployment/HPA/Event、Lease/worker、ServiceAccount/IAM/WI、Secret Manager、database、Pub/Sub/queue filter/deadletter、Redis/Valkey/cache、bucket/object storage | `runtime-dependency-ops` |

Broad GitOps request 要先判斷是 implementation、diagnostics 還是 audit；不要再選
`gitops-router`。

所有 GitOps 工作都要維持 evidence layer 分離：

```text
service repo / CI -> k8s-deploy desired state -> shared chart/render ->
Argo CD -> Kubernetes live state -> runtime/GCP evidence
```

預設只查到能回答問題的最小 evidence layer。除非 summary 顯示具體 mismatch、
missing field、error，或使用者要求 readiness proof，不要自動展開 full
manifest、`describe`、logs、diff 或 trace。若使用者提供 diagnostic packet，先只分析
該 packet，並明確指出缺少哪個 fact 後再查 repo 或 live state。

### `devops-pi-agent-maintenance`

只在維護此 meta repo 的 agent behavior 時使用。它先決定行為應由 `AGENTS.md`、skill、
extension、config、README 或 regression test 哪一層擁有，再要求 invocation 正反例、
hook allow/failure/reset tests、安裝接線與文件同步，避免同一規則出現多個 source of
truth。固定檢查：

```bash
python3 .agents/skills/devops-pi-agent-maintenance/scripts/validate_repo_contract.py
```

這個 helper 證明 metadata、fixture coverage、extension registration、README inventory、
JSON 與 extension unit tests；trigger boundary 有實質變更時，使用實際 Pi model trial：

```bash
python3 .agents/skills/devops-pi-agent-maintenance/scripts/run_invocation_benchmark.py \
  --provider <provider> --model <model> --thinking low
```

Benchmark 使用 `--no-session`、停用 extensions、只允許 `read`，並以模型是否實際讀取
目標 `SKILL.md` 判定；raw JSONL 與 summary 寫入 git-ignored `tmp/`。這會產生 provider
用量與費用，不屬於日常 unit test。

### `gitops-implementation-workflow`

使用者批准 repo-file implementation 後使用。常見目標包含：

- `k8s-deploy` desired state 與 Helm values；
- Helm values/render behavior；`flex-app` 只在 shared chart convention 相關時使用；
- GitLab CI handoff files；
- workspace `AGENTS.md`、`README.md`、`.agents/skills/**` 與 docs；
- post-patch review、validation gaps、commit message 建議；MR 說明文字改由
  `gitops-mr-summary` 負責。

優先使用 wrapper：

```bash
.agents/skills/gitops-implementation-workflow/scripts/implementation_flow.sh [--allow-main] [--chart <chart-path> --release <release> --namespace <namespace> --env <env>] [--changed-path <path>] <repo-path>
```

### `flex-app-version-upgrade`

用於 existing `k8s-deploy` service wrapper 要從目前 `flex-app` chart version 升到目標
version 前的 assessment。它先比較 current-vs-target chart behavior、dependency
alias、app-of-apps globals、live selectors、rendered selectors、Service/PDB selector
與 migration risk；確認需要改 desired state 後才交給
`gitops-implementation-workflow`。版本特定 ownership 規則放在 reference matrix，
使用前仍須以 target chart 的 `values.yaml`、schema、helpers 與 templates 重新驗證。

### `gitops-diagnostics-workflow`

用於 read-only inspection 與 troubleshooting，不改 repo files。

優先使用 wrapper：

```bash
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh repo <repo-path>
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh helm <release> <chart-path> <namespace> <env>
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh helm-json <release> <chart-path> <namespace> <env>
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh manifest-json <manifest-path>
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh diff-json [kubectl-diff-output-path]
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh gitlab-pipeline <project-path> <pipeline-id>
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh argocd <app> <namespace> [pod-label-selector]
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh wi --project <project> --namespace <ns> --ksa <ksa> --gsa <gsa>
```

讀大型 manifest、diff 或 trace 前，先使用 JSON summary。症狀式排錯先固定執行
`frame → hypothesis → probe → interpret → stop/route` diagnostic loop，再由
`references/troubleshooting-matrix.md` 選一個症狀分支；空結果必須區分
`rejected`、`inconclusive` 與 `no coverage`，不能直接解讀為健康。
新 Helm render helper 使用 `.agents/shared/gitops/scripts/render_helm_values.sh`；
同目錄的 `render_flex_app.sh` 只保留作舊 workflow 相容 shim。

### `gitops-mr-summary`

用於使用者要求 MR descriptions、MR summaries、merge request copy、branch-ready
notes，或一邊/兩邊 MR handoff text。它會先檢查目標 repo 的 branch、status、
changed paths、branch comparison 或 MR evidence；若 local diff 已經因 commit/push
變空，則用 branch/MR evidence 加上目前 conversation context 還原精簡中文 MR
summary。預設只輸出 `## 修改內容` 與一到三句，直接說明新增、修改、刪除；沒有
變更的類別省略。文字要先說清楚設定或資源移到哪裡、控制關係如何改變；專有名詞只在
精確辨識變更時保留，陌生名詞需在同一句補上用途，不堆疊未解釋的技術名詞。

validation、risk 或其他段落只在使用者明確要求時加入；若發現需要補實作或補驗證，
回到 `gitops-implementation-workflow` 或 `gitops-diagnostics-workflow`。

### `gitops-repo-audit`

用於 static inventory 與 consistency review，在決定是否改檔前先做 read-only
檢查。

優先使用 inventory helper：

```bash
.agents/skills/gitops-repo-audit/scripts/audit_gitops_tree.sh <repo-path>
```

這個 script 是 inventory 支援，不代表 audit 已通過。

### `service-delivery-topology`

用於 read-only 跨 repo topology 與抽離影響分析。常見問題包含 frontend app 是
Firebase/hosting 還是 Kubernetes、BFF image build 後如何 handoff 到 GitOps、
frontend/BFF/backend API route 如何串、哪些 backend microservice 或 shared module
會被影響，以及抽成獨立 repo/monorepo split 時的 compile、route/API、config/secret、
data/runtime、CI/GitOps 風險。

優先使用 compact inventory：

```bash
.agents/skills/service-delivery-topology/scripts/service_topology_inventory.sh <repo-or-path> [repo-or-path...]
```

這個 skill 只建立依賴圖與影響分類；需要 live Argo CD/Kubernetes/GCP proof 時，再切到
`gitops-diagnostics-workflow` 做窄範圍查證。不要讀取或輸出 `.env`、secret payload、
credential、Firebase token、kubeconfig 或 WIF credential file。

### `tf-services-terraform-maintenance`

用於使用者指定之 `tf-services` repository 的 Terraform 新手教學、repo map、
單一 service/env plan review、IAM / firewall / backend state 風險檢查，以及經批准
的小範圍維護。預設 read-only，會解釋 `init`、`plan`、state、backend、provider、
IAM 與 firewall priority 等概念，並停止在 `apply`、`destroy`、import/state mutation
之前。

優先使用 compact preflight：

```bash
.agents/skills/tf-services-terraform-maintenance/scripts/tf_services_preflight.sh <tf-services-repo>
```

### `runtime-dependency-ops`

用於 read-only 跨環境 runtime dependency 維運診斷與 desired-state dependency
inventory。它聚焦服務在 Kubernetes 與外部資源之間的接線：Pod/Deployment/HPA/Event、
Lease/worker、ServiceAccount/IAM/Workload Identity、Secret Manager references、
database、Pub/Sub 或 queue topic/subscription/filter/deadletter、Redis/Valkey/cache、
以及 bucket/object storage。

優先使用 compact snapshot：

```bash
.agents/skills/runtime-dependency-ops/scripts/runtime_dependency_snapshot.sh \
  --context <kube-context> --namespace <namespace> [--project <gcp-project>] \
  [--service <service>] [--topic <pubsub-topic>] [--subscription-filter <filter>]
```

未提供 `--project` 時只做 Kubernetes/Lease summary；GCP Pub/Sub/cache checks 會跳過。
Pod 不健康時，先用 pod failure summary 區分 Kubernetes lifecycle 問題與 application log
問題，避免直接展開完整 `kubectl describe pod` 或大段 logs：

```bash
.agents/skills/runtime-dependency-ops/scripts/k8s_pod_failure_summary.sh \
  --context <kube-context> --namespace <namespace> --pod <pod> \
  [--container <container>] [--tail 100] [--since 10m]
```

desired-state dependency inventory：

```bash
.agents/skills/runtime-dependency-ops/scripts/runtime_desired_state_inventory.sh \
  --root <desired-state-root> [--services <svc1,svc2>] [--envs <dev,qa,uat,prod>]
```

不要用這個 skill 直接建立、刪除或修改 GCP/Kubernetes 資源；需要修正時，回報最小
repo patch 或 user-operated runbook。

### Deprecated: `gitops-router`

`gitops-router` 已經 archive 到 `.agents/archive/gitops-router/`，不再作為新工作入口。
原本仍被 wrapper 使用的 scripts/templates 已分配回各自的 active skill 目錄。
Archive 內容只用於歷史追溯或人工查詢，不應由 agent 自動選用。

## 維護規則

- Root `AGENTS.md` 要保持短且高訊號；只放 safety、routing、workspace layout、
  最小 validation/reporting rules。
- Domain runbooks 放 `references/`，deterministic checks 放 `scripts/`，可重用輸出
  格式放 `assets/`。
- Model-invoked skill 的 trigger boundary 變更時，在
  `.agents/shared/skill-quality/fixtures/invocation-cases.json` 同時保留正向與反向案例，
  並執行 `.agents/shared/skill-quality/scripts/validate_invocation_fixtures.py`
  檢查 fixture integrity。
- Deprecated workflow 放 `.agents/archive/`，避免被當成 selectable skill。
- DevOps/GitOps 調查若發現 reusable lesson，提出其中一種建議：更新既有 skill、
  建立新 skill、只寫 session memory、或不需要 skill change。
- 不要自動改 skills，除非使用者明確要求或批准。
- Workspace-root guidance change 要先檢查 git status、保持 patch 小、跑
  `git diff --check`，並且不要 stage、commit 或 push。

## 驗證

Workspace guidance 變更：

```bash
git branch --show-current
git status --short --untracked-files=all
git diff --name-status HEAD
git diff --cached --name-status
git diff --check
```

Delivery、diagnostics 或 audit work 則使用對應 skill wrapper，並明確回報 skipped
checks、missing auth 或 missing tooling。
