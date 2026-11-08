import {
  DeviceId,
  DeviceLists,
  initAsync,
  OlmMachine,
  ProcessedToDeviceEventType,
  RequestType,
  RoomId,
  UserId,
  VerificationRequestPhase,
} from '@matrix-org/matrix-sdk-crypto-wasm';

function makeKeyDirectory() {
  const devices = new Map();
  const oneTimeKeys = new Map();
  return {
    upload(request) {
      const body = JSON.parse(request.body);
      const keys = body.device_keys;
      if (!keys) return JSON.stringify({ one_time_key_counts: {} });
      const key = `${keys.user_id}/${keys.device_id}`;
      devices.set(key, keys);
      oneTimeKeys.set(key, body.one_time_keys ?? {});
      return JSON.stringify({ one_time_key_counts: { signed_curve25519: Object.keys(body.one_time_keys ?? {}).length } });
    },
    query(request) {
      const requested = JSON.parse(request.body).device_keys;
      const response = { device_keys: {}, master_keys: {}, self_signing_keys: {}, user_signing_keys: {} };
      for (const userId of Object.keys(requested)) {
        response.device_keys[userId] = {};
        for (const keys of devices.values()) {
          if (keys.user_id === userId) response.device_keys[userId][keys.device_id] = keys;
        }
      }
      return JSON.stringify(response);
    },
    claim(request) {
      const body = JSON.parse(request.body);
      const result = { one_time_keys: {} };
      for (const [userId, byDevice] of Object.entries(body.one_time_keys)) {
        result.one_time_keys[userId] = {};
        for (const deviceId of Object.keys(byDevice)) {
          const key = `${userId}/${deviceId}`;
          const uploaded = oneTimeKeys.get(key) ?? {};
          const [keyId, value] = Object.entries(uploaded)[0] ?? [];
          if (keyId) {
            result.one_time_keys[userId][deviceId] = { [keyId]: value };
            delete uploaded[keyId];
          }
        }
      }
      return JSON.stringify(result);
    },
  };
}

async function settle(machine, request, directory) {
  let response = '{}';
  if (request.type === RequestType.KeysUpload) response = directory.upload(request);
  else if (request.type === RequestType.KeysQuery) response = directory.query(request);
  else if (request.type === RequestType.KeysClaim) response = directory.claim(request);
  else throw new Error(`Unexpected setup request type: ${request.type}`);
  await machine.markRequestAsSent(request.id, request.type, response);
  request.free();
}

async function dispatchToDevice(sender, receiver, request, senderUserId, receiverUserId, roomId) {
  if (!request) return;
  const eventType = request.event_type;
  const body = JSON.parse(request.body);
  const events = [];
  for (const [userId, devices] of Object.entries(body.messages ?? {})) {
    if (userId !== receiverUserId) continue;
    for (const content of Object.values(devices)) {
      events.push({
        type: request.event_type,
        sender: senderUserId,
        content,
        origin_server_ts: Date.now(),
        unsigned: {},
        room_id: roomId,
      });
    }
  }
  await sender.markRequestAsSent(request.id, request.type, '{}');
  const processed = await receiver.receiveSyncChanges(
    JSON.stringify(events),
    new DeviceLists([], []),
    new Map([['signed_curve25519', 0]]),
  );
  const types = processed.map((event) => event.type);
  for (const event of processed) event.free();
  request.free();
  const expectedType = eventType === 'm.room.encrypted'
    ? ProcessedToDeviceEventType.Decrypted
    : ProcessedToDeviceEventType.PlainText;
  if (!types.includes(expectedType)) {
    throw new Error(`To-device verification payload was not handled as expected (event=${eventType}, types=${types.join(',')}).`);
  }
}

async function flushQueuedRequests(sender, receiver, senderUserId, receiverUserId, roomId, directory) {
  for (const request of await sender.outgoingRequests()) {
    if (request.event_type) {
      await dispatchToDevice(sender, receiver, request, senderUserId, receiverUserId, roomId);
    } else {
      await settle(sender, request, directory);
    }
  }
}

export async function createSasVerificationSession() {
  await initAsync();
  const suffix = globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const aliceUser = `@alice-${suffix.toLowerCase()}:local.invalid`;
  const bobUser = `@bob-${suffix.toLowerCase()}:local.invalid`;
  const aliceDevice = `A${suffix}`;
  const bobDevice = `B${suffix}`;
  const alice = await OlmMachine.initialize(new UserId(aliceUser), new DeviceId(aliceDevice));
  const bob = await OlmMachine.initialize(new UserId(bobUser), new DeviceId(bobDevice));
  const roomId = `!sas-${suffix.toLowerCase()}:local.invalid`;
  let aliceRequest;
  let bobRequest;
  let aliceSas;
  let bobSas;
  let closed = false;

  try {
    const directory = makeKeyDirectory();
    for (const machine of [alice, bob]) {
      for (const request of await machine.outgoingRequests()) await settle(machine, request, directory);
    }
    for (const [machine, userId] of [[alice, bobUser], [bob, aliceUser]]) {
      const query = machine.queryKeysForUsers([new UserId(userId)]);
      await machine.markRequestAsSent(query.id, query.type, directory.query(query));
      query.free();
    }
    for (const [machine, peerUser] of [[alice, bobUser], [bob, aliceUser]]) {
      const claim = await machine.getMissingSessions([new UserId(peerUser)]);
      if (!claim) throw new Error('Missing Olm session claim for SAS flow.');
      await machine.markRequestAsSent(claim.id, claim.type, directory.claim(claim));
      claim.free();
    }

    const target = await alice.getDevice(new UserId(bobUser), new DeviceId(bobDevice));
    if (!target) throw new Error('Target device was not found after the key query.');
    const verification = target.requestVerification();
    aliceRequest = verification[0];
    const initial = verification[1];
    target.free();
    await dispatchToDevice(alice, bob, initial, aliceUser, bobUser, roomId);

    const bobRequests = bob.getVerificationRequests(new UserId(aliceUser));
    bobRequest = bobRequests.find((request) => request.phase() !== VerificationRequestPhase.Cancelled);
    for (const request of bobRequests) if (request !== bobRequest) request.free();
    if (!bobRequest) throw new Error('The receiving device did not register the verification request.');
    const acceptance = bobRequest.accept();
    await dispatchToDevice(bob, alice, acceptance, bobUser, aliceUser, roomId);

    const started = await aliceRequest.startSas();
    aliceSas = started?.[0];
    const aliceStart = started?.[1];
    if (!aliceSas || !aliceStart) throw new Error('The initiating device could not start SAS.');
    await dispatchToDevice(alice, bob, aliceStart, aliceUser, bobUser, roomId);
    bobSas = bobRequest.getVerification();
    if (!bobSas) throw new Error(`The receiving device did not create SAS (phase=${bobRequest.phase()}).`);
    await dispatchToDevice(bob, alice, bobSas.accept(), bobUser, aliceUser, roomId);
    await flushQueuedRequests(alice, bob, aliceUser, bobUser, roomId, directory);
    await flushQueuedRequests(bob, alice, bobUser, aliceUser, roomId, directory);
    await flushQueuedRequests(alice, bob, aliceUser, bobUser, roomId, directory);
    if (!bobSas.canBePresented()) throw new Error(`The receiving device could not present SAS after accepting it (emoji=${Boolean(bobSas.emoji())}, accepted=${bobSas.hasBeenAccepted()}).`);
    if (!aliceSas.canBePresented()) throw new Error('The initiating device could not present SAS.');
    const aliceEmoji = aliceSas.emoji()?.map((item) => item.symbol) ?? [];
    const bobEmoji = bobSas.emoji()?.map((item) => item.symbol) ?? [];
    if (aliceEmoji.length !== 7 || JSON.stringify(aliceEmoji) !== JSON.stringify(bobEmoji)) {
      throw new Error('The two devices showed different SAS emoji.');
    }

    const getStatus = async () => {
      const aliceKnowsBob = await alice.getDevice(new UserId(bobUser), new DeviceId(bobDevice));
      const bobKnowsAlice = await bob.getDevice(new UserId(aliceUser), new DeviceId(aliceDevice));
      const status = {
        aliceConfirmed: aliceSas.haveWeConfirmed(),
        bobConfirmed: bobSas.haveWeConfirmed(),
        aliceDone: aliceSas.isDone(),
        bobDone: bobSas.isDone(),
        aliceTrustsBob: Boolean(aliceKnowsBob?.isLocallyTrusted()),
        bobTrustsAlice: Boolean(bobKnowsAlice?.isLocallyTrusted()),
        cancelled: aliceSas.isCancelled() || bobSas.isCancelled(),
      };
      aliceKnowsBob?.free();
      bobKnowsAlice?.free();
      return status;
    };
    const confirm = async (side) => {
      if (closed) throw new Error('核對 session 已關閉。');
      if (side === 'alice') {
        for (const request of await aliceSas.confirm()) {
          await dispatchToDevice(alice, bob, request, aliceUser, bobUser, roomId);
        }
        await flushQueuedRequests(bob, alice, bobUser, aliceUser, roomId, directory);
        await flushQueuedRequests(alice, bob, aliceUser, bobUser, roomId, directory);
      } else if (side === 'bob') {
        for (const request of await bobSas.confirm()) {
          await dispatchToDevice(bob, alice, request, bobUser, aliceUser, roomId);
        }
        await flushQueuedRequests(alice, bob, aliceUser, bobUser, roomId, directory);
        await flushQueuedRequests(bob, alice, bobUser, aliceUser, roomId, directory);
      } else {
        throw new Error(`Unknown verification side: ${side}`);
      }
      return getStatus();
    };
    const cancel = async () => {
      if (closed) throw new Error('核對 session 已關閉。');
      const request = aliceSas.cancel();
      if (request) {
        await dispatchToDevice(alice, bob, request, aliceUser, bobUser, roomId);
        await flushQueuedRequests(bob, alice, bobUser, aliceUser, roomId, directory);
      }
      return getStatus();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      aliceSas.free();
      bobSas.free();
      aliceRequest.free();
      bobRequest.free();
      alice.close();
      bob.close();
    };
    return { aliceEmoji, bobEmoji, confirmAlice: () => confirm('alice'), confirmBob: () => confirm('bob'), cancel, getStatus, close };
  } catch (error) {
    aliceSas?.free();
    bobSas?.free();
    aliceRequest?.free();
    bobRequest?.free();
    alice.close();
    bob.close();
    throw error;
  }
}
