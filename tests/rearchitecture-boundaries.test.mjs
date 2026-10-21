import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../intelligence/task-runner.mjs';

async function dartFilesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await dartFilesUnder(path));
    else if (entry.isFile() && entry.name.endsWith('.dart')) files.push(path);
  }
  return files;
}

function assertPackageManifestVersionMatches(pubspec, moduleSource, constantName) {
  const packageVersion = /^version:\s*([^\s#]+)/m.exec(pubspec)?.[1];
  const manifestVersion = new RegExp(`const ${constantName} = '([^']+)'`).exec(moduleSource)?.[1];
  assert.ok(packageVersion, 'game package pubspec must declare a version');
  assert.ok(manifestVersion, 'game module must declare its package version');
  assert.equal(manifestVersion, packageVersion, 'module manifest version must match pubspec version');
}

test('frontend pages and widgets stay behind composition-root service boundaries', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const files = [
    ...(await dartFilesUnder(join(frontendRoot, 'lib', 'pages'))),
    ...(await dartFilesUnder(join(frontendRoot, 'lib', 'widgets'))),
  ];
  const forbidden = [
    'package:http/',
    'hive_flutter',
    'flutter_secure_storage',
    'flutter_webrtc',
    'ApiClient(',
    'ServerMessageTransport(',
    'P2PMessageTransport(',
    'SignalingService(',
    'RoyaleService(',
    'AdminService(',
    'AuthService(',
    'FriendsService(',
    'LlmBotService(',
    'NotificationService(',
    'ChatService(',
  ];
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const token of forbidden) {
      if (source.includes(token)) violations.push(`${file}: ${token}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('generic game library delegates package-specific sections to a registry', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const libraryPage = await readFile(
    join(frontendRoot, 'lib', 'pages', 'game', 'game_library_page.dart'),
    'utf8',
  );
  const extensions = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'game_module_library_extensions.dart'),
    'utf8',
  );
  const miniRoyaleRegistration = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'mini_royale_game_registration.dart'),
    'utf8',
  );

  assert.doesNotMatch(libraryPage, /package:taiwan_brawl_game_/);
  assert.match(libraryPage, /gameModuleLibraryExtensions\[module\.moduleId\]/);
  assert.match(extensions, /gameModuleRegistrations/);
  assert.match(miniRoyaleRegistration, /MiniRoyaleLibrarySettingsSection/);
});

test('game package CI checks native runner platforms without publishing', async () => {
  const workflow = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_front',
      '.github',
      'workflows',
      'game-package-platforms.yml',
    ),
    'utf8',
  );

  for (const runner of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
    assert.ok(workflow.includes(runner), `missing native runner ${runner}`);
  }
  assert.match(workflow, /packages\/games\/archery/);
  assert.match(workflow, /packages\/games\/mini_royale/);
  assert.match(workflow, /packages\/shared/);
  assert.match(workflow, /shared-package-tests/);
  assert.match(workflow, /native-device-integration/);
  assert.match(workflow, /Android emulator/);
  assert.match(workflow, /iOS Simulator/);
  assert.match(workflow, /integration_test\/game_resource_native_lifecycle_test\.dart/);
  assert.match(workflow, /integration_test\/\*\*/);
  assert.match(workflow, /flutter analyze/);
  assert.match(workflow, /flutter test/);
  assert.doesNotMatch(workflow, /flutter deploy|npm run deploy/);
});

test('game packages remain peer modules with no cross-game source or runtime dependency', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const games = [
    {
      name: 'Archery',
      directory: 'archery',
      packageName: 'taiwan_brawl_game_archery',
      forbiddenPackage: 'taiwan_brawl_game_mini_royale',
    },
    {
      name: 'Mini Royale',
      directory: 'mini_royale',
      packageName: 'taiwan_brawl_game_mini_royale',
      forbiddenPackage: 'taiwan_brawl_game_archery',
    },
  ];

  for (const game of games) {
    const packageRoot = join(frontendRoot, 'packages', 'games', game.directory);
    const pubspec = await readFile(join(packageRoot, 'pubspec.yaml'), 'utf8');
    const sourceFiles = await dartFilesUnder(join(packageRoot, 'lib'));

    assert.match(pubspec, new RegExp(`^name: ${game.packageName}$`, 'm'), `${game.name} has its own package identity`);
    assert.doesNotMatch(pubspec, new RegExp(`^\\s+${game.forbiddenPackage}:`, 'm'), `${game.name} must not depend on its peer`);

    for (const file of sourceFiles) {
      const source = await readFile(file, 'utf8');
      assert.equal(
        source.includes(`package:${game.forbiddenPackage}/`),
        false,
        `${game.name} source must not import its peer: ${file}`,
      );
    }
  }
});

test('game host consumers derive module surfaces from one registration registry', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const registry = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'game_module_registrations.dart'),
    'utf8',
  );
  const consumers = [
    'bundled_game_catalog.dart',
    'game_module_routes.dart',
    'game_module_home_entries.dart',
    'game_module_library_extensions.dart',
    'game_module_room_invite_registry.dart',
    'game_resource_migrations.dart',
  ];

  assert.match(registry, /buildGameModuleRegistrations\(\[/);
  assert.match(registry, /archeryGameRegistration/);
  assert.match(registry, /miniRoyaleGameRegistration/);
  for (const filename of consumers) {
    const source = await readFile(
      join(frontendRoot, 'lib', 'game_modules', filename),
      'utf8',
    );
    assert.match(source, /gameModuleRegistrations/);
    assert.doesNotMatch(source, /package:taiwan_brawl_game_(archery|mini_royale)\//);
  }

  const ownerTest = await readFile(
    join(frontendRoot, 'test', 'game_module_registration_test.dart'),
    'utf8',
  );
  assert.match(ownerTest, /catalog, routes, Home, Library and validators derive from registrations/);
  assert.match(ownerTest, /duplicate module IDs and routes fail at registry composition/);
  assert.match(ownerTest, /a new peer game composes into every generic host contribution/);
  const resourceLifecycleTest = await readFile(
    join(frontendRoot, 'test', 'game_resource_installer_test.dart'),
    'utf8',
  );
  assert.match(
    resourceLifecycleTest,
    /a peer game can be selected, install and update its own pack, then remove it/,
  );
});

test('Mini Royale package owns its manifest and frontend traffic uses its versioned backend namespace', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const backendRoot = join(workspaceRoot, '..', 'taiwan_brawl_back');
  const miniRoyalePackageFiles = await dartFilesUnder(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib'),
  );
  const miniRoyalePlatformAdapters = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'mini_royale_platform_adapters.dart'),
    'utf8',
  );
  const inviteModel = await readFile(
    join(frontendRoot, 'lib', 'models', 'friends_models.dart'),
    'utf8',
  );
  const inviteRegistry = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'game_module_room_invite_registry.dart'),
    'utf8',
  );
  const inviteMigration = await readFile(
    join(backendRoot, 'migrations', '0023_room_invite_game_id.sql'),
    'utf8',
  );
  const friendsRemoteSource = await readFile(
    join(frontendRoot, 'lib', 'services', 'friends_remote_source.dart'),
    'utf8',
  );
  const gameApiPaths = await readFile(
    join(backendRoot, 'src', 'api', 'game_api_paths.js'),
    'utf8',
  );
  const inviteRepository = await readFile(
    join(backendRoot, 'src', 'features', 'friends_repository.js'),
    'utf8',
  );
  const packagePubspec = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'pubspec.yaml'),
    'utf8',
  );
  const archeryPubspec = await readFile(
    join(frontendRoot, 'packages', 'games', 'archery', 'pubspec.yaml'),
    'utf8',
  );
  const archeryModule = await readFile(
    join(frontendRoot, 'packages', 'games', 'archery', 'lib', 'src', 'archery_game_module.dart'),
    'utf8',
  );
  const archeryPlayerData = await readFile(
    join(frontendRoot, 'packages', 'games', 'archery', 'lib', 'src', 'archery_player_data.dart'),
    'utf8',
  );
  const archeryHiveBackend = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'archery_hive_progress_backend.dart'),
    'utf8',
  );
  const miniRoyalePlayerData = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'mini_royale_player_data.dart'),
    'utf8',
  );
  const gamePlayerDataIsolationTest = await readFile(
    join(frontendRoot, 'test', 'game_player_data_isolation_test.dart'),
    'utf8',
  );
  const archeryPlayerDataTest = await readFile(
    join(frontendRoot, 'packages', 'games', 'archery', 'test', 'archery_game_module_test.dart'),
    'utf8',
  );
  const miniRoyalePlayerDataTest = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'test', 'mini_royale_player_data_test.dart'),
    'utf8',
  );
  const archeryModuleEntrypoint = await readFile(
    join(frontendRoot, 'packages', 'games', 'archery', 'lib', 'archery_game_module.dart'),
    'utf8',
  );
  const bundledCatalog = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'bundled_game_catalog.dart'),
    'utf8',
  );
  const archeryRegistration = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'archery_game_registration.dart'),
    'utf8',
  );
  const miniRoyaleRegistration = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'mini_royale_game_registration.dart'),
    'utf8',
  );
  const packageModule = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'mini_royale_module.dart'),
    'utf8',
  );
  const miniRoyaleGameplayRules = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'gameplay_rules.dart'),
    'utf8',
  );
  const miniRoyaleGameplayRulesSource = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'gameplay_rules_source.dart'),
    'utf8',
  );
  const miniRoyaleGameplayRulesAppAdapter = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'mini_royale', 'gameplay_rules_source.dart'),
    'utf8',
  );
  const miniRoyaleAppGameContract = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'mini_royale_game_contract.dart'),
    'utf8',
  );
  const serverGameplayRules = await readFile(
    join(backendRoot, 'src', 'royale', 'royale_gameplay_rules.js'),
    'utf8',
  );
  const gameLibraryController = await readFile(
    join(frontendRoot, 'lib', 'services', 'game_library_controller.dart'),
    'utf8',
  );
  const gameResourceInstaller = await readFile(
    join(frontendRoot, 'lib', 'services', 'game_resource_installer.dart'),
    'utf8',
  );
  const packageRules = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'battle_rules.dart'),
    'utf8',
  );
  const packageModels = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'royale_models.dart'),
    'utf8',
  );
  const packageService = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'mini_royale_service.dart'),
    'utf8',
  );
  const packageDeckPage = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'royale_deck_page.dart'),
    'utf8',
  );
  const packageLobbyPage = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'royale_lobby_page.dart'),
    'utf8',
  );
  const packageRoomLobby = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'room_lobby_panel.dart'),
    'utf8',
  );
  const hostLobbyAdapter = await readFile(
    join(frontendRoot, 'lib', 'pages', 'game', 'royale_lobby_page.dart'),
    'utf8',
  );
  const packageBattleEngine = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'host_battle_engine.dart'),
    'utf8',
  );
  const packageAnimationCache = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'battle_animation_cache_service.dart'),
    'utf8',
  );
  const arenaPainter = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_field_painter.dart'),
    'utf8',
  );
  const arenaCanvas = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_battlefield_canvas.dart'),
    'utf8',
  );
  const animatedUnitPortrait = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_animated_unit_portrait.dart'),
    'utf8',
  );
  const battleResultOverlay = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_battle_result_overlay.dart'),
    'utf8',
  );
  const battlefieldHeader = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_battlefield_header.dart'),
    'utf8',
  );
  const battlefieldUnits = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_battlefield_units.dart'),
    'utf8',
  );
  const arenaPreview = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'mini_royale_arena_preview.dart'),
    'utf8',
  );
  const arenaOverlays = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_overlay_widgets.dart'),
    'utf8',
  );
  const arenaTargeting = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_targeting.dart'),
    'utf8',
  );
  const arenaPage = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'mini_royale_arena_page.dart'),
    'utf8',
  );
  const homePage = await readFile(
    join(frontendRoot, 'lib', 'pages', 'home', 'home_page.dart'),
    'utf8',
  );
  const homeLayout = await readFile(
    join(frontendRoot, 'lib', 'pages', 'home', 'home_page_layout.dart'),
    'utf8',
  );
  const homeEntryRegistry = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'game_module_home_entries.dart'),
    'utf8',
  );
  const miniRoyaleInviteHandler = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'mini_royale', 'room_invite_handler.dart'),
    'utf8',
  );
  const miniRoyaleDropTarget = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_drop_target.dart'),
    'utf8',
  );
  const miniRoyaleBattleSelection = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'battle_selection.dart'),
    'utf8',
  );
  const miniRoyaleRoomCommands = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'mini_royale_room_commands.dart'),
    'utf8',
  );
  const miniRoyaleRoomServer = await readFile(
    join(backendRoot, 'src', 'royale', 'royale_room.js'),
    'utf8',
  );
  const miniRoyaleImmersiveLayout = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'immersive_battle_layout.dart'),
    'utf8',
  );
  const miniRoyaleHandWidgets = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_hand_widgets.dart'),
    'utf8',
  );
  const arenaBattlefieldLayout = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_page_battlefield_layout.dart'),
    'utf8',
  );
  const miniRoyalePresentation = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_presentation.dart'),
    'utf8',
  );
  const miniRoyalePresentationSource = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'mini_royale', 'arena_presentation_source.dart'),
    'utf8',
  );
  const arenaRoomLayout = await readFile(
    join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'arena_page_room_layout.dart'),
    'utf8',
  );
  const hostService = await readFile(
    join(frontendRoot, 'lib', 'services', 'royale_service.dart'),
    'utf8',
  );
  const oldHostModelPath = join(frontendRoot, 'lib', 'models', 'royale_models.dart');
  const appPubspec = await readFile(join(frontendRoot, 'pubspec.yaml'), 'utf8');
  const remoteSource = await readFile(
    join(frontendRoot, 'lib', 'services', 'royale_remote_source.dart'),
    'utf8',
  );
  const resourceCatalogSource = await readFile(
    join(frontendRoot, 'lib', 'services', 'game_resource_catalog_source.dart'),
    'utf8',
  );
  const gamePathMapper = await readFile(
    join(backendRoot, 'src', 'api', 'game_api_paths.js'),
    'utf8',
  );
  const gameDataApi = await readFile(
    join(backendRoot, 'src', 'api', 'mini_royale_data_api.js'),
    'utf8',
  );
  const gameRoomApi = await readFile(
    join(backendRoot, 'src', 'api', 'mini_royale_room_api.js'),
    'utf8',
  );
  const genericRoomsApi = await readFile(
    join(backendRoot, 'src', 'api', 'rooms_api.js'),
    'utf8',
  );
  const admission = await readFile(
    join(backendRoot, 'src', 'royale', 'royale_room.js'),
    'utf8',
  );
  const backendGameContract = await readFile(
    join(backendRoot, 'src', 'royale', 'royale_compatibility.js'),
    'utf8',
  );
  const backendCatalogValidator = await readFile(
    join(backendRoot, 'src', 'api', 'game_resources_api.js'),
    'utf8',
  );
  const backendCatalogTests = await readFile(
    join(backendRoot, 'tests', 'game_resources_api.test.js'),
    'utf8',
  );

  assert.match(packagePubspec, /name: taiwan_brawl_game_mini_royale/);
  assertPackageManifestVersionMatches(
    packagePubspec,
    packageModule,
    'miniRoyalePackageVersion',
  );
  assertPackageManifestVersionMatches(
    archeryPubspec,
    archeryModule,
    'archeryGamePackageVersion',
  );
  assert.throws(
    () => assertPackageManifestVersionMatches(
      archeryPubspec.replace('version: 0.1.0', 'version: 0.2.0'),
      archeryModule,
      'archeryGamePackageVersion',
    ),
    /must match pubspec version/,
  );
  assert.match(archeryModule, /class ArcheryGameModuleManifest/);
  assert.match(archeryModule, /archeryGameDataSchemaVersion/);
  assert.match(archeryModule, /archeryGameSupportedPlatforms/);
  assert.match(archeryPlayerData, /class ArcheryPlayerDataRepository/);
  assert.match(archeryPlayerData, /Missing Archery migration/);
  assert.match(archeryPlayerData, /_serialize\(_key\(profileId\)/);
  assert.equal(archeryPlayerData.includes('package:taiwan_brawl/'), false);
  assert.match(archeryHiveBackend, /class HiveArcheryPlayerDataBackend implements ArcheryPlayerDataBackend/);
  assert.match(archeryHiveBackend, /archery_player_data_v1/);
  assert.match(miniRoyalePlayerData, /profile:\$profileId:deck-draft:\$slot/);
  assert.ok(
    miniRoyalePlayerData.indexOf('MiniRoyaleDeckDraft.fromJson(data)') <
      miniRoyalePlayerData.indexOf('await _writeUnlocked(profileId, slot, data)'),
    'Mini Royale migration must validate before replacing its stored record',
  );
  assert.match(miniRoyalePlayerData, /_serialize\(_key\(profileId, slot\)/);
  assert.match(miniRoyalePlayerData, /draft\.slot != slot/);
  assert.match(miniRoyalePlatformAdapters, /mini_royale_player_data_v1/);
  assert.match(miniRoyalePlatformAdapters, /battle_animation_cache_settings/);
  assert.match(miniRoyalePlatformAdapters, /http\.Client/);
  assert.match(gamePlayerDataIsolationTest, /isolated game stores/);
  assert.match(gamePlayerDataIsolationTest, /keeps a malformed legacy draft for recovery/);
  assert.match(archeryPlayerDataTest, /delayed schema migration cannot overwrite a concurrent save/);
  assert.match(archeryPlayerDataTest, /delayed schema migration cannot resurrect a concurrent delete/);
  assert.match(miniRoyalePlayerDataTest, /delayed schema migration cannot overwrite a concurrent save/);
  assert.match(miniRoyalePlayerDataTest, /delayed schema migration cannot resurrect a concurrent delete/);
  assert.match(archeryModuleEntrypoint, /archery_player_data\.dart/);
  assert.equal(archeryModuleEntrypoint.includes('archery_game_page.dart'), false);
  assert.match(bundledCatalog, /buildBundledGameCatalog\(gameModuleRegistrations\)/);
  assert.match(bundledCatalog, /registrations\.map\(\(registration\) => registration\.manifest\)/);
  assert.match(archeryRegistration, /archery\.archeryGameManifest\.packageVersion/);
  assert.match(appPubspec, /path: packages\/games\/mini_royale/);
  assert.match(packageModule, /class MiniRoyaleModuleManifest/);
  assert.match(packageModule, /compatibleProtocolRange/);
  assert.match(packageModule, /miniRoyaleGameplayRulesResourceId: 1/);
  assert.match(miniRoyaleGameplayRules, /class MiniRoyaleGameplayRules/);
  assert.match(miniRoyaleGameplayRules, /schemaVersion = 1/);
  assert.match(miniRoyaleGameplayRules, /matchDurationMs/);
  assert.match(miniRoyaleGameplayRules, /towerHitPoints/);
  assert.match(miniRoyaleGameplayRulesSource, /abstract interface class MiniRoyaleGameplayRulesSource/);
  assert.match(miniRoyaleGameplayRulesSource, /sha256\.convert\(bytes\)/);
  assert.match(miniRoyaleGameplayRulesSource, /MiniRoyaleGameplayRules\.fromJson/);
  assert.match(miniRoyaleGameplayRulesSource, /gameContract\['gameplayResources'\]/);
  assert.match(miniRoyaleGameplayRulesSource, /miniRoyaleGameplayContentDigestForResources/);
  assert.match(miniRoyaleGameplayRulesSource, /gameplayContentDigest/);
  assert.match(miniRoyaleGameplayRulesSource, /resourceId\.compareTo/);
  assert.match(miniRoyaleAppGameContract, /miniRoyaleGameplayContentDigestForResources/);
  assert.match(miniRoyaleGameplayRulesAppAdapter, /implements MiniRoyaleGameplayRulesSource/);
  assert.match(miniRoyaleGameplayRulesAppAdapter, /contentStore\.readActiveVersion/);
  assert.match(miniRoyaleGameplayRulesAppAdapter, /contentStore\.readActive\(/);
  assert.doesNotMatch(miniRoyaleGameplayRulesAppAdapter, /sha256|jsonDecode|MiniRoyaleGameplayRules\.fromJson/);
  assert.match(serverGameplayRules, /MINI_ROYALE_GAMEPLAY_RULES_SCHEMA_VERSION = 1/);
  assert.match(serverGameplayRules, /normalizeMiniRoyaleGameplayRules/);
  assert.match(packageModule, /miniRoyaleSupportedPlatforms/);
  assert.match(packageModule, /rulesetId/);
  const inviteHandler = homePage.slice(
    homePage.indexOf('Future<void> _acceptRoomInvite'),
    homePage.indexOf('Future<void> _rejectRoomInvite'),
  );
  assert.match(inviteHandler, /gameModuleRoomInviteHandlers\[invite\.gameId\]/);
  assert.match(inviteHandler, /handler\.accept\(context, invite\)/);
  assert.match(inviteHandler, /pushNamed\('\/game-library'\)/);
  assert.doesNotMatch(homePage, /package:taiwan_brawl_game_mini_royale/);
  assert.doesNotMatch(homePage, /RoyaleService|RoyaleDeck|\.joinRoom\(/);
  assert.ok(inviteModel.includes("gameId: json['gameId'] as String? ?? 'game.mini-royale'"));
  assert.match(inviteRegistry, /registration\.roomInviteHandler/);
  assert.match(inviteRegistry, /buildGameModuleRoomInviteHandlers\(gameModuleRegistrations\)/);
  assert.match(inviteMigration, /ADD COLUMN game_id TEXT NOT NULL DEFAULT 'game\.mini-royale'/);
  assert.match(inviteRepository, /gameId: row\.game_id \?\? 'game\.mini-royale'/);
  assert.match(inviteRepository, /game_id,\s+room_code,\s+inviter_user_id/);
  assert.match(friendsRemoteSource, /required String gameId/);
  assert.match(friendsRemoteSource, /\/api\/games\/\$moduleSlug\/v1\/rooms/);
  assert.match(gameApiPaths, /resolveGameApiPath/);
  assert.match(gameApiPaths, /gameId: owner\.gameId/);
  assert.match(miniRoyaleInviteHandler, /accepted\.gameId != gameId \|\| invite\.gameId != gameId/);
  assert.match(miniRoyaleInviteHandler, /isModuleEnabled\(moduleId\)/);
  assert.ok(miniRoyaleInviteHandler.indexOf('isModuleEnabled(moduleId)') < miniRoyaleInviteHandler.indexOf('friends.acceptRoomInvite(invite.id)'));
  assert.ok(miniRoyaleInviteHandler.indexOf('isModuleEnabled(moduleId)') < miniRoyaleInviteHandler.indexOf('joinRoom('));
  assert.ok(miniRoyaleInviteHandler.includes("pushNamed('/game-library')"));
  assert.match(miniRoyaleInviteHandler, /fetchDeckSummaries/);
  assert.match(miniRoyaleInviteHandler, /miniRoyaleArenaHostScope/);
  assert.match(miniRoyaleInviteHandler, /MiniRoyaleArenaPage\([\s\S]*roomCode: room\.code/);
  assert.match(arenaPage, /class MiniRoyaleArenaPage extends StatefulWidget/);
  for (const appService of ['ApiException', 'AppConstants', 'LocaleProvider', 'AuthService', 'FriendsService', 'GameResourceLibraryService', 'RoyaleService']) {
    assert.equal(new RegExp(`\\b${appService}\\b`).test(arenaPage), false, `game-owned arena depends on App type ${appService}`);
  }
  assert.match(miniRoyaleDropTarget, /class MiniRoyaleBattlefieldDropTarget<T extends Object>/);
  assert.match(miniRoyaleDropTarget, /final bool Function\(T payload\) canAccept/);
  assert.match(miniRoyaleDropTarget, /class MiniRoyaleCardDragPayload/);
  assert.match(miniRoyaleBattleSelection, /class MiniRoyaleBattleSelection/);
  assert.match(miniRoyaleBattleSelection, /MiniRoyaleSelectionOutcome\.maximumReached/);
  assert.match(miniRoyaleBattleSelection, /static MiniRoyaleCardCosts costs/);
  assert.match(miniRoyaleBattleSelection, /static MiniRoyaleComboError\? validateCombo/);
  assert.match(miniRoyaleBattleSelection, /static bool isJobOnlyCombo/);
  assert.match(miniRoyaleBattleSelection, /static MiniRoyalePlayCommandResult preparePlay/);
  assert.match(arenaPage, /MiniRoyaleBattleSelection\.preparePlay\(/);
  assert.match(miniRoyaleBattleSelection, /static bool canAffordCards/);
  assert.match(miniRoyaleBattleSelection, /static MiniRoyaleCardDragPayload dragPayload/);
  assert.match(miniRoyaleBattleSelection, /class MiniRoyaleBattleSelectionState/);
  assert.match(miniRoyaleBattleSelection, /void reconcileWithHand/);
  assert.match(miniRoyaleBattleSelection, /MiniRoyaleBattleSelection\.toggle\(_selectedIds, card\)/);
  assert.match(arenaPage, /_battleSelection\.toggle\(card\)/);
  assert.match(arenaPage, /_battleSelection\.reconcileWithHand\(/);
  assert.match(arenaPage, /final MiniRoyaleBattleSelectionState _battleSelection/);
  assert.doesNotMatch(arenaPage, /final List<String> _selectedCardIds/);
  assert.doesNotMatch(arenaPage, /_selectedCardIds\.removeWhere/);
  assert.match(miniRoyaleRoomCommands, /'type': 'play_combo'/);
  assert.match(miniRoyaleRoomCommands, /'type': 'discard_card'/);
  assert.match(miniRoyaleRoomCommands, /MiniRoyaleRemotePlayCommand/);
  assert.match(miniRoyaleRoomCommands, /MiniRoyaleRemoteDiscardCommand/);
  assert.match(arenaPage, /MiniRoyaleRoomCommandCodec\.encodePlayCombo\(command\)/);
  assert.match(arenaPage, /MiniRoyaleRoomCommandCodec\.encodeDiscardCard\(card\.id\)/);
  assert.match(arenaPage, /MiniRoyaleRoomCommandCodec\.decodeHostCommand\(command\)/);
  assert.doesNotMatch(arenaPage, /'type': 'play_combo'|'type': 'discard_card'/);
  assert.match(miniRoyaleRoomServer, /case 'play_combo':/);
  assert.match(miniRoyaleRoomServer, /case 'discard_card':/);
  assert.match(arenaBattlefieldLayout, /MiniRoyaleBattlefieldDropTarget<MiniRoyaleCardDragPayload>/);
  assert.doesNotMatch(arenaBattlefieldLayout, /return DragTarget<MiniRoyaleCardDragPayload>/);
  assert.doesNotMatch(arenaPage, /class _ComboDragPayload/);
  assert.match(miniRoyalePresentation, /miniRoyaleArenaPresentationSchemaVersion = 1/);
  assert.match(miniRoyalePresentation, /MiniRoyaleArenaPresentationSource/);
  assert.match(miniRoyalePresentationSource, /contentStore\.readActive\(/);
  assert.match(miniRoyalePresentationSource, /miniRoyaleArenaPresentationResourceId/);
  assert.match(homeLayout, /homeEntriesForEnabledModules\(/);
  assert.match(homeLayout, /for \(var index = 0; index < gameEntries\.length; index\+\+\)/);
  assert.match(homeLayout, /for \(final entry in collectionEntries\)/);
  assert.doesNotMatch(homeLayout, /game\.mini-royale|game\.archery|Royale Deck Builder/);
  assert.match(homeEntryRegistry, /gameModuleRegistrations/);
  assert.doesNotMatch(homeEntryRegistry, /moduleId: 'game\.(?:mini-royale|archery)'/);
  assert.match(homeEntryRegistry, /homeEntriesForEnabledModules/);
  const homeEntryTypes = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'game_module_home_entry.dart'),
    'utf8',
  );
  assert.match(homeEntryTypes, /class GameModuleHomeEntry/);
  assert.match(homeEntryTypes, /class GameModuleHomeCollectionEntry/);
  assert.match(archeryRegistration, /moduleId: archery\.archeryGameModuleId/);
  assert.match(miniRoyaleRegistration, /moduleId: mini_royale\.miniRoyaleModuleId/);
  assert.match(packageModule, /miniRoyaleSupportedResourceSchemas/);
  assert.match(backendCatalogTests, /game\.mini-royale\.arena-presentation/);
  assert.match(backendCatalogTests, /kind: 'presentation'/);
  const packageVersion = /const miniRoyalePackageVersion = '([^']+)'/.exec(packageModule)?.[1];
  const protocolVersion = /protocolVersion: (\d+)/.exec(packageModule)?.[1];
  const compatibleProtocolRange = /compatibleProtocolRange: '([^']+)'/.exec(packageModule)?.[1];
  const rulesetId = /rulesetId: '([^']+)'/.exec(packageModule)?.[1];
  const rulesetVersion = /rulesetVersion: (\d+)/.exec(packageModule)?.[1];
  const gameplayContentDigest = /gameplayContentDigest: '([^']+)'/.exec(packageModule)?.[1];
  const defaultRulesetId = /rulesetId: '([^']+)'/.exec(miniRoyaleGameplayRules)?.[1];
  const defaultRulesetVersion = /rulesetVersion: (\d+)/.exec(miniRoyaleGameplayRules)?.[1];
  assert.ok(packageVersion);
  assert.ok(protocolVersion);
  assert.ok(compatibleProtocolRange);
  assert.ok(rulesetId);
  assert.ok(rulesetVersion);
  assert.ok(gameplayContentDigest);
  assert.equal(defaultRulesetId, rulesetId);
  assert.equal(defaultRulesetVersion, rulesetVersion);
  assert.ok(backendGameContract.includes(`moduleVersion: '${packageVersion}'`));
  assert.ok(backendGameContract.includes(`protocolVersion: ${protocolVersion}`));
  assert.ok(backendGameContract.includes(`compatibleProtocolRange: '${compatibleProtocolRange}'`));
  assert.ok(backendGameContract.includes(`rulesetId: '${rulesetId}'`));
  assert.ok(backendGameContract.includes(`rulesetVersion: ${rulesetVersion}`));
  assert.ok(backendGameContract.includes(`gameplayContentDigest: '${gameplayContentDigest}'`));
  assert.ok(serverGameplayRules.includes(`rulesetId: '${rulesetId}'`));
  assert.ok(serverGameplayRules.includes(`rulesetVersion: ${rulesetVersion}`));
  assert.ok(packageModule.includes(`compatibleProtocolRange: '${compatibleProtocolRange}'`));
  assert.match(packageModule, /'moduleVersion': miniRoyaleManifest\.packageVersion/);
  assert.match(packageModule, /'rulesetId': miniRoyaleManifest\.rulesetId/);
  for (const field of ['manifestVersion', 'kind', 'publisher', 'hostApiRange', 'dependencies']) {
    assert.ok(packageModule.includes(`'${field}'`), `game package must publish ${field}`);
    assert.ok(backendCatalogValidator.includes(`module.${field}`), `backend must validate ${field}`);
  }
  assert.match(resourceCatalogSource, /canonicalSignedMessage/);
  assert.match(resourceCatalogSource, /expiresAt\.isAfter\(now\)/);
  assert.match(resourceCatalogSource, /Game catalog publisher signature is invalid/);
  assert.match(backendCatalogValidator, /Unsigned game catalog/);
  assert.match(packageModule, /'manifestVersion': miniRoyaleManifestVersion/);
  assert.match(packageModule, /'hostApiRange': miniRoyaleHostApiRange/);
  assert.match(miniRoyaleRegistration, /GameMultiplayerManifest\(/);
  assert.match(gameLibraryController, /multiplayer: bundled\.multiplayer/);
  assert.match(gameLibraryController, /retainedLocalResources/);
  assert.match(gameLibraryController, /'downloadUrl': null/);
  assert.match(gameLibraryController, /'version': entry\.value!\.version/);
  assert.match(gameLibraryController, /dependency\.acceptsVersion\(installed!\.version\)/);
  assert.match(gameResourceInstaller, /readActiveVersion\(/);
  assert.match(gameResourceInstaller, /sha256\.convert\(activeBytes\)/);
  assert.equal(packageModule.includes('package:taiwan_brawl/'), false);
  for (const file of miniRoyalePackageFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /package:(?:hive_flutter|http)\//, `${file} must not own host platform adapters`);
  }
  assert.match(miniRoyalePlatformAdapters, /implements mini_royale\.MiniRoyalePlayerDataBackend/);
  assert.match(miniRoyalePlatformAdapters, /implements mini_royale\.BattleAnimationCacheStore/);
  assert.match(miniRoyalePlatformAdapters, /implements mini_royale\.BattleAnimationRemoteSource/);
  assert.match(packageRules, /bool isLegalDeployPoint/);
  assert.equal(packageRules.includes("import '../services/"), false);
  assert.match(packageModels, /class RoyaleCard/);
  assert.equal(packageModels.includes('package:taiwan_brawl/'), false);
  assert.match(packageService, /class MiniRoyaleService/);
  assert.equal(packageService.includes('package:taiwan_brawl/'), false);
  assert.match(packageDeckPage, /class RoyaleDeckPage/);
  assert.equal(packageDeckPage.includes('package:taiwan_brawl/'), false);
  assert.equal(packageDeckPage.includes('ApiClient'), false);
  assert.match(packageLobbyPage, /class MiniRoyaleLobbyPage/);
  assert.equal(packageLobbyPage.includes('package:taiwan_brawl/'), false);
  assert.match(packageRoomLobby, /class MiniRoyaleRoomLobby/);
  assert.match(packageRoomLobby, /final ValueChanged<RoyalePlayerView> onAddFriend/);
  assert.match(arenaRoomLayout, /MiniRoyaleRoomLobby\(/);
  assert.doesNotMatch(arenaRoomLayout, /class _StatusPill|class _SideBadge/);
  assert.equal(packageLobbyPage.includes('AuthService'), false);
  assert.equal(packageLobbyPage.includes('ApiClient'), false);
  assert.match(hostLobbyAdapter, /MiniRoyaleLobbyPage/);
  assert.match(hostLobbyAdapter, /onOpenRoom:/);
  assert.match(packageBattleEngine, /class HostBattleEngine/);
  assert.equal(packageBattleEngine.includes('package:taiwan_brawl/'), false);
  assert.equal(packageBattleEngine.includes("import 'royale_service.dart'"), false);
  assert.match(packageAnimationCache, /class BattleAnimationCacheService/);
  assert.equal(packageAnimationCache.includes('package:taiwan_brawl/'), false);
  await assert.rejects(
    readFile(join(frontendRoot, 'lib', 'services', 'battle_animation_cache_service.dart')),
    { code: 'ENOENT' },
  );
  assert.match(arenaPage, /package:taiwan_brawl_game_mini_royale/);
  assert.match(arenaPainter, /class MiniRoyaleArenaPainter extends CustomPainter/);
  assert.match(arenaCanvas, /class MiniRoyaleBattlefieldCanvas extends StatelessWidget/);
  assert.match(arenaCanvas, /MiniRoyaleArenaPainter\(/);
  assert.match(arenaCanvas, /GestureDetector\(/);
  assert.equal(arenaCanvas.includes('package:taiwan_brawl/'), false);
  assert.match(animatedUnitPortrait, /class MiniRoyaleAnimatedUnitPortrait extends StatefulWidget/);
  assert.match(animatedUnitPortrait, /BattleAnimationCacheService/);
  assert.equal(animatedUnitPortrait.includes('package:taiwan_brawl/'), false);
  assert.match(battleResultOverlay, /class MiniRoyaleBattleResultOverlay extends StatelessWidget/);
  assert.match(battleResultOverlay, /onPlayAgain/);
  assert.equal(battleResultOverlay.includes('RoyaleService'), false);
  assert.match(battlefieldHeader, /class MiniRoyaleBattlefieldHeader extends StatelessWidget/);
  assert.match(battlefieldHeader, /releaseToCastSelectionHere/);
  assert.match(battlefieldHeader, /onToggleCollisionRadius/);
  assert.match(battlefieldUnits, /class MiniRoyaleBattlefieldUnits extends StatelessWidget/);
  assert.match(battlefieldUnits, /attack-range:/);
  assert.match(battlefieldUnits, /collision-radius:/);
  assert.match(arenaPreview, /class MiniRoyaleArenaPreview extends StatelessWidget/);
  assert.equal(arenaPreview.includes('package:taiwan_brawl/'), false);
  assert.match(arenaOverlays, /class MiniRoyaleAimMarker extends StatelessWidget/);
  assert.match(arenaOverlays, /class MiniRoyaleFieldLabel extends StatelessWidget/);
  assert.equal(arenaOverlays.includes('package:taiwan_brawl/'), false);
  assert.match(arenaTargeting, /miniRoyaleTowerPosition/);
  assert.match(arenaTargeting, /miniRoyaleSelectedTowerThreatReach/);
  assert.match(arenaTargeting, /double miniRoyaleLanePosition/);
  assert.match(arenaTargeting, /miniRoyaleNormalizeBoardPoint/);
  assert.match(arenaTargeting, /miniRoyaleIsLegalDeployPoint/);
  assert.equal(arenaTargeting.includes('package:taiwan_brawl/'), false);
  assert.match(arenaRoomLayout, /MiniRoyaleArenaPreview\(/);
  assert.match(arenaRoomLayout, /MiniRoyaleImmersiveBattleLayout\(/);
  assert.match(miniRoyaleImmersiveLayout, /maxWidth >= 900/);
  assert.match(miniRoyaleImmersiveLayout, /class MiniRoyaleImmersiveBattleMetrics/);
  assert.doesNotMatch(arenaRoomLayout, /maxWidth >= 900/);
  assert.match(miniRoyaleHandWidgets, /class MiniRoyaleHandCard extends StatelessWidget/);
  assert.match(miniRoyaleHandWidgets, /class MiniRoyaleDiscardDropZone/);
  assert.match(miniRoyaleHandWidgets, /class MiniRoyaleHandCardContent/);
  assert.match(miniRoyaleHandWidgets, /String miniRoyaleCardEnergyType/);
  assert.equal(miniRoyaleHandWidgets.includes('package:taiwan_brawl/'), false);
  assert.match(arenaRoomLayout, /MiniRoyaleHandCard\(/);
  assert.match(arenaRoomLayout, /MiniRoyaleDiscardDropZone<MiniRoyaleCardDragPayload>/);
  assert.doesNotMatch(arenaPage, /String _cardStats\(|String _cardTypeLabel\(|String _jobProfileLabel\(/);
  assert.equal(arenaPage.includes('class _ArenaPainter'), false);
  assert.match(arenaBattlefieldLayout, /MiniRoyaleBattlefieldCanvas\(/);
  assert.match(arenaBattlefieldLayout, /MiniRoyaleBattleResultOverlay\(/);
  assert.match(arenaBattlefieldLayout, /MiniRoyaleBattlefieldHeader\(/);
  assert.match(arenaBattlefieldLayout, /MiniRoyaleBattlefieldUnits\(/);
  assert.doesNotMatch(arenaBattlefieldLayout, /_buildBattlefieldUnits/);
  assert.match(arenaBattlefieldLayout, /onTapDown:/);
  assert.match(arenaBattlefieldLayout, /buildOverlays:/);
  assert.doesNotMatch(arenaBattlefieldLayout, /MiniRoyaleArenaPainter\(/);
  assert.doesNotMatch(arenaBattlefieldLayout, /MiniRoyaleFieldLabel\(/);
  assert.match(arenaBattlefieldLayout, /miniRoyaleTowerPosition\(/);
  assert.match(arenaBattlefieldLayout, /miniRoyaleSelectedTowerThreatReach\(/);
  assert.match(miniRoyaleBattleSelection, /miniRoyaleLanePosition\(/);
  assert.match(arenaPage, /miniRoyaleNormalizeBoardPoint\(/);
  assert.match(arenaPage, /miniRoyaleIsLegalDeployPoint\(/);
  assert.doesNotMatch(arenaPage, /mySide == 'left' \? 1 - dropY : dropY/);
  await assert.rejects(
    readFile(join(frontendRoot, 'lib', 'services', 'host_battle_engine.dart')),
    { code: 'ENOENT' },
  );
  assert.match(hostService, /extends MiniRoyaleService/);
  await assert.rejects(readFile(oldHostModelPath), { code: 'ENOENT' });
  assert.match(remoteSource, /\/api\/games\/mini-royale\/v1\//);
  const frontendGameApiResources = [
    ...remoteSource.matchAll(/\/api\/games\/mini-royale\/v1\/([^/$'"`]+)/g),
  ].map((match) => match[1].split('?')[0]);
  const backendGameApiResourceBlock =
    /resources:\s*new Set\(\[([^\]]+)\]\)/.exec(gameApiPaths)?.[1] ?? '';
  const backendGameApiResources = new Set(
    [...backendGameApiResourceBlock.matchAll(/'([a-z-]+)'/g)].map(
      (match) => match[1],
    ),
  );
  assert.ok(frontendGameApiResources.length > 0);
  for (const resource of frontendGameApiResources) {
    assert.ok(
      backendGameApiResources.has(resource),
      `Mini Royale client uses unregistered Worker API resource: ${resource}`,
    );
  }
  assert.match(gamePathMapper, /mapMiniRoyaleApiPath/);
  assert.match(gameDataApi, /export function exactMiniRoyaleDataApiRouteHandler/);
  assert.match(gameRoomApi, /export function exactMiniRoyaleRoomApiRouteHandler/);
  assert.match(gameRoomApi, /export async function handleDynamicMiniRoyaleRoomRoutes/);
  assert.match(genericRoomsApi, /exactMiniRoyaleDataApiRouteHandler/);
  assert.match(genericRoomsApi, /handleDynamicMiniRoyaleRoomRoutes/);
  assert.doesNotMatch(genericRoomsApi, /async function handleListCards/);
  assert.doesNotMatch(genericRoomsApi, /async function handleCreateRoom/);
  assert.match(
    admission,
    /isCompatibleRoyaleClient\(payload\.gameContract,\s*requiredContract\)/,
  );
  assert.match(admission, /resolveMiniRoyaleGameplayRules\(clientContract, this\.env\)/);
  assert.match(admission, /isCompatibleRoyaleProtocol\(clientContract, ROYALE_GAME_CONTRACT\)/);
  assert.match(backendGameContract, /compatibleProtocolRange/);
  assert.match(
    backendGameContract,
    /normalizeGameplayResources\(candidate\.gameplayResources\)/,
  );
  assert.match(backendGameContract, /gameplayResources == null/);
  assert.match(admission, /gameContract,\s*requiredContract/);
});

test('production composition root wires durable messaging restore and cursor storage', async () => {
  const mainPath = join(
    workspaceRoot,
    '..',
    'taiwan_brawl_front',
    'lib',
    'main.dart',
  );
  const source = await readFile(mainPath, 'utf8');
  const gameRouteRegistry = await readFile(
    join(workspaceRoot, '..', 'taiwan_brawl_front', 'lib', 'game_modules', 'game_module_routes.dart'),
    'utf8',
  );
  const archeryRoutes = await readFile(
    join(workspaceRoot, '..', 'taiwan_brawl_front', 'lib', 'game_modules', 'archery_game_routes.dart'),
    'utf8',
  );
  const miniRoyaleRoutes = await readFile(
    join(workspaceRoot, '..', 'taiwan_brawl_front', 'lib', 'game_modules', 'mini_royale_game_routes.dart'),
    'utf8',
  );
  const routeGuardWidgetTest = await readFile(
    join(workspaceRoot, '..', 'taiwan_brawl_front', 'test', 'game_module_routes_test.dart'),
    'utf8',
  );
  const bootstrapSource = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_front',
      'lib',
      'services',
      'messaging_runtime_bootstrap.dart',
    ),
    'utf8',
  );
  for (const token of [
    'await HiveStorageRuntime().initialize()',
    'final credentials = PlatformCredentialStore()',
    'syncCursorStoreFactory:',
    'manualTransportFactory: messagingTransportFactory.createP2P',
    'restoreMessagingRuntime(credentials)',
    'final notificationRemoteSource = ServerNotificationRemoteSource(apiClient)',
    'final pendingNotificationSource = ServerPendingNotificationSource(apiClient)',
    'remoteSource: notificationRemoteSource',
    'pendingNotificationSource: pendingNotificationSource',
    'final adminRemoteSource = ServerAdminRemoteSource(apiClient)',
    'final authRemoteSource = ServerAuthRemoteSource(apiClient)',
    'final friendsRemoteSource = ServerFriendsRemoteSource(apiClient)',
    'final llmBotRemoteSource = ServerLlmBotRemoteSource(apiClient)',
    'final royaleRemoteSource = ServerRoyaleRemoteSource(apiClient)',
    'remoteSource: adminRemoteSource',
    'remoteSource: authRemoteSource',
    'remoteSource: friendsRemoteSource',
    'remoteSource: llmBotRemoteSource',
    'remoteSource: royaleRemoteSource',
    'mini_royale.BattleAnimationCacheService(',
    'store: HiveBattleAnimationCacheStore()',
    'remoteSource: HttpBattleAnimationRemoteSource()',
  ]) {
    assert.ok(source.includes(token), `missing durable messaging wiring: ${token}`);
  }
  assert.match(source, /\.\.\.gameModuleRoutes/);
  assert.doesNotMatch(source, /'\/(?:archery|royale-deck|royale-lobby)'\s*:/);
  assert.match(gameRouteRegistry, /buildGameModuleRoutes\(/);
  assert.match(gameRouteRegistry, /gameModuleRegistrations\.map/);
  assert.match(gameRouteRegistry, /Duplicate game module route/);
  assert.doesNotMatch(source, /MiniRoyalePlayerDataRepository/);
  assert.match(miniRoyaleRoutes, /Provider<mini_royale\.MiniRoyalePlayerDataRepository>/);
  assert.match(miniRoyaleRoutes, /HiveMiniRoyalePlayerDataBackend/);
  for (const [gameId, routes] of [
    ['game.archery', archeryRoutes],
    ['game.mini-royale', miniRoyaleRoutes],
  ]) {
    assert.ok(routes.includes(gameId), `${gameId} must gate its own routes`);
    assert.match(routes, /isModuleEnabled/);
    assert.match(routes, /DeferredGameModulePage/);
  }
  assert.match(routeGuardWidgetTest, /disabled game routes return the Game Library/);
  assert.match(routeGuardWidgetTest, /disabled Mini Royale route returns the Game Library/);
  for (const token of [
    'SecureMessagingKeyProvider(credentials: credentials)',
    'HiveMessageEventStore(encryptionKey: key)',
    'MessagingCoreService.restore(',
    'MessagingStorageStatus.degraded(error)',
  ]) {
    assert.ok(
      bootstrapSource.includes(token),
      `missing durable messaging bootstrap wiring: ${token}`,
    );
  }
});

test('advertising identifiers stay in shared runtime configuration', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const configuration = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_core',
      'lib',
      'src',
      'app_configuration.dart',
    ),
    'utf8',
  );
  for (const token of [
    'ANDROID_BANNER_AD_UNIT_ID',
    'IOS_BANNER_AD_UNIT_ID',
    'ANDROID_INTERSTITIAL_AD_UNIT_ID',
    'IOS_INTERSTITIAL_AD_UNIT_ID',
  ]) {
    assert.ok(configuration.includes(token), `missing ad configuration: ${token}`);
  }
  for (const relativePath of [
    'lib/widgets/ad_banner_widget.dart',
    'lib/services/ad_service.dart',
  ]) {
    const source = await readFile(join(frontendRoot, relativePath), 'utf8');
    assert.equal(
      source.includes('ca-app-pub-'),
      false,
      `feature code embeds an advertising identifier: ${relativePath}`,
    );
  }
});

test('frontend profile parsing does not duplicate LLM deployment defaults', async () => {
  const appUserSource = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_front',
      'lib',
      'models',
      'app_user.dart',
    ),
    'utf8',
  );
  assert.equal(appUserSource.includes('https://api.openai.com/v1'), false);
  assert.equal(appUserSource.includes("'gpt-4o-mini'"), false);
  assert.match(appUserSource, /defaultLlmBaseUrl/);
  assert.match(appUserSource, /defaultLlmModel/);
});

test('profile image resolution accepts the composition-root API origin', async () => {
  const resolver = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_front',
      'lib',
      'utils',
      'remote_image_url.dart',
    ),
    'utf8',
  );
  assert.match(resolver, /apiBaseUrl/);
  assert.match(resolver, /AppConfiguration\.environment\.apiBaseUrl/);
  assert.equal(resolver.includes('AppConstants.apiBaseUrl'), false);
});

test('friends profile parsing can use the injected API origin', async () => {
  const friendsService = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_front',
      'lib',
      'services',
      'friends_service.dart',
    ),
    'utf8',
  );
  const friendsModels = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_front',
      'lib',
      'models',
      'friends_models.dart',
    ),
    'utf8',
  );
  assert.match(friendsService, /AppConfiguration\? configuration/);
  assert.match(friendsService, /apiBaseUrl/);
  assert.match(friendsModels, /apiBaseUrl/);
});

test('Royale image-bearing models propagate the injected API origin', async () => {
  const royaleService = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_front',
      'lib',
      'services',
      'royale_service.dart',
    ),
    'utf8',
  );
  const royaleModels = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_front',
      'packages',
      'games',
      'mini_royale',
      'lib',
      'src',
      'royale_models.dart',
    ),
    'utf8',
  );
  assert.match(royaleService, /AppConfiguration\? configuration/);
  assert.match(royaleService, /apiBaseUrl/);
  assert.match(royaleModels, /RoyaleCharacterAsset\.fromJson/);
  assert.match(royaleModels, /apiBaseUrl: apiBaseUrl/);
});

test('shared packages remain platform-neutral and expose public entrypoints', async () => {
  const sharedRoots = [
    join(workspaceRoot, '..', 'taiwan_brawl_core'),
    join(workspaceRoot, '..', 'taiwan_brawl_messaging'),
  ];
  const forbiddenImports = [
    'package:flutter/',
    'package:hive',
    'package:http/',
    'package:firebase_',
    'cloudflare',
  ];
  for (const root of sharedRoots) {
    const libRoot = join(root, 'lib');
    const files = await dartFilesUnder(libRoot);
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const token of forbiddenImports) {
        assert.equal(
          source.includes(token),
          false,
          `shared package imports platform dependency: ${file}: ${token}`,
        );
      }
    }
    const manifest = await readFile(join(root, 'pubspec.yaml'), 'utf8');
    assert.equal(
      /^dependencies:/m.test(manifest),
      false,
      `shared package has runtime dependencies: ${root}`,
    );
    const entrypoint = await readFile(
      join(libRoot, `${root.split('/').pop()}.dart`),
      'utf8',
    );
    assert.match(entrypoint, /^library /m);
  }
});

test('frontend owns a standalone web build entrypoint', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const buildScript = await readFile(join(frontendRoot, 'tool', 'build_web.sh'), 'utf8');
  assert.match(buildScript, /flutter_args=\(build web --release\)/);
  assert.match(buildScript, /--dart-define=/);
  assert.match(buildScript, /API_BASE_URL/);
  assert.match(buildScript, /DEFAULT_LLM_MODEL/);
  assert.equal(buildScript.includes('wrangler'), false);
});
