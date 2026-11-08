# Current status

## 聊天可靠性第 1 階段：service composition 與離線恢復 — 2026-10-28

新增 `ChatServiceFactory` 雙 session consumer regression，透過正式 factory 和可控雙向
transport 驗證一則訊息只在兩端各形成一筆投影；接收端標記已讀後，發送端仍可編輯與
收回，接收端最終顯示「訊息已收回」。同一 consumer suite 另以加密 Hive store 模擬
程序重開、重建 messaging core 與 ChatService composition；pending event 恢復後送達一次，
sender outbox 清空，receiver 只有一筆 projection。這補上原本 UI、共享 repository 與
P2P runtime 分層驗證之間缺少的正式 service assembly／重啟恢復閉環。下一個單一切片
接入正式 service 和 DM widget 驗證 at-most-once UI；其他聊天階段不和它併行。

驗證：factory consumer tests **10/10**；完整 frontend `flutter analyze` 無問題、完整
`flutter test` **290 passed、3 skipped**；Chrome WebRTC 兩 peer runtime tests **2/2**，
涵蓋手動簽章協商及建立／讀取／編輯／收回。瀏覽器測試是 loopback runtime 證據，
不代表手機、跨網路 NAT 或正式 signaling server 已驗收。

## 聊天功能分階段計畫 — 2026-10-28

依使用者最新方向，聊天功能成為目前唯一優先工作流；將 P2P 直連、離線本機保存、
訊息送達／編輯／收回、同步回退、信任與通知分階段列管，不和所有遊戲重構同批執行。
細項、目前實作狀態及每階段驗收條件見
[`chat-feature-plan.md`](chat-feature-plan.md)。目前只進行第 1 階段的一對一聊天可靠性；
更後面的隱私政策、真機 P2P、通知與 legacy cleanup 先排隊，不宣稱已驗收。

## Mini Royale 房間版本不相容的更新導引 — 2026-10-28

Mini Royale 建房或加入房間遇到 `GAME_VERSION_INCOMPATIBLE` 時，前端改顯示本地化
提示，不再把伺服器英文 `detail` 原文交給玩家；SnackBar 提供「開啟遊戲庫」操作，
導向既有 `/game-library` 頁面，玩家可更新遊戲資源後重試。路由留在 App 外殼，
Mini Royale package 只透過可選回呼提出更新需求，維持 package 可獨立重用。

驗證：frontend `flutter analyze` 無問題；Mini Royale owner `flutter analyze` 無問題、
owner tests 全數通過；frontend 完整 tests **288 passed、3 skipped**。Lobby 回歸涵蓋
結構化版本錯誤、本地化提示不洩漏後端 detail，以及操作導向遊戲庫。這驗證了 App
導頁與相容性錯誤呈現，不包含實際下載資源或雙端連線測試。

## DM 預設使用 P2P 傳輸 — 2026-10-28

`AppConfiguration.environment` 的 `P2P_CHAT_ENABLED` 與
`MessagingTransportFactory.p2pEnabled` 預設都為 true，讓 production composition
依既定 P2P 架構先使用 WebRTC DataChannel；握手或連線失敗仍回退 server relay，部署可用
明確的 `P2P_CHAT_ENABLED=false` 關閉此嘗試。DM 的手動簽章 bundle 模式
維持獨立，可在沒有 hosted signaling server 時交換 SDP／ICE。共享 `taiwan_brawl_core`
package 升至 **0.1.1**；session token、device key 與其他憑證未移入設定 package。

驗證：shared core `dart analyze` 無問題、owner tests **2/2**；frontend configuration／
transport factory／manual P2P consumer tests **14/14**，其中新增 factory regression
確認啟用時 WebRTC P2P 為 primary、server relay 為 fallback，停用時只選 server；
workspace boundary regression 也鎖定 production composition 將設定傳入 factory。明確以
`--dart-define=P2P_CHAT_ENABLED=false` 驗證 server-only override **1/1**。完整 frontend
`flutter analyze` 無問題、`flutter test` **282 passed、3 skipped**。Flutter Web Release
build 成功；Wasm 相容性 dry run 仍回報 `flutter_secure_storage_web` 使用 `dart:html`／
`dart:js_util`，不影響一般 Web Release build。Chrome real-WebRTC loopback tests **2/2**
通過，現在經由預設 factory 建立兩個 peer，驗證 DataChannel 讀取、編輯與收回；
signaling 使用測試內 loopback channel，這不代表正式 server signaling、Internet NAT 或真機
已驗收。Workspace validation **510 checks passed**；
coordination tests **78/78**、Street Scrap content tests **79/79**；Flutter data render
完成，產生兩份 viewer workspace data。以上 workspace gates 在本段更新後重跑通過。

## Layout Studio 預覽路由修復與診斷定位 — 2026-10-28

檢查使用者開啟的 9080 預覽空白問題時，確認舊 Node server process 仍使用未包含
`/layout_import.mjs` 的記憶體路由表；瀏覽器 Console 實際回報該模組 404，令
ES module 初始化中止。重新啟動 9080 工作台後，HTML、app、schema、state、import
五條路由均回 200。舊 9081 Layout Studio process 是相同程式但缺少 import/state
路由的過時預覽，已依使用者先前授權關閉。

修正後在 9080 分別匯入使用者提供的手機與桌面 JSON，各載入 7 個元件。手機版
顯示 1 個包含關係提醒；桌面版顯示 2 個相對位置提醒及 614×1 px 導覽／按鈕重疊。
桌面版重新載入後仍保留 7 個元件與提醒；點擊首個提醒會選取 `action` 元件並
開啟右側編輯器。診斷項目現在攜帶元件 ID、以可操作按鈕呈現並支援鍵盤焦點。
這是版面工作台操作驗證，不代表此 JSON 已接入 Flutter 實際畫面。

驗證：workspace validation **510 checks**、協調 Node suite **76/76**、Street
Scrap owner suite **79/79**、viewer-data render 與 `git diff --check` 通過。

## SignalRoom 改用 Durable Object WebSocket hibernation — 2026-10-28

SignalRoom 原先在 constructor 建立純記憶體 user/socket map，並替
`acceptWebSocket` 後的 server socket 加標準 `addEventListener`。Cloudflare
Hibernation WebSocket 會在物件喚醒後用 `webSocketMessage` 等 DO handler 派送事件，
因此舊 map 不會恢復，標準 listener 也不是該 API 的事件入口。現在 user ID 存在
socket attachment，relay 及同帳號重連會從 `ctx.getWebSockets()` 讀取連線；新增
DO instance 重建後仍可 relay 的測試。因 Worker compatibility date 是
2026-03-11，close handler 會明確回覆 close frame。

`SignalRoom` 現在只接受有大小上限的 offer／answer SDP 與 ICE negotiation 欄位，拒絕
應用訊息、額外欄位、自我目標及超限 payload；relay 只轉送正規化後的 negotiation
內容。前端 signaling consumer regression 確認既有 SDP／ICE wire shape 相容。

驗證：backend 完整 suite **199/199**、signal route/room 定向測試 **7/7**，D1
migration rehearsal 保留 7 個遊戲 namespace rows、2 位使用者及 1 個 session，0
foreign-key violations；前端 signaling service／P2P transport 定向測試 **5/5**、
signaling test analyzer 無問題。此前 Chrome WebRTC edit/recall 兩 peer tests **2/2**、
P2P transport/session factory tests **11/11** 通過。測試中的 Durable Object state
為可重建 fake，仍不等於部署 Cloudflare 上的休眠／喚醒或兩台裝置 NAT 驗證。

## SignalRoom 以本機 workerd 驗證 hibernation eviction — 2026-10-28

新增 Cloudflare Workers Vitest owner gate，直接使用本機 workerd Durable Object
binding 建立兩個 WebSocket client，呼叫 `evictDurableObject()` 讓 SignalRoom instance
被驅逐並使連線進入 hibernation，再由原 sender 傳送 SDP offer，確認重建後透過
socket attachment 還原 sender ID 並 relay 至另一端。此測試覆蓋真實 Cloudflare
runtime API 與 eviction lifecycle；執行設定明確用本機 D1／KV namespace，不讀取遠端
binding、Cloudflare token、Keychain 或正式簽章金鑰。`npm test` 現在包含 Node owner
suite 與 workerd hibernation suite。

驗證：後端 Node suite **199/199**、本機 workerd eviction／WebSocket relay **1/1**、
D1 migration rehearsal 通過，`npm audit` 為 **0 vulnerabilities**。本機 workerd 行為仍
不代表部署 Cloudflare 專案或兩台實際裝置的 NAT connectivity 已驗收。

跨 repo contract 已明列 SDP／ICE 欄位限制、socket attachment 恢復條件及 workerd
eviction validation；workspace test matrix 對 `p2p-runtime-change` 現同時要求前端
WebRTC consumer 與後端 owner `npm test`，避免只跑單側 gate。後端 CI path filter
現在也涵蓋 `src/rooms/**`、`worker-tests/**` 與 Vitest 設定，因此 SignalRoom-only
改動會觸發該 job；workflow 設定尚未經遠端 GitHub run 驗證。

## 編輯／收回 relay 經接收端 poll 與 ack 完整往返 — 2026-10-28

新增 backend route regression：使用 sender session 寫入同一訊息的 edited revision 1
與 recalled revision 2，再切換 receiver session 讀取 pending rows，逐欄確認 event ID、
message ID、revision、event type 與文字內容，最後 ack 並確認只清掉接收者的兩筆列。
此測試使用 in-memory D1 fixture，驗證 Worker route／relay 資料形狀與 ack 生命週期；不
代表已對部署中的 Worker 或兩台真實裝置完成端到端驗收。

驗證：backend chat event route **5/5**、完整後端測試 **195/195**；D1 migration rehearsal
保留 7 筆遊戲 namespace 資料、2 個使用者與 1 個 session，0 外鍵違規。前端 edit／recall
UI 與服務投影測試已於下方記錄的 **277/3 skipped** 全套中通過。

## DM 編輯對話框 controller 依路由生命週期釋放 — 2026-10-28

編輯訊息原先在 `showDialog` 回傳時立即 dispose `TextEditingController`；此時退場動畫
仍可能重建對話框的 `TextField`，因而讀到已 dispose 的 controller。現在 controller 由
獨立 stateful dialog 擁有，只在 dialog widget 真正移除時釋放。新增 widget 回歸覆蓋穩定
message ID 編輯、dialog 關閉、編輯／收回 transport 失敗提示及控制狀態恢復；此修復不改
訊息事件或 server wire contract。

驗證：DM widget **8/8**（VM 與 Chrome），完整前端 Flutter 測試 **277 通過、3 略過**，
`flutter analyze` 無問題，`flutter build web --release` 成功。Wasm dry run 仍回報
`flutter_secure_storage_web` 使用不相容的 `dart:html`／`dart:js_util`；標準 Web release
build 通過。

## Legacy DM 遷移標記採來源快照比對 — 2026-10-28

歷史 adapter 現在同時讀取舊 Hive 訊息與不透明來源 revision。事件投影完成後，
本機儲存只會在目前資料列仍與讀取快照一致時寫遷移 manifest；若期間有新增或修改
（包含舊資料收回），不會把新版本資料誤記成已搬遷，下次讀取會重播保留的來源列。
新增 Hive 回歸測試覆蓋同筆資料在 snapshot 後被修改的競態。

驗證：legacy migration 與 ChatService offline 定向 Flutter 測試 **38/38**；完整
Flutter 測試 **273 通過、3 略過**，`flutter analyze` 無問題；workspace validation
**510 checks**、協調 Node tests **76/76**、Street Scrap owner Node tests **79/79**；
viewer-data render 成功。

## DM 捲動分頁採穩定複合 cursor — 2026-10-28

舊歷史 API 每頁最多 50 筆，現在用 `(createdAt, rowId)` 排序與續頁，並回傳
`hasMore` 和下一頁 cursor；即使大量訊息有相同時間戳，也不會因時間戳 `< before`
而漏掉同秒資料。DM 頁到達訊息頂端會載入舊頁，按 message ID 合併並補償新增高度，
讓讀者原本看到的位置保持不動。首次載入仍先保留本機 projection；若初次遠端請求
失敗，頁面仍可顯示離線資料。UI、server source、Worker route 和 Durable Object 都
已接上同一 cursor contract。

驗證：DM widget／service／remote source 定向 Flutter 測試通過；完整前端 Flutter
測試 **275 通過、3 略過**，`flutter analyze` 無問題；完整後端測試 **194/194**，DB
migration rehearsal 保留 7 筆遊戲資料、2 個使用者與 1 個 session，0 外鍵違規；workspace
validation **510 checks**、協調 Node tests **76/76**、Street Scrap owner tests **79/79**；
viewer-data render 成功；`flutter build web --release` 成功。Flutter 的 Wasm dry run
仍提示 `flutter_secure_storage_web` 使用不相容的 `dart:html`／`dart:js_util`；一般 Web
release build 完成。已在本機預覽驗證 compound cursor 端點與分頁 UI 所需回應；此處未宣稱
雙裝置即時同步或 production 部署驗證。

## DM 歷史分頁 cursor 穿越遷移快路徑 — 2026-10-28

修正直接訊息歷史的 `before` cursor 被本機快路徑略過：舊 Hive 尚待遷移時，先遷移
本機列再取指定伺服器頁；遷移 manifest 已完整時，直接取該頁並以共用 event batch
合併。無 cursor 的初次載入仍保持本機優先，因此離線可讀不受影響。此處記錄當時
service 層的 cursor 修正；後續「DM 捲動分頁採穩定複合 cursor」切片已將捲動觸發、
訊息合併及 viewport 高度補償接入 `EditableDmPage`，該舊紀錄的 UI 未完成描述已過時。

驗證：ChatService offline 與 legacy remote source 定向 Flutter 測試通過；完整 Flutter
測試 **274 通過、3 略過**，`flutter analyze` 無問題；workspace validation **510
checks**、協調 Node tests **76/76**、Street Scrap owner Node tests **79/79**；viewer-data
render 成功。

## 遊戲 catalog 必須明確列出平台範圍 — 2026-10-28

前端 catalog reader 與 Worker／catalog signer／release packager 原先會把缺失的
`platforms` 默認為全部平台。現在簽署 catalog 的每個 module 與 resource 都必須
帶非空平台清單；resource 清單只能縮小所屬 module 範圍。缺少欄位會在前端驗簽後
解析時拒絕，也會在 Worker 發布、catalog 簽署及 release packaging 驗證時失敗。
Street Scrap 的六平台支援範圍現在由遊戲 package 自己宣告，App registration 只映射
到 host enum；package／manifest 同步升至 **0.1.13**。Bundled game manifests 與目前
serializer 已明確輸出平台；workspace 狀態紀錄中的
production catalog 仍未發布，沒有既有發布內容要做相容遷移。前端 catalog 測試 **6/6**、
後端 catalog／簽署／release tests **19/19**；Street Scrap owner suite **346/346**，
package analyzer 與完整前端 analyzer 無問題；完整前端測試 **262 通過、3 略過**，
`flutter analyze` 無問題；完整後端測試 **192/192**，D1 migration rehearsal 保留
7 筆遊戲資料、2 個使用者與 1 個 session，0 外鍵違規。Chrome 資源儲存／安裝測試
**24 通過、2 略過**；workspace validation **582 checks**、Node tests **155/155**，
viewer-data render 成功。

## 遊戲資源生命週期整合測試擴展至桌面 runner — 2026-10-28

將相同的原生儲存安裝流程加入 macOS、Windows、Linux 桌面 CI：測試涵蓋初次安裝、
升級失敗回滾、成功升級、Hive 關閉／重開後恢復及移除資源而保留遊戲模組。Linux
runner 以 Xvfb 啟動 GTK app。Android API 35 與 iOS 26 Simulator 原有工作不變，
跨 repo test matrix 與邊界測試同步列出五種原生平台。這只設定了 hosted CI 工作；
桌面 runner 的實際結果要等 workflow 執行後才算驗證。本機目前缺少完整 Xcode，
且沒有 Windows／Linux runner，故未宣稱本機桌面整合測試通過。

## Street Scrap 遊戲資料與設計文件移入 owner package — 2026-10-28

機器可讀字典、配方 policy、編譯後的 aggregate／章節資料包，以及遊戲專屬企劃、
材料字典、任務書、查核表與美術規格都改由
`taiwan_brawl_front/packages/games/street_scrap/` 擁有。協調 repo 保留導覽入口、
跨遊戲 contract、workspace validation 與跨 repo 簽章資源封裝 orchestration，不再存放
Street Scrap canonical payload。package 的 `resources/data/` 未列入 Flutter bundled assets，
玩法資料仍透過玩家選擇的簽章資源下載。內容來源 metadata 路徑改變，因此 package
升為 **0.1.14**、章節0–4升為 **0.1.33**（SHA-256
`f4907d6e9b2336f473aede567f31401494bff75d1adfb0e374a33b48bbe799b1`）、章節5升為
**0.1.24**（SHA-256 `902a4b991849375924710a3fd390d506f27250007ce2ddb2bbb0ed7aae1f46b3`）；
遊戲規則未變，舊版存檔相容範圍保留 0.1.31 與 0.1.32。Aggregate 編譯版本為
**0.1.61**。

Street Scrap 專屬設計稽核、內容編譯、平衡模擬與四組 Node owner tests 亦已移至
`packages/games/street_scrap/tool/`；owner package 提供獨立 npm scripts。協調 repo
保留工作區驗證與跨 repo release orchestration，workspace `npm test` 透過 package
路徑呼叫 owner tests。遊戲專屬工具與測試不再由協調 repo 擁有。

驗證：內容稽核涵蓋 **111 項材料／78 條配方／8 種材料束**，編譯 freshness pass；
Street Scrap Flutter owner tests **346/346**、package analyzer 無問題；模組／資源目錄等
前端消費測試 **59/59**；協調 repo 內容、語系、release 與 architecture boundary
定向測試 **100/100**。Workspace validation **552 checks**、完整 Node suite
**155/155**、viewer-data render 通過；移入 package 的 13 份 Markdown 本機連結均有效。

## Street Scrap 專屬工具與 Node tests 移入 owner package — 2026-10-28

設計稽核、內容編譯、平衡模擬與四組 Node owner tests 現由
`taiwan_brawl_front/packages/games/street_scrap/tool/` 擁有，並由 package 自己的
`package.json` 提供執行入口。協調 repo 保留跨 repo 資源發布 orchestration、整合預覽
與 workspace gate；workspace `npm test` 透過 package 路徑執行 owner tests。歷史企劃書
中的測試指令已標明當時所在位置，並附上目前的 package 指令。

驗證：Street Scrap Node owner tests **79/79**；協調 repo Node tests **76/76**，合計
**155/155**；工作區 validation **510 checks**；viewer data render 成功。此前同一移置
切片已通過 owner 設計 audit 與內容 freshness check；Flutter owner tests 與 analyzer
未因工具移置而改動。

## Street Scrap 模組與資源 metadata 移入遊戲 package — 2026-10-28

Street Scrap package 現擁有可解析的完整 module manifest：模組身分與版本、支援平台、
11 個資源的版本／digest／payload schema／依賴／可用平台，以及 package 實際支援的
payload decoder schemas。Host registration 改為解析此 manifest，只保留路由、儲存與
資源 migration function 注入；通用 catalog parser 不採用 remote catalog 自稱的
decoder schema。預覽簽章目錄產生器也已改讀 package manifest；資源檔案位置與 MIME
type 僅保留為打包設定，不再複製資源版本、digest、平台、依賴或呈現 metadata。
當時 package 版號為 **0.1.13**。Street Scrap owner suite **346/346**、owner analyzer
無問題；完整前端 analyzer 無問題、測試 **262 通過、3 略過**。工作區 boundary
測試 **32/32**、驗證 **582 checks**、完整協調測試 **155/155**；viewer data 已重建。
Hosted desktop CI 尚未執行。

## 三個遊戲與共享 package owner suites 重驗 — 2026-10-28

按 workspace test matrix 分別執行 owner analyzer／tests：Street Scrap **346/346**、
Archery **10/10**、Mini Royale **61/61**；`taiwan_brawl_messaging` **33/33**、
`taiwan_brawl_core` **1/1**。五個 package analyzer 均無問題。這些是各自 package
內的 owner 測試，不以 App 測試代替。前端完整 suite 另為 **238 項通過、3 項略過**。

## 全端架構 gate 與本機平台盤點 — 2026-10-28

完整 frontend `flutter analyze` 無問題；完整 `flutter test` **238 項通過、3 項
略過**。Chrome 雙 peer WebRTC runtime（含 read/edit/recall）**15/15**；後端
Royale 合約正規化、建立／加入／重連相容性測試 **21/21**。伺服器會在寫入
membership 或升級 WebSocket 前拒絕缺少／不相容合約，同 protocol 合約下不同
package version 仍可互通。

本機只偵測到 macOS 26.6.2 與 Chrome，沒有 Android／iOS simulator 或無線裝置；
Xcode 工具目前指向 Command Line Tools，`xcodebuild`／`simctl` 不可用。前述 hosted
CI 的六平台 builds 與 Android API 35／iOS Simulator 資源生命週期仍是平台證據；
真機網路、商店簽署與實際發佈流程仍未驗證。

## Notification legacy adapter 改由 composition root 注入 — 2026-10-28

`NotificationService` 改為接收 `LegacyPendingMessageAdapter`，不再以
aggregate store 介面建構相容 adapter。正式 app 與本機 preview composition root
各自以 `LocalChatRepository` 實作的 pending-message port 組裝並注入 adapter；事件驗證、relay ack 與未讀
對話提示仍由通知服務編排。

驗證：legacy adapter、通知服務、pending source 與 bootstrap consumer 測試 **8/8**；
5 個 Dart 檔案 analyzer 無問題；workspace architecture boundary **26/26**。
Workspace validation **576 checks**；完整協調測試 **148/148**。

## Legacy adapter 組裝移至 ChatServiceFactory — 2026-10-28

`ChatService` 改為透過建構子接收 `LegacyChatHistoryAdapter`、
`LegacyChatSyncSnapshotAdapter` 與 `LegacyChatDeliveryAdapter`；三者及其 store／
remote port 由 `ChatServiceFactory` 組裝。`ChatService` 不再依賴
`LegacyChatStore`、`LegacyChatRemoteSource`，也不在服務內建構相容 adapter。
舊格式 row／HTTP 相容邏輯仍保留在各自 adapter，行為與資料格式不變。

驗證：ChatService offline、factory、legacy migration、notification 與 pending
adapter 消費者測試 **35/35**；3 個 Dart 檔案 analyzer 無問題；workspace
architecture boundary **26/26**。Workspace validation **576 checks**；完整協調
測試 **148/148**。

## 舊格式通知訊息處理移入 adapter — 2026-10-28

新增 `LegacyPendingMessageAdapter`，集中處理 pending relay 的舊格式訊息與 recall
資料列解析、相容 store 寫入及 ack ID 決定。`NotificationService` 保留 event
驗證／接收、ack 回傳及未讀對話提示，不再直接建立 `ChatMessage` 或寫入舊 store。
新增 adapter 單元測試與通知服務整合測試，涵蓋舊訊息保存、recall、relay ack 及
對話提示。

驗證：legacy adapter、通知服務與 pending source 測試 **7/7**；4 個 Dart 檔案
analyzer 無問題；workspace architecture boundary 測試 **26/26**。Workspace
validation **576 checks**；完整協調測試 **148/148**。

## Legacy DM 送達 fallback 拆出 ChatService — 2026-10-28

新增 `LegacyChatDeliveryAdapter`，集中處理舊 DM HTTP send／recall 與尚未遷移的
legacy row 寫入。`ChatService` 現在只決定何時由共享事件 outbox 切換到舊端點，
不再直接呼叫 legacy remote source 或 storage。離線時事件仍留在 durable outbox；
只有 event route 回報不支援時才走舊 HTTP fallback。新增測試確認 fallback 只送出
一次、成功後清除該 pending event，且 projection 保持可見。

驗證：ChatService offline、factory 與 migration 定向測試 **31/31**；3 個 Dart
檔案 analyzer 無問題；workspace architecture boundary 測試 **25/25**。
Workspace validation **576 checks**；完整協調測試 **147/147**。

## Legacy DM 快照同步責任拆分 — 2026-10-28

新增 `LegacyChatSyncSnapshotAdapter`，將整份舊格式訊息快照的匯出、下載、相容
儲存匯入及事件投影移出 `ChatService`。上傳仍直接由 `MessageProjection` 產生
既有 `chat_<low>_<high>` wire format，並保留 pending 狀態；沒有共享投影時仍
由舊 store 匯出。下載仍先匯入相容 store，再以 synthetic events 合併到共享事件庫。
新增消費者測試確認快照內容、pending 標記及雙路徑匯入。

驗證：ChatService offline、sync adapter 與 migration 定向測試 **28/28**；3 個
Dart 檔案 analyzer 無問題；workspace architecture boundary 測試 **25/25**。
Workspace validation **576 checks**；完整協調測試 **147/147**。

## Legacy DM 歷史搬移責任拆分 — 2026-10-28

新增 `LegacyChatHistoryAdapter`，集中處理舊本機／伺服器訊息的讀取、轉成共享
事件、投影完整性確認與 migration manifest 寫入。`ChatService` 的初始載入與
手動 refresh 改由 adapter 負責；傳輸同步仍保留自己的 remote authenticator，
避免歷史讀取設定與即時同步設定互相混用。舊資料列與伺服器相容路徑仍保留，
以便資料復原和漸進遷移。

驗證：DM 歷史遷移、離線服務、factory、DM widget、DirectMessage、server
transport 與 sync adapter 定向測試 **41/41**；2 個 Dart 服務檔 analyzer 無問題；
workspace architecture boundary 測試 **25/25**；workspace validation **576 checks**；
完整協調測試 **147/147**。

## DM 歷史與同步匯出避免 ChatMessage 往返 — 2026-10-28

歷史讀取／refresh 現在只負責將舊列 promote 到共享事件庫，最後由同一個
`DirectMessage` projection 路徑回傳結果。`ChatService` 不再先把 event
projection 建成 `ChatMessage` 再匯出同步 snapshot；新增
`MessageChatSyncAdapter.exportProjections`，直接生成原有 legacy snapshot
欄位與 message key，舊本機資料尚無 projection 時仍走原本的 store export。
新測試逐欄比對兩種匯出結果，包含 recall 和 pending 狀態。

驗證：ChatService offline、factory、DM widget、DirectMessage、legacy migration、
server transport 與 sync adapter 定向測試 **41/41**；4 個 Dart 檔案 analyzer
無問題；workspace boundary 測試 **25/25**；workspace validation **576 checks**；
完整協調測試 **147/147**。

## DM commands use stable projection IDs — 2026-10-28

編輯、已讀和收回現在直接讀取並操作 `MessageProjection` 的 event message ID；
移除了舊 `ChatMessage` 與 event ID 的互相推測表及轉換 helper。唯一保留的
舊 key 轉換只在伺服器不支援 recall event 時呼叫，並新增回歸測試確認
fallback 使用由 projection 導出的 legacy `messageKey`，且成功後不留下待傳
recall event。

驗證：ChatService offline、factory、DM widget、DirectMessage、legacy migration
與 server transport 定向測試 **38/38**；2 個 Dart 檔案 analyzer 無問題；workspace
boundary 測試 **25/25**；workspace validation **576 checks**；協調測試 **147/147**。

## ChatService public DM boundary — 2026-10-28

`ChatService` no longer exposes its legacy `ChatMessage` stream, history,
send, edit, recall, or read methods as application API. The DM page and
consumer tests use `DirectMessageService` and stable event message IDs. The
remaining legacy-row and server compatibility logic is private to
`ChatService`; `RetryableDmService` now has its own small port file. The
obsolete `EditableDmService` interface was removed. Legacy DTO/storage/remote
plumbing remains for migration and was not deleted in this slice.

驗證：ChatService offline、DM widget、DirectMessage 與 legacy migration 定向
Flutter 測試 **26/26**；6 個受影響 Dart 檔案 analyzer 無問題；workspace
rearchitecture boundary 測試 **24/24**；workspace validation **576 checks**；完整
協調測試 **146/146**。viewer data 已重建，兩個 repo 的 `git diff --check` 通過。

Game module version alignment (2026-10-27): Street Scrap's package-owned module manifest reported `0.1.12` while its Flutter package `pubspec.yaml` and host lock entry reported `0.1.0`. Updated both package metadata records to `0.1.12`; the host manifest-version test and coordination boundary test now compare Street Scrap alongside Archery and Mini Royale. Street Scrap owner suite **346/346**, focused host library-controller tests **22/22**, and coordination architecture-boundary tests **17/17** passed. Dart automatic fixes cleared **77 informational style lints across eight files**; package-wide Flutter analyzer now reports **No issues found**. No gameplay rules, content resources, save schema, or multiplayer compatibility versions changed.

Shared-package source-of-truth and provider-boundary guard (2026-10-28): corrected the coordination architecture test and deployment-configuration check to read `taiwan_brawl_front/packages/shared/{taiwan_brawl_core,taiwan_brawl_messaging}`, matching the approved no-new-repository layout and actual frontend path dependencies. Added a boundary regression that shared runtime configuration cannot declare credential, token, API-key, device-key, or secret fields. Also removed Firebase identifiers and VAPID parameters from the reusable `PushProvider` API: it accepts opaque provider configuration and generic token operations, while `FirebaseOptions` and the Web VAPID key stay in the frontend adapter. A second provider implementation test proves another adapter can use the shared contract without Firebase fields; an adapter regression confirms Firebase rejects unrelated configuration before initialization. Updated the workspace architecture diagram, contract and rearchitecture plan. Shared messaging tests **33/33**, notification config/remote-source consumers **4/4**, Firebase adapter regression **1/1**, rearchitecture boundaries **18/18**, shared and targeted frontend analyzers report no issues. Workspace validation passes **576 checks** and the full coordination suite passes **140/140**.

Credential adapter cleanup and generated-output hygiene (2026-10-28): removed the deprecated `FlutterSecureCredentialStore` alias after confirming it had no in-repository consumers; secure key, identity, and peer-trust tests pass **9/9**, with no analyzer issues. Broadened the frontend Flutter `/build/` ignore rule so generated builds from nested game packages are ignored alongside the app build. Verified the Archery and Mini Royale package build directories are ignored and are not tracked; no generated output was deleted.

Manual P2P transport boundary (2026-10-28): the shared messaging package now defines `NegotiatingMessageTransport`, an optional prepare-before-connect capability. `ChatService` consumes it through an injected factory and no longer imports or constructs `P2PMessageTransport`; ICE configuration remains in `MessagingTransportFactory`. Manual P2P now fails closed if its transport adapter is missing. The provider-neutral push API also introduced an incompatible shared contract revision, so `taiwan_brawl_messaging` is versioned at `0.2.0` and the workspace package snapshot is aligned.

Layout Studio import and persistence (2026-10-28): imported layouts keep permissive schema validation and show non-blocking warnings when declared spatial relationships disagree with coordinates or components overlap. Re-tested the supplied phone/desktop files in isolated in-memory storage: both import with seven components; the phone layout has one containment mismatch, and the desktop layout has two “above” mismatches plus a 1 px action/navigation overlap. Diagnostics do not edit the JSON or apply it to the game UI. The selected sketch/visual stage persists with the local layout, including compatibility with older saved layouts that had no stage field. Layout Studio tests **8/8** pass.

P2P edit/recall runtime gate (2026-10-27): expanded the Chrome WebRTC integration test to send create → receiver-read → author-edit → author-recall across two real browser peer connections. The receiver's shared `MessageRepository` accepts all four ordered events and ends at revision 3 with the read marker retained and visible text `訊息已收回`. The real WebRTC test and adjacent P2P session/service consumers pass; targeted analyzer reports no issues. The frontend workflow now has a dedicated Chrome runtime job and watches these test files, with a coordination regression guarding the job. Local workflow wiring is verified; no remote run is claimed. Hosted signaling, Internet NAT, two physical devices, and peer-key distribution remain unverified.

P2P identity upgrade (2026-10-28): new device events are signed with Ed25519 and the private seed is stored only behind the injected credential store. Trust invitation v2 carries the public key, not the seed. The DM trust dialog requires the user to enter the exact fingerprint received through a separate channel; the invitation's own fingerprint cannot enable trust. Manual P2P now always verifies inbound event signatures against this credential-backed trust directory, independently of the opt-in legacy server-relay verification flag; it refuses to persist or send unsigned P2P events and refuses to create a P2P transport if no local identity/trust verifier is injected. The Chrome two-peer WebRTC test now routes create/read/edit/recall through both production MessageSyncEngine instances and signed command repositories, then sends a forged event and confirms the receiver records a conflict without changing the recalled projection. The P2P identity/trust/dialog VM tests pass **8/8**, the focused P2P/session/factory suite passes **17/17**, the Chrome signed WebRTC runtime test passes **1/1**, and targeted analyzer reports no issues. Invitation v1 and HMAC verification remain available for migration; v1 contains a shared secret and must use a private channel. This does not establish protection if users compare an unverified fingerprint or if a device credential store is compromised. Physical-device connectivity, Internet NAT traversal, and hosted signaling remain unverified.

Manual serverless P2P validation (2026-10-28): the production `ChatService` exports signed envelope v2 using the local signer; imports require the configured trusted-device verifier and verify the exact serialized negotiation bundle before accepting SDP/ICE. Tampered SDP is rejected before a signal is delivered, signer failure preserves queued signals for retry, and identical queued offer/ICE records are coalesced. Two real browser peers exchange signed offer/answer/ICE bundles using mutually fingerprint-trusted Ed25519 identities, establish a DataChannel, and deliver signed messages. This exposed and fixed `P2PMessageTransport` rebuilding its connection when `connect()` followed manual `prepare()`; preparation is now idempotent until disconnect. The duplicate, unreferenced `P2PChatService` facade and its standalone `P2PMessageSession` wrapper have been removed; the app has one P2P path through `ChatService` and the shared `MessageSyncEngine`. Runtime, identity, trust, and ChatService consumers are the maintained validation surface. Physical devices, Internet NAT, and hosted signaling remain unverified; signatures authenticate but do not encrypt SDP/ICE.

## 手動 P2P 信令改為每個 DM session 獨立 — 2026-10-28

原本 App composition root 把單一 `ManualPeerSignaling` 傳給所有
`ChatService`；其 outgoing queue 與 broadcast stream 因此會跨對話共用。現在改由
HomePage 每次開啟 DM route 都呼叫 `DirectMessageSessionFactory.create()`，由
`ChatServiceFactory` 建立新的 signaling channel；DM route 關閉時 dispose 自己的
session。各 DM 因此持有獨立的 service、signal stream 與 outgoing queue，避免並行
P2P 設定把別人的 offer／ICE 匯出或送進錯誤連線。
新增雙 session consumer regression，分別排入兩個 peer 的 offer 並解出簽署 bundle，
確認各 bundle 只包含自己的 signal。`chat_service_factory_test.dart` **5/5**、Chrome
WebRTC／P2P identity 與 trust tests **14/14**、完整 Flutter 測試 **269 通過、3 略過**，
完整 analyzer 無問題；workspace validation **510 checks**、協調 Node tests **76/76**、
Street Scrap owner Node tests **79/79**，viewer data 已重新產生。

Latest architecture slice (2026-10-27, optional protagonist presentation pack): Street Scrap protagonist art is now resource `game.street-scrap.art.protagonist` v`0.1.0`, schema 1, registered as an optional presentation pack with no gameplay effect. The original idle/action PNG bytes are preserved exactly inside the versioned JSON payload; their two package-bundled copies were removed. With the pack installed, the game loads both PNGs from the local active resource store; absent, unreadable, or invalid art uses a small pixel-painted fallback and does not block save or gameplay loading. The game library now declares 11 resources. Package version is `0.1.12`; content versions and save schema did not change. Street Scrap owner suite **346/346**, focused host module/library tests **11/11**, changed-file analyzer **No issues found**, presentation-resource contract tests **11/11**, and signed local resource-release tests **2/2**. The release tests use ephemeral in-memory keys; the new resource is not published to the production Worker catalog. The Web Release build succeeded; its prepared offline shell contains 83 files (25,120,403 bytes) and no protagonist PNGs. In local release preview 9120/9121, Game Library lists the 2.2 MB pack; installing it displays the full protagonist art, removing it shows the pixel fallback without blocking play, and reinstalling restores the art. Gameplay pack v0.1.32 and art pack v0.1.0 are installed in the isolated preview profile under ephemeral local signing keys. True network-offline and device validation remain open.

Architecture maintenance gate (2026-10-27): the coordination test matrix now includes `street-scrap-package` alongside Archery and Mini Royale, with the Street Scrap package analyzer and owner suite selected for game-module changes. Boundary tests now check all three packages as peers, forbid cross-game imports, and verify each registered module is bundled by the App. A model-tiering regression confirms English and Chinese Street Scrap tasks resolve to the frontend package owner, optional-game-modules contract, and owner/consumer checks; explicit backend API tasks resolve to the backend. The host Hive integration test writes progress for the same account into all three games and verifies distinct storage boxes and keys. The focused host consumer matrix passed **72/72**, the changed test analyzer reports no issues, workspace validation passed **570 checks**, and coordination tests passed **136/136**. This confirms the checked-in architecture and local validation plan; it does not claim those commands run automatically in CI.

Follow-up on shared-meal readiness (2026-10-27): the in-game Government Relief panel confirms **0 claims available** and accrual of one claim every 24 hours; its button is disabled. At 2/60 stamina, the isolated save cannot yet start a 3-stamina fixed supply or exploration action. This confirms the gameplay continuation is waiting on ordinary stamina/relief accrual, while the order guidance implementation and 4/5 save are intact. No clock, stamina, or save state was edited.

Latest shared-meal order guidance update (2026-10-27): the chapter-5 cooking order now explains that the shared meal must be placed in a reusable container and that container returned to the backpack; other container orders retain their generic message. Street Scrap module package version increased from `0.1.6` to `0.1.7`; optional gameplay resources remain `0.1.32` and chapter 5 `0.1.23`. Owner suite **341/341**, targeted analyzer on five changed Dart files **No issues found**, focused regressions for chapter-5 guidance and legacy failed-meal guidance passed; frontend module-version/resource consumer test **29/29** passed. Earlier in this validation cycle the selected host consumers passed **72/72**, Web IndexedDB tests passed **3** with **2** platform skips, and the frontend suite passed **220** with **3** skips. The 9060/9061 local preview was rebuilt with the current module and ephemeral local signing keys; the game library visibly reports module `0.1.7`, resources `0.1.32` and `0.1.23` remain installed, and the imported save still shows q5.01 4/5 after reload. The preview visibly shows the new shared-meal instruction. Building the Android APK is blocked by only JDK `25.0.3` being installed while Gradle reports `25.0.3`; iOS is not configured in this checkout, macOS build cannot find `xcodebuild`, and Linux/Windows builds require their respective host OS. Web Release succeeds; the existing Wasm dry-run incompatibility in `flutter_secure_storage_web` remains. Shared-meal delivery is still open: current save has 2/60 stamina and the food inventory shows only fish bone, below recipe inputs. No production service, Keychain, Cloudflare, or 8962 preview was touched.

Final host consumer rerun after the localization and version changes (2026-10-27): **76/76** passed across game-library, route, resource installer and Street Scrap module tests. The shared-meal order remains pending until stamina and ingredients are available.

Latest 9060 q5.01 order delivery (2026-10-27): continued the isolated imported chapter-5 browser save, moved the crafted quality-65 repair awl from workbench to backpack, and delivered it to `ss.order.advanced_workbench`. The confirmation explicitly stated one item and +5 exchange tickets; the order board changed from 3/5 to 4/5 and marked the order complete. Reloading the preview, re-entering Street Scrap, and reopening the order board preserved 4/5 and the completed order. The only remaining q5.01 order is shared meal; the UI reports no matching meal container in the backpack, so it was not deliverable and no completion is claimed. This is a same-browser reload check, not a browser-process restart or offline test; ticket balance was not independently read after delivery. No code, content package version, production service, Keychain, Cloudflare, or user preview was changed.

Latest Street Scrap scene art update (2026-10-27): added a 1159×1358 transparent idle protagonist PNG as an embedded package fallback and layered it into both wide empty-board and empty-material scenes, so the fresh player view is not an empty art shelf. Its display does not depend on downloading optional art resources; it preserves the explore action and compact phone workbench, and adds no material scrolling. The 872×874 widget regression checks the loaded image is over 200 px tall before and after switching to the material gallery, decorative semantics are excluded, and the scene has no overflow; full Street Scrap owner suite **342/342**, host module consumer **4/4**, and targeted analyzer **No issues found**. The runtime module version is now **0.1.3**; gameplay resource versions, ruleset and save schema are unchanged. In the isolated `127.0.0.1:9042` Release preview, a fresh game entry at 1280×720 visibly shows the protagonist in the empty material gallery. With both loopback preview services (9042/9043) stopped, the same browser profile reloaded the offline shell, reopened Street Scrap and displayed the cached protagonist; services were restored afterward. This does not test disabling the host's Internet connection or restarting the browser/device. Movement/work animation, physical-device visual checks and screen-reader review remain open.

Latest q5.01 integration and duplicate-delivery coverage (2026-10-27): read-only inspection of the local `street-scrap-save (5).json` export found revision **196**, 23 exchange tickets, no remaining `fish.pack`, and `completedOrderGroups.q5.01` already containing `ss.order.advanced_search`, `ss.order.advanced_recycle`, and `ss.order.advanced_fish`. Therefore 3/5 was the correct saved completion count; this export alone has no pre/post ticket comparison, so it cannot prove whether the old duplicate attempt granted another reward. Added a canonical-content reducer regression which reconstructs that completion state and retries fish delivery using the already-consumed item ID: it rejects with `orderAlreadyCompleted` before inventory lookup and preserves the entire snapshot and 23-ticket balance. The existing widget regression also confirms completed fish orders expose no delivery controls. The five-producer q5.01 end-to-end order flow now loads all five order definitions from the canonical chapter-5 fixture rather than maintaining a duplicate hand-written catalog. No save was imported and no runtime or package version changed. Street Scrap owner suite **341/341**, targeted analyzer **No issues found**, and fixture-sync test **1/1** passed.

Latest q5.01 delivery-flow regression (2026-10-27): using the canonical chapter-5 v`0.1.23` order fixture, a widget test selects and confirms the actual `ss.order.advanced_fish` fish-pack order. It verifies the exact +5 ticket reward, fish-pack removal, completion history and 1/5 group progress, then closes and recreates the session against the same store and verifies those values remain consistent. This exercises the current transaction through the order UI; it does not reproduce the earlier isolated `9016` profile or prove a full browser-process restart, so that player-side discrepancy is not considered resolved by this test alone. No runtime code or package version changed. Street Scrap owner suite **340/340**, targeted analyzer **No issues found**, and canonical fixture sync test **1/1** passed.

Latest q5.01 regression slice (2026-10-27): the completed-fish-order UI test now loads its five real orders from a fixture derived from canonical chapter-5 content pack `game.street-scrap.content.chapter-5` v`0.1.23`; a coordination test checks the fixture's pack ID, version and full order definitions against the canonical resource. The widget regression confirms 3/5 completion, the fish order remains completed, and no second delivery or ticket change is offered. This changes test coverage only; no runtime behavior or release version changed. Focused widget and fixture-sync tests passed, and the full Street Scrap owner suite passed **339/339**. Workspace validation passed **534 checks**, coordination tests **132/132**, host module/progress-store consumers **11/11**, targeted analyzer reported **No issues found**, Flutter data render completed, and both repository `git diff --check` checks were clean.

Latest implementation slice (2026-10-27, completion-history save validation): save import now validates `completedOrderGroups` before any CAS write; malformed group/list/ID/duplicate shapes are rejected with the current snapshot unchanged. The order panel treats malformed local history as a read-only error state, preventing actionable delivery controls. Unknown but well-formed order IDs are retained for compatible content revisions. Added malformed-import atomicity, validator-shape, and read-only widget regressions; Street Scrap owner suite **339/339**, six changed Dart files `flutter analyze` **No issues found**, frontend module/progress-store consumers **11/11**. Package version is now `0.1.2`. Fresh Release preview `127.0.0.1:9040` and signed local publisher `9041` are live; the game library visibly reports `0.1.2` and 10 optional resources. The local 9016 save export was inspected read-only but was not imported; the desktop preview's native picker did not expose a browser file chooser, so completed-order live visual verification remains pending. Workspace validation **534 checks**, Node tests **131/131**, viewer data render, and both repo diff checks passed. No production service, 8962 profile, Keychain, or Cloudflare was touched.

Latest q5.01 duplicate-delivery fix (2026-10-27): an in-app export of the isolated `127.0.0.1:9016` save (revision 196; chapter 5; content `0.1.32+0.1.23`) showed 23 exchange tickets and `completedOrderGroups.q5.01` containing `ss.order.advanced_search`, `ss.order.advanced_recycle`, and `ss.order.advanced_fish`. Before the attempted delivery, the UI already showed q5.01 3/5; the group’s set-based reducer therefore confirms the fish order was already complete, while its card still exposed a second delivery. The second fish pack was consumed, but the earlier ticket balance was not captured, so no duplicate ticket amount is claimed. Fixed the owner package so grouped orders render as completed and the reducer rejects repeat delivery atomically before inventory or rewards change. Bumped the Street Scrap module package version to `0.1.1`; gameplay resource versions remain independently versioned. Added a reducer immutability regression and a completed-order UI regression. Street Scrap owner suite **335/335**, targeted frontend game-module/progress-store consumers **11/11**, and analyzer on the five changed package files reports **No issues found**. Built a fresh local Release preview at `127.0.0.1:9030` with the signed local publisher on `9031`; the library shows module `0.1.1` and both chapter resources installed. This does not alter the imported 9016 profile, user preview 8962, production services, Keychain, or Cloudflare.

Latest isolated player-flow verification (2026-10-27, `127.0.0.1:9020`): on a fresh local preview, completed the stage-0 street search and tutorial delivery, reaching stage 1 at 57/60 stamina. Moved the native quality-30 rag from the backpack to workboard cell 1,1 through the material workspace. Reloaded the page, re-entered Street Scrap, and confirmed stage 1, stamina, item ownership, and the rag's workboard position were preserved. The material shelf showed large bottle/rag cards at 1280×720. The renewable wood supply point was visible but locked until stage 3, so the live browser flow did not reach the full-backpack supply rejection or its new organize snackbar; that atomic rejection and callback remain covered by the owner reducer/widget regressions below. This is same-origin page-reload evidence, not browser-process restart or physical offline evidence. Only the isolated 9020 origin was changed; 8962 and prior preview saves were untouched.

Latest implementation slice (2026-10-27, renewable-supply backpack-capacity recovery): when an atomic claim cannot fit every supplied item, the domain now returns a stable `renewableSupplyNoBackpackSpace` error instead of falling through to generic failure. The UI explains that the backpack needs room and adds an “整理” action that opens the material workspace, where the player can switch between backpack and workboard and place items. The claim remains atomic: no partial objects or stamina are committed. Added reducer and widget regressions for a 14/16-slot backpack claiming a three-item supply, save equality after rejection, and the organize action. Street Scrap owner suite **333/333** passed; analyzer on the five changed Dart files reports **No issues found**. Coordination tests **131/131**, workspace validation **534 checks**, and viewer data render passed. The existing 9014 preview has not been rebuilt with this change; browser confirmation of the new message/action remains pending. No host contract changed, and the 8962 preview, production API, Keychain and Cloudflare were untouched.

Latest isolated q5.01 player flow (2026-10-27, copied save on `127.0.0.1:9014`): delivered the recycled-adhesive order and the old-street materials order, with the new-district mutual-order counter visibly reaching **2/5**. Caught a quality-58 whole fish and manually filleted a fish into quality-66 meat; the third accepted advanced order requires a fish pack and remains pending. The canonical chain is fish meat×2 + moisture-resistant packaging; packaging itself requires paper board + recycled adhesive, and paper board requires pulp×2. The isolated save had 23/60 stamina after fishing, then claimed the available government relief meal (+37 applied to reach 60/60) and three repeatable paper-scrap supplies, ending at **54/60**. While preparing another pulp batch, the isolated copy's reserved filtered water was discarded; its reusable bottle remains empty and uncleaned. A subsequent clean-jar supply attempt was rejected with “整理後再試”; the save did not change, indicating the backpack needs space before continuing. No fish pack or packaging was produced in this flow. The chapter-5 stage panel's separate broader objectives remain 0/2; this is not chapter completion. Player-side evidence is limited to the 9014/9015 isolated preview; the 8962 user preview, 9016 fresh profile, production API, Keychain and Cloudflare were not changed. No code was changed in this step.

Latest q5.01 player and code update (2026-10-27): Flutter 3.44.0 / Dart 3.12.0 is available at the local Flutter SDK. Isolated Release preview `9014/9015` has base content v0.1.31 and chapter 5 v0.1.23 installed, and a copy of the existing chapter-5 save migrated into that origin. The save preserves chapter 5, 38 stamina and the accepted advanced-recycling order. Player-side material selection exposed that q4.01 tutorial-filtered water is reserved for the filter lesson; selecting it is rejected without consuming materials. The picker now applies the same quest-supply purpose rule as the crafting reducer, so reserved teaching items are hidden. Street Scrap owner tests **331/331** and frontend Hive/module consumers **11/11** pass; targeted analyzer reports 0 errors/warnings and 23 existing info/lint items. A current-source Release preview is running at `http://127.0.0.1:9016/#/home` with isolated signed resource service `9017`, and v0.1.31 / v0.1.23 were installed there. The 9016 profile is still fresh; save import and player-side confirmation of the picker fix remain pending. Paper pulp, reclaimed-glue crafting, and q5.01 order delivery are not yet complete. Workspace Node tests **131/131**, validation **534 checks**, and viewer data render pass. The content compiler still refuses full regeneration because the canonical aggregate and chapter slices do not reconstruct losslessly; existing versioned slices were preserved. Production API, Keychain, Cloudflare, and user preview `8962` remain untouched.

Latest isolated q5.01 preparation (2026-10-27, 9014 imported-save copy): confirmed the public refill point can wash an empty reusable container and fill it with ordinary filtered water; claimed one repeatable paper-scrap supply (×3). This changed only the isolated test copy (stamina 38→31); the user's 8962 preview and 9016 fresh profile were not used. The crafting picker now exposes the ordinary-water plan, but a completed paper-pulp operation has not yet been observed, so recycled-glue production and q5.01 delivery remain pending. 9014, its local resource service 9015, 9016 and its resource service 9017 returned HTTP 200 during this check.

Latest chapter-5 live check (2026-10-27, isolated `127.0.0.1:9012` profile): installed the optional chapter-5 resource and verified the q5.01 recycling order becomes accepted and lists its two required crafting recipes (cloth unpicking and recycled adhesive). Started the old-street expedition, used the fixed exchange point's silhouette hint to find two quality-55 wood chips, returned from node 2 and claimed both to the backpack. The material shelf remains image-first with large cards and no vertical scroll at 1280×720. q5.01 is still 0/5 and the recycling order is not delivered; this is a partial live UI/resource check, not chapter-5 completion. The 8962 profile and production API, Keychain and Cloudflare were untouched.

Latest 9012 isolated player flow (2026-10-27): arranged the q4.02 soup inputs on the backpack, completed all three manual cooking checkpoints at target zones 1, 2 and 3, and confirmed the soup remained in its original meal box while the boiled-water vessel was emptied and retained. q4.03 self-supply consumed the meal; its potential recovery was 20, with 14 actually applied at 46/60 stamina, reaching 60/60. Reloading the page, re-entering Street Scrap and opening the workbench retained chapter 4, 60/60 stamina, and the visible filtered-water, cooking and meal-used tutorial states. This is a single isolated Web profile page-reload check, not a browser-process restart, true offline, phone/screen-reader, or full-game acceptance. The user's 8962 profile and production API, Keychain, and Cloudflare were untouched.

Latest 9012 isolated player flow (2026-10-27): q1.02's first unpick attempt was atomically rejected for insufficient output space; after moving one bottle and paper scrap to the workboard, unpicking and joining three thread ends succeeded. The player sewed two quality-55 rags with the quality-55 thread spool and reusable needle, tapped the center of all three visible target zones, and each step registered as on-target; the result was a quality-63 repair strip and q1.02 3/3. Next, the three-node metal-recycling route cost 5 stamina total, yielded a native quality-55 metal sheet, and retaining it completed q1.03 and unlocked phase 2. One fishing cast cost 3 stamina; all three 2.2-second holds hit their prompts, yielding a native quality-58 whole fish and unlocking phase 3 with q2 3/3. Reloading, re-entering and opening the food category retained phase 3, q1.02/q1.03 completion, 46/60 stamina and the quality-58 fish. The earlier output-space failure was not a storage-adapter failure; its user-facing guidance is localized. The user's 8962 profile was untouched. Owner suite passed **328/328** before a lint-only simplification; the output-space regression passed **1/1** afterward, changed-file analyzer passed, frontend Hive/game-module consumers passed **11/11**, workspace validation passed **534 checks**, and workspace Node tests passed **131/131**; viewer data was regenerated and both repo diff checks passed. Full phases 0–5, device/accessibility and production acceptance remain open.

Latest 9012 woodworking flow (2026-10-27): completed q3.01 with a quality-55 processed wood strip, then resumed the pending q3.02 operation from a new workbench card. A second same-origin tab was initially read-only because the older game tab still held the local writer lease; leaving the old game and re-entering released the lock. The operation had 1/3 saved steps. The q3.02 second checkpoint hit and third missed; settlement still consumed three quality-55 strips plus the nail bundle and produced a processed quality-47 wood board, unlocking q3.03 repair supplies. Leaving and re-entering the game retained phase 3, 46/60 stamina and the repair tutorial. Added a workbench pending-operation card and widget regression. The targeted regression passed, Street Scrap owner suite passed **329/329**, and analyzer on the three changed Dart files reported no issues. The 9012/9013 preview is isolated and did not contact production API, Cloudflare, or Keychain; 8962 was untouched. This is a prompted single-profile flow with game exit/re-entry persistence, not full-game, true-offline, browser-process restart, mobile, screen-reader, balance, or production acceptance.

Latest isolated player flow (2026-10-27, `127.0.0.1:9010`): continued the fresh local save from q0 through q1.01 and q1.02. The four fixed recycling samples were correctly classified; q1.02 supplies appeared in the bag, the UI completed unpicking and joining thread, then manual sewing produced a usable quality-45 repair strip after two misses and one on-target checkpoint. The task showed 3/3 complete. Reloading the page and re-entering the game retained chapter 1, 56/60 stamina, q1.02 completion, and the repair strip. Clicking the visible center of the first and third sewing targets was recorded as a miss while the second succeeded; the cause is not yet established, so this is an interaction observation rather than a confirmed hit-test defect. This remains a single-origin page-reload check, not full chapter 0–5, true offline, browser-process restart, mobile-device, or screen-reader acceptance.

Latest material gallery check (2026-10-27): the current-source isolated Release preview `http://127.0.0.1:9010/#/street-scrap` shows the large image-first shelf at 1280×720; its focused card stays visible with no vertical scroll. A 320×600 widget regression confirms art above 170px, visible paging and no layout exception. The complete Street Scrap owner suite passes **326/326**, analyzer reports no issues in the changed files, workspace validation passes **534 checks**, and coordination tests pass **131/131**. Phone-browser visual, physical-device, screen-reader, unassisted full-gameplay, true offline/process restart, balance/player testing, and production publishing remain open.

Latest isolated player flow (2026-10-26, `127.0.0.1:8920`): same save now completes q1.02 and its page-reload check, then q1.03 by finding and retaining a native plank (quality 80, 2×1; q1.03 completion and material-use index unlock shown). Continued through fishing q2.01–q2.03: paid 3 stamina, hit all three 30% fishing prompts by holding 2 seconds, landed and retained a quality-58 whole fish, and advanced to phase 3 at 36/60 stamina. Moved one common metal scrap and one plastic scrap to the workboard to make suitable 2×1 backpack space; the plank and fish remain visible in the backpack. This is a browser UI smoke run on one isolated local save, not full chapter 0–5, offline, browser-process-restart, mobile-device, or screen-reader acceptance.

Latest material gallery visual check (2026-10-26): kept two centered, oversized material cards per desktop page and reduced focus-mode art scale from 1.7 to 1.3 so the pixel-art silhouette is easier to recognize without shrinking the cards. The 1280×720 gallery keeps category icons, short names, quality values and fixed horizontal paging; a downward scroll leaves the material area unchanged. Inventory-page widgets pass **18/18**, Street Scrap package analysis is clean, and Flutter Web Release build completed. A fresh isolated preview is available at `http://127.0.0.1:8930/#/street-scrap`, with an ephemeral in-memory publisher on 8931; only chapter 0–4 gameplay v0.1.30 and material atlas v0.3.0 were installed. Its new save is at 57/60 stamina with three quality-30 rag pieces. No production catalog, Keychain, or Cloudflare was used.

Latest q1.02 same-save reload verification (2026-10-26): on the isolated `127.0.0.1:8920` browser profile, the task was visibly incomplete before sewing at 44/60 stamina. The sewing recipe was under the phase 0 filter. After manually sewing a repair strip (quality 33; two misses and one on-target checkpoint), the UI showed q1.02 complete. Reloading the same tab returned to home; re-entering Street Scrap restored the same 44/60 stamina and visibly showed all three q1.02 checks plus the completion message. This resolves the earlier incomplete/complete record mismatch for this same browser save and demonstrates page-reload persistence on this origin. No profile revision ID or before/after screenshot artifact was captured; this does not verify browser-process restart, offline startup, or device restart.

Latest local-preview reload check (2026-10-26): after reloading `http://127.0.0.1:8924`, the app returned to home and entering Street Scrap restored the isolated save at 57/60 stamina with two quality-55 rag items. At 1280×720, the materials view shows the fixed board beside two large image cards, with fixed horizontal paging and no vertical materials scroll. This verifies this preview origin's save across a page reload and re-entry; it does not resolve the older 8920 q1.02 sewing-flag discrepancy or prove full browser-process/offline/device persistence.

Latest material UI adjustment (2026-10-26): enlarged phone material-card pixel art by raising its render scale from 1.28 to 1.40 without changing card bounds or adding vertical scrolling. Inventory-page widgets pass **18/18**, Street Scrap package analysis is clean, and the focused q1.02 recipe/session and Hive storage regressions pass. Frontend game-module and progress-store consumer tests pass **4/4** and **5/5**. A fresh local Release preview is running at `http://127.0.0.1:8924/#/street-scrap` with its temporary publisher on 8925; it has the chapters 0–4 pack and v0.3.0 material atlas installed. While checking the older 8920 save, the q1.02 sewing checkbox appeared incomplete after reload, despite an earlier completion record. Session-reopen regressions prove completed flags survive both package and Hive round trips; the cause in that browser save remains unresolved, so q1.02 is not counted as reload-verified.

Latest tutorial progression fix (2026-10-26): q1.01 now derives completion only from the four fixed chapter-one teaching samples and their actual material categories; ordinary scavenged items can no longer create a false completion. A regression covers ordinary-item false positives, correction of a wrong answer, and unlocking only after all four teaching samples are correct. The focused test passed **1/1**, the Street Scrap owner suite **301/301**, and package `flutter analyze` reports no issues. Rebuilt the Release preview at `http://127.0.0.1:8920/#/street-scrap` with its temporary resource publisher on 8921, preserving that origin’s local save. Visually checked the updated materials screen at 1280×720: two large image cards fit beside the fixed board without vertical scrolling. The q1.02 sewing-flow replay remains open.

Latest isolated player-flow check (2026-10-26): on the separate 8920 preview save, completed q0 exploration, return, backpack claim and two-rag delivery, then advanced to chapter 1 and correctly classified the four recycling categories. The image-first classification page showed large item cards with fixed horizontal paging. q1.02 then exposed a real backpack-capacity constraint; the player moved two materials from the backpack to the workboard, after which the all-or-nothing sewing tutorial kit claim succeeded. The save is now at q1.02 with the kit claimed; sewing recipes remain unfinished. These interactions changed only the isolated 8920 save. They do not represent a fresh-save, mobile, screen-reader or full chapter 0–5 acceptance run.

Latest Street Scrap material gallery redesign (2026-10-26): the expanded material view has eight icon-only category filters and shows one centered row of at most two extra-large material cards; additional items use fixed horizontal paging, and narrow screens show one large card per page. Incomplete rows are centered and the shelf never scrolls vertically. Names stay as short image badges, while source, quality and traits remain icon cues. Category semantics expose localized labels, selected state and tap actions; item semantics retain the full material/source/quality description. The 320×600 regression covers card bounds and non-scrolling behavior. The focused inventory page tests pass **18/18**, the full Street Scrap owner suite **301/301**, and `flutter analyze` reports no issues. Web Release build succeeds with existing Swift Package Manager and Wasm dry-run compatibility warnings. Isolated release preview `http://127.0.0.1:8920/#/street-scrap` (temporary local publisher `8921`) was visually checked at 1280×720 with the optional 0.3.0 material art atlas installed: two large cards fit on the first page, the remaining card is centered on the next page, and neither view needs vertical scrolling. At the time of that visual check, the separate origin held three rag pieces at quality 55 and 57 stamina; it did not alter other preview saves. Port 8800 still displays blank white, while 8920 is the current usable preview. Device, live screen-reader, phone-browser visual and complete chapter-playthrough acceptance remain open.

Latest q5.01 producer-chain evidence: the existing same-save test exercises the expedition reducer, renewable-supply claims, fishing and crafting reducers, meal-box assembly, manual cooking and delivery for the five producer orders. Its producer outputs are no longer directly written into inventory; the test still defines its own order/rule/supply catalogs, so this is domain integration evidence rather than validation of the installed canonical chapter-5 resource or player UI. The focused test passed **1/1** on 2026-10-26; full chapter-5 browser play remains open.

Latest offline shell slice (2026-10-25): the Web app precaches a version-pinned shell containing the release index, Flutter bootstrap/runtime, main code and referenced deferred chunks, renderer files, fonts, and the synchronous page scripts `display_context.js` and `street_scrap_writer_lock.js`, plus `manifest.json`. The 32 MiB limit guards storage use; the current Release shell is **70 files / 18,060,254 bytes**. Full Chrome process restart uncovered that omitting the writer-lock bootstrap left the game safely read-only offline; the generator now includes it and has a regression check. `/api/` and signed `/game-resources/` downloads bypass the cache; installation is atomic, and navigation falls back to the cached index. The integrated deploy script generates the manifest and injects its digest before KV asset upload. Offline shell/generator checks **4/4**, Release build, Street Scrap owner suite **288/288**, owner analyzer, workspace validation **534 checks**, workspace Node suite **124/124**, and data render pass. In isolated Chrome, after installing signed base gameplay resource **0.1.29**, we stopped both loopback preview services, fully quit Chrome, relaunched it, and opened the game from the cached shell. The save restored at 56/60 stamina with three native rag scraps at quality 30; starting a new trip successfully persisted a one-point stamina cost. This verifies browser-process restart with loopback services stopped. The computer's general Internet connection was not disabled; Cloudflare production, low-storage recovery, other browsers/devices, accessibility and player acceptance remain unverified.

Latest Street Scrap inventory UI pass (2026-10-25): reduced persistent bottom-navigation labels, redesigned empty work-board cells as clear inset tiles, and made the empty material shelf a large clickable pixel-art street scene that leads into exploration. The material shelf keeps large image cards, horizontal paging, and no vertical scrolling. Street Scrap package suite **288/288**, targeted analyzer and Chrome IndexedDB consumer tests **3/3** pass. Visually checked the image-first material shelf in the isolated Release preview. This is a focused pass over the inventory/work-board surface; fishing, woodworking, orders and other panels still need their own review.

Latest order material selector redesign (2026-10-25): the selection area is now an image board with larger pixel art and shorter labels. At tablet width it uses three columns and up to three fixed rows, showing the seven phase-0 choices together; very wide layouts use four columns, while phones retain two columns and page four choices at a time. The material grid itself has no vertical scrolling. Quantity, selected state, accessible full item names and tap actions remain. Verified in the local browser at 872×874 on `http://127.0.0.1:8870/#/street-scrap`: all seven material cards are visible above the fixed navigation, with enlarged sprite art. Street Scrap owner suite **288/288**, targeted analyzer and frontend Web Release build pass. Port 8800 was not listening during this check; 8870 is the live preview used for visual verification. This updates the order material selector only; other game panels and full device/player acceptance remain open.

## Street Scrap implementation status — 2026-10-25

Latest protagonist-art pass (2026-10-27): an offline-bundled, transparent three-pose sprite sheet now shows walking, picking up, and sorting in the empty workbench scene, with reduced-motion preference respected. Module version is **0.1.4**; save schema and gameplay content are unchanged. The complete owner suite **342/342**, manifest consumer **18/18**, host module consumer **4/4**, targeted analyzer and Web Release build pass. New isolated preview `http://127.0.0.1:9050/#/street-scrap` has chapter 0–4 and chapter 5 content installed; visually confirmed one enlarged pose per frame. This is ambient art motion, not event-synchronized character animation. Small-screen device, screen reader and actual action synchronization checks remain open.

Latest order material picker redesign (2026-10-25): alternative materials on order cards are now image-first selectable tiles instead of a long radio-text list. Responsive grids show at most two rows; narrow screens page four alternatives at a time without vertical scrolling, while the 872px preview fits all seven phase-0 options in four columns. Cards retain quantity, localized material names, selected state and a direct screen-reader tap action. Optional installed sprite atlases are passed into the orders panel. Added a 320×600 regression for fixed paging and semantics. Street Scrap suite **288/288**, targeted analyzer and Web Release build pass. The isolated 8870 preview was visually checked on the orders page; broader chapter playthrough, other screens and device/accessibility acceptance remain open.

Latest exploration UI revision (2026-10-25): replaced four long route actions with a two-column, icon-first action grid for fixed finds, surprise finds, next stop and free return. Node number and current location now use compact icon chips. Each action retains its full localized screen-reader label and stamina cost; visible labels are shortened. To make materials read larger in practice, the fixed-find sprite rendering scale is 1.3× and returned reward art grew from a 78px to 112px box with 1.25× artwork. A 320×600 widget regression confirms all four controls render, the reward card fits without exceptions, and full action semantics remain available. Street Scrap owner suite **287/287**, targeted analyzer and Web Release build pass. The release preview at `http://127.0.0.1:8870/#/street-scrap` was visually checked at 872×874 with the route actions and enlarged returned rag card in view; profile and save are local. This improves exploration only; other panels and full player/device/accessibility acceptance remain open.

Latest material picker redesign (2026-10-25): the fixed-search material selector changed from a text list with repeated quality notes to a two-column image-card picker. Each card uses a 104px sprite, one-line item name and quantity badge; the four phase-0 options fit within a 320×600 viewport with scrolling disabled. When a location offers more than four materials, icon paging keeps four large cards on each page; the seven-option phase-1 case is covered in the owner regression. The isolated release preview at `http://127.0.0.1:8870/#/street-scrap` was visually checked with all four phase-0 options visible. Street Scrap owner suite **287/287** and `flutter analyze` pass. This is a focused picker redesign; the rest of the route screen and unvisited panels still need broader UI review.

Latest isolated resource/browser check (2026-10-25): on a separate fresh origin at `http://127.0.0.1:8856/#/street-scrap`, a loopback-only ephemeral test publisher supplied the current signed base resource **0.1.29** and chapter-5 resource **0.1.22**. Both downloaded and installed successfully through the game library; no production catalog, publisher key, or existing 8852 save was used. The fresh profile is at stage 0: it completed one tutorial street-find, claimed three rag scraps into the backpack, and visibly confirmed the enlarged image cards, page controls, and no-vertical-scroll layout at 1280×720. This verifies resource loading/install and one early interaction only; the complete chapter 0–5 browser playthrough, offline restart, device/accessibility and balance acceptance remain open.

Latest visual redesign and isolated play update (2026-10-25): continuing on that 8856 profile, the tutorial delivery advanced it to chapter 1 and supplied the paper/metal/cloth/plastic sorting set. The sorting panel now uses four compact category chips with completion icons and two/three-column material cards, 64px sprite targets, one-line item/category labels and an icon-only action; all five samples fit in the 872×874 viewport without vertical scrolling. The board's material shelf remains paged horizontally and shows enlarged image cards. Browser inspection confirms one of four categories classified and the profile's saved tutorial inventory intact. Street Scrap owner suite **284/284** and package `flutter analyze` pass. This remains an isolated preview interaction, not full chapter walkthrough, true offline/process restart, device/accessibility or balance acceptance.

Latest materials UI redesign (2026-10-25): the board now switches to a side-by-side layout from 820px width and 620px height. At 872×874, the board uses the larger left canvas and a single-column right shelf shows 252px cards with roughly 222px material art; the shelf pages in place and does not vertically scroll. Added a viewport regression for this breakpoint. The dedicated isolated current-source preview is `http://127.0.0.1:8860/#/street-scrap`; browser play used the tutorial street-find to put three rag scraps into the backpack, and the 1280×720 screen visibly showed large material cards and horizontal paging without vertical scrolling. The 872×874 widget regression checks the larger tablet cards. The material UI test file passed **13/13**, and targeted `flutter analyze` reported no issues. This is not user acceptance, full-device validation or a claim that every game panel has been redesigned.

Latest q5.02 upstream-source integration (2026-10-25): the same-save test now gathers ten intact boards over five old-street exchange trips, obtains the remaining cloth, adhesive, waterproofing, plastic, fuel and metal inputs from renewable supplies, and runs the required sewing, glue, coating, plastic pressing, frame, crate, seal and fastener recipes before crafting and placing the shelter and reinforced chest. The five ordinary cycle orders use two renewable mineral packs each instead of injected mud. Relief-transition checks remain part of the same save. The test seeds the chapter-three crate-kit prerequisite as existing prior progress; it does not replay all earlier chapters. Street Scrap owner suite **284/284** and `flutter analyze` pass. This is same-save domain validation, not a chapter-five browser playthrough or installed-resource verification.

Latest materials UI revision (2026-10-25): the material shelf is image-first, lists loose items before placed items, and excludes stored items until withdrawn. Phone layouts fit two large cards across; fullscreen material cards scale with viewport height up to 248px, and overflow uses horizontal pages. No vertical scrolling was added. The isolated local debug preview at `http://127.0.0.1:8852/#/street-scrap` was visually checked at 872×872; Street Scrap inventory page tests, the full owner suite **284/284**, and `flutter analyze` pass. This preview is not a release build or device/accessibility validation.

q5's reinforced chest was unreachable because its recipe required mastery without offering manual checkpoints, and declared both a new output object and retention of the old crate identity. It now has three manual alignment checks, transforms the same crate instance into the reinforced chest, consumes the two boards/fasteners, and keeps a usable reduced-quality result on a miss. The content compiler enforces that contract; the optional chapter-5 resource remains **0.1.22** (SHA-256 `b23cf2b0628da338750515322660a43275f78de235b4a0fe18bff789f28394f7`). The q5 same-save flow now crafts the shelter and chest through their recipes before placing them. Owner suite **284/284**, analyzer clean, frontend host consumers **8/8**, Web Release build, workspace validation (**534 checks**), Node (**124/124**), content compile and signed resource tests pass. At that earlier checkpoint, upstream tarp/frame/crate/board/fastener acquisition was fixture supplied; the latest q5.02 integration above now sources and processes those inputs.

Latest source and material UI slice (2026-10-25): the phase-1 metal rack now follows the design's guaranteed supply list for metal scrap, shards, wire, nail bundles, metal sheets and a clean reusable container, while preserving the intact-board option used by the q1 lesson. Base content is **0.1.29** (SHA-256 `d156be0ae7f73eca6b01eee1c5e466234f9d8189df1b934c0bbff0da0c7befbc`), aggregate content **0.1.58** (SHA-256 `18e39221e04e8f2218b6b5fd27b0f0319fb6a68d5355097e5e2a8f28d56518bc`), and optional chapter 5 remains **0.1.22**. The 872px material home keeps the full-width board, enlarges material tiles to 152px with 140px art, and pages every loose item without a scrolling shelf. When there are no loose items, the material tray collapses from 198px to a 76px icon-and-count entry, freeing the viewport for the board; the expanded workspace rail is 384px so selected-item controls fit. Rebuilt and visually checked the isolated release preview at `http://127.0.0.1:8852/#/street-scrap` on the existing phase-4 save: the board grows by about 122px in height and material artwork stays large without scrolling. Compiler tests **17/17**, Street Scrap inventory UI tests **12/12**, analyzer clean, and frontend host consumers **8/8**. At this earlier snapshot q5 housing inputs were still supplied by test fixtures; the latest q5.02 source integration above supersedes that limitation. This preview observation is not a fresh-save or chapter-5 browser acceptance.

Latest q5.01 recycling correction (2026-10-25): the integration test no longer claims its invented `recycling_yard` is a content-backed source. It now exercises the canonical phase-1 `sorting_shed` residue option, obtains paper scraps, a reusable clean jar and filtered water through versioned renewable supplies, manually crafts paper pulp, then crafts reclaimed glue and delivers the recycling order. Targeted q5.01 integration, orders tests **24/24**, full Street Scrap owner suite **284/284**, and analyzer pass. This is domain-level evidence with test-defined rules matching the versioned source contract; browser loading of the installed resource is not covered. At the time of this q5.01-only correction, q5.02 housing and cycle inputs were still fixture supplied; the latest q5.02 integration above supersedes this.

Workspace verification was subsequently rerun after the implementation-taskbook update: workspace validation **534 checks**, Node tests **124/124**, viewer-data render, and coordination/frontend `git diff --check` all pass.

Latest progression slice: one q5.01 save now continues through q5.02 housing placement, five ordinary cycle orders, and the relief transition. It confirms q5.02 stays locked until the fifth ordinary order, the warning is required before ending relief, 14 elapsed offline days retain 15 claims, and the one-time 80-point transition supply is granted. Existing producer-order flow actually performs old-street search and the cooking chain through renewable supplies, meal-box crafting, manual cooking, packing and delivery; at that earlier slice, shelter/chest and cycle mud were still supplied as fixtures and are superseded by the latest q5.02 source integration above. Street Scrap owner suite **284/284**, analyzer and frontend host consumers **8/8** pass. This is same-save domain evidence, not chapter-five browser play, real offline/device restart, screen-reader, balance or player validation.

Latest UI adjustment: the fullscreen materials workspace now keeps the 6×6 board full-width at 872px instead of squeezing it beside an overview panel. Board art follows the larger cell size; the material shelf remains paged and non-scrolling. The 872×872 regression confirms the last cell remains visible and both cell and material art exceed 100px. Street Scrap owner suite **284/284**, `flutter analyze` and Web Release build pass. Physical-device, screen-reader and full chapter-5 player acceptance remain open.

Latest runtime slice: the optional material atlas is v0.3.0. On isolated current-source preview `http://127.0.0.1:8852/#/street-scrap` with in-memory publisher 8853, the fresh profile was exercised through q0 delivery, q1 classification/sewing and native-board salvage, q2 fishing, q3.01–q3.04 woodworking/repair/crate storage, and q4.01–q4.03 water/soup/self-supply. q3.02 selected all three rods and nail bundle on one grid and produced a usable board (quality 49); q3.03 restored a worn tool by 10 uses; q3.04 crafted and placed a quality-62 crate and completed a store/withdraw round trip. q4.01 changed the same vessel from turbid to filtered water (quality 63); q4.02 cooked and loaded soup into its reusable meal box while leaving its source bottle empty; q4.03 previewed 20 potential recovery, applied the 11-point cap from 49/60 to 60/60 and completed. q3.01 pressing had two misses and still yielded a rod (quality 37). The q3.02 and q3.04 source reducers consolidate full recipe kits onto one grid while preserving carried object identity/quality and refuse atomically if capacity is insufficient. Code regression, all woodworking tests (**49/49**), Street Scrap owner suite (**283/283**), analyzer and frontend host consumer (**4/4**) passed before this documentation-only update; workspace validation (**534 checks**), Node tests (**124/124**), viewer-data render and both repositories' `git diff --check` are the required checks for this update. The wide material rail remains 42% (420–520px), cards 236px and selected art 132px, with paged shelves and no vertical scroll. The isolated 8852 profile uses local signed resources and no Keychain, Cloudflare, or production API; existing 8850/8851 preview was not changed. This prompted tutorial run is not an unassisted-new-player test. True network-offline/browser-process/device restart, physical-device/accessibility, optional chapter-5 install/playthrough, full chapter playthrough, balance/player testing and authorized production publishing remain open. See the latest implementation-taskbook entry for exact limits.

The design and implementation records are maintained in the [Street Scrap game package](../../taiwan_brawl_front/packages/games/street_scrap/docs/third-game-design-plan.md), with its [111-item material catalog](../../taiwan_brawl_front/packages/games/street_scrap/docs/third-game-material-catalog.md), [implementation taskbook](../../taiwan_brawl_front/packages/games/street_scrap/docs/third-game-implementation-taskbook.md), and [requirement audit](../../taiwan_brawl_front/packages/games/street_scrap/docs/third-game-design-completion-audit.md). The current compiled content contains 111 items and 78 recipes across chapters 0–5. The immutable chapter 0–4 resource is `0.1.29` (SHA-256 `d156be0ae7f73eca6b01eee1c5e466234f9d8189df1b934c0bbff0da0c7befbc`); the aggregate content is `0.1.58` (SHA-256 `18e39221e04e8f2218b6b5fd27b0f0319fb6a68d5355097e5e2a8f28d56518bc`); the optional chapter 5 resource is `0.1.23` (SHA-256 `5176a33b42353c1f0ec969c1b08d8aae2f8b51053ab3693f466f13cf950f96c8`). The frontend owns an independent game package, content-backed inventory and crafting, phase-gated progression, local CAS saves with profile isolation and single-writer protection, renewable supplies, scavenging, fishing, woodworking, water/cooking, orders, and chapter-5 property/storage. Ten optional resources are registered (two gameplay packs and eight presentation packs); local signed-preview installation has been exercised, but the production Worker catalog currently returns HTTP 404, so official download availability is not verified and no production catalog has been published.

The current owner suite and analyzer have passed (see the dated verification entries in the taskbook). There is also isolated-browser evidence for resource installs, save recovery after local preview service restart, and selected chapter/gameplay flows. This is not yet full acceptance: complete chapter-by-chapter unassisted playthrough, true network-offline restart, browser-process/device restart, physical-device/accessibility matrix, balance/user testing, and authorized production publishing remain open. The local art/play demo remains a design-validation artifact, not a replacement for the Flutter game.

The phase progression now has one persisted gate: completing q0.03 atomically advances chapter 0 to 1, and both recipe selection UI and crafting domain APIs enforce `recipe.phase <= chapter`. See the taskbook for the remaining validation limits.

Chapter 1 q1.01 is now wired into the expedition panel: players claim four fixed sorting samples, can correct category choices, and unlock the recycler station only after all four categories are correctly classified. Station access is enforced by both recipe UI and crafting reducers. Flutter verification remains pending because the SDK is unavailable in this environment.

Chapter 1 q1.02 now has a one-time sewing kit and persisted reducer-driven progression through cloth unpicking, joining thread ends into a spool, and sewing a repair strip. The two explicitly single-step recipes can be performed without prior mastery; recipe gates enforce the intended order. Dart tests have been authored but cannot run here because Flutter/Dart are not installed.

Chapter 1 q1.03 now uses a phase-specific fixed metal-recycling rack at route node 3, accepting an intact metal sheet or board. The chosen item's source/quality persist, and keeping or handing it in atomically completes the lesson and unlocks the recipe-backed material-use index. The optional content pack is versioned 0.1.2 for the new phase-indexed route schema.

## Existing architecture snapshot

Workspace snapshot date: **2026-10-21**. The repository-head table below remains the verified `main` baseline snapshot. The architecture migration is committed to dedicated `codex/taiwan-brawl-modular-ci` branches in the coordination, frontend, and backend repositories; those feature-branch heads and CI evidence are recorded in the rearchitecture plan and are not represented as `main` heads.

The messaging/app refactor slice is implemented. The optional feature/game
architecture is documented and implementation has started. Archery's Flutter
UI and module identity/version/schema manifest are package-owned; the shell persists game selection and resource
metadata locally. A reusable HTTPS installer now supports Range resume,
chunked Hive staging, SHA-256 plus Ed25519 verification, rollback-safe version
activation, and package-owned payload validation during staged migration. The
host registers every bundled resource schema's owner parser; a declared schema
without a validator fails closed, and invalid bytes never replace the active
version. Downloaded resources can also
declare an independent payload schema version, validated by the backend and
persisted alongside installed resource identity. Backend catalog and immutable
byte-range resource endpoints now have tests; the Flutter Library can refresh
the remote catalog and install/remove published packs while preserving its
bundled catalog offline. The catalog is currently empty. A versioned public
catalog trust key (`catalog-prod-2026-10`) is staged in the App and Worker
source configuration. The operator reports importing its private key into
login Keychain; Keychain Access confirms the expected service and account
metadata. A non-exporting local challenge verifier is available, but key-pair
matching is not independently verified until the operator runs it. App-side
trust-root parsing has dedicated tests
for this key and fail-closed malformed configuration. No Worker configuration
has been deployed.
Non-empty catalogs require an
Ed25519 publisher envelope (`GAME_CATALOG_TRUST_KEYS`) and expiry validation;
unknown or misconfigured keys fail closed. Unsigned/untrusted packs cannot
install. The unsigned empty response used while no catalog is published leaves
the last verified cache intact; a publisher-signed empty snapshot is distinct,
clears cached download listings, and retains already-installed resources only
as non-downloadable entries so they remain inspectable and removable offline.
Those local-only entries are persisted with the catalog cache and restored on
startup, so revocation does not make already-installed bytes inaccessible to
the Library after a restart. The cache now stores the verified envelope expiry
atomically with its manifests; cached resource listings remain inspectable
offline after expiry, but the Library disables and the service rejects new
downloads/updates until a fresh signed catalog is obtained. Removal remains
available offline. Legacy list-only caches can still be opened for offline
inspection but have no expiry evidence and cannot authorize remote installs.
The cache also persists the signed `issuedAt`; refresh and restart reject a
snapshot older than the last verified issue time, even if that older envelope
has not expired. This prevents a stale but still-valid publisher snapshot from
restoring revoked download metadata, including when overlapping refresh
requests complete out of order. The cache now also retains the original signed
envelope and re-verifies it against the App's configured publisher keys on
startup; parsed local manifests alone never restore download authority. An
expired but valid envelope remains inspectable offline while installs/updates
stay blocked, and invalid/unknown signatures leave only installed local
tombstones available for inspection/removal.
Mini Royale room contracts now carry the package's protocol compatibility
range. The Worker validates creator protocol support, pins its own supported
range rather than trusting a client-expanded range, and checks mutual range
compatibility plus exact ruleset/gameplay identity on join and reconnect;
different package versions are allowed only when those compatibility checks
pass. Legacy stored contracts without range metadata retain exact-version
behavior.
Signed catalog/cache/installer owner tests and Game Library/controller/
registration consumer tests passed. The Game Library explains why expired
cached catalogs disable
downloads/updates and offers an in-page refresh action while preserving removal.
Catalog replacement now publishes metadata and expiry as one listener state;
the controller notifies again when an active screen's catalog expires. A fixed-
clock widget test verifies the banner and action transition without navigating
away. After signed-catalog issue-time, offline signature re-verification, and
live-expiry notification changes, the full App VM suite passed (181 tests, one
browser-only test skipped), Chrome IndexedDB passed, full frontend analysis
found no issues, the Web release build completed, workspace validation passed
(372 checks), and all 41 Node tests passed. Flutter's Wasm dry run still reports the existing
`flutter_secure_storage_web` `dart:html`/`dart:js_util` incompatibility; the
standard JavaScript Web release is successful.
The local release-packaging integration suite now exercises both Archery rules
and Mini Royale gameplay rules through signing, module-specific KV prefixes,
catalog serving, and immutable resource download; the Mini Royale fixture is
also resolved by the room's trusted gameplay-rules loader before admission.
This remains fixture evidence; no production key or catalog upload is implied.
The remote catalog may update resource metadata for bundled modules only;
resource removal is marked `removing` before byte deletion so a failed cleanup
cannot remain in the multiplayer compatibility digest and is safe to retry.
Install/remove operations for each resource are serialized to prevent concurrent
actions from reactivating a pack after the player removes it.
Resources may now declare an optional `activationGroup`; Library install/remove
expands to the whole group, and the local store switches one module active-set
pointer only after every member is downloaded, verified, and migrated. A failed
member preserves the prior active set. Backend catalog validation accepts only
stable group slugs. This is local atomic visibility, not atomic catalog
publication or cross-device activation.
Mini Royale now has a server-side join gate for protocol, ruleset, and gameplay
digest compatibility; incompatible joins receive a structured 409 before room
admission. The App derives the digest from sorted, successfully installed
gameplay-affecting resource IDs, versions, and verified SHA-256 values, in
addition to the built-in rules digest, and sends that contract for room creation
and joining. The backend validates supported game/protocol/rules versions, pins
the creator's normalized digest in the room, and admits only clients with the
same digest. Presentation-only resources do not affect compatibility.
The Archery package manifest now declares its implemented `game.archery.rules`
payload schema v1; owner and App catalog-consumer tests verify that a matching
signed catalog entry can be accepted while unsupported schemas remain rejected.
This does not publish a catalog entry or make an unsigned pack installable.
Archery and Mini Royale player-data repositories now serialize operations per
profile record. A schema migration already in progress cannot race a newer save
or deletion and restore an older snapshot over it; deterministic delayed-read
tests cover both package owners, while App Hive consumer tests continue to
verify the games use separate persistence boxes.
The Mini Royale package and Worker define the same strict gameplay-rules JSON v1
schema for bounded simulation tuning values; malformed, extra, or out-of-range
fields are rejected and executable content is not allowed. Room creation now
resolves non-built-in rules only from the exact publisher-signed catalog entry
and immutable KV payload pinned by the normalized resource tuple, verifies
catalog/resource signatures, expiry, metadata, byte length, and SHA-256, then
persists the resolved rules in room state. The Worker applies those values to
match duration, tower health, and unit speed in its simulation. Host simulation
delegates rule loading to the Mini Royale package. Package logic validates the
room-pinned locally active version and digest through an App-supplied
content-source adapter; it fails closed on missing/malformed contracts,
unavailable versions, or drift. The package also owns the canonical sorted
aggregate gameplay-resource digest function; both App contract construction
and local rule loading use it, so missing or inconsistent aggregate digests
are rejected locally just as they are by the Worker before room admission.
Tests cover signed fixture loading, tampering, persistence, compatibility, and
server simulation. The catalog remains unpublished and no production
`GAME_CATALOG_TRUST_KEYS` binding is deployed, so downloaded-rule multiplayer
is not yet available in deployment; the bundled built-in contract continues
to work offline.
Game-specific launch routes now live in per-game host adapters and are composed
through `game_module_routes.dart`; `main.dart` mounts the registry rather than
declaring individual game routes. Each adapter checks the player's enabled
state and keeps that game's code behind deferred loading. The registry now
rejects duplicate route names instead of allowing a later module to silently
replace an existing module's route; a synthetic peer-registration test covers
the extension and collision behavior without importing either shipped game.
Bundled game host adapters now have one registration point per module; the
catalog, route map, Home launch/collection entries, Game Library extension, and
resource payload validators are all derived from those registrations. Startup
validation rejects duplicate module IDs/routes, Home entries owned by another
module or pointing to absent routes, and resource validators assigned to a
different module. Frontend owner tests and workspace consumer-boundary tests
cover the assembled registry, and the Web release build passed after this
change.
Mini Royale's profile-scoped draft repository and Hive adapter are also
provided only inside its enabled deck route, rather than from the global App
provider list; the package still owns the draft key and migration schema.
Flutter route widget tests verify disabled Archery and Mini Royale entrypoints
return to Game Library rather than opening a game page.
Mini Royale now has a versioned Flutter package owning its module manifest,
multiplayer contract, typed Royale models, field-event catalog, pure-Dart
battlefield rules engine, host battle simulation engine, typed application
service, deck-builder UI, lobby UI, and the room waiting-lobby composition. The
host injects localized labels, arena preview, readiness and friend-action
callbacks; the package owns room/player status presentation and the ready
control. Package widget tests cover rendering, callback delegation, and the
submitting state, while the host continues to own the room lifecycle and
account/social policy. It also owns reusable arena visuals:
field painter, map preview, aim marker, field labels, tower-status token, and
unit token health/effect presentation and animated portrait playback/cache
lookup. The game package also owns the battlefield canvas, arena painter/labels,
and pointer/tap hit surface; the App retains the
room-aware `DragTarget` and injects deployment callbacks and live-state overlays.
The package also owns immersive battle geometry, including the responsive
bottom-hand/side-hand breakpoint, safe-area reservations, and field sizing; the
App injects the live field, HUD/hand widgets, and room command callbacks.
Hand-card and discard-zone visuals are package-owned as well; localized labels,
and discard command handling remain in the App. The package now owns pure
selection transitions, combo limits, hand-snapshot reconciliation, selected
card resolution, drag-combo projection, per-resource cost aggregation, and
affordability and combo-legality decisions (equipment requires a unit; Job
cards are played alone); the App translates those outcomes into localized
feedback and submits only a package-validated play command to the host
simulation or room transport. That command carries card IDs, normalized drop
coordinates, and the side-relative lane coordinate. Package rule tests and App
consumer tests cover this boundary.
The shared drag envelope for hand, discard, and battlefield interactions is
also a public Mini Royale package type; App no longer defines a private game
payload and continues to map accepted drops to room commands.
The package derives card type, cost category, and stat/effect descriptions;
the App supplies its localization lookup, formats package-derived cost totals,
and maps typed energy shortfalls to localized feedback.
The battle-result/rematch overlay layout is package-owned, with localized labels
and the room-rematch callback supplied by the host.
The battlefield instruction selection, collision-radius toggle control, and
base legend are package-owned; the App supplies translated copy and state.
Unit world-to-screen placement, attack-range/collision rings, unit health/effect
tokens, localization mapping, and animated portraits now live together in the
Mini Royale package; App no longer owns those unit-rendering helpers.
The App adapter injects the current user's LLM capability and arena-navigation
callback. The complete interactive arena screen, room-driven UI state,
selection, and gesture orchestration now live in the Mini Royale package. The
host route injects its package-owned application service and transport-neutral
room connection through the App's HTTP/WebSocket adapter. Social operations
similarly cross a Mini-Royale-owned capability port with package DTOs, while
the App adapter owns authentication, friend persistence, and its search dialog.
The arena consumes package-owned gameplay-rules and arena-presentation source
ports; the host route adapts its
verified active-resource store, so the arena no longer reads the App's resource
library service directly. UI translations and locale changes also cross a
package-owned localization port backed by a host adapter. The HTTP adapter
maps App API failures into package-owned service exceptions, and lobby and
invite entry points share one host scope; exiting to Home is a callback.
Game API
consumers use `/api/games/mini-royale/v1` for cards, decks, progression, and
rooms; the backend retains legacy routes as migration aliases. Royale
manifests now declare protocol range, ruleset identity/version, and built-in
gameplay digest in the game package; remote resource-catalog refresh preserves
that bundled compatibility baseline. The generic manifest supports this field
for multiplayer games while allowing single-player modules to omit it.
Game and resource manifests also declare supported targets; Library activation
and pack visibility are filtered by the current Flutter platform, while the
backend rejects unknown or inconsistent platform metadata.
The module catalog schema now also carries manifest version, module kind,
publisher, host API compatibility range, and typed optional/required module or
resource dependencies; the backend rejects malformed ranges and duplicate or
self-referential dependencies before serving a catalog. Required module
dependencies are version-checked on activation and protected from being
disabled while an enabled dependent requires them; optional dependencies do
not block activation. Module activation also checks the host's explicit API
version (`1.0.0`) against the declared compatibility range.
Resource-level dependencies are checked both before downloading and again just
before activation; their declared version range is evaluated against the
installed version rather than requiring the newest catalog version. Before
installing a dependent pack, the Installer also checks the active version
pointer and hashes the active bytes against the installed resource record. An
installed dependent pack prevents removal of its required resource.
The App and Worker now validate module/resource versions using strict SemVer
2.0 syntax; client range comparisons ignore build metadata and preserve
prerelease precedence, while malformed prerelease identifiers are rejected by
both catalog and immutable-resource routes.
After this SemVer alignment, the full Flutter suite passed (173 passed, one
browser-only fixture skipped on the VM runner), the full Worker suite passed
(177 tests), workspace validation passed (372 checks), and the production Web
release build completed. The build reported existing Wasm incompatibilities in
`flutter_secure_storage_web`; the standard JavaScript Web release succeeded.
Backend cards/heroes/progression/deck handlers and Mini Royale room lifecycle
handlers now live in game-specific API modules; the shared room router is a
compatibility facade and retains only social invite routing. Invite creation
now receives its game identity from the owning versioned API namespace; the
frontend remote source derives that namespace from the game ID, and the backend
resolves it through an explicit game API owner registry. The legacy
`/api/rooms/:code/invite` path remains a Mini Royale alias; unregistered game
namespaces do not fall through to Royale. Both versioned and legacy game paths
remain supported. The backend game adapter bridges
authenticated requests to the Cloudflare Durable Object, while the Flutter
package consumes a transport-neutral port. The arena map preview, pure field
painter, aim marker, battlefield zone label, tower coordinate mapping and
selected-card tower threat rules are package-owned; board state, gesture
handling, and the interactive battle/lobby screen and its host
integrations remain in the App. Production resource/release validation also
remains incomplete. The host implements Mini Royale's player-data,
animation-cache storage, and asset-download ports using Hive/HTTP; the game
package owns the schemas and cache policy and has no direct Hive or HTTP
dependency. Mini Royale owns an account-scoped deck-draft repository and its
schema migrations. Drafts are namespaced by profile, restored per slot,
and removed after a successful server save; guests do not persist account
drafts. Schema upgrades now validate the migrated draft and its requested slot
before replacing its stored source, preserving malformed/mis-slotted legacy
data for recovery; both package and Hive consumer tests cover these paths. The
opt-in animation-cache
control now appears under Mini Royale in the
Game Library instead of global account settings. Release/deployment and
physical-device/Internet-NAT checks also remain external validation gates.

## Primary repositories

| Repository | Role | Version | Head |
|---|---|---:|---|
| `taiwan_brawl_front` | Flutter frontend | `0.132.0` | `a082ab2` |
| `taiwan_brawl_back` | Cloudflare Workers backend | `0.1.0` | `9465c95` |
| `user_ui_settings` | shared Flutter settings | `0.1.0` | `96e4f1d` |
| `user_basic_system` | shared Flutter profile/DM package | `0.1.1` | `a15c1b5` |

`user_basic_system` remains a hosted `^0.1.1` dependency rather than a local
checkout; the resolved package cache was verified, so no unsupported local
source migration is pending for that repository.

The local migration workspace also contains two unversioned sibling packages;
their local source state is authoritative for the current refactor and no
remote commit is inferred here:

| Local package | Role | Version |
|---|---|---:|
| `taiwan_brawl_core` | platform-neutral runtime configuration | `0.1.1` |
| `taiwan_brawl_messaging` | offline-first messaging, identity/storage ports and transport primitives | `0.3.0` |

The frontend repository now also contains separately versioned game packages:

| Local game package | Current package ownership | Version |
|---|---|---:|
| `taiwan_brawl_game_archery` | Archery module manifest and independent package/schema versions, profile-scoped progress model, serialization, schema migration and repository; App supplies a dedicated Hive backend | `0.1.0` |
| `taiwan_brawl_game_mini_royale` | Mini Royale manifest, compatibility contract, typed models, field events, battlefield rules and host simulation engines, arena field painter and responsive map preview, aim marker and zone label, application service, deck-builder/lobby UI, account-scoped draft persistence/migration, and versioned battle-animation cache | `0.1.0` |

Each game package now tests that its module-manifest package version matches
that package's release version in `pubspec.yaml`; the frontend consumer test
also verifies the bundled catalog and Mini Royale multiplayer fields are
derived from the package-owned manifest. This guards the separately versioned
release and room-compatibility contracts against silent version drift.
On 2026-10-21, the package owners were independently revalidated from their
own directories with `flutter test --no-pub` and `flutter analyze --no-pub`:
Archery passed 10 tests and Mini Royale passed 61 tests, with no analysis
issues. This is local owner evidence; the GitHub native-runner matrix itself
has not yet been observed running.
The workspace test matrix now routes game-module tasks to both package owners
and App consumer/data-isolation tests; the frontend workflow runs those consumer
gates on pull requests and pushes alongside cross-platform package checks.

## Architecture baseline

- DM receive path is polling-first (`pending_messages`) with FCM as notification assistance.
- Royale realtime path uses WebSocket with `ROYALE_ROOM` Durable Object.
- Backend bindings include D1 `DB`, KV `STATIC_ASSETS` / `CHAT_SYNC` / `PUSH_RETRY`, and Durable Objects `ROYALE_ROOM` / `CHAT_ROOM` / `SIGNAL_ROOM`.
- One Worker serves API, media and Flutter Web assets.

Mini Royale's D1 domain tables are now namespaced (`mini_royale_cards`,
`mini_royale_user_decks`, `mini_royale_match_history`, progression and card-asset
tables). Migration `0029_mini_royale_table_namespace.sql` renames existing
tables in place and preserves their IDs/rows; shared `users` and `sessions`
remain identity infrastructure. Its repository and progression queries use
only the new names. A SQLite in-memory migration rehearsal retained seeded
cards, decks, history, assets, progression/events and passed `foreign_key_check`;
the migration has not been applied to a deployed D1 database.

## Newly agreed architecture requirements

- Keep authentication/account identity and the resource catalog/manager in the
  always-available shell; other feature and game resources are player-selectable.
- Make games peer modules with independently owned models, persistence, APIs,
  assets, and lifecycle versions.
- Keep each game's code in a separate Flutter package referenced by the host
  app and shipped through normal app releases; players select game activation
  and download content/assets, not runtime executable code. Deselecting a game
  deactivates it and may clear cached packs without deleting its code or
  account progress.
- Define resource, data-schema, rules/content, and multiplayer protocol
  compatibility during the initial architecture phase; block incompatible
  clients before they enter a multiplayer match.
- Mini Royale room creation and joining now both require explicit game
  contracts; the room authority no longer silently assigns its current contract
  to a client that omitted version information. Persisted legacy-room migration
  remains separate and explicit.
- Room WebSocket reconnects also submit the client contract; mismatched or
  missing contracts are rejected before socket upgrade. Frontend and Worker
  tests cover both contract propagation and pre-upgrade rejection.
- The platform-neutral optional resource installer is implemented and unit
  tested; end-to-end store/catalog delivery and platform release verification
  remain pending. See `docs/rearchitecture-plan.md` phase 1.

## Local refactor status

- Shared messaging is restored from encrypted local storage at the Flutter
  composition root, with a durable outbox, inbox, conflicts and cursors.
- Corrupt encrypted event records are isolated per record and persisted as
  conflicts, so one damaged local row does not prevent the rest of the offline
  message history from being restored.
- Restore also recovers a pending event when a crash left its outbox row but not
  its main event row, preserving the message and retry state.
- Shared application services for administration, LLM checks, and Royale data
  are now created by the composition root; pages consume provider-injected
  services rather than creating their own HTTP-backed instances.
- `FriendsService` is also composition-root owned and shared by HomePage and
  RoyaleArenaPage.
- ChatService construction is now behind a composition-root
  `ChatServiceFactory`; HomePage no longer assembles messaging identity,
  transport, or signaling dependencies.
- Production ChatService and NotificationService share explicitly injected
  legacy chat and installation adapters from the composition root, avoiding
  duplicate implicit Hive stores while compatibility migration remains active.
- `ApiClient` session caches are scoped to each client instance rather than
  static process state, preventing separate composition roots, tests, or
  accounts from inheriting an in-memory bearer token. Durable session
  persistence still uses the shared `CredentialStore` port.
- AdMob banner and interstitial unit IDs now come from the shared injectable
  `AppConfiguration`; widgets and services no longer embed deployment-specific
  advertising identifiers in feature code.
- LLM provider fallback URL and model now also come from `AppConfiguration`;
  `LlmBotService`, the composition root, and settings hints share the same
  deployment-overridable defaults.
- Backend CORS no longer embeds the deployed Worker hostname as a default
  allowlist entry; same-origin requests and explicitly supported local
  development origins remain allowed, while unrelated origins remain denied.
- Backend LLM fallback URL/model now accept `LLM_DEFAULT_BASE_URL` and
  `LLM_DEFAULT_MODEL` Worker environment values; user-specific saved settings
  still take precedence and legacy defaults remain as compatibility fallbacks.
- Frontend `AppUser` profile parsing now receives `AppConfiguration` through
  `AuthService`, so login/profile fallback values do not diverge from the
  composition-root LLM defaults.
- Remote profile image resolution now accepts the injected API origin, while
  absolute CDN URLs remain unchanged; `AppUser` no longer depends on the
  legacy global `AppConstants.apiBaseUrl` alias.
- Friends overview/search profile parsing now receives the same API origin from
  `FriendsService`, so friend avatars follow the active composition-root
  configuration as well.
- Royale card, deck, room, unit, and nested character-asset parsing now carries
  the same API origin through `RoyaleService`, covering relative game artwork
  URLs without changing absolute CDN URLs.
- Frontend deployment now has an owning `tool/build_web.sh` entrypoint that can
  build Flutter Web with shared `dart-define` values independently; the backend
  integrated deploy path remains available for compatibility.
- The standalone Web build was verified with Flutter release compilation on
  2026-10-20, producing `taiwan_brawl_front/build/web`; the integrated backend
  deployment path was not invoked.
- DM create/edit/recall are projected locally first; disconnected events do not
  fall through to legacy HTTP and are retried through a replaceable transport.
- Legacy local DM history is promoted into shared event projections before new
  edit/recall commands, so existing messages can enter the same offline-first
  lifecycle without losing their original content.
- Legacy promotion is incremental even when shared history already contains
  newer events; older compatibility rows are merged instead of being skipped
  by an early projection return.
- Incoming DM read state is now emitted as a shared durable read event from the
  Flutter chat lifecycle; when offline it remains in the local outbox and is
  retried through the same replaceable transport.
- Initial history, server refresh, and sync-download merge all use the same
  read-event path, so restored messages do not silently remain unread.
- Initial history now treats transport-level network failure as an empty local
  conversation while preserving explicit HTTP errors; an offline client does
  not fail merely because the server is unreachable.
- Backend Google OAuth audience validation now requires explicit
  `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_IDS` Worker configuration; no client ID
  is embedded in the repository as a fallback.
- Explicit history refresh follows the same rule and returns the current local
  projection when the network is unavailable.
- Device signing uses Ed25519 for new local events. Manual P2P requires the
  credential-backed trusted-device verifier; only legacy server-relay and
  pending-notification verification remains opt-in through
  PEER_VERIFICATION_ENABLED. Invitation v2 carries the Ed25519 public key;
  v1 HMAC invitations remain migration-only shared secrets for private exchange.
- The frontend now has a `PeerTrustService` application boundary for explicit
  out-of-band trust import, fingerprint confirmation, and revocation.
  `PEER_VERIFICATION_ENABLED=true` enables the same fail-closed remote
  verifier for legacy server-relay and notification ingestion; manual P2P
  always uses the trusted directory regardless of this flag.
- The DM serverless P2P pairing dialog now exposes the invitation copy/paste,
  fingerprint review, and explicit trust-confirmation actions instead of
  leaving the protocol as an unused service-only seam.
- Workspace tests now guard the composition boundary: pages and widgets may
  not directly import HTTP, Hive, secure-storage, WebRTC, or instantiate low-
  level transport adapters.
- The same guard verifies the production composition root wires encrypted Hive
  restore, secure credential-backed event keys, and friend-scoped cursor storage
  before constructing messaging services.
- Manual P2P transport construction now also comes from the injected
  `MessagingTransportFactory`; `ChatService` requires an explicit message
  transport factory and does not construct server or WebRTC adapters.
- `RoyaleLobbyPage` now resolves its production `RoyaleService` from the
  composition-root provider; only explicit test/alternate-composition service
  overrides remain page inputs.
- `FriendsOverviewSyncService` now receives the composition-root-owned
  `FriendsService` instead of constructing one from `ApiClient`, so overview
  polling remains an application lifecycle concern rather than an HTTP concern.
- Production notification setup now also constructs and injects the
  `NotificationRemoteSource` and `PendingNotificationSource` adapters at the
  composition root; background polling and registration no longer choose their
  own HTTP implementations.
- Production auth, friends, admin, LLM, and Royale services now receive their
  server remote sources from the same composition root. Their compatibility
  constructors remain available for tests and alternate consumers, but the
  shipped graph no longer hides HTTP adapter selection inside application
  services.
- The optional battle-animation cache now receives its Hive store and HTTP
  asset source explicitly from the composition root, keeping cache policy
  independent from both storage and download implementations. The concrete
  adapters live in the App; the game package exposes only the ports and
  requires both adapters at construction.
- Deterministic transport, storage, identity and fallback tests pass locally;
  the production Web entrypoint also compiles with both P2P and peer
  verification flags enabled. These remain compile-time/configuration checks,
  not evidence of two-device WebRTC/NAT or trust-session success.
- A Chrome runtime test now opens two real `flutter_webrtc` peer connections
  with local ICE configuration and carries a shared message event across the
  DataChannel. This proves the browser loopback transport lifecycle, but not
  physical-device connectivity, Internet NAT traversal, or hosted signaling.
- The Chrome WebRTC gate was rerun on 2026-10-20 after the composition and
  deployment-boundary changes and passed. Physical-device, Internet-NAT, and
  hosted-signaling runtime gates remain `NOT_EVALUATED`.
- A frontend consumer test now runs two `ChatService` instances over the
  replaceable in-memory transport and verifies create, edit, recall, and read
  without HTTP or Hive.
- The workspace test matrix now names the Chrome WebRTC runtime command as a
  separate gate, rather than treating the normal VM test suite as evidence for
  browser DataChannel behavior.
- Re-ran the browser resource-delivery consumer gate on 2026-10-21:
  `flutter test --platform chrome test/game_resource_web_storage_test.dart
  test/game_resource_installer_test.dart` passed all 20 tests, including an
  IndexedDB round-trip after closing Hive and reopening it, plus install,
  dependency, activation, and rollback cases. The VM Hive owner test also now
  closes and reinitializes Hive against its temporary file directory; all 7
  tests pass, including restoration of enabled state, catalog metadata,
  active version pointer, and exact payload bytes. This proves browser IndexedDB
  and host file-store persistence respectively, not Android/iOS device delivery.
- Workspace boundary tests now scan both shared packages for platform imports,
  runtime dependencies, and missing public entrypoints, protecting their use by
  future projects.
- Durable messaging restore and degraded-storage fallback now live in the
  dedicated `messaging_runtime_bootstrap.dart` adapter instead of the route and
  Provider assembly file, making the offline startup boundary independently
  replaceable.
- A reusable HomePage storage-status banner now exposes degraded messaging
  persistence to the user instead of silently presenting in-memory state as
  durable.
Room admission now includes the bundled game module version and ruleset identity
alongside protocol version, ruleset version, and gameplay-content digest; the
room pins the full contract and rejects a mismatch before adding a player.

Remote verification on 2026-10-21: coordination viewer workflow run
`39531455535` passed. Frontend run `39560967185` passed all 17 jobs on commit
`f46c4d0da933c4773533fc288fb36bbfc8ce4ed8`, with iOS minimum target 26.0. The
unsigned iOS device build passed; Android API 35 and iOS Simulator each passed
the native lifecycle integration test (install, rollback, update, restart
restore, removal). Web, Android, macOS, Windows, and Linux App builds passed,
as did game package, shared Dart package, consumer, Web IndexedDB, and native
host-storage lifecycle checks. The earlier run `39533157819` failed the iOS
jobs because the app target was iOS 13; that historical result was resolved by
the new product decision and CI evidence. The catalog public key is staged in
source configuration; the operator reports storing the private key in login
Keychain. The matching key could not be independently read back for
verification. Production Worker configuration, catalog publication, D1/KV
deployment, and release remain unperformed.

## Street Scrap offline preview check — 2026-10-27

On a fresh isolated `127.0.0.1:9070` origin, enabled Street Scrap module 0.1.7
and installed the chapters 0–4 gameplay pack 0.1.32. Completed one fixed
exploration pickup and return, leaving stamina at 57/60 and rag pieces ×3 in the
local bag. Stopped the preview web/resource servers (9070/9071), reloaded via
the already-installed Service Worker app shell, and reopened the game. Chapter
0 progress, stamina, and the three native/picked rag items were restored from
same-origin IndexedDB.

This check covers local preview-server interruption and page reload, not a full
device network outage, browser-process restart, first-time offline install, or
physical-device behavior. Existing 9060/8962 browser profiles and production
services were untouched.

## Offline material art cache fix — 2026-10-27

The 9070 offline check exposed that an already-open game could restore its save
while a material detail card rendered without its bundled image. The offline
shell had cached Flutter code and the AssetManifest but not the referenced
package images. `tool/prepare_offline_shell.mjs` now includes bundled
`assets/packages/**` and `assets/shaders/**`; separately downloadable game
data remains outside the shell. The rebuilt shell contains 85 files and
26,825,779 bytes, below its 32 MiB cap.

In the isolated 9070 browser profile, the material image remained visible after
stopping both preview services, opening a fresh tab, reloading, and re-entering
Street Scrap. Stamina (57/60) and rag count (×3) also remained. The 9060/9061
preview was rebuilt with the same change; its existing chapter-5 save still
reopens at 2/60. Full device disconnection, browser-process restart, and
physical-device behavior remain unverified.

## Manual crafting screen-reader controls — 2026-10-27

Crafting checkpoint dialogs now open the text-target alternative controls
automatically when Flutter reports an accessibility service such as TalkBack
or VoiceOver through `MediaQuery.accessibleNavigation`. The existing in-game
assisted-controls preference still works, and checkpoint scoring is unchanged.
Street Scrap module version is now `0.1.11`; game content and save schema are
unchanged.
The alternative has equivalent target choices; the visual slider itself is not
exposed as an adjustable screen-reader control. The Street Scrap package suite
passed 342 tests, the changed-file analyzer passed, and frontend module/save
consumers passed 11 tests. Real VoiceOver/TalkBack use, physical-device
operation, and the broader accessibility matrix remain unevaluated.


## 拖拉式佈局工作台 — 2026-10-27

新增本機 UI 佈局工作台，供街角拾荒直接討論及調整畫面。第一階段「草圖」可加入標題、資源列、分類列、素材大圖、主要操作、底部導覽及資訊卡；畫布元件可拖曳、調整寬高、輸入座標，並定義上下／左右／包含／置中關係。預覽支援 320×600、390×844、768×1024、1280×800，畫布依工作區可用高度縮放。第二階段「視覺細化」沿用同一份佈局，提供三種風格、整體配色，以及元件底色、文字、圓角和字級調整。設計自動保存於本機瀏覽器，可匯出 JSON 規格。

由 `npm run layout-studio` 啟動，網址 `http://127.0.0.1:9080`。瀏覽器實際操作確認拖曳與尺寸修改、切換 320×600 預覽、第二階段樣式切換、範例重設和 JSON 匯出；匯出檔含 6 個元件及其關係。這是獨立的佈局討論工具，JSON 尚未接入 Flutter 實際頁面產生／匯入流程；版面仍以預設元件拼排，非任意向量繪圖器。


**工作台修正（2026-10-27，第二階段強調色）：** 瀏覽器試用發現單一元件與整體的強調色控制原先未完整影響素材圖示／邊框。現在元件強調色接到元件框線與素材圖示，整體強調色接到關係線；回歸測試驗證 app 設定與 CSS 樣式連結。實際操作將素材圖卡強調色改為紅色後，框線與圖示的 computed color 均同步變更。

**工作台擴充（2026-10-27，版面 JSON 匯入）：** 新增版面 JSON 匯入，先驗證 schema／專案識別、預覽尺寸、顏色、元件 ID／種類、畫布邊界與關係目標，再載入草圖；失敗時保留現有設計。新增 schema 正反例測試。尚未把版面 JSON 接成 Flutter Widget 自動產生器。

## 通知推播 provider 組合邊界 — 2026-10-28

`NotificationService` 不再直接解析 FCM 欄位、建立 Firebase adapter 或寫死 `fcm` provider ID。新的應用層 provider adapter 解析遠端設定、判斷平台支援與 token 清理能力；正式 composition root 明確注入 `FirebasePushProvider`。本機預覽 provider 已抽成獨立檔案，且測試確認收到 Firebase 設定時仍不會啟用平台推播。新增 rearchitecture boundary regression，防止 Firebase 選擇重新進入 notification application service。

驗證：Firebase 設定／平台資格／provider adapter／預覽隔離／通知 remote source 定向測試 **7/7**；受影響的 5 個 Dart 檔案 analyzer 無問題；`git diff --check` 通過。尚未做裝置推播或正式 FCM token 註冊驗證。

## NotificationService adapter-only 建構 — 2026-10-28

`NotificationService` 現在只接受明確注入的本地訊息儲存、credentials、舊安裝資料遷移、推播 provider、待處理通知來源與通知遠端來源；移除服務內的 `ApiClient`、Hive、secure storage 及 server adapter fallback。正式與本機預覽是目前僅有的兩個呼叫點，兩者都已提供完整 adapters。架構回歸測試確認服務不再引入或建立這些具體實作。

## ChatServiceFactory 必填應用層 adapters — 2026-10-28

`ChatServiceFactory` 要求明確提供 legacy message store、history/sync remote source 與 transport factory；`ChatService` 本身也要求 messaging core 及這些 adapters，已移除直接建構時的相容預設。正式與預覽組合根都完整注入 adapters，並加入 workspace regression 防止重新引入 `ApiClient`、Hive、server source 或 transport 的隱式選擇。

驗證：factory、離線訊息、API 錯誤型別、server transport 與 legacy remote source 測試 **35/35**；受影響的 7 個 Dart 檔案 analyzer 無問題；workspace boundary 測試 **21/21**。

## NotificationService event adapter boundary — 2026-10-28

`NotificationService` 現在要求 `MessagingCoreService` 及明確的 nullable remote-event authenticator，移除可直接注入 `MessageRepository` 的第二條事件接收路徑。待處理通知來源透過 `PendingNotificationSource.eventFromPendingRow` 將來源格式轉成共享 `MessageEvent`；server 解析留在 source adapter，application service 不再依賴 `ServerMessageTransport`。

驗證：NotificationService pending event integration、pending source、server message transport、notification remote source、push adapter/configuration、preview provider 與 localization consumer 測試 **21/21**；受影響的 4 個 production Dart 檔案及 integration test analyzer 無問題；workspace boundary 測試 **21/21**。尚未以實際 FCM 裝置通知驗證整條通知流程。

## Application services require remote-source ports — 2026-10-28

`AdminService`、`AuthService`、`FriendsService`、`LlmBotService` 與 host-side `RoyaleService` 不再接收 `ApiClient` 或自行建立 server remote source；建構時必須明確注入所屬 remote-source port。正式與預覽組合根仍由 host 建立 HTTP adapters，服務消費者和測試可改用 fake／local adapters，且不會由服務 constructor 隱式選擇 backend。

驗證：LLM direct-provider adapter、Royale source、lobby、街角拾荒模組、通知 integration 與 library consumer 定向測試 **34/34**；受影響的 12 個 Dart 檔案 analyzer 無問題；workspace boundary regression **21/21**。切片完成後，完整前端測試 **224 pass、3 skip**，全前端 analyzer 無問題；workspace validation **576 checks**，完整協調測試 **143/143**，兩個 repo 的 `git diff --check` 通過。

## DM 頁面改用共享訊息投影 — 2026-10-28

`EditableDmPage` 現在只依賴前端 `DirectMessageService` 與 `DirectMessage` DTO。DTO 直接保留共享 `MessageProjection` 的穩定 message ID、revision、已讀集合、收回狀態和 pending 狀態；頁面執行編輯、收回和已讀時使用 event message ID，不再把共享投影先轉成舊 `ChatMessage`。`ChatService` 保留舊歷史／傳輸相容邏輯作為內部遷移 adapter，但不再將它們暴露成應用 API；已讀、編輯、收回使用穩定 ID 定位原始投影。舊 Hive 歷史搬移及資料 adapter 尚未移除。

驗證：projection model、DM widget、ChatService offline／factory 定向測試 **27/27**；7 個受影響 Dart 檔案 analyzer 無問題；workspace rearchitecture boundary 測試 **22/22**。整合測試涵蓋新增、編輯、收回及 incoming message read event；尚未移除 `ChatService` 的舊模型 façade 或 LocalChatRepository 回退。

## DM 舊歷史資料搬移檢查 — 2026-10-28

`LocalChatRepository` 現在在獨立 Hive metadata box 保存每個會話已搬移的 event message ID 清單。`ChatService` 只有在每個清單 ID 仍存在於共享 projection 時，才略過舊訊息 box；標記毀損、projection 缺漏或 legacy 資料被新增／修改時，會重讀來源並重新搬移。原始訊息列保留，供事件存檔損壞時修復。新的 legacy 寫入、資料匯入及舊列變更會使標記失效。

驗證：舊資料搬移、projection 遺失後恢復、Hive metadata 重啟保存／新增舊列失效及 malformed marker fallback 測試通過；定向 Flutter 測試 **23/23**，6 個受影響 Dart 檔案 analyzer 無問題。舊 Hive 歷史尚未清除或移除。

## 舊 DM 資料轉事件責任與 snapshot sync 分離 — 2026-10-28

新增純 `LegacyChatEventMapper`，統一處理保留中的舊 Hive rows 與舊 snapshot 到共享事件的確定性轉換。歷史搬移與 snapshot 合併呼叫 mapper；`MessageChatSyncAdapter` 只負責由共享 projection 輸出舊 snapshot 格式。既有 legacy event IDs、revision、recall event、row key 和 JSON 欄位保持不變；mapper 不依賴 Hive、HTTP 或 `MessagingCoreService`。

驗證：DM offline／factory、legacy migration 與 mapper 定向測試 **45/45**；4 個變更 Dart 檔 analyzer 無問題；workspace boundary 對應測試 **2/2**。這只拆分轉換責任，沒有刪除仍用於離線恢復的舊 Hive rows。

## 舊訊息遷移 manifest codec 與 Hive I/O 分離 — 2026-10-28

新增純 `LegacyChatMigrationManifest`，集中解析及驗證舊 list、version 1、version 2 格式，並處理升級、row key 比對與 SHA-256 fingerprints。`LocalChatRepository` 現在只讀取 Hive rows、呼叫 codec，並保存升級或刪除無效的 manifest；Hive box 名稱、manifest JSON schema、舊訊息 rows 與恢復流程維持不變。

驗證：manifest codec、Hive migration、DM offline／factory、event mapper 定向測試 **50/50**；6 個受影響 Dart 檔 analyzer 無問題；workspace boundary 測試 **1/1**。沒有刪除或改寫既有訊息 rows。

## 街角拾荒角色動作狀態提示 — 2026-10-27

角色素材現在共用單格 sprite 元件。持久化探索存在時，探索面板顯示蹲拾姿勢；工作台有未完成手動加工時顯示整理姿勢，結束後依存檔狀態清除。runtime module version 為 0.1.9，內容包與存檔 schema 未變。

驗證：Street Scrap owner suite 341/341、定向 analyzer 無問題、前端模組／進度存檔／遊戲庫／安裝 consumer 64/64。隔離 Release preview 9084／publisher 9085 顯示模組 0.1.9、核心玩法包 0.1.32；實際進入新來源的階段0探索畫面後看到蹲拾姿勢，體力59/60。加工姿勢由恢復待處理加工的 widget integration test 驗證，尚未在已解鎖工作台的瀏覽器存檔目視確認。手機、真機及效能驗收未完成；未操作9060／9061既有來源或正式服務。

## DM page capability ports — 2026-10-28

`EditableDmPage` now receives optional retry and manual-P2P capabilities through
frontend-owned interfaces. It no longer imports or runtime-checks `ChatService`
or `MessagingTransportFactory`; the application page can use the explicit
manual-handshake UI only when that capability is injected and enabled. Both
DM page widgets accept application ports. `ChatService` implements the
conversation session port and `ChatServiceFactory` implements its factory;
production and preview roots inject that factory, while `HomePage` stores only
the session interface. One pure peer-role rule is shared by the page and
transport factory, without importing either implementation into the other.

Validation: Flutter frontend suite **240 passed, 3 skipped**; full frontend
analyzer reported **No issues found**; workspace rearchitecture boundary suite
**26/26**; both frontend and coordination `git diff --check` passed. This is
interface and UI integration evidence, not a new physical-device P2P runtime
test.

## DM legacy recall key no longer materializes the UI model — 2026-10-28

When the event endpoint is unavailable, the compatibility recall path now
derives the old `createdAt_senderId` server key directly from the message
projection. `ChatService` no longer depends on `MessageChatProjection` or
constructs a `ChatMessage` only to recover that key. The existing behavior is
covered by the fallback integration test; the HTTP compatibility adapter and
legacy history store remain in place pending deployment and stored-data
migration verification.

Validation: ChatService offline suite **25/25**; changed Dart files analyzer
**No issues found**; workspace rearchitecture boundary suite **26/26**.

## Legacy chat storage uses focused adapter ports — 2026-10-28

The broad `LegacyChatStore` contract is now composed from focused capabilities
for history migration, pending-message writes, delivery fallback, and snapshot
import/export. The four compatibility adapters depend on only their required
capability; production composition still supplies the existing
`LocalChatRepository`, preserving Hive box names, row formats, and recovery
behavior.

Validation: DM, factory, notification, pending-message, and migration tests
**34/34**; seven affected Dart files analyzer **No issues found**; workspace
rearchitecture boundary tests **27/27**. The complete frontend suite passed
**240 tests with 3 skipped**, full frontend analyzer reported **No issues
found**, workspace validation passed **576 checks**, and the coordination suite
passed **149/149**.

## Legacy chat remote source uses focused operation ports — 2026-10-28

Legacy remote access is now composed from separate history-read, delivery, and
snapshot-sync capabilities. The history, delivery, and sync adapters receive
only their respective remote interface; `ServerLegacyChatRemoteSource` still
implements the aggregate used by composition roots, with all existing HTTP
routes and payloads retained.

Validation: complete frontend suite **240 passed, 3 skipped**; full frontend
analyzer **No issues found**; workspace rearchitecture boundary tests **28/28**.

## DM migration manifest verifies the legacy source key set — 2026-10-28

The migration manifest now stores its schema version, promoted event IDs, and
the exact legacy Hive row keys present at promotion. Reads invalidate the
manifest and replay legacy history when that source key set changes, including
rows added outside `LocalChatRepository` methods. Existing list-only manifests
are upgraded when their recorded IDs and current row count agree. An incomplete
row-to-event promotion cannot write a manifest, and original rows remain
available for recovery.

Validation: migration and ChatService offline tests **30/30**; focused analyzer
**No issues found**; full frontend suite **243 passed, 3 skipped**, full
frontend analyzer **No issues found**, and workspace rearchitecture boundary
suite **28/28**. Workspace validation passed **576 checks** and coordination
tests passed **150/150**.

## Detect changed legacy DM rows and event ID collisions — 2026-10-28

Upgraded the local migration manifest to schema v2 with SHA-256 fingerprints
for each retained legacy Hive row. Existing list-only and v1 key manifests are
verified and upgraded in place; additions and in-place edits invalidate the
manifest and trigger replay. The shared message repository now accepts an
event ID as idempotent only when its canonical payload matches; a reused ID
with different content is rejected and recorded as a conflict. Legacy history
promotion leaves its manifest incomplete when any source event is rejected.
No legacy rows are deleted and no existing event projection is overwritten.

Validation: legacy migration and ChatService offline tests **34/34**; shared
messaging package tests **34/34**; complete Flutter suite **255 passed,
3 skipped**; complete Flutter analyzer **No issues found**; workspace boundary
tests **30/30**; workspace validation **582 checks**; coordination Node tests
**153/153**; viewer-data render completed.

## Legacy chat store owns its migration record type — 2026-10-28

`LegacyChatStore`, the focused local-history/pending/delivery store ports, and
`LocalChatRepository` now use frontend-owned `LegacyChatRecord`. Its key and
serialized row fields match the previous Hive contract; local read, single-row
read, write, legacy snapshot export, and event promotion no longer depend on
`ChatMessage`. Pending server rows preserve the former parser's acknowledgement
ID and default flags. The HTTP history adapter parses the existing server JSON
directly into the owned record; endpoint paths and query encoding are unchanged.

Validation: record codec, Hive migration/recovery, pending notification,
snapshot conversion, offline history, and notification integration tests
**41/41**; full frontend suite **248 passed, 3 skipped**; full frontend analyzer
**No issues found**; workspace validation **576 checks** and coordination tests
**151/151**.

## Legacy HTTP history decodes into the frontend migration record — 2026-10-28

`LegacyChatHistoryRemoteSource` and `ServerLegacyChatRemoteSource` now return
`LegacyChatRecord`. The existing `/api/chat/dm/:id/history` route, `before`
query encoding, camel/snake field aliases, acknowledgement ID, and old parser
defaults remain unchanged. `LegacyChatHistoryAdapter` promotes local rows and
HTTP history through the same record-to-event conversion; the full legacy
history migration path no longer imports shared `ChatMessage`.

Validation: remote source payload/endpoint, server-history promotion, local
Hive recovery, pending rows, snapshots, and offline DM tests **41/41**; full
frontend suite **249 passed, 3 skipped**; full frontend analyzer **No issues
found**; workspace validation **576 checks**, rearchitecture boundary suite
**29/29**, and coordination tests **151/151**.

## Retired the shared ChatMessage UI projection bridge — 2026-10-28

The former `MessageChatProjection` had no production consumers and has been
removed with the frontend's `chat_models.dart` re-export shim. `DirectMessage`
is now the only app-facing projection DTO; offline integration assertions read
that same DTO. The transport-factory capability name now describes the
DirectMessage event flow.

Validation: full frontend suite **248 passed, 3 skipped**; full frontend
analyzer **No issues found**; workspace validation **576 checks**,
rearchitecture boundary suite **29/29**, and coordination tests **151/151**.

## 移除未使用的舊訊息儲存操作 — 2026-10-28

`LocalChatRepository` 與 `LegacyChatStore` 已移除沒有產品呼叫端的單筆
訊息讀取、送達標記、文字編輯、訊息刪除、整段清空及關閉資料盒操作；
遷移歷史、待送訊息／舊傳送相容寫入，以及快照匯入／匯出仍由各自的
focused capability 提供。Hive 資料盒名稱、舊訊息 JSON 欄位、遷移清單、
讀取復原與保存格式維持不變。遷移測試改由對話歷史讀取覆蓋舊資料列，
workspace boundary regression 防止已移除方法回流。

驗證：完整 Flutter 測試 **248 通過、3 略過**；完整 Flutter analyzer
**No issues found**。工作區資料／文件 gate 於本紀錄更新後另行執行。

## DM 組裝層注入 focused 儲存與遠端介面 — 2026-10-28

`ChatServiceFactory` 改為分別接收舊歷史遷移、相容傳送寫入及快照儲存介面，
以及歷史讀取、相容傳送／收回及快照同步遠端介面；各 adapter 僅取得自己
使用的 capability。正式與本機預覽 composition root 分別共用同一個
`LocalChatRepository` 與 `ServerLegacyChatRemoteSource` 實例；factory 不再依賴
aggregate `LegacyChatStore` 或 `LegacyChatRemoteSource`。workspace boundary
regression 明確固定這項依賴方向。

驗證：factory、offline DM 與 legacy HTTP source owner tests **30/30**；完整 Flutter 測試
**248 通過、3 略過**；完整 Flutter analyzer **No issues found**。協調 repo
驗證、Node 測試與 viewer-data render 於本紀錄更新後重新執行。

## 移除已無使用者的 LegacyChatStore aggregate — 2026-10-28

`LegacyChatStore` aggregate interface 已刪除。`LocalChatRepository` 直接
實作歷史遷移、待送訊息、舊傳送寫入及快照四種能力；notification fake
只實作 pending-message port，DM offline fake 只實作其所需能力。保留所有
Hive row、manifest 與恢復行為，不改資料格式。

驗證：legacy migration、offline DM、pending adapter 與 notification owner
tests **35/35**；完整 Flutter 測試 **248 通過、3 略過**；完整 Flutter
analyzer **No issues found**。協調 repo gate 於紀錄更新後執行。

## 移除已無使用者的 LegacyChatRemoteSource aggregate — 2026-10-28

`LegacyChatRemoteSource` aggregate 已刪除。既有 HTTP adapter 直接實作歷史、
傳送／收回及快照三個 focused remote ports；PreviewRuntime 移除沒有讀取端的
aggregate 欄位，offline 測試 helper 直接接線各遠端 capability。HTTP 路徑、
參數與 payload 維持不變。

驗證：factory、offline DM 與 legacy HTTP source owner tests **30/30**；
完整 Flutter 測試 **248 通過、3 略過**；完整 Flutter analyzer
**No issues found**。協調 repo gate 於紀錄更新後執行。

## Mini Royale 前後端房間合約同步檢查 — 2026-10-28

workspace boundary regression 直接比對前端 Mini Royale module manifest 與後端
房間合約的 game ID、protocol version/range、ruleset ID/version、gameplay digest
及 resource set，避免兩端合約常數獨立演進而漂移。package version 可不同，只要
雙方宣告的協定相容範圍允許；目前不把 package release number 當成唯一相容依據。

驗證：workspace boundary tests **30/30**；Mini Royale package owner tests
**61/61**、package analyzer **No issues found**；後端 Royale contract/room owner
tests **21/21**。room tests 驗證缺少或不相容合約在加入前被拒絕，且不寫入
membership；重連也在 WebSocket upgrade 前檢查。

## 選用遊戲資源移除後保留各遊戲本機進度 — 2026-10-28

擴充前端遊戲資料隔離回歸：在 Archery、Mini Royale 與街角拾荒各自寫入
玩家進度／牌組／存檔，安裝兩份街角拾荒資源與一份 Archery 資源，移除街角
拾荒選用素材圖集，再關閉並重開 Hive。重開後確認只有該圖集不可讀，街角拾荒
玩法包、Archery 資源及三款遊戲的玩家資料都仍可讀。這鎖定本機資源生命週期
與遊戲存檔分離；未宣稱雲端資料刪除行為或真機 UI 流程。

驗證：前端遊戲模組消費端測試 **73/73** 通過；Chrome IndexedDB／資源安裝
測試通過（2 略過）；新增隔離回歸、資源 store 測試及安裝器測試均通過；變更
測試檔 analyzer 無問題。

## 版面 JSON 匯入後立即本機保存 — 2026-10-28

修正 Layout Studio 匯入流程：先驗證並標準化 JSON，再將版面與草圖／視覺階段
一併寫入該瀏覽器的 localStorage；無效輸入不會覆蓋舊草稿。新增匯入保存與失敗
原子性測試。以獨立本機 origin 逐一匯入使用者提供的手機及桌面版 JSON，確認
畫布、7個元件、階段及診斷提醒，重載頁面後資料仍一致。9080 使用中的草稿未改。

驗證：Layout Studio owner tests **8/8** 通過；隔離瀏覽器對兩份規格均完成
匯入與重載確認；協調 repo workspace、Node 與 viewer-data gates 於本紀錄後執行。

## ChatService 直接實作手動 P2P capability — 2026-10-28

移除 `prepareManualP2p`、`exportManualP2pBundle`、
`importManualP2pBundle`、`completeManualP2p` 等重複別名，改由
`ChatService` 直接實作 `ManualP2pDmService` 的 `prepare`、`exportBundle`、
`importBundle`、`complete`。DM 頁面原本已透過 capability 消費這些操作；
信令格式、簽章驗證、DataChannel 與共用同步引擎行為不變。同步修正計畫中
過時的頁面依賴描述。

驗證：offline／factory tests **29/29**；Chrome WebRTC、factory、裝置身分與
peer trust tests **14/14**；變更檔 analyzer 無問題。物理裝置及 Internet NAT
仍未驗證。協調 repo boundary tests **30/30**、workspace validation
**582 checks**、Node tests **153/153** 通過，viewer data 已重新產生。

## DM session 不再強制選用能力 — 2026-10-28

`DirectMessageSession` 現只要求 DM 服務與 session disposal；重試和手動 P2P
透過獨立 capability extension 偵測，HomePage 僅將實際支援的能力傳給 DM 頁。
因此未實作 retry 或 serverless P2P 的替代 session 仍能接入同一 factory 與
路由；目前 `ChatService` 明確提供兩個 capability。未改訊息協定或存檔格式。

驗證：新增 session capability tests **2/2**；完整 Flutter 測試 **251通過、
3略過**；完整 analyzer **No issues found**；rearchitecture boundary tests
**30/30**。workspace validation、Node tests 與 viewer-data render 於本紀錄後執行。

## DM 全歷史快照同步改為選用能力 — 2026-10-28

將全歷史快照上傳／下載從核心 `DirectMessageService` 拆至
`DirectMessageSyncService`。僅在 session 提供此能力時，DM 頁才顯示快照同步
按鈕；本機或 P2P-only session 不必實作伺服器快照。現行 `ChatService` 仍明確
提供原有同步流程；一般對話 refresh 保留在核心服務。

驗證：新增無同步能力／有同步能力的 DM UI 測試與 capability 測試；完整
Flutter 測試 **252 通過、3 略過**；完整 analyzer **No issues found**；
rearchitecture boundary tests **30/30**。workspace validation **582 checks**、
Node tests **153/153** 與 viewer-data render 通過。

## 背景通知只在耐久接收後確認 relay — 2026-10-28

通知輪詢收到共享事件時，只有共享訊息儲存已確認為耐久狀態才回傳 ACK；
若事件遭拒，只有衝突已寫入耐久 conflict store 才 ACK。記憶體／降級儲存中的
事件或無法耐久記錄的衝突會留在 relay pending，避免程序重啟前遺失事件。
協調邊界測試現明確鎖定這些 ACK 條件。

驗證：針對性通知與 messaging core 測試 **9/9**；完整 Flutter 測試 **257
通過、3 略過**；完整 analyzer **No issues found**；rearchitecture boundary
tests **30/30**；workspace validation **582 checks**；Node tests **153/153**；
viewer-data render 已完成。

## 快照同步拒絕衝突時回報失敗 — 2026-10-28

`MessageRepository.acceptRemoteBatch` 會先在暫存 repository 依序預檢整批事件；
若有事件 ID／版本等衝突，正式 repository 只持久化衝突，不套用同批其他有效
事件。快照 adapter 收到失敗後跳過原始相容快照匯入。無競爭時，單筆事件仍立即
進入接收流程；預檢通過後的儲存 I/O 若中途失敗，仍可能留下已落盤前綴，未承諾
跨多事件儲存交易，事件 inbox 保留恢復與重試依據。

驗證：共享 messaging 套件 **35/35**；`chat_service_offline_test.dart` 與
messaging core tests **33/33**；完整 Flutter 測試 **258 通過、3 略過**；
Flutter 與共享套件 analyzer **No issues found**；rearchitecture boundary
tests **30/30**；workspace validation **582 checks**；Node tests **153/153**；
viewer-data render 已完成。

## 多事件訊息匯入具備 write-ahead 恢復 — 2026-10-28

新增可選 `MessageBatchInboxStore` 能力；Hive 將待匯入事件批次以單筆加密
inbox record 暫存。整批預檢通過後才逐筆寫入正式事件，完整成功後才刪除批次
record；程序或事件儲存中斷時，restore 先重讀批次、對已寫入的事件做冪等重試，
完成後清除記錄。確定性衝突會先耐久保存診斷再清除批次，不套用同批有效事件。
批次預檢／提交期間，單筆本機與遠端事件寫入都會排隊，避免新事件改變預檢基準；
無競爭時仍立即執行。這提供 crash recovery，不代表 Hive 對多筆事件提供資料庫
交易；若中途寫入失敗，durable event rows 仍可能暫存前綴，但目前程序不會先套用
部分投影。只有整批持久化成功後才一次更新投影並通知 UI；重啟時仍由 batch inbox
冪等補齊 durable prefix。

驗證：共享 messaging 套件 **37/37**；Hive message-store 與 snapshot owner
tests **33/33**；完整 Flutter 測試 **259 通過、3 略過**；Flutter 與共享套件
analyzer **No issues found**；workspace validation **582 checks**；rearchitecture
boundary tests **30/30**；Node tests **153/153**；viewer-data render 已完成。

## 可下載遊戲資源必須宣告 payload schema 版本 — 2026-10-28

找到資源相容性閘門缺口：舊規則允許已簽署的下載資源省略 `payloadSchemaVersion`，前端就不會把下載內容格式與遊戲套件支援的 schema 對比。現在任何含下載 URL 的資源都必須提供正整數 schema 版本；App manifest 驗證及 catalog merge、Worker catalog 驗證、資源簽署 CLI 與 release packager 均拒絕缺漏。前端仍比對該版本是否由所屬遊戲套件支援，並將此規則寫回跨 repo contract 與 rearchitecture plan。不可下載的本機資源及已安裝撤回項目不因此要求重新取得下載 metadata。

驗證：前端完整 `flutter analyze` 無問題，完整測試 **260 通過、3 略過**；Chrome IndexedDB／資源安裝測試通過（2 略過）；資源 catalog、簽署、打包及生命週期 owner tests **19/19**；Mini Royale package **61/61**、shared core **1/1**、shared messaging **37/37**；backend 完整測試 **192/192**，D1 migration rehearsal 保留 7 筆遊戲 namespace 資料、2 個使用者及 1 個 session，沒有外鍵違規；workspace validation **582 checks**、Node tests **154/154**、viewer-data render 通過。Web release build 成功。Android build 未能開始編譯，因本機只有 Java 25.0.3 而目前 Gradle 路徑要求 Java 17；iOS／macOS builds 因本機僅安裝 Command Line Tools、沒有完整 Xcode 而未完成。此環境沒有 Android／iOS 模擬器；沒有發布 catalog 或部署 Worker。

## 舊訊息歷史遷移採用批次預檢 — 2026-10-28

`LegacyChatHistoryAdapter` 以前逐筆呼叫 shared `acceptRemote`。若一段舊歷史的後續訊息遇到 event ID／內容衝突，前面的有效訊息會先投影，形成部分遷移。本次改用 `acceptRemoteBatch`：先整批預檢再套用；確定性衝突只記錄 conflict、不套用同批有效訊息，也不寫完整遷移 manifest。儲存 I/O 中斷仍由既有 batch inbox 冪等恢復，不宣稱跨多筆資料庫交易。

驗證：`chat_service_offline_test.dart` **28/28** 通過，新增「有效舊列不會在同批衝突時部分投影」回歸；完整 Flutter analyzer 無問題、測試 **261 通過、3 略過**；workspace validation **582 checks**、Node tests **154/154** 及 viewer-data render 通過。

## 舊歷史遷移在事件儲存中斷後可恢復 — 2026-10-28

新增 adapter 層恢復回歸：兩筆舊訊息形成單一批次，刻意讓第二筆事件寫入失敗，確認
批次 inbox 留存且遷移 manifest 未完成；重新 restore 後由 inbox 冪等重播缺少事件，
再次執行遷移會補上完整 manifest，且不重複投影。這驗證了 legacy history adapter、
shared repository restore 與 durable batch inbox 的接合；不表示多筆事件使用資料庫交易。

驗證：`chat_service_offline_test.dart` **29/29** 通過；完整 Flutter analyzer 無問題，
完整測試 **262 通過、3 略過**；workspace validation **582 checks**、Node tests
**154/154**，viewer-data render 成功。

## 舊版訊息收回 key 組裝移入相容交付 adapter — 2026-10-28

舊版伺服器以 `createdAt_senderId` 定位訊息；這個 wire-format key 曾由
`ChatService` 從 shared event projection 推導。現在 `LegacyChatDeliveryAdapter`
負責將 projection 轉換成舊 key 並執行 recall，`ChatService` 只保留事件／舊端點
回退的應用流程。既有 endpoint、key 格式、投影更新及離線 outbox 行為不變。

驗證：ChatService offline 與 factory 測試 **33/33**；完整 Flutter app 測試
**268 通過、3 略過**、完整 analyzer **No issues found**；rearchitecture
legacy-DM boundary regression **1/1**。workspace validation **510 checks**、
協調 Node tests **76/76**、Street Scrap owner Node tests **79/79**；viewer data
已重新產生。

## MessageSyncEngine 入站範圍與 receipt durability — 2026-10-28

`eventFilter` 現在同時限制 outbox flush 與 inbound event ingestion，避免目前
conversation 的 server／P2P session 將其他 conversation 的事件投影到共享資料庫。
範圍外事件被記為 conflict，不會更新投影或觸發 UI callback。Receipt transport 只在
事件本身或拒絕 conflict 已耐久保存後 ACK；本機 event／conflict 寫入失敗則讓 relay
保留該 row。若 conflict append 失敗，repository 移除未耐久的記憶體診斷，讓下一次
重送能重新寫入，而非因記憶體去重而錯誤 ACK。

驗證：shared messaging tests **42/42**、shared analyzer 無問題；Flutter app 全套
測試 **268 通過、3 略過**、完整 analyzer 無問題；DM owner/consumer 定向測試
**33/33**；rearchitecture boundary tests **30/30**、workspace validation
**510 checks**、協調 Node tests **76/76**、Street Scrap owner Node tests **79/79**；
viewer data 已重新產生。

## Outbox durable ACK 失敗保留記憶體 pending event — 2026-10-28

`MessageRepository.acknowledge` 現在先寫入持久儲存的 outbox removal，成功後才從
記憶體 queue 移除 event。若 transport 已送達，但本機 ACK removal 寫入失敗，事件仍
留在 pending outbox，後續會以相同 event ID 重送；接收端既有 event-ID idempotency
會吸收重複投遞。這維持「至少一次重試」的 durable outbox 語義。

驗證：shared message repository tests **19/19**，確認 ACK 寫入失敗後記憶體及
持久 outbox 都保留同一事件，再次 flush 成功後才同時移除；shared messaging 全套
**42/42**；Flutter app **268 通過、3 略過**、analyzer 無問題；workspace validation
**510 checks**、協調 Node tests **76/76**、Street Scrap owner Node tests **79/79**，
viewer data 已重新產生。

## Restore 修復重複 event ID 的 outbox payload — 2026-10-28

若 durable event row 與 pending outbox 出現相同 event ID、不同 canonical
payload，現在以 event row 為準，先耐久記錄 conflict，再把 outbox 副本覆寫成
權威事件；flush 只會收到修復後的事件。若 conflict 或修復寫入失敗，restore
不會回傳含異常副本的 repository，下一次 restore 可重試。相同 payload 但簽章副本
不同時，也會把 outbox 修回 event row 的簽章。恢復時另依 event ID 對 pending
outbox 去重，防止重複持久列在一次 flush 產生重複傳送。

驗證：shared repository targeted tests **23/23**、shared messaging 全套 **46/46**，
package analyzer 無問題；Flutter app **268 通過、3 略過**、完整 analyzer 無問題；
workspace validation **510 checks**、協調 Node tests **76/76**、Street Scrap owner
Node tests **79/79**，viewer data 已重新產生。

## 訊息批次投影採全有或全無提交 — 2026-10-28

批次匯入仍先以 write-ahead inbox 保留 crash recovery；正式事件逐筆寫入期間，
repository 不再提前修改事件集合或發送部分投影。全部持久化成功後才一次套用新增
事件，並按 message ID 通知 UI。若中途寫入失敗，durable store 可暫留前綴，但目前
repository 保持原狀；重啟後由批次 inbox 冪等補齊。這是記憶體投影的原子可見性，
不是 Hive 跨列交易。

驗證：shared repository tests **24/24**、shared messaging 全套 **47/47**、package
analyzer 無問題；Flutter app **268 通過、3 略過**、完整 analyzer 無問題；workspace
validation **510 checks**、協調 Node tests **76/76**、Street Scrap owner Node tests
**79/79**；viewer data 已重新產生。

## Outbox retry scheduler 移入 shared MessageSyncEngine — 2026-10-28

週期性重試原由前端 `ChatService` 維護 timer，現在改由 shared
`MessageSyncEngine` 負責。前端仍可傳入重試週期；engine 僅 flush 符合 conversation
filter 的 pending events；已連線期間的 flush 失敗會保留 outbox 並於下一週期重試，
同一時間不啟動重疊 retry；停止 engine 會取消 timer，並等待進行中的 retry flush
結束後才斷開 transport。初次連線／flush 失敗仍沿用既有 cleanup 流程。共用 API
新增後 package 版號升為 `0.3.0`，與 lockfile 和 workspace snapshot 對齊；不同前端
可以共用相同的同步重試生命週期。

驗證：shared messaging tests **39/39**、shared analyzer 無問題；Flutter app 全套
測試 **268 通過、3 略過**、完整 analyzer 無問題；rearchitecture boundary tests
**30/30**、workspace validation **510 checks**、
協調 Node tests **76/76**、Street Scrap owner Node tests **79/79**；viewer data
已重新產生。

## DM 協商與關閉採序列生命週期 — 2026-10-28

補上手動 P2P session 的生命週期競態：`connect`、`prepare`、`complete`、
`disconnect` 及 disposal 現共用 session 佇列。若 DM 頁在 WebRTC 建立 offer／
ICE 時關閉，transport 會等協商工作結束才斷線；重複 disposal 共用同一 Future，
session 關閉後拒絕重新連線或準備 P2P；同一 session 在斷線前重複準備會沿用既有
transport，避免產生重複協商資料。新增 gated transport、重複準備與終態／重複關閉
測試。Chrome 雙 peer 測試仍實際建立 loopback DataChannel 並驗證讀取、編輯及收回；
這不代表真機、Internet NAT traversal 或正式 signaling 已驗收。

驗證：ChatService factory 定向測試 **8/8**、Chrome P2P／factory／identity／trust
測試 **17/17**；完整 `flutter analyze` 無問題，完整 Flutter 測試 **272 通過、
3 略過**；workspace validation **510 checks**、協調 Node tests **76/76**、
Street Scrap owner Node tests **79/79**，viewer-data render 成功。

## 舊 DM 歷史逐列驗證並保留無效來源 — 2026-10-28

Hive 對話歷史現在逐列解析。JSON 毀損、非物件 payload、欄位型別錯誤、內容推導出的
`messageKey` 不等於實際 Hive row key，或時間戳無法解析，都會列入 `invalidRowKeys`，
不再讓同一會話的有效訊息一併讀取失敗或被搬到錯誤 message ID。有效舊列仍冪等搬入
共享事件投影；只要存在無效列，就不會寫入「全部已遷移」manifest。原始 row 及其
source revision 保留供後續修復或匯出；沒有宣稱能還原已損壞 payload。同時移除只供舊
`List<LegacyChatRecord>` 讀取的未使用 repository helper，測試改走 history snapshot。

驗證：migration／offline 定向測試 **46/46**，涵蓋 row identity／時間戳檢查、有效列顯示、
無效來源保留及遷移標記不完整；完整 frontend analyzer 無問題、Flutter tests
**284 通過、3 略過**；Web Release build 成功。Wasm dry run 仍有
`flutter_secure_storage_web` 相容性提示，與本次 Hive migration 無關。Workspace 文件驗證、
Node tests 與 viewer-data render 於本段更新後重跑。

## 舊版整包 DM 快照先驗證再套用 — 2026-10-28

下載舊版整包快照時，現在會在事件批次接受或 Hive 匯入前驗證全部對話盒與資料列：
盒名稱與結構、字串 row key／payload、JSON 物件、舊訊息欄位型別、row key 身分、時間戳，
以及訊息 sender／receiver 是否屬於該對話。任何一列無效就拒絕整包，避免解析器略過壞列後，
有效事件先進入共享投影、相容儲存才因同一壞列失敗。合法資料先正規化後才交給兩個匯入路徑。
這個 preflight 防止輸入資料錯誤造成部分套用；它不提供跨 messaging store 與 Hive 的磁碟故障交易。

驗證：snapshot adapter／offline 定向測試 **37/37**，涵蓋有效快照、衝突拒絕、格式錯誤、
錯誤 row identity／時間戳／對話參與者／欄位型別，以及有效列不會在壞列前被部分投影；完整
`flutter analyze` 無問題，Flutter 全套 **286 通過、3 略過**。

## 舊版 DM 快照採用可重試下載與匯入後確認 — 2026-10-28

新增 `/sync-download-v2` 與 `/sync-ack`。新端點仍回傳既有快照 JSON，另以 header 傳遞
上傳版本 ID；下載不再先刪除資料。前端只有在整包 preflight、共享事件批次接受及本機
相容列匯入都成功後才確認該 ID。確認以獨立 KV marker 記錄，舊確認若遇到較新的上傳會
收到 409，不會遮蔽新版本；未確認的快照可在原有一小時 TTL 內重試。舊 `/sync-download`
保留一次性行為，前端遇到尚未升級的 Worker 會回退舊路徑。相容舊端點若在新端點確認後
讀取，會得到無資料，不會再取走已確認內容。

驗證：backend 全套 **203/203**、Vitest **1/1**，D1 migration rehearsal 保留 7 筆遊戲
資料、2 位使用者及 1 個 session，0 外鍵違規；frontend 全套 **287 通過、3 略過**、
完整 analyzer 無問題；快照 delivery owner tests **4/4**，frontend remote／snapshot／
offline 定向測試及舊 Worker 回退測試通過。
