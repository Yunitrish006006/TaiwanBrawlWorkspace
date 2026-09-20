# TaiwanBrawlWorkspace

TaiwanBrawlWorkspace 是 Taiwan Brawl 專案族的跨 repository 協作、架構知識與開發控制平面。它不是遊戲 frontend 或 backend 本身；它集中保存 repository snapshot、跨 repo contract、dependency map、測試矩陣、Workspace Intelligence、CI 規則與 Flutter 架構 Viewer。

目前納入的 active repositories：

- `taiwan_brawl_front` — Flutter client / Web frontend
- `taiwan_brawl_back` — Cloudflare Workers backend / integrated deployment
- `user_ui_settings` — sibling Flutter UI-settings package
- `user_basic_system` — reusable profile / DM Flutter package

## Repository map

```text
TaiwanBrawlWorkspace/
├── data/                       machine-readable repo snapshot / contracts / relationships
├── docs/                       maintained architecture and development docs
├── intelligence/               task resolution / impact / test planning logic
├── mcp/                        MCP-ready adapter surface
├── scripts/                    CLI / generators / validators
├── viewer_flutter/             maintained architecture viewer scaffold
├── .agents/skills/             repository-local workspace skill
├── .github/workflows/          validation + Flutter viewer CI
├── index.html                  curated lightweight architecture overview
└── AGENTS.md                   repository-wide development invariants
```

## Source-of-truth hierarchy

1. **Owning repository**：implementation detail、實際 branch、source、tests。
2. **`data/*.json`**：已記錄的跨 repo snapshot 與 contract。
3. **`docs/`**：維護規則、release/deploy 檢查與架構說明。
4. **Generated viewer data**：衍生 presentation，不得反向改寫 contract。

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

第一版 intentionally 維持小而可驗證：先建立可靠的 repo/contract graph，再逐步加入 code indexing、change intelligence、runtime orchestration 與 live bridge；不要一開始就複製 TotemWorkspace 所有高階 runtime。

## Local sibling layout

建議本機維持：

```text
TaiwanBrawl/
├── TaiwanBrawlWorkspace/
├── taiwan_brawl_front/
├── taiwan_brawl_back/
├── user_ui_settings/
└── user_basic_system/
```

這個 layout 也符合前端目前的 `../user_ui_settings` path dependency。

## Viewer

`viewer_flutter/` 是架構 viewer scaffold。產生 viewer asset：

```bash
node scripts/render-flutter-data.mjs
```

然後在有 Flutter SDK 的環境：

```bash
cd viewer_flutter
flutter pub get
flutter run -d chrome
```

## CI

- `validate.yml`：驗證 workspace JSON、cross-reference、secret / absolute-path hygiene。
- `flutter-viewer.yml`：驗證 viewer scaffold 可 analyze/test/build（需 Flutter action）。
