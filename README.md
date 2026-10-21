# TaiwanBrawlWorkspace

TaiwanBrawlWorkspace 是 Taiwan Brawl 專案族的跨 repository 協作、架構知識與開發控制平面。它不是遊戲 frontend 或 backend 本身；它集中保存 repository snapshot、跨 repo contract、dependency map、測試矩陣、Workspace Intelligence 與架構 Viewer。

目前納入：

- `taiwan_brawl_front` — Flutter client / Web frontend
- `taiwan_brawl_back` — Cloudflare Workers backend / integrated deployment
- `user_ui_settings` — shared Flutter UI-settings package
- `user_basic_system` — reusable profile / DM Flutter package
- `taiwan_brawl_core` — platform-neutral runtime configuration package
- `taiwan_brawl_messaging` — transport-neutral offline-first messaging package

## Repository map

```text
TaiwanBrawlWorkspace/
├── data/                       canonical machine-readable workspace data
├── intelligence/               task resolution / impact / test planning
├── scripts/                    generators / validators / CLI
├── mcp/                        MCP adapter surface
├── apps/
│   └── viewer_flutter/         Flutter UI only; no canonical data
├── docs/                       maintained architecture / development docs
├── .agents/skills/             repository-local workspace skill
├── .github/workflows/          validation + Flutter CI
├── index.html                  lightweight curated overview
└── AGENTS.md                   repository-wide development invariants
```

## Data / Flutter boundary

`data/` 是唯一 workspace data source of truth。Flutter viewer 不保存第二份資料。

```text
data/*.json
    │
    ├──> intelligence / CLI / MCP
    │
    └──> scripts/render-flutter-data.mjs
               │
               ▼
       apps/viewer_flutter/assets/workspace-data.json
               │
               └── transient / ignored build input
```

`apps/viewer_flutter/assets/workspace-data.json` 由 generator 建立，已加入 `.gitignore`，不應人工編輯或 commit。

## Source-of-truth hierarchy

1. **Owning repository**：implementation detail、實際 branch、source、tests。
2. **`data/*.json`**：已記錄的跨 repo snapshot 與 contract。
3. **`docs/`**：維護規則、release/deploy 檢查與架構說明。
4. **Generated viewer input**：衍生 build artifact，不得反向改寫 contract。

```text
Recorded contract != inferred implementation detail
Required validation != passed validation evidence
Workspace snapshot != current remote release state
```

## Current architecture

```text
Flutter App / Browser
        |
        +---- HTTP /api/* --------------------------+
        +---- Royale WebSocket ---------------------|----> Cloudflare Worker
        +---- FCM registration ---------------------+        |
                                                         +-- D1
                                                         +-- KV
                                                         +-- Durable Objects
                                                         +-- FCM HTTP v1

Flutter build-time dependencies:
  taiwan_brawl_front
      +--> ../user_ui_settings
      +--> user_basic_system ^0.1.1
      +--> ../taiwan_brawl_core
      +--> ../taiwan_brawl_messaging

Shared runtime boundaries:
  taiwan_brawl_messaging
      -> event/projection/repository/outbox/inbox
      -> identity, credential, encryption, transport and push ports
  taiwan_brawl_core
      -> deployment configuration and feature flags only

Integrated deployment:
  taiwan_brawl_back/deploy.sh
      -> build frontend
      -> generate assets
      -> upload STATIC_ASSETS KV
      -> deploy Worker
```

## Workspace Intelligence

```bash
node scripts/taiwan-brawl-intelligence.mjs summary
node scripts/taiwan-brawl-intelligence.mjs resolve "聊天推播沒收到"
node scripts/taiwan-brawl-intelligence.mjs impact taiwan-brawl-back
node scripts/taiwan-brawl-intelligence.mjs test-plan "修改 Royale 房間 websocket"
node scripts/taiwan-brawl-intelligence.mjs model-plan "更新 README 文件"
node scripts/taiwan-brawl-intelligence.mjs orchestrate "修改 Royale 房間 websocket"
node scripts/validate-workspace.mjs
```

## Model tiering

開發任務先由本機規則分類：明確工具任務不使用模型，文件與機械式工作使用 Luna，日常開發使用 Terra，敏感或複雜修改使用 Sol；Astra 需明確理由或失敗證據才能升級。Canonical policy 是 `data/model-policy.json`。

```bash
# 安裝本專案與外層工作區的 Luna / low 預設（不改全域設定）
npm run model-defaults -- --write . ..
# 預覽，不使用模型額度
npm run task -- "修正 Royale 按鈕顏色" --cwd ../taiwan_brawl_front
# 依分級實際啟動一次 Codex
npm run task:auto -- "修正 Royale 按鈕顏色" --cwd ../taiwan_brawl_front
```

`model-defaults` 為新工作階段提供低成本預設；`task:auto` 在每個新任務啟動時依內容選模型。runner 有單次程序、並行鎖、逾時與本機用量紀錄，不會自動重試或派出 subagent。既有聊天或客戶端明確選定的模型不會被文件或計畫自動切換。完整規則、升級與限制見 [Model tiering](docs/model-tiering.md)。

## Flutter Viewer

先從 canonical data 產生 transient asset：

```bash
node scripts/render-flutter-data.mjs
```

再啟動 Flutter：

```bash
cd apps/viewer_flutter
flutter pub get
flutter run -d chrome
```

CI 也遵循相同流程：先驗證 `data/`，再生成 viewer input，最後 analyze/test/build Flutter。
