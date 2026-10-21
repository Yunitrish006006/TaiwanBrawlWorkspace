# Current status

Workspace snapshot date: **2026-10-21**. The repository-head table below remains the verified `main` baseline snapshot. The architecture migration is committed to dedicated `codex/taiwan-brawl-modular-ci` branches in the coordination, frontend, and backend repositories; those feature-branch heads and CI evidence are recorded in the rearchitecture plan and are not represented as `main` heads.

The messaging/app refactor slice is implemented. The optional feature/game
architecture is documented and implementation has started. Archery's Flutter
UI and module identity/version/schema manifest are package-owned; the shell persists game selection and resource
metadata locally. A reusable HTTPS installer now supports Range resume,
chunked Hive staging, SHA-256 plus Ed25519 verification, rollback-safe version
activation, and package-owned payload validation during staged migration. The
host registers every bundled resource schema's owner parser; a declared schema
without a validator fails closed, and invalid bytes never replace the active
version. Downloaded resources can also
declare an independent payload schema version, validated by the backend and
persisted alongside installed resource identity. Backend catalog and immutable
byte-range resource endpoints now have tests; the Flutter Library can refresh
the remote catalog and install/remove published packs while preserving its
bundled catalog offline. The catalog is currently empty and release trust
configuration is intentionally empty. Non-empty catalogs require an
Ed25519 publisher envelope (`GAME_CATALOG_TRUST_KEYS`) and expiry validation;
unknown or misconfigured keys fail closed. Unsigned/untrusted packs cannot
install. The unsigned empty response used while no catalog is published leaves
the last verified cache intact; a publisher-signed empty snapshot is distinct,
clears cached download listings, and retains already-installed resources only
as non-downloadable entries so they remain inspectable and removable offline.
Those local-only entries are persisted with the catalog cache and restored on
startup, so revocation does not make already-installed bytes inaccessible to
the Library after a restart. The cache now stores the verified envelope expiry
atomically with its manifests; cached resource listings remain inspectable
offline after expiry, but the Library disables and the service rejects new
downloads/updates until a fresh signed catalog is obtained. Removal remains
available offline. Legacy list-only caches can still be opened for offline
inspection but have no expiry evidence and cannot authorize remote installs.
The cache also persists the signed `issuedAt`; refresh and restart reject a
snapshot older than the last verified issue time, even if that older envelope
has not expired. This prevents a stale but still-valid publisher snapshot from
restoring revoked download metadata, including when overlapping refresh
requests complete out of order. The cache now also retains the original signed
envelope and re-verifies it against the App's configured publisher keys on
startup; parsed local manifests alone never restore download authority. An
expired but valid envelope remains inspectable offline while installs/updates
stay blocked, and invalid/unknown signatures leave only installed local
tombstones available for inspection/removal.
Mini Royale room contracts now carry the package's protocol compatibility
range. The Worker validates creator protocol support, pins its own supported
range rather than trusting a client-expanded range, and checks mutual range
compatibility plus exact ruleset/gameplay identity on join and reconnect;
different package versions are allowed only when those compatibility checks
pass. Legacy stored contracts without range metadata retain exact-version
behavior.
Signed catalog/cache/installer owner tests and Game Library/controller/
registration consumer tests passed. The Game Library explains why expired
cached catalogs disable
downloads/updates and offers an in-page refresh action while preserving removal.
Catalog replacement now publishes metadata and expiry as one listener state;
the controller notifies again when an active screen's catalog expires. A fixed-
clock widget test verifies the banner and action transition without navigating
away. After signed-catalog issue-time, offline signature re-verification, and
live-expiry notification changes, the full App VM suite passed (181 tests, one
browser-only test skipped), Chrome IndexedDB passed, full frontend analysis
found no issues, the Web release build completed, workspace validation passed
(372 checks), and all 41 Node tests passed. Flutter's Wasm dry run still reports the existing
`flutter_secure_storage_web` `dart:html`/`dart:js_util` incompatibility; the
standard JavaScript Web release is successful.
The local release-packaging integration suite now exercises both Archery rules
and Mini Royale gameplay rules through signing, module-specific KV prefixes,
catalog serving, and immutable resource download; the Mini Royale fixture is
also resolved by the room's trusted gameplay-rules loader before admission.
This remains fixture evidence; no production key or catalog upload is implied.
The remote catalog may update resource metadata for bundled modules only;
resource removal is marked `removing` before byte deletion so a failed cleanup
cannot remain in the multiplayer compatibility digest and is safe to retry.
Install/remove operations for each resource are serialized to prevent concurrent
actions from reactivating a pack after the player removes it.
Resources may now declare an optional `activationGroup`; Library install/remove
expands to the whole group, and the local store switches one module active-set
pointer only after every member is downloaded, verified, and migrated. A failed
member preserves the prior active set. Backend catalog validation accepts only
stable group slugs. This is local atomic visibility, not atomic catalog
publication or cross-device activation.
Mini Royale now has a server-side join gate for protocol, ruleset, and gameplay
digest compatibility; incompatible joins receive a structured 409 before room
admission. The App derives the digest from sorted, successfully installed
gameplay-affecting resource IDs, versions, and verified SHA-256 values, in
addition to the built-in rules digest, and sends that contract for room creation
and joining. The backend validates supported game/protocol/rules versions, pins
the creator's normalized digest in the room, and admits only clients with the
same digest. Presentation-only resources do not affect compatibility.
The Archery package manifest now declares its implemented `game.archery.rules`
payload schema v1; owner and App catalog-consumer tests verify that a matching
signed catalog entry can be accepted while unsupported schemas remain rejected.
This does not publish a catalog entry or make an unsigned pack installable.
Archery and Mini Royale player-data repositories now serialize operations per
profile record. A schema migration already in progress cannot race a newer save
or deletion and restore an older snapshot over it; deterministic delayed-read
tests cover both package owners, while App Hive consumer tests continue to
verify the games use separate persistence boxes.
The Mini Royale package and Worker define the same strict gameplay-rules JSON v1
schema for bounded simulation tuning values; malformed, extra, or out-of-range
fields are rejected and executable content is not allowed. Room creation now
resolves non-built-in rules only from the exact publisher-signed catalog entry
and immutable KV payload pinned by the normalized resource tuple, verifies
catalog/resource signatures, expiry, metadata, byte length, and SHA-256, then
persists the resolved rules in room state. The Worker applies those values to
match duration, tower health, and unit speed in its simulation. Host simulation
delegates rule loading to the Mini Royale package. Package logic validates the
room-pinned locally active version and digest through an App-supplied
content-source adapter; it fails closed on missing/malformed contracts,
unavailable versions, or drift. The package also owns the canonical sorted
aggregate gameplay-resource digest function; both App contract construction
and local rule loading use it, so missing or inconsistent aggregate digests
are rejected locally just as they are by the Worker before room admission.
Tests cover signed fixture loading, tampering, persistence, compatibility, and
server simulation. The catalog remains unpublished and no
production `GAME_CATALOG_TRUST_KEYS` binding is provisioned, so downloaded-rule
multiplayer is not yet available in deployment; the bundled built-in contract
continues to work offline.
Game-specific launch routes now live in per-game host adapters and are composed
through `game_module_routes.dart`; `main.dart` mounts the registry rather than
declaring individual game routes. Each adapter checks the player's enabled
state and keeps that game's code behind deferred loading. The registry now
rejects duplicate route names instead of allowing a later module to silently
replace an existing module's route; a synthetic peer-registration test covers
the extension and collision behavior without importing either shipped game.
Bundled game host adapters now have one registration point per module; the
catalog, route map, Home launch/collection entries, Game Library extension, and
resource payload validators are all derived from those registrations. Startup
validation rejects duplicate module IDs/routes, Home entries owned by another
module or pointing to absent routes, and resource validators assigned to a
different module. Frontend owner tests and workspace consumer-boundary tests
cover the assembled registry, and the Web release build passed after this
change.
Mini Royale's profile-scoped draft repository and Hive adapter are also
provided only inside its enabled deck route, rather than from the global App
provider list; the package still owns the draft key and migration schema.
Flutter route widget tests verify disabled Archery and Mini Royale entrypoints
return to Game Library rather than opening a game page.
Mini Royale now has a versioned Flutter package owning its module manifest,
multiplayer contract, typed Royale models, field-event catalog, pure-Dart
battlefield rules engine, host battle simulation engine, typed application
service, deck-builder UI, lobby UI, and the room waiting-lobby composition. The
host injects localized labels, arena preview, readiness and friend-action
callbacks; the package owns room/player status presentation and the ready
control. Package widget tests cover rendering, callback delegation, and the
submitting state, while the host continues to own the room lifecycle and
account/social policy. It also owns reusable arena visuals:
field painter, map preview, aim marker, field labels, tower-status token, and
unit token health/effect presentation and animated portrait playback/cache
lookup. The game package also owns the battlefield canvas, arena painter/labels,
and pointer/tap hit surface; the App retains the
room-aware `DragTarget` and injects deployment callbacks and live-state overlays.
The package also owns immersive battle geometry, including the responsive
bottom-hand/side-hand breakpoint, safe-area reservations, and field sizing; the
App injects the live field, HUD/hand widgets, and room command callbacks.
Hand-card and discard-zone visuals are package-owned as well; localized labels,
and discard command handling remain in the App. The package now owns pure
selection transitions, combo limits, hand-snapshot reconciliation, selected
card resolution, drag-combo projection, per-resource cost aggregation, and
affordability and combo-legality decisions (equipment requires a unit; Job
cards are played alone); the App translates those outcomes into localized
feedback and submits only a package-validated play command to the host
simulation or room transport. That command carries card IDs, normalized drop
coordinates, and the side-relative lane coordinate. Package rule tests and App
consumer tests cover this boundary.
The shared drag envelope for hand, discard, and battlefield interactions is
also a public Mini Royale package type; App no longer defines a private game
payload and continues to map accepted drops to room commands.
The package derives card type, cost category, and stat/effect descriptions;
the App supplies its localization lookup, formats package-derived cost totals,
and maps typed energy shortfalls to localized feedback.
The battle-result/rematch overlay layout is package-owned, with localized labels
and the room-rematch callback supplied by the host.
The battlefield instruction selection, collision-radius toggle control, and
base legend are package-owned; the App supplies translated copy and state.
Unit world-to-screen placement, attack-range/collision rings, unit health/effect
tokens, localization mapping, and animated portraits now live together in the
Mini Royale package; App no longer owns those unit-rendering helpers.
The App adapter injects the current user's LLM capability and arena-navigation
callback. The complete interactive arena screen, room-driven UI state,
selection, and gesture orchestration now live in the Mini Royale package. The
host route injects its package-owned application service and transport-neutral
room connection through the App's HTTP/WebSocket adapter. Social operations
similarly cross a Mini-Royale-owned capability port with package DTOs, while
the App adapter owns authentication, friend persistence, and its search dialog.
The arena consumes package-owned gameplay-rules and arena-presentation source
ports; the host route adapts its
verified active-resource store, so the arena no longer reads the App's resource
library service directly. UI translations and locale changes also cross a
package-owned localization port backed by a host adapter. The HTTP adapter
maps App API failures into package-owned service exceptions, and lobby and
invite entry points share one host scope; exiting to Home is a callback.
Game API
consumers use `/api/games/mini-royale/v1` for cards, decks, progression, and
rooms; the backend retains legacy routes as migration aliases. Royale
manifests now declare protocol range, ruleset identity/version, and built-in
gameplay digest in the game package; remote resource-catalog refresh preserves
that bundled compatibility baseline. The generic manifest supports this field
for multiplayer games while allowing single-player modules to omit it.
Game and resource manifests also declare supported targets; Library activation
and pack visibility are filtered by the current Flutter platform, while the
backend rejects unknown or inconsistent platform metadata.
The module catalog schema now also carries manifest version, module kind,
publisher, host API compatibility range, and typed optional/required module or
resource dependencies; the backend rejects malformed ranges and duplicate or
self-referential dependencies before serving a catalog. Required module
dependencies are version-checked on activation and protected from being
disabled while an enabled dependent requires them; optional dependencies do
not block activation. Module activation also checks the host's explicit API
version (`1.0.0`) against the declared compatibility range.
Resource-level dependencies are checked both before downloading and again just
before activation; their declared version range is evaluated against the
installed version rather than requiring the newest catalog version. Before
installing a dependent pack, the Installer also checks the active version
pointer and hashes the active bytes against the installed resource record. An
installed dependent pack prevents removal of its required resource.
The App and Worker now validate module/resource versions using strict SemVer
2.0 syntax; client range comparisons ignore build metadata and preserve
prerelease precedence, while malformed prerelease identifiers are rejected by
both catalog and immutable-resource routes.
After this SemVer alignment, the full Flutter suite passed (173 passed, one
browser-only fixture skipped on the VM runner), the full Worker suite passed
(177 tests), workspace validation passed (372 checks), and the production Web
release build completed. The build reported existing Wasm incompatibilities in
`flutter_secure_storage_web`; the standard JavaScript Web release succeeded.
Backend cards/heroes/progression/deck handlers and Mini Royale room lifecycle
handlers now live in game-specific API modules; the shared room router is a
compatibility facade and retains only social invite routing. Invite creation
now receives its game identity from the owning versioned API namespace; the
frontend remote source derives that namespace from the game ID, and the backend
resolves it through an explicit game API owner registry. The legacy
`/api/rooms/:code/invite` path remains a Mini Royale alias; unregistered game
namespaces do not fall through to Royale. Both versioned and legacy game paths
remain supported. The backend game adapter bridges
authenticated requests to the Cloudflare Durable Object, while the Flutter
package consumes a transport-neutral port. The arena map preview, pure field
painter, aim marker, battlefield zone label, tower coordinate mapping and
selected-card tower threat rules are package-owned; board state, gesture
handling, and the interactive battle/lobby screen and its host
integrations remain in the App. Production resource/release validation also
remains incomplete. The host implements Mini Royale's player-data,
animation-cache storage, and asset-download ports using Hive/HTTP; the game
package owns the schemas and cache policy and has no direct Hive or HTTP
dependency. Mini Royale owns an account-scoped deck-draft repository and its
schema migrations. Drafts are namespaced by profile, restored per slot,
and removed after a successful server save; guests do not persist account
drafts. Schema upgrades now validate the migrated draft and its requested slot
before replacing its stored source, preserving malformed/mis-slotted legacy
data for recovery; both package and Hive consumer tests cover these paths. The
opt-in animation-cache
control now appears under Mini Royale in the
Game Library instead of global account settings. Release/deployment and
physical-device/Internet-NAT checks also remain external validation gates.

## Primary repositories

| Repository | Role | Version | Head |
|---|---|---:|---|
| `taiwan_brawl_front` | Flutter frontend | `0.132.0` | `a082ab2` |
| `taiwan_brawl_back` | Cloudflare Workers backend | `0.1.0` | `9465c95` |
| `user_ui_settings` | shared Flutter settings | `0.1.0` | `96e4f1d` |
| `user_basic_system` | shared Flutter profile/DM package | `0.1.1` | `a15c1b5` |

`user_basic_system` remains a hosted `^0.1.1` dependency rather than a local
checkout; the resolved package cache was verified, so no unsupported local
source migration is pending for that repository.

The local migration workspace also contains two unversioned sibling packages;
their local source state is authoritative for the current refactor and no
remote commit is inferred here:

| Local package | Role | Version |
|---|---|---:|
| `taiwan_brawl_core` | platform-neutral runtime configuration | `0.1.0` |
| `taiwan_brawl_messaging` | offline-first messaging, identity/storage ports and transport primitives | `0.1.0` |

The frontend repository now also contains separately versioned game packages:

| Local game package | Current package ownership | Version |
|---|---|---:|
| `taiwan_brawl_game_archery` | Archery module manifest and independent package/schema versions, profile-scoped progress model, serialization, schema migration and repository; App supplies a dedicated Hive backend | `0.1.0` |
| `taiwan_brawl_game_mini_royale` | Mini Royale manifest, compatibility contract, typed models, field events, battlefield rules and host simulation engines, arena field painter and responsive map preview, aim marker and zone label, application service, deck-builder/lobby UI, account-scoped draft persistence/migration, and versioned battle-animation cache | `0.1.0` |

Each game package now tests that its module-manifest package version matches
that package's release version in `pubspec.yaml`; the frontend consumer test
also verifies the bundled catalog and Mini Royale multiplayer fields are
derived from the package-owned manifest. This guards the separately versioned
release and room-compatibility contracts against silent version drift.
On 2026-10-21, the package owners were independently revalidated from their
own directories with `flutter test --no-pub` and `flutter analyze --no-pub`:
Archery passed 10 tests and Mini Royale passed 61 tests, with no analysis
issues. This is local owner evidence; the GitHub native-runner matrix itself
has not yet been observed running.
The workspace test matrix now routes game-module tasks to both package owners
and App consumer/data-isolation tests; the frontend workflow runs those consumer
gates on pull requests and pushes alongside cross-platform package checks.

## Architecture baseline

- DM receive path is polling-first (`pending_messages`) with FCM as notification assistance.
- Royale realtime path uses WebSocket with `ROYALE_ROOM` Durable Object.
- Backend bindings include D1 `DB`, KV `STATIC_ASSETS` / `CHAT_SYNC` / `PUSH_RETRY`, and Durable Objects `ROYALE_ROOM` / `CHAT_ROOM` / `SIGNAL_ROOM`.
- One Worker serves API, media and Flutter Web assets.

Mini Royale's D1 domain tables are now namespaced (`mini_royale_cards`,
`mini_royale_user_decks`, `mini_royale_match_history`, progression and card-asset
tables). Migration `0029_mini_royale_table_namespace.sql` renames existing
tables in place and preserves their IDs/rows; shared `users` and `sessions`
remain identity infrastructure. Its repository and progression queries use
only the new names. A SQLite in-memory migration rehearsal retained seeded
cards, decks, history, assets, progression/events and passed `foreign_key_check`;
the migration has not been applied to a deployed D1 database.

## Newly agreed architecture requirements

- Keep authentication/account identity and the resource catalog/manager in the
  always-available shell; other feature and game resources are player-selectable.
- Make games peer modules with independently owned models, persistence, APIs,
  assets, and lifecycle versions.
- Keep each game's code in a separate Flutter package referenced by the host
  app and shipped through normal app releases; players select game activation
  and download content/assets, not runtime executable code. Deselecting a game
  deactivates it and may clear cached packs without deleting its code or
  account progress.
- Define resource, data-schema, rules/content, and multiplayer protocol
  compatibility during the initial architecture phase; block incompatible
  clients before they enter a multiplayer match.
- Mini Royale room creation and joining now both require explicit game
  contracts; the room authority no longer silently assigns its current contract
  to a client that omitted version information. Persisted legacy-room migration
  remains separate and explicit.
- Room WebSocket reconnects also submit the client contract; mismatched or
  missing contracts are rejected before socket upgrade. Frontend and Worker
  tests cover both contract propagation and pre-upgrade rejection.
- The platform-neutral optional resource installer is implemented and unit
  tested; end-to-end store/catalog delivery and platform release verification
  remain pending. See `docs/rearchitecture-plan.md` phase 1.

## Local refactor status

- Shared messaging is restored from encrypted local storage at the Flutter
  composition root, with a durable outbox, inbox, conflicts and cursors.
- Corrupt encrypted event records are isolated per record and persisted as
  conflicts, so one damaged local row does not prevent the rest of the offline
  message history from being restored.
- Restore also recovers a pending event when a crash left its outbox row but not
  its main event row, preserving the message and retry state.
- Shared application services for administration, LLM checks, and Royale data
  are now created by the composition root; pages consume provider-injected
  services rather than creating their own HTTP-backed instances.
- `FriendsService` is also composition-root owned and shared by HomePage and
  RoyaleArenaPage.
- ChatService construction is now behind a composition-root
  `ChatServiceFactory`; HomePage no longer assembles messaging identity,
  transport, or signaling dependencies.
- Production ChatService and NotificationService share explicitly injected
  legacy chat and installation adapters from the composition root, avoiding
  duplicate implicit Hive stores while compatibility migration remains active.
- `ApiClient` session caches are scoped to each client instance rather than
  static process state, preventing separate composition roots, tests, or
  accounts from inheriting an in-memory bearer token. Durable session
  persistence still uses the shared `CredentialStore` port.
- AdMob banner and interstitial unit IDs now come from the shared injectable
  `AppConfiguration`; widgets and services no longer embed deployment-specific
  advertising identifiers in feature code.
- LLM provider fallback URL and model now also come from `AppConfiguration`;
  `LlmBotService`, the composition root, and settings hints share the same
  deployment-overridable defaults.
- Backend CORS no longer embeds the deployed Worker hostname as a default
  allowlist entry; same-origin requests and explicitly supported local
  development origins remain allowed, while unrelated origins remain denied.
- Backend LLM fallback URL/model now accept `LLM_DEFAULT_BASE_URL` and
  `LLM_DEFAULT_MODEL` Worker environment values; user-specific saved settings
  still take precedence and legacy defaults remain as compatibility fallbacks.
- Frontend `AppUser` profile parsing now receives `AppConfiguration` through
  `AuthService`, so login/profile fallback values do not diverge from the
  composition-root LLM defaults.
- Remote profile image resolution now accepts the injected API origin, while
  absolute CDN URLs remain unchanged; `AppUser` no longer depends on the
  legacy global `AppConstants.apiBaseUrl` alias.
- Friends overview/search profile parsing now receives the same API origin from
  `FriendsService`, so friend avatars follow the active composition-root
  configuration as well.
- Royale card, deck, room, unit, and nested character-asset parsing now carries
  the same API origin through `RoyaleService`, covering relative game artwork
  URLs without changing absolute CDN URLs.
- Frontend deployment now has an owning `tool/build_web.sh` entrypoint that can
  build Flutter Web with shared `dart-define` values independently; the backend
  integrated deploy path remains available for compatibility.
- The standalone Web build was verified with Flutter release compilation on
  2026-10-20, producing `taiwan_brawl_front/build/web`; the integrated backend
  deployment path was not invoked.
- DM create/edit/recall are projected locally first; disconnected events do not
  fall through to legacy HTTP and are retried through a replaceable transport.
- Legacy local DM history is promoted into shared event projections before new
  edit/recall commands, so existing messages can enter the same offline-first
  lifecycle without losing their original content.
- Legacy promotion is incremental even when shared history already contains
  newer events; older compatibility rows are merged instead of being skipped
  by an early projection return.
- Incoming DM read state is now emitted as a shared durable read event from the
  Flutter chat lifecycle; when offline it remains in the local outbox and is
  retried through the same replaceable transport.
- Initial history, server refresh, and sync-download merge all use the same
  read-event path, so restored messages do not silently remain unread.
- Initial history now treats transport-level network failure as an empty local
  conversation while preserving explicit HTTP errors; an offline client does
  not fail merely because the server is unreachable.
- Backend Google OAuth audience validation now requires explicit
  `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_IDS` Worker configuration; no client ID
  is embedded in the repository as a fallback.
- Explicit history refresh follows the same rule and returns the current local
  projection when the network is unavailable.
- Device signing is enabled for local events. Peer verification is opt-in via
  an explicit, fingerprint-confirmed serverless trust invitation and
  credential-backed trust directory. The invitation uses the current HMAC
  identity as a migration bridge; it is not automatic key exchange or a
  public-key protocol.
- The frontend now has a `PeerTrustService` application boundary for explicit
  out-of-band trust import, fingerprint confirmation, and revocation.
  `PEER_VERIFICATION_ENABLED=true` enables the same fail-closed remote
  verifier for chat and notification ingestion; it remains disabled by
  default.
- The DM serverless P2P pairing dialog now exposes the invitation copy/paste,
  fingerprint review, and explicit trust-confirmation actions instead of
  leaving the protocol as an unused service-only seam.
- Workspace tests now guard the composition boundary: pages and widgets may
  not directly import HTTP, Hive, secure-storage, WebRTC, or instantiate low-
  level transport adapters.
- The same guard verifies the production composition root wires encrypted Hive
  restore, secure credential-backed event keys, and friend-scoped cursor storage
  before constructing messaging services.
- Manual P2P transport construction now also comes from the injected
  `MessagingTransportFactory`; `ChatService` keeps only a compatibility fallback
  for legacy/test consumers.
- The legacy `P2PChatService` facade now accepts the same transport-builder
  seam, so compatibility callers can migrate without reintroducing direct
  WebRTC construction policy.
- `RoyaleLobbyPage` now resolves its production `RoyaleService` from the
  composition-root provider; only explicit test/alternate-composition service
  overrides remain page inputs.
- `FriendsOverviewSyncService` now receives the composition-root-owned
  `FriendsService` instead of constructing one from `ApiClient`, so overview
  polling remains an application lifecycle concern rather than an HTTP concern.
- Production notification setup now also constructs and injects the
  `NotificationRemoteSource` and `PendingNotificationSource` adapters at the
  composition root; background polling and registration no longer choose their
  own HTTP implementations.
- Production auth, friends, admin, LLM, and Royale services now receive their
  server remote sources from the same composition root. Their compatibility
  constructors remain available for tests and alternate consumers, but the
  shipped graph no longer hides HTTP adapter selection inside application
  services.
- The optional battle-animation cache now receives its Hive store and HTTP
  asset source explicitly from the composition root, keeping cache policy
  independent from both storage and download implementations. The concrete
  adapters live in the App; the game package exposes only the ports and
  requires both adapters at construction.
- Deterministic transport, storage, identity and fallback tests pass locally;
  the production Web entrypoint also compiles with both P2P and peer
  verification flags enabled. These remain compile-time/configuration checks,
  not evidence of two-device WebRTC/NAT or trust-session success.
- A Chrome runtime test now opens two real `flutter_webrtc` peer connections
  with local ICE configuration and carries a shared message event across the
  DataChannel. This proves the browser loopback transport lifecycle, but not
  physical-device connectivity, Internet NAT traversal, or hosted signaling.
- The Chrome WebRTC gate was rerun on 2026-10-20 after the composition and
  deployment-boundary changes and passed. Physical-device, Internet-NAT, and
  hosted-signaling runtime gates remain `NOT_EVALUATED`.
- A frontend consumer test now runs two `ChatService` instances over the
  replaceable in-memory transport and verifies create, edit, recall, and read
  without HTTP or Hive.
- The workspace test matrix now names the Chrome WebRTC runtime command as a
  separate gate, rather than treating the normal VM test suite as evidence for
  browser DataChannel behavior.
- Re-ran the browser resource-delivery consumer gate on 2026-10-21:
  `flutter test --platform chrome test/game_resource_web_storage_test.dart
  test/game_resource_installer_test.dart` passed all 20 tests, including an
  IndexedDB round-trip after closing Hive and reopening it, plus install,
  dependency, activation, and rollback cases. The VM Hive owner test also now
  closes and reinitializes Hive against its temporary file directory; all 7
  tests pass, including restoration of enabled state, catalog metadata,
  active version pointer, and exact payload bytes. This proves browser IndexedDB
  and host file-store persistence respectively, not Android/iOS device delivery.
- Workspace boundary tests now scan both shared packages for platform imports,
  runtime dependencies, and missing public entrypoints, protecting their use by
  future projects.
- Durable messaging restore and degraded-storage fallback now live in the
  dedicated `messaging_runtime_bootstrap.dart` adapter instead of the route and
  Provider assembly file, making the offline startup boundary independently
  replaceable.
- A reusable HomePage storage-status banner now exposes degraded messaging
  persistence to the user instead of silently presenting in-memory state as
  durable.
Room admission now includes the bundled game module version and ruleset identity
alongside protocol version, ruleset version, and gameplay-content digest; the
room pins the full contract and rejects a mismatch before adding a player.

Remote verification on 2026-10-21: coordination viewer workflow run
`39531455535` passed. Frontend workflow run `39533157819` passed Archery and
Mini Royale package checks on Ubuntu/Windows/macOS; both in-repo shared Dart
packages; Web IndexedDB storage; game-module consumer tests; Android API 35
resource lifecycle; native resource lifecycle on Ubuntu/Windows/macOS; and
Web/Android/Linux/macOS/Windows app builds. Its iOS app build and simulator
jobs failed against the then-configured iOS 13 target. The product decision on
2026-10-21 sets the minimum iOS deployment target to 26.0; a new workflow run
must validate iOS build and simulator setup. Production signing keys, catalog
publication, D1/KV deployment, and release remain unconfigured and unperformed.
