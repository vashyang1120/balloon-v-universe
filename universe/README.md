# universe/ — 前三款遊戲換殼工程

universe-game-migration-v0.1.0-foundation-test-1

「換殼」＝保留遊戲本身，替換舊玩家及共用資料系統。正式遊戲 Repository（vparty-tetris、vparty-rhythm-game、vparty-quiz-game）
在換殼版驗收、使用者決定切換入口之前**一律不修改**。

| 資料夾 | 內容 |
|---|---|
| [`shared/`](shared/README.md) | Universe SDK：身份交接、玩家上下文、API Client、錯誤分類、資料契約、Mock／NOT_IMPLEMENTED Adapter |
| [`tetris/`](tetris/README.md) | 方塊派對可玩換殼原型（test-1） |
| [`docs/GAME-INVENTORY.md`](docs/GAME-INVENTORY.md) | 三款遊戲 28 項盤點、V幣來源、場次欄位 |
| [`docs/LEGACY-FUNCTION-MAP.md`](docs/LEGACY-FUNCTION-MAP.md) | 舊系統功能對照表（154 個玩家系統函式：檔案、行、讀寫、換殼方式） |
| [`docs/LEGACY-FIREBASE-PATHS.md`](docs/LEGACY-FIREBASE-PATHS.md) | 舊 Firebase 路徑與本機鍵對照、舊系統安全問題 |
| [`docs/DATA-CONTRACTS.md`](docs/DATA-CONTRACTS.md) | 信任層次、V幣、ScoreSubmission、排行榜、問答年級榜、紀錄與匯出 |
| [`docs/MIGRATION-PLAN.md`](docs/MIGRATION-PLAN.md) | 三款「換殼修改位置清單」、部署驗收步驟、已知風險 |
| `tools/inventory/` | 盤點工具（重新產生對照表） |

## 測試（repository 根目錄）

```
node --test universe/shared/tests/universe-sdk.test.mjs universe/tetris/tests/tetris-core-integrity.test.mjs
node --test tests/lobby-avatar-consistency.test.mjs
```
瀏覽器測試需要 Playwright 與正式遊戲的唯讀 clone，見 `tetris/README.md`。

## 不做的事

- 不讀寫舊 Firebase（vparty-rhythm-game）、不遷移舊玩家資料。
- 不發放正式 V幣、不寫入正式排行榜（後端 API 尚未完成）。
- 不修改大廳 v0.3.4、後端 Worker、Firebase Rules、Secrets。
- 大廳正式遊戲入口不指向原型。
