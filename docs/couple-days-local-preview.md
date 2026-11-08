# 情侶天數：瀏覽器與 Android 共用測試服務

狀態：最新 Web release 已編譯，本機三庫 migrations、HTTP smoke checks 與
配套 Android debug APK 編譯／Pixel 7a 更新安裝通過。已進入雙帳號邀請驗收，
瀏覽器接受邀請的代理來源問題已修正；完整兩帳號綁定仍待使用者實際重試確認。
正式站與正式資料庫未修改。

## 本機啟動

前端以同一 API 位址編譯網頁與手機版；手機不是先前連正式站的 APK：

```sh
# taiwan_brawl_front；Android 建置使用相容的 JDK 17
flutter build web --release --dart-define=API_BASE_URL=http://localhost:8080 --output=/tmp/couple-preview-web
node tool/prepare_offline_shell.mjs /tmp/couple-preview-web
flutter build apk --debug --dart-define=API_BASE_URL=http://localhost:8080

# coordination repository
node scripts/serve-couple-days-preview.mjs --web-build /tmp/couple-preview-web
```

啟動腳本只監聽 loopback：8080 提供 Web 並轉接 API 到 8795。每次建立新的
暫存設定／三個本機 D1，不讀取正式 wrangler bindings，也不載入 backend
目錄的 `.dev.vars`。沒有合成 session 或登入繞過；Google token 仍由正式驗證
邏輯驗簽、檢查 audience，再建立此測試庫自己的使用者及 session。

在這台 Mac 用無痕視窗開 `http://localhost:8080/`。
`http://localhost:8080/preview-status.json` 應顯示 isolated-local-preview、
couplesEnabled true、productionData false。這不是公開網址，也不是更新正式站。
服務需保持執行；預設重新啟動會建立另一組全新測試資料庫，原正式帳號的好友不會搬入。
修正代理等需保留資料的重啟，先關閉本次服務，再於原命令加上
`--resume <原本輸出的 Local state 目錄>`。此選項只接受原先建立的隔離設定，
保留原資料與 session，不重新套用 migrations，也不連正式資料庫。

## Google OAuth 前置設定

使用 AppConfiguration 的 Web OAuth client。Google Cloud 的 Google Auth
Platform → Clients → 對應的 Web client → Authorized JavaScript origins，須
允許 `http://localhost` 與 `http://localhost:8080`；若錯誤為 origin_mismatch，
需核對完整 scheme／host／port。[Google 官方設定說明](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

access_denied 不必然是來源問題；依完整錯誤說明確認應用程式測試使用者名單、
帳號／組織政策或使用者拒絕等原因。此輪已依使用者提供的錯誤文字確認為 400 origin_mismatch，
需補 localhost 來源。未宣稱已修正 Cloud Console 設定，也未由程式放寬驗證。
此為先前登入階段的錯誤紀錄；後續使用者已能進入邀請／接受頁面。

## Pixel 7a 連線

對已配對的手機 serial 執行，更新安裝會保留 App 資料：

```sh
adb -s <phone-serial> reverse tcp:8080 tcp:8080
adb -s <phone-serial> install -r build/app/outputs/flutter-apk/app-debug.apk
```

Android debug manifest 加入僅允許 localhost／127.0.0.1 明文連線的 network
security config，其他來源仍禁止明文；release 不引用這份 debug resource。
adb 斷線／手機重啟後需重新確認 reverse。手機與瀏覽器各登入一個帳號後，在
這個新測試庫互加好友，再走情侶邀請及同意流程。舊正式 session 不適用此庫。

## 已驗證與待驗證

2026-11-09 本機 HTTP 查核：狀態指出隔離與開啟情侶 API；未登入 overview
回 401；偽造 Google token 回 401；提供的 main.dart.js SHA-256 與剛編譯檔
一致；不接受非 loopback Host。這些不代表 Google 實際登入已通過。

桌面元件先前模擬器證據另見 [平台驗收表](couple-days-cd10-acceptance.md)。
本輪手機僅完成配套 APK 更新與 reverse，登入／好友／綁定／原生快照寫入及
桌面更新仍需實際完成後才可標示真機端到端通過。

## 瀏覽器接受邀請的修正

使用者回報瀏覽器接受邀請反覆失敗。已用現有本機 session 對一個不存在的
邀請發送診斷請求：修正前回 403 REQUEST_ORIGIN_DENIED。原因是代理把 Host
改為內部 Worker 位址，而瀏覽器 Origin 仍為 localhost:8080，導致嚴格同來源
檢查拒絕。手機的 Bearer 請求不帶 Origin，先前不會觸發這個特定問題。

代理現在只以內部位址建立 socket，保留已經 loopback Host allowlist 檢查的
原 Host 與 Origin，不改寫 Origin，也不放寬後端。三項實際 HTTP socket 回歸
涵蓋合法瀏覽器 Cookie／JSON、外來 Origin 拒絕、手機 Bearer 保留。
以原測試資料恢復服務後，同一診斷請求回 404 NOT_FOUND，確認已通過來源檢查；
原登入仍有效，原邀請仍為 pending，沒有替使用者接受或修改實際關係。
真實接受後顯示天數仍待使用者重試確認。
