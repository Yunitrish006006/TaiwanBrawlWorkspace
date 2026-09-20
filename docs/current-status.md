# Current status

Workspace snapshot date: **2026-09-20**. Owning repo heads were verified from GitHub; both primary Taiwan Brawl repos currently point to changes from **2026-05-30**.

## Primary repositories

| Repository | Role | Version | Head |
|---|---|---:|---|
| `taiwan_brawl_front` | Flutter frontend | `0.132.0` | `a082ab2` |
| `taiwan_brawl_back` | Cloudflare Workers backend | `0.1.0` | `9465c95` |
| `user_ui_settings` | shared Flutter settings | `0.1.0` | `96e4f1d` |
| `user_basic_system` | shared Flutter profile/DM package | `0.1.1` | `a15c1b5` |

## Architecture baseline

- DM receive path is polling-first (`pending_messages`) with FCM as notification assistance.
- Royale realtime path uses WebSocket with `ROYALE_ROOM` Durable Object.
- Backend bindings include D1 `DB`, KV `STATIC_ASSETS` / `CHAT_SYNC` / `PUSH_RETRY`, and Durable Objects `ROYALE_ROOM` / `CHAT_ROOM` / `SIGNAL_ROOM`.
- One Worker serves API, media and Flutter Web assets.
