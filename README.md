# Pi Agent Config

**讓 Pi Coding Agent 成為有一致工作流程、證據標準與安全邊界的 DevOps 工作助手。**

Pi Agent Config 是面向多 repository workspace 的 Agent 配置產品，將操作規則、領域 skills、
subagent extension、知識庫與本機工具設定集中維護。透過一次 workspace 初始化，讓不同工作
環境使用同一套可檢查、可更新的配置，不必為每個專案重複設定。

它是 Pi 的配置與工作流程層，不是 application monorepo、部署平台或權限沙箱。
各工作 repository 仍保有自己的 Git history、branch、remote 與交付流程。

## 適合哪些工作

- **DevOps 與平台維運**：以唯讀證據診斷 Kubernetes、Argo CD 與 GCP 問題，分清 source、
  desired state、render、live resources 與 runtime，避免把設定檔當成部署成功的證明。
- **Infrastructure 與交付變更**：使用 Terraform plan-first、Helm render 與相容性流程，
  依影響範圍選擇驗證，而不是每次執行整套無關檢查。
- **跨 repository 開發**：在共同 workspace 中工作，但保持各 repository 的 ownership、
  branch 與既有變更邊界。
- **團隊與個人工作環境維護**：集中更新 Agent 規則、專用 skills、kubectl alias 與 Bash 設定。

## 核心能力

| 能力 | 提供的價值 | 入口 |
| --- | --- | --- |
| Workspace 行為契約 | 統一授權、證據、秘密保護與交付規則 | [`AGENTS.md`](AGENTS.md) |
| 領域 skills | 按任務載入操作流程與驗證要求 | [`.agents/skills/`](.agents/skills/) |
| 唯讀 subagents | 委派有界調查，主 Agent 保留決策、修改與驗收責任 | [`extensions/subagents/README.md`](extensions/subagents/README.md) |
| OKF 知識庫 | 以索引與概念導航取得技術背景 | [`knowledge/index.md`](knowledge/index.md) |
| Workspace 初始化 | 安裝受管理配置，保留未知 extensions，回報 drift | [`scripts/init-workspace.sh`](scripts/init-workspace.sh) |
| kubectl 偏好設定 | 集中維護 `kuberc` alias，連結到目前使用者環境 | [`config/kuberc`](config/kuberc) |
| Ubuntu／WSL Shell 設定 | 保存提示符、常用別名與 lazy-load 設定 | [`config/bashrc-cosmetics.sh`](config/bashrc-cosmetics.sh) |

## 快速開始

### 1. 準備環境

完整初始化需要 shell 能找到 `bash`、`node`、`npm` 與 `pi`，以及腳本使用的 GNU 工具
（例如 `realpath` 與 `find`）。建議安裝 `make`；沒有 `make` 也能直接呼叫 initializer。
如果 Node 由 NVM 管理，先在目前 shell 選定版本。

將本 repository 與工作專案放在同一層：

```text
<workspace-root>/
├── pi-agent-config/
├── gitops-repository/
├── chart-repository/
├── application-repository/
└── docs/
```

目錄名稱可自行選擇；initializer 預設使用本 repository 的上一層作為 workspace root。
這個佈局不會合併任何 Git history。

### 2. 初始化 workspace

在本 repository 執行：

```bash
make workspace-init
```

指定其他 workspace：

```bash
make workspace-init WORKSPACE_ROOT=<workspace-root>
```

沒有 `make` 時：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
```

完整初始化會修改 workspace 配置、安裝 extension dependencies 與 project-local Pi package，
並建立 `$HOME/.kube/kuberc` 連結；套件安裝需要網路。它不登入雲端、不讀取 kubeconfig，
也不執行任何 cluster 操作。初始化不是交易式操作：後段套件安裝失敗時，前段已完成的
配置可能仍保留；排除錯誤後可重新初始化，再檢查狀態。

### 3. 檢查與啟動

```bash
make workspace-check
cd <workspace-root>
pi
```

Pi 在信任 project 後才載入 project-local settings、extensions 與相關資源。
請從 workspace root 啟動，避免因啟動在 target repository 內而額外載入該專案的 context files。
更新 extensions 或 skills 後，已開啟的 Pi session 可使用 `/reload`。

`workspace-check` 是唯讀配置檢查，不代表 cluster、runtime 或所有工具相容性已驗證。

## 安裝與更新模型

### 哪些資源由產品管理

| 目的地 | 行為 |
| --- | --- |
| `<workspace-root>/AGENTS.md` | 重建指向本 repository canonical contract 的相對 symlink |
| `<workspace-root>/.agents/skills` | 重建指向本 repository skills 的相對 symlink |
| `<workspace-root>/.pi/extensions` | 重新複製受管理 extensions，重新安裝 dependencies |
| `<workspace-root>/.pi/settings.json` | 協調受管理 package registration，保留其他 settings |
| `<workspace-root>/.pi/npm/node_modules/pi-web-access` | 安裝 pinned `npm:pi-web-access@0.23.0` |
| `<workspace-root>/.pi/pi-agent-config-managed.json` | 記錄受管理 extension 名稱 |
| `$HOME/.kube/kuberc` | 建立指向本 repository `config/kuberc` 的相對 symlink |

`package.json` 的 `pi.extensions` 必須與 `extensions/` 目錄 inventory 一致，否則初始化停止。
Initializer 只清除 manifest 與目前 source 所列的受管理 extensions，未知 extensions 保留。
`pi-web-access` registration 使用 `extensions: []`，避免 parent session 自動載入 web tools；
外部搜尋由 `researcher` child 透過明確路徑載入。

現有 contract 路徑或 kuberc 若不是預期的受管理 symlink，initializer 會保留並停止，
不自動覆寫或合併。Symlink 形式的 `.kube` 目錄也會被拒絕。
它不管理 global Pi extensions 或 `~/.pi/agent/extensions`。

更新本 repository 的內容後，重新執行 `workspace-init` 和 `workspace-check`。
Contract、skills 與 kuberc 採 symlink，因此 source 變更會直接反映在已連結環境；
extensions 則需重新初始化才能更新 workspace copy。請保留 repository 的原路徑。

### 最小安裝

只需要 contract 與 skills、不需要 extensions 或套件安裝時：

```bash
make workspace-contract-only WORKSPACE_ROOT=<workspace-root>
```

等同於 initializer 的 `--no-pi-local`，只建立 contract 與 skills links，不套用 kuberc。

### 狀態檢查

`make workspace-check`（或 initializer 的 `--check`）會回報：

- Contract 與 skills symlink 是否存在。
- kuberc 為 `ready`、`missing` 或 `unmanaged (preserved)`。
- Pi executable 的位置。
- 受管理 extensions 為 `ready`、`missing` 或 `drifted`；未知 extensions 標示保留。
- Extension manifest、dependencies 與 child-only web-access package 狀態。

Contract／skills 的檢查只回報 symlink 是否存在；kuberc 檢查連結 ownership。
這些訊號不等同完整內容、kubectl 相容性、runtime 功能或部署就緒驗證。

## 日常使用

### 指派工作

直接要求修改就授權具名 repository 與範圍內的本機實作，預設流程是：

```text
調查 → 重新檢查 target branch/status → 範圍內修改 → 驗證 → 回報
```

不強制先寫 spec，也不重複確認已授權的實作細節。診斷、review 或規劃本身不授權修改；
目標、安全條件不明，或需要擴大範圍時，Agent 才停止詢問。
只有明確要求 spec 才使用 spec workflow，規劃完成後仍需另行授權實作。

### 初始化本機 workspace 背景

明確要求 Agent「初始化 workspace」時，Agent 可在 initializer 之外盤點直接子專案，
建立本機 `.pi/APPEND_SYSTEM.md`，不額外啟動付費 LLM session。Shell initializer 本身
不建立背景，也不自行呼叫 Agent；只要求建立背景不會觸發套件安裝。

背景只記錄有證據的專案責任、工具與使用者別名，不保存 secrets、部署狀態或任務 spec。
上限為 80 行／6 KiB；普通初始化保留既有背景，只有明確要求更新才調整。
目的地必須位於本公開 repository 外；若有 Git owner，必須事先 ignored 且 untracked，
並通過 Git 與 symlink 邊界檢查，不代改 ignore 規則。

Pi 在 project trust 後載入 project `APPEND_SYSTEM.md`；它取代同名 global 檔案，不合併。
建立後應在新 context 中確認背景確實生效。

### kubectl alias

完整初始化後，支援 `kuberc` v1beta1 的 kubectl 可使用：

```bash
kubectl argocd
```

對應 `port-forward svc/argocd-server 8080:80`，namespace 預設為 `argocd`，可用 `-n` 覆寫。
使用目前的 kube context，不固定叢集；請自行確認目標後再執行。
產品只安裝設定，Agent 不會代為啟動 port-forward。

kuberc 自 Kubernetes v1.34 起為 Beta。若 `KUBERC` 指向其他檔案或功能已停用，
此設定可能不生效；initializer 不改寫相關環境變數。
參考：[kuberc 官方文件](https://kubernetes.io/docs/reference/kubectl/kuberc/)。

### 可選 Pi 設定

[`config/pi-settings-baseline.json`](config/pi-settings-baseline.json) 是 opt-in baseline，
不會由 initializer 自動套用。要採用最低限度設定，可將以下 keys 合併到
`<workspace-root>/.pi/settings.json`，保留既有 packages 與個人選項：

```json
{
  "defaultThinkingLevel": "low",
  "showCacheMissNotices": true
}
```

Thinking 使用 Pi/provider 的預設預算，不代表無限 token。遇到跨 repository 衝突、不熟悉的
API 或無法界定的 blast radius，再以 `Shift+Tab` 提升 thinking level。
較長的 subagent 回報也會增加 context 成本。

## 領域 skills 與知識庫

| Skill | 適用情境 |
| --- | --- |
| [Kubernetes platform guidance](.agents/skills/kubernetes-platform-guidance/README.md) | 資源設定、GitOps 關聯、服務故障與 runtime 身分的唯讀診斷 |
| [Terraform workflow guidance](.agents/skills/terraform-workflow-guidance/README.md) | 跨 repository 的 plan-first infrastructure 工作 |
| [Helm chart best practices](.agents/skills/helm-chart-best-practices/README.md) | Chart 設計、values/schema、render 與相容性驗證 |
| [MR summary](.agents/skills/mr-summary/README.md) | 根據 repository evidence 撰寫繁體中文 MR 文案 |
| [OKF knowledge](.agents/skills/okf/README.md) | 知識庫建立、驗證、格式轉換與維護 |
| [Learn from work](.agents/skills/learn-from-work/README.md) | 手動啟用的實作後教學、練習與理解檢查 |

各 skill 的適用範圍與流程以自己的 `SKILL.md` 為準。Learn from work 使用
`disable-model-invocation: true`，不自動選用；可用 `/skill:learn-from-work` 手動啟用，
預設只在聊天中教學，不修改專案、不執行測試，也不保存學習紀錄。

知識庫採 Open Knowledge Format v0.2，從 [`knowledge/index.md`](knowledge/index.md)
導航，格式與維護方式見 [`knowledge/README.md`](knowledge/README.md)。
知識只提供 prior context，不證明目前部署或 runtime state；讀取知識不授權 enrichment、
自動更新、ingestion、serving 或發布。知識與模板使用英文；引用與不確定性需保留。

## 可選 Ubuntu／WSL 環境設定

```bash
bash scripts/setup-ubuntu-shell.sh
```

預設只更新 `~/.bashrc` 的 managed block，保留其他內容；首次修改保存
`.pi-agent-config.bak`，重跑不覆蓋備份。支援 `--bashrc PATH`；遇到 symlink 或損壞 markers
則停止。需要 Python 3，開新終端後生效。

配置包含彩色 user/path/Git branch/Kubernetes context 提示符，以及 `k`、`kx`、`kn` aliases。
Git 不主動掃描 dirty/untracked；缺少 helper 時省略相關提示符。NVM 在首次使用
`nvm`／`node`／`npm`／`npx` 時載入，不在每次 Bash 啟動執行 `brew shellenv`。
設定內嵌於 bashrc，不依賴 repository 位置；舊版重複設定不會自動刪除。

`--install-tools` 是另外的使用者操作模式，會安裝 Git、Homebrew、kubectl、kubectx/kubens、
kube-ps1、Helm、Terraform、NVM 與 gcloud CLI；不安裝 Node、不登入或設定 cloud project。
需要正常使用者、受支援 Ubuntu、sudo 與網路，會修改 APT sources 與安裝目錄，並下載執行
官方 Homebrew／NVM installer。請先審閱腳本；它不是版本完全可重現的套件管理器，
已安裝套件不主動升級。Homebrew 假設標準 Linux prefix `/home/linuxbrew/.linuxbrew`。

來源：[Homebrew](https://docs.brew.sh/Homebrew-on-Linux)、
[NVM](https://github.com/nvm-sh/nvm/tree/v0.40.7)、
[Terraform](https://github.com/hashicorp/homebrew-tap)、
[gcloud](https://docs.cloud.google.com/sdk/docs/install-sdk)。

## 安全與產品邊界

完整規則以 [`AGENTS.md`](AGENTS.md) 為準；README 是產品操作入口，不建立另一套授權契約。

- **唯一 workspace contract**：不讀取或採用其他 target、sibling、nested 專案的
  `AGENTS.md` 或替代規則檔。Pi 自身的 context discovery 與 project trust 是不同機制。
- **本機實作、遠端唯讀**：Kubernetes、Argo CD、GitLab/GitHub、GCP 與 Git remotes
  對 Agent 維持 inspection-only；不 commit、push、merge 或操作部署。變更走既有 MR、CI、GitOps。
- **不自動改文件**：修改程式或配置不授權補 README、spec、ADR 或報告。只有明確指定
  repository 與文件範圍才寫入；一般結果在聊天回報。未指定路徑的 workspace 文件使用 `docs/`。
- **保留使用者狀態**：修改前檢查目標 branch、staged/unstaged changes；不丟棄既有變更。
  本產品明確維護可在 `main` 進行；其他 repository 的 branch 與文件例外以 contract 為準。
- **秘密禁讀**：不讀取 credentials、raw kubeconfig、token、private keys 或 `.env`。
  家目錄例外只限明確授權的 `~/.bashrc` 與非秘密 `~/.kube/kuberc`。
- **行為規則不是沙箱**：本產品不提供 OS 隔離、強制檔案攔截或 infrastructure 權限控制；
  使用者仍須管理執行環境、project trust 與最小權限。

本 repository 視為公開產品內容。不要寫入公司、客戶、私人系統名稱、credentials 或私有
調查證據；範例使用 placeholders 與 reserved domains。內容審查不會清除既有 Git history。

## 維護與驗證

根目錄 README 維護產品入口與操作流程；extension、skill 與知識庫的細節留在各自文件。
不要在此複製完整領域規則或保存某次調查的私人結果。

可在本 repository 執行對應的 deterministic checks：

```bash
npm run test:init-workspace
npm run test:makefile
npm run test:ubuntu-shell
npm run test:okf
```

初始化與 Shell 測試使用 temporary fixtures，不執行真實環境安裝。
OKF 檢查需要 Python 3 與 PyYAML，dependency 宣告在
[`.agents/skills/okf/requirements.txt`](.agents/skills/okf/requirements.txt)。

Agent 驗證依變更分為 V0–V3：文件檢查、結構化配置、部署/render 行為，以及
Terraform/IAM/network/shared API/security gate。領域 skill 可提高但不降低驗證要求。
每次選擇能覆蓋改動的最小檢查，不以無關測試通過宣稱就緒。

交付回報包含變更摘要、驗證結果與缺口；仍有工作時提供下一步。
Repository 檔案變更後附建議 commit message，但不代為建立 commit。
