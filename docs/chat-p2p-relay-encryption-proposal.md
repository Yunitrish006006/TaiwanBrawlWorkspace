# 聊天 P2P 配對與加密 Relay 企畫書

版本：v0.1（討論稿）  
日期：2026-11-12  
範圍：`taiwan_brawl_front`、`taiwan_brawl_back`、`taiwan_brawl_messaging`

## 1. 企畫結論

目前已經有 P2P 配對基礎，不需要先新增 QR scanner：

- Hosted 模式：由 Cloudflare `SignalRoom` 轉送 WebRTC offer、answer、ICE。
- Manual 模式：使用既有的 negotiation bundle 複製/貼上交換協商資料。
- 裝置信任：使用既有的 Ed25519 公開金鑰邀請與 fingerprint 確認。
- P2P 成功後：WebRTC DataChannel 直接傳送聊天事件。

本企畫只補上缺少的一段：P2P 配對成功後，在 DataChannel 上建立或交換一把 conversation key，讓伺服器 relay 永遠只保存密文。

```text
現有：裝置配對 → WebRTC DataChannel → 明文 MessageEvent
目標：裝置配對 → conversation key → ciphertext MessageEvent → relay 備援
```

操作示意圖：[chat-p2p-relay-operation.html](./chat-p2p-relay-operation.html)

## 2. 問題與目標

### 目前實作狀態與限制

P2P 路徑依賴雙方同時在線；斷線後需要 relay 備援。目前前端已完成 conversation key、AES-GCM envelope、secure storage，以及 relay ciphertext round-trip；後端也會保存加密 envelope 而非明文 body。`relayEncryptionReady` 仍然是 `false`，因此 production relay 尚未開啟，等待真機雙裝置與 Internet/NAT smoke test。

目前使用者流程已簡化為：雙方開啟聊天頁即可自動協商；任一方可從鎖頭「安全配對」UI 按「開始新版配對」重試，不需要同時操作，也不需要手動複製貼上配對資料。

### 目標

1. P2P 成功配對後，建立一個只存在於雙方裝置的 conversation key。
2. relay、D1、push 都不接觸訊息明文。
3. 保留目前的 event id、revision、signature、device ACK 與 cursor 機制。
4. 不新增 QR scanner 作為第一版必要依賴。
5. P2P 失敗時，使用者可以明確選擇 relay；不自動偷偷切換。

### 非目標

- 第一版不做完整 Signal Protocol。
- 第一版不保證多裝置之間自動同步所有金鑰。
- 第一版不把 push notification 當成訊息內容傳輸管道。
- 第一版不改成 socket-first；DM 仍然是 polling-first。

## 3. 使用者操作流程

### 3.0 新版入口：鎖頭按鈕

聊天頁面新增一個鎖頭按鈕，名稱為「安全配對」。一般聊天不需要先進入配對設定；使用者只有在要建立或檢查加密 P2P 關係時，才點擊鎖頭開啟安全配對 UI。

安全配對 UI 顯示目前狀態、主要操作「開始新版配對／重新配對」與 conversation fingerprint。手動複製貼上 negotiation bundle 收在「進階：手動交換配對資料」，只供自動配對失敗、測試或除錯使用。

鎖頭按鈕是新版流程的唯一主要入口；手動複製貼上不放在一般聊天輸入區，也不作為預設操作。

### A. 第一次配對

1. 使用者 A 開啟好友聊天，點擊鎖頭按鈕「安全配對」。
2. 在安全配對 UI 點擊「開始新版配對」。
3. App 透過現有 Hosted `SignalRoom` 自動嘗試 WebRTC；一般使用者不需要複製貼上密碼或 negotiation bundle。
4. WebRTC DataChannel 建立後，雙方交換一次 key-establishment payload。
5. 雙方顯示相同的短 fingerprint；使用者確認後，將 conversation key 加密保存於本機 secure storage。
6. 顯示「已完成安全配對」，鎖頭變成已配對狀態。

### B. P2P 正常聊天

1. 新訊息先寫入本機 durable outbox。
2. P2P 可用時，傳送原本的 signed event。
3. 對方驗證 signature 後寫入本機 message store。
4. 本機 ACK outbox；不經過伺服器 relay。

### C. P2P 中斷後使用 relay

1. App 顯示「P2P 暫時不可用，是否使用加密 relay？」。
2. 使用者選擇「使用 relay」。
3. App 將 event body 加密成 `ciphertext`，再 POST 到 `/api/chat/dm/:friendId/event`。
4. Worker/D1 只保存密文與事件 metadata。
5. 接收端 polling、解密、驗證、寫入本機後才 ACK。

### D. 金鑰失效或撤銷

1. 任一端撤銷對方裝置信任，conversation key 標記為 revoked。
2. 下一次 P2P 配對建立新 key。
3. 舊 ciphertext 不重新解密；是否保留歷史訊息由產品決策另定。

## 4. 第一版加密設計

### 4.1 金鑰來源

第一版沿用現有 P2P 配對作為金鑰建立管道，不新增 QR。配對成功後，雙方使用 WebRTC DataChannel 交換 ephemeral key material，透過既有已確認的裝置身份與 fingerprint 綁定到指定 conversation。

建議採用成熟 cryptography package 提供的 authenticated encryption API，例如 X25519 key agreement 加 HKDF，再用 AES-GCM 或 ChaCha20-Poly1305 加密。實際演算法與 package API 在實作前需先做一次小型 spike，不在企畫階段自行發明 wire format。

### 4.2 Relay payload

第一版將 event body 從明文改為密文欄位：

```json
{
  "eventId": "event-123",
  "messageId": "message-123",
  "conversationId": "1:2",
  "type": "created",
  "revision": 0,
  "createdAt": "2026-11-12T10:00:00.000Z",
  "deviceId": "device-a",
  "encryption": {
    "version": 1,
    "algorithm": "x25519-hkdf-aead",
    "keyId": "conversation-key-1",
    "nonce": "base64url..."
  },
  "ciphertext": "base64url...",
  "signature": "ed25519:..."
}
```

伺服器只驗證結構、參與者、event id 去重與存取權限；不解密、不重新簽署、不把密文轉成 push 內容。

### 4.3 本機保存

- conversation key：secure credential storage。
- message body：現有加密本機 store。
- key metadata：conversation id、key id、peer device id、fingerprint、created/revoked 時間。
- durable outbox：保留原 event id，重試時不可重新產生另一個 event id。

## 5. Relay 與 ACK 行為

目前的 device-level ACK 設計保留不變：

- 每台接收裝置註冊自己的 `deviceId`。
- pending query 只返回該 device 尚未 ACK 的事件。
- 接收端完成「解密 → signature 驗證 → 本機 durable ingest」後才 ACK。
- 所有 active receiver devices 都 ACK 後，伺服器才刪除 pending row。

解密失敗、未知 `keyId`、signature 失敗或本機寫入失敗，都不能 ACK；該 row 必須可再次 polling。

## 6. 程式責任切分

| 區域 | 責任 |
|---|---|
| `taiwan_brawl_messaging` | 加密 payload 的 domain contract、key resolver port、解密失敗與 retry 語意 |
| `taiwan_brawl_front` | P2P key establishment、secure storage、encrypt/decrypt adapter、UI 狀態 |
| `taiwan_brawl_back` | 只保存 ciphertext、驗證 envelope、pending polling、ACK、push metadata |
| `TaiwanBrawlWorkspace` | contract、測試矩陣、操作說明與證據界線 |

## 7. 分階段執行計畫

### Phase 0：確認現有基礎

- 確認 hosted WebRTC pairing 的 session isolation。
- 確認 manual bundle 可完成雙端配對。
- 確認現有 trusted-device invitation/fingerprint 可取得對端身份。
- 補一份 key lifecycle contract，不改 production relay。

### Phase 1：本機加密 spike

- 建立獨立的 `ConversationKeyProvider` 與 AEAD adapter。
- 測試 encrypt/decrypt、nonce 不重複、錯 key、錯 nonce、ciphertext 被竄改。
- 先用 in-memory transport，不接 Worker。

### Phase 2：P2P 配對後建立 key

- P2P DataChannel 建立後交換 key-establishment payload。
- 將 key id 與 fingerprint 綁定。
- 雙端測試 key 建立與重連不重複產生錯誤 conversation。

### Phase 3：Relay ciphertext

- 後端 pending schema 加入 ciphertext/encryption metadata，保留 legacy rows 的讀取邊界。
- frontend relay 只送密文。
- push 改為 metadata-only。
- `relayEncryptionReady` 經 integration test 後才可設為 true。

### Phase 4：裝置與撤銷

- 新裝置重新配對。
- 撤銷裝置後禁止使用舊 key 發送新訊息。
- 定義舊訊息是否可讀與 key rotation retention policy。

## 8. 驗收條件

- P2P 配對成功後，兩端能建立相同 conversation key。
- relay D1 中看不到明文 message body。
- push payload 不包含訊息內容。
- relay 接收端可在 offline 後 polling、解密、驗證並完成 ACK。
- 解密失敗不會 ACK，且可重試。
- 同一 event 重送不會產生重複訊息。
- P2P 失敗時不會未經使用者選擇自動切 relay。
- Hosted 與 manual pairing 都有測試；physical device / Internet NAT 另標記為 `NOT_EVALUATED`，直到有實機證據。

## 9. 尚待決定的產品問題

1. conversation key 是否以「每一對好友」為單位，還是每個聊天 session 都重新建立？
2. 一個帳號新增第二台裝置時，是否必須由既有裝置批准？
3. 撤銷裝置後，舊訊息要保留可讀，還是立即視為不可解密？
4. P2P 配對失敗時，是否允許使用者手動貼上 negotiation bundle，或只保留 hosted pairing？
5. relay fallback 的 UI 文案要使用「加密 relay」還是「伺服器暫存傳送」？

## 10. 明確限制

本企畫書描述的是實作計畫，不代表 relay E2EE 已完成，也不代表 P2P 已在實體裝置與 Internet NAT 環境驗證。完成 Phase 3 並通過 owner/consumer 測試前，不應將產品宣稱為「已完成端到端加密聊天」。
