"""遊戲宇宙換殼版產生工具（節奏遊戲、知識挑戰共用；方塊派對沿用 v0.1.0 的獨立腳本）

原則：
  - 只改「玩家系統」相關函式（身份、Firebase、V幣、稱號、頭像解鎖、排行榜、管理後台）
  - 遊戲玩法函式一律不動；各遊戲的 *-core-integrity.test.mjs 會以 SHA-256 驗證
  - 每一處修改都必須「剛好命中一次」，否則停止，避免改錯地方
"""
import hashlib
import re

TAG = "[Universe 換殼]"


def mask(text):
    """把字串、註解、regex 內容換成空白（長度不變），讓大括號配對不受干擾"""
    out, i, n, st = [], 0, len(text), None
    while i < n:
        c = text[i]; nx = text[i + 1] if i + 1 < n else ""
        if st is None:
            if c == "/" and nx == "/": st = "line"; out.append("  "); i += 2; continue
            if c == "/" and nx == "*": st = "block"; out.append("  "); i += 2; continue
            if c in "'\"`": st = c; out.append(c); i += 1; continue
            if c == "/":
                k = len(out) - 1
                while k >= 0 and out[k] in " \t": k -= 1
                prev = out[k] if k >= 0 else "\n"
                if prev in "(,=:[!&|?{};\n+-*%<>~^":
                    j, inclass = i + 1, False
                    while j < n and text[j] != "\n":
                        if text[j] == "\\": j += 2; continue
                        if text[j] == "[": inclass = True
                        elif text[j] == "]": inclass = False
                        elif text[j] == "/" and not inclass: break
                        j += 1
                    if j < n and text[j] == "/":
                        out.append(" " * (j - i + 1)); i = j + 1; continue
            out.append(c); i += 1; continue
        if st == "line":
            if c == "\n": st = None; out.append("\n")
            else: out.append(" ")
            i += 1; continue
        if st == "block":
            if c == "*" and nx == "/": st = None; out.append("  "); i += 2; continue
            out.append("\n" if c == "\n" else " "); i += 1; continue
        if c == "\\": out.append("  "); i += 2; continue
        if c == st: st = None; out.append(c); i += 1; continue
        out.append("\n" if c == "\n" else " "); i += 1
    return "".join(out)


class Builder:
    def __init__(self, src_path, shell_name):
        raw = open(src_path, "rb").read()
        self.sha = hashlib.sha256(raw).hexdigest()
        self.s = raw.decode("utf-8")
        self.log = []
        self.shell = shell_name   # 例如 UniverseRhythm

    def _spans(self, name, expected):
        masked = mask(self.s)
        spans = []
        for m in re.finditer(r"(?:async\s+)?function\s+" + re.escape(name) + r"\s*\(", masked):
            p = masked.find("{", m.end())
            depth, q = 0, p
            while q < len(masked):
                if masked[q] == "{": depth += 1
                elif masked[q] == "}":
                    depth -= 1
                    if depth == 0: break
                q += 1
            spans.append((p, q))
        assert len(spans) == expected, f"{name}: 找到 {len(spans)} 個定義（預期 {expected}）"
        return spans

    def replace_body(self, name, new_body, occurrences=1):
        for p, q in reversed(self._spans(name, occurrences)):
            self.s = (self.s[:p + 1] + f"\n  // {TAG} 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）\n"
                      + new_body.rstrip() + "\n" + self.s[q:])
        self.log.append(f"replace body: {name} ×{occurrences}")

    def guard(self, name, code):
        (p, q), = self._spans(name, 1)
        self.s = self.s[:p + 1] + "\n  " + code + f"  // {TAG}" + self.s[p + 1:]
        self.log.append(f"guard: {name}")

    def rep(self, old, new, label):
        n = self.s.count(old)
        assert n == 1, f"{label}: 命中 {n} 次"
        self.s = self.s.replace(old, new)
        self.log.append(f"replace: {label}")

    def rep_re(self, pattern, new, label, flags=re.S):
        found = list(re.finditer(pattern, self.s, flags))
        assert len(found) == 1, f"{label}: 命中 {len(found)} 次"
        m = found[0]
        self.s = self.s[:m.start()] + new + self.s[m.end():]
        self.log.append(f"replace: {label}")

    def write(self, out_path, header):
        s = self.s
        s = s.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n" + header, 1) if s.lstrip().upper().startswith("<!DOCTYPE HTML>") else header + s
        open(out_path, "w", encoding="utf-8").write(s)
        print("source sha256:", self.sha)
        print("\n".join(self.log))
        print("edits:", len(self.log))
