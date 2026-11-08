# Chat crypto feasibility spike

This isolated browser prototype checks Matrix Rust crypto WASM loading and encrypted IndexedDB store persistence with a synthetic account/device. It does not touch the Flutter production app, live account, messages, backend, or relay. The selected option was to run a feasibility spike; it did not select Matrix as the production engine.

## Run

```sh
npm ci
npm run dev
```

Open the printed local URL in Chrome. Use a disposable test passphrase of at least 12 characters. Open the store, close it, and open it again with the same passphrase. A stable identity fingerprint is evidence that the library reused the IndexedDB crypto state. Use the wrong-passphrase button to check rejection, then clear the test database.

The passphrase is not saved by the page. If the entered passphrase differs from the one used to create the current test store, the library cannot decrypt it. The page reports this in plain language; use **重設並刪除測試資料** only if you want to discard the synthetic test identity and start over. Reset deletes the current and earlier spike databases, then rotates to a fresh IndexedDB name because recreating a deleted WASM store under the same name failed in browser testing.

Build the static browser bundle with `npm run build` and run metadata checks with `npm test`.

## Flutter Web bridge

```sh
npm run build:flutter-bridge
cd flutter_web
flutter pub get
flutter analyze
flutter test
flutter build web --release
python3 -m http.server 9095 --bind 127.0.0.1 --directory build/web
```

Open `http://127.0.0.1:9095/` and press **從 Flutter 執行雙裝置加密測試**. Flutter calls a local JavaScript interop bridge that bundles the same WASM package; the key directory and encrypted delivery stay in memory in the browser.

## Android native probe

The isolated Flutter app also has an Android-only MethodChannel probe using the official
`org.matrix.rustcomponents:crypto-android:26.05.12` AAR. It opens a synthetic
`@android-probe:example.org` / `TB_ANDROID_PROBE` crypto store under the app-private files
directory. It never uses the signed-in Taiwan Brawl account, production database, relay or chat.

Build arm64 and emulator debug APKs:

```sh
cd flutter_web
flutter pub get
flutter test
flutter analyze
flutter build apk --debug --split-per-abi
```

Install `build/app/outputs/flutter-apk/app-arm64-v8a-debug.apk` on a current Android phone. (The
arm64 debug APK is about 97 MB because it includes Flutter and the native crypto runtime.) Enter a disposable
passphrase of at least 12 characters, open the store and record the identity fingerprint. Close
and reopen with the same passphrase; the fingerprint must match. Close again, try a wrong
passphrase and confirm the store is rejected, then reopen with the original passphrase and check
the fingerprint again. Finally force-stop/relaunch the app and repeat the correct-passphrase check
to verify process-restart persistence. Do not use a real account password or recovery phrase.

This tests the Android library's local encrypted store and Flutter-to-native bridge only. It does
not test message ratchets, iOS, cross-device SAS, custom relay ciphertext, production app behavior,
or the suitability of Matrix's Matrix-specific device/event contracts for Taiwan Brawl.

The official Apple distribution path is the Matrix Rust components Swift package. Its current
manifest on the repository's main branch points to version `26.10.27` and declares iOS 16 as its
minimum; its maintainers mark the Swift API as unstable. The Android Maven `crypto-android` release
used here is `26.05.12`. Those package versions are not aligned, so Android and iOS package
availability alone does not establish cross-platform store/API compatibility. The local machine
does not have full Xcode, so no iOS build or iPhone installation has been verified.

## Scope and acceptance

- [x] Matrix crypto WASM package loads in a browser build.
- [x] Browser can create an isolated IndexedDB-backed crypto store.
- [x] A close/reopen pass preserves the synthetic device identity.
- [x] Wrong store passphrase is rejected.
- [x] Two independent in-memory devices exchange a room key and decrypt an encrypted message.
- [x] A sender without cross-signing is rejected when the receiver requires cross-signed devices.
- [x] Two local crypto machines complete a seven-emoji SAS flow and each marks the other device locally trusted.
- [x] Separate same-origin browser tabs exchange SAS events locally, show the same seven emoji, and establish mutual trust only after both confirmations.
- [x] An explicit mismatched-SAS rejection is sent to the peer and creates no device trust; timeout also cancels both ends.
- [x] Flutter Web calls the WASM bridge and completes the two-device roundtrip.
- [x] No product dependency or production relay flag is changed.
- [ ] End-to-end message encryption between two devices on a custom relay.
- [ ] Human-controlled pairing across separate devices or browser profiles, revoke and key rotation, recovery phrase, and old-device history transfer.
- [x] Isolated Android native crypto store bridge and debug APK build.
- [ ] Android physical-device persistence and wrong-passphrase behavior.
- [ ] iOS integration and app build.

The browser persistence and trust-gate checks were observed in Chrome 156 on 2026-10-29. On 2026-10-30, the same-origin two-tab SAS UI showed matching emoji, the one-sided confirmation waiting state, mutual local trust after the second confirmation, and rejection after selecting mismatched SAS on both tabs. Node tests cover two-tab SAS success, cancellation, timeout propagation and mismatched-SAS rejection, same-page SAS success/cancellation, and encrypted message roundtrip (9 passing). `BroadcastChannel` only simulates a local browser transport; no Olm session, relay, WebRTC, cross-profile or phone connection is established by this slice. The isolated Flutter Web app passed `flutter analyze`, `flutter test`, and release Web build; its UI button completed the message roundtrip in Chrome. The in-memory fake key directory holds public device and one-time keys and routes encrypted room-key events; those message tests stay in the local process. The cross-signing policy check and SAS state-machine test are not complete account-level cross-signing setup, remote device management, device revoke, key rotation, or recovery. After wrong-passphrase rejection, the correct passphrase reopened the same identity, and test data was cleared. The unchecked items remain required before selecting an engine for production. Matrix crypto uses Matrix device/event/store contracts; this spike does not claim those contracts fit Taiwan Brawl's custom DM transport.

## Candidate package facts checked

- `@matrix-org/matrix-sdk-crypto-wasm` **18.9.0**, Apache-2.0; its official browser wrapper exposes `OlmMachine.initialize` with IndexedDB-backed persistent state and store passphrase support.
- Android `org.matrix.rustcomponents:crypto-android` **26.05.12**, Apache-2.0; native Android probe build only. The iOS route is the official [Matrix Rust components Swift package](https://github.com/matrix-org/matrix-rust-components-swift), whose current manifest requires iOS 16 and whose Swift API is documented as unstable.
- `@signalapp/libsignal-client` **0.106.1**, AGPL-3.0-only; the published npm archive contains Node native prebuilds for desktop OSes and no browser WASM artifact. Signal's Java/Swift bindings are separate paths, but they do not provide a Flutter Web wrapper.
- The Signal package is deliberately not installed as an app dependency. Review licensing and integration policy before any product use.

## Current machine limits

Observed in this environment: Chrome, macOS, Android SDK 36 and a local Android debug build are available; no Android phone/emulator is currently connected. The full Xcode toolchain is absent, so iOS builds cannot run here. Browser and Flutter Web have passed; Android native runtime still needs a physical-device check, and iOS integration/build remains untested.
