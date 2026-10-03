# Bounded Subagents

`subagents` 是 DevOps Pi Agent 的 workspace-local extension。它讓目前的 Pi agent 可以把一項
有明確邊界的工作交給另一個獨立 Pi process，再把結果收回來。

主要目的不是增加 parent agent 的權限，而是隔離對話 context：child 可以讀取範圍內的
檔案、搜尋網路或收集唯讀環境證據，parent 接收整理後的結果並負責修改與驗證。

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

不繼承 parent conversation 不代表沒有其他 context instructions。目前 child 啟動參數
未使用 `--no-context-files`，Pi 仍會依 context-file discovery 載入 agent directory、
`cwd` 與祖先目錄適用的 `AGENTS.md`／`CLAUDE.md`。`--no-skills` 和
`--no-extensions` 不會關閉這個機制。Parent 必須提供明確的 task 限制；若發現
載入規則衝突，先釐清，不把 child 的工作目錄或當地指示當成擴大權限的授權。

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
影響。所有 child 都只負責唯讀證據，修改與驗證由 parent 執行。

可在相鄰的 `config.json` 降低 concurrency；有效範圍是 1 到 4：

```json
{
  "maxConcurrency": 2
}
```

## 三種角色

Extension 啟動時會讀取 [`agents/`](agents/) 下的 Markdown profiles。Profile 定義 role
prompt、model、thinking level 與 exact tool allowlist。

| Role | Model | 可用 tools | 工作範圍 |
| --- | --- | --- | --- |
| `scout` | `openai-codex/gpt-6-luna` | `read`, `grep`, `find`, `ls` | 讀取 local repository，整理檔案、caller 與結構。 |
| `researcher` | `openai-codex/gpt-6-luna` | `web_search`, `source_check`, `fetch_content`, `get_search_content` | 搜尋外部資料並整理來源。 |
| `environment-scout` | `openai-codex/gpt-6-luna` | `kubectl_inspect`, `gcloud_inspect` | 對明確指定的 Kubernetes 或 GCP 目標做 structured read-only inspection。 |

`scout` 使用 `thinking: off`，預設快速、定向查找：先讀已確認路徑，未確認時只在指定目錄內搜尋；
證據足夠就停，僅回傳必要行號、結論與缺口，不預設追完所有依賴或貼長 code snippets。
Parent 遇到一兩個已知小檔案應直接讀取；需要多次搜尋／讀取、大型來源或可隔離的
context-heavy 證據時，可交給 scout，並提供 repo／目錄、具體問題、搜尋邊界與精簡回報。
使用者或選定 skill 明確要求時也可委派；只有獨立的搜尋才平行派發。其他角色維持
`thinking: medium`；關閉 scout 的額外 thinking budget 不會移除其 read-only tools。

Project settings 只保留 `pi-web-access` 的安裝位置，並用 package filter 阻止 parent
載入其 extension。外部網站搜尋、抓取、claim check 與stored-content retrieval 都交給
`researcher`；child 透過明確 path 載入project-local `pi-web-access`。
`environment-scout` 的 custom inspection tools 依 profile 載入，不依賴 child 自動發現 extensions。

## Parent 和 child 的責任

Parent 保留：

- scope 與成功條件；
- 使用者是否已批准修改；
- child 可以檢查哪些路徑或目標；
- evidence 是否足以支持結論；
- 多個 child 結果之間的衝突處理；
- 最後修改與交付判斷。

Child 只執行 task 內寫明的工作。啟動 child 不代表把 parent 的權限或責任一起交出去。

Parent 使用輕量任務契約交代
`GOAL`、`CONTEXT`、`SCOPE`、`CONSTRAINTS`、`APPROACH`、`ACCEPTANCE`、`RETURN`。
小任務可以合併欄位；這是提示指引，不是新的 schema gate、spec 或重複批准流程。
Child 回報結論、可查證來源、完成條件狀態、驗證與缺口；parent 仍需核對。
優先使用已確認路徑，證據足夠就停止，不為一個窄問題掃描整套 SDK。

Child 不負責編輯。Parent 必須依 workspace contract 確認使用者授權、file ownership 和驗證。

## Tool allowlist 不是 sandbox

Exact tool allowlist 可阻止 child 直接看到未列出的 Pi tools，但不等於作業系統 sandbox。

Repository、Git remote、Kubernetes、Argo CD、GCP、secret 與 deployment mutation 規則仍由
parent contract 和 role prompt 約束。Skills、tutorials 與 child 的當地 context instructions
不能擴大 workspace contract 的權限。

`scout` 的 `read`／`grep` 沒有 repository path sandbox；工具名稱的 allowlist 不會限制
每次讀取的路徑。Output redaction 也不能保證敏感內容從未被讀取或全部被遮罩。
Parent 必須限定已確認的路徑、目標與非機密欄位，child 必須遵守；不得以這些防護
代替 secret 禁讀規則或最小查詢範圍。

`environment-scout` 不接受任意 shell command。它只會從固定 operations 產生直接 argv，
要求明確的 context、namespace、project、location 或 resource identifier，並封鎖 Secret、
ConfigMap contents、credentials 與 mutation operations。Kubernetes pods、workloads、services、
events、pod logs 和 Cloud Logging 會先通過subagents的deterministic processor；其餘
operation套用subagents的text budget。Structured結果依schema縮減，先保留status、
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
文字先 redact，extension 不再依行數或 bytes 截斷單一 child 或 parallel aggregate。
Parallel 結果保留輸入順序、各 child 的完整文字與失敗標記。較大的回報會增加 parent context
與 token 成本；child 應整理證據而不是直接貼 raw logs。

`details.results` 保留 `outputComplete` 及 redact 後的 source/emitted lines 與 bytes；
model-facing aggregate 另有 `contentComplete`。這些只表示 extension 是否省略 final text，
不代表任務成功、證據充分或 child tools 沒有截斷資料。Environment tools、進度預覽、Pi
compaction 與 provider/model 的限制仍獨立存在。Temporary child session 結束後刪除，
不另存 raw response。Parent 收到 final text，不是完整 child conversation。

## Timeout、abort 與錯誤

預設期限如下：

| Role | 最長時間 |
| --- | --- |
| `scout`, `researcher`, `environment-scout` | 5 分鐘 |

Parent 中止 tool call 或 child 超時時，extension 先送 `SIGTERM`，等待三秒後仍未結束才送
`SIGKILL`。Spawn error、provider error、非零 exit code、timeout 與 abort 都會讓該 task
標成 failed。單次tool error會保留在progress中；若child之後成功恢復且process正常結束，
不會僅因該次tool error把整個task改標failed。UI 保留最後一次 tool error 供診斷，
成功結束時會標示 task 已恢復，不表示整個 task 失敗。Parallel mode會保留每一項task的成功或失敗
結果，不會因為其中一項失敗就假裝整批成功。

## 錯誤回饋與修正

Extension 會將 tool errors 主動附在 single／parallel 的 model-facing 回報，即使 child
final text 沒提到錯誤，parent 也會收到。每筆保留 tool 名稱及 redacted diagnostic；
provider、process、timeout、abort 另外標示。成功結束但曾有 tool error，會要求 parent
依 acceptance 核對是否真的恢復，不把 process completed 當成問題已解決。

Parent 先以最小查證區分 task/input、environment/provider 與 extension 缺陷。
使用者已授權 subagent extension 維護時，`extensions/subagents/` 內有證據支持的
local 修正不重複詢問；回饋本身不是授權，也不啟動 child 自我修改或無限修復循環。
保留使用者變更、驗證修正並回報；擴大範圍、安全限制及 remote mutation 規則不變。
這是可觀測的 feedback 流程，不保證模型會自動正確診斷或修復每個錯誤。

## 安裝與驗證

從 repository root 執行：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
npm run test:extensions
```

Profiles 位於 [`agents/`](agents/)，child-only tools 位於 [`tools/`](tools/)，主要 runtime
實作位於 [`index.ts`](index.ts)。Unit tests 使用 fake child events，不會呼叫付費模型。
