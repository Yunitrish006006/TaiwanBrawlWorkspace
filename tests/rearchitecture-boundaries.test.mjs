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

function namedContractBlock(source, declaration) {
  const block = new RegExp(`${declaration}\\s*\\((\\{[\\s\\S]*?\\})\\);`).exec(source)?.[1];
  assert.ok(block, `expected ${declaration} contract block`);
  return block;
}

function contractField(block, field) {
  const match = new RegExp(`\\b${field}:\\s*(?:'([^']*)'|(\\d+))`).exec(block);
  assert.ok(match, `expected ${field} in game contract`);
  return match[1] ?? Number(match[2]);
}

test('Mini Royale frontend and backend publish the same room compatibility contract', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const backendRoot = join(workspaceRoot, '..', 'taiwan_brawl_back');
  const [frontendModule, backendContractSource] = await Promise.all([
    readFile(
      join(frontendRoot, 'packages', 'games', 'mini_royale', 'lib', 'src', 'mini_royale_module.dart'),
      'utf8',
    ),
    readFile(join(backendRoot, 'src', 'royale', 'royale_compatibility.js'), 'utf8'),
  ]);
  const frontendId = /const miniRoyaleModuleId = '([^']+)';/.exec(frontendModule)?.[1];
  assert.ok(frontendId, 'frontend game module must declare its stable ID');
  const manifestBlock = /const miniRoyaleManifest = MiniRoyaleModuleManifest\(([\s\S]*?)\n\);/.exec(frontendModule)?.[1];
  assert.ok(manifestBlock, 'frontend game must declare a compatibility manifest');
  const backendBlock = namedContractBlock(
    backendContractSource,
    'export const ROYALE_GAME_CONTRACT = Object\.freeze',
  );

  const frontendContract = {
    gameId: frontendId,
    protocolVersion: contractField(manifestBlock, 'protocolVersion'),
    compatibleProtocolRange: contractField(manifestBlock, 'compatibleProtocolRange'),
    rulesetId: contractField(manifestBlock, 'rulesetId'),
    rulesetVersion: contractField(manifestBlock, 'rulesetVersion'),
    gameplayContentDigest: contractField(manifestBlock, 'gameplayContentDigest'),
  };
  const backendContract = Object.fromEntries(
    Object.keys(frontendContract).map((field) => [field, contractField(backendBlock, field)]),
  );
  assert.deepEqual(frontendContract, backendContract);
  assert.match(frontendModule, /'gameplayResources': const <Object>\[\]/);
  assert.match(backendBlock, /gameplayResources:\s*Object\.freeze\(\[\]\)/);
});

test('downloadable game resources require explicit payload schema versions', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const backendRoot = join(workspaceRoot, '..', 'taiwan_brawl_back');
  const [frontendManifest, backendCatalog, resourceSigner, releasePackager] = await Promise.all([
    readFile(join(frontendRoot, 'lib', 'game_modules', 'game_module_manifest.dart'), 'utf8'),
    readFile(join(backendRoot, 'src', 'api', 'game_resources_api.js'), 'utf8'),
    readFile(join(backendRoot, 'scripts', 'sign-game-resource.mjs'), 'utf8'),
    readFile(join(backendRoot, 'scripts', 'package-game-release.mjs'), 'utf8'),
  ]);

  assert.match(frontendManifest, /Downloadable resource \$resourceId must declare a payload schema version/);
  assert.match(backendCatalog, /Downloadable resource must declare a payload schema version/);
  assert.match(resourceSigner, /!Number\.isSafeInteger\(payloadSchemaVersion\) \|\| payloadSchemaVersion < 1/);
  assert.match(releasePackager, /!Number\.isSafeInteger\(resource\.payloadSchemaVersion\)/);
});

test('signed game catalogs require explicit module and resource platform scopes', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const backendRoot = join(workspaceRoot, '..', 'taiwan_brawl_back');
  const [frontendCatalog, backendCatalog, catalogSigner, releasePackager] = await Promise.all([
    readFile(join(frontendRoot, 'lib', 'services', 'game_resource_catalog_source.dart'), 'utf8'),
    readFile(join(backendRoot, 'src', 'api', 'game_resources_api.js'), 'utf8'),
    readFile(join(backendRoot, 'scripts', 'sign-game-catalog.mjs'), 'utf8'),
    readFile(join(backendRoot, 'scripts', 'package-game-release.mjs'), 'utf8'),
  ]);

  assert.match(frontendCatalog, /Catalog module must declare supported platforms/);
  assert.match(frontendCatalog, /Catalog resource must declare supported platforms/);
  assert.match(backendCatalog, /Module must declare supported platforms/);
  assert.match(backendCatalog, /Resource must declare supported platforms/);
  assert.match(catalogSigner, /validatePublishedGameResourceCatalog\(envelope\)/);
  assert.match(releasePackager, /validatePublishedGameResourceCatalog\(catalogEnvelope\)/);
});

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

test('notification service receives provider-neutral push behavior from composition roots', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const service = await readFile(
    join(frontendRoot, 'lib', 'services', 'notification_service.dart'),
    'utf8',
  );
  const adapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'push_provider.dart'),
    'utf8',
  );
  const productionRoot = await readFile(
    join(frontendRoot, 'lib', 'main.dart'),
    'utf8',
  );
  const previewRoot = await readFile(
    join(frontendRoot, 'lib', 'services', 'preview_runtime.dart'),
    'utf8',
  );
  const previewAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'preview_push_provider.dart'),
    'utf8',
  );

  assert.match(service, /required NotificationPushProvider pushProvider/);
  assert.match(service, /required MessagingCoreService messagingCore/);
  assert.match(service, /required EventAuthenticator\? remoteAuthenticator/);
  assert.match(service, /_pendingNotificationSource\.eventFromPendingRow/);
  assert.match(service, /final accepted = await _messagingCore\.acceptRemote/);
  assert.match(
    service,
    /if \(!accepted\)\s*\{\s*if \(_messagingCore\.canDurablyRecordConflicts && pendingId != null\)\s*\{\s*ackIds\.add\(pendingId\);\s*\}\s*return ackIds;\s*\}/,
    'rejected pending events may be acknowledged only after durable conflict storage',
  );
  assert.match(service, /canDurablyRecordConflicts/);
  assert.match(
    service,
    /if \(event\.type != MessageEventType\.created\)\s*\{\s*if \(_messagingCore\.storageStatus\.isDurable && pendingId != null\)\s*\{\s*ackIds\.add\(pendingId\);\s*\}\s*return ackIds;\s*\}/,
    'accepted non-created events may be acknowledged only after durable ingestion',
  );
  assert.match(
    service,
    /if \(hasEnvelope\)\s*\{\s*if \(_messagingCore\.storageStatus\.isDurable && pendingId != null\)\s*\{\s*ackIds\.add\(pendingId\);\s*\}\s*_setPendingConversation\(senderId\);\s*return ackIds;\s*\}/,
    'event-envelope rows must remain pending when shared storage is in memory',
  );
  assert.doesNotMatch(service, /MessageRepository\?/);
  assert.doesNotMatch(service, /ServerMessageTransport/);
  assert.doesNotMatch(service, /_messagingCore\?/);
  assert.match(service, /required LegacyPendingMessageAdapter legacyPendingMessages/);
  assert.doesNotMatch(service, /LegacyChatStore|LegacyChatRemoteSource/);
  assert.match(service, /required CredentialStore credentials/);
  assert.match(service, /required LegacyInstallationStore legacyInstallationStore/);
  assert.match(service, /required PendingNotificationSource pendingNotificationSource/);
  assert.match(service, /required NotificationRemoteSource remoteSource/);
  assert.match(service, /_pushProvider\.parseConfiguration/);
  assert.match(service, /_pushProvider\.providerId/);
  assert.doesNotMatch(
    service,
    /firebase_core|Firebase|FCM|\bfcm\b|ApiClient|LocalChatRepository|PlatformCredentialStore|HiveLegacyInstallationStore|ServerNotificationRemoteSource|ServerPendingNotificationSource/i,
    'notification application logic must not create platform or HTTP adapters',
  );
  assert.match(adapter, /FirebasePushProviderOptions\.fromJson/);
  assert.match(productionRoot, /pushProvider:\s*FirebasePushProvider\(\)/);
  assert.match(previewRoot, /pushProvider:\s*PreviewPushProvider\(\)/);
  assert.match(productionRoot, /LegacyPendingMessageAdapter\(\s*localRepository: legacyChatStore/s);
  assert.match(previewRoot, /LegacyPendingMessageAdapter\(\s*localRepository: legacyChatStore/s);
  assert.match(previewAdapter, /class PreviewPushProvider implements NotificationPushProvider/);
});

test('notification service delegates legacy pending rows to a migration adapter', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const service = await readFile(
    join(frontendRoot, 'lib', 'services', 'notification_service.dart'),
    'utf8',
  );
  const adapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_pending_message_adapter.dart'),
    'utf8',
  );
  const store = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_store.dart'),
    'utf8',
  );
  const repository = await readFile(
    join(frontendRoot, 'lib', 'services', 'local_chat_repository.dart'),
    'utf8',
  );
  const syncAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'message_chat_sync_adapter.dart'),
    'utf8',
  );
  const remoteSource = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_remote_source.dart'),
    'utf8',
  );
  const historyAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_history_adapter.dart'),
    'utf8',
  );
  assert.match(service, /required LegacyPendingMessageAdapter legacyPendingMessages/);
  assert.match(service, /_legacyPendingMessages\.apply\(/);
  assert.doesNotMatch(service, /ChatMessage\.fromJson|_localRepository\.(saveMessage|markRecalled)/);
  assert.match(adapter, /LegacyChatRecord\.fromLegacyServerJson/);
  assert.match(adapter, /_localRepository\.saveMessage/);
  assert.match(adapter, /_localRepository\.markRecalled/);
  assert.match(store, /LegacyChatRecord/);
  assert.doesNotMatch(store, /ChatMessage/);
  assert.doesNotMatch(store, /abstract interface class LegacyChatStore/);
  assert.doesNotMatch(
    store,
    /\b(?:markDelivered|updateMessageText|getMessage|deleteMessage|clearMessages|closeAll)\s*\(/,
  );
  assert.doesNotMatch(repository, /ChatMessage/);
  assert.doesNotMatch(repository, /implements LegacyChatStore/);
  assert.doesNotMatch(syncAdapter, /ChatMessage/);
  assert.match(remoteSource, /LegacyChatRecord\.fromLegacyServerJson/);
  assert.doesNotMatch(remoteSource, /abstract interface class LegacyChatRemoteSource/);
  assert.match(remoteSource, /class ServerLegacyChatRemoteSource\s+implements\s+LegacyChatHistoryRemoteSource,\s+LegacyChatSnapshotRemoteSource,\s+LegacyChatDeliveryRemoteSource/s);
  assert.doesNotMatch(remoteSource, /ChatMessage/);
  assert.doesNotMatch(historyAdapter, /ChatMessage/);
});

test('ChatService application boundary requires adapters and has no API-client fallback', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const factory = await readFile(
    join(frontendRoot, 'lib', 'services', 'chat_service_factory.dart'),
    'utf8',
  );
  const service = await readFile(
    join(frontendRoot, 'lib', 'services', 'chat_service.dart'),
    'utf8',
  );
  const snapshotAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_sync_snapshot_adapter.dart'),
    'utf8',
  );
  const messagingCore = await readFile(
    join(frontendRoot, 'lib', 'services', 'messaging_core_service.dart'),
    'utf8',
  );
  const sharedRepository = await readFile(
    join(
      frontendRoot,
      'packages',
      'shared',
      'taiwan_brawl_messaging',
      'lib',
      'src',
      'message_repository.dart',
    ),
    'utf8',
  );
  const sharedSyncEngine = await readFile(
    join(
      frontendRoot,
      'packages',
      'shared',
      'taiwan_brawl_messaging',
      'lib',
      'src',
      'message_sync.dart',
    ),
    'utf8',
  );
  const hiveStore = await readFile(
    join(frontendRoot, 'lib', 'services', 'hive_messaging_store.dart'),
    'utf8',
  );
  assert.match(factory, /required this\.legacyDeliveryStore/);
  assert.match(factory, /required this\.legacyHistoryStore/);
  assert.match(factory, /required this\.legacySnapshotStore/);
  assert.match(factory, /LegacyChatDeliveryStore legacyDeliveryStore/);
  assert.match(factory, /LegacyChatHistoryStore legacyHistoryStore/);
  assert.match(factory, /LegacyChatSnapshotStore legacySnapshotStore/);
  assert.doesNotMatch(factory, /LegacyChatStore/);
  assert.match(factory, /required this\.legacyDeliveryRemoteSource/);
  assert.match(factory, /required this\.legacyHistoryRemoteSource/);
  assert.match(factory, /required this\.legacySnapshotRemoteSource/);
  assert.match(factory, /LegacyChatDeliveryRemoteSource legacyDeliveryRemoteSource/);
  assert.match(factory, /LegacyChatHistoryRemoteSource legacyHistoryRemoteSource/);
  assert.match(factory, /LegacyChatSnapshotRemoteSource legacySnapshotRemoteSource/);
  assert.doesNotMatch(factory, /LegacyChatRemoteSource\s+remoteSource/);
  assert.match(factory, /required this\.transportFactory/);
  assert.doesNotMatch(factory, /ApiClient/);
  assert.match(factory, /localRepository:\s*legacyDeliveryStore/);
  assert.match(factory, /localRepository:\s*legacyHistoryStore/);
  assert.match(factory, /localRepository:\s*legacySnapshotStore/);
  assert.match(factory, /remoteSource:\s*legacyDeliveryRemoteSource/);
  assert.match(factory, /remoteSource:\s*legacyHistoryRemoteSource/);
  assert.match(factory, /remoteSource:\s*legacySnapshotRemoteSource/);
  assert.match(factory, /transportFactory:\s*transportFactory/);
  assert.match(factory, /LegacyChatDeliveryAdapter\(/);
  assert.match(factory, /LegacyChatHistoryAdapter\(/);
  assert.match(factory, /LegacyChatSyncSnapshotAdapter\(/);
  assert.match(service, /required MessagingCoreService messagingCore/);
  assert.match(service, /required DirectMessageTransportFactory transportFactory/);
  assert.match(service, /required LegacyChatDeliveryAdapter legacyDelivery/);
  assert.match(service, /required LegacyChatHistoryAdapter legacyHistory/);
  assert.match(service, /required LegacyChatSyncSnapshotAdapter legacySyncSnapshots/);
  assert.doesNotMatch(service, /Timer\.periodic|_startOutboxRetry/);
  assert.match(service, /retryInterval: outboxRetryInterval/);
  assert.doesNotMatch(
    service,
    /ApiClient|ApiException|LegacyChatStore|LegacyChatRemoteSource|LocalChatRepository|ServerLegacyChatRemoteSource|ServerMessageTransport/,
  );
  assert.match(
    snapshotAdapter,
    /final data = LegacyChatEventMapper\.validateSnapshot\(downloaded\.data\);[\s\S]*?final events = LegacyChatEventMapper\.fromValidatedSnapshot\([\s\S]*?if \(!await _messagingCore\.acceptRemoteBatch\(events\)\)\s*\{\s*throw StateError\(/,
    'snapshot rows must be validated before mapping and reporting rejected event batches',
  );
  assert.match(messagingCore, /repository\.acceptRemoteBatch\(events/);
  assert.match(messagingCore, /retryInterval: retryInterval/);
  assert.match(sharedSyncEngine, /final Duration\? retryInterval/);
  assert.match(sharedSyncEngine, /final inScope = eventFilter\?\.call\(event\) \?\? true/);
  assert.match(sharedSyncEngine, /repository\.rejectRemote\(\s*event/);
  assert.match(sharedSyncEngine, /eventFilter\?\.call\(event\) \?\? true/);
  assert.match(sharedSyncEngine, /_retryTimer\?\.cancel\(\)/);
  assert.match(sharedRepository, /bool get canDurablyRecordEvents/);
  assert.match(sharedRepository, /bool get canDurablyRecordConflicts/);
  assert.match(
    sharedSyncEngine,
    /await _retryTask;[\s\S]*?await transport\.disconnect\(\)/,
    'engine shutdown waits for an active retry before disconnecting',
  );
  assert.match(sharedRepository, /store is MessageBatchInboxStore/);
  assert.match(sharedRepository, /loadInboxBatches\(\)/);
  assert.match(sharedRepository, /appendInboxBatch\(events\)/);
  assert.match(hiveStore, /MessageInboxStore,\s*MessageBatchInboxStore,/);
  assert.match(hiveStore, /'\$_inboxBatchPrefix\$batchId'/);
  assert.match(
    snapshotAdapter,
    /if \(selfId != null\)\s*\{[\s\S]*?\}\s*await _localRepository\.importAll\(data\);/,
    'raw compatibility rows are imported only after shared events are accepted',
  );
});

test('direct-message page consumes the frontend-owned service port', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const homePage = await readFile(
    join(frontendRoot, 'lib', 'pages', 'home', 'home_page.dart'),
    'utf8',
  );
  const productionRoot = await readFile(
    join(frontendRoot, 'lib', 'main.dart'),
    'utf8',
  );
  const wrapper = await readFile(
    join(frontendRoot, 'lib', 'pages', 'social', 'dm_page.dart'),
    'utf8',
  );
  const page = await readFile(
    join(frontendRoot, 'lib', 'pages', 'social', 'editable_dm_page.dart'),
    'utf8',
  );
  const servicePort = await readFile(
    join(frontendRoot, 'lib', 'services', 'direct_message_service.dart'),
    'utf8',
  );
  const sessionPort = await readFile(
    join(frontendRoot, 'lib', 'services', 'direct_message_session.dart'),
    'utf8',
  );
  const syncPort = await readFile(
    join(frontendRoot, 'lib', 'services', 'direct_message_sync_service.dart'),
    'utf8',
  );
  const chatService = await readFile(
    join(frontendRoot, 'lib', 'services', 'chat_service.dart'),
    'utf8',
  );
  const chatServiceFactory = await readFile(
    join(frontendRoot, 'lib', 'services', 'chat_service_factory.dart'),
    'utf8',
  );
  assert.match(page, /final DirectMessageService service/);
  assert.match(page, /final ManualP2pDmService\? manualP2pService/);
  assert.match(page, /final RetryableDmService\? retryService/);
  assert.match(page, /final DirectMessageSyncService\? syncService/);
  assert.doesNotMatch(page, /ubs\.DmService/);
  assert.doesNotMatch(page, /ChatMessage/);
  assert.doesNotMatch(page, /ChatService|MessagingTransportFactory/);
  assert.match(wrapper, /final DirectMessageSession service/);
  assert.match(wrapper, /final RetryableDmService\? retryService/);
  assert.match(wrapper, /final ManualP2pDmService\? manualP2pService/);
  assert.match(wrapper, /final DirectMessageSyncService\? syncService/);
  assert.doesNotMatch(wrapper, /ChatService/);
  assert.match(homePage, /DirectMessageSessionFactory _chatServiceFactory/);
  assert.match(homePage, /_chatServiceFactory = context\.read<DirectMessageSessionFactory>\(\)/);
  assert.match(homePage, /final chatService = _chatServiceFactory\.create\(\)/);
  assert.match(homePage, /retryService: chatService\.retryCapability/);
  assert.match(homePage, /manualP2pService: chatService\.manualP2pCapability/);
  assert.match(homePage, /syncService: chatService\.syncCapability/);
  assert.doesNotMatch(homePage, /_chatService\b/);
  assert.match(wrapper, /widget\.service\.dispose\(\)/);
  assert.match(chatServiceFactory, /PeerSignalingChannel Function\(\)\? manualSignalingFactory/);
  assert.match(chatServiceFactory, /manualSignaling: manualSignalingFactory\?\.call\(\)/);
  assert.match(chatService, /Future<void> _enqueueLifecycle\(/);
  assert.match(chatService, /_enqueueLifecycle\(\(\) => _prepare\(isCaller: isCaller\)\)/);
  assert.match(chatService, /Future<void> complete\(\) => _enqueueLifecycle/);
  assert.match(chatService, /Future<void>\? _disposeFuture/);
  assert.match(chatService, /The DM session is disposed/);
  assert.match(productionRoot, /manualSignalingFactory: ManualPeerSignaling\.new/);
  assert.doesNotMatch(homePage, /ChatService|ChatServiceFactory/);
  assert.match(productionRoot, /Provider<DirectMessageSessionFactory>\.value/);
  assert.match(servicePort, /abstract interface class DirectMessageService/);
  assert.match(servicePort, /Stream<DirectMessage> get directMessageStream/);
  assert.doesNotMatch(servicePort, /uploadSyncData|downloadAndMergeSyncData/);
  assert.match(syncPort, /abstract interface class DirectMessageSyncService/);
  assert.match(syncPort, /uploadSyncData/);
  assert.match(syncPort, /downloadAndMergeSyncData/);
  assert.match(sessionPort, /abstract interface class DirectMessageSession/);
  assert.match(sessionPort, /implements DirectMessageService/);
  assert.match(sessionPort, /RetryableDmService\? get retryCapability/);
  assert.match(sessionPort, /ManualP2pDmService\? get manualP2pCapability/);
  assert.match(sessionPort, /DirectMessageSyncService\? get syncCapability/);
  assert.doesNotMatch(sessionPort, /implements DirectMessageService, RetryableDmService|implements DirectMessageService, ManualP2pDmService/);
  assert.match(sessionPort, /abstract interface class DirectMessageSessionFactory/);
  assert.match(chatService, /implements[\s\S]*DirectMessageSession/);
  assert.match(chatService, /DirectMessageSyncService/);
  assert.doesNotMatch(chatService, /implements DmService/);
  const viewModel = await readFile(
    join(frontendRoot, 'lib', 'models', 'direct_message.dart'),
    'utf8',
  );
  assert.match(viewModel, /DirectMessage\.fromProjection\(/);
  assert.match(viewModel, /MessageProjection/);
});

test('ChatService no longer exposes the legacy ChatMessage application facade', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const service = await readFile(
    join(frontendRoot, 'lib', 'services', 'chat_service.dart'),
    'utf8',
  );
  const retryPort = await readFile(
    join(frontendRoot, 'lib', 'services', 'retryable_dm_service.dart'),
    'utf8',
  );
  const sessionPort = await readFile(
    join(frontendRoot, 'lib', 'services', 'direct_message_session.dart'),
    'utf8',
  );

  assert.match(service, /implements[\s\S]*DirectMessageSession/);
  assert.match(sessionPort, /implements DirectMessageService/);
  assert.doesNotMatch(sessionPort, /implements DirectMessageService, RetryableDmService/);
  for (const signature of [
    /^\s{2}Stream<ChatMessage> get messageStream\b/m,
    /^\s{2}Future<List<ChatMessage>> fetchHistory\b/m,
    /^\s{2}Future<List<ChatMessage>> syncFromServer\b/m,
    /^\s{2}Future<void> sendMessage\b/m,
    /^\s{2}Future<void> editMessage\b/m,
    /^\s{2}Future<void> recallMessage\b/m,
    /^\s{2}Future<void> markMessageRead\b/m,
  ]) {
    assert.doesNotMatch(
      service,
      signature,
      `${signature} must not be part of the ChatService application API`,
    );
  }
  assert.doesNotMatch(service, /EditableDmService/);
  assert.match(service, /_legacyHistory\.loadAndPromote/);
  assert.match(service, /Future<void> editProjectedMessage\(/);
  assert.match(retryPort, /abstract interface class RetryableDmService/);
  assert.doesNotMatch(retryPort, /ChatMessage|EditableDmService/);
});

test('projection commands use stable IDs without round-tripping through ChatMessage', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const service = await readFile(
    join(frontendRoot, 'lib', 'services', 'chat_service.dart'),
    'utf8',
  );
  const syncAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'message_chat_sync_adapter.dart'),
    'utf8',
  );
  const deliveryAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_delivery_adapter.dart'),
    'utf8',
  );

  assert.doesNotMatch(
    service,
    /_eventMessageIdFor|_legacyMessageForProjection|_messageEventIds/,
  );
  assert.match(service, /\.edit\(\s*messageId/s);
  assert.match(service, /\.read\(messageId/s);
  assert.match(service, /\.recall\(\s*messageId/s);
  assert.match(service, /_legacyDelivery\.recallProjection/);
  assert.doesNotMatch(service, /legacyMessageKeyForProjection|createdAt\.toIso8601String\(\)/);
  assert.match(deliveryAdapter, /legacyMessageKeyForProjection/);
  assert.doesNotMatch(service, /MessageChatProjection|chat_models\.dart/);
  assert.doesNotMatch(service, /_projectedMessages\(|exportMessages\(/);
  assert.match(syncAdapter, /static Map<String, Map<String, String>> exportProjections/);
  assert.match(service, /_legacySyncSnapshots\.upload\(selfId, friendId\)/);
});

test('frontend DM has no retired ChatMessage projection or export shim', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  await assert.rejects(
    readFile(join(frontendRoot, 'lib', 'services', 'message_chat_projection.dart')),
    {code: 'ENOENT'},
  );
  await assert.rejects(
    readFile(join(frontendRoot, 'lib', 'models', 'chat_models.dart')),
    {code: 'ENOENT'},
  );
  const directMessage = await readFile(
    join(frontendRoot, 'lib', 'models', 'direct_message.dart'),
    'utf8',
  );
  assert.match(directMessage, /factory DirectMessage\.fromProjection/);
});

test('legacy DM rows are retained behind a durable verified migration manifest', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const storePort = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_store.dart'),
    'utf8',
  );
  const localStore = await readFile(
    join(frontendRoot, 'lib', 'services', 'local_chat_repository.dart'),
    'utf8',
  );
  const migrationManifest = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_migration_manifest.dart'),
    'utf8',
  );
  const sharedMessageRepository = await readFile(
    join(
      frontendRoot,
      'packages',
      'shared',
      'taiwan_brawl_messaging',
      'lib',
      'src',
      'message_repository.dart',
    ),
    'utf8',
  );
  const chatService = await readFile(
    join(frontendRoot, 'lib', 'services', 'chat_service.dart'),
    'utf8',
  );
  const chatServiceFactory = await readFile(
    join(frontendRoot, 'lib', 'services', 'chat_service_factory.dart'),
    'utf8',
  );
  const historyAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_history_adapter.dart'),
    'utf8',
  );
  const legacyEventMapper = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_event_mapper.dart'),
    'utf8',
  );
  const messageSyncAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'message_chat_sync_adapter.dart'),
    'utf8',
  );
  const syncSnapshotAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_sync_snapshot_adapter.dart'),
    'utf8',
  );
  const deliveryAdapter = await readFile(
    join(frontendRoot, 'lib', 'services', 'legacy_chat_delivery_adapter.dart'),
    'utf8',
  );

  assert.match(storePort, /migratedEventMessageIds/);
  assert.match(storePort, /markEventMessagesMigrated/);
  assert.match(storePort, /expectedSourceRevision/);
  assert.match(localStore, /chat_event_migration_v1/);
  assert.match(localStore, /getHistorySnapshot/);
  assert.match(localStore, /sourceRevision\(sourceRows\)/);
  assert.match(localStore, /LegacyChatMigrationManifest\.decode/);
  assert.match(localStore, /LegacyChatMigrationManifest\.encode/);
  assert.doesNotMatch(localStore, /sourceRowDigests|_migrationManifestVersion|package:crypto/);
  assert.match(migrationManifest, /sourceRowKeys/);
  assert.match(migrationManifest, /sourceRowDigests/);
  assert.match(migrationManifest, /static String sourceRevision/);
  assert.match(migrationManifest, /currentVersion = 2/);
  assert.match(sharedMessageRepository, /canonicalPayload != event\.canonicalPayload/);
  assert.match(sharedMessageRepository, /Event ID is already bound to a different payload/);
  assert.match(chatServiceFactory, /LegacyChatHistoryAdapter\(/);
  assert.match(chatServiceFactory, /LegacyChatSyncSnapshotAdapter\(/);
  assert.match(chatServiceFactory, /LegacyChatDeliveryAdapter\(/);
  assert.match(chatService, /required LegacyChatHistoryAdapter legacyHistory/);
  assert.match(chatService, /_legacyHistory\.loadAndPromote/);
  assert.match(chatService, /_legacyHistory\.refreshAndPromote/);
  assert.doesNotMatch(chatService, /_promoteLegacyMessages|eventsFromMessages/);
  assert.match(historyAdapter, /migratedEventMessageIds/);
  assert.match(historyAdapter, /projectionFor\(messageId\) != null/);
  assert.match(historyAdapter, /markEventMessagesMigrated/);
  assert.match(historyAdapter, /acceptRemoteBatch\(\s*events/);
  assert.match(historyAdapter, /LegacyChatEventMapper\.fromRecords/);
  assert.doesNotMatch(historyAdapter, /for\s*\(final event in events\)/);
  assert.match(historyAdapter, /_localRepository\.getHistorySnapshot/);
  assert.match(historyAdapter, /expectedSourceRevision: localSnapshot\.sourceRevision/);
  assert.match(
    historyAdapter,
    /if \(before == null && \(migrationComplete \|\| hasProjection\)\) return/,
  );
  assert.match(historyAdapter, /_fetchAndPromote\(selfId, friendId, before: before\)/);
  assert.match(historyAdapter, /loadPageAndPromote/);
  assert.match(historyAdapter, /await _promoteLocalHistory\(selfId, friendId\)/);
  assert.doesNotMatch(historyAdapter, /Hive|ApiClient|ServerLegacyChatRemoteSource/);
  assert.match(legacyEventMapper, /legacy-created:\$\{message\.messageKey\}/);
  assert.match(legacyEventMapper, /static List<MessageEvent> fromSnapshot/);
  assert.match(legacyEventMapper, /static List<MessageEvent> fromRecords/);
  assert.doesNotMatch(
    legacyEventMapper,
    /^import .*?(?:hive|api_client|messaging_core_service)/m,
  );
  assert.doesNotMatch(messageSyncAdapter, /importEvents|eventsFromLegacyRecords/);
  assert.doesNotMatch(messageSyncAdapter, /LegacyChatRecord|exportMessages/);
  assert.match(chatService, /_legacySyncSnapshots\.downloadAndMerge/);
  assert.match(syncSnapshotAdapter, /MessageChatSyncAdapter\.exportProjections/);
  assert.match(
    syncSnapshotAdapter,
    /LegacyChatEventMapper\.validateSnapshot\(downloaded\.data\)/,
  );
  assert.match(
    syncSnapshotAdapter,
    /LegacyChatEventMapper\.fromValidatedSnapshot/,
  );
  assert.match(syncSnapshotAdapter, /_localRepository\.importAll/);
  assert.ok(
    syncSnapshotAdapter.indexOf('validateSnapshot(downloaded.data)') <
      syncSnapshotAdapter.indexOf('acceptRemoteBatch(events)'),
    'validate the complete snapshot before merging events',
  );
  assert.ok(
    syncSnapshotAdapter.indexOf('validateSnapshot(downloaded.data)') <
      syncSnapshotAdapter.indexOf('_localRepository.importAll(data)'),
    'validate the complete snapshot before importing compatibility rows',
  );
  assert.doesNotMatch(syncSnapshotAdapter, /Hive|ApiClient|ServerLegacyChatRemoteSource/);
  assert.match(chatService, /_legacyDelivery\.sendText/);
  assert.match(chatService, /_legacyDelivery\.recallProjection/);
  assert.doesNotMatch(chatService, /legacyMessageKeyForProjection|createdAt\.toIso8601String\(\)/);
  assert.doesNotMatch(chatService, /_remoteSource\.(sendMessage|recallMessage)|_localRepo\.saveMessage/);
  assert.match(deliveryAdapter, /_remoteSource\.sendMessage/);
  assert.match(deliveryAdapter, /_remoteSource\.recallMessage/);
  assert.match(deliveryAdapter, /legacyMessageKeyForProjection/);
  assert.match(deliveryAdapter, /projection\.createdAt\.toIso8601String\(\)/);
  assert.match(deliveryAdapter, /_localRepository\.saveMessage/);
});

test('legacy chat adapters depend on focused storage capabilities', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const adapters = [
    ['legacy_chat_history_adapter.dart', /LegacyChatHistoryStore/],
    ['legacy_pending_message_adapter.dart', /LegacyPendingMessageStore/],
    ['legacy_chat_delivery_adapter.dart', /LegacyChatDeliveryStore/],
    ['legacy_chat_sync_snapshot_adapter.dart', /LegacyChatSnapshotStore/],
  ];

  for (const [file, focusedCapability] of adapters) {
    const source = await readFile(
      join(frontendRoot, 'lib', 'services', file),
      'utf8',
    );
    assert.match(source, focusedCapability, `${file} must use its focused port`);
    assert.doesNotMatch(source, /LegacyChatStore/);
  }
});

test('legacy snapshot retries require exact post-import acknowledgement', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const backendRoot = join(workspaceRoot, '..', 'taiwan_brawl_back');
  const [contractsText, backendApi, backendRoutes, frontendSource, frontendAdapter] =
    await Promise.all([
      readFile(join(workspaceRoot, 'data', 'contracts.json'), 'utf8'),
      readFile(join(backendRoot, 'src', 'api', 'chat_sync_api.js'), 'utf8'),
      readFile(join(backendRoot, 'src', 'api', 'chat_api.js'), 'utf8'),
      readFile(join(frontendRoot, 'lib', 'services', 'legacy_chat_remote_source.dart'), 'utf8'),
      readFile(join(frontendRoot, 'lib', 'services', 'legacy_chat_sync_snapshot_adapter.dart'), 'utf8'),
    ]);
  const contract = JSON.parse(contractsText).contracts.find(
    ({ id }) => id === 'direct-message-delivery',
  );
  assert.ok(contract);
  assert.ok(contract.surface.includes('GET /api/chat/dm/:friendId/sync-download-v2'));
  assert.ok(contract.surface.includes('POST /api/chat/dm/:friendId/sync-ack'));
  assert.ok(contract.invariants.some((rule) => rule.includes('acknowledges the exact snapshot')));
  assert.match(backendApi, /handleSyncDownloadV2/);
  assert.match(backendApi, /handleSyncAcknowledge/);
  assert.match(backendRoutes, /sync-download-v2/);
  assert.match(backendRoutes, /sync-ack/);
  assert.match(frontendSource, /sync-download-v2/);
  assert.match(frontendSource, /acknowledgeSyncData/);
  assert.ok(
    frontendAdapter.indexOf('_localRepository.importAll(data)') <
      frontendAdapter.indexOf('acknowledgeSyncData(friendId, snapshotId)'),
    'the frontend must acknowledge only after local snapshot import completes',
  );
});

test('legacy chat adapters depend on focused remote capabilities', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const adapters = [
    ['legacy_chat_history_adapter.dart', /LegacyChatHistoryRemoteSource/],
    ['legacy_chat_delivery_adapter.dart', /LegacyChatDeliveryRemoteSource/],
    ['legacy_chat_sync_snapshot_adapter.dart', /LegacyChatSnapshotRemoteSource/],
  ];

  for (const [file, focusedCapability] of adapters) {
    const source = await readFile(
      join(frontendRoot, 'lib', 'services', file),
      'utf8',
    );
    assert.match(source, focusedCapability, `${file} must use its focused remote port`);
    assert.doesNotMatch(source, /LegacyChatRemoteSource/);
  }
});

test('application services require remote-source ports without API defaults', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const services = [
    ['admin_service.dart', 'AdminRemoteSource'],
    ['auth_service.dart', 'AuthRemoteSource'],
    ['friends_service.dart', 'FriendsRemoteSource'],
    ['llm_bot_service.dart', 'LlmBotRemoteSource'],
    ['royale_service.dart', 'RoyaleRemoteSource'],
  ];

  for (const [filename, port] of services) {
    const source = await readFile(
      join(frontendRoot, 'lib', 'services', filename),
      'utf8',
    );
    assert.match(source, new RegExp(`required ${port} remoteSource`));
    assert.doesNotMatch(source, /ApiClient|Server[A-Za-z]+RemoteSource/);
  }
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
  assert.match(workflow, /packages\/games\/street_scrap/);
  assert.match(workflow, /Test Street Scrap package/);
  assert.match(workflow, /packages\/shared/);
  assert.match(workflow, /shared-package-tests/);
  assert.match(workflow, /platform-resource-integration/);
  assert.match(workflow, /Android emulator/);
  assert.match(workflow, /iOS Simulator/);
  assert.match(workflow, /macOS desktop/);
  assert.match(workflow, /Windows desktop/);
  assert.match(workflow, /Linux desktop/);
  assert.match(
    workflow,
    /xvfb-run -a flutter test integration_test\/game_resource_native_lifecycle_test\.dart -d linux/,
  );
  assert.match(workflow, /integration_test\/game_resource_native_lifecycle_test\.dart/);
  assert.match(workflow, /integration_test\/\*\*/);
  assert.match(workflow, /p2p-webrtc-runtime:/);
  assert.match(workflow, /test\/p2p_webrtc_runtime_test\.dart/);
  assert.match(workflow, /test\/chat_service_factory_test\.dart/);
  assert.match(workflow, /test\/chat_service_offline_test\.dart/);
  assert.doesNotMatch(workflow, /test\/p2p_(message_session|chat_service)_test\.dart/);
  assert.match(workflow, /test\/secure_device_identity_test\.dart/);
  assert.match(workflow, /test\/peer_trust_service_test\.dart/);
  assert.match(workflow, /test\/peer_trust_dialog_test\.dart/);
  assert.equal(
    workflow.match(/- 'test\/p2p_webrtc_runtime_test\.dart'/g)?.length,
    2,
    'P2P runtime test changes must trigger both pull-request and push workflows',
  );
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
      forbiddenPackages: ['taiwan_brawl_game_mini_royale', 'taiwan_brawl_game_street_scrap'],
    },
    {
      name: 'Mini Royale',
      directory: 'mini_royale',
      packageName: 'taiwan_brawl_game_mini_royale',
      forbiddenPackages: ['taiwan_brawl_game_archery', 'taiwan_brawl_game_street_scrap'],
    },
    {
      name: 'Street Scrap',
      directory: 'street_scrap',
      packageName: 'taiwan_brawl_game_street_scrap',
      forbiddenPackages: ['taiwan_brawl_game_archery', 'taiwan_brawl_game_mini_royale'],
    },
  ];

  for (const game of games) {
    const packageRoot = join(frontendRoot, 'packages', 'games', game.directory);
    const pubspec = await readFile(join(packageRoot, 'pubspec.yaml'), 'utf8');
    const sourceFiles = await dartFilesUnder(join(packageRoot, 'lib'));

    if (game.directory === 'street_scrap') {
      for (const ownerPath of [
        'design/street-scrap-design.json',
        'design/street-scrap-recipe-policy.json',
        'docs/third-game-design-plan.md',
        'docs/third-game-material-catalog.md',
        'docs/third-game-implementation-taskbook.md',
        'docs/third-game-design-completion-audit.md',
        'docs/third-game-art-direction.md',
        'tool/audit-street-scrap-design.mjs',
        'tool/compile-street-scrap-content.mjs',
        'tool/simulate-street-scrap-design.mjs',
        'tool/test/street-scrap-design.test.mjs',
        'tool/test/street-scrap-content-compiler.test.mjs',
        'tool/test/street-scrap-scenarios.test.mjs',
        'tool/test/street-scrap-localization.test.mjs',
        'resources/data/street-scrap-content-v1.json',
        'resources/data/street-scrap-content-chapters-0-4-v1.json',
        'resources/data/street-scrap-content-chapter-5-v1.json',
      ]) {
        await readFile(join(packageRoot, ownerPath), 'utf8');
      }
      assert.doesNotMatch(
        pubspec,
        /resources\/data/,
        'downloadable Street Scrap content stays out of bundled Flutter assets',
      );
      for (const previousCoordinationPath of [
        'data/street-scrap-design.json',
        'data/street-scrap-recipe-policy.json',
        'data/street-scrap-content-v1.json',
        'data/street-scrap-content-chapters-0-4-v1.json',
        'data/street-scrap-content-chapter-5-v1.json',
        'scripts/audit-street-scrap-design.mjs',
        'scripts/compile-street-scrap-content.mjs',
        'scripts/simulate-street-scrap-design.mjs',
        'tests/street-scrap-design.test.mjs',
        'tests/street-scrap-content-compiler.test.mjs',
        'tests/street-scrap-scenarios.test.mjs',
        'tests/street-scrap-localization.test.mjs',
      ]) {
        await assert.rejects(
          readFile(join(workspaceRoot, previousCoordinationPath), 'utf8'),
          { code: 'ENOENT' },
          `Street Scrap owner data/tools/tests must not remain at ${previousCoordinationPath}`,
        );
      }
      const ownerToolManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
      assert.equal(ownerToolManifest.private, true);
      assert.match(ownerToolManifest.scripts['design:audit'], /tool\/audit-street-scrap-design/);
      assert.match(ownerToolManifest.scripts['design:simulate'], /tool\/simulate-street-scrap-design/);
      assert.match(ownerToolManifest.scripts['content:check'], /tool\/compile-street-scrap-content/);
      assert.match(ownerToolManifest.scripts['content:write'], /tool\/compile-street-scrap-content\.mjs --write/);
      assert.match(ownerToolManifest.scripts['test:tools'], /tool\/test\/\*\.test\.mjs/);
      const workspacePackage = JSON.parse(await readFile(join(workspaceRoot, 'package.json'), 'utf8'));
      assert.match(workspacePackage.scripts.test, /street_scrap\/tool\/test/);
      assert.match(workspacePackage.scripts['street-scrap-content'], /street_scrap\/tool\/compile/);
      assert.match(workspacePackage.scripts['street-scrap-design:audit'], /street_scrap\/tool\/audit/);
      assert.match(workspacePackage.scripts['street-scrap-design:simulate'], /street_scrap\/tool\/simulate/);
      assert.match(workspacePackage.scripts['street-scrap-design:test'], /street_scrap\/tool\/test/);
    }

    assert.match(pubspec, new RegExp(`^name: ${game.packageName}$`, 'm'), `${game.name} has its own package identity`);
    for (const forbiddenPackage of game.forbiddenPackages) {
      assert.doesNotMatch(
        pubspec,
        new RegExp(`^\\s+${forbiddenPackage}:`, 'm'),
        `${game.name} must not depend on peer ${forbiddenPackage}`,
      );
    }
    assert.doesNotMatch(pubspec, /^\s+taiwan_brawl\s*:/m, `${game.name} must not depend on the concrete host App package`);
    for (const hostAdapterDependency of [
      'hive',
      'hive_flutter',
      'http',
      'dio',
      'flutter_secure_storage',
      'firebase_core',
      'firebase_messaging',
    ]) {
      assert.doesNotMatch(
        pubspec,
        new RegExp(`^\\s+${hostAdapterDependency}:`, 'm'),
        `${game.name} must receive ${hostAdapterDependency} capabilities through host ports`,
      );
    }

    for (const file of sourceFiles) {
      const source = await readFile(file, 'utf8');
      assert.equal(
        source.includes('package:taiwan_brawl/'),
        false,
        `${game.name} source must not import concrete host App code: ${file}`,
      );
      assert.doesNotMatch(
        source,
        /package:(hive|hive_flutter|http|dio|flutter_secure_storage|firebase_core|firebase_messaging)\/|dart:io/,
        `${game.name} must not own platform storage, network, or device adapters: ${file}`,
      );
      assert.equal(
        game.forbiddenPackages.some((dependency) => source.includes(`package:${dependency}/`)),
        false,
        `${game.name} source must not import a peer game package: ${file}`,
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
  assert.match(registry, /streetScrapGameRegistration/);
  for (const filename of consumers) {
    const source = await readFile(
      join(frontendRoot, 'lib', 'game_modules', filename),
      'utf8',
    );
    assert.match(source, /gameModuleRegistrations/);
    assert.doesNotMatch(source, /package:taiwan_brawl_game_(archery|mini_royale|street_scrap)\//);
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

test('every registered game module is bundled through the App package graph', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const pubspec = await readFile(join(frontendRoot, 'pubspec.yaml'), 'utf8');
  const registrations = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'game_module_registrations.dart'),
    'utf8',
  );
  const games = [
    { registration: 'archeryGameRegistration', dependency: 'taiwan_brawl_game_archery', path: 'packages/games/archery' },
    { registration: 'miniRoyaleGameRegistration', dependency: 'taiwan_brawl_game_mini_royale', path: 'packages/games/mini_royale' },
    { registration: 'streetScrapGameRegistration', dependency: 'taiwan_brawl_game_street_scrap', path: 'packages/games/street_scrap' },
  ];

  for (const game of games) {
    assert.match(registrations, new RegExp(`\\b${game.registration}\\b`));
    assert.match(
      pubspec,
      new RegExp(`^  ${game.dependency}:\\n    path: ${game.path}$`, 'm'),
      `${game.dependency} must ship as a local App dependency`,
    );
  }
});

test('App and Worker use the same catalog publisher trust roots', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const backendRoot = join(workspaceRoot, '..', 'taiwan_brawl_back');
  const appConfig = await readFile(
    join(frontendRoot, 'lib', 'services', 'game_catalog_trust_config.dart'),
    'utf8',
  );
  const workerConfig = await readFile(join(backendRoot, 'wrangler.jsonc'), 'utf8');
  const appMatch = /defaultGameCatalogTrustKeysJson\s*=\s*'([^']+)'/.exec(appConfig);
  const workerMatch = /"GAME_CATALOG_TRUST_KEYS"\s*:\s*("(?:\\.|[^"\\])*")/s.exec(workerConfig);

  assert.ok(appMatch, 'App must define its bundled catalog trust roots');
  assert.ok(workerMatch, 'Worker must define its deployment catalog trust roots');
  const appTrustRoots = JSON.parse(appMatch[1]);
  const workerTrustRoots = JSON.parse(JSON.parse(workerMatch[1]));
  assert.deepEqual(appTrustRoots, workerTrustRoots);

  const productionKey = appTrustRoots['catalog-prod-2026-10'];
  assert.equal(productionKey.publisher, 'taiwan-brawl');
  assert.equal(Buffer.from(productionKey.publicKey, 'base64url').length, 32);
});

test('backend CI rehearses game table migrations and API ownership tests', async () => {
  const backendWorkflow = await readFile(
    join(
      workspaceRoot,
      '..',
      'taiwan_brawl_back',
      '.github',
      'workflows',
      'game-data-boundaries.yml',
    ),
    'utf8',
  );

  assert.match(backendWorkflow, /tests\/game_api_paths\.test\.js/);
  assert.match(backendWorkflow, /tests\/game_data_namespace\.test\.js/);
  assert.match(backendWorkflow, /tests\/game_resources_api\.test\.js/);
  assert.match(backendWorkflow, /src\/rooms\/\*\*/);
  assert.match(backendWorkflow, /worker-tests\/\*\*/);
  assert.match(backendWorkflow, /vitest\.config\.js/);
  assert.match(backendWorkflow, /npm test/);
  assert.match(backendWorkflow, /npm run db:migration:rehearse/);
  assert.match(backendWorkflow, /contents: read/);
  assert.doesNotMatch(backendWorkflow, /npm run deploy|wrangler deploy/);
});

test('P2P runtime validation includes frontend WebRTC and backend hibernation owners', async () => {
  const testMatrix = JSON.parse(await readFile(join(workspaceRoot, 'data', 'test-matrix.json'), 'utf8'));
  const contracts = JSON.parse(await readFile(join(workspaceRoot, 'data', 'contracts.json'), 'utf8'));
  const frontend = testMatrix.categories.find((category) => category.id === 'frontend-webrtc-runtime');
  const backend = testMatrix.categories.find((category) => category.id === 'backend');
  const signalingContract = contracts.contracts.find((contract) => contract.id === 'direct-message-signaling');

  assert.ok(frontend.requiredFor.includes('p2p-runtime-change'));
  assert.ok(backend.requiredFor.includes('p2p-runtime-change'));
  assert.ok(backend.commands.includes('npm test'));
  assert.ok(signalingContract.surface.some((field) => field.includes('bounded offer / answer SDP')));
  assert.ok(signalingContract.invariants.some((rule) => rule.includes('post-eviction relay')));
  assert.ok(signalingContract.validation.some((gate) => gate.includes('workerd Durable Object eviction')));
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
  const streetScrapPubspec = await readFile(
    join(frontendRoot, 'packages', 'games', 'street_scrap', 'pubspec.yaml'),
    'utf8',
  );
  const archeryModule = await readFile(
    join(frontendRoot, 'packages', 'games', 'archery', 'lib', 'src', 'archery_game_module.dart'),
    'utf8',
  );
  const streetScrapModule = await readFile(
    join(frontendRoot, 'packages', 'games', 'street_scrap', 'lib', 'src', 'street_scrap_module.dart'),
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
  const streetScrapRegistration = await readFile(
    join(frontendRoot, 'lib', 'game_modules', 'street_scrap_game_registration.dart'),
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
  assertPackageManifestVersionMatches(
    streetScrapPubspec,
    streetScrapModule,
    'streetScrapPackageVersion',
  );
  assert.match(streetScrapModule, /const streetScrapSupportedPlatforms =/);
  assert.match(streetScrapModule, /'resources': \[/);
  assert.match(streetScrapModule, /'supportedResourceSchemas':/);
  assert.match(streetScrapModule, /'platforms': streetScrapSupportedPlatforms/);
  assert.match(streetScrapRegistration, /GameModuleManifest\.fromPackageJson/);
  assert.doesNotMatch(streetScrapRegistration, /GameResourceManifest\(/);
  assert.doesNotMatch(streetScrapRegistration, /supportedResourceSchemas:/);
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
    'LegacyPendingMessageAdapter(',
    'localRepository: legacyChatStore',
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

test('manual P2P requires trusted-peer verification and exposes only its capability API', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const [main, chatService, chatServiceFactory, sharedTransport, sessionPort, manualP2pPort] = await Promise.all([
    readFile(join(frontendRoot, 'lib', 'main.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib', 'services', 'chat_service.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib', 'services', 'chat_service_factory.dart'), 'utf8'),
    readFile(join(frontendRoot, 'packages', 'shared', 'taiwan_brawl_messaging', 'lib', 'src', 'message_transport.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib', 'services', 'direct_message_session.dart'), 'utf8'),
    readFile(join(frontendRoot, 'lib', 'services', 'manual_p2p_dm_service.dart'), 'utf8'),
  ]);

  assert.match(main, /p2pEnabled: configuration\.p2pChatEnabled/);
  assert.match(main, /final p2pAuthenticator = messagingRuntime\.deviceIdentity == null/);
  assert.match(main, /peerTrust\.remoteAuthenticator\(local: messagingRuntime\.deviceIdentity!\)/);
  assert.match(main, /p2pAuthenticator: p2pAuthenticator/);
  assert.match(chatService, /if \(p2pAuthenticator == null\)/);
  assert.match(chatService, /authenticator: p2pAuthenticator/);
  assert.match(manualP2pPort, /abstract interface class ManualP2pDmService/);
  assert.match(sessionPort, /implements DirectMessageService/);
  assert.doesNotMatch(sessionPort, /implements DirectMessageService, RetryableDmService, ManualP2pDmService/);
  assert.match(sessionPort, /retryCapability/);
  assert.match(sessionPort, /manualP2pCapability/);
  assert.match(chatService, /Future<void> prepare\(\{required bool isCaller\}\) =>/);
  assert.match(chatService, /Future<void> _prepare\(\{required bool isCaller\}\) async/);
  assert.match(chatService, /Future<String> exportBundle\(/);
  assert.match(chatService, /Future<void> importBundle\(/);
  assert.match(chatService, /Future<void> complete\(\) => _enqueueLifecycle/);
  assert.doesNotMatch(chatService, /prepareManualP2p|exportManualP2pBundle|importManualP2pBundle|completeManualP2p/);
  assert.match(sharedTransport, /abstract interface class NegotiatingMessageTransport/);
  assert.match(chatService, /ManualP2PTransportFactory/);
  assert.doesNotMatch(chatService, /p2p_message_transport\.dart|P2PMessageTransport\(/);
  assert.doesNotMatch(chatServiceFactory, /p2p_message_transport\.dart|P2PMessageTransport/);
});

test('advertising identifiers stay in shared runtime configuration', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const configuration = await readFile(
    join(
      frontendRoot,
      'packages',
      'shared',
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
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const sharedRoots = [
    join(frontendRoot, 'packages', 'shared', 'taiwan_brawl_core'),
    join(frontendRoot, 'packages', 'shared', 'taiwan_brawl_messaging'),
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

  const runtimeConfiguration = await readFile(
    join(
      sharedRoots[0],
      'lib',
      'src',
      'app_configuration.dart',
    ),
    'utf8',
  );
  assert.doesNotMatch(
    runtimeConfiguration,
    /\b(?:credential|token|accessToken|refreshToken|apiKey|clientSecret|deviceSecret|privateKey|secretKey|deviceSeed)\s*;/i,
    'shared runtime configuration must not declare credentials or secret fields',
  );
  assert.doesNotMatch(
    runtimeConfiguration,
    /this\.(?:credential|token|accessToken|refreshToken|apiKey|clientSecret|deviceSecret|privateKey|secretKey|deviceSeed)\b/i,
    'shared runtime configuration must not accept credentials in its constructor',
  );

  const sharedPushContract = await readFile(
    join(
      sharedRoots[1],
      'lib',
      'src',
      'push_provider.dart',
    ),
    'utf8',
  );
  assert.match(sharedPushContract, /PushProviderConfiguration/);
  assert.match(sharedPushContract, /Future<String\?> getToken\(\)/);
  assert.doesNotMatch(
    sharedPushContract,
    /Firebase|FCM|apiKey|projectId|messagingSenderId|vapidKey/i,
    'provider-specific config must stay in the concrete adapter',
  );
});

test('P2P transport defaults on and shared core version matches the workspace snapshot', async () => {
  const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
  const coreRoot = join(frontendRoot, 'packages', 'shared', 'taiwan_brawl_core');
  const [coreManifest, configuration, repositorySnapshot] = await Promise.all([
    readFile(join(coreRoot, 'pubspec.yaml'), 'utf8'),
    readFile(join(coreRoot, 'lib', 'src', 'app_configuration.dart'), 'utf8'),
    readFile(join(workspaceRoot, 'data', 'repositories.json'), 'utf8'),
  ]);
  const coreVersion = /^version:\s*([^\s#]+)/m.exec(coreManifest)?.[1];
  const coreSnapshot = JSON.parse(repositorySnapshot).repositories.find(
    (repository) => repository.id === 'taiwan-brawl-core',
  );

  assert.ok(coreVersion);
  assert.equal(coreSnapshot.version, coreVersion);
  assert.match(configuration, /'P2P_CHAT_ENABLED',[\s\S]*?defaultValue:\s*true/);
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
