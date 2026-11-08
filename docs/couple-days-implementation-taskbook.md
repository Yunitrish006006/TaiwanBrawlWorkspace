# 情侶天數元件：Luna 執行任務書

版本 v0.15。搭配 [產品計劃](couple-days-feature-plan.md)。CD-00 至 CD-03 已完成設計或本機實作驗證；CD-04 服務與快取已本機實作，App 離線冷啟動已補最小唯讀天數、不恢復帳號；CD-05 UI 與多語系已本機實作驗證；CD-06 Android 小樣編譯與原生計算驗證完成，iOS WidgetKit 小樣待編譯；CD-07 Dart／Android 快照已實作，iOS 原生橋接已有程式、待 Xcode／權限驗證；CD-08 Android 正式元件已通過隔離模擬器基本桌面驗收，真機及完整流程仍待完成；CD-09 iOS 程式與 extension 專案已加入、待 Xcode／簽章／裝置驗收；CD-10 本機 HTTP／D1 整合已通過，整體仍待平台／正式環境驗收；沒有部署或真機驗收宣稱。

## 1. 已確認範圍與提案預設

使用者確認：自選交往第一天；單方解除立即生效；每人最多一位情侶；修改日期由另一方同意；刪好友／封鎖先提醒並同時解除；好友列表與詳細頁僅雙方可見；Android 與 iPhone 都提供手機桌面元件。

本輪補充確認如下，取代舊版提案：

- 初次綁定須對方接受；邀請附日期，接受時不直接改日期。
- 各裝置依所在地系統時區計算；只選今天或過去，不提供未來倒數。日期下限 1900-01-01 是工程建議。
- 邀請與日期提案 7 天到期；不設拒絕後 24 小時冷卻，可再次邀請。一般 API 濫用限流與防重送仍保留，不藉此加入產品冷卻。
- 首版不提供歷史頁、週年推播、照片牆、鎖定畫面元件；audit 保留遵守既有帳號刪除政策。
- 桌面元件依後續使用者要求顯示「與〈伴侶名稱〉交往的第 N 天」，提供六種配色、圓角漸層與裝飾愛心；不加照片、起始日或同步時間。離線持續計算，不因 24 小時未同步停止。

App 開啟時亦更新，頻率由工程評估；具體方案見第 3 節。首版排除項與 audit 政策為工程範圍建議。CD-00 聚焦工程契約，不重問已回答的產品選項。

## 2. 狀態機與資料約束

| 物件 | 允許的轉移 |
|---|---|
| 綁定邀請 | pending → accepted / declined / cancelled / expired / invalidated |
| 關係 | active → ended；重新綁定建立新 ID |
| 日期提案 | pending → accepted / declined / cancelled / expired / invalidated |

只有收件者可接受／拒絕，發件者可撤回。反向邀請回傳既有 pending 邀請，不自動視為接受；同一對同時最多一筆 pending 邀請。接受時重查好友、封鎖、帳號狀態與雙方空位，再一起失效兩人的其他邀請。

日期提案建議獨立 couple_date_proposals，包含 relationship_id、requester_id、proposed_started_on、base_version、status、expires_at。每個關係最多一筆 pending 提案；要改提案必須撤回重送。接受前仍顯示原日期；接受須校驗版本，解除或過期後不可套用。

最新確認：情侶與好友／封鎖／聊天同在 SOCIAL_DB；帳號及登入在主庫 DB，遊戲在 GAME_DB，詳見 [資料庫拆分計劃](database-separation-plan.md)。couple_active_members 以 user_id 主鍵確保每人一位。接受時的好友／封鎖檢查、關係建立、雙方成員及邀請失效使用已驗證的同庫原子操作；刪好友／封鎖與解除情侶也在同庫完成，不由前端多次 API 模擬。帳號停用／刪除才需主庫 outbox、去重重試及終止世代；CD-00 定稿其跨庫競態，不能宣稱跨庫原子交易。

寫入使用穩定操作 ID；同鍵同內容可重送，同鍵不同內容報衝突。ended 關係與終態提案不可復活；保留歷史不應阻擋同一對再次綁定。帳號停用／刪除須清理有效綁定並遵循既有刪除政策。

API 僅用 session 推導操作者；第三方猜測 ID 不得讀寫。契約固定驗證錯誤、未登入、不可見、衝突、限流與對應 UI。沿用既有 cookie／Bearer／CSRF 邊界，不把私人關係欄位放入公開搜尋或遊戲共享模型。

## 3. 日期、同步與離線

`dayCount = max(1, ordinal(today in deviceTimeZone) - ordinal(startedOn) + 1)`。使用曆日序號，不以兩個本地午夜的毫秒差除以 24 小時計算。startedOn 是不轉時區的日期字串；deviceTimeZone 是目前系統 IANA 時區，不需定位權限。旅行或跨日可能使兩人天數不同；max(1) 僅處理已綁定後跨日期線回到起始日前的顯示，不能用來接受未來日期。

測試例：2026-11-01 當天第 1 天；至 11-04 第 4 天；2024-02-28 至 03-01 第 3 天。另測跨月、跨年、錯誤日期、未來日期及不同手機時區。

後端 overview 包含 serverNow、startedOn、status、version，不提供跨裝置共用的 dayCount。提交／接受日期時送出有效 IANA 時區，後端以 serverNow 換算該時區今天作上限驗證；接受者當地尚未到起始日則提示稍後接受。裝置可自行改時區，這不是 GPS 地理驗證。

刷新方案（初版工程決策，CD-06 驗證電量及平台表現）：

- App 啟動、登入、回到前景及恢復網路立即同步；重複生命週期事件 5 秒內合併，手動刷新與成功寫入後的刷新不被略過。
- App 前景且有登入帳號時，每 60 秒同步關係 overview；單一 in-flight 請求、背景停止輪詢，失敗採 1／2／4／最多 5 分鐘退避，恢復網路可立即重試。
- 本機日期／系統時區變更及當地午夜重算天數，App 不需等網路才能增加天數。離線一直以最後 active 起始日計算；收到 ended／登出／換帳號才清除。
- App 同步成功後僅在顯示資料或狀態改變時要求元件刷新；App 可見的最後同步時間留在詳細頁，不放桌面。
- Android 建議每 30 分鐘系統週期更新本地顯示，另處理日期／時區變更、重啟與 App 主動更新；不為計天數每 30 分鐘打後端。
- iPhone 預排未來 30 天當地午夜 timeline，請求每日補充；到期重新依儲存起始日產生，不停止計數。時區變更的 timeline 重建與延遲由原生小樣驗收。

快取依帳號隔離，舊版本／舊帳號延遲回應不能覆蓋新狀態。離線不能接受、改日期或解除並宣稱成功。系統時間被手動改動可能影響離線天數，連線後以 serverNow 校正。

「解除立即生效」指後端提交後立即失效。遠端離線裝置不能即時得知解除，恢復同步後更新；不保證所有桌面在解除瞬間重繪。

## 4. Android 與 iPhone 手機桌面元件

兩平台均在本次功能範圍。現有 frontend 包含 android/ 與 ios/ 原生專案；本次限定檢索尚未發現 home_widget／WidgetKit／AppWidget 整合，因此先做技術小樣，不能假定 Flutter 徽章能直接放入桌面。

已確認外觀：小型卡片只顯示「第 123 天」，支援淺深色及大字級。使用者主動從系統加入元件，App 提供加入教學。點擊開啟情侶詳細頁，先通過登入與關係檢查。

| 狀態 | 元件呈現 |
|---|---|
| 上次確認 active | 依所在地持續計算，顯示伴侶名稱與天數（舊快照無名字時只顯示天數） |
| 未登入 | 請登入 |
| 無關係／已解除 | 尚未綁定情侶，清除原日期與天數 |
| 長期離線／同步失敗 | 仍依原起始日計算，沒有顯示期限 |

資料流：後端 → Flutter service → 最小顯示快照 → 原生 adapter → 系統元件。快照僅含帳號隔離鍵、關係 ID、版本、起始日期、狀態、lastSyncedAt；計算時讀目前系統時區，無 validUntil。不得包含 session token、私訊或密鑰。元件不自行取得登入憑證；App 同步後更新關係快照，元件自行計算曆日。

綁定、改日期、解除、登出與換帳號都觸發快照替換／清除及元件刷新請求。清除舊 timeline／排程，防止舊資料再次呈現；多個元件實例共用同帳號狀態。永不開 App 且無同步機會時，遠端解除可能一直未知，元件仍按原日期計算；這是使用者選擇持續離線計數的行為，不宣稱關係即時有效。

- Android：原生 AppWidget 呈現、Flutter bridge、重新啟動及日期變更刷新、點擊導向；驗證桌面尺寸及省電狀態。先用最小原生方案小樣，再決定是否採套件。
- iPhone：WidgetKit extension、每日 timeline、App 共享儲存、deep link；先核對 bundle ID、App Group entitlement 與簽章權限，再固定設定。缺少實機簽章時明確記錄未驗收。
- 跨日可提前產生日期顯示；依最後 active 狀態持續計數，不把本機計算當成最新關係同步。
- 所有跳轉在 App 重新驗證 session 與當前關係；舊元件不能讓其他帳號看到前帳號內容。

官方依據：[Apple 更新策略](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)、[Android 更新機制](https://developer.android.com/develop/ui/views/appwidgets/advanced)。WidgetKit 使用系統更新預算；Android updatePeriodMillis 不支援低於 30 分鐘週期。故不承諾午夜零秒準時刷新，不以高頻輪詢作驗收條件。

## 5. Owner、切片與驗收

| ID | Owner／輸入 | 交付與通過條件 | 依賴 |
|---|---|---|---|
| CD-00（設計完成） | coordination；產品計劃 | 已交付工程契約、API/error fixtures、所在地日期與 widget schema，以及 D1 batch／guard 策略審查；runtime gate 留在 CD-01 | 無 |
| CD-01（本機完成） | backend；CD-00 | 三庫 schema、15 表搬移 rehearsal、12 項 workerd D1 測試通過；接受與封鎖／刪好友 batch primitives 完成，正式讀寫切換待後續 | CD-00 |
| CD-02（本機完成） | backend | 邀請、overview、日期提案、解除 routes；typed error、身分／來源驗證、限流、冪等回應、20 項 D1 API 測試通過；正式開關仍關閉 | CD-01 |
| CD-03（本機完成） | backend | 既有封鎖／刪好友路由原子解除情侶；三庫來源選擇、帳號停用 outbox／逐庫重試／寫入保護及連線重查；54 項 D1 測試通過，正式切換待做 | CD-02 |
| CD-04 | frontend | typed model、remote source、service、帳號隔離快取；消費固定 API fixtures、舊回應不覆蓋 | CD-02 |
| CD-05（本機 UI 驗證完成） | frontend | 好友卡片、詳細頁、邀請、日期修改、解除與提醒；繁中／英文／日文、載入／錯誤／離線／大字級 widget tests；前端完整 357 項通過、3 項略過，analyze 通過；正式與真機驗收待 CD-10 | CD-03、04 |
| CD-06（部分驗證） | frontend 原生 | Android Debug AppWidget 編譯、3 組 JVM 測試完成；iOS 獨立 WidgetKit 小樣／XcodeGen 規格及 Foundation 8 案例完成；缺 Xcode，extension 尚未編譯；兩平台桌面與電量實測未驗收 | CD-00 |
| CD-07（Dart／Android 本機驗證） | frontend | 最小快照、opaque scope、原生持久 generation／sequence 拒絕舊寫入；離線未知身分保留快照、登出清除；iOS 原生與真機驗收仍待完成 | CD-04、06 |
| CD-08（模擬器部分驗收） | frontend Android | 真實快照 reader、空狀態、離線計數、午夜非精確排程、跨時區／重開機／多實例刷新與登入驗證導向已實作；隔離 API 35 Launcher 的狀態／多實例／外觀／冷啟動／重啟／時區已觀察，真機與兩帳號流程待驗收 | CD-05、07 |
| CD-09（程式與 Foundation 驗證，待原生建置） | frontend iOS | 共享快照／原生橋接／WidgetKit timeline／extension 專案已加入；28 項 Foundation、6 項專案檢查通過；缺 Xcode、App Group／簽章及裝置驗收，Dart iOS 同步預設關閉 | CD-05、07 |
| CD-10（本機整合通過，整體驗收未完成） | 全部 owner | 真實本機 Worker／D1／HTTP／Flutter service／Hive 流程與合成兩帳號通過；平台與正式環境待驗收，詳見驗收表 | CD-08、09 |

已查核入口：backend src/api/friends_api.js、src/features/friends_repository.js；frontend lib/models/friends_models.dart、lib/services/friends_remote_source.dart、friends_service.dart、friends_overview_sync_service.dart；既有 test/friends_models_test.dart、test/friends_remote_source_test.dart。實作前讀 owner AGENTS.md，定位實際好友頁及 composition root。

## 6. Luna 執行方式與模型告知

初始規劃由 Astra 完成，CD-00 由 Sol 完成。切換前必須先告知使用者模型、原因與方式；本文件不會切換現有對話，也不啟動巢狀代理。

每次只交付一個 CD 切片及其已固定的輸入，包含可改檔案、完成條件、驗證命令與停止條件。Luna 適合已固定契約下的 model、元件、文案與測試實作；資料庫競態、授權、原生憑證邊界須先定案。不得為了使用 Luna 而省略 owner/consumer 驗證；如本地 model-plan 建議較高模型，先告知，不自動升級。

交接提示範本：

> 執行 CD-XX，讀取本任務書與已定稿產品計劃。先讀 owner 規則並執行 model-plan。只修改此切片 owner 及必要測試，保留無關 dirty changes。依固定 fixtures 實作；遇到缺失產品決策或契約矛盾記錄問題，不自行擴大範圍。完成後回報改檔、測試命令與結果、尚未驗收項目。不得把單元測試當真機驗收，或自行部署。

## 7. 驗證與交付

- backend：npm test；依 test matrix 執行 npm run db:migration:rehearse，確認現有 rehearsal 是否涵蓋新情侶 migration，否則新增實際涵蓋它的 rehearsal。
- frontend：flutter analyze、flutter test；新增日期、服務、UI 及原生 snapshot 測試，再做 Android／iOS build 與桌面實機驗收。SDK 路徑依環境，不寫死主機路徑。
- coordination：node scripts/validate-workspace.mjs、npm test、node scripts/render-flutter-data.mjs；已通過檢查在輸入未改時可重用。
- 端到端：邀請→接受→同起始日按各地日期計數→提日期→另一方接受→重登入→元件刷新→解除；另測刪好友、封鎖、雙接受競態及換帳號。補測第 7 天期限邊界、拒絕後立即重邀、跨時區日期不同、離線 31 天及 timeline 續接、前景 60 秒輪詢與背景停止。
- 交付分別列出 App、Android 元件、iOS 元件、migration、真機、部署的狀態。所有所選平台完成才稱整個功能完成；本次規劃不包含正式部署授權。

CD-03 本機完成：[社交／帳號生命週期證據](../../taiwan_brawl_back/docs/social-lifecycle-cd03.md)。後端 206 + 1 + 54 項測試及兩組 migration rehearsal 通過；前端 analyze、VM 及 Chrome consumer gate 通過（Chrome 31 項、3 項 VM-only 略過）。正式資料尚未搬移，DATABASE_MODE／ENABLE_COUPLES_API 尚未在正式環境切換。帳號實體個資抹除與新 UI 不包含在這個切片。下一步 CD-04：前端 typed remote source、service 與帳號隔離快取。本次維持 Sol，沒有啟動 Luna。

CD-04 階段紀錄（離線唯讀計數已由下方 CD-10 補足）：已實作 typed model、所有情侶操作、帳號隔離快取、前景更新與斷線恢復；伺服器亦比對請求帳號與 session，避免切換帳號期間讀寫錯誤資料。前端目前只有在已確定帳號後才能安全讀取離線快取：App 完全關閉後若離線啟動，既有認證流程無法識別帳號，故此情境尚未完成，須在後續 UI／桌面元件整合時設計並驗證，不能宣稱離線冷啟動已支援。正式部署與手機桌面元件尚未完成。

CD-05 UI 本機實作：首頁好友側欄已加入情侶入口，伴侶好友顯示天數；點好友頭像可進好友詳細頁。CouplesPage 接上邀請、接受／拒絕、撤回、提出／確認日期與解除確認。離線快照唯讀，錯誤可重試，操作保留同內容 operationId，日期草稿保留於頁面。日期操作每次自動讀取裝置時區（Android TimeZone、iOS TimeZone、Web Intl），無法取得時停止操作。好友詳細頁提供刪除／封鎖，確認框固定提醒若已綁定將同時解除，成功後先清除舊情侶快取再同步；兩個頁面在帳號變更時隱藏原帳號內容。情侶頁、好友詳細頁及側欄新增文字已接入繁中／英文／日文翻譯，包含名稱、天數、日期模板與切換語言後的既有錯誤提示。

CD-05 驗證範圍：widget tests 涵蓋日期範圍、邀請／改日期送出、選日期中切換帳號、語言切換、解除成功與取消、改日期失敗保留原關係、大字級、離線禁止寫入、時區變更／失敗、刪除後同步失敗及封鎖取消。九種 typed 操作另由 consumer contract tests 驗證。先前 Android debug、Web release 編譯成功；此次多語系變更以 analyze、VM widget／contract／locale tests 驗證。iOS 原生時區實作尚未經 Xcode 編譯或真機驗收。CD-05 為本機 UI 實作與自動測試完成範圍；正式環境完整流程與真機驗收保留至 CD-10，桌面元件亦尚未完成。

CD-06：[兩平台小樣、重現步驟與 bridge 契約](../../taiwan_brawl_front/native_spikes/couple_days/README.md)。Android receiver 僅存在 src/debug，使用固定測試日期，不讀取真實帳號。Android 最低 API 24、target 36 由合併 manifest 查核；iOS 小樣沿現有 Runner 最低 26.0，獨立 App Group／bundle ID 僅為未註冊的 sample 設定。無連線 Android 裝置、無 Xcode／XcodeGen，元件加入、重啟、深色／大字級外觀、多實例與省電刷新均未實測。原生 generation 持久化、requestSequence 比對與完整快照單筆儲存方案已固定，但橋接與真實資料流仍由 CD-07 實作；不能將小樣宣稱為正式桌面元件或完整可行性驗收。

CD-07：[Dart／Android 快照證據與限制](../../taiwan_brawl_front/docs/couple-widget-cd07.md)。Android bridge 已由 main composition root 接上真實服務資料，私有儲存單筆快照、不輸出憑證；離線無法驗證身分時保留原生快照，不將 App 視為已登入。前端 VM 365 項通過、3 項略過，analyze 與原生 3 組狀態測試通過。iOS bridge 尚未啟用；桌面小樣仍使用測試日期，真實快照讀取、刷新與點擊驗證屬 CD-08/09。CD-07 不得標為兩平台全部完成。

CD-08：[Android 正式元件證據與未驗收項目](../../taiwan_brawl_front/docs/couple-widget-cd08.md)。前端 VM 368 項通過、3 項略過，analyze、Android 原生 7 組測試與 debug APK 編譯通過。測試 APK 已安裝到唯讀 Pixel 模擬器，但 Launcher 黑畫面，未觀察到元件放置或顯示；已關閉測試執行個體，沒有清除或保存覆蓋原 AVD。正式 receiver 已讀取真實快照；不等於已部署或完成兩帳號／真機驗收。

CD-09：[iPhone 程式、專案連結與驗收界線](../../taiwan_brawl_front/docs/couple-widget-cd09.md)。共享快照與 App Group helper 以 macOS Foundation 編譯，28 項暫存檔／版本競態／日曆檢查通過；extension 專案 6 項結構檢查及 Swift 語法解析通過，不等於 UIKit／WidgetKit 原生編譯。前端 VM 369 項通過、3 項略過，analyze 與 iOS opt-in Dart 路徑 9 項測試通過。iOS 同步旗標預設關閉，原生 extension／entitlement 仍會參與後續 iOS 建置，必須先完成兩個 target 的 App Group 與簽章設定。未執行 Apple 帳號註冊、簽章、部署或實機驗收。

CD-10 首次本機整合紀錄（後續補強見下段）：[本機整合結果與交付待辦](couple-days-cd10-acceptance.md)。新增隔離本機驗收腳本，三庫實際 migrations、合成帳號、真實 HTTP／Flutter service／Hive 流程通過；元件 bridge 為 Dart 測試替身，並非桌面實測。已修正延遲登出可能刪除新登入憑證的認證請求順序問題；前端 371 項通過、4 項略過（本機整合另行執行通過）、Chrome 10 項通過，後端 206 + 1 + 55 項及兩組資料保存演練通過。iOS Foundation 28 項、專案 6 項檢查通過；Android 修正後 debug APK 已重新編譯成功。Xcode、iOS App Group／簽章、Android／iPhone 裝置、App 離線冷啟動身分及正式部署仍未完成，整體不能標為完成。

CD-10 離線冷啟動補強：[唯讀投影界線與測試](../../taiwan_brawl_front/docs/couple-offline-cold-start.md)。登入頁可在身分尚未驗證時，僅讀取既有原生 active 快照的起始日／最後確認時間並顯示天數，不選取帳號快取、不恢復登入或操作權限。開始登入、登出、401 或成功確認身分會關閉當次程序的舊資料入口，畫面另直接檢查 auth 防止延遲通知短暫顯示。前端 381 項通過、4 項略過；Chrome 14 項通過、1 項略過；Android JVM 8 項、Swift Foundation 30 項檢查通過，真實本機 HTTP／D1 流程加入唯讀投影檢查後亦通過。Android debug APK 已重新編譯，手機冷啟動、桌面與 iOS 原生／簽章驗收仍未完成。

CD-10 Android 平台補強：[隔離模擬器驗收](../../taiwan_brawl_front/docs/couple-widget-android-emulator-acceptance.md)。全新 API 35 AVD 可正常使用 Launcher；正式元件加入、一個／兩個實例各四種顯示狀態、深淺色與兩倍字級、離線點擊登入保護、readCounter 唯讀頁、重啟後恢復及時區事件更新均已觀察。快照為合成資料；未執行真實 OAuth／解除／登出或 Dart 原生寫入 channel 的裝置端到端流程。新增可重跑裝置腳本及雜湊摘要，原 AVD 未修改；整體驗收仍未完成。

後續 UI 增補：使用者已確認接受邀請成功，並要求六色元件與「與伴侶名稱交往的第 N 天」。[Android 實測與 iOS 程式界線](../../taiwan_brawl_front/docs/couple-widget-appearance.md) 已補；名字從已授權 overview 取得，與快照一起清除，配色為獨立裝置設定。Pixel 7a 目前已更新並觀察選色／名稱／天數。
