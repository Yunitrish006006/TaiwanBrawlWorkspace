# Taiwan Brawl 全域遊戲 UI 設定契約

## 目的

鬼島亂鬥的主 App 是使用者設定的唯一來源。所有被主 App 開啟的遊戲與聊天／社交 UI，都必須能接收目前的主設定；功能不得自行建立另一份語言、主題或亮暗模式狀態。

## Host-owned settings

目前契約欄位如下：

| 欄位 | 意義 | 遊戲應用方式 |
| --- | --- | --- |
| `locale` | 目前語言，例如 `zh-Hant`、`en` | Host 只提供目前語言；遊戲用自己的 owner-repo 翻譯表解析玩家可見文案 |
| `themeId` | 主 App 選擇的主題 | 不可自行選另一套全域主題；遊戲專用場景色可保留，但文字、Surface、Controls 應能辨識目前模式 |
| `themeMode` | `light`、`dark`、`system` | Material UI 使用 host active theme；不可固定暗色或固定亮色覆蓋 host |
| `fontScale` | 主 App 的字體縮放，範圍由 shared provider 管理 | 遊戲內玩家可見文字必須接受縮放；固定棋盤格或遊戲座標可固定，但不得讓 UI 因字體放大直接消失 |
| `disableAnimations` | 系統／可及性減少動畫設定 | 動畫、轉場、計時效果需縮短、停用或提供等價靜態狀態 |
| `accessibleNavigation` | 系統可及性導航設定 | 不得只依賴手勢或時間操作；需要時提供直接操作或輔助流程 |

## Interface boundary

Shared settings code lives in the `user_ui_settings` owner package. The host adapts its `ThemeProvider`, `LocaleProvider`, `UiSettingsProvider`, and `MediaQuery` values into the shared game-settings interface/scope. The `locale` field crosses the boundary; game translation tables do not.

Each game package must expose a host-facing entry point that can receive that interface. It may use an inherited scope for normal bundled navigation, but standalone previews/tests must be able to inject a deterministic settings object.

## Translation ownership

- `taiwan_brawl_front/assets/i18n/` owns host App, chat, and shared social UI strings only.
- Each game owner repository owns its own translation tables and localization resolver. The host passes the active locale into the game; it does not own the game's wording.
- Game content data may remain locale-neutral. Player-facing names, descriptions, prompts, buttons, status labels, and game-specific errors must be resolved by the game package.
- A game may use host translation infrastructure as an implementation adapter only if the translation source remains owned and reviewed with the game package. Do not add game-specific keys to the host catalog as the default design.

## Current games

目前可驗證的實作狀態：

- Archery：已由 package 內的翻譯表解析 host 傳入的 locale，並使用 host 的 Theme、MediaQuery 與設定 scope；控制區主要色彩跟隨 host `ColorScheme`，場景元素保留玩法色。
- Minesweeper：已由 package 內的翻譯表解析 host 傳入的 locale；`MinesweeperHome` 可接收明確的 `GameUiSettings`，主 UI 的背景、文字、按鈕與選取狀態跟隨 host `ColorScheme`，棋盤格保留遊戲辨識色。
- Street Scrap：已具備 package-owned localization scope；獨立 preview/test 沒有 host scope 時保留 fallback。
- Mini Royale：deck、lobby、arena 與動畫快取設定已由 package-owned localization resolver 解析 host locale；lobby、deck 與 arena 外殼使用 host `ColorScheme`，戰場、陣營與卡牌類型色保留遊戲專用色；host adapter 只負責轉送 locale 與變更通知。

- Archery: must receive the host locale and resolve game copy from the Archery package owner repository; inherited Material theme remains host-provided.
- Mini Royale: its localization resolver, localization port, and localized card/hero content remain package-owned; the host supplies only the active locale and shared UI settings.
- Street Scrap: its package-owned localization scope remains the reference implementation; keep game-only text scale separate from host font scale.
- Minesweeper: must not create a hosted nested `MaterialApp`; its `MinesweeperHome` entry point must consume the host settings scope or an explicit injected settings object, and its game copy must move to the Minesweeper owner repository.

## Chat and social UI

Chat is not a game package, so its strings belong to `taiwan_brawl_front/assets/i18n/`. `DmPage` must read the host `GameUiSettingsScope` for host translations and pass the resulting strings into the editable DM surface. Chat widgets may keep a provider fallback for standalone tests, but bundled navigation must not introduce a second locale or theme source. Chat message bubbles and dialogs must use the inherited `Theme.of(context)` and host `MediaQuery` text scale.

## Change checklist for future AI work

Before modifying a game:

1. Read this contract and the owner repository's current settings adapter.
2. Identify whether the change affects locale, theme, brightness mode, font scale, motion, or accessibility.
3. Preserve the host as the single source of truth.
4. Add or update a focused consumer test.
5. Report the owner repository, changed interface, validation result, and any setting intentionally not applicable.
