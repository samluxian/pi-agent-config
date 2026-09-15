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
看到這個 tool 後，可以像呼叫 `read` 一樣呼叫它。Extension 不會自己決定何時委派；是否
委派、委派範圍和最後判斷仍由 parent 負責。

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
影響。`worker` 只能使用 single mode，也不能與其他 subagent call 重疊，避免驗證指令、
暫存檔或 edits 互相干擾。

可在相鄰的 `config.json` 降低 concurrency；有效範圍是 1 到 4：

```json
{
  "maxConcurrency": 2
}
```

## 四種角色

Extension 啟動時會讀取 [`agents/`](agents/) 下的 Markdown profiles。Profile 定義 role
prompt、model、thinking level 與 exact tool allowlist。

| Role | Model | 可用 tools | 工作範圍 |
| --- | --- | --- | --- |
| `scout` | `openai-codex/gpt-5.6-luna` | `read`, `grep`, `find`, `ls` | 讀取 local repository，整理檔案、caller 與結構。 |
| `researcher` | `openai-codex/gpt-5.6-terra` | `web_search`, `source_check`, `fetch_content`, `get_search_content` | 搜尋外部資料並整理來源。 |
| `environment-scout` | `openai-codex/gpt-5.6-luna` | `kubectl_inspect`, `gcloud_inspect` | 對明確指定的 Kubernetes 或 GCP 目標做 structured read-only inspection。 |
| `worker` | `openai-codex/gpt-5.6-terra` | `read`, `write`, `edit`, `safe_bash`, web tools, `subagent` | 只處理使用者已批准、repository 與 owned files 都明確的 isolated edit。 |

`scout` 使用 `thinking: off`，讓 bounded repository lookup 以速度和成本為優先；其他角色維持
`thinking: medium`。這個設定只關閉額外 thinking budget，不會移除 scout 的 read-only tools。

Project settings 只保留 `pi-web-access` 的安裝位置，並用 package filter 阻止 parent
載入其 extension。外部網站搜尋、抓取、claim check 與stored-content retrieval 都交給
`researcher`；child 透過明確 path 載入project-local `pi-web-access`。`worker` 若需要自身
allowlist內的web tools也使用相同path。`environment-scout`與`worker`所需的custom tools按
profile加入；worker載入`safe_bash`時一併載入Context Pipeline的result hook，不依賴child
自動發現extensions。

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
ConfigMap contents、credentials 與 mutation operations。Kubernetes pods、workloads、services、
events、pod logs 和 Cloud Logging 會先通過 Context Pipeline 的 deterministic processor；其餘
operation套用共用text budget。Structured結果由Context Pipeline依schema縮減，先保留status、
counts、completeness與omitted metadata，整體上限為120行／24 KiB，不再盲切JSON。Command
failure diagnostics限制為120行／8 KiB。所有路徑都會遮罩常見token、password、JWT與
private-key patterns。Tool-result details只保存check label、command name、processor name、
truncation與completeness，不複製完整argv。遮罩不能取代最小查詢範圍。

## Extension 怎麼接收 child 結果

Child 使用 JSON mode，stdout 會輸出一連串 events。Extension 解析這些 events，追蹤：

- 最後一段 assistant text；
- token usage；
- tool call 次數；
- 正在執行的 tool；
- 最近的 tool calls；
- provider、process 與最近一次tool error；task preview、tool arguments與error text會先redact再進入progress details。

執行期間，extension透過tool update把簡短進度交給parent。Child結束後，只取最後一段
assistant text；final image blocks不會直接轉送，child必須先把相關image evidence寫成文字結論。
文字先redact再透過Context Pipeline共用的UTF-8-safe budget處理：單一child最多400行／16 KiB；
parallel aggregate最多600行／24 KiB，先為每個child保留公平份額，再把短結果未使用的容量分給
較長結果，避免一個verbose結果隱藏其他task。Head與tail evidence都保留。

`details.results`記錄`outputComplete`及source/emitted lines與bytes；model-facing aggregate另有
`contentComplete`。任何省略都會出現`content_complete=false` marker。Temporary child session
結束後刪除，不另存raw response。Parent model看到bounded result，不是child conversation。

## Timeout、abort 與錯誤

預設期限如下：

| Role | 最長時間 |
| --- | --- |
| `scout`, `researcher`, `environment-scout` | 5 分鐘 |
| `worker` | 10 分鐘 |

Parent 中止 tool call 或 child 超時時，extension 先送 `SIGTERM`，等待三秒後仍未結束才送
`SIGKILL`。Spawn error、provider error、非零 exit code、timeout 與 abort 都會讓該 task
標成 failed。單次tool error會保留在progress中；若child之後成功恢復且process正常結束，
不會僅因該次tool error把整個task改標failed。Parallel mode會保留每一項task的成功或失敗
結果，不會因為其中一項失敗就假裝整批成功。

## 安裝與驗證

從 repository root 執行：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
npm run test:extensions
```

Profiles 位於 [`agents/`](agents/)，child-only tools 位於 [`tools/`](tools/)，主要 runtime
實作位於 [`index.ts`](index.ts)。Unit tests 使用 fake child events，不會呼叫付費模型。
