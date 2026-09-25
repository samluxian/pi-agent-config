# 建立繁體中文 GitHub fork

這份目錄已經是可發布的繁中版本。你可以套用隨附的 patch，也可以直接用 ZIP 內容覆蓋 fork 的工作目錄。

## 方法一：Fork 後套用 patch

1. 到上游專案 [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) 按 **Fork**。
2. 建議把 repository name 設為 `no-ai-slop-zh-TW`。若 GitHub 不允許在建立 fork 時改名，可在 fork 建立後到 **Settings → General → Repository name** 修改。
3. Clone 你的 fork，建立繁中分支：

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/no-ai-slop-zh-TW.git
cd no-ai-slop-zh-TW
git checkout -b zh-TW
```

4. 先檢查 patch 是否能乾淨套用，再正式套用：

```bash
git apply --check /path/to/no-ai-slop-zh-TW.patch
git apply /path/to/no-ai-slop-zh-TW.patch
```

5. 檢查變更並用你自己的 Git 身分提交：

```bash
git status
git diff --check
git add -A
git commit -m "feat: add Traditional Chinese localization"
git push -u origin zh-TW
```

6. 在 GitHub 建立 pull request，把 `zh-TW` 合併到你的 `main`。也可以在本機合併：

```bash
git checkout main
git merge --ff-only zh-TW
git push origin main
```

## 方法二：用 ZIP 內容覆蓋

1. Fork 並 clone 上游專案。
2. 解壓縮 `no-ai-slop-zh-TW.zip`。
3. 把解壓後的所有檔案複製到 clone 的 repository 根目錄，允許覆蓋同名檔案。
4. 執行：

```bash
git add -A
git diff --cached --check
git commit -m "feat: add Traditional Chinese localization"
git push origin main
```

## 設定上游 remote

為了日後同步英文原版，保留你的 fork 為 `origin`，另加 `upstream`：

```bash
git remote add upstream https://github.com/petergyang/no-ai-slop.git
git remote -v
```

同步時：

```bash
git fetch upstream
git checkout main
git rebase upstream/main
```

若有衝突，重新在地化上游新增或修改的規則，接著檢查 `README.md`、`SKILL.md`、`eval.md`、`agents/openai.yaml` 與 `examples.md` 是否一致。

## 建議的 GitHub About

**Description**

```text
去除繁體中文寫作中的 20+ 種 AI 腔，同時保留作者原本的語氣。
```

**Topics**

```text
agent-skill, traditional-chinese, zh-tw, writing, editing, ai-writing
```

## 安裝測試

推送完成後，把帳號換成你的 GitHub 使用者名稱：

```text
請全域安裝這個 skill：https://github.com/YOUR_GITHUB_USERNAME/no-ai-slop-zh-TW
```

安裝後先測試：

```text
/no-ai-slop-zh-tw 只檢查 AI 腔，不要改寫

很多人都忽略了：真正的問題不是工具，而是思維。這不只是一場升級，更是一場變革。
```

預期回覆應指出假洞見鋪陳、冒號揭曉、二分轉折與重要性膨脹，但不應直接重寫全文或判定作者身分。

## 授權注意事項

不要刪除或改寫 `LICENSE` 中的原作者版權聲明。MIT 授權允許使用、修改與再散布，但要求在軟體副本或重要部分中保留版權與授權聲明。
