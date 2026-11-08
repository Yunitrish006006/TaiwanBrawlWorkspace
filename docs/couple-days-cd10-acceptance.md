# 情侶天數：CD-10 本機整合驗收

目前結論：本機跨前後端 HTTP／D1 整合通過；整個功能仍待平台與正式環境驗收。

## 本輪完成

新增 `scripts/verify-couple-days-local.mjs`。每次建立新的暫存目錄，以隔離
rehearsal 設定執行三庫的實際 D1 migrations，建立合成帳號及 session，啟動僅
監聽 127.0.0.1 的 Worker，再執行 Flutter VM 服務整合測試。CLI 一律使用
`--local`，正式設定與開關未變更。一次性識別碼核對測試 Worker，避免端口被
其他程序占用時誤測其他服務；識別路由僅存在暫存 wrapper，未加入產品 API。
結束後關閉本次建立的 Worker 程序群組，保留暫存證據供查核。

已實際通過的整合流程：

1. A 邀請 B，接受前雙方都沒有 active relationship。
2. B 以另一所在地時區接受，A／B overview 的起始日一致。
3. 第三方只能取得自己的空關係，不能解除 A／B 關係；憑證身分與選取帳號不符回 409。
4. A 提日期時原起始日不變，B 同意後版本與日期更新。
5. A 清除元件 adapter 狀態，呼叫登出 API 後舊 session 回 401；再用另一個合成 session 重登入。
6. 關閉並重開實際 Hive 快取，還原最後確認日期；以日期推進模擬 31 天離線，仍可計數。
7. A 解除後 A／B overview 皆無關係，adapter 清除日期與天數來源。

後續補強：[App 離線唯讀天數](../../taiwan_brawl_front/docs/couple-offline-cold-start.md)
已加入登入頁，不恢復帳號或好友資料。HTTP harness 另涵蓋投影→唯讀服務，登入
開始、登出與 401 會關閉入口；Android 已在隔離模擬器觀察冷啟動與原生 readCounter；真機與原生寫入 channel 仍待驗收。

這項測試使用真實本機 Worker／D1、HTTP、Flutter typed remote/service 與暫存
Hive。元件 bridge 為 Dart 測試替身；它沒有執行手機原生 channel、桌面 UI、
Google OAuth 或正式環境資料。31 天是日曆推進模擬，不是等待 31 天的裝置實測。

認證整合另修正一個已重現的問題：登出請求延遲完成時，可能清除其後新登入的
憑證。AuthService 現在依序處理認證 session 的讀取／登入／登出請求，UI 仍
立即進入已登出狀態；一般身分刷新不能取消排隊中的登入。HTTP 測試涵蓋舊
登出回 200／401，以及新登入同時排入身分刷新，確認新憑證與使用者皆保留。
這是認證服務的請求順序保護，不代表所有其他模組的任意並行請求均已驗收。

## 證據分層

| 項目 | 結果與範圍 |
|---|---|
| 本機 HTTP／D1 → Flutter service | 1 條完整整合測試通過，使用合成帳號、真實三庫 migrations 與 Hive |
| 前端 VM 回歸 | 381 項通過、4 項略過；本機 HTTP 測試預設略過，由上述腳本另行執行通過 |
| 前端程式分析 | 通過 |
| Chrome 離線計數／認證／導航 | 14 項通過、1 項 native-only 略過；不等於 iPhone native |
| 後端回歸 | Node 206、Vitest 1、workerd D1 55 項通過 |
| 資料保存演練 | 原 migration 與三庫 split rehearsal 通過；正式資料尚未搬移 |
| iOS 共享儲存核心 | 30 項 Foundation 檢查通過，含實際暫存檔讀寫；App Group 權限未驗收 |
| iOS 專案 preflight | 6 項通過；不等於 Xcode 編譯或簽章 |
| Android 原生狀態與計數 | 8 項 JVM 測試通過，含最小唯讀投影與清除狀態 |
| Android debug APK | 本輪修正後重新編譯成功；使用依官方 SHA-256 核對的暫存 JDK 17，未變更全域 Java 設定 |
| Android 裝置外觀／桌面操作 | 隔離 API 35 模擬器部分通過：正式元件、多實例、四種狀態、深淺色／兩倍字級、離線冷啟動／唯讀橋接、重啟及時區；使用合成快照，真機與完整流程待驗收 |
| iOS 原生建置／WidgetKit／簽章 | 待驗收；目前 xcodebuild 仍只有 Command Line Tools |
| 正式環境與版本發布 | 本輪未執行部署、正式資料搬移、Apple 註冊／簽章或 Git 提交／推送 |

## 重現本機整合

從 coordination repository 執行，Flutter 須在 PATH；也可用 `FLUTTER_BIN`
指定已安裝的 SDK binary：

```sh
node scripts/verify-couple-days-local.mjs
```

腳本會列出暫存 evidence 目錄，其中 `result.json` 記錄測試層級與未驗證範圍，
`flutter-local-http.log` 保存服務整合結果，其餘檔案保存 migrations、seed 與
Worker 輸出。session 與帳號都是本機合成資料。暫存目錄可能由系統清理，
不作為正式長期驗收封存；可重新執行腳本產生新證據。

## 完成交付前仍須處理

| 待辦 | 通過條件 |
|---|---|
| App 離線冷啟動 | 已補本機唯讀天數，不選取帳號快取、不恢復登入；實際手機冷啟動／清除流程併入兩平台裝置驗收 |
| Android 平台驗收 | 基本模擬器桌面流程已部分觀察；補移除／調整尺寸、多語系、省電、午夜排程實際觸發、原生寫入與真實登入／換帳號；另做真機驗收 |
| iOS 原生建置 | 在 Xcode 以 Runner + extension 進行實際編譯；確認 plugin scene selector、embedding、WidgetKit 型別與 runtime 行為 |
| iOS 能力與簽章 | 確認兩個 target 的 App Group、有效 team 與 provisioning；開關預設關閉仍不會移除 extension 的簽章需求 |
| iPhone 平台驗收 | 真機完成與 Android 同範圍流程，另含 timeline 更新預算與首次解鎖後儲存可用性 |
| 正式整合 | 另行取得部署授權後，完成資料搬移／開關切換及真實兩帳號流程；既有計劃不含自行部署授權 |

以上待辦完成前，CD-10 與整體情侶天數功能均維持「驗收未完成」。

Android 平台詳細證據與可重跑腳本見 [隔離模擬器驗收](../../taiwan_brawl_front/docs/couple-widget-android-emulator-acceptance.md)。原 Pixel_10a 的黑畫面紀錄仍成立；這次另建全新 API 35 暫存 AVD，未清除原資料。

兩帳號真機測試的 [最新本機 Web／Android 共用服務](couple-days-local-preview.md) 已準備：Web release 與配套手機 APK 已編譯，Pixel 7a 更新及 adb reverse 已完成，三庫／HTTP smoke 通過。先前 Google origin_mismatch 後，使用者已進入邀請驗收；瀏覽器接受時的 REQUEST_ORIGIN_DENIED 已定位為本機代理 Host 改寫並修正，原登入與待接受邀請保留。三項代理 HTTP 回歸通過；完整實際綁定仍待重試確認。正式站未更新。

2026-11-09 使用者確認瀏覽器接受成功；Pixel 7a 已觀察到真實關係天數。後續 [元件配色與名稱](../../taiwan_brawl_front/docs/couple-widget-appearance.md) 已實作並更新手機：實際選色保存、原生 active 快照寫入名稱、桌面繁中名稱／天數與午夜配色均已觀察。這補足該條本機兩帳號綁定至 Android 顯示的證據，不代表解除／換帳號／省電／iPhone 等全矩陣均完成。
