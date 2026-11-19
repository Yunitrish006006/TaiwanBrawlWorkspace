# Speed Camera Feature – Integration and Acceptance Plan

Status: **in development**. This document records target boundaries, not claims of release.

## Repository and ownership
- `taiwan_brawl_front`: app shell, optional `packages/taiwan_speed_camera` Flutter package, Android/iOS foreground GPS permissions.
- `taiwan_brawl_back`: official NPA dataset 7320 CSV ingestion, schema validation, versioned snapshot, read-only API, automated tests.
- `TaiwanBrawlWorkspace`: cross-repository contract, dependencies and release gate.
- `user_basic_system`: a separate feature branch adds `user_account_core.dart` and `user_social_system.dart` compatibility facades; the old combined export remains unchanged. These facades are not separate repositories yet.
- Long-term: move `packages/taiwan_speed_camera` to its own Repository, keeping its `SpeedCameraPage` public API. It is not a separate Repo yet.

## Isolation contracts
1. Camera module does not depend on login, friends, chat, games, FCM or persistent location tracking.
2. App shell owns navigation and configuration. Camera package owns GPS subscriptions and must stop them when users stop/leave the feature.
3. Backend API is read-only for clients:
   - GET `/api/speed-cameras/manifest` — `{schemaVersion,source,sourceUrl,generatedAt,recordCount,version}`
   - GET `/api/speed-cameras/snapshot` — NPA-normalized `{schemaVersion,source,sourceUrl,generatedAt,recordCount,points,contentSha256}`
   - Until a separate `SPEED_CAMERA_DATA` Cloudflare KV binding is provisioned and populated, expect HTTP 503.
4. Source data: https://data.gov.tw/dataset/7320 (Open Government Data License 1.0). Preserve attribution.
5. Versioned data may update without app release; new compiled Flutter features require an app build/release.

## Release acceptance gates
- [ ] Backend tests green for core, CSV, API, ingestion and existing regression suite.
- [ ] CI successfully ingests REAL government CSV with plausible record count and no schema errors.
- [ ] Cloudflare isolated KV namespace configured, data staged and validated; API returns an expected snapshot.
- [ ] Flutter package `flutter analyze` and `flutter test` green.
- [ ] App shell `flutter analyze`, `flutter test`, Web and Android builds green.
- [ ] Anonymous usage is proven (camera data endpoints require no login).
- [ ] Offline cache works; a failed update does not erase last valid snapshot.
- [ ] Background operation (if enabled) follows Android/iOS policies and opt-in.
- [ ] Road-level false positives tested on opposite-direction, parallel and elevated roads; no claims of precision before map matching.
- [ ] GPS/voice real-device verification with appropriate safety precautions.
- [ ] Existing login, friends, messaging and game regression tests green.
- [ ] PR review approved; merge branches only after acceptance.

## Initial limitations
- Native location is FOREGROUND ONLY. Web cannot guarantee operation with screen locked.
- Camera candidate detection uses heading and proximity only; it does NOT prove the enforcement device applies to the driver's road.
- Data cache uses a validated local JSON snapshot for the prototype; evaluate indexed SQLite storage before full rollout.
- Account/social decoupling has not been implemented.
- Do not merge this branch as a finished speed-camera feature until the above gates are satisfied.
