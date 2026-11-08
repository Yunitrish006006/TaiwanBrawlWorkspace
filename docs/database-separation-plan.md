# 系統資料庫拆分計劃

狀態：CD-01 至 CD-03 本機 schema、搬移排練、來源選擇與帳號生命週期已實作驗證；未建立遠端資料庫、未搬移正式資料、未切換部署。

使用者已確認改採「主系統、社交、遊戲」三庫；情侶併入社交庫，取代先前情侶獨立庫方案。遊戲先共用一個遊戲專用 DB，內部按遊戲 namespace 隔離。以下新實體名稱為提案。

| 資料庫 | Binding | 範圍 |
|---|---|---|
| taiwan_brawl_db（既有） | DB | 帳號、個人資料、session、推播裝置註冊 |
| taiwan_brawl_social_db（待建立） | SOCIAL_DB | 好友、封鎖、社交房間邀請、聊天伺服器資料，以及情侶關係、邀請與日期提案 |
| taiwan_brawl_games_db（待建立） | GAME_DB | Mini Royale 的 mini_royale_* 表；後續遊戲的伺服器資料按 game namespace 隔離 |

此表是目標配置。既有後端 wrangler.jsonc 目前仍只有 DB。本機 Hive 存檔、KV 資源與 Durable Object 房間不隨本次規劃自動搬移；射箭與街頭拾荒的本機存檔不因此自動變成雲端存檔。

社交搬移清單：friend_requests、friendships、user_blocks、room_invites、chat_messages、pending_messages、chat_devices、chat_pending_message_acks。新增 couple_relationships、couple_active_members、couple_requests、couple_date_proposals 與必要 audit 均在 SOCIAL_DB。chat_devices 是聊天裝置信任／投遞資料，與留在主庫的 push_registrations 不同。主庫保留 users、sessions；遊戲庫承接 mini_royale_*。

## 實作切片

1. 盤點所有 env.DB 呼叫、JOIN、外鍵、migration、seed、管理 API、測試 fixture 與部署腳本；固定主庫／社交庫／遊戲庫責任與逐表清單。
2. 各庫獨立 binding 與 migration 目錄；遊戲庫內保留 mini_royale_* 命名。不得把主庫 users/session 複製成第二個身分權威。
3. 遊戲 repository 使用 GAME_DB，好友／聊天／情侶 repository 使用 SOCIAL_DB。主庫驗證登入身分，社交庫驗證好友／封鎖；跨庫 user_id 是邏輯參照，不保留跨庫 SQL 外鍵／JOIN。聊天房間、signaling、推播派送與遊戲邀請的 consumer 也須改用正確來源。
4. 在隔離環境分別排練社交與遊戲資料複製，保留原 ID、訊息 cursor、receipt 與 pending 狀態；核對逐表筆數、內容與關聯。將跨 users 的 JOIN 拆成受權限保護的服務查詢，測試使用者刪除。
5. 建議分批暫停受影響的社交／遊戲寫入（包含背景派送、ack、房間寫入），完成最後增量與校對後各自切換 binding；讀寫 owner 必須一致。若採雙寫，先補上失敗與去重設計。社交搬移完成才啟用情侶正式寫入，不能同時維護兩份好友權威。
6. 保留舊表作受控回復來源。新庫開始有寫入後，不可直接切回過時舊表；需暫停寫入並反向同步／核對。另行批准清理前不刪舊資料。
7. 跑 backend owner、frontend consumer、migration rehearsal 與真實環境 smoke checks，再分別記錄本機與部署狀態。

## 跨庫一致性

好友、封鎖與情侶同在 SOCIAL_DB。刪好友／封鎖、解除情侶、失效邀請及日期提案應在同一社交庫原子操作完成；並行接受也在同庫檢查好友與封鎖狀態，不能先在庫外檢查再獨立寫入。此流程不需要跨庫 outbox。

帳號停用／刪除仍跨三庫：主庫先撤銷身分並在同交易記錄 durable outbox，後端可靠重試清理社交／遊戲資料。消費端以事件 ID 去重並保存帳號終止世代，防止晚到寫入或舊事件復活／誤刪資料。身分驗證失敗或主庫不可用時不得接受新社交／遊戲寫入；對方帳號狀態亦須驗證。跨庫不能宣稱單一交易；CD-00 須定稿驗證後停用的競態與後續清理，不把一次讀取當作跨庫鎖。離線桌面仍遵循最後已知狀態持續計數。

驗收涵蓋同庫接受／封鎖／刪好友競態及完整回滾；跨庫帳號事件重複／錯序、單庫故障、程序中斷後重試、帳號刪除與資料不洩漏。另測聊天 pending/ack 遷移不漏訊息、遊戲邀請仍正確授權、推播註冊由主庫查取。outbox 消費與排程機制須先定稿，不宣稱現有部署已具備。

## 模型與交付

本機結果見 [CD-03 證據](../../taiwan_brawl_back/docs/social-lifecycle-cd03.md)。涉及 schema、資料搬移與跨庫一致性時先執行 model-plan，換模型前告知使用者；固定契約後才交給 Luna 做單一切片。遠端資料庫建立、正式遷移與部署仍須另列執行紀錄。
