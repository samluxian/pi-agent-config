# Workspace Memory

`workspace-memory` 是 Pi Coding Agent 的 project-local extension。它替同一個 workspace
建立 machine-local repository inventory，保存使用者明確確認的 repo／branch notes，並在
每輪加入有限的 workspace orientation context。

它解決跨 repository 工作時容易選錯目標的問題，但不把 memory 當成部署或遠端事實。
Pi 在做決策或修改檔案前，仍須重新確認 repository、branch、working tree 與需要的 remote
freshness。

## Quick Start

在 `devops-pi-agent` checkout 中安裝 workspace-local extensions：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
```

從 workspace root 啟動 Pi；若 session 已經開啟，先執行 `/reload`：

```bash
cd <workspace-root>
pi
```

接著在 Pi 中初始化並查看 inventory：

```text
/workspace init .
/workspace list
```

Pi 必須先信任 project，才會載入 `.pi/extensions/workspace-memory`。

## 使用範例

以下以 `my-service` 代表 inventory 中的 repository id：

```text
/workspace show my-service
/workspace use my-service
/workspace remember my-service Handles the public API and owns its deployment wrapper.
/workspace remember my-service --branch Adds the readiness probe for the current HEAD.
```

需要先分析 repository 再決定是否保存 note 時：

```text
/workspace analyze my-service
```

`analyze` 只會排入一個 bounded scout 分析要求。它不會自動保存模型產生的內容；確認候選
note 後，仍須自行執行 `/workspace remember`。

## `/workspace` 指令

| 指令 | 行為 |
| --- | --- |
| `/workspace init [root]` | 掃描 workspace 並建立 catalog；省略 `root` 時使用目前目錄。 |
| `/workspace refresh` | 重新掃描已初始化的 workspace，保留 confirmed notes，並把消失的 repositories 標成 `missing`。 |
| `/workspace list` | 列出 catalog 中的 repositories、狀態、偵測類型及簡短 note。 |
| `/workspace show <repo>` | 顯示指定 repository 的 path、狀態、local Git snapshot 與 notes。 |
| `/workspace use <repo>` | 選擇目前 session branch 的目標 repository。 |
| `/workspace remember <repo> <note>` | 保存可跨 branch 使用的 repository note。 |
| `/workspace remember <repo> --branch <note>` | 保存綁定目前 branch 與 HEAD 的 note。 |
| `/workspace analyze <repo>` | 排入一次 bounded repository 分析，不寫入 memory。 |
| `/workspace forget <repo>` | 移除 confirmed repo／branch notes，但保留 deterministic inventory。 |

不帶參數執行 `/workspace` 會顯示指令摘要。

### Repository 與 branch notes

- Repository note 不綁定 branch，可用來記錄穩定用途或 ownership。
- Branch note 綁定建立當下的 branch 和完整 HEAD。
- HEAD 改變後，branch note 會標成 stale，不再視為已確認的目前狀態。
- `use` 的選擇透過 Pi custom session entry 保存在目前 session branch；它不會改變 shell 的
  working directory。
- 每筆 note 最多 12 行及 2 KiB UTF-8。

## `workspace_catalog` tool

Extension 會註冊 read-only `workspace_catalog` tool，讓 agent 按需取得 bounded catalog
資訊。這個 tool 不會掃描 repository 內容，也不會修改 memory。

| Action | 結果 |
| --- | --- |
| `current` | 顯示 `/workspace use` 選取的 repository；未選取時使用目前目錄所在的 indexed repository。 |
| `list` | 顯示目前 workspace catalog。 |
| `show` | 顯示 `repo` 指定的 repository。 |

Tool output 最多 80 行及 8 KiB。Agent 應把這些資料當成 orientation，並在做決策或修改前
重新讀取 repository files 與 Git state。

## 掃描範圍

`init` 與 `refresh` 只檢查 workspace 第一層、非 symlink 的目錄。目錄必須包含安全的
`.git` directory 或 file 才會納入 catalog。

掃描會取得：

- repository path 與目前是否存在；
- local branch、HEAD 與 dirty state；
- 少量已知檔名或目錄所代表的類型，例如 Node.js、Helm、Kustomize、Terraform、Java、
  container、GitLab CI 與 GitHub Actions。

掃描不會：

- 讀取 application、manifest、log、diff 或 conversation 內容；
- 執行 `git fetch` 或判斷 remote branch 是否最新；
- 呼叫模型產生 note；
- 搜尋 nested repositories。

若 Git status 無法讀取，extension 會採安全預設，把 repository 視為 dirty。

## Context 注入

每次 agent run 開始前，extension 會把 workspace 摘要附加到 system prompt：

- 最多列出 24 個 active repositories；
- 最多 40 行及 4 KiB UTF-8；
- 包含已選取 repository 的即時 local branch、HEAD 與 dirty state；
- 明確標示 remote freshness unknown；
- 只在 branch 與 HEAD 仍相符時，把 branch note 標成 confirmed。

摘要超過限制時會顯示 truncation，詳細資料可再由 `workspace_catalog` 取得。

## 儲存與隱私

預設資料放在 Pi agent directory：

```text
~/.pi/agent/workspace-memory/registry.json
~/.pi/agent/workspace-memory/<workspace-hash>/catalog.json
```

Catalog 採 atomic write。儲存目錄權限為 `0700`，JSON files 為 `0600`，並使用
interprocess lock 避免多個 Pi instances 同時覆寫資料。載入超過 1 MiB 的 catalog 時會拒絕使用。

資料只存在本機，不會寫進 indexed product repositories，也不會同步到其他機器。
`remember` 只檢查長度，不會辨識敏感內容。不要把 secrets、credentials、private keys、
`.env` values、完整 logs、manifests 或 diffs 寫進 note；note 之後會進入模型 context。

Catalog 不能證明 deployment、Argo CD、Kubernetes、GCP、Git remote 或 runtime 的目前
狀態。需要這些事實時，應從對應 evidence layer 重新查證。

## 更新與檢查

更新 source repository 後，重新協調 workspace-local copy：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
```

若 Pi 已開啟，執行 `/reload` 載入更新。

常見錯誤：

- `No workspace catalog`：從 workspace root 執行 `/workspace init .`。
- `Unknown workspace repository`：先執行 `/workspace list`，使用顯示的 repository id。
- `Branch memory requires an attached readable Git branch`：切回可讀取的 attached branch，
  再保存 branch note。
- `Workspace memory disabled`：registry 或 catalog 無法讀取或驗證；warning 會保留原本的
  system prompt，不會注入未驗證資料。

## 開發與驗證

從 `devops-pi-agent` repository root 執行：

```bash
npm run test:contract
npm run test:extensions
git diff --check
```

Unit tests 使用 temporary workspaces 與 fake Git snapshots，不會呼叫付費模型。
