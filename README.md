# DevOps Pi Agent

> 讓 Pi 在 DevOps / GitOps workspace 裡工作得更安全、更精準，也更省 context。

DevOps Pi Agent 是一套給 Pi Coding Agent 使用的 workspace 工具包。它把團隊的
操作規則、DevOps workflows、驗證腳本與安全護欄放在同一個 repository，讓 agent
知道：

- 什麼時候只該查資料，什麼時候可以改檔；
- 面對 Helm、Argo CD、Kubernetes、GitLab、GCP 或 Terraform 時該走哪條流程；
- 哪些資訊才是部署事實，哪些只是應用程式裡的意圖；
- 何時必須停下來等使用者批准；
- 如何避免 skill 誤觸發、無限查資料、重複下指令和塞爆 context。

它不是自動部署平台，也不是產品 monorepo。你的 application、`k8s-deploy`、Helm
chart 與 infrastructure repositories 繼續保有自己的 Git history、branch、remote
與權限；這個 repo 只負責讓 agent 用一致的方法協助你。

## 它解決什麼問題

一般 coding agent 直接進入 DevOps workspace 時，常見問題是：

1. **選錯流程**：只是要寫 MR 說明，卻開始查 Kubernetes；只想盤點 repo，卻誤進入實作。
2. **讀太多資料**：一次展開完整 manifest、logs 或 diff，重要線索反而被大量輸出淹沒。
3. **操作邊界不清楚**：沒有先確認 branch、approval、IAM 或部署風險就準備修改。
4. **跨 repo 容易混淆**：把 application source 當成部署事實，忽略 GitOps desired state、render 與 live state。
5. **工作無法重現**：每次靠臨場下指令，缺少固定的 preflight、summary 與 regression tests。

DevOps Pi Agent 把這些問題轉成可重複的 contract、skills、extensions 與 scripts。

## 使用體驗

典型工作流程如下：

```text
你提出需求
  ↓
AGENTS.md 套用安全與工作邊界
  ↓
選擇最符合需求的 skill
  ↓
用最少的 evidence 回答或提出精確 patch
  ↓
需要改檔時先等你批准
  ↓
修改、驗證、回報風險與下一步
```

例如你說：

```text
幫我確認 qa 的 Pod 為什麼一直重啟，先不要修改任何東西
```

Agent 會先從最小範圍的狀態摘要判斷問題。若最後需要改 GitOps desired state，它會
列出檔案、行為差異、驗證方式與風險，再等你批准。

## 核心能力

| 能力 | 實際效果 |
| --- | --- |
| 精準的 skill routing | 每個 skill 都有清楚的「適合／不適合」邊界，降低相似流程互相誤觸發。 |
| Human-in-the-Loop 實作 | Delivery 變更採用「分析 → 提案 → 使用者批准 → 改檔 → 驗證」。 |
| 分層查證 | 分開 application、CI、GitOps desired state、Helm render、Argo CD、Kubernetes 與 runtime/GCP evidence。 |
| 精簡 context | 大型 tool output 保留有用的開頭與結尾，完整內容放在受限 temp file，不讓舊輸出持續佔滿 context。 |
| 防止重複 loop | 阻擋部分無界限 Kubernetes dump，以及同一輪中重複執行剛成功的相同 command。 |
| 可重複驗證 | 固定的 repo preflight、Helm summary、diagnostic snapshot、skill fixtures 與 extension tests。 |
| 有邊界的 subagent | 強模型保留規劃與決策，只把明確、獨立、read-only 的蒐證工作交給較便宜的 child model。 |

## 適合哪些工作

這套工具特別適合：

- GitOps desired state、Helm values、Argo CD 與 Kubernetes troubleshooting；
- GitLab CI handoff、MR summary 與 branch readiness；
- shared `flex-app` chart 維護與 service wrapper version upgrade；
- GCP Monitoring dashboard、Workload Identity 與 runtime dependencies；
- 跨 repo service delivery topology 與服務拆分影響分析；
- `tf-services` repository 的 Terraform 學習、plan review 與小範圍維護。

它不會取代：

- GitLab、Argo CD、Kubernetes 或 GCP 的權限與審批機制；
- Helm、Terraform、CI 或 application 本身的測試；
- 人對 production、IAM、secret、資料遷移和成本風險的最後決定。

## 五分鐘開始使用

### 1. 準備 workspace

建議把這個 repo 與實際工作 repositories 放在同一個 workspace 下，但不要合併它們的
Git history：

```text
<workspace-root>/
├── devops-pi-agent/      # agent contract、skills、extensions
├── k8s-deploy/           # GitOps desired state
├── helm-chart/           # shared charts
└── your-service/         # application source
```

目錄名稱可以不同；initializer 不依賴固定的使用者名稱或絕對路徑。

### 2. 初始化

在這個 repo 裡執行：

```bash
cd <workspace-root>/devops-pi-agent
./scripts/init-workspace.sh --workspace-root <workspace-root>
```

它會建立：

```text
<workspace-root>/AGENTS.md
<workspace-root>/.agents/skills
<workspace-root>/.pi/extensions
```

前兩個是指向此 repo canonical files 的相對 symlink；Pi extensions 會複製到該
workspace 的 local scope，不會修改其他 workspace 或 `~/.pi/agent/extensions`。

### 3. 確認安裝

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
```

`--check` 會確認 symlink、Pi executable、extension 目錄與 dependencies 是否就緒，
但不會比較已安裝 extension 與 repo source 是否內容相同。

### 4. 從 workspace root 啟動 Pi

```bash
cd <workspace-root>
pi
```

Pi 在信任 workspace 後，就能讀取 `AGENTS.md`、project-scoped skills 與 local
extensions。

### 只安裝 contract 與 skills

如果暫時不需要 Pi extensions：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root> --no-pi-local
```

## 常見使用方式

你不需要記住 skill 名稱，直接描述目標與限制即可：

```text
幫我盤點這個 k8s-deploy repo 的 service values 是否一致，先不要改檔
```

```text
比較 flex-app 目前版本和目標版本的 selector 與 render 差異
```

```text
根據目前 branch diff 幫我寫一段精簡的中文 MR 說明
```

```text
先列出要改的檔案、驗證方式和風險，等我批准後再修改 qa values
```

```text
用兩個 read-only subagents 分別整理 local repo wiring 和官方文件，最後由你判斷
```

如果問題牽涉 production、IAM、secret、資料遷移或不明確的 shared behavior，請在
prompt 中直接說明環境、限制與你希望 agent 停在哪一步。

## 安全設計

### GitOps 是部署權威

預設交付路徑是：

```text
Git change → MR → merge → Argo CD reconcile
```

Kubernetes、Argo CD、GitLab、GCP 與 Git remotes 對 agent 永遠是唯讀。所有行為變更
都必須先寫入 repo 的 desired state，再走既有的 review 與 GitOps 交付流程。

### 改檔前要有人批准

對 delivery files 的修改，agent 會先確認 target repo、branch、dirty changes、預期行為、
驗證方式與風險。如果 branch 是 `main`、`master`、`release` 或 protected/shared branch，
會停下來請你先切換 branch。

### Secret 不進 context

Agent 不會讀取、解碼、列印或搬移 secret values、private keys、kubeconfig、`.env` 或
credential files，也不會把敏感值改放到 ConfigMap。需要取出 secret 時，只能提供由你
執行的指令，且輸出必須留在 git-ignored 的 local `tmp/`。

### 先看摘要，再決定是否深入

預設優先使用 `custom-columns`、JSONPath、`jq`、field selector、`--tail` 與 `--since`。
只有摘要出現具體 mismatch、missing field 或 error 時，才繼續查較完整的 manifest、
logs、diff 或 trace。

完整且具約束力的安全規則以 [`AGENTS.md`](AGENTS.md) 為準。

## Skills：依工作選擇專用流程

### 日常 GitOps 工作

| Skill | 白話說明 |
| --- | --- |
| [`gitops-diagnostics-workflow`](.agents/skills/gitops-diagnostics-workflow/) | 查「為什麼現在不符合預期」，只讀 desired state、render、Argo CD、Kubernetes、GitLab 或 GCP evidence。 |
| [`gitops-repo-audit`](.agents/skills/gitops-repo-audit/) | 在改檔前盤點 repo 結構、values、chart metadata、discovery 與 CI handoff 是否一致。 |
| [`gitops-implementation-workflow`](.agents/skills/gitops-implementation-workflow/) | 使用者批准精確 patch 後，負責最小改檔與驗證。 |
| [`gitops-mr-summary`](.agents/skills/gitops-mr-summary/) | 根據 branch、diff、MR evidence 與 validation 結果撰寫精簡 MR 說明。 |

### Helm、GCP 與 runtime

| Skill | 白話說明 |
| --- | --- |
| [`flex-app-version-upgrade`](.agents/skills/flex-app-version-upgrade/) | 比較 service wrapper 升級前後的 chart behavior、selectors、globals 與 migration risk。 |
| [`flex-app-chart-maintenance`](.agents/skills/flex-app-chart-maintenance/) | 維護 shared `flex-app` chart 的 public values、defaults、schema、templates、KEDA 與 compatibility。 |
| [`gcp-monitoring-dashboard`](.agents/skills/gcp-monitoring-dashboard/) | 設計或維護 Cloud Monitoring dashboard、metric query/filter、metrics scope 與成本。 |
| [`runtime-dependency-ops`](.agents/skills/runtime-dependency-ops/) | 追查 workload、identity、secret references、database、queue、cache、storage 與 worker 的 runtime wiring。 |
| [`tf-services-terraform-maintenance`](.agents/skills/tf-services-terraform-maintenance/) | 在指定的 `tf-services` repo 中解釋 Terraform、檢查 plan，或執行已批准的小改動。 |

### 跨 repo 與 agent 維護

| Skill | 白話說明 |
| --- | --- |
| [`service-delivery-topology`](.agents/skills/service-delivery-topology/) | 整理 frontend、BFF、backend、CI、hosting/GitOps、routes、config 與 state 的跨 repo 關係。 |
| [`orchestrator`](.agents/skills/orchestrator/) | 只有在你明確要求 subagent/parallel work，或 selected workflow 真的需要 independent validation 時才使用。 |
| [`devops-pi-agent-maintenance`](.agents/skills/devops-pi-agent-maintenance/) | 維護這個 repo 的 skills、extensions、`AGENTS.md`、README、settings 與 regression contracts。 |

每個 skill 的 `SKILL.md` 只保留 routing 與核心流程；較長的操作方式放在
`references/`，可重複檢查放在 `scripts/`。已封存的 `gitops-router` 位於
`.agents/archive/`，不再是可選工作入口。

## Pi Extensions：把重要限制做成程式

| Extension | 功能 |
| --- | --- |
| `bash-guard` | 阻擋部分高風險、無界限輸出與同一輪中的重複成功 command。 |
| `lean-context` | 將大型純文字結果限制為 80 行 head、40 行 tail 與 24 KiB，並記錄非 context 的 turn metrics。 |
| `subagents` | 提供 bounded、read-only 的 `scout` 與 `researcher` child agents。 |
| `web-search` | 透過 workspace 管理的 self-hosted SearXNG 做 web search。 |
| `web-fetch` | 讀取 HTTPS 頁面、PDF 與可轉成文字的文件內容。 |

SearXNG 的安裝與驗證方式見 [`searxng/README.md`](searxng/README.md)；web search
extension 的設定見 [`extensions/web-search/README.md`](extensions/web-search/README.md)。

### Subagent 的責任邊界

Subagent 不是另一個會自行做決定的工程師，而是隔離的 evidence collector：

```text
Parent model：規劃、判斷、保留 approval context、整合證據、負責實作
  ├── scout：Luna / low，讀 local repositories
  └── researcher：Terra / low，查外部文件
```

每次 parallel request 最多四個 tasks，每個 child 最長五分鐘。Children 不繼承 parent
conversation，固定使用 `--no-session`、`--no-skills`、`--no-extensions` 與 profile
允許的 read-only tools。這套設計沒有 editing `worker`。

## 更新 workspace-local extensions

Initializer 為了保護 local customization，**不會覆寫已存在的 extension source**。
因此 repo 更新後，`--check` 顯示 ready 不代表內容已是最新版。

若要更新單一 extension，先確認 installed copy 沒有需要保留的 local change，再移除並
重新初始化。例如更新 `subagents`：

```bash
rm -rf <workspace-root>/.pi/extensions/subagents
cd <workspace-root>/devops-pi-agent
./scripts/init-workspace.sh --workspace-root <workspace-root>
```

接著在已開啟的 Pi session 執行：

```text
/reload
```

這只更新 workspace-local copy，不會修改 global Pi extensions。

## Repository 地圖

| 路徑 | 用途 |
| --- | --- |
| `AGENTS.md` | 每一輪都要遵守的安全、approval、workspace 與 routing contract。 |
| `.agents/skills/` | 依工作類型載入的專用 workflows。 |
| `.agents/shared/` | 多個 skills 共用的 deterministic scripts、references 與 invocation fixtures。 |
| `extensions/` | Workspace-local Pi safety、context、search、fetch 與 subagent extensions。 |
| `config/` | 不會自動套用的 settings baseline。 |
| `scripts/init-workspace.sh` | 建立 symlink、安裝 local extensions 與檢查 readiness。 |
| `searxng/` | Loopback-only SearXNG templates、config generator 與 verifier。 |
| `docs/llm-wiki/` | 給 LLM/RAG 使用的 GitOps、chart 與 repo ownership 知識。 |
| `docs/session-notes/` | 讓後續 session 可以接手的短紀錄。 |
| `.agents/archive/` | 已停用、只保留歷史查詢的 workflows。 |
| `tmp/` | Git-ignored local 暫存區；agent 不會讀取其中的 secret plaintext。 |

## 維護與驗證

修改 skills、extensions、`AGENTS.md`、README 或 settings policy 時，先使用
`devops-pi-agent-maintenance` 確認規則應該由哪一層負責，避免同一功能出現多個
source of truth。

固定檢查：

```bash
npm run test:contract
npm run test:extensions
git diff --check
```

目前 deterministic contract 會檢查 skill metadata、README inventory、invocation
fixtures、extension registration、JSON 與 extension unit tests。Unit tests 不會呼叫
付費模型。

只有 skill routing boundary 有實質變更時，才執行付費 benchmark：

```bash
npm run benchmark:invocation -- \
  --provider <provider> --model <model> --thinking low
```

Benchmark 以模型是否真的讀取目標 `SKILL.md` 判定 invocation，raw artifacts 會寫入
git-ignored `tmp/`。執行前應先確認 provider、model、預算與 authentication。

## 設計原則與致謝

回覆預設採用 answer-first、短標題、有限步驟、可見進度與一個明確下一步。這些原則整合
了此 repo 過去 `caveman`、`stop-slop` 的有效部分，並參考
[`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd)（MIT）的低工作記憶
負擔設計。它們是一般溝通與介面原則，不假設使用者有任何診斷。

具約束力的 agent 行為以 [`AGENTS.md`](AGENTS.md) 與各 skill contract 為準；README
負責讓人快速理解產品定位、使用方式與維護入口。
