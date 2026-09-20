# TaiwanBrawlWorkspace

TaiwanBrawlWorkspace 是 Taiwan Brawl 專案族的跨 repository 協作、架構知識與開發控制平面。它不是遊戲 frontend 或 backend 本身；它集中保存 repository snapshot、跨 repo contract、dependency map、測試矩陣、Workspace Intelligence 與架構 Viewer。

目前納入：

- `taiwan_brawl_front` — Flutter client / Web frontend
- `taiwan_brawl_back` — Cloudflare Workers backend / integrated deployment
- `user_ui_settings` — shared Flutter UI-settings package
- `user_basic_system` — reusable profile / DM Flutter package

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
node scripts/validate-workspace.mjs
```

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
