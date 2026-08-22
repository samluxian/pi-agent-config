# Bounded Subagents

`subagents` 是 DevOps Pi Agent 的 workspace-local extension。它讓目前的 Pi agent 可以把一項
有明確邊界的工作交給另一個獨立 Pi process，再把結果收回來。

主要目的不是增加 parent agent 的權限，而是隔離 context：child 可以讀大量檔案、搜尋網路或
執行驗證，parent 只接收整理後的結果。

## 先看 Pi 原本怎麼呼叫工具

一般 agent run 可以簡化成：

```text
使用者要求
  ↓
Pi 把 system prompt、對話與可用 tools 交給模型
  ↓
模型決定直接回答，或產生 tool call
  ↓
Pi 執行 tool
  ↓
Pi 把 tool result 放回模型 context
  ↓
模型繼續判斷並產生回答
```

Extension 載入時會透過 `pi.registerTool()` 註冊一個名為 `subagent` 的 tool。Parent model
看到這個 tool 後，可以像呼叫 `read` 或 `web_search` 一樣呼叫它。Extension 不會自己決定
何時委派；是否委派、委派範圍和最後判斷仍由 parent 負責。

## 一次 subagent 呼叫怎麼執行

完整流程如下：

```text
Parent model
  │
  │ 呼叫 subagent tool，提供 role、task、cwd 與 mode
  ▼
Subagents extension
  │
  ├─ 驗證 single／parallel 格式、角色和數量限制
  ├─ 讀取 agents/<role>.md profile
  ├─ 組合 role prompt、task、model、thinking 與 tool allowlist
  └─ 啟動獨立 Pi child process
        │
        ├─ 執行 child tools
        ├─ 以 JSON events 回報進度
        └─ 回傳最後一段 assistant text、usage、tool 次數與錯誤
  │
  ▼
Extension 將結果轉成 tool result
  │
  ▼
Parent model 整合證據並做最後判斷
```

Child process 使用類似以下的 Pi 執行模式：

```text
pi --mode json --no-session --no-skills --no-extensions ...
```

每個 child 都是新的 process，因此：

- 不繼承 parent conversation；
- 不共用 parent session；
- 不自動載入 workspace skills；
- 不自動載入其他 extensions；
- 只取得該 profile 明確列出的 tools；
- 必須由 parent 在 `task` 中提供所有必要背景、路徑、限制與輸出格式。

Task 超過 8,000 個字元時，extension 會將 prompt 暫存在權限為 `0600` 的 OS temp file，child
結束後刪除 temp directory。這是傳遞長 prompt 的方式，不是跨 session memory。

## Single 與 parallel

Single mode 一次啟動一個 child：

```json
{
  "agent": "scout",
  "task": "Read the named files and return bounded findings.",
  "cwd": "/workspace/repository"
}
```

Parallel mode 一次最多接受四項互相獨立的 read-only tasks：

```json
{
  "tasks": [
    {
      "agent": "scout",
      "task": "Inspect local repository wiring.",
      "cwd": "/workspace/repository"
    },
    {
      "agent": "researcher",
      "task": "Read the official documentation and cite sources.",
      "cwd": "/workspace/repository"
    }
  ]
}
```

Extension 最多同時執行四個 read-only children，並按照輸入順序回傳結果，不受實際完成順序
影響。`reviewer` 和 `worker` 只能使用 single mode，也不能與其他 execution-capable
subagent call 重疊，避免驗證指令、暫存檔或 edits 互相干擾。

可在相鄰的 `config.json` 降低 concurrency；有效範圍是 1 到 4：

```json
{
  "maxConcurrency": 2
}
```

## 五種角色

Extension 啟動時會讀取 [`agents/`](agents/) 下的 Markdown profiles。Profile 定義 role
prompt、model、thinking level 與 exact tool allowlist。

| Role | Model | 可用 tools | 工作範圍 |
| --- | --- | --- | --- |
| `scout` | `openai-codex/gpt-5.6-luna` | `read`, `grep`, `find`, `ls` | 讀取 local repository，整理檔案、caller 與結構。 |
| `researcher` | `openai-codex/gpt-5.6-terra` | `web_search`, `fetch_content` | 搜尋外部資料並整理來源。 |
| `environment-scout` | `openai-codex/gpt-5.6-luna` | `kubectl_inspect`, `gcloud_inspect` | 對明確指定的 Kubernetes 或 GCP 目標做 structured read-only inspection。 |
| `reviewer` | `openai-codex/gpt-5.6-terra` | `read`, `grep`, `find`, `ls`, `safe_bash`, `subagent` | 透過 scout 讀取較大的 repository evidence，自行執行 validation commands 並產生 semantic verdict；沒有 `write` 或 `edit`。 |
| `worker` | `openai-codex/gpt-5.6-terra` | `read`, `write`, `edit`, `safe_bash`, web tools, `subagent` | 只處理使用者已批准、repository 與 owned files 都明確的 isolated edit。 |

`scout` 使用 `thinking: off`，讓 bounded repository lookup 以速度和成本為優先；其他角色維持
`thinking: medium`。這個設定只關閉額外 thinking budget，不會移除 scout 的 read-only tools。

`researcher` 與 `worker` 需要 web tools 時，extension 會明確載入 project-local
`pi-web-access`。`environment-scout`、`reviewer` 與 `worker` 所需的 custom tools 也由
extension 按 profile 加入，不依賴 child 自動載入 extensions。

Reviewer 讀取多個檔案、大型 diff、callers、tests 或 contracts 時，預設委派給一個 scout，
也可以在一次 parallel request 中啟動最多四個互相獨立的 scouts。Reviewer 仍可直接讀取
已知的小檔案，或針對 scout finding 做窄範圍核對。Scout 沒有 `subagent` 或 command tool，
不能再啟動另一層 scout，也不能執行 tests 或產生 reviewer verdict。Validation matrix、
`safe_bash` commands、evidence reconciliation、finding severity 與 semantic verdict 都留在
reviewer。Scout 的時間算在 reviewer 原本的四分鐘 evidence／command budget內；失敗或
逾時要記錄為 gap，不得改成無界限重讀。

## Parent 和 child 的責任

Parent 保留：

- scope 與成功條件；
- 使用者是否已批准修改；
- child 可以擁有哪些檔案；
- evidence 是否足以支持結論；
- 多個 child 結果之間的衝突處理；
- 最後修改與交付判斷。

Child 只執行 task 內寫明的工作。啟動 child 不代表把 parent 的權限或責任一起交出去。

`worker` profile 雖然有 `write` 和 `edit`，extension 不會從自然語言中自行證明使用者已批准，
也不會自動判斷 file ownership 是否合理。這些條件必須由 parent 在呼叫前確認並寫進 task。
如果 parent 沒有完成這一步，不能把 worker 的 prompt 當成 approval mechanism。

## Tool allowlist 不是 sandbox

Exact tool allowlist 可阻止 child 直接看到未列出的 Pi tools，但不等於作業系統 sandbox。

`safe_bash` 會擋下部分已知危險 command patterns，例如 destructive `rm`、`sudo`、filesystem
formatting 和 pipe-to-shell。它只是 blocklist，不可能證明任意 shell command 都安全。
Repository、Git remote、Kubernetes、Argo CD、GCP、secret 與 deployment mutation 規則仍由
parent contract 和 role prompt 約束。

`environment-scout` 不接受任意 shell command。它只會從固定 operations 產生直接 argv，
要求明確的 context、namespace、project、location 或 resource identifier，並封鎖 Secret、
ConfigMap contents、credentials 與 mutation operations。輸出限制為 120 行和 24 KiB，且會
遮罩常見 token、password、JWT 與 private-key patterns。遮罩只能降低暴露風險，不能取代
最小查詢範圍。

## Extension 怎麼接收 child 結果

Child 使用 JSON mode，stdout 會輸出一連串 events。Extension 解析這些 events，追蹤：

- 最後一段 assistant text；
- token usage；
- tool call 次數；
- 正在執行的 tool；
- 最近的 tool calls；
- provider、process 與 tool errors。

執行期間，extension 透過 tool update 把簡短進度交給 parent。Child 結束後，它將 bounded
文字和結構化 `details.results` 放進 tool result。Parent model 看到的是這份結果，不是 child
完整 conversation。

一般結果受 Pi 的 tool-output line／byte bounds 約束。Reviewer 結論另限制為 160 行和
16 KiB，避免 validation logs 重新塞回 parent context。大型 raw output 應留在 reviewer
process 或 tool 管理的 temp output，只回傳 finding。

## Timeout、abort 與錯誤

預設期限如下：

| Role | 最長時間 |
| --- | --- |
| `scout`, `researcher`, `environment-scout`, `reviewer` | 5 分鐘 |
| `worker` | 10 分鐘 |

Parent 中止 tool call 或 child 超時時，extension 先送 `SIGTERM`，等待三秒後仍未結束才送
`SIGKILL`。Spawn error、provider error、非零 exit code、timeout 與 abort 都會讓該 task
標成 failed。Parallel mode 會保留每一項 task 的成功或失敗結果，不會因為其中一項失敗就
假裝整批成功。

## Repository review gate

Subagents extension 也追蹤 repository 修改後是否完成獨立驗證。

```text
成功的 parent write/edit
  ↓
依 Git repository root 建立新的 pending generation
  ↓
啟動 fresh reviewer
  ↓
reviewer 執行 bounded checks 並輸出 ## Verdict
  ↓
只有 final + semantic pass + current generation 才清除 pending
```

以下結果都不會清除 gate：

- `partial`；
- `blocked`；
- `fail`；
- 缺少 semantic verdict；
- timeout、abort 或 process failure；
- review 後又修改檔案，導致結果 stale。

Gate 依 Git repository root 分開記錄。後續 edit 只會使同一 repository 的舊 review 失效。
Parent 準備結束但仍有 pending repository 時，extension 會列出 pending 狀態，並為同一狀態
排入一次 bounded reviewer follow-up，不會無限重複。

Worker 內部的成功 edit、write 或可能改檔的 `safe_bash` 也會建立 mutation state。Worker 必須
在最後一次修改後啟動自己的 fresh final reviewer；沒有通過 review 時，即使 child process
exit code 是 0，worker result 仍視為失敗。若 worker 已完成涵蓋最終版本的 review，parent
可以直接整合，不必再跑一次相同 review。

Review gate 是驗證護欄，不是程式正確性的證明。Reviewer task 仍須包含正確的 repository、
changed paths、驗證矩陣和必要 target identifiers。

## 安裝與驗證

從 repository root 執行：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
npm run test:extensions
```

Profiles 位於 [`agents/`](agents/)，child-only tools 位於 [`tools/`](tools/)，主要 runtime
實作位於 [`index.ts`](index.ts)。Unit tests 使用 fake child events，不會呼叫付費模型。
