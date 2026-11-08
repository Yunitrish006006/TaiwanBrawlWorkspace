# Apps

這裡只放 TaiwanBrawlWorkspace 的呈現/操作介面，不保存 canonical workspace knowledge。

- `viewer_flutter/`：Flutter architecture viewer。
- `layout_studio/`：本機拖拉式 UI 佈局工作台，分草圖與視覺細化兩階段。
- `chat_crypto_spike/`：隔離的瀏覽器 E2EE 引擎可行性小樣，不連正式 App、帳號或 relay。

App 所需的資料應由 root `data/` 經 generator 產生，不得在 app 目錄維護第二份 source of truth。
