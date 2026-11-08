import {
  DeviceId,
  initAsync,
  OlmMachine,
  UserId,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import { runTwoDeviceRoundtrip } from './two-device-roundtrip.js';
import { createSasVerificationSession } from './sas-verification.js';
import { createCrossTabSasDevice } from './cross-tab-sas.js';
import './style.css';

const databaseNamePrefix = 'taiwan-brawl-chat-crypto-spike';
const storeNameKey = 'chat-crypto-spike-store-name';
const legacyDatabaseNames = [
  `${databaseNamePrefix}-v1`,
  `${databaseNamePrefix}-v2`,
];
let databaseName = localStorage.getItem(storeNameKey);
if (!databaseName) {
  databaseName = `${databaseNamePrefix}-v2`;
  localStorage.setItem(storeNameKey, databaseName);
}
const userId = '@spike:local.invalid';
const deviceId = 'WEB-SPIKE-01';
const fingerprintKey = 'chat-crypto-spike-public-fingerprint';

const elements = {
  passphrase: document.querySelector('#store-passphrase'),
  open: document.querySelector('#open-store'),
  close: document.querySelector('#close-store'),
  wrongKey: document.querySelector('#wrong-key'),
  reset: document.querySelector('#reset-store'),
  engineState: document.querySelector('#engine-state'),
  result: document.querySelector('#result'),
  fingerprint: document.querySelector('#fingerprint'),
  persistence: document.querySelector('#persistence'),
  moduleState: document.querySelector('#module-state'),
  roundtrip: document.querySelector('#roundtrip'),
  roundtripResult: document.querySelector('#roundtrip-result'),
  sasVerification: document.querySelector('#sas-verification'),
  sasCancel: document.querySelector('#sas-cancel'),
  sasConfirmA: document.querySelector('#sas-confirm-a'),
  sasConfirmB: document.querySelector('#sas-confirm-b'),
  sasCodeA: document.querySelector('#sas-a-code'),
  sasCodeB: document.querySelector('#sas-b-code'),
  sasStatusA: document.querySelector('#sas-a-status'),
  sasStatusB: document.querySelector('#sas-b-status'),
  sasResult: document.querySelector('#sas-result'),
  crossSasSession: document.querySelector('#cross-sas-session'),
  crossSasState: document.querySelector('#cross-sas-state'),
  crossSasConnectA: document.querySelector('#cross-sas-connect-a'),
  crossSasCopyB: document.querySelector('#cross-sas-copy-b'),
  crossSasStart: document.querySelector('#cross-sas-start'),
  crossSasAccept: document.querySelector('#cross-sas-accept'),
  crossSasConfirm: document.querySelector('#cross-sas-confirm'),
  crossSasReject: document.querySelector('#cross-sas-reject'),
  crossSasCancel: document.querySelector('#cross-sas-cancel'),
  crossSasCode: document.querySelector('#cross-sas-code'),
  crossSasResult: document.querySelector('#cross-sas-result'),
};

let machine;
let sasSession;
let wasmReady = false;
let crossTabDevice;
let crossTabRole;

function setResult(message, state = 'neutral') {
  elements.result.textContent = message;
  elements.result.dataset.state = state;
}

function setEngineState(message, state = 'neutral') {
  elements.engineState.textContent = message;
  elements.engineState.dataset.state = state;
}

function describeStoreError(error) {
  const message = error?.message ?? String(error);
  if (/failed to be decrypted while unpickling/i.test(message)) {
    return '無法解開測試資料：可能是 passphrase 不符或資料損壞。請用建立時的 passphrase；若已忘記，可重設並刪除這份虛構測試身份。';
  }
  return `開啟失敗：${message}`;
}

async function fingerprintIdentityKeys(identityKeys) {
  const encoder = new TextEncoder();
  const publicKeys = `${identityKeys.curve25519.toBase64()}.${identityKeys.ed25519.toBase64()}`;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(publicKeys));
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':');
}

async function openStore(passphrase = elements.passphrase.value) {
  if (passphrase.length < 12) {
    throw new Error('測試 passphrase 至少需要 12 個字元。');
  }
  if (!wasmReady) {
    await initAsync();
    wasmReady = true;
    elements.moduleState.textContent = 'WASM 已載入';
  }
  machine = await OlmMachine.initialize(
    new UserId(userId),
    new DeviceId(deviceId),
    databaseName,
    passphrase,
  );
  const fingerprint = await fingerprintIdentityKeys(machine.identityKeys);
  const previousFingerprint = sessionStorage.getItem(fingerprintKey);
  const restored = previousFingerprint === fingerprint;
  sessionStorage.setItem(fingerprintKey, fingerprint);
  elements.fingerprint.textContent = fingerprint;
  elements.persistence.textContent = restored
    ? '重開後身份相同：持久狀態已還原'
    : '首次建立；關閉後再開一次以驗證還原';
  elements.passphrase.value = '';
  elements.close.disabled = false;
  elements.wrongKey.disabled = false;
  elements.open.disabled = true;
  setEngineState('IndexedDB store 已開啟', 'success');
  setResult(
    restored
      ? '通過：關閉後重新載入同一身份金鑰。'
      : '已建立虛構裝置身份。請關閉並重新開啟，確認指紋保持一致。',
    restored ? 'success' : 'neutral',
  );
}

function closeStore() {
  machine?.close();
  machine = undefined;
  elements.open.disabled = false;
  elements.close.disabled = true;
  elements.wrongKey.disabled = true;
  setEngineState('store 已關閉');
}

async function resetStore() {
  closeStore();
  sessionStorage.removeItem(fingerprintKey);
  for (const name of new Set([databaseName, ...legacyDatabaseNames])) {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('資料庫仍被其他分頁使用，請先關閉其他小樣分頁。'));
    });
  }
  // Use a new IndexedDB name after reset; reusing a just-deleted WASM store can
  // retain stale internal state and fail to unpickle on immediate recreation.
  databaseName = `${databaseNamePrefix}-${crypto.randomUUID()}`;
  localStorage.setItem(storeNameKey, databaseName);
  elements.fingerprint.textContent = '—';
  elements.persistence.textContent = '測試資料已清除';
  setResult('已清除本機 spike 資料。');
}

elements.open.addEventListener('click', async () => {
  elements.open.disabled = true;
  setEngineState('正在載入…');
  try {
    await openStore();
  } catch (error) {
    elements.open.disabled = false;
    setEngineState('開啟失敗', 'error');
    setResult(describeStoreError(error), 'error');
  }
});

elements.close.addEventListener('click', closeStore);

elements.wrongKey.addEventListener('click', async () => {
  const wrongPassphrase = `${crypto.randomUUID()}-wrong`;
  closeStore();
  try {
    const wrongMachine = await OlmMachine.initialize(
      new UserId(userId),
      new DeviceId(deviceId),
      databaseName,
      wrongPassphrase,
    );
    wrongMachine.close();
    setResult('未通過：錯誤 passphrase 居然開啟了 store。', 'error');
    setEngineState('passphrase 驗證失敗', 'error');
  } catch {
    setResult('通過：錯誤 passphrase 無法開啟既有加密 store。', 'success');
    setEngineState('錯誤 passphrase 已拒絕', 'success');
  }
});

elements.reset.addEventListener('click', async () => {
  try {
    await resetStore();
  } catch (error) {
    setResult(error?.message ?? String(error), 'error');
  }
});

elements.passphrase.addEventListener('input', () => {
  if (!machine) elements.open.disabled = elements.passphrase.value.length < 12;
});

elements.roundtrip.addEventListener('click', async () => {
  elements.roundtrip.disabled = true;
  elements.roundtripResult.dataset.state = 'neutral';
  elements.roundtripResult.textContent = '正在建立兩個虛構裝置並交換加密金鑰…';
  try {
    const result = await runTwoDeviceRoundtrip();
    elements.roundtripResult.dataset.state = 'success';
    elements.roundtripResult.textContent =
      `通過：B 裝置解密成功；未跨簽章的傳送端在嚴格信任模式遭拒。原文未出現在密文中。${result.algorithm} · ${result.ciphertextBytes} bytes`;
  } catch (error) {
    elements.roundtripResult.dataset.state = 'error';
    elements.roundtripResult.textContent = `未通過：${error?.message ?? String(error)}`;
  } finally {
    elements.roundtrip.disabled = false;
  }
});

function closeSasSession() {
  sasSession?.close();
  sasSession = undefined;
  elements.sasConfirmA.disabled = true;
  elements.sasConfirmB.disabled = true;
  elements.sasCancel.disabled = true;
}

function renderSasStatus(status) {
  elements.sasStatusA.textContent = status.cancelled
    ? '已取消 · 未建立信任'
    : status.aliceTrustsBob
    ? '已確認 · 對方裝置已信任'
    : status.aliceConfirmed ? '已確認 · 等待另一端' : '等待裝置 A 確認';
  elements.sasStatusB.textContent = status.cancelled
    ? '已取消 · 未建立信任'
    : status.bobTrustsAlice
    ? '已確認 · 對方裝置已信任'
    : status.bobConfirmed ? '已確認 · 等待另一端' : '等待裝置 B 確認';
  elements.sasConfirmA.disabled = !sasSession || status.aliceConfirmed || status.cancelled;
  elements.sasConfirmB.disabled = !sasSession || status.bobConfirmed || status.cancelled;
  elements.sasCancel.disabled = !sasSession || status.cancelled;
  if (status.aliceDone && status.bobDone && status.aliceTrustsBob && status.bobTrustsAlice) {
    elements.sasResult.dataset.state = 'success';
    elements.sasResult.textContent = '完成：雙方確認後才建立互信。';
    closeSasSession();
  } else if (status.cancelled) {
    elements.sasResult.dataset.state = 'neutral';
    elements.sasResult.textContent = '已取消：沒有建立裝置信任。';
    closeSasSession();
  }
}

elements.sasVerification.addEventListener('click', async () => {
  closeSasSession();
  elements.sasVerification.disabled = true;
  elements.sasResult.dataset.state = 'neutral';
  elements.sasResult.textContent = '正在建立兩個虛構裝置並交換核對碼…';
  elements.sasCodeA.textContent = '…';
  elements.sasCodeB.textContent = '…';
  elements.sasStatusA.textContent = '建立中';
  elements.sasStatusB.textContent = '建立中';
  try {
    sasSession = await createSasVerificationSession();
    elements.sasCodeA.textContent = sasSession.aliceEmoji.join(' ');
    elements.sasCodeB.textContent = sasSession.bobEmoji.join(' ');
    elements.sasResult.textContent = '請確認兩側 emoji 完全一致，再分別按下 A、B 裝置的確認。';
    renderSasStatus(await sasSession.getStatus());
  } catch (error) {
    closeSasSession();
    elements.sasResult.dataset.state = 'error';
    elements.sasResult.textContent = `未通過：${error?.message ?? String(error)}`;
    elements.sasStatusA.textContent = '核對未建立';
    elements.sasStatusB.textContent = '核對未建立';
  } finally {
    elements.sasVerification.disabled = false;
  }
});

elements.sasConfirmA.addEventListener('click', async () => {
  if (!sasSession) return;
  elements.sasConfirmA.disabled = true;
  try {
    renderSasStatus(await sasSession.confirmAlice());
  } catch (error) {
    elements.sasResult.dataset.state = 'error';
    elements.sasResult.textContent = `裝置 A 確認失敗：${error?.message ?? String(error)}`;
  }
});

elements.sasConfirmB.addEventListener('click', async () => {
  if (!sasSession) return;
  elements.sasConfirmB.disabled = true;
  try {
    renderSasStatus(await sasSession.confirmBob());
  } catch (error) {
    elements.sasResult.dataset.state = 'error';
    elements.sasResult.textContent = `裝置 B 確認失敗：${error?.message ?? String(error)}`;
  }
});

elements.sasCancel.addEventListener('click', async () => {
  if (!sasSession) return;
  elements.sasCancel.disabled = true;
  try {
    renderSasStatus(await sasSession.cancel());
  } catch (error) {
    elements.sasResult.dataset.state = 'error';
    elements.sasResult.textContent = `取消失敗：${error?.message ?? String(error)}`;
  }
});

function renderCrossTabStatus(status) {
  elements.crossSasState.textContent = status.trusted ? '已互信' : status.connected ? '已連線' : '未連線';
  elements.crossSasState.dataset.state = status.trusted ? 'success' : '';
  if (status.emoji?.length) elements.crossSasCode.textContent = status.emoji.join(' ');
  if (status.error) {
    elements.crossSasResult.dataset.state = 'error';
    elements.crossSasResult.textContent = status.error;
  } else if (status.cancelled) {
    elements.crossSasResult.dataset.state = 'neutral';
    elements.crossSasResult.textContent = status.cancelCode === 'm.mismatched_sas'
      ? '核對碼不一致，已拒絕，沒有建立裝置信任。'
      : '已取消，沒有建立裝置信任。';
  } else if (status.done && status.trusted) {
    elements.crossSasResult.dataset.state = 'success';
    elements.crossSasResult.textContent = '雙方都已確認，比對完成並建立本機裝置信任。';
  } else if (status.confirmed) {
    elements.crossSasResult.dataset.state = 'neutral';
    elements.crossSasResult.textContent = '本端已確認，等待另一端確認。';
  } else if (status.canPresent) {
    elements.crossSasResult.dataset.state = 'neutral';
    elements.crossSasResult.textContent = status.confirmed
      ? '本端已確認，等待另一端確認。'
      : '請在兩個分頁確認七個 emoji 完全一致，再各自按下確認。';
  } else if (status.requestReceived && !status.requestAccepted) {
    elements.crossSasResult.textContent = '收到核對請求，請在 B 分頁接受。';
  } else if (status.connected) {
    elements.crossSasResult.textContent = crossTabRole === 'A'
      ? '已連線。按「發起核對」開始。'
      : '已連線，等待 A 分頁發起核對。';
  }
  elements.crossSasConnectA.disabled = Boolean(crossTabDevice);
  elements.crossSasCopyB.disabled = Boolean(crossTabDevice);
  elements.crossSasStart.disabled = !crossTabDevice || crossTabRole !== 'A' || status.requestAccepted || status.cancelled || status.done;
  elements.crossSasAccept.disabled = !crossTabDevice || crossTabRole !== 'B' || !status.requestReceived || status.requestAccepted || status.cancelled;
  elements.crossSasConfirm.disabled = !crossTabDevice || !status.canPresent || status.confirmed || status.cancelled || status.done;
  elements.crossSasReject.disabled = !crossTabDevice || !status.canPresent || status.cancelled || status.done;
  elements.crossSasCancel.disabled = !crossTabDevice || status.cancelled || status.done;
}

async function connectCrossTab(role) {
  if (crossTabDevice) return;
  const sessionId = elements.crossSasSession.value.trim();
  crossTabRole = role;
  elements.crossSasConnectA.disabled = true;
  elements.crossSasCopyB.disabled = false;
  elements.crossSasResult.dataset.state = 'neutral';
  elements.crossSasResult.textContent = `正在以裝置 ${role} 等待另一個同源分頁…`;
  try {
    crossTabDevice = await createCrossTabSasDevice({
      role,
      sessionId,
      onChange: renderCrossTabStatus,
    });
    renderCrossTabStatus(await crossTabDevice.getStatus());
  } catch (error) {
    crossTabDevice?.close();
    crossTabDevice = undefined;
    elements.crossSasConnectA.disabled = false;
    elements.crossSasCopyB.disabled = false;
    elements.crossSasResult.dataset.state = 'error';
    elements.crossSasResult.textContent = error?.message ?? String(error);
  }
}

elements.crossSasConnectA.addEventListener('click', () => connectCrossTab('A'));
elements.crossSasCopyB.addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('sasSession', elements.crossSasSession.value.trim());
  url.searchParams.set('sasRole', 'B');
  try {
    await navigator.clipboard.writeText(url.toString());
    elements.crossSasResult.textContent = 'B 分頁連結已複製，請在同一瀏覽器開啟。';
  } catch {
    elements.crossSasResult.dataset.state = 'error';
    elements.crossSasResult.textContent = `請複製此連結到另一分頁：${url}`;
  }
});
elements.crossSasStart.addEventListener('click', async () => {
  try { await crossTabDevice?.start(); } catch (error) {
    elements.crossSasResult.dataset.state = 'error';
    elements.crossSasResult.textContent = error?.message ?? String(error);
  }
});
elements.crossSasAccept.addEventListener('click', async () => {
  try { await crossTabDevice?.accept(); } catch (error) {
    elements.crossSasResult.dataset.state = 'error';
    elements.crossSasResult.textContent = error?.message ?? String(error);
  }
});
elements.crossSasConfirm.addEventListener('click', async () => {
  try { await crossTabDevice?.confirm(); } catch (error) {
    elements.crossSasResult.dataset.state = 'error';
    elements.crossSasResult.textContent = error?.message ?? String(error);
  }
});
elements.crossSasReject.addEventListener('click', async () => {
  try { await crossTabDevice?.rejectMismatch(); } catch (error) {
    elements.crossSasResult.dataset.state = 'error';
    elements.crossSasResult.textContent = error?.message ?? String(error);
  }
});
elements.crossSasCancel.addEventListener('click', async () => {
  try { await crossTabDevice?.cancel(); } catch (error) {
    elements.crossSasResult.dataset.state = 'error';
    elements.crossSasResult.textContent = error?.message ?? String(error);
  }
});

const sasUrl = new URL(location.href);
const sasSessionFromUrl = sasUrl.searchParams.get('sasSession');
const sasRoleFromUrl = sasUrl.searchParams.get('sasRole');
elements.crossSasSession.value = sasSessionFromUrl ?? `verify-${crypto.randomUUID().slice(0, 8)}`;
if (sasRoleFromUrl === 'B' && sasSessionFromUrl) void connectCrossTab('B');

setEngineState('尚未載入');
elements.open.disabled = true;
