# 測速照相模組與跨 Repository 驗收

狀態為功能分支驗收中。功能分支為 `feature/modular-speed-camera-20261119`，既有四個 PR 保持 Draft。

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
| 前端 `be1867b` | `flutter analyze` 與 15 個測試通過，包括跨 Repo 目錄契約、好友 API／頭像解析、推播設定和 Royale 回歸。Web JS、Android Debug APK 及未簽署 iOS Debug 均完成本機建置。Firebase 依賴要求最低 iOS 15。 |
| Web staging 瀏覽器 | Chrome 匿名下載 1,909 筆，snapshot 指定 manifest 版本。攔截資料 API 後重新進入，畫面顯示正在使用已下載的離線資料。 |
| Android Pixel 7a | 獨立 QA App 已安裝，匿名頁顯示 1,909 筆。前景行程切回桌面後停止，背景行程的定位前景服務在切回桌面及螢幕休眠時仍存在，結束行程或強制停止後服務解除。 |
| iOS iPhone 11 | 開發簽署的獨立 QA App 已安裝，本機簽署驗證通過。裝置仍回報簽署、entitlement 或開發者信任檢查失敗，GPS 與語音的實機驗收待完成。 |
| 道路和產品驗收 | 待以審核過的道路綁定和實地路線驗證道路匹配、語音及誤報。登入、好友、聊天、遊戲與推播的完整實機互動回歸待完成。 |

- 合併需功能驗收、各 Repo CI 及人工審查。正式部署另需確認。
