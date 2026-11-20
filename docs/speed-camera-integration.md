# 測速照相模組與跨 Repository 驗收

狀態為功能分支驗收中。功能分支為 `feature/modular-speed-camera-20261119`，既有四個 PR 保持 Draft。

## 2026-11-20 整合候選版

新的獨立分支為 `feature/modular-speed-camera-integration-20261120`。原本的 Draft PR #1 保留。下方 11 月 19 日段落記錄上一版 QA 與 staging 的驗收。

| Repository | 候選提交 | 已驗證的結果 |
| --- | --- | --- |
| `taiwan_brawl_front` | App 實作 `76a8e86`，CI `6dfe6fc` | Flutter 分析無問題。完整測試 416 個通過、4 個略過，含 backend 產生的測速契約。Street Scrap 套件 352 個通過。另以 Chrome 驗 WebRTC 與 IndexedDB，共 7 個通過。 |
| `user_ui_settings` | `0646dd4` | 平台 CI 使用含共用遊戲設定介面的已發布提交，與本機候選版相同。 |
| `taiwan_brawl_back` | `771ac5d` | 234 個 Node、1 個 Worker Vitest、56 個資料庫測試全通過。GitHub 的測速驗證與遊戲資料邊界工作成功。 |
| `user_social_system` | `d3d8e60` | 分析與 2 個測試通過。房間邀請支援 `gameId`，舊格式預設 Mini Royale。 |
| `user_basic_system` | `d27762c` | 舊匯入、帳號與聊天 facade 一致性測試及 GitHub CI 通過。 |

主程式保留新版 `deviceId`、加密 DM 與離線 outbox、好友 API、情侶天數、遊戲庫與四款遊戲。合併帳號、社交與通知的 Git 依賴後，舊 DM facade 解析至同一套件版。iOS 仍沿用原開發分支的最低 iOS 26。推播啟動會確認 Apple Firebase App ID 和指定的 bundle ID，持續保留訊息輪詢與推播點擊的對話。

測速 API 使用獨立 KV。主 Worker 只有在設定 `SPEED_CAMERA_DATA`、`SPEED_CAMERA_SYNC_CRON` 且觸發的 Cron 表達式精確符合時才同步測速目錄。部署時須為測速編排不同於 lifecycle outbox 的 Cron。專用 staging Worker 維持既有排程；本輪未改正式 Cloudflare 維運設定。

本機 Web Release 建置成功。iOS 26 完整建置包含 Widget 擴充及定位背景模式，為未簽署產物。Pixel 7a 使用原 QA 憑證更新並由系統啟動；Android QA APK 保留 Android Widget、定位前景服務與 TTS 查詢。iOS 獨立 QA Release 完成簽署驗證，使用隔離 App ID，未嵌入正式 Widget 或共享 App Group；「黑貓宅急便」安裝的裝置網路通道逾時。情侶天數另通過本機縱向測試，涵蓋隔離 D1、Flutter 服務、快取與 Widget 介面替身。

雙機好友、DM、Royale、推播深連結、iOS APNs、實地 GPS 及精確道路匹配仍需驗收。原工作區未提交的島嶼場景與 WebRTC 內容獨立保留。

## 模組邊界

| Repository | 責任 |
| --- | --- |
| `taiwan_brawl_front` | 免登入入口、主程式導覽、平台權限與 API 設定。持有登入工作階段、好友 API、FCM token 註冊及遊戲邀請。 |
| `taiwan_speed_camera` | 可嵌入的 Flutter 測速頁面、資料快取、GPS 行程、候選點與語音。GPS 與提醒狀態在裝置記憶體中處理。 |
| `taiwan_brawl_back` | NPA 7320 正規化、版本與 Cloudflare KV 發布、唯讀 API。持有 D1、FCM 傳送與訊息輪詢。 |
| `user_account_core` | Profile 型別、服務介面及共用 Profile widget。由 App 注入帳號資料服務。 |
| `user_social_system` | DM 型別、服務介面及 widget、好友 DTO 和服務介面。由 App 注入好友 API 與頭像 URL 解析。 |
| `user_notification_system` | 從推播 payload 或 Web 連結解析對話導覽意圖。 |
| `user_basic_system` | 轉接原有合併匯入、兩個 facade 及原有型別。現有 pub.dev 套件可維持原版本。 |

主程式以完整 Git SHA 鎖定 Dart 套件。官方資料改版與 App 發版各自進行。帳號登入、好友、聊天、遊戲和通知的既有 API 與持久化契約由主程式與後端持有。推播為導覽或喚醒提示，直接訊息仍由後端 pending message API 提供。

## API 與 KV

- `GET /api/speed-cameras/manifest` 回傳 `schemaVersion`、`source`、`sourceUrl`、`generatedAt`、`recordCount`、`version`。
- `GET /api/speed-cameras/snapshot?version=<version>` 回傳所選版本的點位與 `contentSha256`。省略參數時取目前可用版本。兩路皆可免登入。
- 發布前驗證 UTF-8、大小、欄位、點位、去重率及筆數落差。內容不變會跳過寫入。同一個 KV 值保存目前版與前一個驗證版本。讀取時重算 SHA-256，並在目前版驗證失敗時嘗試前版。舊格式仍可用於遷移。
- KV 最終一致性可能令指定版本暫時回傳 404。空白或不可用的目錄回傳 503。Flutter 保留已驗證的離線快取。
- 單一寫入者以專用 staging Worker／KV 運行。正式 API 的 KV binding 和 Cron 需在正式部署確認後另行設定。
- 官方來源為[警政署資料集 7320](https://data.gov.tw/dataset/7320)，政府資料開放授權條款第 1 版。KV 一致性說明見 [Cloudflare Workers KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/)。

## 行車提醒與平台

Android 及 iOS 都以使用者從可見畫面啟動本次行程為前提。使用者可在開始前開啟鎖屏定位。Android 使用定位類型的前景服務，iOS 使用 When In Use 權限及背景模式的 `location`。結束、離開頁面或定位中斷會取消訂閱與語音。Web 需安全來源，提供前景候選提示。

候選篩選結合定位誤差、速度、航向、接近趨勢及保守解析過的官方方向。模糊方向仍可顯示候選點，語音只對符合方向及接近條件的候選點播報。時間與鄰近位置條件會抑制重複提醒。

道路匹配器已有輸入契約及合成測試。接入正式道路匹配前，需要版本化、有方向及分層的路段資料，以及審核過的測速點與路段綁定。國土測繪中心道路中線涵蓋國道、省道及快速道路，仍需核對方向、覆蓋率及高架等級，並為平行道路、對向車道、匝道及上下層道路建立驗收樣本。主程式目前顯示候選結果。參考[國土測繪中心道路中線](https://data.gov.tw/dataset/73232)與[交通資訊基礎路段編碼](https://tdx.transportdata.tw/news/detail/7657da4e-31b1-4b86-a42e-77dc23565eff)。

## 驗收紀錄

| 驗收項目 | 2026-11-19 證據 |
| --- | --- |
| 後端 `3804d61` | 129 個 Node 測試通過，Draft PR 驗證與官方資料 artifact CI 通過。 |
| Cloudflare staging | Cron 於台灣時間 22:45 發布 1,909 筆有效點，排除 1 筆。匿名 API 取得相同版本及快照，版本為 `7e9c1887256d34e0c058c44cea433143c25de685f5ece895b6ae156979b45dc4`。staging Cron 現為每天 10:17 台灣時間。 |
| KV 回復 | 在隔離 staging Worker 與 KV 注入目前版 SHA-256 不符，確認 manifest 與指定版本下載皆回退至前一個驗證快照，並重算點位雜湊。原 staging 目錄已重新讀取並核對。 |
| Flutter 測速套件 | `4dc7dac` 的 12 個測試與套件 CI 通過，涵蓋 Android/iOS 模擬定位生命週期和 TTS 呼叫、離線快取、方向、附近重複點及合成道路匹配。主程式鎖定的實作 SHA 為 `1e10a09`，其後的 `4dc7dac` 只改測試。 |
| 模組相容 | 帳號、社交、通知與 `user_basic_system` 的套件測試通過。合併匯入與舊 facade 指向同一組型別。 |
| 前端 `be1867b` | `flutter analyze` 與 15 個測試通過，包括跨 Repo 目錄契約、好友 API／頭像解析、推播設定和 Royale 回歸。Web JS、Android Debug APK 及未簽署 iOS Debug 均完成本機建置。Firebase 依賴要求最低 iOS 15。[前端 CI](https://github.com/Yunitrish006006/taiwan_brawl_front/actions/runs/44547225070) 的跨 Repo、Android 和 iOS 工作皆通過。 |
| Web staging 瀏覽器 | Chrome 匿名下載 1,909 筆，snapshot 指定 manifest 版本。攔截資料 API 後重新進入，畫面顯示正在使用已下載的離線資料。 |
| Android Pixel 7a | 獨立 QA App 已安裝，匿名頁顯示 1,909 筆。前景行程切回桌面後停止，背景行程的定位前景服務在切回桌面及螢幕休眠時仍存在，結束行程或強制停止後服務解除。最後以模擬軌跡觸發原生語音，使用者確認實機播出一次繁中提醒。 |
| iOS iPhone 11 | 使用者信任本機開發簽署後，確認匿名讀取 1,909 筆、使用 App 期間定位，以及鎖定約 10 秒前後均顯示行車模式執行中。使用者結束行程，另以模擬軌跡在實機確認播出一次繁中語音。鎖屏期間的 GPS 樣點未獨立記錄。 |
| Workspace | 369 項結構檢查、26 個 Node 測試、Viewer 分析與 Web build 通過。Viewer CI 以 Flutter 3.44.0 執行。 |
| 道路和產品驗收 | 待以審核過的道路綁定和實地路線驗證道路匹配、鎖屏語音及誤報。登入、好友、聊天、遊戲與推播的完整實機互動回歸待完成。 |

## 第 3 項回歸與審查

- 優先完成帳號、好友、聊天、遊戲及推播回歸。道路匹配與實際行車中的鎖屏語音延後驗收。
- 前端 `93a1617` 修正啟動時登入同步清除推播點擊目標的問題。訊息輪詢仍儲存並確認其他訊息，使用者點擊的對話在消費前保有優先權。分析與 18 個本機測試通過。
- 後端 `3804d61` 重新執行 129 個測試並全部通過。兩個本機測試身分走過 25 次 API 請求，涵蓋 Cookie／Bearer、好友邀請與接受、DM 投遞與確認、FCM 註冊及發送內容、Royale 建房／加入／準備／狀態，以及登出。使用實際 API 處理器、SQLite 和本機房間物件，Google 與 FCM 的外部呼叫由測試替身回應。
- 已確認兩個測試帳號可用。使用者同意以既有正式 API 僅測這兩個帳號，實機驗收與人工核准仍在進行。

- iPhone 11 的實機崩潰記錄顯示 FirebaseCore 初始化中止。正式 API 回傳 Android Firebase App ID，Apple SDK 拒絕此格式。前端 `b0c14f7` 檢查 Apple App ID 與指定 bundle ID 後才初始化推播，登入及訊息輪詢可在推播設定不符時繼續。20 個本機測試與靜態分析通過。修正版裝到 iPhone 11 後，使用者以原測試帳號重新登入，確認進入首頁且未閃退。
- 後端 `179c8ea` 新增選填 `fcm.iosAppId`，保留既有共享欄位。正式部署或修改 Firebase/APNs 設定仍需另行確認。iPhone 的 QA 簽署沒有 APNs entitlement，這次的登入修正不代表 iOS 推播已驗收。
- Pixel 7a 的 Google Credential Manager 回傳 `UNREGISTERED_ON_API_CONSOLE`，已在 Web OAuth client 所屬的 TaiwanBrawl Google Cloud 專案建立獨立 Android QA OAuth client，綁定 QA App 的套件名稱與簽署指紋。Pixel 7a 使用另一個測試帳號重試後成功進入首頁。
- 後續改用 iPhone 15 Pro Max。已安裝並啟動相同的 `b0c14f7` QA 版，登入及雙機互動回歸待確認。

- 合併需功能驗收、各 Repo CI 及人工審查。正式部署另需確認。
