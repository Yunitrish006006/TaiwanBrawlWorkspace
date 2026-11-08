# Taiwan Brawl rearchitecture plan

Status: messaging/App refactor slice implemented; approved game-module architecture remains in active migration. Archery, Mini Royale, and Street Scrap are separately versioned Flutter packages. Street Scrap is registered as the third peer module and owns its gameplay, content, and save contracts; its package analyze/test checks are now part of the central game-module validation plan. Mini Royale now owns its manifest, models, rules, persistence contracts, lobby/deck UI, and complete interactive arena screen; the App supplies API, social, localization, resource, and host-navigation adapters. Optional resource lifecycle, signatures, offline catalog persistence, and multiplayer compatibility gates are implemented. Bundled game adapters now register once per module, and the host derives catalog, route, Home, Game Library, and resource-validator contributions from that registration list. The production catalog is still unpublished. iOS minimum support is 26.0; unsigned iOS App build plus Android API 35 and iOS Simulator resource lifecycle CI now pass. Public catalog trust-key configuration is staged in the feature-branch worktree. The operator reports importing the private key into login Keychain; a local non-exporting pair-verification command is available but has not yet been run. Cloudflare configuration/deployment, catalog publication, and release remain outstanding.

Room invitations now persist an authoritative `game_id` (legacy rows migrate as
`game.mini-royale`), and overview/action responses carry `gameId`. The Home
social drawer dispatches through a game-module invite-handler registry; unknown
game IDs remain pending and route the player to Game Library instead of being
misrouted into Royale. The current Mini Royale adapter checks both invitation
and acceptance game IDs before joining. Invite creation now takes the owning
game ID and addresses its versioned game API namespace; the backend resolves
that namespace through an explicit owner registry. The legacy unversioned room
invite path remains a Mini Royale compatibility alias, while unregistered game
namespaces are not routed to another game's room handler.
Date: 2026-10-20

Game launch routes are registered by per-game host adapters and composed by a
generic route registry. The App composition root no longer declares Archery or
Mini Royale route branches; each adapter checks its module activation and
loads its bundled game page lazily. The current bundled catalog contains the
two implemented game modules, Archery and Mini Royale.

The host acceptance suite also composes a synthetic third peer module through
the generic library and installer: it enables the module, installs resource
v1, detects and installs v2, then removes the resource while asserting that
Archery's resource namespace remains untouched. This proves the local module
and resource lifecycle boundary without adding a third production game.

Current manifest implementation extends the package-owned game identity with
manifest schema version, module kind/publisher, host API range, typed module or
resource dependencies, and platform declarations. The backend validates the
same catalog fields before serving. Required module dependencies and host API
compatibility are checked before activation. Resource dependencies are checked
before and immediately before activation, and installed dependents protect
required resources from removal. Related packs can declare an activation group;
the client stages, verifies, and migrates the complete group before switching
one local active-set pointer, so gameplay never observes a mixed group version.
Group removal similarly switches the active set before deleting cached bytes.

Mini Royale's player-relative lane-position calculation is owned by its game
package alongside deployment-zone rules. The App now supplies the normalized
board point and side, while the package validates side identity and clamps the
result; package tests cover both orientations and invalid input, and the App
consumer is analyzed against the exported game contract.

Mini Royale's board-local pointer normalization and deployment-zone legality
are also package-owned targeting operations. The App converts global pointer
coordinates to board-local geometry, then delegates bounds normalization and
the game deployment rule to the package; owner tests cover board edges, invalid
geometry, and legal/illegal deployment points.

Mini Royale now owns a schema-versioned optional arena-presentation pack. The
App adapter reads only the currently activated resource bytes; the battlefield
canvas consumes the package-parsed palette and falls back to its built-in
appearance when no valid pack is installed. This is presentation-only and does
not change the multiplayer gameplay digest. A signed publisher catalog entry
and published pack are still required before users can download this resource.

Current Archery data boundary: the game package owns profile-scoped progress
serialization and schema migration; the App provides a dedicated Hive backend
through the package's UI-free module entrypoint. Both Archery and Mini Royale
serialize reads, writes, deletes, and migration per record so a delayed schema
migration cannot replace a newer local save.

The App's staged resource install now invokes the validator owned by the
resource's game package before activation. The host registry covers Archery
rules, Mini Royale gameplay rules, and Mini Royale arena presentation; if a
bundled module advertises a supported payload schema without a registered
validator, installation fails closed. Invalid signed bytes leave the previous
active version untouched. Package tests validate each payload parser and an
App integration test verifies rollback against a malformed Archery update.

Archery optional gameplay-resource runtime is now connected: the package owns a
versioned, bounded JSON rules schema and an injected content-source port; the
App adapter reads only the active `game.archery.rules` payload from the
verified local resource store. Missing or invalid data leaves the built-in
rules in effect. The package manifest now declares support for this resource's
payload schema v1, allowing the App catalog to accept a future signed entry
without relaxing owner-schema checks. Package tests cover tuning changes and rejection bounds; the
installer-to-consumer integration test proves an activated rules payload is
read by the adapter and disappears after resource removal; the production
Ed25519 verifier is covered separately. No catalog entry or publisher-signed
Archery pack is currently available, so live downloaded-pack consumption
remains unverified until one is published and installed. The game also waits
for active local rules resolution before enabling input or advancing its
simulation, preventing a run from mixing built-in and downloaded tuning.

Game Library package-specific settings now use an extension registry rather
than a Mini Royale ID branch inside the generic page. The coordination boundary
test enforces that the generic Game Library UI does not import game packages;
new game-specific card sections are added through the registry. Resource rows
compare installed version and SHA-256 against the refreshed catalog; drift is
shown as an available update with direct update and remove actions. Updates use
the existing staged verification/migration and atomic active-set switch.

Verified remote resource manifests are persisted separately from game state.
Library initialization restores this metadata locally before any network
refresh, so installed resources remain inspectable and removable offline after
restart. Only manifests returned by the signature-verifying catalog source are
written. The unsigned empty response for an unpublished catalog preserves the
prior verified cache, while a publisher-signed empty snapshot clears cached
download listings; installed resources remain only as non-downloadable local
records so they can be inspected or removed offline. Frontend tests cover Hive
round-trip, corrupt-cache fallback, offline restoration, unpublished-cache
preservation, and signed-empty revocation.

The backend now provides `npm run game-catalog:sign -- ...`, an offline
Ed25519 catalog-envelope signer. It accepts a payload JSON path and a protected
PKCS#8 PEM key path, validates the complete envelope against the Worker schema,
and writes only the signed envelope to stdout (the private key is never
printed). The signer emits the exact canonical format consumed by Flutter; a
fixed signature vector is verified by both Node and Dart tests. This is local
signing tooling, not proof of a production key being provisioned or catalog
publication to KV. Release operators can generate the envelope with:

```sh
npm run game-catalog:sign -- --input catalog-payload.json \
  --private-key /protected/release/catalog-ed25519.pem \
  --publisher taiwan-brawl --key-id catalog-2026-01 \
  --expires-in-hours 24 > catalog-envelope.json
```

The key path is an operator-provided protected location; generated output and
public trust-key build configuration still require reviewed release handling.

For a private key stored as a login-Keychain generic-password item whose value
is PKCS#8 PEM, the following command reads it only into process memory, signs
a fresh random challenge, and compares it with the production public trust
root in `wrangler.jsonc`. It never prints or writes the private key and does
not create a catalog. This check is not complete until the operator runs it
successfully.

```sh
npm run game-catalog:verify-keychain -- --service <service> --account <account>
```

`npm run game-resource:sign -- --file <payload> --private-key
<protected-resource-key.pem> --module-id game.archery --resource-id
game.archery.rules --version 1.0.0 --key-id resource-2026-01
--content-type application/json --base-url https://assets.example.test
--payload-schema-version 1`
derives the exact payload digest and byte length, signs the version-bound
bytes, and prints the HTTPS download URL, catalog fields, and immutable
content/metadata KV keys and metadata expected by the resource endpoint.
Flutter and Node share a fixed resource-signature vector test. This prepares
metadata for release assembly; it does not upload bytes or publish a catalog.

`npm run game-release:package -- --file <payload> --resource-metadata
<signed-resource.json> --catalog-envelope <signed-catalog.json>
--resource-public-key <resource-public.pem> --catalog-public-key
<catalog-public.pem> --output game-resource-release.json` packages a single
resource. For a coordinated multi-resource release, pass
`--resources-manifest <resources.json>` instead of `--file` and
`--resource-metadata`; the manifest is a JSON array of `{ "file": "...",
"metadata": "..." }` paths relative to the manifest. The batch path emits all
immutable payload and response-metadata KV records plus exactly one signed
catalog record, rejecting duplicate KV keys. Both paths use the existing
Wrangler KV bulk format: binary payload entries are base64-marked and response
metadata is JSON. The packager recomputes every payload hash/length, checks
every key and URL against the API contract, and confirms the catalog points to
the identical versions/signatures; it also cryptographically verifies both
Ed25519 signatures against the supplied public keys before writing a new local
artifact (existing output is never overwritten). The end-to-end test feeds the resulting KV rows
through the Worker catalog and ranged-media handlers for both an Archery rules
resource and a Mini Royale gameplay-rules resource, including module-specific
immutable storage keys and catalog ownership. The Mini Royale release fixture
also resolves through the room's trusted gameplay-rules loader with the exact
content digest before admission. A batch test confirms two resource payloads
share one exact catalog record and exercises the manifest CLI. This is
signed-fixture validation, not
production publication. `npm run
game-release:upload` is the separate explicit remote write and was not run;
production trust keys and actual resource publication remain release gates.

Direct room-invite acceptance from the Home social drawer now checks the local
Mini Royale activation choice before accepting the invite or joining the room.
If the game is not enabled, the invite remains pending and the player is sent
to Game Library to opt in first; a workspace boundary test protects this
ordering against regressions.

This document records the agreed target direction for the repository family. It is a migration boundary, not evidence that the target runtime already exists.

## Decisions

- Keep the four existing repositories. Shared packages remain independently usable.
- Keep package ownership separate from product UI ownership.
- Make the application and domain layers transport-neutral and backend-neutral.
- Treat Cloudflare as an adapter, not as the domain model's dependency.
- Make messaging offline-first and multi-device from the first schema design.
- Use Internet WebRTC P2P for direct messaging, with a minimal signaling service.
- Signaling may exchange WebRTC negotiation data, but must not become the durable message source of truth.
- Store messages locally and represent edits, recalls, delivery, and read state as signed events.
- A recalled message remains as an event and projects to the visible text `訊息已收回`, including after read.
- Keep server transport as a separate adapter for synchronization, fallback, and multi-device recovery.
- Route mobile session credentials and messaging secrets through shared credential/key ports; platform secure storage is an adapter, not an application dependency.
- Keep Flutter Web independently deployable while preserving the current Worker-integrated deployment as a compatibility path.
- Rebuild and reorganize the system; breaking internal changes are acceptable during migration.
- Keep only authentication, account identity, and the resource catalog/manager in the always-available application shell; let players choose which other feature and game resources to install.
- Make every game a peer module with its own UI, application/domain models, persistence, API contracts, and version lifecycle. Shared platform services may be consumed through ports, but game-owned data must not be placed in another game's schema.
- Give each downloadable module an explicit manifest and independently managed package/resource version, data-schema version, and (for multiplayer games) protocol and rules/content compatibility versions.
- Check multiplayer compatibility before joining a room or matchmaking queue. Incompatible clients must be prevented from entering and given an update or migration path; version compatibility must not depend only on the overall app version.
- Define platform-specific resource delivery and update behavior in the initial architecture, including a feasibility check for executable feature code versus downloadable content/assets on each supported platform.
- Keep each game's executable code in its own Flutter package/module for independent ownership and maintenance; the host app references those packages and bundles their code through normal platform app distribution. Game code is not fetched as executable payload at runtime.
- Let players opt in to each game's downloadable gameplay data and presentation packs; the shell and selected game code remain separable concerns, so an unselected game can stay hidden/inactive and its large content packs need not be installed.
- The Home shell shows launch/collection entries only for enabled game modules; when none are enabled, its primary game action leads to Game Library so module choice stays explicit.
- Home launch cards, optional collection links, routes, manifests, Library extensions, and resource validators are composed from a single host-adapter registration per bundled game, keeping module IDs and destinations out of generic consumers.

## Target layers

```text
Always-available application shell (Flutter host)
├── Authentication / account identity
├── Resource catalog and install/update manager
├── Bundled feature/game code modules (separate Flutter packages)
│   ├── game_mini_royale package
│   ├── game_archery package
│   └── game_<id> package
└── Player-selected content/resource packs (downloadable, versioned)
    ├── Royale gameplay data and presentation assets
    └── Archery gameplay data and presentation assets

Each module uses shared platform ports and its own versioned resource adapter;
the game package owns its design inputs, compiled payloads, manifest and static
resource metadata, while host registration injects routes, platform storage,
and payload migration functions. Coordination tooling may invoke owner
validators, but game-specific data stays with its package.
Multiplayer admission checks protocol + rules/content compatibility.
```

Separate code ownership from installation of large content. Each game's code
lives in its own Flutter package with its own public entrypoint, UI, application
and domain layers, and adapters. The host depends on these packages through
stable module entrypoint interfaces; game packages must not import one another
or the host's concrete game services. The host may build all package code into
the app binary while keeping modules hidden/inactive until selected. On iOS,
code changes ship through App Store app releases; runtime downloads are data
and assets only. Deferred/lazy loading can reduce startup work but does not
turn executable code into an independently downloadable iOS resource.

Suggested source layout (one package per game, not one growing shared game
directory):

```text
apps/taiwan_brawl_app/                 # host shell and module registry
packages/games/game_mini_royale/       # Royale code ownership
packages/games/game_archery/           # Archery code ownership
packages/game_host_api/                # narrow stable module ports/contracts
```

The current frontend uses `packages/games/archery` and
`packages/games/mini_royale`; each owns its stable module identity and
package/data-schema versions, while Mini Royale additionally owns the
multiplayer contract, typed game models, and pure-Dart battlefield rules engine.
It also owns the typed application service, field-event catalog, and deck-builder
UI; the host supplies HTTP/WebSocket through a transport-neutral port. The
interactive arena screen, room-driven state, selection, and gesture orchestration
are package-owned; the App injects host capabilities at the route boundary.
Social actions cross through a Mini Royale-owned capability port. The App injects an adapter
for authentication, friend persistence, and its player-search UI; the game
package consumes only game-owned friend DTOs and social operations. The arena
also consumes the package-owned application service, transport-neutral room
connection contract, and presentation/gameplay-rules source ports; the host
injects its HTTP/WebSocket and verified content-store adapters. Reusable arena
visuals (map preview, pure
`CustomPainter`, aim marker, field labels, tower-status token, and unit health/
effect chrome and animated portrait playback/cache lookup) are package-owned and
independently tested; the App supplies localized labels, live room values, and
the current animation frames. The package-owned battlefield canvas also owns scene clipping,
background, painter/labels, and pointer/tap surface; room-aware drag acceptance
and state mutation remain behind host-injected callbacks and overlays.
The battle-result/rematch card is also package-owned; the App provides localized
copy, submission state, and the rematch command callback.
The Mini Royale package now also owns the mutable hand-selection state used by
the arena: selected IDs, authoritative-hand reconciliation, selection order,
and selection-derived drag payloads. The App retains widget lifecycle, board
geometry, localized feedback, room command dispatch, and simulation/transport
effects; it no longer stores or mutates the game's selected-card state.
The Mini Royale package also owns the play/discard WebSocket command codec and
typed host-command decoding. The App retains the replaceable room connection
and forwards package-encoded commands; malformed or unknown game commands are
ignored rather than being interpreted as a different action.
The battlefield header owns its compact/full instruction selection, collision
overlay affordance, and base legend, consuming translated copy and toggle state
from the host. Unit placement, attack/collision indicators, localized fallback
token, effects/health display, and animation playback/cache access are composed
inside the game package from the active battle view.
The generic game manifest now carries an optional typed multiplayer contract;
Mini Royale declares protocol range, ruleset identity/version, and its built-in
gameplay digest in its game package. Remote catalog refresh updates resource
metadata without replacing that bundled compatibility baseline. Local
persistence implementation is still being migrated. The
actual paths may follow the current repository topology; the invariant is
independent package manifests, tests, versioning and domain ownership per game.

### Optional resources and parallel game ownership

The login/account shell and resource catalog are the only required starting
surface. After login, the player can browse, install, update, or remove optional
feature and game resources. The catalog owns resource metadata and dependency
resolution; each module owns its own user-facing behavior and data contract.

Each game is a first-level peer under the game catalog, never a subfeature of
another game. A game owns its card/character/deck/progression/match data or its
equivalent concepts, storage schema, migrations, API namespace, and data export
policy. Shared account IDs and platform capabilities may cross module
boundaries, but game-specific records and rules do not. Cross-game reporting,
if later required, must consume explicit read contracts rather than merge game
tables into a shared game schema.

The resource manifest must identify at least the module ID, resource package
version, supported platform, dependencies, content integrity metadata, and
minimum compatible application shell. Game manifests additionally declare
data-schema and rules/content versions; multiplayer games declare a wire
protocol version or compatibility range. Persisted player progress is synced
as game-owned account data and is not treated as a downloadable asset bundle.

Before a multiplayer room is created or joined, clients and the room authority
must agree on the game ID and compatible protocol/ruleset/content versions.
The room rejects incompatible clients before gameplay and returns the required
version/update information. Solo play may follow a separate policy for older
installed resources. Version compatibility is therefore checked per game and
match, not inferred from the global app version.

Creation and admission both require an explicit client contract. The authority
must never infer the current version when a create request omits its contract;
existing persisted rooms may still use the explicit legacy migration policy.
Each WebSocket connection/reconnection also carries that contract and is
rejected before upgrade if it no longer matches the pinned room contract.

The first architecture phase uses one consistent product contract across Web,
desktop, and mobile: game code is maintained as separate Flutter packages and
shipped with the app; versioned gameplay data and presentation packs are
player-selectable downloads. Platform-specific adapters may optimize loading
or store delivery, but must not change this contract or assume that arbitrary
code can be downloaded and executed after installation.

### Module, resource, and data contracts

The runtime is split into a small host shell, installable feature modules, and
versioned resource packs:

```text
Host shell (always installed)
├── authentication and account identity
├── module catalog / dependency resolver / installer
└── module host API (navigation, account identity, shared platform ports)
    ├── optional social module
    ├── optional messaging module
    └── game catalog
        ├── game.mini-royale (independent peer)
        ├── game.archery (independent peer)
        └── game.<new-id> (independent peer)

Each module
├── module-owned application and domain logic
├── module-owned local and remote data adapters
└── zero or more separately versioned asset/content packs
```

The host shell must not import or construct game-specific services. It resolves
an installed module by stable `moduleId`, checks its declared host API range,
and supplies only shared ports such as account identity, navigation, secure
credentials, network access, and resource storage. Games never call another
game's repositories or write to its tables. Cross-game features must use an
explicit read contract owned by the contributing games.

Every module is catalogued by a manifest containing at least:

| Field | Purpose |
| --- | --- |
| `moduleId`, `kind`, `publisher` | Stable identity and whether it is a feature or game |
| `packageVersion` | Installed module release and update ordering |
| `minimumShellVersion`, `hostApiRange` | Shell and shared-port compatibility |
| `platforms`, `deliveryKind` | Explicit non-empty supported targets and platform-specific delivery adapter; resource platforms narrow the module set |
| `dependencies` | Required/optional module and resource dependencies; resource ranges apply to the installed version, which must be active and digest-verified |
| `resources[]` | Resource ID/version, required payload decoder schema version for downloadable resources, size, digest, signature, and download location |
| `dataSchemaVersion` | Version of this module's persisted player data |
| `multiplayer` | Game protocol compatibility and gameplay rules/content identity |

`payloadSchemaVersion` is a required resource-level format contract for every
downloadable resource (for example, the JSON shape decoded by a game's
rules/presentation reader). It is distinct from the resource's semantic
version, the module's local-player `dataSchemaVersion`, and multiplayer
protocol/ruleset versions. Both Worker and client reject downloadable resource
metadata that omits it; the package signing and release tools require the same
positive integer, and the client checks it against the module's supported
schema before installation.
Signed catalog modules and every resource must also carry an explicit,
non-empty `platforms` list. The client, Worker, catalog signer, and release
packager reject missing declarations; a resource may narrow its module's
platform set but cannot inherit an implicit all-platform default.
Module and resource versions use strict SemVer 2.0 validation on both client
and Worker. Compatibility comparisons ignore build metadata and apply SemVer
prerelease precedence; dependency ranges remain bounded half-open ranges.

Illustrative catalog entry (field names are the contract; concrete URLs and
keys are deployment configuration, not committed secrets). Each bundled game
package owns its supported resource-schema map; a declared schema must match
that map before the App accepts the remote resource into its usable catalog:

```json
{
  "manifestVersion": 1,
  "moduleId": "game.archery",
  "kind": "game",
  "publisher": "taiwan-brawl",
  "packageVersion": "1.2.0",
  "minimumShellVersion": "1.0.0",
  "hostApiRange": ">=1.0.0 <2.0.0",
  "platforms": ["web", "android", "ios", "windows", "macos", "linux"],
  "dependencies": [],
  "dataSchemaVersion": 3,
  "resources": [{
    "resourceId": "game.archery.content",
    "kind": "gameplay-data",
    "version": "2.1.0",
    "required": true,
    "affectsGameplay": true,
    "sha256": "<catalog-provided-digest>",
    "signature": "<catalog-provided-signature-reference>"
  }],
  "multiplayer": {
    "protocolVersion": 2,
    "compatibleProtocolRange": ">=2 <3",
    "rulesetId": "archery-ranked",
    "rulesetVersion": 4,
    "gameplayContentDigest": "<digest-of-canonical-gameplay-definitions>"
  }
}
```

The signed catalog envelope binds canonical manifest bytes to publisher
identity and expiry metadata; the digest checks payload integrity, while
signature verification authenticates the publisher. The client requires a
publisher-bound Ed25519 trust key supplied through `GAME_CATALOG_TRUST_KEYS`;
the Worker's unsigned empty placeholder preserves offline metadata, while
publisher-signed empty catalogs revoke downloadable listings. Non-empty
unsigned, expired, or unknown-key catalogs fail closed. Key revocation is performed by
shipping an updated trust configuration in the app; automated revocation-list
distribution remains release integration work. Secrets and signing private
keys never ship in the client. Resource packs activate only after all required
dependencies are verified.

The client signature verifier uses Ed25519 public keys selected by `signingKeyId`.
For resource payloads it verifies the signature over the UTF-8 header
`moduleId\nresourceId\nversion\nsha256\n` followed by the exact payload bytes;
this binds a valid payload to its game, resource, version and digest. The Flutter
build accepts public-only key configuration through the `GAME_RESOURCE_PUBLIC_KEYS`
dart-define (JSON map from key ID to base64url Ed25519 public key); absent or
malformed configuration yields an empty trust set, never a permissive fallback.
The backend exposes `GET /api/games/catalog`, reading JSON from the
`STATIC_ASSETS` KV key `game-resource-catalog:v1`; if not published, it returns
an empty v1 catalog. The frontend refresh action merges only known, app-bundled
game IDs, preserving the bundled catalog when offline or when the remote catalog
is empty. Immutable resource bytes are served from
`/game-resources/{moduleId}/{resourceId}/{version}` using KV keys
`game-resource:{moduleId}:{resourceId}:{version}` and
`game-resource-meta:{moduleId}:{resourceId}:{version}`. Metadata contains
`contentType`, `byteLength`, and `sha256`; the endpoint supports single HTTP byte
ranges for resumable downloads. The client still verifies both digest and the
Ed25519 signature before activation. Production KV publication, trusted public
key provisioning/rotation, and signed packs remain release integration work;
with an unknown key ID, verification fails closed.

The first server-enforced multiplayer gate is Mini Royale. Its client contract
includes `moduleVersion`, `protocolVersion`, and `compatibleProtocolRange`.
Room creation validates the creator against the server-owned protocol policy,
resolves the exact requested gameplay resources, then pins the server's own
protocol/range together with the verified ruleset and gameplay identity. Join
and reconnect require mutual range compatibility, exact ruleset ID/version,
and exact gameplay digest/resource identities; package version alone does not
reject an otherwise compatible client. A rejected join receives HTTP 409,
`GAME_VERSION_INCOMPATIBLE`, and the required contract before membership or
socket upgrade. The public create API rejects a missing or malformed client
contract with HTTP 400 before resolving a deck or room namespace; it never
silently substitutes the server's current contract. Legacy persisted room contracts without a range are normalized
at room load to the previous exact protocol behavior rather than an inferred
wider range; snapshots and incompatibility responses expose that explicit
range. Backend regression tests prove the exact protocol can join while the
next protocol is rejected before membership and receives the normalized
required contract.
Mini Royale now defines a strict gameplay-rules JSON schema v1 for bounded
simulation tuning data (match duration, tower hit points, attack-speed and
move-speed multipliers); the package and Worker both reject missing, unknown,
or out-of-range fields, and the format cannot carry executable code. The Worker
now verifies the publisher-bound catalog and resource signatures, expiry,
metadata, byte length, and SHA-256; resolves only the exact room-pinned resource
tuple; persists the normalized rules; and applies duration, tower-health, and
unit-speed tuning in its simulation. Mini Royale's package also resolves the
same locally active version and verifies bytes against the room contract via a
platform-neutral content-source port; the App supplies only the resource-store
adapter. The package owns one canonical sorted aggregate-digest function used
both by App contract composition and local rule loading, matching the Worker;
missing or inconsistent aggregate digests and mismatched resources fail closed.
These flows are covered by owner and consumer tests using signed fixtures.
The catalog public trust root is staged in the App and Worker source
configuration; App parsing now has direct tests for the configured key and
fail-closed malformed-key behavior. The operator reports importing the
matching private key into login Keychain, and Keychain Access shows the expected
service/account metadata. A local non-exporting Keychain challenge verifier is
now available, but the key pair has not yet been independently verified.
Production downloaded-rule multiplayer remains gated on deploying Worker
`GAME_CATALOG_TRUST_KEYS` and publishing a signed catalog and resource pack;
no release/deployment validation is claimed.

The catalog is metadata, not a place to store game state. The local registry
keeps module ID, bundled package version, selected/active state, resource-pack
versions, verified digests, and update availability. Game package code is
shipped in app releases; its package version is pinned to the app build on
each platform and is not independently downloaded or removed at runtime.
Selecting a game activates its bundled module and resolves required content
dependencies. Resource installation downloads into staging, verifies publisher
signature and content digest, applies only that game's data migration, and
atomically activates the new resource set. A failed download or migration
leaves the prior usable resource set active. Turning a game off hides and
deactivates it and may remove its locally cached content/assets, but does not
delete its bundled code or account-owned progress. Deleting progress is a
separate explicit action under that game's data policy.

The delivery port must support catalog lookup, HTTP Range download/resume,
integrity and publisher-signature verification, resource activation, rollback,
and cache removal. The current client core checkpoints download chunks locally
and resumes only when the server returns a matching `206 Content-Range`; if the
server ignores Range, it safely restarts from byte zero. Model module
selection separately from its resources: `notSelected -> selected -> active`
with `disabled` available on deselection. A resource pack follows
`available -> queued -> downloading -> verifying -> migrating -> installed`;
failures return to the prior usable pack, and installed resources can transition
through `updateAvailable` or `removing`. Persist progress and the active
resource version so interrupted downloads can resume without exposing partial
content.

The installer also enforces the signed manifest's declared byte length while
streaming, not only after the full response has been buffered. An oversized
response is rejected immediately, its staged chunks are discarded, the failed
state is recorded, and the previously active resource remains unchanged. The
resumable-download path validates the exact start, end, and total in
`Content-Range`. Regression tests cover a response that exceeds the declared
length by one byte and a resumed response with an inconsistent range end. The
install/remove race test now pauses the HTTP response, starts removal while
installation is in flight, proves removal waits for the per-module operation
lock, then releases the download and verifies the final active state is removed.

Distinguish three payload classes in the manifest: executable module code,
gameplay data (rules, maps, card/unit definitions), and presentation resources
(art, audio, localization). Every independently updateable pack has its own
stable resource ID, semantic version, digest, signature, and compatibility
declaration. Mark whether a resource affects gameplay; only gameplay-affecting
resources participate in the match digest. Deferred imports alone are not a
player-controlled catalog or installer: they defer code loading, while the
catalog, consent, download state, integrity checks, and uninstall behavior are
separate responsibilities.

Resources that must be updated as one compatible unit may declare the same
`activationGroup`. The client treats a request for any member as a request for
the full catalogued group, verifies required dependencies, stages every member,
and runs migrations before committing one version map for the module. Until
that commit, the previous map remains readable; a failed member leaves it
unchanged. Removing a group removes all its members together and is refused if
an external installed resource depends on one of them. `activationGroup` is
optional and must be a stable slug; packs without it retain independent
lifecycle. This guarantees local atomic visibility, not atomic publication of
catalog entries or synchronization across devices; multiplayer still relies on
the room's verified content digest admission contract.

Delivery differs by target. Web can load deferred JavaScript chunks and cache
separate data/assets, subject to browser cache and deployment behavior. Android
can use Play-delivered Flutter deferred components, but they are Play-managed
and do not imply arbitrary CDN code installs or partial AAB updates. iOS code
must remain within App Store-compliant app distribution; optional game data
and assets can be downloaded, but downloaded code that introduces or changes
functionality is not an acceptable default. Desktop can use signed application
updates or packaged modules subject to each platform's distribution policy.
Thus the selected cross-platform baseline is bundled game code in separately
maintained packages plus player-selectable content/assets. Optional delivery
of executable code is not part of this design. Do not promise identical lazy
loading or download-size behavior across platforms.

Local build evidence on 2026-10-20: the Web release build passed after the
resource-update UI changes. An Android debug APK attempt failed before
compilation because the available JDK was 25.0.3 (unsupported by the project's
Gradle 8.14 Kotlin tooling) and Android SDK licenses were not accepted. That
local failure was superseded by hosted workflow run `39560967185`, recorded in
the current test matrix: Web, Android APK, unsigned iOS (minimum iOS 26.0),
Linux, Windows and macOS builds passed, as did Android API 35 and iOS Simulator
resource install/update/rollback lifecycle tests. Platform unit or hosted
emulator/simulator success does not prove signed store distribution, physical
device behavior, or true offline install/restart; those acceptance gates remain
open.

The current modular Home registry and optional Mini Royale presentation pack
changes were revalidated with `flutter build web --release`; the full App
compiled successfully. Flutter reported that the secure-storage Web plugin is
not compatible with a future Wasm build, while the standard release build
completed. Together with the later hosted run described below, Web and native
target builds are covered; physical-device behavior, signed distribution and
true offline install/restart remain outside that CI evidence.

Additional local checks on 2026-10-20 after the arena service, social,
active-content-source, localization, and service-error port refactors: the
interactive arena screen and its four composition parts moved to the Mini
Royale package and both lobby/invite routes now load its separate deferred
entrypoint. Flutter analysis passed, the complete frontend suite and Mini
Royale package suite passed, and
`flutter build web --release` completed successfully. The Flutter SDK cache
needed authorized access after the sandbox initially rejected its lock/stamp
writes. The direct iOS build command stopped with
`Application not configured for iOS` despite checked-in iOS project files;
the macOS build could not resolve Xcode packages because `xcodebuild` is not
available. These are environment/configuration failures on that local host at
that time. Hosted platform build and simulator results were later recorded in
run `39560967185` below; physical-device and signed-store acceptance remain
open.

Web browser storage now has direct Chrome coverage: the Web-only Hive test
initializes IndexedDB, writes the selected-game state, resource catalog
metadata, and versioned binary payload, closes Hive, initializes it again, and
reads the same state and bytes. The resource installer lifecycle suite passes
with it under `flutter test --platform chrome`. A separate VM Hive test closes
and reinitializes Hive against a temporary file directory and restores module
selection, catalog metadata, active version pointer, and payload bytes. These
prove browser IndexedDB and host file-store persistence respectively, not
Android/iOS device delivery or production-CDN publication.

A native-runner GitHub Actions matrix checks out the independently versioned
Archery and Mini Royale packages with the pinned public `user_ui_settings`
dependency, then runs `flutter analyze` and `flutter test` for each package. A
separate Ubuntu Chrome job runs the IndexedDB persistence and resource
installer suites. The App build matrix covers Web, Android (Temurin JDK 17),
iOS without code signing, macOS, Windows, and Linux. GitHub Actions run
`39533157819` on frontend branch `codex/taiwan-brawl-modular-ci` (commit
`c8ebf62e141dbd25171e9cbe85e26e85b3ea2b3e`) passed the Archery/Mini Royale
package matrices on Ubuntu, Windows, and macOS; shared Dart packages; Web
IndexedDB; game-module consumer tests; Android API 35 native resource lifecycle;
native resource lifecycle on Ubuntu/Windows/macOS; and Web/Android/Linux/macOS/
Windows App builds. The only failed jobs were iOS App build and iOS Simulator,
both stopping during CocoaPods setup because `firebase_core` requires a minimum
iOS deployment target of 15.0 while `ios/Podfile` and the Xcode project target
13.0. This is a product compatibility decision, not a passing iOS check. The
coordination viewer workflow run `39531455535` passed, and workspace validation
run `39557557746` passed on Node 20 and 22 after checking out the pinned
frontend/backend peer commits needed by cross-repository boundary tests. These
runs prove the listed CI targets only; they do not prove production resource
publication, physical iOS lifecycle, or production-CDN delivery.

Updated remote verification on 2026-10-21: frontend run `39560967185` passed all
17 jobs on commit `f46c4d0da933c4773533fc288fb36bbfc8ce4ed8` with iOS 26 as the
minimum target. The unsigned iOS device build completed. Android API 35 and iOS
Simulator each passed the native resource lifecycle integration test covering
install, forced rollback, update, restart restore, and removal. The same run
passed Web, Android, macOS, Windows, and Linux app builds; Archery/Mini Royale
package matrices; shared Dart packages; game-module consumers; Web IndexedDB;
and native host-storage lifecycle checks on Ubuntu, macOS, and Windows. These
CI results do not establish signed iOS distribution, physical-device testing,
production trust-key/catalog publication, or production delivery.

The workflow additionally analyzes/tests the in-repository shared Dart
packages and runs `integration_test/game_resource_native_lifecycle_test.dart`
on an Android API 35 emulator and an iOS Simulator. The test restores selected
module state, installs v1, forces a v2 migration failure and verifies the v1
payload remains active, then installs v2, closes/reopens Hive, verifies the
persisted module/resource record and bytes, and removes v2 while keeping the
game enabled. HTTP and signature verification are injected fixtures, while
Hive uses the target platform's app storage. The workflow path filters include
`integration_test/**`. Workflow YAML and its iOS shell script parse locally.
At the time of the earlier run, the Android API 35 emulator job had passed in
run `39533157819` and the iOS Simulator job was blocked by the then-current
iOS 13 target against `firebase_core`'s iOS 15 minimum. Both platform resource
lifecycle jobs were subsequently passed with the iOS 26 minimum in run
`39560967185` above.

Local owner/consumer verification on 2026-10-21 passed: the frontend app
`flutter analyze`, the complete frontend `flutter test` suite (186 passed, 1
existing skipped), Archery and Mini Royale package analyze/tests, both in-repo
shared Dart package analyze/tests, and `flutter build web --release`. The Web
build emitted the existing Flutter Wasm compatibility advisory for
`flutter_secure_storage_web`, but produced `build/web` successfully. These are
local checks; hosted Android/iOS integration and platform build results are
recorded separately above and do not establish physical-device behavior.

The exact Chrome resource CI command was also run locally after downloader and
race-test changes: IndexedDB persistence plus installer suite passed (23
passed, 1 VM-only filesystem restart test skipped). That Hive restart test was
then run on the VM platform and passed as part of the 23-test installer suite;
the skip is platform-scoped, not a loss of persistence coverage.

The initial environment audit on 2026-10-21 found no GitHub Actions runs for
the frontend repository (`actions/runs` returned `total_count: 0`). The local
workflow YAML parsed successfully, and `bash -n tool/build_web.sh` passed. The local Android APK build was attempted but Gradle exited with
`25.0.3`; this host only has Temurin JDK 25, while the supported build matrix
deliberately pins JDK 17. An Android AVD definition exists, but the ADB device
list was empty; the sandbox cannot start the ADB daemon. The host also has only
Xcode Command Line Tools (`xcodebuild` reports that full Xcode is required),
so `simctl` and iOS Simulator validation are unavailable. Do not interpret
these environment failures as passing Android/iOS checks.

This distinction is grounded in current platform rules and framework support:
[Flutter deferred components](https://docs.flutter.dev/perf/deferred-components),
[Apple App Review Guideline 2.5.2](https://developer.apple.com/app-store/review/guidelines/),
and [Google Play Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/16559646).

#### Confirmed product decision: what does "optional install" include?

| Choice | Meaning | Trade-off |
| --- | --- | --- |
| A (selected) | Game code ships through each platform's app distribution as separately managed Flutter packages; players opt in to gameplay data and large presentation packs | Most consistent cross-platform behavior; the executable baseline is not removable per game |
| B | Make game code opt-in wherever platform delivery allows | Smaller initial install on some platforms, but iOS and other targets need a different code-delivery/install experience |

Choice A is approved. The source tree and package graph stay modular, while the
App Store release bundle contains the iOS executable code. Player choice
controls game activation and optional content/assets, not downloading new
executable game code. Flutter deferred imports may be used for lazy loading
where supported, but are not the module-install contract.

### Per-game data ownership

Updated target: the approved [database separation plan](database-separation-plan.md)
uses main DB, SOCIAL_DB (including couples), and GAME_DB. The current shared
database remains the source-state until migration is verified. The initial
co-location description below records the earlier deployment option, not the
new target; games share GAME_DB with isolated per-game namespaces.

Each game declares a data namespace rooted at its stable `gameId`. Local keys,
database tables, object-storage prefixes, API routes, migration history, and
export/import formats are owned by that game. For example, Royale owns its
cards, decks, progression, match state/history and related assets; Archery owns
its own scores, progression and challenge state. Shared account identity is a
foreign identity only; it does not make game data shared.

The first deployment may physically host multiple namespaces in one D1/KV
account for operational simplicity, but logical ownership remains isolated:
each game gets separately named tables or a game-owned repository boundary,
game-scoped API paths, migration identifiers, and authorization checks. A
future game can move to another database or service without changing another
game's domain model or public contract. Uninstalling a local module does not
erase cloud progress; reinstall hydrates only that module's account data after
authentication.

Use the same ownership boundary across storage layers: local table/key prefixes
such as `game_archery_*`, game-scoped API routes such as
`/api/games/archery/v1/...`, asset keys such as
`games/archery/<resourceId>/<version>/...`, and migration IDs such as
`archery_0001_*`. Royale uses its own equivalent namespace. These are naming
rules, not a mandate to share physical databases. Authorization derives the
account from the authenticated session and checks game ownership server-side;
a client-supplied `gameId` is routing context, not proof of access. Shared
profile/account services expose identity, not a generic write path into game
data.

Mini Royale's existing D1 tables have been moved into that namespace with a
data-preserving SQLite table rename migration (`0029_mini_royale_table_namespace.sql`);
its repository/progression code now references only `mini_royale_*` tables.
Shared `users`/`sessions` remain account infrastructure. An in-memory SQLite
rehearsal seeded each legacy game table before migration, verified all rows
under the new names and returned no foreign-key violations. The reproducible
owner command is `npm run db:migration:rehearse`; it replays migrations through
0028, seeds every game table, then applies 0029. Deployment is still required
before a live D1 database can use these queries.

Fresh migration replay exposed that `0001_init.sql` had lost the legacy
`password` column while `0008_drop_password.sql` still drops it. The base
schema now carries that column only for migration compatibility, and 0008
removes it before application startup. The SQLite rehearsal verified the
namespaced rows, preserved shared account rows, found no foreign-key
violations, and confirmed the final `users` schema has no password column.
This is local SQLite evidence, not a migration against a deployed D1 database.

`dataSchemaVersion` is independent of `packageVersion`. A module migration is
scoped to one `gameId`, has an explicit source/target schema, and is restartable
or transactionally applied. Failed migration must preserve a recoverable prior
copy. Asset download versions are also separate from account data versions, so
updating art cannot accidentally migrate player progress.

### Multiplayer compatibility contract

Package version alone is not a multiplayer compatibility signal. Each game
declares a `multiplayerContract` containing:

- `protocolVersion` and an explicit compatible range for message/state shape;
- `rulesetId` / `rulesetVersion` for simulation and balance semantics;
- `gameplayContentDigest` for gameplay-affecting definitions (not cosmetic art);
- the server/runtime versions that can authoritatively host that contract.

Cosmetic resource versions may differ if their manifest marks them
gameplay-neutral. Gameplay card, unit, map, or rule changes update the ruleset
or gameplay-content identity. If the game explicitly supports mixed versions,
the compatible range must say so; otherwise the safe default is exact protocol
and ruleset compatibility.

Before room creation, joining, or queue admission, the client reports
`gameId`, installed module version, protocol version, ruleset identity, and
gameplay-content digest. The authoritative room/server selects and advertises
its required contract. Admission proceeds only if the game's compatibility
policy accepts the client. Otherwise the server rejects before any match state
is created or advanced and returns a structured reason plus required module or
resource version. The UI offers update/retry or exit. A P2P-hosted game must
perform the same check between peers and must not allow the host to silently
override the other peer's contract.

Mini Royale's current frontend and backend contract declarations are checked
for parity by the workspace boundary suite. Room owner tests separately verify
that missing or mismatched contracts are rejected before membership persists,
and that reconnect mismatches are rejected before WebSocket upgrade.

The room snapshot and reconnect handshake retain the selected contract for the
whole match; an update arriving mid-match applies only after leaving the room.
Validation covers equal versions, explicitly compatible versions, incompatible
protocol, changed gameplay digest, missing required resource, reconnect, and
server-required update cases.

| Client versus room contract | Admission | Reason / action |
| --- | --- | --- |
| Same protocol, ruleset, and gameplay digest | Allow | Exact match |
| Protocol in declared compatible range and same rules/content | Allow | Explicit compatibility policy |
| Protocol outside range | Reject before room state | `protocol_incompatible`; update module |
| Ruleset or gameplay digest differs | Reject unless equivalence is explicit | `gameplay_content_mismatch`; install required pack |
| Required gameplay resource missing/unverified | Reject | `resource_missing`; download and retry |
| Cosmetic pack differs and is gameplay-neutral | Allow | No simulation effect |
| Reconnect to a match-locked contract differs | Reject reconnect | Never mutate an active match contract |

The response is machine-readable and stable (`gameId`, reason code, required
contract, optional resource IDs, retryability); localized UI text is derived
on the client. The room pins the exact accepted contract for its lifetime.

### Initial design deliverables and acceptance

Before migrating existing game code, the architecture phase produces:

1. the host/module/port dependency diagram and module lifecycle state machine;
2. a versioned manifest schema with a catalog and signature/integrity policy;
3. a per-game data ownership inventory and namespace/migration rules;
4. the multiplayer compatibility matrix and room admission handshake;
5. a platform delivery decision for Web, desktop, Android, and iOS, backed by
   a small install/update/rollback proof on every supported target;
6. a package-boundary proof that a new game package can be registered without
   importing another game's domain or changing the host's game-specific code.

Architecture acceptance requires that a sample second game can be added,
installed, updated, and removed without editing Royale's models, tables,
migrations, or API contract; Royale and Archery data can evolve independently;
and a multiplayer version mismatch is rejected before gameplay. These are
design/runtime gates for this new architecture scope, not claims that the
current application already implements them.

## Messaging target

Feature inventory, current implementation state, delivery stages, and the
active one-to-one reliability scope are tracked in
[`chat-feature-plan.md`](chat-feature-plan.md). Chat is the current workstream;
later messaging enhancements remain sequenced there instead of being
implemented in one batch.

The first durable messaging model is event-based:

```text
MessageCreated -> MessageEdited -> MessageRecalled
                         |                 |
                         +--> projection <--+
```

The local store must provide at least:

- encrypted message/event storage;
- a current-message projection;
- an outbox for events created while offline;
- an inbox for received events awaiting verification or projection;
- sync cursors and device identity;
- conflict records rather than silent overwrites.

The product UI must depend on a messaging application API, not on Hive, WebRTC, HTTP, FCM, or Cloudflare APIs directly.

## Migration phases

### 1. Baseline and ownership

- inventory current routes, models, storage, transports, and runtime entry points;
- identify the owner and consumer of each contract;
- record current behavior before changing it;
- identify the missing `user_basic_system` checkout before package work.
- inventory every game and optional feature as a peer module, including its current UI, rules, models, data stores, APIs, assets, and dependencies;
- define the always-available login/catalog shell and the module manifest, installation state, update, removal, and platform delivery contracts;
- define per-game data ownership and prevent game-specific schemas from leaking into another game's domain;
- define resource, data-schema, multiplayer protocol, and rules/content version fields plus the pre-match compatibility handshake and rejection/update behavior;
- prove the resource delivery mechanism against Web, desktop, and mobile constraints before moving game code or data.

Phase 1 is not complete until a second game can be added as a peer without
changing an existing game's domain schema, and a version mismatch is rejected
before multiplayer gameplay begins.

Ownership resolution: `user_basic_system` is intentionally not checked out as
a sibling repository in this workspace. The frontend resolves the published
`user_basic_system ^0.1.1` package, and the verified package cache contains
version `0.1.1`; no local source migration or clone is inferred. The four
primary repositories remain unchanged, while the local `taiwan_brawl_core`
and `taiwan_brawl_messaging` packages are independently usable workspace
packages for the new shared boundaries.

### 2. Shared platform ports

Define package-level interfaces for identity, credential storage, local storage, messaging events, message repository, transport, and notification providers. The frontend now injects the shared credential port into `ApiClient`, while its platform secure-storage implementation remains replaceable. Do not connect the new ports to product pages yet.

### 3. Offline messaging engine

Implement event validation, local projection, outbox/inbox, edit/recall semantics, device identity, signing boundaries, and deterministic conflict rules.

Current foundation also exposes a shared command service for message creation,
editing, recall, and read revisions, so frontend transports do not own event
sequencing rules.

### 4. P2P transport

Implement signaling as a narrow session-negotiation adapter and WebRTC DataChannel as the message transport. Add a local deterministic transport for tests before connecting the UI.

### 5. Server synchronization adapter

Map the same event model to the backend without making HTTP polling or a Durable Object the core messaging abstraction. Preserve compatibility endpoints only during migration.

### 6. Frontend migration

Move `ChatService`, `LocalChatRepository`, notification chat handling, P2P chat, and signaling behind the new application API. Remove direct storage/transport access from pages and widgets.

The compatibility boundary promotes legacy local DM records into shared event
projections on first read. Subsequent edits and recalls use the shared event
outbox, while the legacy store remains available as a migration adapter.
The read path also replays legacy rows when the shared projection is partially
populated, so migration does not lose older cached messages behind a fast path.

Initial migration slice: `ChatService` kept the existing `DmService`/`ChatMessage` UI
contract, while its receive path moved to `ServerMessageTransport` and
`MessageSyncEngine`. Connected writes enter the shared outbox and use the event
route first; a 404/405-only fallback preserves legacy `/send` and `/recall`
compatibility. Network failures leave the event pending locally for a later
flush. New ChatService sends, edits, recalls, and remote events now render from
the shared repository projection; legacy Hive is only a read/migration fallback.
Legacy history reads are promoted into deterministic synthetic events so a
successful compatibility read becomes durable event history. The remaining
legacy `LocalChatRepository` is now injected at the ChatService boundary,
keeping the compatibility adapter replaceable. The frontend now owns
`EditableDmPage` and the `DirectMessageService` port it consumes; the shared
package's legacy `DmService` no longer defines the page's application boundary.
The page consumes a frontend-owned `DirectMessage` view mapped directly from
the shared `MessageProjection`, preserving stable message IDs, revision, read
state, recall state, and pending delivery metadata. Edit, recall, and read
commands use the stable event message ID. Legacy history and transport
compatibility logic remain available through private migration adapters, but
the UI does not depend on the legacy model. The old Hive history fallback remains until
stored legacy rows have been migrated and verified. Each conversation stores
a versioned durable manifest of promoted event message IDs, the exact legacy
Hive row-key set, and a SHA-256 fingerprint for each raw row; normal reads skip
the legacy box only while every event projection exists and both source keys
and row contents match the manifest. A missing projection, changed source row,
or malformed manifest triggers a recovery read and replay. Earlier list-only
and key-only manifests are upgraded after their existing IDs and row sets are
verified. The shared event repository treats reuse of an event ID for a
different canonical payload as a durable conflict, and history migration does
not mark that rejected source as complete. Source rows are retained rather
than deleted. Each promotion read now carries an opaque fingerprint for that
exact raw-row snapshot; writing the completion manifest compares the current
source against that fingerprint and refuses to mark a newer or edited row as
migrated. Such a race leaves the manifest absent so the next read can replay
the retained rows safely. Cursor-bearing history loads bypass the local
migration fast path and fetch the requested older server page; initial reads
without a cursor retain the offline-first local path. Both paths merge through
the same idempotent event batch. Legacy conversation history is preflighted as
one event batch, so
a deterministic row conflict is recorded without projecting valid sibling rows;
the batch inbox supports idempotent restart recovery if event-store writes fail.
An adapter-level regression now simulates failure while the second event is
persisted, restores the repository from the durable inbox, and verifies the
remaining event and migration manifest recover without duplicate projections.
This is deliberate compatibility state, not completion of the frontend
migration.

The history endpoint returns chronological pages of at most 50 records,
`hasMore`, and a compound `(createdAt, rowId)` continuation cursor. Queries use
the timestamp and stable D1 row ID together, so many messages sharing one
timestamp cannot be skipped at a page boundary. `EditableDmPage` requests the
next page when the reader reaches the top, merges by stable message ID, and
preserves the current viewport while older rows are inserted. Initial reads
still render local history if the server is unavailable.
Update (2026-10-28): the public `ChatMessage` stream, history, send, edit,
recall, and read facade has now been removed from `ChatService`. The page and
service tests use `DirectMessageService` operations and stable projection IDs;
edit/read/recall commands now operate directly on those IDs without converting
the projection into `ChatMessage` and guessing the ID back. Old-model conversion
and compatibility operations now live in `LegacyChatHistoryAdapter`,
`LegacyChatSyncSnapshotAdapter`, and `LegacyChatDeliveryAdapter`. Legacy sync
snapshots are serialized directly from projections into the existing wire
shape, and history orchestration now returns no legacy DTO to its DirectMessage
caller. The legacy recall fallback derives only the old server key from the
projection. The retry capability is a separate `RetryableDmService` port.
`ChatMessage`, legacy storage, and legacy remote endpoints remain migration
plumbing; removing that plumbing requires a separate compatibility audit and
is not claimed by this slice.
Update (2026-10-28): `EditableDmPage` no longer runtime-checks `ChatService` for
manual P2P or retry behavior. It receives `ManualP2pDmService` and
`RetryableDmService` as optional application capabilities. Both DM page
widgets now accept the app-owned ports. `DirectMessageSession` and
`DirectMessageSessionFactory` keep the `HomePage` independent from `ChatService`;
the production and preview roots inject the factory, which creates a session
per home route. Generic page tests can provide independent fakes, and manual
peer-role selection is not imported from the transport factory into the page.
One pure peer-role rule is shared by the page and factory without importing
either implementation.
Update (2026-10-28): the session lifecycle port now requires only
`DirectMessageService` plus disposal. Retry and manual P2P are discovered as
independent optional capabilities at the route boundary; implementations that
do not support either feature can still be returned by the session factory.
The current `ChatService` explicitly implements both capabilities.
Update (2026-10-28): legacy whole-conversation snapshot upload/download is also
an optional `DirectMessageSyncService` capability. The core DM page contract no
longer forces local-only or P2P-only sessions to implement server snapshot
operations; the route passes that capability only when the composed session
supports it, and the page hides those actions otherwise. `ChatService` keeps
the existing snapshot workflow through its explicit implementation. Ordinary
conversation refresh remains part of the core service because it returns the
current conversation projection.
The event-to-legacy recall fallback derives the old server key directly from
the event projection; `ChatService` no longer round-trips it through
`MessageChatProjection`/`ChatMessage` just to obtain that key. The HTTP fallback
remains isolated behind `LegacyChatDeliveryAdapter` until event-route
deployment compatibility is verified. Legacy Hive persistence exposes
history-migration, pending-message, delivery-write, and snapshot capabilities.
Each compatibility adapter receives only the storage operations
it uses; the composition root continues to provide the same `LocalChatRepository`
implementation, so existing stored rows and migration recovery behavior are
unchanged. Legacy remote history, delivery, and snapshot adapters likewise
receive separate HTTP capability interfaces. `ServerLegacyChatRemoteSource`
directly implements those focused ports and keeps the existing endpoint paths;
there is no remote aggregate interface.
When the shared repository has durable projections, history reads those
projections first and maps them into the app-owned `DirectMessage` DTO; the old Hive message
table remains a migration fallback for conversations not yet represented as
events. The existing sync-upload/download snapshot format is also bridged into
the shared event repository on download, so an imported recalled message keeps
its event projection rather than existing only in the legacy cache. The FCM /
pending-message notification poller now shares that repository as well: event
envelopes are accepted as events, while legacy rows retain the Hive fallback.
The legacy pending-row decode, compatibility-store write, and acknowledgement-ID
selection are isolated in the frontend-owned `LegacyPendingMessageAdapter`;
`NotificationService` retains event ingestion and unread-conversation signaling.
The production and preview composition roots build and inject this adapter so
the notification application service no longer depends on the broad legacy
chat-store port.
Update (2026-10-28): the frontend now owns `LegacyChatRecord` for rows that
remain in the legacy Hive cache. `LegacyChatStore` and its focused history,
pending-message, and delivery ports no longer expose the shared `ChatMessage`
type; the Hive repository and legacy snapshot/event conversion use the owned
record. The record retains the existing `createdAt_senderId` key and exact
camel-case JSON fields, and reads old rows as well as snake-case server rows.
The pending-row parser retains the prior acknowledgement-ID and flag defaults.
The HTTP history source parses the existing endpoint payload directly into the
same record, then promotes it into shared events. Endpoint paths, query
parameters, aliases, and acknowledgement behavior remain intact. This removes
the shared UI model from the legacy history/storage migration path without
claiming that the legacy wire format or cached data has been retired.
Update (2026-10-28): the former `MessageChatProjection` adapter had no
production consumers after `EditableDmPage` moved to `DirectMessage`; it has
been removed along with the frontend's thin `ChatMessage` export shim. Shared
event projections now map directly to `DirectMessage` in the app-facing model.
Update (2026-10-28): the legacy Hive repository no longer exposes unused
single-message lookup, delivery marking, text editing, message deletion,
conversation clearing, or box-closing operations. Its remaining methods are
limited to history migration, legacy pending/delivery writes, and snapshot
import/export. Hive box names, stored row shape, migration manifests, and
recovery reads are unchanged; the legacy cache remains until stored data has
been migrated and verified.
Update (2026-10-28): `ChatServiceFactory` now accepts separate local history,
delivery-write, and snapshot-store ports and injects each into only the
adapter that needs it. Production and local-preview composition roots still
share one `LocalChatRepository` instance, while factory code and its regression
test no longer depend on the aggregate `LegacyChatStore` interface.
The factory now applies the same boundary to remote history, delivery, and
snapshot operations; production and preview roots share one
`ServerLegacyChatRemoteSource` instance, but the factory no longer depends on
the aggregate `LegacyChatRemoteSource` interface either.
Update (2026-10-28): removed the now-unused `LegacyChatStore` aggregate. The
Hive repository directly implements the four local capabilities, and test
doubles implement only the ports required by each service or adapter. No
stored-data format or migration behavior changed.
Update (2026-10-28): removed the unused `LegacyChatRemoteSource` aggregate.
The HTTP compatibility adapter directly implements focused history, delivery,
and snapshot ports; the preview runtime no longer retains an otherwise unused
aggregate reference. Existing endpoint paths and payloads remain unchanged.
Update (2026-10-28): deterministic conversion from stored legacy chat rows and
legacy snapshots into shared events now lives in the pure
`LegacyChatEventMapper`. History promotion and snapshot merge use that mapper;
`MessageChatSyncAdapter` remains responsible for writing the old snapshot
shape from current projections. This keeps Hive access, HTTP synchronization,
and legacy event conversion in separate layers while preserving the existing
event IDs, revisions, recall events, and row formats.
Update (2026-10-28): versioned migration-manifest validation, legacy list/v1
upgrades, row-key checks, and SHA-256 fingerprint checks now live in the pure
`LegacyChatMigrationManifest` codec. `LocalChatRepository` supplies the current
raw Hive rows and persists only valid upgrades or invalidation; it no longer
owns manifest schema parsing or digest logic. Existing manifest versions and
Hive row data remain supported, and this change does not delete cached rows.
The transport factory capability was renamed `DirectMessageTransportFactory`
to describe the event-backed DM flow instead of the retired chat row model.
The P2P chat adapter derives UI messages from the shared projection. The
production `ChatService` owns manual P2P preparation and connects the WebRTC
transport to the same shared sync engine used by the server relay. The unused
`P2PChatService` / `P2PMessageSession` compatibility path has been removed;
transport negotiation stays in `P2PMessageTransport` and its injected
signaling/peer-connection factories.
`EventAuthenticator` is an injectable boundary on local commands and P2P sync;
peer key distribution remains a separate unresolved protocol, so the local
HMAC device identity is not reported as remote-peer verification.
`MessageEvent` now carries optional `deviceId` metadata through the shared,
frontend, and backend envelopes; it is deliberately additive and does not
replace account-level `actorId` authorization.
The shared package now exposes `DeviceIdentityDirectory` and
`DeviceEventAuthenticator`: peer verification is possible when an application
supplies a trusted key resolver, while missing peer resolution fails closed.
The shared package now also provides a credential-backed peer trust directory
with explicit trust and revocation operations. It stores only opaque
application-defined material and requires a decoder, so no product silently
trusts a device merely because its `deviceId` is present.
Production Flutter pages now consume the app-level `ApiClient` provider rather
than constructing independent clients, keeping credential and transport
configuration at the application boundary. Shared outbox flushing is
serialized, so concurrent server/P2P sync triggers cannot send the same local
event twice before acknowledgement. `MessageSyncEngine` also disconnects an
adapter after failed connect and on repeated stop calls, making transport
replacement and retry cleanup deterministic.
The background pending-notification consumer now accepts the same optional
remote verifier as ChatService, so notification polling cannot bypass the
identity policy when a trusted peer directory is configured.
If the initial outbox flush fails after connect, the sync engine now performs
the same cleanup and returns to a stopped state, so a later reconnect can
retry the durable outbox without duplicate subscriptions or leaked transports.
Remote event ingestion is serialized and the initial connect waits for the
handshake burst to be projected, preventing fast created/edit/recall deliveries
from racing through the durable store.
The composition root now shares one `PlatformCredentialStore` instance across
API sessions, device identity, message encryption-key access, and notification
installation identity. Existing installation IDs in the legacy Hive metadata
box are migrated by a read-only compatibility path and new IDs are written only
through `CredentialStore`.
`ApiClient` keeps its in-memory session cache per instance, while durable session
credentials remain in the injected `CredentialStore`; this prevents independent
composition roots, tests, or accounts from sharing a process-wide bearer token.
AdMob unit IDs follow the same configuration boundary, with banner and
interstitial identifiers supplied through `AppConfiguration` and overridable by
deployment defines.
The LLM provider fallback URL and model use that boundary as well, so feature
services and settings UI do not carry separate provider defaults.
The backend CORS policy no longer depends on a repository-owned production
hostname allowlist entry; the single Worker deployment uses same-origin access,
and local development remains restricted to the explicit localhost rules.
Backend LLM fallback settings are likewise environment-overridable through
`LLM_DEFAULT_BASE_URL` and `LLM_DEFAULT_MODEL`, without changing the precedence
of user-saved provider settings.
Frontend profile parsing consumes the same application configuration through the
auth service, keeping missing profile fields aligned with the selected runtime
defaults.
The same configuration is now available to profile image URL resolution, so
relative avatar paths follow the active API origin while absolute CDN URLs are
preserved.
Friends overview and search model parsing use the same injected origin, keeping
avatar URL behavior consistent across authentication and social features.
Royale card, deck, room, unit, and nested character-asset models now propagate
that origin through `RoyaleService`, so game artwork follows the same deployment
configuration boundary.
Application endpoints, OAuth client identifiers, and feature flags now share an
injectable frontend `AppConfiguration`. The default reads the existing
`--dart-define` values, while tests and another composition root can provide a
different deployment configuration without changing API or signaling code.
The backend Google OAuth verifier follows the same boundary: its accepted
audience list must be supplied through Worker `GOOGLE_CLIENT_ID` or
`GOOGLE_CLIENT_IDS` configuration and has no repository-owned default.
Messaging startup now exposes `MessagingStorageStatus`; a durable restore is
marked explicitly, while an in-memory fallback is marked `degraded` with the
failure description instead of silently looking equivalent to durable storage.
The frontend no longer exposes a second `HiveCredentialStore` implementation:
credential persistence belongs to the platform secure-storage adapter, while
Hive remains responsible for encrypted message-event and outbox persistence.
The unused deprecated `FlutterSecureCredentialStore` alias has been removed;
current frontend consumers use `PlatformCredentialStore` directly.
The legacy conversation cache is exposed through separate history,
pending-message, delivery-write, and snapshot ports consumed only by the
adapters that need them; `LocalChatRepository` implements those capabilities
without an aggregate interface. Server history, snapshot sync, legacy send,
and legacy recall likewise use separate remote ports implemented by
`ServerLegacyChatRemoteSource`. `ChatService` keeps its app-owned
`DirectMessageService` surface and delegates HTTP details to its adapters.
The notification installation-id migration is likewise behind a
`LegacyInstallationStore` port. `NotificationService` no longer opens Hive
directly; `HiveLegacyInstallationStore` is a read-only compatibility adapter,
while new identity data continues through `CredentialStore`.

The optional battle-animation cache now follows the same boundary. The
`BattleAnimationCacheStore` port owns settings, bytes, and metadata access;
the App implements it with `HiveBattleAnimationCacheStore`. Asset downloads are
behind `BattleAnimationRemoteSource`, implemented by the App's HTTP adapter, so
the game cache can use a local bundle, alternate CDN, or deterministic test
source without changing cache invalidation or room asset selection. The
Mini Royale package contains no direct Hive or HTTP imports, and its cache
service requires the storage and download ports at construction.
LLM connectivity checks and backend bot-decision calls now use a replaceable
`LlmBotRemoteSource`; provider response normalization remains in the
application service while HTTP ownership stays in the server adapter.

Room gameplay WebSocket creation is also injectable through
`RoyaleRoomChannelFactory`. The default remains the platform-aware room socket
adapter, while tests and future local/offline room transports can provide a
different channel without changing `RoyaleService`.

Push delivery is now behind a `PushProvider` port. `FirebasePushProvider` owns
Firebase initialization, permission/token APIs, and listener subscriptions;
`NotificationService` only consumes provider-neutral message and permission
results. This keeps FCM replaceable and prevents notification application logic
from directly depending on Firebase Messaging globals.

The provider-neutral push contract now lives in the shared
`taiwan_brawl_messaging` package, including configuration, token, permission,
and message types. Initialization configuration is opaque; Firebase options
and the Web VAPID key stay in the frontend Firebase adapter and cannot leak
into another provider's implementation. Firebase-specific types remain only
in the frontend adapter. The package version is `0.2.0` because its public
provider contract changed incompatibly from the initial `0.1.x` API.
`NotificationService` now requires a `NotificationPushProvider` and delegates
remote configuration parsing, platform eligibility, token cleanup capability,
and registration provider ID to that adapter. Production explicitly injects
`FirebasePushProvider`; the local preview explicitly injects an inert preview
provider. The service no longer imports Firebase or chooses an FCM default.

Platform-neutral deployment configuration now lives in
`taiwan_brawl_front/packages/shared/taiwan_brawl_core`, versioned and owned by
the frontend repository so CI can resolve it without another checkout. The frontend retains a compatibility export from
`lib/config`, while composition roots provide API URL, OAuth client IDs, and
feature flags. Session credentials, provider API keys, and device secrets stay
behind the existing credential/key ports or server environment injection.

The shared package now owns `PeerSignalingChannel`, which separates WebRTC
negotiation from the server implementation. `SignalingService` remains the
default hosted adapter, while `ManualPeerSignaling` supports out-of-band
offer/answer/ICE exchange for a serverless session. This is a signaling seam
and deterministic payload test, not evidence of successful two-device WebRTC
connectivity.

`PeerNegotiationBundle` gives the manual path a versioned JSON format with
validation, so copy/paste or QR integrations do not need to invent signaling
serialization or risk carrying message bodies. Its import boundary can also
require the expected session and sender device, preventing stale or
cross-session bundles from entering a live negotiation.

The shared package defines `NegotiatingMessageTransport` as an optional
capability on top of `MessageTransport`. `ChatService` consumes this contract
through an injected factory; the frontend WebRTC adapter implements it, and the
composition-owned `MessagingTransportFactory` supplies ICE configuration.
ChatService fails closed when manual signaling is configured without a
transport adapter, and the application service has no direct WebRTC fallback.

`MessagingTransportFactory` accepts a `P2PSignalingFactory`, so manual or hosted
signaling is selected at the composition boundary. The DM page consumes the
`ManualP2pDmService` capability for caller/answerer preparation, signed
copy/paste bundle import/export, and completion. `ChatService` currently
implements the capability alongside the DM session contract, reusing the
shared message repository and sync engine. Browser runtime success does not
prove physical-device or Internet-NAT connectivity.

Manual negotiation bundles are now signed by the local device identity at both
product service facades. Envelope v2 wraps the existing validated negotiation
bundle and signs its exact serialized bytes, binding the session, sender device,
SDP, and ICE candidates. Import verifies the signature through the configured
trusted-device authenticator before passing any signal to WebRTC. The shared
low-level v1 serializer remains available for format validation and migration
tests; product entrypoints reject unsigned bundles. Failed signing leaves the
outgoing signaling queue intact for retry. This authenticates negotiation data
against the explicitly trusted key, but does not encrypt the SDP/ICE envelope
or establish successful physical-device/NAT connectivity.

The Chrome runtime gate also uses two real browser peer connections with
`ManualPeerSignaling`: the devices exchange v2 signed bundles, verify each
other through fingerprint-confirmed Ed25519 trust, establish the DataChannel,
and deliver a signed message event. This exposed and fixed a lifecycle defect
where `connect()` repeated peer-connection preparation after the manual
`prepare()` phase; preparation is now idempotent until disconnect. This is
local browser evidence for the serverless bundle path, not physical-device,
Internet-NAT, or hosted-signaling validation. Manual signaling also coalesces
identical queued offer/ICE payloads, so retry timers cannot inflate a pending
copy/paste bundle with duplicate negotiation records.

The composition root now supplies a manual-signaling factory rather than a
singleton channel. `HomePage` creates one `ChatService` per opened DM route, and
the route wrapper disposes that session when closed. Each conversation-scoped
service receives its own signal stream and outgoing queue, preventing concurrent
DM sessions from mixing offers, answers, or ICE candidates in signed bundles.
Lifecycle operations on that session are serialized as well: a disconnect or
route disposal waits for in-flight negotiation preparation, repeated disposal
shares the same completion future, and disposed sessions reject new connection
or P2P preparation work. This avoids closing a peer transport while it is still
creating the local offer or ICE candidates.

Manual P2P startup is now explicitly two-phase at the facade: a product entry
point can prepare the peer connection without blocking on the DataChannel,
exchange the validated bundles, and then complete the connection. The existing
hosted `startAsCaller`/`startAsAnswerer` path remains blocking until its channel
is ready. This is lifecycle support for serverless signaling, not evidence of a
successful two-device WebRTC/NAT run.

P2P ICE configuration is also injectable. The hosted default keeps the current
STUN server, while a local/LAN composition can supply `iceServers: []` so the
WebRTC negotiation does not require an external STUN service. This remains
configuration support, not proof of successful offline NAT traversal.

Storage bootstrap is now also a composition-root concern. `LocalStorageRuntime`
is the initialization port and `HiveStorageRuntime` is the default adapter;
`ChatService` no longer owns `Hive.initFlutter()`, while the existing encrypted
Hive repositories remain compatible.

Restore treats the durable outbox as a crash-recovery source: if a local write
left an outbox row without its main event row, the event is reinserted and
remains pending for delivery instead of being discarded.

When restore finds the same event ID in both stores, the durable event row is
authoritative. A different canonical payload is recorded as a conflict, and
the pending copy is upserted from the authoritative row before it can be sent.
If conflict recording or repair fails, restore fails closed so the altered copy
is not exposed for delivery; a later restore can retry the durable repair.
Storage adapters implement `append` as an event-ID upsert, including the
pending row when `pendingOutbox` is true. Restore also deduplicates pending
rows by event ID so repeated durable rows produce only one delivery attempt.

The shared platform ports now include an opaque durable sync cursor. The
encrypted Hive message store persists a cursor per DM transport scope, and the
server relay uses a friend-scoped `afterId` query so a restarted poller does
not need to scan already acknowledged rows. The legacy unscoped pending route
remains compatible; cursor-enabled clients use the scoped contract.
The production composition root injects the restored encrypted store into the
transport factory, so this cursor is active in the shipped server adapter
rather than existing only in tests.

`ChatService` requires an injected `ChatMessageTransportFactory`; the
composition root chooses the server adapter, while tests and future
P2P/application adapters can replace transport creation without changing the
legacy chat API. The service itself no longer constructs a transport.
Its reconnect lifecycle now serializes transport teardown and replacement;
`disconnectAsync`/`disposeAsync` expose an awaitable boundary while the legacy
synchronous facade remains available for existing consumers.
Disposal also releases the injected signaling channel, so repeated DM page
lifecycles do not retain manual or hosted signaling stream resources.
Notification configuration and device registration now use a replaceable
`NotificationRemoteSource`; the server endpoint adapter owns the notification
HTTP paths and payload transport. `NotificationService` receives required
storage, notification, pending-polling, credential, installation, push, and
messaging-core dependencies and no longer accepts `ApiClient` or constructs
those adapters itself. The pending source adapter maps its source-specific row
into a shared message event; notification application logic consumes that
event through `MessagingCoreService` without importing the server message
transport or accepting a repository fallback.
The production HomePage now supplies the restored app-level device identity to
`ChatService`, so locally created/edit/recall events are signed through
`DeviceEventAuthenticator` when secure identity storage is available. New
device identities use Ed25519; the 32-byte private seed stays in the injected
credential store, and signed event strings are tagged `ed25519:`. The v2
serverless trust invitation contains only the public key and a SHA-256
fingerprint, which the users must compare through an independent channel.
Version-1 invitations remain readable for migration; they contain a shared
HMAC secret and the UI labels them as legacy material that must only be moved
through a private channel. The identity verifier accepts trusted legacy HMAC
signatures while all new local signatures use Ed25519. Remote peer verification
is still opt-in and fails closed without a trusted identity directory.
`ChatService` separates the local event signer from the optional remote
verifier; `PEER_VERIFICATION_ENABLED=true` enables that verifier for both
ChatService and pending notifications, while the default remains disabled. The
DM pairing dialog exposes invitation copy/paste and fingerprint review, then
requires the user to enter the exact fingerprint obtained through a separate
channel before trust can be saved. The invitation's own fingerprint cannot
self-confirm trust. This is an out-of-band public-key trust ceremony, not
automatic key exchange or proof against a user entering an unverified
fingerprint from the invitation itself.

Manual P2P ingestion always uses the credential-backed peer trust directory,
regardless of the opt-in verification flag retained for legacy server-relay
migration. P2P startup fails before allocating a transport when the local
device identity and peer verifier are absent. A Chrome two-peer WebRTC runtime
test now exercises mutually fingerprint-confirmed Ed25519 identities through
both production MessageSyncEngine instances and signed command repositories
for create, read, edit, and recall. It then confirms that an invalid signature
creates a conflict and is rejected without changing the recalled projection.
This verifies browser loopback cryptographic ingestion; device credentials,
independently compared fingerprints, hosted signaling, Internet NAT, and
physical-device behavior still require separate runtime validation.
The WebRTC lifecycle is now extracted into `P2PMessageTransport`, and the
production composition defaults to it through `P2P_CHAT_ENABLED=true`; an
explicit `P2P_CHAT_ENABLED=false` keeps server-relay-only behavior. A
`FallbackMessageTransport` attempts the P2P path first and uses the server
relay when connection setup times out or fails. A Chrome runtime test opens
two real browser peer connections with local ICE configuration and sends a
created event, a receiver read, the author's subsequent edit, and recall over
the DataChannel through MessageSyncEngine. The receiver applies every signed
event to the shared repository and ends with the visible projection
`訊息已收回`, read state retained, and revision 3. A forged signature is
recorded as a conflict and does not mutate that projection. This validates
ordered browser-loopback delivery and projection; it does
not validate physical-device connectivity, Internet NAT traversal, hosted
signaling, or remote peer-key distribution. The browser test, P2P session tests,
and facade tests now run in the dedicated `p2p-webrtc-runtime` GitHub Actions
job, and edits to those test files trigger the workflow. The workflow has been
updated locally; its remote result is pending a push and actual run.
Deterministic fallback
behavior, including recovery after a post-connect send failure, is covered by
frontend tests.
The Web build was also compiled with
`--dart-define=P2P_CHAT_ENABLED=true`; current builds use the same setting by
default unless explicitly overridden. This is compile-time wiring evidence,
not proof of a live two-device connection. The DM page separately retains its
manual signed-bundle flow, which does not use hosted signaling; the server
relay remains a fallback for hosted P2P failure and an explicit transport
option.
The same production entrypoint also compiles with
`--dart-define=PEER_VERIFICATION_ENABLED=true`; this verifies configuration
wiring only, not a completed peer-material import or two-device verification
session.
Transport selection is now owned by the application-level
`MessagingTransportFactory`; `HomePage` no longer constructs WebRTC, signaling,
or server transport adapters directly. Production chat always supplies this
factory, including when the selected transport is the default server relay.
`ChatService` now requires its messaging core, legacy store, remote source, and
transport factory. It no longer accepts `ApiClient` or constructs Hive, HTTP,
or server-relay adapters; `ChatServiceFactory` only assembles supplied ports.
The same factory now supplies the manual serverless P2P transport builder, so
the pairing path does not create a WebRTC adapter inside the application
service.
The composition root now also owns the shared `AdminService`, `LlmBotService`,
and `RoyaleService` instances. Admin, settings, home, and deck pages consume
those application services through providers instead of constructing them in
widget lifecycle methods; the lobby now resolves the provider-owned service as
well, while its explicit service override remains for deterministic tests and
alternate composition roots.
`FriendsService` is now composed at the same boundary and is shared by HomePage
and RoyaleArenaPage, so those pages no longer create independent HTTP-backed
friend adapters. `FriendsOverviewSyncService` now consumes that same service
instance rather than constructing a new service from `ApiClient`, keeping its
polling lifecycle independent from the remote transport.
`ChatServiceFactory` now owns the legacy-compatible chat application service
assembly as well. HomePage receives the factory through the composition root;
API, messaging core, identity, verifier, transport selection, and manual
signaling are no longer assembled in the page lifecycle.
The factory requires the legacy chat store, legacy remote source, and message
transport factory. `ChatService` also requires its messaging core and all four
ports; its direct-construction compatibility defaults have been removed.
Focused tests now supply in-memory stores, fake remote sources, or explicit
server adapters at the test boundary.
The same composition root explicitly creates one legacy chat store, legacy
remote source, and installation-store adapter for production. ChatService and
NotificationService receive those adapters rather than independently falling
back to Hive constructors. NotificationService now requires its complete
adapter set, so every caller must make its storage and HTTP choices explicit.
It also requires the shared messaging core and an explicit nullable
remote-event authenticator. Pending-row event parsing is dispatched through
the `PendingNotificationSource` contract and implemented by its server
adapter; the application service no longer chooses between a
`MessagingCoreService` and a directly supplied `MessageRepository`.
P2P caller/answerer selection is deterministic by peer user-id ordering, so a
DM pair cannot accidentally start two competing offerers.
The caller now retains its local offer and emitted ICE candidates and retries
them during the transient signaling window until the DataChannel connects or
the existing timeout triggers relay fallback. This reduces message-ordering
loss when the peer's SignalRoom connection starts later, but is still not
evidence of a real two-device WebRTC runtime.
`SignalRoom` now uses the Durable Object WebSocket Hibernation API end to end:
the user ID is stored as a socket attachment, and message/close/error dispatch
uses Durable Object handlers. Relay and same-user replacement discover sockets
through `getWebSockets()` instead of an instance-only map, so a reconstructed
object can recover the active peers. A fake-state reconstruction regression
validates this code path; actual Cloudflare hibernation and two-device NAT
acceptance remain open. A local workerd owner test now accepts two real
hibernatable WebSocket clients, evicts the Durable Object with
`evictDurableObject()`, and verifies that the surviving sockets relay an SDP
offer after the runtime reconstructs the object. The signaling boundary
accepts only bounded offer/answer SDP and ICE negotiation fields, rejects
message-shaped or oversized payloads, and relays a normalized allowlist; the
frontend wire-shape regression guards compatibility with the existing SDP/ICE
client contract. Local workerd eviction is stronger than a hand-built state
fixture but does not prove hosted Worker behavior or real-device NAT traversal.
`MessagingCoreService` now also owns construction of shared command services
and sync engines. Production `ChatService` uses those application methods,
while the repository remains available for projection/history compatibility.
`HomePage` now disposes its chat service with the page lifecycle, so active
sync engines and transport subscriptions are stopped when the page is removed.
The notification/pending-message consumer now receives the same
`MessagingCoreService` application API for event ingestion; legacy Hive writes
remain only for envelopes and rows that cannot be projected as shared events.
Its background pending polling and acknowledgement now live behind an injected
`PendingNotificationSource`; the production server implementation owns HTTP and
row-level ack while tests or a future local source can replace it.
The consumer acknowledges an event-envelope row only after the shared store is
durable. A rejected event is acknowledged only when durable conflict storage
recorded the rejection; in-memory/degraded ingestion leaves the server row
pending so a restart cannot silently lose the event or its conflict.
The production composition root now explicitly creates and injects both the
pending source and notification registration source, so the notification
application service does not select HTTP adapters implicitly.
The same rule now applies to the production auth, friends, admin, LLM, and
Royale services: each receives an explicitly composed server remote source,
and each service constructor requires that source. `ApiClient` and server
adapter construction stay in the composition roots or explicit test setup.
The optional battle-animation cache follows the same rule: its production Hive
store and HTTP asset source are composed explicitly in the App; the game cache
service has no platform-specific compatibility defaults.
The offline messaging restore path is also isolated in
`messaging_runtime_bootstrap.dart`; the app entrypoint composes that result
without owning encryption-key, device-identity, or degraded-storage recovery
details.
Recall/edit event envelopes no longer update the legacy Hive cache after shared
ingestion; only legacy rows without event metadata use that compatibility write
path.
The application API now has a deterministic two-peer outbox/sync consumer test
using the shared in-memory transport, separate from the WebRTC runtime gate.
The frontend consumer boundary now also verifies two `ChatService` instances
perform create, edit, recall, and read over that replaceable transport without
HTTP or Hive dependencies.
A reusable storage-status banner is mounted at the HomePage composition
boundary; degraded restore is now visible to the user rather than being only a
diagnostic value in a provider.
`ChatService` now also has a consumer test proving that a failed offline send
remains in the shared outbox and is flushed after the transport is recreated.
The same consumer boundary now covers create, edit, and recall while offline:
all three local events remain projected immediately and stay pending until a
transport can flush them.
Incoming messages now use the same consumer boundary for read state: the
Flutter DM lifecycle appends a durable read event after local projection, so an
offline read is retained and retried instead of being only a transient UI flag.
The initial history load, explicit server refresh, and sync-download merge all
share this read marker, avoiding a separate unread behavior for restored data.
The initial history path also returns the available local conversation when a
transport-level network failure occurs; explicit HTTP errors remain visible so
authentication and server failures are not silently disguised as offline state.
Explicit history refresh uses the same fallback and returns the current local
projection when the network is unavailable.
When a shared event exists but its sync engine is disconnected, `ChatService`
now stops at the local durable outbox instead of issuing a legacy HTTP request;
the legacy path is reserved for a connected deployment that explicitly lacks
the additive event route.
The legacy `ChatMessage` stream now emits the exact message projection changed
by an edit or recall, rather than assuming that the conversation tail changed;
this keeps earlier-message edits and recalls visible immediately during the
UI migration.
The server message adapter now serializes periodic and explicit recovery polls
into one in-flight receive cycle, preventing duplicate relay requests and ack
races when a network request is slow.
Receipt-capable relay transports now defer remote acknowledgement until the
shared sync engine has durably ingested the event and recorded any conflict.
The server adapter keeps a pending receipt map and advances its cursor only
through acknowledged rows, so a later event cannot skip an earlier local
storage failure.
The backend now adds a receiver/sender/id index for the friend-scoped cursor
query, while retaining the legacy created-at index for compatibility reads.
Legacy DM history loading and refresh promotion now live in the frontend-owned
`LegacyChatHistoryAdapter`. It owns the legacy local/remote read, event
conversion, projection-completeness check, and durable migration-manifest write.
`ChatService` delegates history operations to this adapter while retaining its
separate authenticator for live sync transport. Legacy rows and the remote
compatibility source remain available for recovery and staged migration.
Whole-history sync snapshots now have a separate
`LegacyChatSyncSnapshotAdapter`: it preserves the legacy wire shape, exports
shared projections with pending state, and merges downloaded snapshots into
both the compatibility store and the shared event repository. `ChatService`
delegates upload/download orchestration to it; the legacy remote source and
store remain injected ports for the other staged compatibility operations.
Snapshot merge now preflights the complete shared-event batch against current
history before applying any member. A deterministic conflict is persisted and
fails the merge without applying valid peers from that batch; raw compatibility
rows are imported only after the batch passes. Single-event ingestion remains
immediate when uncontended; local and remote event mutations queue behind an
active batch preflight/commit. Stores implementing `MessageBatchInboxStore`
stage the complete batch in one durable inbox record and replay it idempotently
after restore. Every event is persisted before new in-memory projections are
committed or emitted, so a failed append leaves the current repository
unchanged. This provides atomic projection visibility and write-ahead recovery,
not a cross-event database transaction; durable event rows can still contain a
prefix until inbox replay completes.
The remaining legacy send and recall HTTP calls plus legacy-row write now live
in `LegacyChatDeliveryAdapter`. `ChatService` retains only the compatibility
decision: use the shared durable outbox first and invoke the legacy endpoint
only when a connected deployment reports that the event route is unsupported.
Offline events remain queued for reconnect.
The legacy recall key conversion from a shared projection's timestamp and
author ID is also owned by `LegacyChatDeliveryAdapter`; `ChatService` no longer
encodes the legacy `createdAt_senderId` wire key.
`ChatServiceFactory` is the composition boundary for these adapters: it builds
them from focused storage and remote capability ports, and `ChatService`
receives only the focused adapter contracts. Neither service depends on an
aggregate legacy store or remote-source interface.
Outbox retry scheduling is owned by shared `MessageSyncEngine` rather than the
frontend `ChatService`. A host may supply a retry interval; the engine retries
only events accepted by its conversation filter, prevents overlapping retry
flushes, cancels its timer when stopped, and waits for an in-flight retry flush
before disconnecting the transport.
The same event scope now gates inbound ingestion. Out-of-scope events become
conflicts rather than projections; receipt transports acknowledge only after
an event or its rejection conflict has been durably written. If local conflict
storage fails, the diagnostic is removed from memory so a relay retry attempts
the durable write again.
Outbox acknowledgement now persists its removal before pruning the in-memory
queue. If transport delivery succeeds but local acknowledgement storage fails,
the same event ID remains retryable; receivers rely on event-ID idempotency to
absorb the possible repeated delivery.
The reusable sync-engine API addition increments `taiwan_brawl_messaging` to
`0.3.0`, with the frontend lockfile and workspace package snapshot aligned.
Authentication and profile/session mutations use a replaceable
`AuthRemoteSource`; `AuthService` requires that port while the server adapter
owns HTTP paths and session cleanup.
Friend search, friendship mutations, block state, and room invites now use a
replaceable `FriendsRemoteSource`; the overview polling service can receive the
same boundary without changing its lifecycle or deduplication behavior.
Admin user-role, card, character, and image management now uses a replaceable
`AdminRemoteSource`; `AdminService` requires that port and retains its model
parsing surface while the server adapter owns HTTP endpoint paths. This keeps
admin screens compatible with a future local/offline management source without
coupling widgets to transport details.
The fallback transport also clears its active adapter when both the preferred
and relay connections fail, so later outbox retries cannot reuse a stale
disconnected primary transport.
`P2PMessageTransport.connect()` now owns exception-safe cleanup as well, so a
standalone P2P consumer does not leak its signal subscription or peer
connection when SDP, ICE, or DataChannel setup times out.
Peer-connection creation is injected through a small frontend boundary, with
the production adapter still using `flutter_webrtc`; deterministic tests can
now exercise factory failure and cleanup without requiring NAT or a physical
second device.
Signaling WebSocket creation is injected through the same style of boundary;
failed channel creation clears the peer target and does not leave stale stream
callbacks attached to a later connection.
The Royale arena now consumes a `RoyaleRoomChannel` application adapter rather
than importing WebSocket directly; room JSON encoding/decoding is owned by the
adapter. The settings panel's direct LLM connectivity check similarly moved to
`LlmBotService`, keeping provider HTTP and error normalization out of widgets.
Royale room, deck, progression, card, hero, and bot HTTP calls now use a
replaceable `RoyaleRemoteSource`; the server adapter owns endpoint paths and
WebSocket URL/header construction while `RoyaleService` retains model parsing
and requires the remote-source port at construction.
The shared `MessageRepository` now rejects remotely received events that are
already provably invalid, records their conflict reason, and removes them from
the active event set. Valid out-of-order revisions remain staged while a
revision gap is unresolved, so eventual delivery does not become a false
conflict or silently overwrite the projection. Durable restore follows the same
rule and no longer drops the entire messaging runtime when one stored event is
corrupt or conflicts with another.
Conflict records now have an optional shared `MessageConflictStore` port. The
frontend's encrypted Hive message store implements that port, so rejected
events and their reasons survive restart; existing event-store implementations
remain source-compatible when they do not opt into durable conflict storage.

The shared repository now also exposes an optional `MessageInboxStore` port.
Remote events enter the durable inbox before verification and projection, and
are removed only after the receive operation completes. The frontend encrypted
Hive adapter implements this boundary, so a failed receive can be replayed on
restart while existing store implementations remain source-compatible. The
composition root passes the device authenticator into inbox replay, so the
restart path uses the same fail-closed identity gate as live transport input.
The encrypted Hive adapter now decodes persisted event records one at a time;
malformed event, outbox, or inbox records are isolated as durable conflicts
instead of aborting the entire local restore. Corrupt inbox records are
removed after that diagnostic is persisted because they cannot be replayed.

### 7. Royale transport boundary

Reuse identity, transport, and event infrastructure for local simulation, server rooms, and later P2P rooms. Do not claim multiplayer P2P correctness until authority and deterministic simulation are separately specified.

### 8. Deployment and cleanup

Separate frontend build/deploy from backend adapters while retaining integrated
deployment as a compatibility mode. The frontend now owns
`tool/build_web.sh`, which accepts the shared deployment defines without
requiring Wrangler or the backend checkout. Remove deprecated paths only after
consumer validation passes.

## Non-goals for the first migration slice

- no immediate rewrite of every page or widget;
- no immediate deletion of `pending_messages`, `CHAT_ROOM`, or `SIGNAL_ROOM`;
- no immediate commitment to serverless multiplayer Royale;
- no credentials, private keys, or tokens in source, contracts, or workspace snapshots;
- no claim of production P2P, encryption, or deployment behavior before runtime validation.

## Required validation gates

Each migration slice must pass the owning package tests and the relevant consumer tests. Contract changes must also update the coordination snapshot and run workspace validation. P2P behavior requires a two-peer runtime test; static interfaces alone are not sufficient evidence. The current Chrome loopback test is evidence for the browser transport lifecycle only; a physical-device/Internet-NAT runtime gate remains required before a production P2P claim.

The coordination test suite also scans frontend pages and widgets for direct
low-level HTTP, storage, WebRTC, and transport construction, preventing new
features from bypassing the composition-root boundary.
