/* 知識挑戰宇宙版：「已核准題目修正」同步檢查（v0.2.0-test-2）
   執行（repository 根目錄）：
     BV_QUIZ_BANK=<vparty-quiz-game clone>/quiz_questions.json node --test universe/quiz/tests/quiz-question-overrides.test.mjs
   沒有 BV_QUIZ_BANK 時，需要正式題庫的測試會「失敗」而不是略過（避免沒發現修正檔沒有被檢查）。

   目的：日後題目修正檔遺失、變回 not_exported、少了題目、或混入後台管理資訊時，測試會失敗。
   出題判定用的是宇宙版 main.js 裡的原版函式（applyQuestionOverrides、isQuestionEnabled、getQuestionPool），
   並先以 SHA-256 確認這些函式與正式版逐字相同。 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { extractFunctions } from "../../shared/tools/js-functions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, "..");
const OV_FILE = path.join(DIR, "approved-question-overrides.json");
const baseline = JSON.parse(fs.readFileSync(path.join(DIR, "tools/original-functions.sha256.json"), "utf8"));
const fns = Object.fromEntries(extractFunctions(fs.readFileSync(path.join(DIR, "main.js"), "utf8")).map((f) => [f.name, f]));

/* 已核准、必須維持停用的題目（使用者 2026-11-12 由舊 Firebase 唯讀匯出） */
const APPROVED_DISABLED = ["brain_low_021", "brain_low_030", "brain_middle_012", "brain_middle_027"];
const PUBLIC_FIELDS = ["disabled", "active", "quality"];

function loadBank() {
  const p = process.env.BV_QUIZ_BANK;
  assert.ok(p && fs.existsSync(p), "請設定 BV_QUIZ_BANK＝正式題庫 quiz_questions.json 的路徑（run-all.sh 會自動設定）");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/* 用宇宙版 main.js 裡的原版函式建立一個最小的出題環境 */
function quizEngine(questions, overrides) {
  const names = ["applyQuestionOverrides", "isQuestionEnabled", "getQuestionPool", "shuffle", "getDedupedQuestionPool"];
  for (const n of names) assert.equal(fns[n].sha256, baseline.functions[n], `${n} 與原版不同`);
  const ctx = vm.createContext({ QUESTIONS: JSON.parse(JSON.stringify(questions)), QUESTION_OVERRIDES: overrides,
    selectedGrade: "low", selectedSubject: "brain", Math, Object, String, Array, JSON });
  vm.runInContext(names.map((n) => fns[n].text).join("\n"), ctx);
  vm.runInContext("applyQuestionOverrides();", ctx);
  return ctx;
}

test("題目修正檔存在、格式正確、狀態為已匯出（不可退回 not_exported）", () => {
  assert.ok(fs.existsSync(OV_FILE), "approved-question-overrides.json 遺失");
  const doc = JSON.parse(fs.readFileSync(OV_FILE, "utf8"));
  assert.equal(doc.schema, "bv-quiz-question-overrides-v1");
  assert.equal(doc.status, "exported");
  assert.deepEqual(doc.allowedFields, PUBLIC_FIELDS);
  assert.equal(doc.source.count, Object.keys(doc.overrides).length);
});

test("四筆已核准的停用題目全部在檔案中，且都是停用", () => {
  const { overrides } = JSON.parse(fs.readFileSync(OV_FILE, "utf8"));
  for (const id of APPROVED_DISABLED) {
    assert.ok(overrides[id], `缺少 ${id}`);
    assert.deepEqual(overrides[id], { disabled: true, quality: "disabled" }, `${id} 內容不正確`);
  }
  assert.equal(Object.keys(overrides).length, APPROVED_DISABLED.length, "筆數與已核准清單不同（新增修正請一併更新本測試）");
});

test("公開檔只含出題判定欄位，沒有後台管理資訊", () => {
  const text = fs.readFileSync(OV_FILE, "utf8");
  const { overrides } = JSON.parse(text);
  for (const [id, ov] of Object.entries(overrides)) {
    assert.deepEqual(Object.keys(ov).filter((k) => !PUBLIC_FIELDS.includes(k)), [], `${id} 含非公開欄位`);
  }
  assert.doesNotMatch(text, /reviewNote|updatedBy|updatedAt|"reason"|quiz-admin|後台停用/);
});

test("四個題目 ID 都存在於正式題庫；其他題目不受影響", () => {
  const bank = loadBank();
  const { overrides } = JSON.parse(fs.readFileSync(OV_FILE, "utf8"));
  const ids = new Set(bank.map((q) => q.id));
  for (const id of Object.keys(overrides)) assert.ok(ids.has(id), `正式題庫沒有 ${id}`);
  const ctx = quizEngine(bank, overrides);
  const enabledAfter = ctx.QUESTIONS.filter((q) => ctx.isQuestionEnabled(q)).map((q) => q.id);
  const plain = quizEngine(bank, {});
  const enabledBefore = plain.QUESTIONS.filter((q) => plain.isQuestionEnabled(q)).map((q) => q.id);
  assert.deepEqual(enabledBefore.filter((id) => !enabledAfter.includes(id)).sort(), [...APPROVED_DISABLED].sort(), "只有這四題被停用");
  assert.equal(enabledAfter.length, enabledBefore.length - 4);
  // 題目文字、答案、選項沒有被改動（套用修正只加上判定欄位）
  const byId = Object.fromEntries(bank.map((q) => [q.id, q]));
  for (const q of ctx.QUESTIONS) {
    const o = byId[q.id];
    assert.equal(q.question, o.question); assert.equal(q.answerIndex, o.answerIndex); assert.deepEqual(q.choices, o.choices);
  }
});

test("原版出題規則：腦筋急轉彎 低／中年級題池不含停用題，每局（重複 300 次）都不會抽到", () => {
  const bank = loadBank();
  const { overrides } = JSON.parse(fs.readFileSync(OV_FILE, "utf8"));
  const ctx = quizEngine(bank, overrides);
  for (const grade of ["low", "middle"]) {
    ctx.selectedGrade = grade; ctx.selectedSubject = "brain";
    const pool = vm.runInContext("getQuestionPool()", ctx).map((q) => q.id);
    const total = bank.filter((q) => q.gradeBand === grade && q.subject === "brain").length;
    const off = APPROVED_DISABLED.filter((id) => id.includes("_" + grade + "_"));
    assert.equal(pool.length, total - off.length, `${grade} 題池數量`);
    for (const id of off) assert.ok(!pool.includes(id), `${grade} 題池仍有 ${id}`);
    for (let i = 0; i < 300; i++) {
      const picked = vm.runInContext("getDedupedQuestionPool(getQuestionPool()).slice(0, 10)", ctx).map((q) => q.id);
      assert.ok(!picked.some((id) => APPROVED_DISABLED.includes(id)), "抽到停用題");
    }
  }
});
