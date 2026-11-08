import {
  DecryptionSettings,
  DeviceId,
  DeviceLists,
  EncryptionSettings,
  initAsync,
  OlmMachine,
  ProcessedToDeviceEventType,
  RequestType,
  RoomId,
  TrustRequirement,
  UserId,
} from '@matrix-org/matrix-sdk-crypto-wasm';

function makeInMemoryKeyDirectory() {
  const deviceKeys = new Map();
  const oneTimeKeys = new Map();

  function receiveUpload(request) {
    const body = JSON.parse(request.body);
    const { user_id: userId, device_id: deviceId } = body.device_keys;
    deviceKeys.set(`${userId}/${deviceId}`, body.device_keys);
    oneTimeKeys.set(`${userId}/${deviceId}`, body.one_time_keys ?? {});
    return JSON.stringify({
      one_time_key_counts: {
        signed_curve25519: Object.keys(body.one_time_keys ?? {}).length,
      },
    });
  }

  function answerKeyQuery(request) {
    const body = JSON.parse(request.body);
    const response = {
      device_keys: {},
      master_keys: {},
      self_signing_keys: {},
      user_signing_keys: {},
    };
    for (const userId of Object.keys(body.device_keys)) {
      response.device_keys[userId] = {};
      for (const [key, value] of deviceKeys) {
        if (key.startsWith(`${userId}/`)) {
          response.device_keys[userId][value.device_id] = value;
        }
      }
    }
    return JSON.stringify(response);
  }

  return {
    receiveUpload,
    answerKeyQuery,
    claimOneTimeKey(userId, deviceId) {
      const deviceKey = `${userId}/${deviceId}`;
      const uploaded = oneTimeKeys.get(deviceKey) ?? {};
      const [keyId, key] = Object.entries(uploaded)[0] ?? [];
      if (!keyId || !key) throw new Error('接收裝置沒有可用的一次性金鑰。');
      delete uploaded[keyId];
      return JSON.stringify({
        one_time_keys: { [userId]: { [deviceId]: { [keyId]: key } } },
      });
    },
  };
}

async function sendInitialKeyRequests(machine, keyDirectory) {
  for (const request of await machine.outgoingRequests()) {
    let response = '{}';
    if (request.type === RequestType.KeysUpload) {
      response = keyDirectory.receiveUpload(request);
    } else if (request.type === RequestType.KeysQuery) {
      response = keyDirectory.answerKeyQuery(request);
    } else {
      throw new Error(`小樣未預期的初始化請求：${request.constructor.name}`);
    }
    await machine.markRequestAsSent(request.id, request.type, response);
    request.free();
  }
}

export async function runTwoDeviceRoundtrip() {
  await initAsync();

  const suffix = globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const senderUserId = '@sender:local.invalid';
  const receiverUserId = '@receiver:local.invalid';
  const senderDeviceId = `S${suffix}`;
  const receiverDeviceId = `R${suffix}`;
  const sender = await OlmMachine.initialize(
    new UserId(senderUserId),
    new DeviceId(senderDeviceId),
  );
  const receiver = await OlmMachine.initialize(
    new UserId(receiverUserId),
    new DeviceId(receiverDeviceId),
  );

  try {
    const keyDirectory = makeInMemoryKeyDirectory();
    await sendInitialKeyRequests(sender, keyDirectory);
    await sendInitialKeyRequests(receiver, keyDirectory);

    for (const [machine, peerId] of [
      [sender, receiverUserId],
      [receiver, senderUserId],
    ]) {
      const query = machine.queryKeysForUsers([new UserId(peerId)]);
      await machine.markRequestAsSent(
        query.id,
        query.type,
        keyDirectory.answerKeyQuery(query),
      );
      query.free();
    }

    const claim = await sender.getMissingSessions([new UserId(receiverUserId)]);
    if (!claim) throw new Error('未產生接收裝置的一次性金鑰請求。');
    await sender.markRequestAsSent(
      claim.id,
      claim.type,
      keyDirectory.claimOneTimeKey(receiverUserId, receiverDeviceId),
    );
    claim.free();

    const roomId = '!two-device-spike:local.invalid';
    const roomKeyRequests = await sender.shareRoomKey(
      new RoomId(roomId),
      [new UserId(receiverUserId)],
      new EncryptionSettings(),
    );
    if (roomKeyRequests.length === 0) throw new Error('沒有建立加密 room key 傳送事件。');

    let receivedRoomKey = false;
    for (const request of roomKeyRequests) {
      const body = JSON.parse(request.body);
      const events = [];
      for (const [userId, devices] of Object.entries(body.messages)) {
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

      // The fake key directory only routes the Olm-encrypted to-device payload.
      await sender.markRequestAsSent(request.id, request.type, '{}');
      const processed = await receiver.receiveSyncChanges(
        JSON.stringify(events),
        new DeviceLists([new UserId(senderUserId)], []),
        new Map([['signed_curve25519', 0]]),
      );
      receivedRoomKey ||= processed.some(
        (event) => event.type === ProcessedToDeviceEventType.Decrypted,
      );
      for (const event of processed) event.free();
      request.free();
    }
    if (!receivedRoomKey) throw new Error('接收裝置沒有成功解開加密 room key。');

    const plaintext = `local-only-message-${suffix}`;
    const ciphertext = await sender.encryptRoomEvent(
      new RoomId(roomId),
      'm.room.message',
      JSON.stringify({ body: plaintext, msgtype: 'm.text' }),
    );
    if (ciphertext.includes(plaintext)) throw new Error('密文中仍找到原始訊息。');

    const decrypted = await receiver.decryptRoomEvent(
      JSON.stringify({
        type: 'm.room.encrypted',
        event_id: `$spike-${suffix}`,
        sender: senderUserId,
        room_id: roomId,
        origin_server_ts: Date.now(),
        content: JSON.parse(ciphertext),
      }),
      new RoomId(roomId),
      new DecryptionSettings(TrustRequirement.Untrusted),
    );
    const event = JSON.parse(decrypted.event);
    decrypted.free();
    if (event.content?.body !== plaintext) {
      throw new Error('接收裝置解密後的訊息與原文不一致。');
    }

    let crossSignedPolicyRejected = false;
    try {
      const trustedOnly = await receiver.decryptRoomEvent(
        JSON.stringify({
          type: 'm.room.encrypted',
          event_id: `$untrusted-spike-${suffix}`,
          sender: senderUserId,
          room_id: roomId,
          origin_server_ts: Date.now(),
          content: JSON.parse(ciphertext),
        }),
        new RoomId(roomId),
        new DecryptionSettings(TrustRequirement.CrossSigned),
      );
      trustedOnly.free();
    } catch {
      crossSignedPolicyRejected = true;
    }
    if (!crossSignedPolicyRejected) {
      throw new Error('未驗證的傳送裝置未被跨簽章信任門檻拒絕。');
    }

    return {
      algorithm: JSON.parse(ciphertext).algorithm,
      ciphertextBytes: new TextEncoder().encode(ciphertext).length,
      decryptedBody: event.content.body,
      plaintextHiddenFromCiphertext: true,
      roomKeyDeliveredEncrypted: receivedRoomKey,
      crossSignedPolicyRejected,
    };
  } finally {
    sender.close();
    receiver.close();
  }
}
