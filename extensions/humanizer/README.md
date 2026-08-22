# Humanizer

`humanizer` 是 DevOps Pi Agent 的 workspace-local Pi extension。它處理兩種工作：

1. 在一般回答前加入固定的寫作規則。
2. 透過 `/humanizer` 把一段既有文字交給目前模型重寫。

它改變的是模型收到的指令，不是在模型回答後修改輸出。

## Pi 怎麼載入這個 extension

Initializer 會把 `extensions/humanizer` 複製到：

```text
<workspace-root>/.pi/extensions/humanizer
```

Pi 信任 project 後，會找到目錄中的 `index.ts`，載入它的 default factory，並把
`ExtensionAPI` 傳進去。Humanizer 隨後向 Pi 註冊兩個入口：

```text
before_agent_start event hook
/humanizer command
```

它沒有註冊 model tool，也沒有啟動背景程序。更新 extension 後，要在既有 session 執行
`/reload`，Pi 才會重新載入程式。

## 一般回答怎麼經過 Humanizer

Pi 處理一次使用者要求時，流程可以簡化成：

```text
使用者輸入
  ↓
Pi 組合原本的 system prompt、workspace 規則、skills 與 tools
  ↓
before_agent_start
  ↓
Humanizer 把寫作規則接到 system prompt 後面
  ↓
Pi 把完整內容送給目前選定的模型
  ↓
模型回答，或先要求 Pi 執行工具再繼續回答
```

Humanizer 的 `before_agent_start` handler 會保留原 system prompt，再附加
`HUMANIZER_ALWAYS_ON_V1` 規則。這些規則要求模型：

- 使用使用者的語言；中文使用自然的台灣繁體中文；
- 保留事實、數字、日期、條件、不確定性、引用與技術差異；
- 保留 commands、paths、URLs、code、API keys、resource names 與錯誤訊息；
- 使用清楚的主詞和動詞，減少空泛轉折、口號與 chatbot 套話；
- 不因改寫風格而改變 scope、approval、安全規則或工具行為。

如果 system prompt 已有 `HUMANIZER_ALWAYS_ON_V1`，handler 不會再加一次。這可避免
reload、其他 hook chaining 或重複啟動造成同一組規則一直累加。

這條路徑只有一次模型生成：

```text
原 system prompt + Humanizer 規則 → 目前模型 → 回答
```

Extension 不會先讓模型回答，再呼叫第二個模型加工。它也不會攔截或重寫模型已經產生的
文字。因此，實際語氣仍取決於目前模型是否正確遵守 system prompt。

## `/humanizer` 怎麼運作

`/humanizer` 適合重寫一段已存在的文字：

```text
/humanizer In order to achieve this goal, the service has the ability to process requests.
```

如果 command 後面沒有文字，TUI 會開啟多行 editor。Agent 忙碌時，extension 會拒絕新的
改寫要求，避免它插入正在執行的 agent run。

收到文字後，extension 依序做以下事情：

1. 移除輸入頭尾空白。
2. 檢查輸入不是空字串。
3. 檢查 UTF-8 大小不超過 48 KiB，行數不超過 1,500 行。
4. 建立一個新的 user message。
5. 呼叫 `pi.sendUserMessage()`，讓 Pi 用目前 session 的模型處理這個 message。

新的 message 結構如下：

```text
HUMANIZER_REWRITE_REQUEST_V1
<完整改寫規則>

SOURCE_TEXT_JSON
<JSON 編碼後的原文>
END_SOURCE_TEXT_JSON
```

原文用 JSON 包起來，並明確標成資料。這可降低原文中的句子被誤當成 extension 指令的風險。
下一個 agent run 看到 `HUMANIZER_REWRITE_REQUEST_V1` 後，`before_agent_start` 不再附加精簡
規則，因為完整改寫規則已經放在 user message 裡。

完整規則要求模型只回傳改寫結果，不加分析、分數或開場白。它也要求模型不要搜尋網路、
呼叫工具、讀檔、寫檔或自行查證內容。這些要求是送給模型的 prompt，不是工具層的強制
封鎖；Humanizer 本身沒有暫時移除 Pi tools。如果工作需要硬性禁止工具，不能只依賴
`/humanizer` prompt。

## 寫作樣本

需要貼近個人語氣時，可以把樣本和待改文字一起送入：

```text
[寫作樣本]
貼上自己過去寫的 2–3 段文字

[待改寫文字]
貼上要重寫的內容
```

模型只能把寫作樣本當成語氣證據，實際改寫範圍是 `[待改寫文字]`。樣本不能用來改變事實、
技術名稱或安全限制。

## 它不做什麼

Humanizer 不會：

- 判斷一段文字是否由 AI 產生；
- 提供 AI 機率或風格分數；
- 查證原文的事實；
- 自動讀取或修改 repository files；
- 保存另一份獨立 memory；
- 保證模型一定遵守每條寫作規則。

它使用 pattern 作為改寫提示，不會因為看到一個詞就直接刪除。法律文字、安全警告、正式
術語、真實反方意見與有意安排的句型仍應保留。

## 安裝與驗證

從 repository root 執行：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
npm run test:extensions
```

英文 review patterns 改編自 MIT 授權的
[`blader/humanizer`](https://github.com/blader/humanizer) 2.11.1。Copyright 與授權文字
保留在 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
