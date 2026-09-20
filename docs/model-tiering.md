# Model tiering

Taiwan Brawl 的開發任務先用本機規則選擇工具或模型；分類本身不呼叫 LLM。Canonical policy 位於 `data/model-policy.json`，CLI、orchestration 與 JSON-lines adapter 共用同一份資料。

## 預設分級

| Tier | Model / effort | 使用情境 | 單次逾時 |
| --- | --- | --- | --- |
| `tools` | 無模型 | 明確支援的摘要、workspace validation、viewer data generation | 2 分鐘 |
| `economy` | `gpt-5.6-luna` / low | 文件、文案、定位、摘要、機械式修改 | 5 分鐘 |
| `standard` | `gpt-5.6-terra` / medium | 一般修正、功能開發、尚未釐清的工作 | 15 分鐘 |
| `deep` | `gpt-5.6-sol` / high | 協定、登入權限、schema、跨 repo 行為變更、競態與架構分析 | 20 分鐘 |
| `expert` | `gpt-6-astra` / high | 明確指定並附理由，或有失敗證據的逐級升級 | 30 分鐘 |

模型 ID 與 effort 於 2026-09-20 對照本機 Codex CLI 0.154.0、模型目錄與 [OpenAI 官方模型文件](https://learn.chatgpt.com/docs/models)。這是專案的成本控制預設，並非價格表；可用性與實際額度依帳號而定。修改模型時只改 canonical policy，並重新驗證。

分類是保守的關鍵字規則，不是完整語意判斷。敏感行為修改優先於機械式工作；文件只提到 auth 不會自動升級。相關 contract 同時列出前後端，不代表任務必須使用較大模型。未知範圍使用 standard，並標示 `scopeNeedsInspection`，需先找出實際 owner。

## 使用方式

以下指令從 coordination repository 根目錄執行：

### 專案預設使用 Luna / low

`model-defaults` 從 canonical policy 的 `economy` tier 產生專案 `.codex/config.toml`。預覽不寫入設定、不呼叫模型：

```bash
# 預覽 coordination repository 與外層工作區的設定
npm run model-defaults -- . ..
# 安裝；之後在這兩個目錄啟動的新工作階段預設使用 economy 模型
npm run model-defaults -- --write . ..
```

這只設定 `model` 與 `model_reasoning_effort`，不修改全域設定或權限。既有自訂設定與符號連結會保留並回報衝突；重跑可更新本工具產生的設定。從 frontend/backend repository 直接啟動 Codex 時，可明確加上對應目錄，例如 `npm run model-defaults -- --write ../taiwan_brawl_front ../taiwan_brawl_back`，因為各 Git repository 有自己的專案設定邊界。

專案必須受信任，Codex 才會載入設定。CLI 顯式模型參數、客戶端明確選定的模型和既有聊天可能保留自己的選擇；這不是在對話中途自動切換模型。若 App 仍顯示 Astra，請在模型選擇器選 Luna / low；CLI 可用 `/model` 選擇並用 `/status` 確認。設定優先序見 [OpenAI Config basics](https://learn.chatgpt.com/docs/config-file/config-basic)。

### 每個新任務自動選模型

```bash
# 自動分類並立即執行；文件用 Luna，日常修改用 Terra，複雜修改用 Sol
npm run task:auto -- "修正 Royale 按鈕顏色" --cwd ../taiwan_brawl_front
# 精確工具任務直接執行本機工具
npm run task:auto -- "工作區摘要"
```

`task:auto` 是既有 runner 的 `--execute` 捷徑，啟動時顯示選定模型；每個新任務重新分類，任務執行途中不自動重試或切換。runner 顯式傳入的模型會覆蓋專案的 economy 預設。請從終端機啟動，不要要求執行中的 agent 為同一任務再啟動一次。

### 預覽、手動分級與原始入口

```bash
# 只看模型建議，不消耗模型額度
npm run model-plan -- "更新 README 文件"
node scripts/taiwan-brawl-intelligence.mjs orchestrate "修改 Royale 房間 websocket"

# 預覽完整啟動參數；預設不啟動模型
npm run task -- "修正 Royale 按鈕顏色" --cwd ../taiwan_brawl_front

# 實際啟動一次 Codex，使用計畫中的模型與 effort
npm run task -- "修正 Royale 按鈕顏色" --cwd ../taiwan_brawl_front --execute

# 精確支援的工具任務完全不啟動模型
npm run task -- "工作區摘要" --execute
npm run task -- "驗證工作區" --execute
npm run task -- "產生 viewer 資料" --execute
```

`--cwd` 指定模型工作的 repository，預設為 coordination repository。工具任務固定在 coordination repository 執行。runner 不會自動擴大可寫目錄；跨 repo 修改可以明確附上額外 owner 的目錄：

```bash
npm run task -- "修改前後端 Royale websocket 協定" \
  --cwd ../taiwan_brawl_back --add-dir ../taiwan_brawl_front --execute
```

`--add-dir` 可以重複使用；路徑和 `--cwd` 一樣，相對於啟動 runner 時的目錄。

`--execute` 是 CLI 的執行開關，沒有額外互動確認。它以 `workspace-write` sandbox 啟動 Codex；不能在此非互動程序中取得額外權限。模型參數與設定覆寫方式依據 [CLI reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli) 及 [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)。

**既有聊天不會因為讀到 policy 就自動切換模型。** `model-plan` / `orchestrate` / adapter 都只產生計畫。runner 才會將 `--model`、`model_reasoning_effort` 實際傳給新的 Codex 程序；既有聊天可用客戶端的模型選擇器套用建議。不要在執行中的 agent 裡為同一任務再啟動 runner，以免重複消耗。

## 控制無效使用

- 每次執行最多啟動一個模型程序；同一 workspace 的 runner 共用排他鎖，不允許平行執行或巢狀 runner。
- 關閉 Codex multi-agent 功能；不自動派出第二個模型做分類或審查。
- runner 不重試、不自動換模型。Codex/provider 自身的傳輸重試仍由其設定管理。
- 每次執行有程序逾時，超時會停止程序群組；任務最多 6,000 字元，handoff 與失敗證據各最多 3,000 字元。
- 只傳入任務、owner/contract、驗證候選與必要 handoff，不附完整歷史、程式庫或舊對話。
- 文件或唯讀查找不排入前後端完整測試。程式與 contract 修改保留實際 owner/consumer 的驗證；不能用低 tier 當作跳過必要測試的理由。
- 已通過的驗證只在輸入改變、出現新失敗或仍有未解疑點時重跑。

逾時、並行數與文字大小由 runner 控制；token 用量只能在 Codex 回報後記錄，**沒有宣稱硬性 token/金額上限，也不宣稱已證實節省比例**。

## 升級與交接

手動改 tier 必須附理由：

```bash
npm run model-plan -- "分析跨系統一致性" --tier expert --reason "已有可重現的多系統狀態衝突"
```

至少兩次有證據的推理或驗證失敗，可以從自動建議 tier 升一級：

```bash
npm run model-plan -- "修正排序 bug" \
  --failed-attempts 2 --failure-kind validation \
  --evidence "兩種修正後，同一 regression assertion 仍失敗"
```

這些是呼叫者提供的失敗證據，不是 runner 自動認證的測試結果。升級由下一次明確呼叫套用，不會在失敗後循環重跑。使用 `--handoff` 傳遞已改檔案、錯誤摘要與驗證結果；不要重送完整對話。不要同時使用 tier override 與逐級升級。

`network`、`authentication`、`quota`、`model-unavailable`、`environment` 失敗會產生 `blocked: true`，runner 拒絕再次啟動模型；需先處理外部原因。單次回傳失敗同樣不會觸發任何 runner 重試。

## 紀錄與驗證

執行紀錄保存在忽略版控的 `.taiwan-brawl-index/usage.jsonl`：task hash、tier、模型、effort、耗時、程序狀態，以及有回報時的 input/cached/output tokens。cached input 是 input 的子集合，不能再加一次。沒有回報的用量記為 `null`。不保存完整 prompt、原始 provider 錯誤或輸出內容。

`process-completed` 只代表工具程序成功，或 Codex 正常退出且回報 completed turn；不代表模型所做修改已經通過測試。測試結果仍需查核實際輸出。

若 runner 被不可捕捉的訊號中止，可能留下 `.taiwan-brawl-index/run.lock`。先查看檔內 PID，確認原程序及其子程序都已停止，才移除殘留鎖；系統不會自動搶走鎖。

```bash
npm test
node scripts/validate-workspace.mjs
node scripts/render-flutter-data.mjs
```

測試使用本機假 Codex 程序，涵蓋模型選擇、升級條件、CLI/adapter 一致性、literal prompt、單次失敗、用量、鎖與逾時，不會產生付費模型呼叫。
