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
7. 檢查完整 final diff 並回報 validation gaps。

使用者明確要求時，可以直接在本 repository 的 `main` branch 建立、修改、重新命名或刪除
repository-owned source、tests、scripts、extensions、configuration 與 documentation。這個
例外不適用 sibling/target repositories、secrets、generated artifacts、cache 或 git-ignored
temporary files，也不允許 agent commit、push 或修改 Git remotes。修改前仍須檢查 working
tree、確認 approval scope 並保留無關的使用者變更。

## Skill 維護

新增或修改 skill 前，先讀
[`references/skill-design-contract.md`](references/skill-design-contract.md)。主要限制如下：

- `SKILL.md` 只保留 task boundary、核心流程、停止條件、references 與 domain-specific
  reporting additions；通用 report fields 由 `AGENTS.md` 統一管理。
- 深層說明移到 `references/`，重複檢查移到 `scripts/`。
- Skill metadata 必須符合 Agent Skills 的 name、description 與 optional field constraints。
- Automatic description 要寫清楚做什麼與何時使用；只有真實 collision 才需增加最近的排除範圍。
- Manual skill 可設定 `disable-model-invocation: true`，並在需要人類入口時記錄
  `/skill:<name>`。
- 500 行與約 5,000 tokens 是 review/performance signals，不是 hard failures。
- Skill routing 有實質變更或已知 collision 時，才考慮 fixtures 與付費 benchmark。

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
worker approval boundary、completion-gate absence、timeout、abort 與 process failure。

## README 維護

根 README 只負責 repository 定位、setup 與文件入口。元件細節放在自己的目錄：

```text
extensions/<name>/README.md
.agents/skills/<name>/README.md
```

只有存在人類 setup、inventory 或 manual usage 時才需要 skill README。README 用白話說明
用途與入口；`SKILL.md` 仍是 agent contract，不能把完整 workflow 複製到 README。
README 是否存在不影響 Agent Skills loadability，也不是 contract validator gate。

Human-facing 行為、安裝方式或文件入口有變更時，要在同一個 patch 更新相關 README。

## 公開內容安全

修改 `AGENTS.md`、skills、extensions、scripts、fixtures、configuration 或文件時，先依
[`references/public-repository-safety.md`](references/public-repository-safety.md) 泛化所有範例
與 identifiers。私人 target evidence 不得成為 repository fixture 或操作 inventory。

執行 `npm run test:public-safety`。組織專用名詞透過 repository 外的
`PI_PUBLIC_SAFETY_TERMS_FILE` 提供；不要把 denylist 或命中的 term 寫入 repository、logs
或 validation 結論。Generic scanner 無法辨識所有 proper nouns，因此 parent 仍須做
semantic inspection。

## Deterministic validation

Final edit 完成後固定執行三個 bounded checks：

```bash
npm run test:public-safety
npm run test:contract
git diff --check
```

`test:contract` 只 hard-fail Agent Skills loadability 與 metadata errors；AGENTS／SKILL 大小、
portability、performance 與 focus findings 是 nonblocking signals。README、settings、package、
exact wording、provenance 與 invocation fixtures 不屬於這個 validator。Public safety獨立執行。
再依 changed surface 選一列 targeted test：

| Changed surface | Targeted command |
| --- | --- |
| Contract validator implementation | `npm run test:contract-unit` |
| Extension runtime、package registration 或 harness | `npm run test:extensions` |
| Workspace initializer | `npm run test:init-workspace` |
| Makefile façade | `npm run test:makefile` |
| 其他 skill script | 該 skill regression-matrix 列指定的 test |

完整對照表在 [`references/regression-matrix.md`](references/regression-matrix.md)。不要因為
README 或不相關 skill 改動而重跑 extensions、initializer 與所有 script tests。Repository
state 沒變時沿用成功結果；失敗時才執行更窄的診斷指令。Unit tests 不應呼叫付費模型。

Repository files 修改完成後，由 parent 或 approved worker 讀取 final diff 並執行 bounded
tests。Command exit code 0 仍須搭配行為證據。

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
