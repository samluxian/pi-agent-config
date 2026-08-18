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
| 精準的 skill routing | Pi 直接使用精簡且互斥的 skill descriptions；`AGENTS.md` 不重複維護 routing table。 |
| Human-in-the-Loop 實作 | Delivery 變更採用「分析 → 提案 → 使用者批准 → 改檔 → 驗證」。 |
| 分層查證 | 分開 application、CI、GitOps desired state、Helm render、Argo CD、Kubernetes 與 runtime/GCP evidence。 |
| 精簡 context | 大型 tool output 保留有用的開頭與結尾，完整內容放在受限 temp file，不讓舊輸出持續佔滿 context。 |
| 防止重複 loop | 阻擋部分無界限 Kubernetes dump，以及同一輪中重複執行剛成功的相同 command。 |
| 可重複驗證 | 固定的 repo preflight、Helm summary、diagnostic snapshot、skill fixtures 與 extension tests。 |
| 有邊界的 subagent | 高容量 read-only evidence 預設由 children 蒐集並回傳 bounded summary；parent 保留規劃、決策與 mutation authority，Terra worker 只執行已批准且檔案 ownership 明確的隔離 edits。 |

## 適合哪些工作

這套工具特別適合：

- GitOps desired state、Helm values、Argo CD 與 Kubernetes troubleshooting；
- GitLab CI handoff、MR summary、個人工作回顧與 branch readiness；
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
<workspace-root>/.pi/settings.json
<workspace-root>/.pi/npm/node_modules/pi-web-access
```

前兩個 contract paths 是指向此 repo canonical files 的相對 symlink；Pi extensions
會協調到 workspace local scope：安裝缺少項目、更新 drifted copy，並移除 repo 中不
存在的 workspace-local extension。Initializer 也會透過 Pi project settings 安裝 pinned
`npm:pi-web-access@0.23.0`，同時保留其他 `.pi/settings.json` keys。Global Pi packages
與 `~/.pi/agent/extensions` 不在此腳本的管理範圍。

### 3. 確認安裝

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
```

`--check` 會確認 symlink 與 Pi executable，並把 extensions 標示為 `ready`、
`missing`、`drifted` 或 `unwanted`，同時顯示 manifest、dependencies 與 pinned
`pi-web-access` project package 狀態。

### 4. 從 workspace root 啟動 Pi

```bash
cd <workspace-root>
pi
```

Pi 在信任 workspace 後，就能讀取 `AGENTS.md`、project-scoped skills 與 local
extensions。

### 只安裝 contract 與 skills

如果暫時不需要 Pi extensions 或 project-local `pi-web-access` package：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root> --no-pi-local
```

## 常見使用方式

你不需要記住 skill 名稱，直接描述目標與限制即可：

```text
幫我盤點這個 k8s-deploy repo 的 service values 是否一致，先不要改檔
```

```text
讀取 flex-app 升級區間的 Release notes，核對 chart/render 後提出 wrapper 更版計畫
```

```text
根據 flex-app release tag diff 與驗證結果，撰寫中文產品化 GitLab Release note
```

```text
根據目前 branch diff 幫我寫一段精簡的中文 MR 說明
```

```text
用台灣時間整理我 7/27 到 7/31 的 GitLab 活動，每天用第一人稱寫一句；不足時再參考指定的 GitHub 日期
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
會停下來請你先切換 branch。同一交付主題的前一個 MR 已合併或 remote source branch 已刪除
時，若你明確要求沿用原 branch，agent 會在確認 target ref 最新、原 branch tip 已包含於 target、
working tree 可控且 follow-up diff 有限後繼續，而不會只因 branch 曾合併就要求另開 branch；
下一次 push 仍會重新建立 remote branch，並需要新的 MR。

### Secret 不進 context

Agent 不會讀取、解碼、列印或搬移 secret values、private keys、kubeconfig、`.env` 或
credential files，也不會把敏感值改放到 ConfigMap。需要取出 secret 時，只能提供由你
執行的指令，且輸出必須留在 git-ignored 的 local `tmp/`。

### 先看摘要，再決定是否深入

預設優先使用 `custom-columns`、JSONPath、`jq`、field selector、`--tail` 與 `--since`。
只有摘要出現具體 mismatch、missing field 或 error 時，才繼續查較完整的 manifest、
logs、diff 或 trace。

完整且具約束力的安全規則以 [`AGENTS.md`](AGENTS.md) 為準。

## Skills：依工作載入專用流程

Pi 啟動時只看 13 個 skills 的 `name + description`；語意命中後才讀取完整
`SKILL.md`。`AGENTS.md` 不保存重複的 routing table。

### 可語意觸發的 skills

| Skill | 用途 |
| --- | --- |
| [`gitops-diagnostics-workflow`](.agents/skills/gitops-diagnostics-workflow/) | 唯讀診斷 desired state、render、Argo CD、Kubernetes、GitLab 或 GCP mismatch。 |
| [`gitops-repo-audit`](.agents/skills/gitops-repo-audit/) | 靜態盤點 discovery、values、chart metadata、CI handoff 與 review readiness。 |
| [`k8s-service-delivery`](.agents/skills/k8s-service-delivery/) | 依固定 flex-app 契約導入或維護服務，分離 deployment values 與 app-config，並驗證 discovery/render。 |
| [`k8s-infra-delivery`](.agents/skills/k8s-infra-delivery/) | 在精確批准後修改 bootstrap、App-of-Apps、infra 元件或平台 CI handoff。 |
| [`gitops-mr-summary`](.agents/skills/gitops-mr-summary/) | 依 branch、diff 與 validation evidence 撰寫 MR copy。 |
| [`developer-activity-summary`](.agents/skills/developer-activity-summary/) | 以唯讀 `glab`／`gh` evidence 整理指定日期的工作回顧。 |
| [`flex-app-version-upgrade`](.agents/skills/flex-app-version-upgrade/) | 核對 release notes、chart source，並比較 selectors、PDB、autoscaling、KSA/GSA 等 render specs 與 wrapper migration。 |
| [`flex-app-chart-maintenance`](.agents/skills/flex-app-chart-maintenance/) | 維護 shared chart contract、KEDA、globals、compatibility 與 release notes。 |
| [`runtime-dependency-ops`](.agents/skills/runtime-dependency-ops/) | 追查 request path、workload、identity、database、queue、cache、storage 與 worker failure。 |
| [`tf-services-terraform-maintenance`](.agents/skills/tf-services-terraform-maintenance/) | 在指定 `tf-services` repo 解釋、plan-review、維護 Terraform，依 Google Cloud 官方規範檢查 architecture，並以繁體中文維護 Terraform README。 |
| [`service-delivery-topology`](.agents/skills/service-delivery-topology/) | 分析跨 repository 的 service delivery topology 與 extraction impact。 |
| [`orchestrator`](.agents/skills/orchestrator/) | 預設委派高容量 read-only discovery，也處理明確的 subagent 要求與 workflow-required independent validation。 |
| [`devops-pi-agent-maintenance`](.agents/skills/devops-pi-agent-maintenance/) | 維護本 repo 的 agent contract、skills、extensions 與 regression checks。 |

兩個 Flex App skills 都維持自動：chart maintenance 生產 shared contract 與
release evidence；version upgrade 消費這些 evidence 並驗證 wrapper compatibility。

每個 skill 只要求 `SKILL.md`，不維護 provider-specific UI metadata。`SKILL.md`
只保留 task boundary、核心流程、停止條件與 output contract；深層程序放在
`references/`，可重複檢查放在 `scripts/`。

## Pi Extensions：把重要限制做成程式

| Extension | 功能 |
| --- | --- |
| `humanizer` | 每輪將精簡 humanizer 規則套用至一般回覆與說明文件，並提供 `/humanizer` 完整改寫模式。 |
| `subagents` | 提供 read-only `scout`、`researcher`、`environment-scout`，以及 approval-gated editing `worker`。 |
| `pi-web-access` | Pinned project-local package，提供 `web_search`、`fetch_content`、source checking 與 bounded content retrieval。 |

### 英文與繁體中文 Humanizer

`humanizer` 是 Pi extension，不是自動觸發的 skill。啟用後，它會透過
`before_agent_start` 在每輪加入精簡 style layer，套用至一般回覆，以及 agent 產生或修改
的說明文件。這個模式使用目前 session 選定的模型直接生成內容，不會再呼叫第二次模型，
因此不會加倍延遲與費用；實際語氣品質仍取決於目前模型。

需要針對既有文字執行完整 35-pattern review 時，使用 `/humanizer`。Extension 會將完整
中英文規則與待改寫文字包成一個獨立 user message：

```text
/humanizer In order to achieve this goal, the system has the ability to process requests.
```

只輸入 `/humanizer` 時，Pi 會開啟多行 editor。需要比對個人語氣時，可使用以下標記：

```text
[寫作樣本]
貼上自己過去寫的 2–3 段文字

[待改寫文字]
貼上要改寫的內容
```

中文輸出預設使用台灣繁體中文，並保留 Kubernetes、GCP、Helm、Terraform、resource
names、commands、code blocks、URLs 與其他 technical identifiers。它會檢查中英文常見
LLM filler，但不把單一 pattern 當成 AI 證據，也不提供 AI 機率。預設只回傳最終改寫，
不直接讀寫檔案；為避免截斷造成事實遺失，每次輸入限制為 1,500 行且不超過 48 KiB，
較長文件應分段處理。

英文 patterns 改編自 MIT 授權的
[`blader/humanizer`](https://github.com/blader/humanizer) 2.11.1；copyright 與完整授權文字
保留在 [`extensions/humanizer/THIRD_PARTY_NOTICES.md`](extensions/humanizer/THIRD_PARTY_NOTICES.md)。

### Subagent 的責任邊界

Subagent 不會取得 delegated authority。任何 selected domain skill 都可以把 orchestrator
當 companion skill。當 read-only evidence acquisition 需要多次搜尋或讀取、涵蓋多個大型
source，或 raw output 可能主導 parent context 時，預設載入 orchestrator 並委派；使用者明確
要求 delegation 或 workflow 要求 independent validation 時也會載入。Domain skill 保留
task-specific evidence 與 stop conditions。已知路徑的簡單 I/O 由 parent 直接執行，避免
重複 scout。Child prompt 採
ASD-STE100-inspired Simplified Technical
English（不宣稱完整合規）：使用短句、每句單一動作，以及固定的 `GOAL`、`INPUT`、
`DO`、`DO NOT`、`STOP`、`RETURN` 欄位；明確限制 paths、evidence、output 與 blocker
behavior，禁止 child 自行擴大 scope。Parent 保留規劃、判斷、approval context、
mutation authority、證據整合與最終驗證：

```text
Parent model：定義 scope、批准狀態、file ownership 與 validation
  ├── scout：Luna / medium，read-only local repository evidence
  ├── researcher：Terra / medium，read-only web search 與 source evidence
  ├── environment-scout：Luna / medium，structured read-only kubectl/gcloud evidence
  └── worker：Terra / medium，只執行已批准、ownership 明確的 isolated file edits
```

每次 parallel request 最多四個 read-only tasks；worker 只能 single mode，避免 concurrent
edit collisions。每個 child 最長五分鐘且不繼承 parent conversation，固定使用
`--no-session`、`--no-skills`、`--no-extensions` 與 profile exact tool allowlist。
Researcher 與 worker 會從 project-local `pi-web-access` 明確載入 `web_search` 和
`fetch_content`。Environment scout 只接受固定 inspection operations，直接傳 argv 給
`kubectl`/`gcloud`，不接受 shell 或 arbitrary flags；它封鎖 secret/config contents 與
mutation operations，並限制 output。Worker 只能再委派 read-only `scout`、`researcher`
與 `environment-scout`。Worker 的 `safe_bash` 只在 child 載入，而且只是 dangerous-pattern
blocklist，不是 sandbox。

## 更新 workspace-local extensions

Initializer 會把 repo 內的 extension directories 視為完整 desired state。每次執行都會
安裝 missing extension、更新 drifted copy，並刪除 repo 中不存在的 workspace-local
extension。不要把只存在 workspace copy 的 customization 放進 `.pi/extensions/`；應先
納入此 repo 再重新初始化。

協調完成後，在已開啟的 Pi session 執行 `/reload` 載入最新版本。這個流程只管理
workspace-local copies，不會修改 global Pi extensions 或 packages。

## Repository 地圖

| 路徑 | 用途 |
| --- | --- |
| `AGENTS.md` | 每一輪都要遵守的安全、approval、workspace 與 evidence invariants；不包含領域 workflow 或 routing table。 |
| `.agents/skills/` | 依工作類型載入的專用 workflows。 |
| `.agents/shared/` | 多個 skills 共用的 deterministic scripts、references 與 invocation fixtures。 |
| `extensions/` | Workspace-local Pi extensions，也是 initializer 的 copied desired state。 |
| `config/` | 不會自動套用的 settings baseline。 |
| `scripts/init-workspace.sh` | 建立 symlink、協調 local extensions 與檢查 readiness。 |
| `docs/llm-wiki/` | 給 LLM/RAG 使用的 GitOps、chart 與 repo ownership 知識。 |
| `docs/session-notes/` | 讓後續 session 可以接手的短紀錄。 |
| `.agents/archive/` | 已停用、只保留歷史查詢的 workflows。 |
| `tmp/` | Git-ignored local 暫存區；agent 不會讀取其中的 secret plaintext。 |

## 維護與驗證

修改 skills、extensions、`AGENTS.md`、README 或 settings policy 時，Pi 會依語意
載入 `devops-pi-agent-maintenance`，確認規則應由哪一層負責，避免重複的 source of
truth。

固定檢查：

```bash
npm run test:contract
npm run test:extensions
npm run test:init-workspace
git diff --check
```

目前 deterministic contract 會檢查 skill metadata、README inventory、invocation
fixtures、extension registration、JSON、extension unit tests 與 initializer
reconciliation。Unit tests 不會呼叫付費模型。只要 repository files 有修改，完成報告就會附 suggested commit message；
沒有修改則會明確說明。

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
