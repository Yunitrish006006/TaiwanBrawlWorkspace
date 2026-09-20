# Workspace data

這個目錄是 TaiwanBrawlWorkspace 的 machine-readable canonical knowledge layer。

- `repositories.json`：repo snapshot
- `relationships.json`：repo / external dependency graph
- `contracts.json`：cross-repository contracts
- `test-matrix.json`：required validation categories
- `model-policy.json`：model tiers、任務訊號、升級條件與執行額度控制

Flutter Viewer、CLI、MCP adapter 都是這些資料的 consumer。不要為任何 consumer 維護另一份手寫資料副本。
