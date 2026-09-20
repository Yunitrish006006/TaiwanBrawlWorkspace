# TaiwanBrawlWorkspace Viewer

這個目錄只放 Flutter Viewer 的呈現層、3D 場景投影與測試，不保存 canonical workspace data。資料模型位於 `lib/model/workspace_data.dart`，3D 座標與投影位於 `lib/model/graph_scene.dart`，畫布互動位於 `lib/widgets/graph_view.dart`。

資料來源固定在 repository root 的 `data/`。執行：

```bash
node scripts/render-flutter-data.mjs
```

會將暫時的 Flutter asset 產生到：

```text
apps/viewer_flutter/assets/workspace-data.json
```

這個檔案是非 Web fallback input，已由 `.gitignore` 排除，不應人工修改或 commit。

Web Viewer 會從 `web/data/workspace-data.json` 在執行時讀取資料；非 Web 平台才使用 asset fallback。資料更新只需重新執行 generator，重新整理 Web 頁面即可，不需要重新編譯 Dart UI。這個分層沿用 TotemWorkspace 的 graph data → scene/layout → viewer 方式。

3D graph 會把 repository 轉成父節點，把系統內部能力轉成子節點。例如 `user_ui_settings` 會展開 Theme Provider、Locale Provider、Font Scale 與 User Preferences；frontend 會展開 Flutter UX、Social & Chat、Royale UI、FCM Client 與 Web Session Client；backend 會展開 API & Sessions、D1、KV、Royale Room、FCM Delivery 與 Integrated Deploy。

本機啟動：

```bash
node scripts/render-flutter-data.mjs
cd apps/viewer_flutter
flutter pub get
flutter run -d chrome
```
