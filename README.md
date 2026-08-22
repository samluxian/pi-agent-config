# DevOps Pi Agent

DevOps Pi Agent 是一套放在 Pi Coding Agent workspace 裡的操作規則、skills、extensions
與驗證工具。它讓 Pi 知道該讀哪些證據、何時只能唯讀、什麼情況要先取得批准，以及修改後
該怎麼驗證。

這個 repository 是 workspace tooling，不是產品 monorepo，也不是部署平台。Application、
GitOps、Helm chart 與 infrastructure repositories 仍保有各自的 Git history、branch、remote
與權限。

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
分析 → 提出修改範圍、驗證與風險 → 等待批准 → 修改 → 獨立驗證
```

Kubernetes、Argo CD、GitLab/GitHub、GCP 與 Git remotes 對 agent 維持唯讀。交付變更寫入
repository 的 desired state，再走原有 MR、CI 與 GitOps 流程。完整規則以
[`AGENTS.md`](AGENTS.md) 為準。

## Workspace 配置

建議把本 repository 與工作 repositories 放在同一層，但不要合併 Git history：

```text
<workspace-root>/
├── devops-pi-agent/
├── k8s-deploy/
├── helm-chart/
└── your-service/
```

Initializer 不依賴固定的 workspace 名稱或使用者家目錄。

## 系統需求

初始化 Pi-local 功能前，shell 必須能直接找到以下指令：

```bash
command -v bash
command -v node
command -v npm
command -v pi
```

如果 Node 由 NVM 管理，請先在目前 shell 選定版本，例如：

```bash
nvm use default
```

## 初始化

在這個 repository 執行：

```bash
cd <workspace-root>/devops-pi-agent
./scripts/init-workspace.sh --workspace-root <workspace-root>
```

未指定 `--workspace-root` 時，腳本使用本 repository 的上一層目錄。

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
./scripts/init-workspace.sh \
  --workspace-root <workspace-root> \
  --no-pi-local
```

這個模式只建立 `AGENTS.md` 與 `.agents/skills` symlinks。

## 檢查安裝狀態

執行唯讀檢查：

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
