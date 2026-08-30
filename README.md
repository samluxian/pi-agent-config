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
或操作 remotes。完整 authority boundary 以 [`AGENTS.md`](AGENTS.md) 為準。

## Repository 定位

這個 repository 管理四類內容：

| 路徑 | 責任 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 每輪都要遵守的安全、approval、workspace 與 evidence 規則。 |
| [`.agents/skills/`](.agents/skills/) | Pi 依工作類型載入的專用流程。 |
| [`extensions/`](extensions/) | 在 Pi runtime 中註冊事件、指令或工具的程式。 |
| [`scripts/`](scripts/) | Workspace 初始化與 deterministic checks。 |

這些規則預設採用 human-in-the-loop 流程：

```text
分析 → 提出修改範圍、驗證與風險 → 等待批准 → 重新檢查 target repo branch/status → 修改 → 獨立驗證
```

Kubernetes、Argo CD、GitLab/GitHub、GCP 與 Git remotes 對 agent 維持唯讀。交付變更寫入
repository 的 desired state，再走原有 MR、CI 與 GitOps 流程。完整規則以
[`AGENTS.md`](AGENTS.md) 為準。

## 公開內容安全

本 repository 的 `AGENTS.md`、skills、extensions、scripts、fixtures、configuration 與文件
都視為公開內容，不應保存公司、客戶或私人系統的具體名稱與 identifiers。範例使用
`<organization>`、`<service>` 與 `example.test` 等 placeholders；私人 target-repository 證據
只留在當次調查，不複製回本 repository。

執行通用檢查：

```bash
npm run test:public-safety
```

需要比對組織專用名詞時，把一行一個 literal term 的檔案放在 repository 外，再執行：

```bash
PI_PUBLIC_SAFETY_TERMS_FILE=/path/outside/repository/private-terms.txt \
  npm run test:public-safety
```

Scanner 只回報類別與位置，不輸出 terms。完整規則與 Git history 限制見
[public repository safety contract](.agents/skills/pi-agent-maintenance/references/public-repository-safety.md)。

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

使用者要求調查或事故報告、但未指定路徑時，agent 預設寫入
`<workspace-root>/docs/`，不會寫進 application 或其他 target repository。這個位置是
user-owned work product，不屬於本 repository 的公開文件範圍。

Initializer 不依賴固定的 workspace 名稱或使用者家目錄。

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

如果 Node 由 NVM 管理，請先在目前 shell 選定版本，例如：

```bash
nvm use default
```

## 初始化

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

Initializer 會建立或協調以下 workspace-local 資源：

```text
<workspace-root>/AGENTS.md
<workspace-root>/.agents/skills
<workspace-root>/.pi/extensions
<workspace-root>/.pi/settings.json
<workspace-root>/.pi/npm/node_modules/pi-web-access
```

`AGENTS.md` 與 `.agents/skills` 是指向本 repository canonical files 的相對 symlink。
Extensions 則複製到 workspace 的 `.pi/extensions`：安裝缺少的 extension、更新已有差異的
copy，並移除本 repository 不再提供的 workspace-local extension。腳本也會安裝 extension
dependencies 與 pinned `npm:pi-web-access@0.23.0` project package。

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
- 每個 extension 是 `ready`、`missing`、`drifted` 或 `unwanted`；
- extension manifest 與 dependencies 狀態；
- `pi-web-access@0.23.0` 是否已安裝並註冊。

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
thinking 預設設為 `low`，並顯示明顯的 prompt-cache miss。Pi 的 project settings 會覆蓋
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

根目錄 README 只列入口；每個 extension 的目的、運作流程與限制放在自己的目錄：

| Extension | 文件 |
| --- | --- |
| `humanizer` | [`extensions/humanizer/README.md`](extensions/humanizer/README.md) |
| `subagents` | [`extensions/subagents/README.md`](extensions/subagents/README.md) |
| `workspace-memory` | [`extensions/workspace-memory/README.md`](extensions/workspace-memory/README.md) |

## Skill 入口

每個 skill 的適用範圍、停止條件與流程由該目錄的 `SKILL.md` 管理。這裡只保留路徑索引，
避免把所有工作流程複製到根 README：

- [`.agents/skills/context-window-retrospective/README.md`](.agents/skills/context-window-retrospective/README.md) — 手動使用 `/skill:context-window-retrospective`
- [`.agents/skills/developer-activity-summary/README.md`](.agents/skills/developer-activity-summary/README.md)
- [`.agents/skills/gitops-repo-audit/README.md`](.agents/skills/gitops-repo-audit/README.md)
- [`.agents/skills/gitops-service-delivery/README.md`](.agents/skills/gitops-service-delivery/README.md)
- [`.agents/skills/gitops-state-diagnostics/README.md`](.agents/skills/gitops-state-diagnostics/README.md)
- [`.agents/skills/helm-dependency-upgrade/README.md`](.agents/skills/helm-dependency-upgrade/README.md)
- [`.agents/skills/kubernetes-platform-delivery/README.md`](.agents/skills/kubernetes-platform-delivery/README.md)
- [`.agents/skills/mr-summary/README.md`](.agents/skills/mr-summary/README.md)
- [`.agents/skills/orchestrator/README.md`](.agents/skills/orchestrator/README.md)
- [`.agents/skills/pi-agent-maintenance/README.md`](.agents/skills/pi-agent-maintenance/README.md)
- [`.agents/skills/runtime-dependency-diagnostics/README.md`](.agents/skills/runtime-dependency-diagnostics/README.md)
- [`.agents/skills/service-architecture-mapping/README.md`](.agents/skills/service-architecture-mapping/README.md)
- [`.agents/skills/shared-helm-chart-maintenance/README.md`](.agents/skills/shared-helm-chart-maintenance/README.md)
- [`.agents/skills/terraform-repository-maintenance/README.md`](.agents/skills/terraform-repository-maintenance/README.md)
