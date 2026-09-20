# MCP adapter

This directory is reserved for a future standard MCP adapter over the same normalized workspace knowledge used by the CLI. The v0.1 scaffold intentionally keeps the intelligence core dependency-free.

`server.mjs` currently exposes a JSON-lines adapter for local experiments; replace it with the official MCP SDK when the protocol surface is stabilized.

Supported methods: `resolve`, `impact`, `testPlan`, `modelPlan`, and `orchestrate`. The last two share the CLI model policy and accept `params.options` with `tier`, `reason`, `failedAttempts`, `failureKind`, `evidence`, and `handoff`.

```json
{"id":1,"method":"modelPlan","params":{"task":"更新 README 文件"}}
{"id":2,"method":"orchestrate","params":{"task":"修改 Royale 房間 websocket"}}
```

All methods only return local plans/data. This adapter neither calls a model nor executes a task, and is not a standard MCP server with `initialize` / `tools/list` support. Use `scripts/run-task.mjs` to apply a plan to a new Codex process. See [Model tiering](../docs/model-tiering.md).
