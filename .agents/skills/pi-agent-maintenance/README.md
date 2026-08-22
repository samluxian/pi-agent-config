# DevOps Pi Agent 維護指南

這份文件給維護 `devops-pi-agent` repository 的人。Pi 自己執行維護工作時，仍以
[`SKILL.md`](SKILL.md)、[`AGENTS.md`](../../../AGENTS.md) 與 [`references/`](references/)
內的 contracts 為準。

## 每種內容放在哪裡

| Surface | 責任 |
| --- | --- |
| `AGENTS.md` | 每輪都要遵守的安全、approval、workspace、evidence 與 mutation 規則。 |
| Skill description | 模型何時載入或略過該 skill。 |
| `SKILL.md` | Skill 的核心流程、停止條件與輸出格式。 |
| `references/` | 只有遇到具體需求才讀取的深層程序。 |
| `scripts/` | 可重複執行的 deterministic checks。 |
| `extensions/` | 必須由程式穩定執行的 Pi runtime 行為。 |
| Root `README.md` | Repository 定位、初始化方式與文件入口。 |
| Skill／extension README | 該元件的人類使用說明與底層運作方式。 |

同一條規則只保留一個來源。不要把完整 workflow 同時複製到 `AGENTS.md`、skill 和根
README。

## 維護流程

1. 確認實際 repository、branch、staged 與 unstaged changes。
2. 說明目標、假設、影響檔案、成功條件、驗證與相容性風險。
3. 閱讀相關 implementation、caller、tests 與 surface contract。
4. 提出 bounded patch，等待使用者明確批准。
5. 只修改已批准的檔案，不整理無關內容。
6. 執行能證明行為的最小 deterministic checks。
7. 最後一次 edit 後，啟動 fresh reviewer 檢查完整 final diff。

Workspace guidance maintenance 可以在本 repository 的 `main` branch 進行，但仍要先檢查
working tree、保留既有變更，而且不能 commit 或 push。

## Skill 維護

新增或修改 skill 前，先讀
[`references/skill-design-contract.md`](references/skill-design-contract.md)。主要限制如下：

- `SKILL.md` 只保留 task boundary、核心流程、停止條件、references 和 output contract。
- 深層說明移到 `references/`，重複檢查移到 `scripts/`。
- Automatic skill description 要同時寫清楚適用範圍與最近的排除範圍。
- Manual skill 要設定 `disable-model-invocation: true`，並在 root README 保留
  `/skill:<name>` 入口。
- Skill routing 有實質變更時，除了 fixtures 之外才考慮付費 benchmark。

## Extension 維護

新增或修改 extension 前，先讀
[`references/surface-contracts.md`](references/surface-contracts.md) 的 Pi Extension branch，
並完整閱讀目前安裝版本的 Pi extension 文件：

```text
<pi-package>/docs/extensions.md
```

Extension 適合處理每次都必須穩定執行的行為，例如 tool blocking、output bounds、context
shaping、session metrics 或 bounded loop guard。只靠 prompt 就能表達的領域流程應留在
skill，不要搬進 runtime code。

修改 hook 或 tool 時要確認：

- allow path；
- transform 或 block path；
- failure path；
- reset、reload 或 new-session path；
- tool-call/result identity、error state、images 與 details 是否保留；
- text output 是否同時受到 line 與 UTF-8 byte bounds 保護；
- abort、timeout 與 subprocess cleanup 是否完整。

Subagents extension 還要覆蓋 parent/child authority、role tool allowlist、single/parallel 限制、
worker approval boundary、review generation、semantic verdict、stale review、timeout、abort 與
process failure。

## README 維護

根 README 只負責 repository 定位、setup 與文件入口。元件細節放在自己的目錄：

```text
extensions/<name>/README.md
.agents/skills/<name>/README.md
```

每個 active skill 都必須有 `README.md`。README 用白話說明用途、適用與排除範圍、運作方式、
evidence／authority 邊界，以及 references/scripts 入口；`SKILL.md` 仍是 agent contract，不能
把完整 workflow 複製到 README。Manual skill 要在自己的 README 與根 README index 寫出
`/skill:<name>`。

Human-facing 行為、安裝方式或文件入口有變更時，要在同一個 patch 更新相關 README。

## Deterministic validation

先執行固定 checks：

```bash
npm run test:contract
npm run test:extensions
npm run test:init-workspace
git diff --check
```

各指令的用途：

| Command | 證明內容 |
| --- | --- |
| `npm run test:contract` | Skill metadata、README inventory、fixtures、extension registration 與 repository contracts。 |
| `npm run test:extensions` | Extension hooks、commands、tools、bounds、failure 與 reset behavior。 |
| `npm run test:init-workspace` | Symlink、extension reconciliation、dependency installation 與 readiness checks。 |
| `git diff --check` | Trailing whitespace、衝突標記與 whitespace errors。 |

依 changed surface 加上更小的 targeted test。完整對照表在
[`references/regression-matrix.md`](references/regression-matrix.md)。Unit tests 不應呼叫
付費模型。

Repository files 修改完成後，還要由 fresh reviewer 讀取 final diff，執行 bounded tests，並
回傳 semantic `pass`。只有 command exit code 0 不足以取代 reviewer 判斷。

## Skill routing benchmark

只有 automatic skill description 或 routing boundary 有實質變更時才執行：

```bash
npm run benchmark:invocation -- \
  --provider <provider> \
  --model <model> \
  --thinking low
```

執行前要先確認 provider、model、authentication 與付費測試預算。Benchmark 以模型是否真的
讀取目標 `SKILL.md` 判定 invocation，不以模型回答中是否提到 skill 名稱判定。Raw artifacts
放在 git-ignored `tmp/`。

## 文件設計來源

本 repository 的 answer-first、短標題、有限步驟與低 context 負擔原則，整合了過去
`caveman`、`stop-slop` 的有效部分，也參考
[`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd) 的 MIT 授權設計。這是介面與
溝通方式的參考，不代表對使用者做任何診斷。
