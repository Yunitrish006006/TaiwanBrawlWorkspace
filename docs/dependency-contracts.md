# Dependency contracts

Machine-readable authority: `data/contracts.json` and `data/relationships.json`.

## Frontend ↔ Backend

The frontend consumes HTTP APIs and Royale WebSocket endpoints owned by the backend. Contract changes require consumer impact review.

## Shared Flutter packages

`taiwan_brawl_front` currently has a sibling path dependency on `../user_ui_settings`; local workspace layout must preserve that path unless the dependency strategy changes. `user_basic_system` is consumed as `^0.1.1`.

## External runtime

Backend state is split across Cloudflare D1, KV and Durable Objects. Push delivery is FCM on client and server.
