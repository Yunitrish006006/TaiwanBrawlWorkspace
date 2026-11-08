# Taiwan Brawl 聊天功能計畫

盤點日期：2026-10-28\
範圍：一對一私訊、離線保存、P2P 傳輸與必要的伺服器相容層。這份文件將聊天
工作獨立排序；其他遊戲、遊戲資源發布與整體重構不和聊天功能混在同一批交付。

需要產品／架構決策時，使用本機[聊天計畫選擇介面](../apps/plan_selector/README.md)：
`http://127.0.0.1:9092/?plan=chat`。目前 8 項決策都已回答；加密引擎題選擇「先做跨平台
可行性小樣」，這只代表先調查，不代表已選定正式加密引擎。選項先保存在本機草稿；已確認選擇紀錄保存在
`../.local/plan-selector/chat.json`。

## 產品目標

玩家在曾登入並建立好友關係後，可以開啟一對一對話。訊息先安全保存於本機；有可用
連線時優先直接 P2P 傳送，暫時離線時留在送件匣並在連線恢復後重試。玩家可以查看
本機歷史、編輯自己的訊息，或收回訊息。收回後兩端都顯示「訊息已收回」，即使對方
已讀仍可收回。推播可顯示好友名稱與訊息預覽，但只作通知，不作訊息資料來源。

目前確認的傳輸方向是 P2P 優先。手動交換已簽章的連線資料可在沒有 hosted signaling
的情況下建立連線；一般登入／好友探索仍需要先前建立的帳號與好友資料。伺服器 relay
預計只在端對端加密就緒、且玩家明確同意後使用；正式 App 目前阻擋未加密的 relay event。

## 已確認的聊天產品決策

- **P2P 暫時連不上：**先提示玩家，再由玩家決定是否交由伺服器 relay；不自動切換。
- **建立 P2P 連線：**自動 signaling 優先，服務不可用時保留手動交換方式。
- **伺服器 relay 隱私：**要求端對端加密；relay 只能保存與轉送密文。現有事件簽章、TLS
  及本機資料加密不等於端對端加密；在 E2EE payload 與金鑰流程完成前，不宣稱 relay
  看不到內容。
- **金鑰復原：**玩家自行保管復原詞；若復原詞遺失，服務商無法代為恢復。復原詞不得
  傳給伺服器，需以安全 KDF 派生復原金鑰並提供驗證及輪替流程。
- **新裝置同步歷史：**由玩家主動透過已啟用的舊裝置同步；新舊
  裝置必須同時開啟、在線並完成信任確認。計畫不假設伺服器長期保存聊天歷史；斷線續傳
  和裝置撤銷列為設計需求；傳輸內容必須端對端加密。
- **推播內容：**顯示好友名稱與訊息預覽。這會把通知內容暴露給鎖定畫面及推播服務；
  即使訊息正文已端對端加密，也不能宣稱推播預覽受端對端加密保護。
- **多裝置 relay ack：**每台啟用裝置分別確認；只有所有啟用裝置都收妥後才刪除 relay
  事件。裝置撤銷會停止計入待確認集合；長期離線裝置的保留期限與到期處理需在實作中
  明確定義，不能默默丟棄未同步事件。

## 功能分類與現況

狀態定義：**已實作**表示程式及相應自動測試存在；**待端到端驗收**表示現有測試
不足以證明真實裝置或正式環境行為；**待做**表示尚未形成可交付功能。

| 分類 | 功能 | 現況與邊界 |
|---|---|---|
| 對話與訊息 | 好友一對一對話、即時列表投影、文字訊息、已讀狀態 | 已實作；UI 與服務使用穩定 message ID 和共享事件投影 |
| 對話與訊息 | 編輯自己送出的訊息 | 已實作事件模型；Chrome 雙 peer 覆蓋建立、讀取與編輯流程；真機仍待驗收 |
| 對話與訊息 | 收回自己送出的訊息；對方已讀仍可收回；以「訊息已收回」取代內容 | 已實作事件模型與 UI 投影；跨真機、重連及舊版資料情況待端到端驗收 |
| 對話與訊息 | 依時間及穩定 row ID 載入舊訊息，保留捲動位置 | 已實作伺服器歷史分頁和前端載入；本機離線歷史仍由本機事件庫提供 |
| 本機與離線 | 加密保存訊息、事件投影和待送事件 | 已實作 Hive AES store，金鑰由平台 credential adapter 注入；VM close/reopen 已驗證 outbox 與 cursor 還原，真機程序終止及備份復原仍待驗收 |
| 本機與離線 | 離線仍可讀取已同步到此裝置的歷史；離線送出的事件稍後重試 | 已實作本機 outbox 與 MessageSyncEngine retry；跨裝置送達依對方再次連線或可用 relay |
| P2P 連線 | WebRTC DataChannel 傳事件 | 預設開啟；已有 Chrome loopback 兩 peer runtime 測試，不等於兩台真機或 Internet NAT 驗收 |
| P2P 連線 | 手動交換 signed offer／answer／ICE，不依賴 hosted signaling | 已實作；瀏覽器雙 peer 建連和簽章測試通過；不同網路環境、手機交換操作仍待驗收 |
| P2P 連線 | 自動 hosted signaling | 已有 Worker SignalRoom negotiation relay 與本機 workerd eviction 測試；正式部署、NAT 與真機尚未驗收 |
| 同步與回退 | P2P 不可用時使用 server pending-message relay、cursor 與 ack | 逐裝置 pending、cursor、receipt 與最後一台啟用裝置 ack 後刪除已實作並有 backend／adapter 測試；正式 App 因 E2EE 尚未就緒而 fail-closed，relay event write 目前關閉；推播不是 durable source |
| 身分與信任 | 裝置 Ed25519 簽章、獨立管道核對 fingerprint、拒收未信任／偽造事件 | 已實作；舊 HMAC invitation 僅為遷移相容，仍需私人管道交換 |
| 隱私 | server relay 下的端對端訊息加密與金鑰復原政策 | **待做／需先定義**。目前有傳輸加密、簽章與本機加密，這些不等於伺服器看不到訊息內容 |
| 通知 | FCM 通知提示、未讀對話提示、pending event 接收與 ack | 已實作 provider adapter；需真機推播註冊與前景／背景流程驗收 |
| 舊資料 | Hive 舊訊息逐列驗證、事件提升、快照匯入及重試確認 | 遷移 adapters 已隔離，壞資料保留原列；正式前端預設拒絕舊明文訊息寫入、收回與快照上傳；舊讀取／匯入能力暫留供舊資料遷移，尚未清除 |
| 操作體驗 | 連線狀態、待送／失敗／重試結果、裝置信任狀態清楚呈現 | AppBar 已用圖示／提示呈現 P2P、relay、等待選擇、連線中與失敗；同帳號啟用裝置清單、目前裝置標記、其他裝置 relay 撤銷與活動更新已實作；撤銷尚未撤銷 P2P／E2EE 金鑰信任，待送訊息的整體狀態仍需整合 |

## 分階段交付

每次只開啟一個階段。前一階段的驗收條件通過後，才進入下一階段；其他遊戲和一般
架構整理不插入該階段的實作批次。

### 第 1 階段：一對一聊天可靠性（本機驗收完成）

先鎖定日常聊天的核心閉環，不增加群組、媒體附件或新後端模式。

1. 固定驗收場景：兩個獨立使用者／裝置、同一好友關係、同一對話；分別覆蓋 P2P
   可用與 relay fallback。
2. 驗證送出只建立一個穩定 message ID；重複 flush、重複收到同一 event ID、重連重播
   不得在對話畫面出現兩份訊息。
3. 驗證新增 → 接收端顯示 → 已讀 → 編輯 → 收回的事件順序；兩端最終投影一致，收回
   後只顯示「訊息已收回」，不得因已讀而拒絕收回。
4. 驗證離線建立事件後關閉／重開 App，訊息和 outbox 仍在；重新連線後只送達一次。
5. 驗證收到事件後先持久化，再 ack；本機儲存失敗或驗證失敗時保留可重試狀態。
6. 驗證舊 Hive 歷史載入、cursor 分頁、重複／錯序事件不破壞既有訊息或捲動位置。
7. 統一 UI 的送出中、待連線、失敗可重試、已讀、編輯和收回狀態；每項只補必要文字。

**完成條件：**上述核心流程有可重複的 consumer tests；Chrome 雙 peer P2P 與 server
relay 各自通過；完整前端分析／測試通過；任何無法在本機模擬器驗證的真機項目明確列為
未驗收，不以單元測試代替。

### 第 2 階段：自動 signaling 優先、手動 P2P 備援（本機驗收完成）

在第一階段穩定後，專注自動連線優先及手動備援：產生／複製邀請資料、透過私人管道交換、比對
fingerprint、建立連線、斷線與重新協商。明確區分「沒有 signaling server」和「沒有
網路路徑」：兩台裝置若沒有共同 LAN、可用 ICE 路徑或其他傳輸媒介，P2P 仍無法送達。
先驗證同一 LAN 的真機情境，再評估跨網路 NAT traversal。

### 第 3 階段：斷線恢復與 relay 共存（本機實作完成，外部驗收待做）

定義 P2P 連線失敗後提示玩家並等待 relay 選擇、relay 游標恢復及回到 P2P 的狀態機。每一事件以穩定
ID 去重，relay ack 在本機 durable ingest 後才送出。驗證短暫斷網、程序重啟、對端離線、
同帳號多裝置及 fallback 後回切，不重複、不漏訊息。

### 第 4 階段：隱私、金鑰與資料復原

伺服器 relay 必須只看見密文。依已選方向，採玩家自管復原詞，並讓
已啟用舊裝置在新舊裝置同時在線時同步歷史；須定義金鑰如何授權、撤銷及恢復。分別驗證
本機 at-rest encryption、P2P 傳輸保護、server relay payload 保護；簽章驗證不當作內容加密。

### 第 5 階段：通知與使用體驗補齊

完成真機推播註冊、好友名稱與訊息預覽、前景／背景通知、未讀數更新、點通知回到正確對話；改善連線狀態、
重試入口、信任裝置管理及可存取性。Push 僅提示使用者，訊息仍從 durable store／relay
恢復。

### 第 6 階段：舊格式退場與維護收尾

先確認所有支援裝置完成 Hive 舊資料提升與快照匯入，再制定舊 `/send`、`/recall`、
legacy snapshot 和舊 HMAC invitation 的相容期限。移除前要有遷移統計、回復方案及版本
相容測試；不得直接刪除玩家尚未搬移的本機歷史。

## 執行範圍與已選政策

按階段逐項推進，不一次實作所有功能。第 3 階段先完成逐裝置 relay ack、裝置啟用／撤銷
與安全的保留行為；接著進入第 4 階段，落實 E2EE、玩家復原詞及舊裝置即時歷史同步。
第 5 階段再處理推播與使用體驗，第 6 階段處理舊格式退場。P2P 失敗先詢問再使用 relay；
連線自動優先且保留手動方式。鎖定畫面顯示好友名稱與訊息預覽，因此推播預覽是明確選擇
的資訊暴露面：除非另有可信裝置端本地通知設計，預覽內容可能被推播服務與鎖定畫面讀取，
不受「relay 正文端對端加密」這項承諾涵蓋。

### 第 1 階段現有測試對照

| 驗收面向 | 已有測試 | 尚未覆蓋的範圍 |
|---|---|---|
| UI 快速重複點擊只送一次 | `test/editable_dm_page_test.dart` | UI 層使用 fake service；正式 service 閉環由下方 factory consumer 測試補足 |
| 穩定 ID、重複 event 去重、已讀後仍可編輯／收回 | `packages/shared/taiwan_brawl_messaging/test/message_repository_test.dart` | 共享領域規則已覆蓋；需在端到端 projection 也固定兩端終態一致 |
| 簽章、建立／讀取／編輯／收回跨 WebRTC peers | `test/p2p_webrtc_runtime_test.dart` | Chrome loopback 的 repository／sync runtime；未經完整 DM widget + composition root |
| server relay 編輯／收回、cursor 與 ack | `test/server_message_transport_test.dart` 及 backend chat tests | 使用測試 transport／D1 fixtures；不等於已部署 Worker 或手機網路 |
| 加密本機資料、重開後恢復 inbox/outbox/conflicts | `test/hive_messaging_store_test.dart`、`test/chat_service_factory_test.dart` | encrypted store 測試與 factory restart consumer 已覆蓋 sender outbox 復原／單次 delivery；receiver 真機程序重啟仍待驗收 |
| 離線新增／編輯／收回／已讀及重試 | `test/chat_service_offline_test.dart`、`packages/shared/taiwan_brawl_messaging/test/message_sync_test.dart` | service 與 engine 分層覆蓋；缺少涵蓋完整 App composition 的單一回歸流程 |
| cursor 歷史分頁與舊 Hive 遷移 | `test/legacy_chat_remote_source_test.dart`、`test/legacy_chat_migration_test.dart`、`test/message_chat_sync_adapter_test.dart`、`test/chat_service_factory_test.dart` | 已有正式 service composition 的 cursor 續頁、80 筆訊息投影與載入舊訊息時錨點固定測試；長時間真實對話仍待裝置驗收 |

第 1 階段第一個實作切片**已完成**：新增
`test/chat_service_factory_test.dart` consumer regression，使用正式
`ChatServiceFactory` 組裝兩個 DM session 與可控雙向 transport，驗證訊息只形成一筆投影、
對方已讀後仍可編輯及收回，且兩端最後都顯示收回文字。UI 快速重複點擊另由既有 widget
test 覆蓋；此切片沒有改動 server relay、通知或舊資料清除。

第 1 階段第二個切片**已完成**：同一 factory consumer test 使用加密 Hive store，模擬
程序關閉／重開與 messaging core 重建；離線 pending event 在恢復連線後只投遞一次，
sender outbox 清空，receiver 只留下單一 projection。

第 1 階段第三個切片**已完成**：正式 `ChatServiceFactory` 接入 DM widget，驗證快速連續
操作只送出一個事件、第二則草稿在第一則送出期間保留、失敗重試沿用同一 event ID 且只
形成一筆投影；同一閉環也驗證已讀後編輯／收回會同步到兩端。此切片未改 production code。

第 1 階段第四個切片**已完成**：正式 service composition 載入兩頁共 80 筆 DM 歷史，
第二頁請求使用第一頁 cursor，prepend 舊訊息後可見訊息錨點維持原位。這證明本機 widget
與 service 分頁接合，不代表後端真實長對話或手機捲動效能已驗收。

第 1 階段第五個切片**已完成**：正式 `ChatServiceFactory` 接收端與 durable event store
port 接合，確認 relay receipt 只會在 append 完成後送出；模擬寫入失敗時不 ack，relay
重送後完成持久化並只保留一筆 projection。實際 Hive 加密／重啟另由既有 store 與
composition restart tests 覆蓋；這個測試使用可控 store 精確驗證 ack 時序。

第 1 階段第六個切片**已完成**：test matrix 規定的 Chrome runtime gate 通過，包含兩個
真實瀏覽器 WebRTC peer 的手動簽章協商、訊息建立／讀取／編輯／收回，以及 DM composition、
裝置身分和好友信任測試。兩個需要 `Directory.systemTemp` 的 Hive VM 測試已明確標記為
VM only，仍由 Flutter VM gate 執行；Chrome 的 23 個適用測試通過、2 個 VM-only 測試略過。

第 1 階段第七個切片**已完成**：正式 `ChatServiceFactory` 接入 `ServerMessageTransport`
與 HTTP mock relay，驗證 pending event 先寫入 durable store 才 ack、cursor 往前推進後重複
poll 仍只形成一筆 projection。此為 app-level HTTP adapter consumer 驗收，不等於已部署
Worker、D1 或真實網路驗收。

第 1 階段第八個切片**已完成**：兩個獨立 `ChatServiceFactory` peers 透過 `ServerMessageTransport`
及可控 HTTP relay backend 跑完建立、接收、已讀、編輯、收回；兩端用同一 message ID，
最終投影一致，所有 relay pending rows 都在接收端持久化後 ack 並清空。這是 app-level
HTTP mock consumer 驗收，未替代 D1/Worker 部署或兩台真機網路測試。

第 1 階段：一對一聊天可靠性，**本機驗收完成**。完整前端 VM 測試 299 項通過、3 項
VM-only 略過；聊天 Chrome gate 28 項通過、2 項 Hive VM-only 略過；Flutter 與 shared
messaging package analyze 無問題。測試包含真實瀏覽器 WebRTC 雙 peer 與 HTTP mock relay
的完整 lifecycle consumer 流程。仍待外部驗收：已部署 Worker/D1 的 relay 行為、兩台真機、
實際 Internet NAT 路徑與真實裝置重啟／備份復原。不得把 mock / loopback 證據描述成以上
情境已通過。

第 2 階段：自動 signaling 優先、手動 P2P 備援，**本機驗收完成**。DM 頁面自動發起
連線並使用確定的 offerer/answerer 角色；手動連線使用簽章 bundle 與複製／貼上流程；
前端 signaling URL/auth adapter、Signal API、SignalRoom 及 hibernation tests 已通過。
仍待已部署 Worker WebSocket 和真機網路驗收。

第 2 階段第一個切片**已完成（入口接線驗收）**：打開 DM 頁面會自動呼叫 `connectToDm`，
兩端使用穩定且相反的 caller/answerer 角色；手動 serverless P2P 入口仍可用。新增 widget
測試固定此行為。此測試證明 UI 接線與角色選擇，未證明正式 Worker WebSocket signaling
可連通。

第 2 階段第二個切片**已完成（手動備援 UX 與 signaling adapter contract）**：手動 P2P
介面改為複製／貼上說明，不再提尚未提供的 QR；caller/answerer 依好友 ID 固定，移除玩家
可能設錯的角色選項；測試確認 Prepare 使用穩定角色並顯示可複製 bundle。另新增 hosted
signaling 的 WebSocket URL、platform auth header 測試；後端 signal API、SignalRoom 及
Vitest hibernation 測試通過。這些是 adapter/Worker 測試，尚未證明部署環境實際建立
WebSocket。

第 2 階段本機驗收包含手動簽章 bundle 下的兩個真實瀏覽器 WebRTC peers、頁面自動連線與
角色選擇、備援 UX，以及 hosted signaling contract tests；Worker 部署與真機仍列為外部
驗收。之後切入第 3 階段：斷線恢復與 relay 共存。

第 3 階段第一個切片**已完成（玩家明確選擇 relay）**：P2P 初次連線失敗或傳送失敗時，
不再自動切換 server relay；DM 畫面先顯示本機保留訊息、relay 可能讀取內容且 E2EE 尚未
決定的說明，再由玩家選「繼續等待」或「使用伺服器 relay」。選 relay 後沿用原 outbox
event ID 並恢復同步；拒絕時事件留在 outbox。測試覆蓋 transport 不自動連線 relay、ChatService
選擇後才 flush 原事件、DM 連線／送出錯誤出現選擇 UI。接下來補短暫斷線／重啟恢復、relay
失敗重試、重開對話時回到 P2P 的狀態驗收，再核對 UI 連線狀態是否能清楚呈現。

第 3 階段第二個切片**已完成（relay 重試與新對話回到 P2P）**：玩家同意 relay 後若
relay 連線也失敗，狀態仍保留為待處理；再次選擇 relay 會重試 relay，不會悄悄切回
P2P，也不會自動送出。關閉並重開對話會建立全新 transport，重新先試 P2P，原 session
的 relay 選擇不會沿用。新增 transport 與正式 `ChatServiceFactory` consumer tests。完整
前端 VM 測試目前 302 項通過、3 項 VM-only 略過；聊天 Chrome gate 30 項通過、2 項略過；
`flutter analyze` 無問題。這些仍是本機自動測試，未覆蓋部署環境與真機網路。下一個切片
處理程序重啟／短暫斷網時 outbox 與 relay cursor 的恢復，再補 UI 清楚呈現目前使用的
連線方式及待送狀態。

第 3 階段第三個切片**已完成（持久 outbox 與 relay cursor 恢復）**：加密 Hive store
close/reopen 後仍保留好友範圍 cursor；重建 `ServerMessageTransport` 後以最後已 ack 的
cursor 繼續 polling；`MessagingTransportFactory` 會把 durable cursor store 注入 relay。
另用正式 `ChatServiceFactory` 模擬 App 重啟：離線事件由加密 outbox 還原，P2P 再次失敗
時仍先等玩家同意 relay，送達後保留原 event ID、只 POST 一次並清空 outbox。四個新增
VM 測試與完整前端 VM gate 通過（306 通過、3 項 VM-only 略過）。mock relay 和 VM Hive
close/reopen 不等於正式 D1 或真機 OS 強制終止／備份復原。下一切片補連線方式與待送／待
選狀態的可見 UI，再用端到端手動流程核對等待、relay 與重開對話的呈現。

第 3 階段第四個切片**已完成（連線方式狀態提示）**：DM 標題列以圖示呈現 P2P 連線、
伺服器 relay、等待玩家選擇、連線中或連線失敗，滑鼠／輔助技術可取得狀態標籤；標籤已
加入繁中、英文與日文翻譯。狀態讀取正式 transport capability，未連成功時不宣稱 P2P
已連線。Widget 測試覆蓋 P2P 成功、等待選擇及同意 relay 後的狀態轉換；前端 VM 307 項
通過、3 項 VM-only 略過，Chrome 聊天 gate 48 項通過、3 項 Hive VM-only 略過，Flutter
analyze 無問題。下一切片繼續驗證短暫網路中斷後的自動恢復、跨裝置同時 poll／ack 與
reconnect 去重，並用本機預覽做瀏覽器互動核對。正式服務與真機仍未驗收。

第 3 階段第五個切片**已完成產品選擇與現況稽核**：backend 原先只以帳號為單位 ack；玩家
選定逐裝置 ack。新的逐裝置方案需以裝置登記／撤銷界定「已啟用」，各裝置分別 poll／ack，
並以裝置隔離 cursor。撤銷裝置不再阻擋清除；若帳號目前沒有任何啟用裝置，pending row
保留，之後新裝置登記仍可取回。現階段不設定自動過期刪除，避免靜默丟失待同步訊息。

第 3 階段第六個切片**已完成（選擇繼續等待時重試 P2P）**：玩家選「繼續等待」後，DM
會立即重試 P2P；若仍失敗，後續間隔從 base delay 逐步加倍，最長不超過一分鐘。成功恢復時
停止計時器、重置退避並更新連線圖示。若玩家改選 relay 或離開 DM，會取消重試。重試只重新
建立 P2P 並 flush 原本持久化的 outbox，不會自動連 relay。新增 transport、ChatService factory
與 widget 測試，並以純函式測試固定 5／10／20／40／60 秒退避序列及 1 秒最短間隔，確認連續失敗會繼續等待，下一次成功後沿用原事件且 relay 未啟用；另以兩個
正式 `ChatServiceFactory` peers 測試「已連線後送出失敗→保留 outbox→重連→同 event ID 只
投遞一次」。為了讓這個測試可重複訂閱，shared `InMemoryMessageTransport` 改用 broadcast
event stream。完整前端 VM 測試 313 項通過、3 項 VM-only 略過；聊天 Chrome gate 54 項通過、
3 項 VM-only 略過；shared messaging package 47 項測試及 `dart analyze` 通過，`flutter analyze`
無問題。這些是本機測試，短暫真實網路中斷與兩台真機仍待驗收。

第 3 階段第七個切片**已完成（監聽真實 P2P 連線狀態）**：`WebRtcMessageTransport` 監聽
DataChannel 開啟／關閉，`P2PMessageTransport` 監聽 PeerConnection 狀態並向 fallback 發出
變更。狀態圖示現在依實際連線狀態判斷；P2P 中斷時顯示等待並詢問是否使用 relay，絕不
自動切換；若 P2P 自行恢復則清除等待並關閉選擇提示。ChatService 提供穩定的狀態事件流，
避免 DM 頁面在 transport 建立前訂閱到空 stream。新增 fallback 和 widget 測試，並在 Chrome
雙 WebRTC peer 測試中確認 DataChannel transport disconnect 會變成 P2P inactive、要求玩家
選擇且不啟用 relay。完整前端 VM 測試 315 項通過、3 項 VM-only 略過；聊天 Chrome gate 56 項
通過、3 項 VM-only 略過；`flutter analyze` 無問題。這驗證本機 loopback 的狀態傳遞，不等於
真實網路掉線、重新協商或兩台手機已驗收。

第 3 階段第八個切片**已完成（P2P 短暫恢復時同步連線狀態）**：PeerConnection 回到
`connected` 時，現在同時檢查 DataChannel 是否仍開啟，再恢復 P2P 狀態；若 ICE 短暫中斷後
DataChannel 保持開啟，UI 不會永久停在未連線。新增 readiness reducer 測試，確認 peer 與
DataChannel 必須同時就緒；完整前端 VM 測試 316 項通過、3 項 VM-only 略過；聊天 Chrome gate
57 項通過、3 項 VM-only 略過；`flutter analyze` 無問題。現有 Chrome gate 驗證正常雙 peer
lifecycle 與明確斷線，不模擬真實 ICE 短暫中斷再恢復；該網路情境仍待真機／網路故障注入驗收。

第 3 階段第九個切片**已完成（單端恢復觸發另一端重建 WebRTC P2P）**：Chrome lifecycle
測試實際建立兩個 WebRTC peers，只中斷恢復端；恢復端重試時，接收端辨認新 SDP offer、重建
PeerConnection 並綁定替換後的 DataChannel。斷線期間留在 outbox 的同一 event ID 隨後送達一次，
relay 全程未啟用。聊天 Chrome gate 58 項通過、3 項 VM-only 略過；完整前端 VM 測試 316 項
通過、3 項略過；`flutter analyze` 無問題；backend `npm test` 的 Node 203 項與 Vitest 1 項通過。
這是同一瀏覽器的 loopback 故障／重連測試，未模擬真實網路斷線、NAT 或兩台手機。

第 3 階段第十個切片**已完成（逐裝置 relay ack 後端與傳輸 adapter）**：玩家已選擇所有啟用裝置都收妥後
才刪除。新增 D1 裝置與 ack receipt schema、裝置 register/revoke routes、裝置範圍 pending
查詢與 ack；前端 relay adapter 使用穩定 device ID、逐裝置 ack 與獨立 cursor。正式 App
目前 fail-closed：E2EE 未完成時 server relay event writes 預設拒絕，DM 頁面隱藏 relay 選項，
訊息保留在本機並繼續嘗試 P2P。backend
chat route 測試 8 項已通過，涵蓋兩裝置各自取件、第一台 ack 不刪除、最後一台 ack 後刪除，
以及撤銷離線裝置後完成清理；migration 已以 SQLite 記憶體資料庫實際套用且無 foreign-key
錯誤；Flutter analyze 無問題、完整 VM test 322 項通過、3 項略過；裝置 API、DM widget
與 relay adapter 的 Chrome 測試 27 項通過。Web release build 成功。backend `npm test`
為 Node 206 項與 Vitest 1 項通過；migration rehearsal 保留既有資料且無 foreign-key
violation；workspace validation 558 checks 通過、workspace coordination tests 81 項與
Street Scrap tests 79 項通過、資料 render 完成。
正式 D1／Worker 與真機多裝置仍未驗收。

第 3 階段第十一步**已完成（玩家端裝置清單與 relay 撤銷）**：DM AppBar 有裝置管理入口，
列表只顯示目前帳號的啟用裝置、標示本機，並允許撤銷其他裝置。每次開啟 DM 會嘗試登記
本機，頁面開啟時每五分鐘更新活動時間；離線時不阻止本地／P2P 聊天，下次開啟再重試。
確認對話指出撤銷只停止後續 relay
投遞，不會刪除遠端裝置已保存的歷史，也尚未撤銷 P2P／E2EE 信任金鑰。裝置 API route
測試 8 項通過；前端 device service 與 DM 裝置面板、五分鐘活動更新測試通過，analyze 無問題。真機
帳號切換、正式 D1 與跨裝置操作仍待驗收。

第 4 階段新增一項技術選擇，已加入計畫選擇 UI，尚未作答：先做跨平台 E2EE 引擎可行性
小樣，或指定 Signal libsignal／
Matrix Rust crypto 方向。Signal 官方提供 Java、Swift、TypeScript wrapper，底層使用 Rust，
但明確表示 Signal 以外使用不受支援，API 與實作可能變更
([libsignal README](https://github.com/signalapp/libsignal#overview))。Matrix 官方 FFI manifest
列有 Android、iOS、JS/WASM 產物型態，另有 browser crypto WASM binding；這是 SDK build
surface 的證據，不代表它已是 Flutter plugin，也不證明可以直接替代本專案私訊協定
([matrix-rust-sdk FFI manifest](https://github.com/matrix-org/matrix-rust-sdk/blob/main/bindings/matrix-sdk-ffi/Cargo.toml)、
[matrix-sdk-crypto-wasm](https://github.com/matrix-org/matrix-sdk-crypto-wasm))。其裝置驗證、
事件與密碼狀態仍按 Matrix client 模型設計。若選「先做可行性小樣」，驗收須包含 Flutter
Web／iOS／Android 實際建置、持久 ratchet/crypto state 關閉重開、跨版本 store migration、
裝置配對與撤銷、復原詞、舊裝置即時同步，以及自有 relay 只收到密文。暫不自行設計或拼裝
訊息加密協定，也不把現行明文 relay 說成符合 E2EE。

第 3 階段本機切片已完成，包含 P2P 失敗時由玩家選擇 relay、待送事件與 cursor 重啟恢復、
P2P 重試及狀態呈現、逐裝置 relay ack、裝置登記／撤銷與玩家端裝置管理。階段一至三的
自動測試與本機驗收不代表正式 Worker／D1 或兩台真機已驗收；relay 寫入仍由 E2EE 閘門
阻擋。接續工作是先完成第 4 階段的跨平台加密引擎可行性與產品金鑰流程，再於可驗證密文
後開啟 relay。

第 4 階段第一個安全收口切片**已完成**：正式前端的 legacy remote adapter 預設拒絕舊
`/send`、`/recall` 和整包明文快照上傳，避免 event relay 失敗時退回明文傳送；歷史下載仍
暫留作舊資料遷移，不能視為新裝置同步方案或 E2EE。只有測試／刻意指定的相容模式可呼叫
舊明文寫入。adapter 測試確認預設封鎖時不會送出任何 HTTP 請求；ChatService consumer 測試
模擬 event endpoint 不支援時仍不會呼叫舊 `/send`，訊息保留在 outbox。本機 analyze 通過、
完整 Flutter VM 測試 324 項通過、3 項略過。仍需選定加密引擎並設計真正由舊裝置即時授權、
端對端保護的歷史同步；本切片不實作密碼協定，也不開啟 relay。

第 4 階段第二個切片**已完成（瀏覽器加密狀態可行性小樣）**：新增隔離 Vite app
`apps/chat_crypto_spike/`，載入官方 Matrix Rust crypto WASM 18.9.0，以虛構帳號和裝置建立
加密 IndexedDB store。Chrome 156 實測通過 WASM 載入、store 建立、關閉後以相同 passphrase
還原同一身份指紋、錯誤 passphrase 拒絕；再用正確 passphrase 成功重開，最後刪除測試資料。
另外以兩個獨立 in-memory `OlmMachine` 裝置執行官方 key upload/query/claim、Olm 加密 room-key
投遞、Megolm 訊息加密及接收端解密；假 key directory 僅存公鑰並在本機記憶體路由密文，沒有
對正式伺服器或外部 key service 發出請求。Chrome UI、Node roundtrip test 通過，Flutter Web 的 Dart-to-JS interop bridge 也實際
呼叫同一 WASM 並完成 roundtrip；Vite production build、`flutter analyze`、Flutter widget test
與 release Web build 通過。這不是自有聊天 relay 或 P2P 的整合證明；尚未測
iOS／Android build、Ratchet、裝置配對／撤銷、復原詞及舊裝置歷史同步。當前環境沒有完整
Xcode、Android licenses 未接受且無 Android 裝置，因此 iOS／Android build 未執行。Signal
libsignal npm 套件未安裝到產品；官方標示 AGPL-3.0-only 且 Signal 外使用不受支援，仍需另行
評估授權與平台整合。Matrix 也尚未選為正式引擎；relay event writes 維持 fail-closed。

第 4 階段第三個切片**已完成（加密裝置信任門檻小樣）**：雙裝置 roundtrip 除驗證接收端
可解開 room key 與訊息外，另以 `TrustRequirement.CrossSigned` 重試同一未跨簽章傳送端的
訊息，確認嚴格模式拒絕解密；一般小樣仍明確使用 `Untrusted` 以驗證純加密流程。Node
crypto spike 測試 3 項通過，瀏覽器與 Flutter bridge production bundle 均重新建置成功。
這只驗證候選函式庫的信任政策開關，不代表使用者配對／核對流程、撤銷後金鑰輪替或
復原功能已完成，也不代表現有產品裝置撤銷會影響此加密身份。正式 relay 仍維持 fail-closed。

第 4 階段第四個切片**已完成（玩家保管復原資料可行性調查）**：官方 WASM API 提供
`exportSecretsBundle`／`importSecretsBundle`，其中包含可用的 cross-signing 私鑰與選用的
room-key backup 私鑰；匯出要求三把 cross-signing 私鑰齊備，匯入會建立並標記本機身份為
已驗證，而且文件要求只從可信來源匯入，例如已啟用舊裝置。[API 文件](https://matrix-org.github.io/matrix-sdk-crypto-wasm/classes/OlmMachine.html)
這個 bundle 是裝置轉移資料，不是本身就能從遺失裝置還原的獨立 recovery phrase。

Matrix Client-Server 規格另定義 room-key backup：備份資料存於服務端，但以使用者保管的
recovery key 加密；規格顯示給使用者的 recovery key 是帶格式檢查的 Base58 字串，而非
單純文字密碼。[Recovery key 規格](https://spec.matrix.org/v1.5/client-server-api/#recovery-key)
此機制能否採用仍取決於我們是否設計專用密文備份儲存 API；目前 Taiwan Brawl 的 relay
只承載待送訊息，沒有 E2EE room-key backup contract。因此若維持無專用伺服器備份，復原詞
不能憑空重建已遺失裝置上的歷史；只能靠仍可用的舊裝置安全授權同步。此項是已知設計限制，
不代表已實作匯出、匯入、backup 或復原 UI。

第 4 階段第五個切片**已完成（同一頁內 SAS 狀態機與手動確認 UI 小樣）**：兩台虛構
crypto machine 跑完整 to-device SAS：發起、接受、交換 SAS key、取得一致的七個 emoji、
雙方確認並建立 locally trusted。瀏覽器 UI 有 A／B 兩個獨立面板與各自確認按鈕；實際
互動確認只有 A 按下時雙端仍未互信，B 確認後才雙向信任；取消會送到另一端且不建立信任。
Node spike 測試 5 項通過，Vite production bundle 建置成功。當時仍是同一頁的兩個虛擬裝置。

第 4 階段第六個切片**已完成（同源瀏覽器分頁 SAS 核對）**：新增兩分頁 A／B 配對 UI，透過
`BroadcastChannel` 在不同 JavaScript 分頁間傳遞測試事件，並在兩端實際看到一致的七個 emoji；
兩端分別手動確認後，兩端都顯示裝置信任已建立。Node 測試驗證雙端確認、手動取消與逾時後
通知對端取消都不建立信任，目前 crypto spike 共 9 項測試通過，Vite production build 通過。
SAS 事件由本機分頁通道傳送，
本切片沒有建立 Olm session、relay、WebRTC 或網際網路傳輸，不能視為跨手機／跨瀏覽器 profile
或 P2P 測試。第七個切片**已完成（SAS 不一致拒絕與逾時取消）**：新增明確拒絕按鈕，送出
`m.mismatched_sas`，並在兩個分頁顯示拒絕且不建立信任；2 分鐘逾時會通知對端取消。Node
測試驗證拒絕原因在兩端一致，瀏覽器實際觀察到兩端顯示拒絕狀態。[Matrix SAS cancellation codes](https://spec.matrix.org/v1.5/client-server-api/#verification-messages-specific-to-sas)
account-level cross-signing 身分金鑰、復原、裝置撤銷及撤銷後金鑰輪替仍未驗收。
[Matrix WASM SAS API](https://matrix-org.github.io/matrix-sdk-crypto-wasm/classes/Sas.html)
正式產品仍未選定此引擎，relay event writes 繼續 fail-closed。

第 4 階段第八個切片**已完成（Android 原生加密 store 可行性小樣建置）**：隔離
Flutter Android runner 透過 MethodChannel 呼叫官方 Matrix Rust crypto Android AAR
`26.05.12`，用虛構 user/device、App 私有路徑及玩家輸入的測試 passphrase 建立／關閉／重開
crypto store，顯示身分金鑰指紋；錯誤密碼可由操作流程檢查拒絕。沒有接入正式 App、帳號、
relay 或正式產品依賴。Flutter widget test、`flutter analyze` 與 Android arm64 debug APK build
通過；因目前沒有已連接 Android 裝置，原生 runtime、相同密碼指紋穩定、錯誤密碼拒絕及
程序重啟持久性仍待真機驗證。AAR 使用 Matrix device/store contracts，僅證明候選原生庫可
被 Flutter Android 專案打包，不代表符合 Taiwan Brawl 自有 relay 協定。iOS/Xcode build、
自有 relay 密文、跨裝置授權／撤銷／恢復仍待後續切片；relay event writes 保持 fail-closed。

跨平台套件差異已登記：目前使用的 Android Maven `crypto-android` release 是 `26.05.12`；
Matrix Swift package 主分支 manifest 指向 `26.10.27`、最低 iOS 16，且官方說明 Swift API
仍不穩定。[Android AAR metadata](https://repo.maven.apache.org/maven2/org/matrix/rustcomponents/crypto-android/maven-metadata.xml)、
[Swift package manifest](https://github.com/matrix-org/matrix-rust-components-swift/blob/main/Package.swift)、
[Swift API 穩定性說明](https://github.com/matrix-org/matrix-rust-components-swift#swift-package-for-matrix-rust-components)。
因此兩端都可取得官方 Rust crypto binding，不足以證明底層版本、資料庫格式、migration 或
API 行為已對齊；正式選擇前需取得同源 Rust commit 的 Android/iOS artifact，或補跨平台
interoperability/migration 驗收。當前 iOS build 另受本機缺少完整 Xcode 限制。

## 主要 owner 與驗收命令

- Shared event contract：`taiwan_brawl_front/packages/shared/taiwan_brawl_messaging`
- UI、Hive、P2P／WebRTC adapter：`taiwan_brawl_front`
- Hosted relay、signaling、notification delivery：`taiwan_brawl_back`
- Cross-repository contract／test matrix：`TaiwanBrawlWorkspace`
- 依變更執行 shared package `dart analyze`／`dart test`、前端 owner／consumer
  `flutter analyze`／`flutter test`、後端相關 Node／workerd tests；跨 repo contract
  變更再執行 workspace validator、coordination tests 與 viewer data render。
