import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const frontendRoot = join(import.meta.dirname, '..', '..', 'taiwan_brawl_front');

test('Mini Royale arena consumes package contracts through host adapters', async () => {
  const [port, arena, layout, battlefield, adapter, localization, localizationAdapter, route, hostScope, lobby, remoteSource] = await Promise.all([
    readFile(join(frontendRoot, 'packages/games/mini_royale/lib/src/arena_social_port.dart'), 'utf8'),
    readFile(join(frontendRoot, 'packages/games/mini_royale/lib/src/mini_royale_arena_page.dart'), 'utf8'),
    readFile(join(frontendRoot, 'packages/games/mini_royale/lib/src/arena_page_room_layout.dart'), 'utf8'),
    readFile(join(frontendRoot, 'packages/games/mini_royale/lib/src/arena_page_battlefield_layout.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib/game_modules/mini_royale/arena_social_adapter.dart'), 'utf8'),
    readFile(join(frontendRoot, 'packages/games/mini_royale/lib/src/arena_localization_port.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib/game_modules/mini_royale/arena_localization_adapter.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib/game_modules/mini_royale/room_invite_handler.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib/game_modules/mini_royale/arena_host_scope.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib/pages/game/royale_lobby_page.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib/services/royale_remote_source.dart'), 'utf8'),
  ]);

  assert.match(port, /abstract class MiniRoyaleArenaSocialPort/);
  assert.match(port, /class MiniRoyaleArenaFriend/);
  assert.match(localization, /abstract class MiniRoyaleLocalizationPort/);
  assert.match(arena, /class MiniRoyaleArenaPage extends StatefulWidget/);
  assert.match(arena, /context\.read<MiniRoyaleArenaSocialPort>/);
  assert.match(arena, /context\.watch<MiniRoyaleArenaSocialPort>/);
  assert.match(arena, /context\.read<MiniRoyaleService>/);
  assert.match(arena, /MiniRoyaleRoomConnection\? _channel/);
  assert.match(arena, /context\.read<MiniRoyaleArenaPresentationSource>/);
  assert.match(arena, /context\.read<MiniRoyaleGameplayRulesSource>/);
  assert.match(arena, /MiniRoyaleLocalizationPort/);
  assert.match(battlefield, /MiniRoyaleLocalizationPort/);
  assert.equal(arena.includes('context.read<RoyaleService>'), false);
  assert.equal(arena.includes("services/royale_service.dart"), false);
  assert.equal(arena.includes('RoyaleRoomChannel'), false);
  assert.equal(arena.includes('GameResourceLibraryService'), false);
  assert.equal(arena.includes('GameResourceMiniRoyale'), false);
  assert.equal(arena.includes('LocaleProvider'), false);
  assert.equal(arena.includes('ApiException'), false);
  assert.equal(arena.includes('AppConstants'), false);
  assert.equal(arena.includes("'/home'"), false);
  assert.equal(battlefield.includes('LocaleProvider'), false);
  assert.match(layout, /MiniRoyaleArenaFriend/);
  for (const forbidden of [
    'FriendsService', 'FriendsOverviewSyncService', 'FriendsOverview', 'SocialUser', 'AuthService',
  ]) {
    assert.equal(arena.includes(forbidden), false, `arena imports host type ${forbidden}`);
    assert.equal(layout.includes(forbidden), false, `arena layout imports host type ${forbidden}`);
    assert.equal(port.includes(forbidden), false, `package port imports host type ${forbidden}`);
  }
  assert.match(adapter, /extends MiniRoyaleArenaSocialPort/);
  assert.match(adapter, /showFriendSearchDialog/);
  assert.match(localizationAdapter, /extends MiniRoyaleLocalizationPort/);
  assert.match(localizationAdapter, /_localeProvider\.addListener/);
  assert.match(hostScope, /ChangeNotifierProvider<MiniRoyaleArenaSocialPort>/);
  assert.match(hostScope, /ChangeNotifierProvider<MiniRoyaleLocalizationPort>/);
  assert.match(hostScope, /Provider<MiniRoyaleService>\.value/);
  assert.match(hostScope, /Provider<MiniRoyaleArenaPresentationSource>\.value/);
  assert.match(hostScope, /Provider<MiniRoyaleGameplayRulesSource>\.value/);
  assert.match(route, /miniRoyaleArenaHostScope/);
  assert.match(lobby, /miniRoyaleArenaHostScope/);
  assert.match(route, /mini_royale_arena_page\.dart'[\s\S]*deferred/);
  assert.match(lobby, /mini_royale_arena_page\.dart'[\s\S]*deferred/);
  assert.match(remoteSource, /MiniRoyaleServiceException/);
});
