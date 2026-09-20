# TaiwanBrawlWorkspace Viewer

這個目錄只放 Flutter Viewer 的 UI / test / platform 結構，不保存 canonical workspace data。

資料來源固定在 repository root 的 `data/`。執行：

```bash
node scripts/render-flutter-data.mjs
```

會將暫時的 Flutter asset 產生到：

```text
apps/viewer_flutter/assets/workspace-data.json
```

這個檔案是 build input，已由 `.gitignore` 排除，不應人工修改或 commit。

本機啟動：

```bash
node scripts/render-flutter-data.mjs
cd apps/viewer_flutter
flutter pub get
flutter run -d chrome
```
