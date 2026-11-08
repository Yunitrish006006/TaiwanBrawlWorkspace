# CD-00：三庫與情侶功能工程契約 v1

狀態：設計定稿。後續 CD-01／CD-02 已完成本機 schema、D1 交易及受開關保護的 API；正式啟用、前端與原生元件待後續。本契約與 [JSON 範例](contracts/couple-days-v1.fixtures.json) 是 owner/consumer 設計輸入；驗證結果以 [任務書](couple-days-implementation-taskbook.md) 為準。

## 1. Owner 與資料邊界

| Binding／目標庫 | 唯一權威資料 |
|---|---|
| DB／taiwan_brawl_db | users、sessions、push_registrations；新增帳號狀態／世代與 lifecycle_outbox |
| SOCIAL_DB／taiwan_brawl_social_db | friend_requests、friendships、user_blocks、room_invites、chat_messages、pending_messages、chat_devices、chat_pending_message_acks；新增 couple_relationships、couple_active_members、couple_requests、couple_date_proposals、couple_operations、couple_audit、account_tombstones、lifecycle_receipts |
| GAME_DB／taiwan_brawl_games_db | 既有七組 mini_royale_* 表；新增 account_tombstones、lifecycle_receipts，未來按 gameId 隔離 |

backend 擁有 DB 與 API 實作，frontend 擁有 consumer、日期呈現、快取及原生 bridge，coordination 擁有本設計。現行 wrangler 僅配置 DB，新增庫名尚未建立。DB 的舊 migrations 保留歷史，新社交／遊戲 migration 分別置於 migrations/social 與 migrations/games，配置各自 migrations_dir；主庫新遷移留在既有 migrations 根目錄。

users 不複製成社交／遊戲身分權威。跨庫 userId 不做 SQL FOREIGN KEY／JOIN；好友 overview 在服務層批次取得主庫允許的公開 profile 欄位，禁止帶 email、session、LLM 設定或密鑰。社交庫內 member→relationship 等外鍵繼續保留。

搬移保留原有整數 ID、chat cursor、ack 及訊息排序；couple 新資源 ID 使用後端產生的 UUID 字串，userId 沿用正整數。更新 friends、chat、signaling、room invite、push consumer 的資料來源；推播註冊讀 DB，好友／pending 讀 SOCIAL_DB。KV、Durable Objects 與本機 Hive 不搬移。

## 2. 資料約束與時間

- 關係：id、user_a_id < user_b_id、started_on、status active/ended、version（從 1 遞增）、created_at、updated_at、ended_at、ended_reason。歷史 pair 不設永久唯一。
- active member：user_id PRIMARY KEY、relationship_id FK。每個 active 關係恰好兩位成員，且必須是雙方；ended 不留佔位。不可用 INSERT OR IGNORE 忽略佔位衝突。
- request：id、排序 pair、requester_id、recipient_id、proposed_started_on、status、created_at、expires_at、responded_at、relationship_id。pending pair 設 partial unique；反向邀請回傳既有 request，不自動接受。
- proposal：id、relationship_id、requester_id、proposed_started_on、base_version、status、created_at、expires_at、responded_at。每個 relationship 最多一筆 pending；修改提案必須先撤回重送。
- request/proposal：pending → accepted/declined/cancelled/expired/invalidated；終態不可再接受。服務時鐘 now >= expiresAt 即失效，期限為建立時間加 604800 秒，不依裝置日期計算。拒絕後可立即新邀請。
- 所有對外時間戳為 UTC ISO-8601；startedOn 為 Gregorian YYYY-MM-DD，範圍 1900-01-01 至操作者當地今天。提交與接受都提供有效 IANA timeZone；以 serverNow 驗證上限。接受者當地尚未到日期則拒絕接受，保留 pending。
- dayCount 為裝置計算：max(1, ordinal(localToday) - ordinal(startedOn) + 1)，不持久化。雙方相同起始日可因當地日期不同而天數不同。max(1) 僅處理旅行跨日期線，不允許輸入未來日期。

## 3. API v1（新功能契約，不改舊好友 response）

所有回應 Cache-Control: private, no-store；同一個 serverNow 用於一次操作。GET overview 回傳關係與 pending arrays，不回傳共用 dayCount。成功使用 200，建立 request/proposal 使用 201；回傳已存在的 pending 使用 200。

| Method / path | JSON body／回應 data |
|---|---|
| GET /api/couples/overview | 無 body；relationship（無則 null）、incomingRequests、outgoingRequests、dateProposal（無則 null） |
| POST /api/couples/requests | targetUserId、startedOn、timeZone、operationId；回 request |
| POST /api/couples/requests/:id/accept | timeZone、operationId；回 relationship |
| POST /api/couples/requests/:id/reject | operationId；回 request |
| POST /api/couples/requests/:id/cancel | operationId；回 request |
| POST /api/couples/:id/date-proposals | startedOn、timeZone、expectedVersion、operationId；回 proposal |
| POST /api/couples/date-proposals/:id/accept | timeZone、operationId；回 relationship 與 proposal |
| POST /api/couples/date-proposals/:id/reject 或 cancel | operationId；回 proposal |
| POST /api/couples/:id/end | operationId；回 ended relationship |

接受／拒絕只有收件者可做；撤回只有發件者可做。解除只有當前關係任一成員可做。date proposal 不改 pending 期間的 startedOn，接受時校驗 base_version；解除不要求 expectedVersion，避免另一方改日期阻止解除。自選 operationId 為 UUID，作用域為 authenticated userId，與 X-Request-ID（追蹤單次 HTTP）分開。

成功 envelope：{ok:true,serverNow,data}。request 含 id、requesterUserId、recipientUserId、startedOn、status、createdAt、expiresAt、relationshipId；proposal 含 id、relationshipId、requesterUserId、startedOn、baseVersion、status、createdAt、expiresAt。relationship 含 id、partnerUserId、startedOn、status、version、updatedAt、endedAt。actor ID 一律從 session 推導，不接受 body 指定。

所有情侶 API 請求必須帶 `X-Expected-Account-ID`，值為客戶端發出請求時選取的帳號數字 ID。伺服器先由 session 驗證身分並比對此標頭，再讀取或修改情侶資料；標頭缺少或不相符回 `409 ACCOUNT_MISMATCH`。此標頭只是帳號切換期間的防護，不是認證憑證，CORS 預檢需允許此標頭。

overview 只列 pending request/proposal；過期以 serverNow 過濾，不依賴清理排程。ended 回應不包含 dayCount，overview 的 relationship 為 null；完整 ended object 只供該次解除回應與操作結果。尚未同步的舊 active 快照仍可能在離線呈現。

| HTTP／code | 語意／UI |
|---|---|
| 400 INVALID_BODY | 格式錯誤、未知欄位或缺必要欄位；保留草稿 |
| 401 UNAUTHENTICATED | session 無效；清除登入範圍狀態，要求登入 |
| 403 REQUEST_ORIGIN_DENIED | cookie 寫入來源不受信任；停止操作 |
| 404 NOT_FOUND | 不存在或無權查看的資源，回相同錯誤 |
| 409 RELATIONSHIP_UNAVAILABLE | 非好友、封鎖或一方已有情侶；不透露誰與誰綁定 |
| 409 ACCOUNT_MISMATCH | 請求選取帳號與 session 不符或缺少標頭；不讀取、不修改資料 |
| 409 REQUEST_NOT_PENDING / VERSION_CONFLICT | 終態、已過期或日期版本衝突；刷新狀態 |
| 409 OPERATION_ID_REUSED | 同操作 ID 不同內容；不得自動重試 |
| 422 INVALID_DATE / INVALID_TIME_ZONE | 不合法／未來日期或無效時區；提示修正 |
| 429 RATE_LIMITED | 一般技術限流，附 Retry-After；不新增拒絕冷卻 |
| 503 DEPENDENCY_UNAVAILABLE | 任一必要資料庫不可用；保留草稿，不宣稱成功 |

錯誤 envelope：{ok:false,error:{code,message},requestId}。這是 couples 新路由的 typed error，不能直接沿用現行 withBadRequest 將所有錯誤變 400；既有好友 API 本階段維持 response 相容。

operation ledger（SOCIAL_DB）：actor_id + operation_id 主鍵、method/path/canonical-body hash、result_json、status_code、committed_at。相同鍵同 hash 重播原結果，另標 replayed:true；不同 hash 409。每次重播仍先驗證 session 及資源成員權限，不能因 ledger 繞過撤銷。成功結果與操作同 transaction 保存，失敗回滾不留下成功記錄。v1 不自動清除此 ledger，後續清理需保留不重執行 tombstone；重播舊結果不能覆蓋較新的 overview／關係版本，寫入後刷新 overview。

## 4. 同庫交易設計審查

採 SOCIAL_DB.batch(prepared statements)，在單批 SQL 內以條件 DML、UNIQUE／CHECK／FK 約束及 guard assertion 決定成功。不可用 JS 先 SELECT、await 後單獨寫入來保證條件。Cloudflare 文件確認 batch 的交易回滾；不等於已實測本專案的 SQL。

guard 具體模式：新增內部 couple_write_guards(operation_id PRIMARY KEY, passed INTEGER NOT NULL CHECK(passed=1))。批次的條件 DML 後以 INSERT guard SELECT operationId, CASE WHEN 全部預期後置條件成立 THEN 1 ELSE 0 END 觸發失敗；成功批次末端刪 guard。不可把「UPDATE 0 rows」視為會自動拋錯。UUID 在送 batch 前產生，使後續 SQL 可引用固定 ID，不依賴 batch 中間回到 JS 取 last_insert_rowid。SQL 細節及本機 D1 測試由 CD-01 擁有。

接受邀請單批次順序：

1. 在同批次驗證 pending、收件者、未過期、有效 friendship、雙向無 block、無 account tombstone；以條件 INSERT 建 active 關係。
2. INSERT 兩位 member，user_id 唯一衝突使整批回滾；guard 確保 relationship 及兩筆成員恰好匹配，不能部分成功。
3. 消耗原邀請、失效涉及雙方的其他 pending 邀請，寫 audit 與 operation 成功結果；guard 再檢查原邀請 accepted 並指向新 ID。

日期接受以 active、baseVersion、pending 及期限條件 UPDATE started_on，version+1；guard 驗證提案版本與結果。刪好友／封鎖採同批更新好友／block、結束關係、刪 member、失效兩方 pending 提案／邀請；驗收並行接受只可能被拒絕或隨後被完整解除。所有關係終止均寫 audit，重新交往用新 ID。

CD-01 runtime gate：實際本機 workerd D1 batch 的第二位 member 衝突、guard 失敗、重複 operation、不同邀請同時接受、接受與 block/remove 競態皆需驗證全 rollback／唯一成功。SQLite 純本機證據只能補充，不能替代此 gate。避免任意 BEGIN/COMMIT 橫跨 Worker awaits。

## 5. 跨庫身分撤銷與安全

主庫 users 新增 lifecycle_status active/deleting/disabled、lifecycle_epoch；首次遷移 active/1。此為待實作 schema，不宣稱現有 users 已有停用欄位。couples 新操作由 DB 驗證 actor 與對方 active，並在 SOCIAL_DB 檢查終止投影。對外回應前再次檢查主庫；無法驗證回 503。主庫變更與社交提交無全域鎖，已在途操作仍可能短暫提交，契約明定補償清理，不宣稱即時全庫線性一致。

主庫停用／刪除同一 batch：狀態改終止、epoch+1、撤銷 sessions、插 lifecycle_outbox(eventId,userId,epoch,type,payload,createdAt)。Worker scheduled 每分鐘掃 due events；每目標庫獨立 ack。社交／遊戲消費在同庫 batch 寫 receipt(eventId PRIMARY KEY)、更新 max epoch tombstone、失效或清理資料。舊 epoch 不能覆蓋新 epoch，重送不產生第二次副作用；關係重新建立不得清除帳號 tombstone。

主庫 outbox 的 ack 只有目標庫提交後才能寫。重試 1/2/4/8/最多 60 分鐘，永不因次數超限丟棄；記 attempt、nextAttemptAt、lastErrorCode、completedAt，監測超過 5 分鐘未完成。帳號終止不支援復活，重新註冊分配新 userId；實際個資移除依既有刪除政策實作。consumer tombstone 拒絕晚到的背景寫入；若在終止事件送達前提交，由 cleanup 補償。

已知現況：cookie SameSite=None、工具僅提供 CORS response headers；未見全域 cookie mutation Origin 檢查。新 couples POST 必須 JSON Content-Type；cookie 模式驗證 Origin 等於 request origin 或明確開發 allowlist，缺失／拒絕為 403；Bearer native 可無 Origin，帶 Origin 仍須合法。禁止以只設 Access-Control-Allow-Origin 當 CSRF 驗證。operationId 在 JSON body，沿用現有 preflight headers，不新增不必要 header。

## 6. Frontend 與元件 schema

新增 CouplesRemoteSource／CouplesService，由 composition root 注入 ApiClient；FriendsRemoteSource 不放直接資料庫或平台程式。型別遵守 JSON fixture；首頁／好友頁服務刷新以帳號與 session generation 隔離。單一 in-flight、前景 60 秒同步，回前景／網路恢復立即；錯誤退避與跨日處理沿既定任務書。

WidgetSnapshot v1：schemaVersion、accountScope（本機不透明帳號鍵）、sessionGeneration、requestSequence、relationshipId、relationshipVersion、startedOn、status、lastSyncedAt。清除快照／登出使用較新 sessionGeneration，晚到寫入不得復活舊資料；原生端替換快照也須驗證 generation，不能只靠 Dart 預檢。同 generation 以遞增 requestSequence 排序；generation 必須由原生持久化配置，不能隨 Dart 程序重啟歸零。timeZone 每次取系統當前值；不存 validUntil、照片或憑證。2026-11-09 使用者改為要求伴侶名稱與天數：v1 新增可選 partnerName（最多 80 Unicode code points，原生上限 160 UTF-16 units，不能含控制字元），只允許 active 保存；舊九欄快照仍可讀，缺名字時顯示天數。名字來自受身分保護的 overview 主庫使用者資料；解除、登出與換帳號依同一 generation／sequence 清除。唯讀離線 counterProjection 仍只傳 schemaVersion／startedOn／lastSyncedAt，不帶名字。六種配色獨立於關係快照，保存在裝置偏好，無需伴侶同意。無 active 顯示已定義空狀態；失聯持續計數。

relationshipVersion 不足以排序不同關係（新關係又從 1 起算）；overview 回應以本地請求序號、session generation 及單一 in-flight 排序。重播的 mutation 結果不直接替換快照，必須刷新 overview。

## 7. 實作啟動條件與範例驗收

CD-00 完成設計輸入；CD-01 先做隔離的三庫 schema／搬移 rehearsal 與 D1 batch gate，未通過前不能切正式 binding。社交來源切換後才開情侶寫入。原始 migrations 的跨 users FK 要改為邏輯參照，保持本庫 FK；切換所有前景及背景 writer，保留可核對的舊表，回復前同步新寫入。

固定 fixtures 覆蓋建立／接受、第三方不可見、改日期版本衝突、未來日期拒絕、無冷卻重新邀請、7 天邊界與跨時區天數。後端測試消費 request 與 expected HTTP，前端測試消費 success/error envelopes；CD-02、04 必須共用這份版本化範例的資料，避免自行重定義。

CD-00 驗證：JSON 可解析、範例包含必要欄位、日期期望與 7 天截止可重算、workspace validation／tests／render／diff check。尚無 runtime 測試結果；CD-01 gate 明列待做。不把此設計塞進現行 data/contracts.json，待生產 owner 實作形成事實後再同步 source-state。

官方技術依據：[D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)。

本次執行結果：8 個情境範例、4 個日期及 2 個所在地時區計算檢查通過，7 天期限與 widget 欄位檢查通過；workspace validation 720 checks、npm test 81 + 79 項通過、viewer generation 與 diff check 通過。這些是文件／既有 workspace 驗證，沒有測試尚未實作的 API／SQL。
