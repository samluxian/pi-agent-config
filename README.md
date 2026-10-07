# DevOps Pi Agent

DevOps Pi Agent 是一套放在 Pi Coding Agent workspace 裡的操作規則、skills、extensions
與驗證工具。它讓 Pi 知道該讀哪些證據、何時只能唯讀、什麼情況要先取得批准，以及修改後
該怎麼驗證。

這個 repository 是 workspace tooling，不是產品 monorepo，也不是部署平台。Application、
GitOps、Helm chart 與 infrastructure repositories 仍保有各自的 Git history、branch、remote
與權限。

使用者明確要求維護本 repository 時，可以直接在它的 `main` branch 建立、修改、重新命名
或刪除 repository-owned source、tests、scripts、extensions、configuration 與 documentation。
這個例外不延伸到 sibling/target repositories，不涵蓋 secrets、credentials、generated
artifacts、caches 或 git-ignored temporary files，也不允許 agent commit、push、修改 Git
或操作 remotes。

投影片 repository 另有窄範圍例外：使用者明確指定一個 presentation target repository，
並核准直接修改目前的 `main` 或 `master` branch 後，agent 可以修改 tracked slide source、
speaker notes、documentation 與 slide assets。工作樹可以保留不相關的既有變更，但核准的
目標檔案本身必須沒有既有變更，且 agent 不得碰觸其他變更。例外只適用於指定 repository
和核准範圍，不包含產品、部署、chart、infrastructure 或其他 target repositories，也不包含
依賴、lockfiles、build/runtime configuration、generated/git-ignored files、secrets、credentials、
Git 或 remote 操作。完整 authority boundary 以 [`AGENTS.md`](AGENTS.md) 為準。

## Repository 定位

這個 repository 管理四類內容：

| 路徑 | 責任 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 每輪都要遵守的安全、approval、workspace 與 evidence 規則。 |
| [`.agents/skills/`](.agents/skills/) | Pi 依工作類型載入，或由使用者手動啟用的專用流程。 |
| [`knowledge/`](knowledge/README.md) | Agent 先查 index、再按需讀取的純 Markdown LLM wiki。 |
| [`extensions/`](extensions/) | 在 Pi runtime 中註冊事件、指令或工具的程式。 |
| [`scripts/`](scripts/) | Workspace 初始化與 deterministic checks。 |

預設直接依使用者的修改要求實作，不強制先寫 spec 或再確認一次：

```text
調查 → 重新檢查 target repo branch/status → 範圍內修改 → 驗證
```

直接要求修改即授權該 repository 與範圍內的本機檔案變更，也可以建立實作所需的新檔，
不必先由使用者建立或追蹤。查詢、診斷、review 或規劃本身不授權實作。目標或安全條件
不明時仍須先釐清；若要擴大範圍或改變約定行為、驗收條件，才停止並詢問。範圍內的
實作細節不需要反覆核准。

只有使用者明確要求「寫 spec」或「用 spec 規劃」時才撰寫規格；
規劃完成後等待使用者要求實作。普通修改不自動產生 spec、plan 或其他文件。

### Workspace 規則與專案文件邊界

- `<workspace-root>/AGENTS.md` 是唯一的 workspace／project 行為契約；可依明確維護要求
  讀取或修改本 repository 的同一份 canonical source。System／developer 上層指令仍適用。
- 嚴禁主 agent 或 subagents 讀取、搜尋內容或載入其他專案（target、sibling、nested）的
  `AGENTS.md`，也不得改讀 `AGENTS.override.md`、大小寫變體、`CLAUDE.md` 等替代規則檔。
  即使 runtime 自動提供專案規則，也不把它當成額外專案 policy。
- 修改 code／CI／config 不授權順帶修改專案 `docs/`、README、SDD、ADR、plan 或文件索引，
  也不授權自行生成 spec／report 或執行會寫文件的同步工具。一般交付只在聊天中回報。
- 只有使用者明確要求並指定 repository 與文件路徑或有界文件集合時，才修改專案文件。
  本 tooling repository 的明確維護要求可包含自身的使用者文件，不延伸到其他專案。
- 這些邊界同樣適用於 skills、helpers 與委派任務，不接受 target 專案規則要求自動補文件。

這是行為契約，不是檔案讀取的 runtime 攔截。Pi 自身會依啟動目錄與父目錄探索 context files；
從 workspace root 啟動可避免因啟動在 target 內而額外載入該 target 的規則。

常駐授權與安全規則由 `AGENTS.md` 管理；領域 skills 補充設計與驗證，不另設重複核准。
Secret、credential、generated／ignored 檔案、branch、repository ownership、Git 與遠端
mutation 的限制不變。這是文字行為契約，不是 runtime 強制攔截機制。
完成後依使用者要求或已核准 spec 回報驗收結果與證據缺口。

Kubernetes、Argo CD、GitLab/GitHub、GCP 與 Git remotes 對 agent 維持唯讀。交付變更寫入
repository 的 desired state，再走原有 MR、CI 與 GitOps 流程。Agent 只在明確需求、既有 contract
或已證實的重複案例支持下新增複雜度；前兩個相似案例維持局部處理，第三個真實案例才考慮抽出共用
contract。需求或 integration 尚未確定時，優先採用可逆且隔離的做法。Agent 回報基礎設施時間時，會標示來源時區，
並在已知使用者時區時先換算再比較或估計；未知時則明確保留UTC並詢問。變更完成後，回覆固定
保留 Summary；尚有工作才提供 Next step。驗證結果、缺口與具體風險只在適用時寫進 Summary。完整
修改 repository 檔案後，回報會附上僅含英文小寫的建議 commit message；不會代為 commit。
完整規則以 [`AGENTS.md`](AGENTS.md) 為準。

Agent 會直接執行工具可存取且規則允許的唯讀檢查，整理證據並給出結論，不把診斷工作
交回使用者。它可以先從既有 kube context 或 authenticated gcloud configuration 取得非敏感
context、account 與 project identifiers；若目前設定無法唯一定位，可列出最多 100 個
kube context 名稱或登入身分可見的 GCP projects（可見不代表擁有），再執行具名、欄位化
且有輸出上限的資源查詢。多個合理目標或證據衝突時才詢問使用者；不會
讀取 raw kubeconfig、token 或 credential。Terraform MR 或 pipeline identifier 已知時，Agent
也會讀取實際 pipeline 與 plan job，分開回報 CI plan 和 local plan。無法存取目標環境時會
明確說明限制。排查時若仍有可執行、能區分可能原因的安全唯讀檢查，Agent 會繼續查，
不把症狀或第一個 probe 當成結論。一般只有使用者明確要求才提供操作命令；例外是下一個
關鍵檢查因存取或權限邊界只能由使用者執行，且目標已知、指令安全唯讀時，Agent 會主動
給一條有範圍的指令、預期訊號與需回傳的非機密結果。目標不明或無安全指令時，只描述
缺少的資訊或檢查方式。使用者明確要求 GCP／IAM 變更或 Helm 安裝指令，且目標已知、
範圍明確時，Agent 可提供供使用者自行執行的指令與風險說明，但不會代為執行；IAM 仍須
符合最小權限。提供 Helm 安裝指令前，須確認 Workload Identity 綁定及 Secret Manager
最小讀取權限；無法確認時須標明尚未證實就緒，render 通過不代表兩項前提已成立。
其他禁止的變更或機密存取指令仍不提供；機密禁讀、修改核准及遠端唯讀限制不變。

## 公開內容安全

本 repository 的 `AGENTS.md`、skills、extensions、scripts、fixtures、configuration 與文件
都視為公開內容，不應保存公司、客戶或私人系統的具體名稱與 identifiers。範例使用
`<organization>`、`<service>` 與 `example.test` 等 placeholders；私人 target-repository 證據
只留在當次調查，不複製回本 repository。

公開內容不得含私人識別資訊；刪除工作流程專用的檢查工具後，公開安全審查仍須人工執行。
此要求不會清除既有 Git history。

## OKF 知識庫

[`knowledge/index.md`](knowledge/index.md) 是 Open Knowledge Format v0.2 知識庫入口；
[`knowledge/README.md`](knowledge/README.md) 說明格式與維護方式。保留原有 37 篇知識內文、
引用與證據等級，採用 YAML frontmatter、`description`、`tags` 與小寫 `index.md`。
舊狀態保存在 `evidence_status`；OKF `status` 表示生命週期，不代表新增驗證。

[OKF skill](.agents/skills/okf/README.md) 支援 create、validate、enrich、generate、convert
與 serve 準備流程，可依任務自動選用或明確指定 skill。讀取知識不授權新增、補強、攝取來源、
自動更新或發布；不再保留專用 keyword-search CLI。所有知識內容與模板使用英文，依
[寫作規格](.agents/skills/okf/references/writing-style.md) 做最小幅度編修，保留技術細節與不確定性。

`test:okf` 驗證格式、索引連結與遷移結果，需要 Python 3 與 PyYAML；Python dependency
宣告在 `.agents/skills/okf/requirements.txt`。本次未安裝或設定 cloud catalog、MCP、server
或上傳內容；serve 仍受 workspace remote inspection-only 邊界限制。
知識僅提供 prior context；目前 deployment 與 runtime state 仍須由 owning evidence layer 驗證。

## Workspace 配置

建議把本 repository 與工作 repositories 放在同一層，但不要合併 Git history：

```text
<workspace-root>/
├── devops-pi-agent/
├── gitops-repository/
├── chart-repository/
├── application-repository/
└── docs/
```

Agent 不自行保存規格、plan、調查或事故報告。只有使用者明確要求保存文件時才建立；
要求 workspace 文件但未指定路徑時，使用 `<workspace-root>/docs/`。寫入 application 或
其他 target repository 的文件，必須有明確文件修改要求及指定 repository 與路徑或有界
文件集合。`<workspace-root>/docs/` 是 user-owned work product，不屬於本 repository 的公開文件範圍。

Initializer 不依賴固定的 workspace 名稱或使用者家目錄。Workspace contract 也允許 Agent
在使用者明確批准後修改指定的 `~/.bashrc`；Agent 必須先檢查檔案、保留無關設定，且不得
讀取或修改 secrets、credentials 或其他家目錄檔案。

## Ubuntu／WSL Bash 環境保存

[`config/bashrc-cosmetics.sh`](config/bashrc-cosmetics.sh) 保存綠色 user@host、藍色路徑、
黃色 Git branch、青色 Kubernetes context／namespace，以及 `k`、`kx`、`kn` 別名。
Git 使用官方 `__git_ps1`，不主動啟用 dirty／untracked 掃描；Kubernetes context
沿用底線前綴裁切規則，不保存任何私人 context、登入或 credentials。

在 repository 執行 `bash scripts/setup-ubuntu-shell.sh`，只更新 `~/.bashrc` 的 managed
block；也可用 `--bashrc PATH` 指定目標。首次修改會保存 `.pi-agent-config.bak`，重跑不會
覆蓋該備份；保留 managed block 外的設定，遇到 symlink 或損壞 markers 則停止。
設定內嵌於 bashrc，因此套用後不依賴 repository 位置。需要 Python 3。

新 Ubuntu／WSL 電腦可自行執行 `bash scripts/setup-ubuntu-shell.sh --install-tools`：

- APT 安裝 Git 與 Homebrew build prerequisites；Homebrew 安裝 Git、kubectl、kubectx／kubens、
  kube-ps1、Helm CLI 與 HashiCorp tap 的 Terraform。
- NVM 使用官方 pinned `v0.40.7` installer，不修改其他 shell profiles；不自動安裝 Node。
- gcloud 使用 Google 官方 APT repository，新增專用 source／keyring；不執行登入、
  project 設定、cloud 變更或 Helm release 安裝。

安裝模式需要正常使用者、sudo、網路及受支援 Ubuntu；會下載並執行官方 Homebrew／NVM
installer，改動本機套件、APT sources 與安裝目錄，請先審閱腳本。已安裝的套件不主動升級，
不保證所有工具版本可重現；Homebrew 假設標準 Linux prefix `/home/linuxbrew/.linuxbrew`。
官方來源：[Homebrew](https://docs.brew.sh/Homebrew-on-Linux)、
[NVM](https://github.com/nvm-sh/nvm/tree/v0.40.7)、
[Terraform](https://github.com/hashicorp/homebrew-tap)、
[gcloud](https://docs.cloud.google.com/sdk/docs/install-sdk)。

開新終端生效。NVM 改為首次使用 `nvm`／`node`／`npm`／`npx` 時載入；Bash 啟動不再
執行 `brew shellenv`，但 kube-ps1 首次本機查詢仍有成本。既有 bashrc 若已包含舊版 NVM、
Homebrew 或提示符設定，腳本不自動刪除它們；請自行移除重複區段，否則舊啟動成本仍存在。
缺少 Git／kube-ps1 helper 時只省略對應提示符。

驗證：`npm run test:ubuntu-shell` 使用 temporary fixtures，測試保留設定、備份、重跑、
managed block 更新、symlink／marker 拒絕與 NVM lazy load；不執行真實安裝。

## 系統需求

初始化 Pi-local 功能前，shell 必須能直接找到以下指令：

```bash
command -v bash
command -v node
command -v npm
command -v pi
```

建議另外安裝 `make`，使用人類友善的 workspace targets；沒有 `make` 時仍可直接執行
initializer script。

Code intelligence 的 TypeScript runtime 由 initializer 安裝至 workspace-local extension
依賴目錄，並檢查固定版本及 Compiler API 的 in-memory parsing smoke test。Java 需完整
JDK 17+：選定的 `java`／`javac` 必須符合版本門檻，且 `java --list-modules` 包含
`jdk.compiler`。一般初始化缺少 Java 時會明確警告，仍可使用 JS／TS；不會偷偷安裝
系統套件。Ubuntu 使用者可明確選擇下方 runtime installation 模式。
Node／npm／Pi 仍是前置需求，此模式不安裝或切換它們。

如果 Node 由 NVM 管理，請先在目前 shell 選定版本，例如：

```bash
nvm use default
```

## 初始化

### 由 Agent 啟動

明確要求「初始化 workspace」時，可使用下方 initializer，
再由目前的 agent 盤點 workspace 直接子專案，建立本機 `.pi/APPEND_SYSTEM.md`。
不額外啟動付費 LLM session；只要求建立背景時，不執行套件安裝。

背景只記錄有證據的 project path、責任、工具與使用者別名，不記錄 secrets、state、
部署狀態或任務 spec。內容上限為 80 行／6 KiB；普通初始化保留既有背景，只有明確要求
更新時才調整。私有內容不得複製到本公開 repository。

寫入前由唯讀 helper 檢查 Git 與 symlink 邊界：destination 必須在本公開 repository 外；
如果位於 Git repository，必須事先 ignored 且 untracked，否則停止，不代改 ignore 規則
或 Git。Workspace 不在 Git 內只能證明目前沒有 Git owner，不能保證未來不被加入 Git。
Workspace 定義與 initializer 一致：明確指定的目錄，或本 repository 的上一層；
不取 Git root，也不要求 workspace 或子專案被 Git 追蹤。不檢查父層 `.git` 目錄；
Git 明確回報不是 repository 時即可接受，其他 Git 錯誤仍停止。
Destination 的 Git privacy 檢查獨立保留，不用來決定 workspace 路徑。

Pi 在 project trust 後載入此檔；project `APPEND_SYSTEM.md` 會取代同名 global 檔案，
不是合併。建立後需 reload 並以新 context 驗證背景確實生效。Shell initializer 本身
不產生背景，也不會自行叫用 agent；下方 CLI 路徑保留原行為。

### 直接使用 CLI

在這個 repository 執行：

```bash
cd <workspace-root>/devops-pi-agent
make workspace-init
```

Makefile 預設把本 repository 的上一層當成 workspace root。需要指定其他位置時：

```bash
make workspace-init WORKSPACE_ROOT=<workspace-root>
```

Makefile 只把參數交給 initializer，不包含另一份設定同步邏輯。沒有 `make` 或需要直接呼叫
底層 CLI 時，原本方式仍可使用：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
```

### 安裝 code-intelligence runtimes（使用者操作）

若 Ubuntu 尚未有完整 JDK 17+，可明確選用：

```bash
make workspace-init-runtimes WORKSPACE_ROOT=<workspace-root>
```

對應 initializer 的 `--install-runtimes`。已有相容 JDK 時保留，不執行 apt；否則透過
`sudo apt-get` 安裝 Ubuntu repository 的 `openjdk-17-jdk-headless`，需要網路及 sudo。
套件已確認於 Ubuntu 22.04／24.04 LTS 的 amd64 repository 提供；其他 release／
architecture 的可用性取決於當地 apt repository。非 Ubuntu 請自行提供完整 JDK，再使用一般初始化。
不要以 root 執行此安裝模式；Agent 不執行系統安裝。

此模式會安裝系統 JDK，也會完成既有 workspace-local 初始化；使用獨立 opt-in target
避免一般設定同步意外觸發提權或系統變更。不修改 `JAVA_HOME`、shell 設定或強制選取
`update-alternatives`。若套件安裝後 PATH 仍選到舊 Java，腳本會停止並要求先選定
相容 JDK；不反覆重試安裝。`--install-runtimes` 不能與 `--no-pi-local` 合用。

Initializer 會建立或協調以下 workspace-local 資源：

```text
<workspace-root>/AGENTS.md
<workspace-root>/.agents/skills
<workspace-root>/.pi/extensions
<workspace-root>/.pi/settings.json
<workspace-root>/.pi/npm/node_modules/pi-web-access
```

每次執行 initializer 都會重建 `AGENTS.md` 與 `.agents/skills` 相對 symlink，並重新安裝
本 repository 管理的 extensions。`package.json` 的 `pi.extensions` 必須與 `extensions/` 目錄名稱
完全一致，否則 initializer 會停止。`<workspace-root>/.pi/pi-agent-config-managed.json` 記錄上一版
安裝的 extension 名稱；initializer 只刪除這份 manifest 與目前 source 列出的 extension，其他
使用者自建 extension 會保留。若 `AGENTS.md` 或 `.agents/skills` 是一般檔案、目錄，或指向其他
來源的 symlink，initializer 會在清除前停止。腳本也會重建 extension dependencies，並驗證已部署的 TypeScript runtime，然後安裝
pinned `npm:pi-web-access@0.23.0` project package。Package registration 會固定使用
`extensions: []` filter，因此 parent session 不載入web tools；`researcher` child 需要外部搜尋
時才透過明確path載入package extension。

Initializer 不管理 global Pi extensions 或 `~/.pi/agent/extensions`。

### 只安裝 contract 與 skills

如果目前不需要 extensions 或 project-local package：

```bash
make workspace-contract-only WORKSPACE_ROOT=<workspace-root>
```

對應的底層指令是：

```bash
./scripts/init-workspace.sh \
  --workspace-root <workspace-root> \
  --no-pi-local
```

這個模式只建立 `AGENTS.md` 與 `.agents/skills` symlinks。

## 檢查安裝狀態

執行唯讀檢查：

```bash
make workspace-check WORKSPACE_ROOT=<workspace-root>
```

對應的底層指令是：

```bash
./scripts/init-workspace.sh \
  --workspace-root <workspace-root> \
  --check
```

輸出會顯示：

- `AGENTS.md` 與 skills symlink 是否存在；
- Pi executable 的位置；
- 每個受管理 extension 是 `ready`、`missing` 或 `drifted`；未受管理的 extension 顯示為 `unmanaged (preserved)`；
- extension manifest 與 dependencies 狀態；
- code-intelligence 的 TypeScript 固定版本／Compiler API parsing smoke check、Java 版本與 compiler module 狀態；
  readiness 檢查不等於真實專案 graph、typecheck 或 tests 已通過；
- `pi-web-access@0.23.0` 是否已安裝，且 registration 是否維持 child-only filter。

`--check` 不會安裝任何 runtime，即使同時提供 `--install-runtimes` 也保持唯讀。
`--no-pi-local` 的一般安裝不安裝或探測 parser runtimes。

## 啟動 Pi

從 workspace root 啟動 Pi：

```bash
cd <workspace-root>
pi
```

Pi 必須信任 project，才會載入 `.pi/extensions`。Initializer 更新 extension 後，已開啟的
session 要執行：

```text
/reload
```

## Token 與驗證成本

[`config/pi-settings-baseline.json`](config/pi-settings-baseline.json) 把 routine work 的
thinking 預設設為 `low`，並顯示明顯的 prompt-cache miss；不再覆寫 `thinkingBudgets`。
這會沿用 Pi/provider 的預設預算，不代表無限 token。Baseline 是 opt-in，既有 workspace
若曾採用自訂預算，需自行移除已合併的覆寫；本次不修改本機 settings。
Subagent final text 與 parallel aggregate 不再由 extension 截斷；較長回報會增加 context 成本。
Parent 以輕量任務契約交代目標、範圍、
完成條件與回報，不增加格式 blocker。Tool／provider／process／timeout／abort 錯誤會
主動回填給 parent；已授權的 subagent extension local 修正不重複詢問，但需先查證原因
並驗證修正，不啟動無限自動修復。逾時、併發、安全權限與底層工具限制仍保留。
Pi 的 project settings 會覆蓋
全域設定；要在既有 workspace 採用最小設定，可把以下 keys 合併進
`<workspace-root>/.pi/settings.json`，不要覆蓋原有 packages 或個人選項：

```json
{
  "defaultThinkingLevel": "low",
  "showCacheMissNotices": true
}
```

Initializer 不會自動覆蓋既有 project settings。當工作出現跨 repository 衝突、不熟悉的
API 行為或無法界定的 blast radius 時，再用 `Shift+Tab` 把目前 session 提升到 `medium`；
`high` 留給 `medium` 仍無法收斂的高風險設計判斷。

Post-edit validation 依行為和風險分成 V0–V3。純文件只跑文件檢查；結構化設定跑 parser、
schema 與 changed-file checks；部署、CI、Helm values 或 application config 跑 affected
behavior/render；Terraform、IAM、network、shared chart API、resource ownership 與 security
保留完整 affected-root gate。Domain skill 可以提高等級，不能降低其 mandatory checks。
Agent 只在檔案變更後、final edit 完成時執行一次最小充分的 release-level validation；如果
repository 與相關 external state 沒變，不重跑相同的成功檢查。已有 repository 或
skill-owned deterministic helper 時，優先使用單一 bounded helper，避免拆成多輪 tool calls。

## Extension 文件

根目錄 README 只列入口；extension 的目的、運作流程與限制放在自己的目錄。

| Extension | 文件 |
| --- | --- |
| `subagents` | [`extensions/subagents/README.md`](extensions/subagents/README.md) |
| `code-intelligence` | [`extensions/code-intelligence/README.md`](extensions/code-intelligence/README.md) — JS／TS Compiler API 與 Java JDK parser-backed map、引用、impact、graph diff；不限制一般編輯工具。 |
| `plan-mode` | [`extensions/plan-mode/README.md`](extensions/plan-mode/README.md) — `/plan` 限制成唯讀規劃；subagent 只允許 scout、environment-scout、researcher，執行需另行明確授權。 |

## Skill 入口

每個 skill 的適用範圍、停止條件與流程由該目錄的 `SKILL.md` 管理。保留的 repository-owned skills：

- [Code intelligence](.agents/skills/code-intelligence/SKILL.md) — JS／TS／Java 分析前建立全庫 map，以證據區分 facts、inference、unknown；TypeScript 依賴由 initializer 安裝，Java 另需完整 JDK 17+
- [Kubernetes platform guidance](.agents/skills/kubernetes-platform-guidance/README.md) — 資源設定、GitOps／Helm 關聯與唯讀診斷流程
- [Terraform workflow guidance](.agents/skills/terraform-workflow-guidance/README.md) — 跨 repository 的 plan-first 流程
- [Helm chart best practices](.agents/skills/helm-chart-best-practices/README.md) — 一般 chart 設計、render 與相容性驗證
- [OKF knowledge](.agents/skills/okf/README.md)
- [MR summary](.agents/skills/mr-summary/README.md)
- [Learn from work](.agents/skills/learn-from-work/README.md) — 手動啟用的實作後學習、理解檢查、練習與複習；不改變一般開發流程

想學習 AI 剛完成的工作時，先在新增 Skill 後執行 `/reload`，再使用
`/skill:learn-from-work`，也可在後面加上想深入的概念或「考我、先不要給答案」。
此 Skill 使用 `disable-model-invocation: true`，不加入自動選用清單；預設只在聊天中
教學及產出複習卡，不修改專案、不執行測試，也不自動保存學習紀錄。
