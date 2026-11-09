# Workspace repository publication — 2026-11-09

The user authorized organizing and publishing all Git repositories in this
workspace. Each repository keeps its own history, ownership and remote. No
force push, branch merge, production deployment or remote database migration
was performed.

## Owner repositories

These four remote heads were verified directly with git ls-remote after push:

| Repository | Branch | Published commit |
|---|---|---|
| taiwan_brawl_front | codex/taiwan-brawl-modular-ci | [442b905](https://github.com/Yunitrish006006/taiwan_brawl_front/commit/442b905117c6e371997150170507acb8dda3d338) |
| taiwan_brawl_back | codex/taiwan-brawl-modular-ci | [d5fff5c](https://github.com/Yunitrish006006/taiwan_brawl_back/commit/d5fff5cdeb24b7f4e8468929285c1763196d77e6) |
| user_ui_settings | main | [16c90f6](https://github.com/Yunitrish006006/user_ui_settings/commit/16c90f623b4e20b978e5a7b2a54aa0a140f194c8) |
| taiwan_brawl_messaging | main | [14b6688](https://github.com/Yunitrish006006/taiwan_brawl_messaging/commit/14b6688508a54b01002184e6ce385d3e8c85cae6) |

The coordination repository publication is the commit containing this report,
on codex/taiwan-brawl-modular-ci; its own SHA is verified after push instead of
embedding a circular self-reference here.

The standalone messaging repository had no commits or remote. It now has a
private remote containing the original v0.1.0 baseline, clearly labeled legacy.
The active messaging and core packages remain owned by taiwan_brawl_front under
packages/shared; the outer core directory has no Git metadata and was not
invented as another independent repository. The older repository catalog remains
a dated source snapshot, not a claim about the new feature-branch heads above.

## Cleanup

- Removed tracked Dart tooling cache from user_ui_settings without deleting
  local files; added ignore rules and corrected package repository metadata.
- Removed machine-specific SDK fallbacks and absolute local links. SDK selection
  uses explicit environment settings, PATH and documented portable locations.
- Fixed whitespace defects in newly added Markdown. Preserved all feature source,
  fixtures, package assets and intentional removal of retired adapters.
- Reviewed staged content: no build outputs, local D1 files, device screenshots,
  actual session credentials, private keys or machine-specific personal paths.
  Public identifiers and synthetic test credentials remain where required.

## Validation evidence

Already-passed checks were reused where code inputs did not change. Additional
publication checks covered the package owners and shared consumers:

| Scope | Observed result |
|---|---|
| Frontend | analysis passed; full VM suite 389 passed / 4 skipped, plus 7 final preview-copy checks |
| Browser consumers | Chrome storage/WebRTC/trust suite 57 passed / 5 skipped |
| Active messaging / core | Dart analysis passed; 47 / 2 tests passed |
| Street Scrap / Mini Royale | Flutter analysis passed; 346 / 61 tests passed |
| Legacy standalone messaging | Dart analysis and 29 tests passed |
| Shared UI settings | dependency resolution and analysis passed; no package-owned test directory |
| Crypto spike | 9 Node tests, Vite build, Flutter analysis and 1 Flutter test passed |
| Backend | 206 Node, 1 Vitest, 56 workerd D1 tests passed; migration and split rehearsals passed |
| Build scripts | portable Web script built a release successfully; backend shell syntax passed |
| Android widget | debug APK built; 11 native tests passed; installed appearance/name behavior observed on Pixel 7a |
| iOS widget | 50 Foundation and 6 project checks passed; initial hosted unsigned iOS app build also passed; signing and iPhone acceptance remain pending |
| Coordination | validation 776 checks and Node suites 85 + 79 passed with the publication report |

At this report's creation, the backend hosted check passed:
[backend run](https://github.com/Yunitrish006006/taiwan_brawl_back/actions/runs/42519767510).
The initial frontend run exposed failures in outdated art-registration checks,
a missing native fixture schema, Linux GStreamer dependencies and macOS test
signing. These were corrected in 442b905 without changing production signing
settings. The package-owned resource checks, fixture regression, YAML parsing
and analysis passed locally; the new hosted workflow was queued:
[frontend rerun](https://github.com/Yunitrish006006/taiwan_brawl_front/actions/runs/42522364262).
The initial run had already passed Android/Web/Windows/macOS/iOS app builds,
shared Dart, P2P WebRTC and browser resource checks; its failed desktop and
package jobs must not be reported as passing before the rerun confirms them.
These are time-bounded CI observations, not claims that every hosted platform
or production release has passed. The local preview and its isolated state were
left running for the user's two-account tests.

## Frontend CI follow-up

The subsequent 63cc6eb run passed all six App builds and the real resource
lifecycle on Windows, macOS and the iOS Simulator. The Linux lifecycle, Android
emulator startup and two platform golden checks still failed; that run is not
an all-platform pass.

The next published correction is
[a9fc9be](https://github.com/Yunitrish006006/taiwan_brawl_front/commit/a9fc9beac67ba9aee5bd7fe2c85820084c8798bc):

- Signed fixture bytes keep LF line endings on Windows. Native fixtures declare
  their supported schema and validate the synthetic payload before migration.
  The same install/rollback/update/reopen/remove scenario also runs with real
  Hive storage in the VM suite.
- Golden test scenes use whole-pixel geometry and exact binary image scales.
  Only two expected test images changed; production artwork and strict pixel
  comparison remain unchanged. Linux and Windows previously produced identical
  differences against fractional-layout macOS baselines.
- The native wrapper renders a first frame before the I/O scenario. Linux keeps
  process/signal diagnostics on failure. Android CI grants its ephemeral runner
  access to KVM rather than booting x86_64 without hardware acceleration.

Observed local follow-up validation: frontend analysis passed, both native
fixture tests passed, all 346 Street Scrap tests passed, strict golden comparison
passed and the workflow YAML parsed successfully. The published frontend SHA was
verified against the remote branch. Hosted results are tracked in
[the follow-up run](https://github.com/Yunitrish006006/taiwan_brawl_front/actions/runs/42560518590);
its final status must be checked before claiming all platforms passed.

The a9fc9be run subsequently passed the Android emulator lifecycle and the
material-grid golden on Linux, but the enlarged sprite golden still differed.
The follow-up
[150082d](https://github.com/Yunitrish006006/taiwan_brawl_front/commit/150082db89ef21ff15b128809673f69c036233e7)
uses exactly 1/4 scaling for that scene, removes previously tracked golden
failure output (preserving local files) and ignores future failure output.
The 32 sprite tests passed locally and the full Linux game-package job passed
in [its hosted run](https://github.com/Yunitrish006006/taiwan_brawl_front/actions/runs/42562643714).
Linux native integration diagnostics separately showed SIGABRT before test
execution; this remains an open CI host issue pending a native backtrace.
The integration scenario now has an explicit two-minute test timeout and the
Linux invocation has a ten-minute step limit, with failure diagnostics retained.

All three desktop game-package jobs passed for 150082d. Native backtrace
diagnostics from
[253ed5a](https://github.com/Yunitrish006006/taiwan_brawl_front/commit/253ed5a7af8f5aab68016dbe217311c65aa1586d)
then identified Linux startup failure in WebRTC's audio device module:
`adm->Init()` returned -1 and aborted before the Dart scenario started.
The CI host correction in
[dfb95c4](https://github.com/Yunitrish006006/taiwan_brawl_front/commit/dfb95c46d1f397a68ab21aef66f6c4ace3f948d3)
starts PulseAudio with a virtual null sink and monitor source. Real native
plugin registration and all lifecycle assertions remain enabled.
The corrected Linux desktop lifecycle job passed in
[the final follow-up run](https://github.com/Yunitrish006006/taiwan_brawl_front/actions/runs/42563530156).

### Final hosted verification

The final run completed successfully: all 21 jobs passed for published frontend
commit dfb95c46d1f397a68ab21aef66f6c4ace3f948d3 on
codex/taiwan-brawl-modular-ci. This includes all six App builds (Android, iOS,
Web, Windows, macOS and Linux), real resource lifecycle tests on all five native
platforms, strict game-package checks on all three desktop runners, native
storage checks on all three runners, browser IndexedDB, browser P2P, shared Dart
packages and frontend consumers. No failed or unfinished job remains in that run.

The iOS build and Simulator results do not establish signed iPhone widget or
App Group acceptance. No production deployment, branch merge, remote migration
or Apple capability change was part of this CI correction. The other published
owner repository heads above remain unchanged. The coordination regression now
recognizes the traced Linux command while retaining the native platform checks.
