# Workspace data

這個目錄是 TaiwanBrawlWorkspace 的 machine-readable canonical knowledge layer。

- `repositories.json`：repo snapshot
- `relationships.json`：repo / external dependency graph
- `contracts.json`：cross-repository contracts
- `test-matrix.json`：required validation categories

Flutter Viewer、CLI、MCP adapter 都是這些資料的 consumer。不要為任何 consumer 維護另一份手寫資料副本。
