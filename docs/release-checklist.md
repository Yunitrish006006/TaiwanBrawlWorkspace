# Release / deploy checklist

This workspace does not authorize or perform production release by itself.

## Frontend

- Verify `pubspec.yaml` version.
- Run `flutter analyze` and `flutter test`.
- Build the actual target(s) required by the release.
- For an independent Web artifact, run `FLUTTER_BIN_DIR=/path/to/flutter/bin ./tool/build_web.sh` from `taiwan_brawl_front`; provide deployment values through the documented environment variables.
- Run `flutter test --platform chrome test/p2p_webrtc_runtime_test.dart` when the messaging or WebRTC boundary changes. This is browser loopback evidence only, not physical-device or Internet-NAT evidence.

## Backend / integrated web deploy

- Run `npm test`.
- Validate `deploy.sh` syntax and intended migration scope.
- Review D1 migrations and Wrangler binding changes.
- Build Flutter Web from the intended frontend commit.
- Generate asset manifest and deploy only when explicitly authorized.
- Run smoke tests and record the exact deployed commit(s).

The backend `deploy.sh` remains the integrated compatibility path. It may build
the frontend and deploy Worker assets together, while the frontend-owned script
is the independent build boundary for separate hosting or CI.

## Workspace snapshot

After verified changes, refresh `data/repositories.json` and affected contracts/relationships.
