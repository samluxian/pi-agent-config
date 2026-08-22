# Service Architecture Mapping

這個 skill 建立跨 repository、跨 delivery layer 的 service map，用來回答 ownership、dependency
與服務拆分影響。Agent contract 位於 [`SKILL.md`](SKILL.md)。

## 何時使用

- 一項 capability 橫跨 frontend、BFF、backend、CI 與 GitOps repositories。
- 要確認 API、route、configuration、identity 或 state ownership。
- 規劃 service extraction、拆分順序、rollback 與 coordinated changes。

## 不適用

- 單一 repository troubleshooting。
- 判斷 live health。
- time-bounded runtime incident。
- 直接實作拆分或 migration。

## Evidence layers

```text
repository identity
  → source / module / build ownership
  → synchronous and asynchronous APIs
  → CI artifact / image handoff
  → hosting / GitOps delivery
  → routes / configuration / identity / state
```

每一條 connection 都必須標示為 fact、inference、conflict 或 unknown。Directory name、service
name 或 resource name 不能單獨證明 ownership 或 runtime dependency。

## 怎麼運作

1. 確認 business capability、repositories、environments 與需要做的決策。
2. 收集 bounded repository、CI、API、configuration 與 state references。
3. 建立 source、API、delivery、route、identity 與 state 的 dependency map。
4. 找出切割邊界、coordinated changes 與 owner。
5. 排列 migration order、rollback constraint 與 handoff。
6. 缺少關鍵 contract 時停止，指出最小的下一份 evidence。

## 入口

- [`references/dependency-mapping.md`](references/dependency-mapping.md)：evidence classification、
  dependency dimensions 與 split checklist。
- [`scripts/service_topology_inventory.sh`](scripts/service_topology_inventory.sh)：bounded cross-repo
  source、CI、API、config 與 module inventory。

## 與 diagnostics 的差別

這個 skill 回答「系統由哪些 repositories、contracts 與 owners 組成」。
`gitops-state-diagnostics` 回答「expected 與 actual 在哪一層第一次不同」；
`runtime-dependency-diagnostics` 回答「runtime request path 的哪一條 edge 失敗」。

## 輸出

輸出包含 topology、conflicts/unknowns、split impact、owners、順序、rollback constraints 與一個
bounded recommendation。
