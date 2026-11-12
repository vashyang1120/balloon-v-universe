#!/usr/bin/env python3
"""把管理者「唯讀匯出」的題目修正資料轉成 universe/quiz/approved-question-overrides.json

用法（repository 根目錄）：
  python3 -I universe/quiz/tools/import_question_overrides.py <匯出的 JSON> <正式題庫 quiz_questions.json> universe/quiz/approved-question-overrides.json

匯出方式（不需要任何金鑰、不會修改資料）：
  Firebase Console → Realtime Database → 選取 quizQuestionOverrides 節點 → 「匯出 JSON」。
  也接受整個資料庫的匯出檔（會自動取出 quizQuestionOverrides）。

本工具只做格式檢查與欄位過濾：
  - 只保留原版 applyQuestionOverrides 會套用的欄位（disabled／active／quality／reviewNote／reason／updatedAt／updatedBy）
  - 題目 ID 必須存在於正式題庫；不存在的會列出並略過
  - 不連線任何網路、不讀寫 Firebase
"""
import datetime
import hashlib
import json
import re
import sys

FIELDS = ["disabled", "active", "quality", "reviewNote", "reason", "updatedAt", "updatedBy"]
src, bank_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(src, "rb").read()
data = json.loads(raw.decode("utf-8"))
if isinstance(data, dict) and "quizQuestionOverrides" in data:
    data = data["quizQuestionOverrides"]
if not isinstance(data, dict):
    sys.exit("匯出檔格式不符：應為 { 題目ID: {...} }")
bank_ids = {q.get("id") for q in json.load(open(bank_path, encoding="utf-8")) if isinstance(q, dict)}
overrides, skipped = {}, []
for qid, ov in sorted(data.items()):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", str(qid)) or not isinstance(ov, dict) or qid not in bank_ids:
        skipped.append(qid)
        continue
    overrides[qid] = {k: ov[k] for k in FIELDS if k in ov}
doc = {
    "schema": "bv-quiz-question-overrides-v1",
    "status": "exported",
    "note": "由管理者唯讀匯出的已核准題目修正；套用規則與原版 applyQuestionOverrides／isQuestionEnabled 相同。",
    "allowedFields": FIELDS,
    "exportedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "source": {"type": "firebase-console-export", "sha256": hashlib.sha256(raw).hexdigest()},
    "overrides": overrides,
}
json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
disabled = sum(1 for v in overrides.values() if v.get("disabled") is True or v.get("active") is False or str(v.get("quality", "")).lower() == "disabled")
print(f"匯入 {len(overrides)} 筆（其中停用 {disabled} 筆）；略過 {len(skipped)} 筆：{skipped[:10]}")
