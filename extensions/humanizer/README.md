# Humanizer

`humanizer` 是 DevOps Pi Agent 的 workspace-local Pi extension。它只註冊
`/humanizer` command，用目前 session 的模型重寫一段既有文字。一般 agent
回答不會載入 Humanizer 規則，也不會經過這個 extension 改寫。

## Pi 怎麼載入

Initializer 會把 `extensions/humanizer` 複製到：

```text
<workspace-root>/.pi/extensions/humanizer
```

Pi 信任 project 後會載入目錄中的 `index.ts`。Extension 不註冊 model tool、
event hook、背景程序或持久化狀態。更新後，在已開啟的 session 執行
`/reload` 才會載入新版本。

## 使用方式

直接提供文字：

```text
/humanizer In order to achieve this goal, the service has the ability to process requests.
```

若 command 後沒有文字，TUI 會開啟多行 editor。Agent 忙碌時，extension
會拒絕新的改寫要求，避免插入正在執行的 agent run。

收到文字後，extension 會：

1. 移除頭尾空白並確認內容非空。
2. 限制輸入為 48 KiB、1,500 行以內，不截斷原文。
3. 建立包含完整改寫規則與 JSON 編碼原文的 user message。
4. 呼叫 `pi.sendUserMessage()`，交給目前模型產生改寫結果。

Message 結構如下：

```text
HUMANIZER_REWRITE_REQUEST_V1
<完整改寫規則>

SOURCE_TEXT_JSON
<JSON 編碼後的原文>
END_SOURCE_TEXT_JSON
```

原文標成資料，降低其中句子被誤認為 extension 指令的機會。這條路徑只
產生一次模型回答，不會先生成再呼叫第二個模型加工。

改寫規則要求模型：

- 保留事實、數字、日期、條件、不確定性、引用與技術差異；
- 保留 commands、paths、URLs、code、API keys、resource names 與錯誤訊息；
- 依原文語言輸出，中文使用自然的台灣繁體中文；
- 減少空泛轉折、口號、chatbot 套話與不必要的格式；
- 只回傳改寫結果，不搜尋、不呼叫工具，也不自行查證內容。

最後一項是 prompt 約束，不是工具層封鎖。Humanizer 不會暫時停用 Pi tools；
需要強制禁止工具時，不能只依賴這個 command。

## 寫作樣本

要貼近個人語氣，可以把樣本和待改文字一起送入：

```text
[寫作樣本]
貼上自己過去的 2–3 段文字

[待改寫文字]
貼上要重寫的內容
```

模型只能把樣本當成語氣證據，改寫範圍仍是 `[待改寫文字]`。樣本不能改變
事實、技術名稱或安全限制。

## 它不做什麼

Humanizer 不會：

- 改寫一般 agent 回答或 repository 文件；
- 判斷文字是否由 AI 產生或提供 AI 機率；
- 查證原文；
- 自動讀取或修改 repository files；
- 保存獨立 memory；
- 保證模型遵守每一條 prompt 規則。

它把 patterns 當成編修提示，不會因單一詞彙就刪除內容。法律文字、安全
警告、正式術語、真實反方意見與刻意安排的句型仍應保留。

## 安裝與驗證

從 repository root 執行：

```bash
./scripts/init-workspace.sh --workspace-root <workspace-root>
./scripts/init-workspace.sh --workspace-root <workspace-root> --check
npm run test:extensions
```

英文 review patterns 改編自 MIT 授權的
[`blader/humanizer`](https://github.com/blader/humanizer) 2.11.1。Copyright 與
授權文字保留在 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
