# 上游版本與改編資訊

## 上游

- 專案：[petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop)
- 取用分支：`main`
- 取用 commit：[`61c21c351da4dcb40946a11fead978f2078a2c65`](https://github.com/petergyang/no-ai-slop/commit/61c21c351da4dcb40946a11fead978f2078a2c65)
- 上游 commit 日期：2026-07-22
- 繁中改編日期：2026-07-23
- 上游授權：MIT

## 保留內容

- 保留原作者 Peter Yang 的 MIT 版權聲明與完整 `LICENSE`。
- 保留原版的兩種任務：編修與只偵測。
- 保留「最少但有效的修改」、不發明資料、保護作者聲音、編修後自我檢查等核心原則。
- 保留 `README.md`、`SKILL.md`、`eval.md` 與 `agents/openai.yaml` 的基本專案結構。

## 在地化改編

- 將 skill 名稱改為 `no-ai-slop-zh-tw`，避免與英文原版同時安裝時衝突。
- 將說明、提示、規則與例句改為繁體中文（台灣）。
- 將英文特有模式改寫為中文對應問題，例如「彰顯／凸顯」式空泛分析、名詞化公文腔、連接詞堆疊與翻譯腔。
- 新增中文常見模式：虛假全面性、讀者代言、三段式口號、無證據效益串聯與「透過 A 來實現 B」抽象連鎖。
- 加入台灣常用詞與中英混寫原則，但要求優先保留作者已建立的地區語感。
- 新增 `examples.md` 與 `FORK_GUIDE.md`，方便測試與發布 fork。

## 更新上游的建議

繁中版最好把在地化改動維持在少數幾個 commit。上游更新後，可以把繁中 commit rebase 到新的 `upstream/main`，逐一處理衝突並重新跑 `eval.md` 與 `examples.md`。

```bash
git remote add upstream https://github.com/petergyang/no-ai-slop.git
git fetch upstream
git checkout main
git rebase upstream/main
```

若 `upstream` 已存在，不需重複新增。發生衝突時，先保留上游新增的功能規則，再將新內容重新在地化；不要只接受單一版本而漏掉上游更新。
