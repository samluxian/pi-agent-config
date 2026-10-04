# Code Intelligence

Headless、parser-backed 的 Pi source intelligence。目的在於避免 AI 猜測結構，
不是安全沙箱，也不禁止一般 `read`／`edit`／`write` tools。

## 成熟框架

- JavaScript／TypeScript：直接使用 **TypeScript Compiler API**（固定 JS API 版本
  `5.9.3`），不自寫 parser；runtime dependency 宣告於根目錄 package manifest／lock。
- Java：使用 JDK 公開的 **JavaCompiler／JavacTask／Trees**，不另外下載 JavaParser。
  需要完整 **JDK 17+**，只有 JRE 不足；依執行 JDK 支援的語法與標準函式庫解析。

這裡的 adapter 負責統一 compiler 輸出、索引及證據格式，不取代語言 parser。
上游 API：[TypeScript](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)、
[JavacTask](https://docs.oracle.com/en/java/javase/17/docs/api/jdk.compiler/com/sun/source/util/JavacTask.html)、
[Trees](https://docs.oracle.com/en/java/javase/17/docs/api/jdk.compiler/com/sun/source/util/Trees.html)。

## Tools

| Tool | 用途 |
| --- | --- |
| `code_index` | 對明確指定的 Git repository root 建立完整支援語言 source map |
| `code_index_status` | 回報覆蓋率、失敗、缺口及 source/config/JAR hash 新鮮度 |
| `code_query` | 分頁查詢檔案、symbols、references、dependencies、dependents、unknowns 與 diagnostics |
| `code_context` | 檔案定義、依賴、引用及解析缺口；測試關聯明確標成 unknown |
| `code_impact` | 依 depth 有界遍歷已知 dependents；limit 只限制輸出，不宣稱功能必然損壞 |
| `code_validate_change` | 重新索引、比較檔案／symbol／具體 edges、新 unresolved／diagnostics／parse failures |

所有 tools 只讀取來源、查詢 Git、維護 process-local 記憶體；不執行 application、
Maven／Gradle、annotation processors、typecheck 或 tests，不寫入 target／cache。
`code_validate_change` 不修改或 rollback 檔案。

回傳 evidence ID 綁定 snapshot；模型必須區分 **FACT / INFERENCE / UNKNOWN**。
Parser 失敗或缺少 runtime 不會 fallback 成 regex／檔名猜測，會回報 adapter failure。
Java diagnostics 只回傳 code、severity 與位置，不回傳 raw stderr 或 source excerpts。

## 範圍與限制

- 支援 tracked／non-ignored JS、JSX、MJS、CJS、TS、TSX、MTS、CTS、Java。
  常見其他語言會標示 unsupported；不是所有檔案都能自動辨識語言。
- 預設排除依賴、常見 build/generated paths、symlinks、secret／credential filenames；
  排除項目可查詢。保守的敏感檔名規則也可能排除同名一般 source。
- 每個來源／設定檔上限 2 MiB，source files 上限 10,000，讀取總量上限 128 MiB；
  大檔顯示缺口，整體 budget 超限不發布新 snapshot。
- AST／static resolution 不是執行期 truth，也不是完整 call graph。
  初版不猜測 TESTS、routes、config、CALLS 等未實作關係。
- Java 以一個 compiler task 處理 source，不還原 Maven／Gradle source sets 或 modules。
  缺少 classpath／generated types、重複 classes 等情況要看 diagnostics。
  可在 `code_index.javaClasspath` 明確提供 repository-local dependency JARs；不自動
  搜尋 home Maven cache、不下載依賴、不執行 build。
- 新鮮度涵蓋 inventoried source/config/JAR，不檢查所有 node_modules declarations 或
  compiler binary 置換；dependencies 改變後重新索引，parser／runtime 更新後重載 Pi。
- 每個 repository 保留兩個 snapshot；process exit／reload 後需重建。初版修改後
  **完整重建**，避免 exports、檔案移動、alias 等變更造成錯誤的增量失效判斷。

詳見 [skill](../../.agents/skills/code-intelligence/SKILL.md) 與
[evidence contract](../../.agents/skills/code-intelligence/references/evidence.md)。

## 安裝與整合

此 extension 已列入根目錄 `pi.extensions`，沿用現有 workspace initializer 的部署與
依賴安裝流程；initializer 會安裝 workspace-local TypeScript，並驗證固定版本及
Compiler API parsing smoke test。一般初始化缺少 JDK 時明確警告、不安裝系統套件；
使用者可選 `--install-runtimes`／`make workspace-init-runtimes`，在 Ubuntu 以 sudo/apt
安裝 `openjdk-17-jdk-headless`。已有完整 JDK 17+ 時保留；不切換 JAVA_HOME／alternatives。
`--check` 只讀取 runtime readiness，不會安裝。Node／npm／Pi 仍須事先提供。
Skill 沿用 `.agents/skills` 連結。更新 repository source 不代表目前 session 已載入；部署後需重新載入 Pi。
不直接修改 `~/.pi/agent`。

Plan mode 允許這六個 read-only tools。Scout child 明確載入同一 extension，但不共用
parent 的記憶體 index，仍須遵守 parent 的 repository-wide／bounded task scope。

`test:extensions` 同時跑 graph／freshness／tool integration 測試與語言 adapter fixtures。
TypeScript 或 JDK 缺少時，對應真實 compiler tests 明確 skip，不宣稱語言解析已驗證。
Initializer tests 使用假的 npm／sudo／apt／Java fixtures，不執行真實系統安裝；通過
readiness smoke check 也不代表已驗證 target 專案的完整 graph 或行為。
