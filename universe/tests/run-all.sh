#!/usr/bin/env bash
# 遊戲宇宙 v0.2.0 全部回歸測試
# 用法（repository 根目錄）：bash universe/tests/run-all.sh <vparty-tetris clone> <vparty-rhythm-game clone> <vparty-quiz-game clone> [輸出資料夾]
# 需要：Node 20+、Playwright + Chromium（NODE_PATH 指到全域套件）
set -euo pipefail
T="$1"; R="$2"; Q="$3"; OUT="${4:-/tmp/bv-universe-e2e}"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
echo "== 1. 單元測試：Universe SDK、三款核心完整性、大廳頭像一致性 =="
node --test universe/shared/tests/universe-sdk.test.mjs universe/tetris/tests/tetris-core-integrity.test.mjs \
  universe/rhythm/tests/rhythm-core-integrity.test.mjs universe/quiz/tests/quiz-core-integrity.test.mjs tests/lobby-avatar-consistency.test.mjs
echo "== 2. 後端 Worker 測試 =="
(cd backend/worker && node --test "tests/*.test.js")
echo "== 3. 宇宙版產生腳本可重現（重新產生後與 Repository 內檔案相同） =="
TMP=$(mktemp -d)
PYTHONDONTWRITEBYTECODE=1 python3 -I universe/tetris/tools/build_prototype.py "$T/index.html" "$TMP/tetris.html" >/dev/null
PYTHONDONTWRITEBYTECODE=1 python3 -I universe/rhythm/tools/build_prototype.py "$R/index.html" "$TMP/rhythm.html" >/dev/null
mkdir -p "$TMP/quiz"; PYTHONDONTWRITEBYTECODE=1 python3 -I universe/quiz/tools/build_prototype.py "$Q" "$TMP/quiz" >/dev/null
cmp "$TMP/tetris.html" universe/tetris/index.html && cmp "$TMP/rhythm.html" universe/rhythm/index.html && \
  cmp "$TMP/quiz/main.js" universe/quiz/main.js && cmp "$TMP/quiz/index.html" universe/quiz/index.html && cmp "$TMP/quiz/style.css" universe/quiz/style.css
echo "可重現：OK"
echo "== 4. 瀏覽器 E2E =="
node universe/tetris/tests/browser/prototype-e2e.mjs "$T" "$R" "$OUT/tetris"
node universe/tests/browser/rhythm-e2e.mjs "$T" "$R" "$Q" "$OUT/rhythm"
node universe/tests/browser/quiz-e2e.mjs "$T" "$R" "$Q" "$OUT/quiz"
node universe/tests/browser/integration-e2e.mjs "$T" "$R" "$Q" "$OUT/integration"
echo "全部完成：截圖與結果在 $OUT"
