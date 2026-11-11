#!/usr/bin/env python3
"""三款遊戲玩家系統盤點：找出每個具名函式的行範圍，標記 Firebase 路徑讀寫、localStorage、V幣/排行榜/稱號/頭像等關鍵字。
用法：python3 -I analyze.py <檔案> <起始行(1-based, 只分析此行之後)> <結束行> <輸出 json>
"""
import json, re, sys

path, start, end, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
lines = open(path, encoding="utf-8").read().split("\n")

# --- 以簡易狀態機去除字串/註解內容（保留長度，讓大括號配對不被字串干擾） ---
def mask(src):
    res, i, n, st = [], 0, len(src), None
    while i < n:
        c = src[i]; nx = src[i + 1] if i + 1 < n else ""
        if st is None:
            if c == "/" and nx == "/": st = "line"; res.append("  "); i += 2; continue
            if c == "/" and nx == "*": st = "block"; res.append("  "); i += 2; continue
            if c in "'\"`": st = c; res.append(c); i += 1; continue
            if c == "/":
                # 判斷是否為 regex 字面值：前一個有效字元是運算子／括號／行首
                k = len(res) - 1
                while k >= 0 and res[k] in " \t": k -= 1
                prev = res[k] if k >= 0 else "\n"
                if prev in "(,=:[!&|?{};\n+-*%<>~^" :
                    j, inclass = i + 1, False
                    while j < n and src[j] != "\n":
                        if src[j] == "\\": j += 2; continue
                        if src[j] == "[": inclass = True
                        elif src[j] == "]": inclass = False
                        elif src[j] == "/" and not inclass: break
                        j += 1
                    if j < n and src[j] == "/":
                        res.append(" " * (j - i + 1)); i = j + 1; continue
            res.append(c); i += 1; continue
        if st == "line":
            if c == "\n": st = None; res.append("\n")
            else: res.append(" ")
            i += 1; continue
        if st == "block":
            if c == "*" and nx == "/": st = None; res.append("  "); i += 2; continue
            res.append("\n" if c == "\n" else " "); i += 1; continue
        # 字串
        if c == "\\": res.append("  "); i += 2; continue
        if c == st: st = None; res.append(c); i += 1; continue
        res.append("\n" if c == "\n" else " "); i += 1
    return "".join(res)

body = "\n".join(lines[start - 1:end])
masked = mask(body)
mlines = masked.split("\n")
offset = start - 1

FN = [
    re.compile(r"^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\("),
    re.compile(r"^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)"),
    re.compile(r"^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\("),
    re.compile(r"^\s*(?:window\.)?([A-Za-z_$][\w$.]*)\s*=\s*(?:async\s*)?function\b"),
]
funcs = []
pos_of_line = []
acc = 0
for ml in mlines:
    pos_of_line.append(acc); acc += len(ml) + 1
for idx, ml in enumerate(mlines):
    for rx in FN:
        m = rx.match(ml)
        if not m: continue
        name = m.group(1)
        # 由該行第一個 { 開始配對
        p = masked.find("{", pos_of_line[idx])
        if p < 0: break
        depth, q = 0, p
        while q < len(masked):
            if masked[q] == "{": depth += 1
            elif masked[q] == "}":
                depth -= 1
                if depth == 0: break
            q += 1
        endline = masked.count("\n", 0, q)
        if endline - idx > 3000: break
        funcs.append({"name": name, "start": idx + 1 + offset, "end": endline + 1 + offset})
        break

def innermost(line_no):
    best = None
    for f in funcs:
        if f["start"] <= line_no <= f["end"]:
            if best is None or (f["end"] - f["start"]) < (best["end"] - best["start"]): best = f
    return best

KW = {
    "wallet": r"wallet|balance|vCoin|VCOIN|V幣",
    "dailyReward": r"dailyRewards|dailyChallenge|每日",
    "leaderboard": r"leaderboard|排行",
    "gameLog": r"gameLogs|gameLog\b",
    "title": r"[Tt]itle(?:s|Key|Collection)?\b|稱號",
    "avatar": r"[Aa]vatar",
    "identity": r"playerKey|encodeFirebaseKeyPart|normalizePlayerId|PLAYER\.id|vPartyPlayerProfile",
}
READ = re.compile(r"\.once\(\s*['\"]value|\.on\(\s*['\"](?:value|child_)|\bonValue\(|\.get\(\)")
WRITE = re.compile(r"\.(set|update|transaction|push|remove)\(")
REF = re.compile(r"\.ref\(([^)]{0,160})\)")
LS = re.compile(r"(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\(\s*([^,)]{0,80})")

for f in funcs:
    f.update({"refs": set(), "reads": 0, "writes": set(), "ls": set(), "kw": set(), "fetch": 0})

for i, raw in enumerate(lines[start - 1:end]):
    ln = i + start
    ml = mlines[i]
    f = innermost(ln)
    if not f: continue
    for m in REF.finditer(raw): f["refs"].add(re.sub(r"\s+", " ", m.group(1).strip()))
    if READ.search(raw) and ".ref(" in raw or (READ.search(raw) and f["refs"]): f["reads"] += 1
    for m in WRITE.finditer(ml):
        # 只算 Firebase 參照上的寫入（同一行或前一行有 ref/Ref）
        ctx = raw + " " + (lines[ln - 2] if ln >= 2 else "")
        if re.search(r"\.ref\(|Ref\b|ref\b|playerRef|logsRef|firebaseDb|db\.", ctx): f["writes"].add(m.group(1))
    for m in LS.finditer(raw): f["ls"].add(f"{m.group(2)}({m.group(3).strip()})")
    for k, rx in KW.items():
        if re.search(rx, raw): f["kw"].add(k)
    if "fetch(" in ml: f["fetch"] += 1

res = []
for f in funcs:
    if not (f["refs"] or f["writes"] or f["ls"] or f["kw"]): continue
    res.append({**f, "refs": sorted(f["refs"]), "writes": sorted(f["writes"]), "ls": sorted(f["ls"]), "kw": sorted(f["kw"])})
json.dump({"file": path, "functions": res, "totalFunctions": len(funcs)}, open(out, "w"), ensure_ascii=False, indent=1)
print(path, "functions:", len(funcs), "player-system related:", len(res))
