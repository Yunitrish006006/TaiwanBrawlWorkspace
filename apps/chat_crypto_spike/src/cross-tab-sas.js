import {
  DeviceId,
  DeviceLists,
  initAsync,
  OlmMachine,
  ProcessedToDeviceEventType,
  RequestType,
  RoomId,
  Sas,
  UserId,
  VerificationRequestPhase,
} from '@matrix-org/matrix-sdk-crypto-wasm';

const PEER_WAIT_MS = 20_000;
const SESSION_TIMEOUT_MS = 120_000;

function keyQueryResponse(userId, deviceBundle) {
  return JSON.stringify({
    device_keys: { [userId]: { [deviceBundle.device_keys.device_id]: deviceBundle.device_keys } },
    master_keys: {},
    self_signing_keys: {},
    user_signing_keys: {},
  });
}

export async function createCrossTabSasDevice({ role, sessionId, onChange = () => {}, sessionTimeoutMs = SESSION_TIMEOUT_MS }) {
  if (!['A', 'B'].includes(role)) throw new Error('Choose device A or B.');
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(sessionId)) throw new Error('Session ID must be 1–48 letters, numbers, _ or -.');
  if (typeof BroadcastChannel === 'undefined') throw new Error('This browser does not support BroadcastChannel.');
  await initAsync();

  const suffix = sessionId.toLowerCase();
  const userId = role === 'A' ? `@sas-a-${suffix}:local.invalid` : `@sas-b-${suffix}:local.invalid`;
  const peerUserId = role === 'A' ? `@sas-b-${suffix}:local.invalid` : `@sas-a-${suffix}:local.invalid`;
  const deviceId = `SAS-${role}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const instanceId = crypto.randomUUID();
  const channel = new BroadcastChannel(`taiwan-brawl-chat-sas:${sessionId}`);
  const machine = await OlmMachine.initialize(new UserId(userId), new DeviceId(deviceId));
  const directory = { ownBundle: undefined, peerBundle: undefined, consumedKeys: new Set() };
  const roomId = `!sas-cross-tab-${suffix}:local.invalid`;
  const status = {
    role,
    deviceId,
    connected: false,
    requestReceived: false,
    requestAccepted: false,
    emoji: [],
    peerEmoji: [],
    canPresent: false,
    sasInfo: null,
    confirmed: false,
    done: false,
    trusted: false,
    cancelled: false,
    cancelCode: '',
    error: '',
  };

  let activeRequest;
  let sas;
  let startedSas = false;
  let acceptedSas = false;
  let closed = false;
  let helloTimer;
  let incomingQueue = Promise.resolve();
  let peerHelloResolve;
  let peerHelloReject;
  let peerHelloTimer;
  const peerHello = new Promise((resolve, reject) => {
    peerHelloResolve = resolve;
    peerHelloReject = reject;
  });

  function serialize(operation) {
    const result = incomingQueue.then(() => {
      if (closed) throw new Error('核對 session 已關閉。');
      return operation();
    });
    incomingQueue = result.catch(() => {});
    return result;
  }

  function publishStatus() {
    onChange({ ...status, emoji: [...status.emoji], peerEmoji: [...status.peerEmoji] });
  }

  function publishHello() {
    if (closed || !directory.ownBundle) return;
    channel.postMessage({ kind: 'device-hello', from: instanceId, role, sessionId, userId, bundle: directory.ownBundle });
  }

  async function settleLocalRequest(request) {
    let response = '{}';
    if (request.type === RequestType.KeysUpload) {
      const body = JSON.parse(request.body);
      if (body.device_keys) {
        directory.ownBundle = { device_keys: body.device_keys, one_time_keys: body.one_time_keys ?? {} };
        response = JSON.stringify({
          one_time_key_counts: {
            signed_curve25519: Object.keys(body.one_time_keys ?? {}).length,
          },
        });
      } else {
        response = JSON.stringify({ one_time_key_counts: {} });
      }
    } else if (request.type === RequestType.KeysQuery) {
      response = directory.peerBundle
        ? keyQueryResponse(peerUserId, directory.peerBundle)
        : JSON.stringify({ device_keys: {}, master_keys: {}, self_signing_keys: {}, user_signing_keys: {} });
    } else if (request.type === RequestType.KeysClaim) {
      const body = JSON.parse(request.body);
      const oneTimeKeys = {};
      for (const [targetUserId, deviceSet] of Object.entries(body.one_time_keys ?? {})) {
        for (const targetDeviceId of Object.keys(deviceSet)) {
          const keyName = `${targetUserId}/${targetDeviceId}`;
          const available = directory.peerBundle?.one_time_keys ?? {};
          const [keyId, value] = Object.entries(available).find(
            ([candidateId]) => !directory.consumedKeys.has(`${keyName}/${candidateId}`),
          ) ?? [];
          if (keyId) {
            directory.consumedKeys.add(`${keyName}/${keyId}`);
            oneTimeKeys[peerUserId] ??= {};
            oneTimeKeys[peerUserId][targetDeviceId] = { [keyId]: value };
          }
        }
      }
      response = JSON.stringify({ one_time_keys: oneTimeKeys });
    } else if (request.type !== RequestType.KeysUpload) {
      throw new Error(`Unexpected local crypto request type ${request.type}.`);
    }
    await machine.markRequestAsSent(request.id, request.type, response);
    request.free();
  }

  async function sendToPeer(request) {
    const body = JSON.parse(request.body);
    const targetDevices = body.messages?.[peerUserId] ?? {};
    const events = Object.values(targetDevices).map((content) => ({
      type: request.event_type,
      sender: userId,
      content,
      origin_server_ts: Date.now(),
      unsigned: {},
      room_id: roomId,
    }));
    if (events.length === 0) throw new Error(`No to-device payload for peer in ${request.event_type ?? 'unknown request'}.`);
    await machine.markRequestAsSent(request.id, request.type, '{}');
    request.free();
    for (const event of events) {
      channel.postMessage({ kind: 'to-device', from: instanceId, sessionId, event });
    }
  }

  async function flushOutgoing() {
    for (const request of await machine.outgoingRequests()) {
      if (request.type === RequestType.ToDevice && request.event_type) {
        await sendToPeer(request);
      } else {
        await settleLocalRequest(request);
      }
    }
  }

  async function refreshVerification() {
    if (closed || !directory.peerBundle) return;
    let deferOutgoing = false;
    const requests = machine.getVerificationRequests(new UserId(peerUserId));
    const live = requests.find((candidate) => candidate.phase() !== VerificationRequestPhase.Cancelled);
    status.cancelled ||= requests.some((candidate) => candidate.phase() === VerificationRequestPhase.Cancelled)
      || activeRequest?.phase() === VerificationRequestPhase.Cancelled
      || Boolean(sas?.isCancelled());
    const cancelInfo = sas?.cancelInfo();
    if (cancelInfo) {
      status.cancelCode = cancelInfo.cancelCode();
      cancelInfo.free();
    }
    for (const candidate of requests) if (candidate !== live) candidate.free();
    if (live) {
      if (!activeRequest) activeRequest = live;
      else if (activeRequest !== live) live.free();
      const request = activeRequest;
      status.requestReceived = true;
      status.requestAccepted = request.isReady() || request.phase() === VerificationRequestPhase.Transitioned || request.isDone();

      if (role === 'A' && request.isReady() && !startedSas) {
        startedSas = true;
        const started = await request.startSas();
        if (!started) throw new Error('Could not start SAS after the other device accepted.');
        sas = started[0];
        await sendToPeer(started[1]);
        deferOutgoing = true;
      } else if (role === 'B' && request.phase() === VerificationRequestPhase.Transitioned && !acceptedSas) {
        const verification = request.getVerification();
        if (!(verification instanceof Sas)) {
          verification?.free();
          throw new Error(`Expected SAS verification object at phase ${request.phase()}.`);
        }
        acceptedSas = true;
        sas = verification;
        const response = sas.accept();
        if (response) await sendToPeer(response);
        deferOutgoing = true;
      } else if (!sas && request.phase() === VerificationRequestPhase.Transitioned) {
        sas = request.getVerification();
      }
    }

    const currentVerification = sas ?? activeRequest?.getVerification();
    status.canPresent = Boolean(currentVerification && 'canBePresented' in currentVerification && currentVerification.canBePresented());
    status.sasInfo = currentVerification && 'canBePresented' in currentVerification
      ? {
          accepted: currentVerification.hasBeenAccepted(),
          weStarted: currentVerification.weStarted(),
          supportsEmoji: currentVerification.supportsEmoji(),
          timedOut: currentVerification.timedOut(),
          cancelled: currentVerification.isCancelled(),
        }
      : null;
    if (status.canPresent) {
      status.emoji = currentVerification.emoji()?.map((item) => item.symbol) ?? [];
      status.confirmed = currentVerification.haveWeConfirmed();
      status.done = currentVerification.isDone();
      status.cancelled = currentVerification.isCancelled();
      if (currentVerification !== sas) currentVerification.free();
    } else if (sas) {
      status.confirmed = sas.haveWeConfirmed();
      status.done = sas.isDone();
      status.cancelled = sas.isCancelled();
    }
    const peerDevice = await machine.getDevice(new UserId(peerUserId), new DeviceId(directory.peerBundle.device_keys.device_id));
    status.trusted = Boolean(peerDevice?.isLocallyTrusted());
    peerDevice?.free();
    publishStatus();
    if (!deferOutgoing) {
      await flushOutgoing();
      const settled = sas ?? activeRequest?.getVerification();
      status.canPresent = Boolean(settled && 'canBePresented' in settled && settled.canBePresented());
      status.confirmed = Boolean(settled?.haveWeConfirmed());
      status.done = Boolean(settled?.isDone());
      status.cancelled ||= Boolean(settled?.isCancelled());
      if (status.canPresent) {
        status.emoji = settled.emoji()?.map((item) => item.symbol) ?? [];
      }
      const settledPeer = await machine.getDevice(new UserId(peerUserId), new DeviceId(directory.peerBundle.device_keys.device_id));
      status.trusted = Boolean(settledPeer?.isLocallyTrusted());
      settledPeer?.free();
      if (settled && settled !== sas) settled.free();
      publishStatus();
    }
  }

  channel.onmessage = ({ data }) => {
    if (closed || !data || data.from === instanceId || data.sessionId !== sessionId) return;
    incomingQueue = incomingQueue.then(async () => {
      if (closed) return;
      try {
      if (data.kind === 'device-hello' && data.role !== role) {
        channel.postMessage({ kind: 'hello-ack', from: instanceId, target: data.from, sessionId });
        if (directory.peerBundle) return;
        directory.peerBundle = data.bundle;
        clearTimeout(peerHelloTimer);
        status.connected = true;
        const query = machine.queryKeysForUsers([new UserId(peerUserId)]);
        await machine.markRequestAsSent(query.id, query.type, keyQueryResponse(peerUserId, directory.peerBundle));
        query.free();
        const peerDevice = await machine.getDevice(new UserId(peerUserId), new DeviceId(directory.peerBundle.device_keys.device_id));
        if (!peerDevice) throw new Error('The peer device keys were not imported.');
        peerDevice.free();
        // SAS to-device events are deliberately routed as plain local events here;
        // this feasibility spike does not establish an Olm session or model a relay.
        await flushOutgoing();
        publishStatus();
        peerHelloResolve();
      } else if (data.kind === 'hello-ack' && data.target === instanceId) {
        clearInterval(helloTimer);
        clearTimeout(peerHelloTimer);
      } else if (data.kind === 'to-device') {
        const processed = await machine.receiveSyncChanges(
          JSON.stringify([data.event]),
          new DeviceLists([], []),
          new Map([['signed_curve25519', 0]]),
        );
        const expected = data.event.type === 'm.room.encrypted'
          ? ProcessedToDeviceEventType.Decrypted
          : ProcessedToDeviceEventType.PlainText;
        const handled = processed.some((event) => event.type === expected);
        for (const event of processed) event.free();
        if (!handled) throw new Error(`The peer's ${data.event.type} event was not handled.`);
        await refreshVerification();
      }
    } catch (error) {
      status.error = error?.message ?? String(error);
      publishStatus();
      peerHelloReject?.(error);
      }
    });
  };

  try {
    for (const request of await machine.outgoingRequests()) await settleLocalRequest(request);
    publishHello();
    helloTimer = setInterval(publishHello, 350);
    peerHelloTimer = setTimeout(() => peerHelloReject(new Error('Timed out waiting for the other browser tab.')), PEER_WAIT_MS);
    await peerHello;
    clearTimeout(peerHelloTimer);
    await refreshVerification();
  } catch (error) {
    closed = true;
    clearInterval(helloTimer);
    clearTimeout(peerHelloTimer);
    channel.close();
    activeRequest?.free();
    sas?.free();
    machine.close();
    throw error;
  }

  const peerDeviceId = directory.peerBundle.device_keys.device_id;
  const snapshot = () => {
    if (status.error) throw new Error(status.error);
    return { ...status, emoji: [...status.emoji] };
  };

  const sendStatus = () => serialize(async () => {
    await refreshVerification();
    return snapshot();
  });

  const timeout = setTimeout(() => {
    void serialize(async () => {
      if (status.done || status.cancelled) return;
      const response = sas ? sas.cancel() : activeRequest?.cancel();
      if (response) await sendToPeer(response);
      status.error = '核對逾時，請重新連線。';
      status.cancelled = true;
      publishStatus();
      await refreshVerification();
    }).catch((error) => {
      status.error = `核對逾時，取消失敗：${error?.message ?? String(error)}`;
      publishStatus();
    });
  }, sessionTimeoutMs);

  return {
    ...status,
    getStatus: sendStatus,
    start() { return serialize(async () => {
      const peer = await machine.getDevice(new UserId(peerUserId), new DeviceId(peerDeviceId));
      if (!peer) throw new Error('Peer device key is unavailable.');
      const [request, outgoing] = peer.requestVerification();
      peer.free();
      activeRequest?.free();
      activeRequest = request;
      await sendToPeer(outgoing);
      status.requestReceived = true;
      publishStatus();
    }); },
    accept() { return serialize(async () => {
      await refreshVerification();
      if (!activeRequest || activeRequest.phase() !== VerificationRequestPhase.Requested) {
        throw new Error('No incoming SAS request to accept.');
      }
      const response = activeRequest.accept();
      if (response) await sendToPeer(response);
      status.requestAccepted = true;
      publishStatus();
      await refreshVerification();
    }); },
    confirm() { return serialize(async () => {
      await refreshVerification();
      if (!sas || !sas.canBePresented()) throw new Error('SAS code is not ready yet.');
      for (const request of await sas.confirm()) await sendToPeer(request);
      await flushOutgoing();
      await refreshVerification();
      return snapshot();
    }); },
    cancel() { return serialize(async () => {
      if (!sas) {
        const response = activeRequest?.cancel();
        if (response) await sendToPeer(response);
      } else {
        const response = sas.cancel();
        if (response) await sendToPeer(response);
      }
      status.cancelled = true;
      publishStatus();
      await refreshVerification();
      return snapshot();
    }); },
    rejectMismatch() { return serialize(async () => {
      if (!sas || !sas.canBePresented()) throw new Error('SAS code is not ready to compare.');
      const response = sas.cancelWithCode('m.mismatched_sas');
      if (response) await sendToPeer(response);
      status.cancelled = true;
      publishStatus();
      await refreshVerification();
      return snapshot();
    }); },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(helloTimer);
      clearTimeout(peerHelloTimer);
      clearTimeout(timeout);
      channel.close();
      activeRequest?.free();
      sas?.free();
      machine.close();
    },
  };
}
