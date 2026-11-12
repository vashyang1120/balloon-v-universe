#!/usr/bin/env python3
"""把管理者「唯讀匯出」的題目修正資料轉成公開檔 universe/quiz/approved-question-overrides.json

用法（repository 根目錄）：
  python3 -I universe/quiz/tools/import_question_overrides.py <匯出的 JSON> <正式題庫 quiz_questions.json> universe/quiz/approved-question-overrides.json

匯出方式（不需要任何金鑰、不會修改資料）：
  Firebase Console → Realtime Database → 選取 quizQuestionOverrides 節點 → 「匯出 JSON」。
  也接受整個資料庫的匯出檔（會自動只取出 quizQuestionOverrides）。
  ⚠ 匯出原檔含後台管理資訊，**不要提交到 GitHub**；只提交本工具產生的公開檔。

公開資料最小化（v0.2.0-test-2）：
  原版 isQuestionEnabled 只看三個欄位決定「題目會不會被抽出」：
    disabled === true、active === false、quality === "disabled"
  所以公開檔只保留 disabled／active／quality（原檔有哪個才保留哪個）。
  reviewNote（管理備註）、reason、updatedAt（操作時間）、updatedBy（管理帳號）只用於後台，一律不公開。

檢查：
  - 題目 ID 必須存在於正式題庫；不存在、格式不對、沒有任何出題判定欄位的資料 → 列出並停止（不產生半套檔案）
  - 欄位值型別必須正確（disabled／active 為布林值，quality 為字串）
  - 不連線任何網路、不讀寫 Firebase
"""
import hashlib
import json
import re
import sys

PUBLIC_FIELDS = ["disabled", "active", "quality"]   # 原版 isQuestionEnabled 用到的全部欄位
TYPES = {"disabled": bool, "active": bool, "quality": str}

src, bank_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(src, "rb").read()
data = json.loads(raw.decode("utf-8"))
if isinstance(data, dict) and "quizQuestionOverrides" in data:
    data = data["quizQuestionOverrides"]
if not isinstance(data, dict):
    sys.exit("匯出檔格式不符：應為 { 題目ID: {...} }")
bank_ids = {q.get("id") for q in json.load(open(bank_path, encoding="utf-8")) if isinstance(q, dict)}

overrides, problems, dropped = {}, [], set()
for qid, ov in sorted(data.items()):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", str(qid)):
        problems.append(f"{qid}：題目 ID 格式不正確"); continue
    if qid not in bank_ids:
        problems.append(f"{qid}：正式題庫沒有這一題"); continue
    if not isinstance(ov, dict):
        problems.append(f"{qid}：內容不是物件"); continue
    pub = {}
    for k in PUBLIC_FIELDS:
        if k in ov:
            if not isinstance(ov[k], TYPES[k]):
                problems.append(f"{qid}.{k}：型別不正確"); continue
            pub[k] = ov[k]
    dropped.update(k for k in ov if k not in PUBLIC_FIELDS)
    if not pub:
        problems.append(f"{qid}：沒有任何出題判定欄位（disabled／active／quality）"); continue
    overrides[qid] = pub
if problems:
    sys.exit("匯入停止，請檢查匯出檔：\n  " + "\n  ".join(problems))

doc = {
    "schema": "bv-quiz-question-overrides-v1",
    "status": "exported",
    "note": "已核准的題目修正（只含出題判定欄位）。套用規則與原版 applyQuestionOverrides／isQuestionEnabled 相同；"
            "後台管理資訊（管理備註、管理帳號、操作時間）不公開。",
    "allowedFields": PUBLIC_FIELDS,
    "source": {"type": "firebase-console-export", "node": "quizQuestionOverrides", "count": len(overrides),
               "sha256": hashlib.sha256(raw).hexdigest()},
    "overrides": overrides,
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=1)
    f.write("\n")
off = [k for k, v in overrides.items() if v.get("disabled") is True or v.get("active") is False or str(v.get("quality", "")).lower() == "disabled"]
print(f"匯入 {len(overrides)} 筆（停用 {len(off)} 筆：{', '.join(off)}）")
print(f"未公開的欄位：{', '.join(sorted(dropped)) or '無'}")
