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
