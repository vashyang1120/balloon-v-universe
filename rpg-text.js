/* ==========================================================
   氣球小V — RPG 對話文字工具（v0.3.3 新增，可直接複製到其他小V遊戲使用）
   balloon-v-universe-v0.3.3-rpg-ux-polish-test-1

   1) 關鍵字強調：沿用《氣球小V：派對島大作戰》既有寫法 {字母:文字}
        {t:你自己的頭像}   操作目標   → 紫色＋粗體   （rpg-hl-t）
        {i:專屬身份}       身份重要名詞 → 粉紅色＋粗體 （rpg-hl-i）
        {n:要記住}         重要提醒   → 金橘色＋粗體  （rpg-hl-n）
      相容派對島大作戰：{g:金色道具} {r:紅色危險} {b:藍色提示}（rpg-hl-g / r / b）
      要顯示字面上的大括號：寫 {{ 和 }}；放進玩家輸入的文字（例如 ID）一律先用 RpgText.escape()

   2) 安全輸出：只建立文字節點與 <span class="rpg-hl-x">，不使用 innerHTML，
      所以文字裡的 < > & 都會原樣顯示，不會變成 HTML。

   3) 逐字顯示：render(el, chars, n) 只畫出前 n 個「看得到的字」，強調樣式在逐字過程中就會出現。

   4) 自動分頁：paginate(el, chars, opts) 依對話框「實際可放文字的範圍」量測，
      放不下時優先在句號／驚嘆號／問號後面分頁，其次逗號、頓號，最後才逐字切；
      不縮小字體、不裁切、不捲動。
   ========================================================== */

(function (root) {
  "use strict";

  var KEEP_MAX = 10;   // 10 個字以內的強調詞保持同一行（更長的仍可換行，避免溢出）
  var CLASSES = { t: "rpg-hl-t", i: "rpg-hl-i", n: "rpg-hl-n", g: "rpg-hl-g", r: "rpg-hl-r", b: "rpg-hl-b" };

  /* 解析成「每個看得到的字」：[{ ch: "字", cls: "rpg-hl-t" | "" }] */
  function parse(text) {
    var s = Array.from(String(text == null ? "" : text));
    var out = [], i = 0, cls = "";
    while (i < s.length) {
      var c = s[i];
      if (c === "{" && s[i + 1] === "{") { out.push({ ch: "{", cls: cls }); i += 2; continue; }
      if (c === "}" && s[i + 1] === "}") { out.push({ ch: "}", cls: cls }); i += 2; continue; }
      if (!cls && c === "{" && CLASSES[s[i + 1]] && s[i + 2] === ":") {
        // 確認後面真的有結束的 }（沒有就當一般文字，避免整句變色）
        var j = i + 3, found = -1;
        while (j < s.length) {
          if (s[j] === "}" && s[j + 1] === "}") { j += 2; continue; }
          if (s[j] === "}") { found = j; break; }
          j++;
        }
        if (found > 0) { cls = CLASSES[s[i + 1]]; i += 3; continue; }
      }
      if (cls && c === "}") { cls = ""; i++; continue; }
      out.push({ ch: c, cls: cls });
      i++;
    }
    return out;
  }

  /* 純文字（給 aria、一般 HTML 卡片、測試用） */
  function plain(text) { return parse(text).map(function (c) { return c.ch; }).join(""); }

  /* 玩家輸入的文字放進台詞前先跳脫，避免被當成強調標記 */
  function escape(text) { return String(text == null ? "" : text).replace(/\{/g, "{{").replace(/\}/g, "}}"); }

  /* 把 chars[from, to) 的前 n 個字畫進 el（只用文字節點與 span） */
  function render(el, chars, n, from, to) {
    from = from || 0;
    to = to == null ? chars.length : to;
    var end = Math.min(to, from + (n == null ? Infinity : n));
    while (el.firstChild) el.removeChild(el.firstChild);
    var buf = "", cur = null, runLen = 0;
    function flush() {
      if (!buf) return;
      if (cur) {
        var sp = document.createElement("span");
        sp.className = cur + (runLen <= KEEP_MAX ? " rpg-hl-keep" : "");   // 短的強調詞不要被拆成兩行
        sp.textContent = buf; el.appendChild(sp);
      }
      else el.appendChild(document.createTextNode(buf));
      buf = "";
    }
    for (var k = from; k < end; k++) {
      var c = chars[k];
      if (c.cls !== cur) {
        flush(); cur = c.cls;
        runLen = 0;
        for (var q = k; q < to && chars[q].cls === cur; q++) runLen++;   // 整個強調詞的長度（不是目前打出的長度）
      }
      buf += c.ch;
    }
    flush();
  }

  /* ---------- 自動分頁 ---------- */
  var STRONG = /[。！？!?…～~\n]/;
  var WEAK = /[，、,；;：:）」』]/;
  function fits(el, chars, a, b) {
    render(el, chars, null, a, b);
    return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
  }
  /* 分頁邊界：句尾標點後面（連續標點一起留在前一頁，例如「！」「…」「」」） */
  function breakpoints(chars, a, b, re) {
    var out = [];
    for (var k = a + 1; k < b; k++) {
      if (re.test(chars[k - 1].ch) && !STRONG.test(chars[k].ch) && !WEAK.test(chars[k].ch)) out.push(k);
    }
    return out;
  }
  function skipSpace(chars, k, b) { while (k < b && /[\s　]/.test(chars[k].ch)) k++; return k; }

  /* opts.lastFit(el) → 給最後一頁用的版面（例如下方有選項時，文字區變矮）；量完會還原 */
  function paginate(el, chars, opts) {
    opts = opts || {};
    var pages = [], a = 0, N = chars.length;
    var guard = 0;
    while (a < N && guard++ < 200) {
      a = skipSpace(chars, a, N);
      if (a >= N) break;
      if (fits(el, chars, a, N)) { pages.push([a, N]); a = N; break; }
      var end = largestFit(el, chars, a, N);
      pages.push([a, end]);
      a = end;
    }
    if (!pages.length) pages.push([0, N]);
    // 最後一頁要和選項一起放：放不下就把最後一頁再切開
    if (opts.lastLayout) {
      var restore = opts.lastLayout(el);
      var last = pages.pop();
      var parts = [];
      var la = last[0], lb = last[1];
      while (la < lb && guard++ < 400) {
        if (fits(el, chars, la, lb)) { parts.push([la, lb]); break; }
        // 從後面找最長、可以單獨放進「有選項」版面的結尾段落
        var cut = smallestTailStart(el, chars, la, lb);
        if (cut <= la) { parts.push([la, lb]); break; }
        parts.push([la, cut]);          // 前段在一般版面顯示（已確認放得下，因為是原本頁面的一部分）
        la = skipSpace(chars, cut, lb);
      }
      if (restore) restore();
      pages = pages.concat(parts);
    }
    render(el, chars, 0);
    return pages;
  }
  function largestFit(el, chars, a, b) {
    var lists = [breakpoints(chars, a, b, STRONG), breakpoints(chars, a, b, WEAK)];
    for (var li = 0; li < lists.length; li++) {
      var bp = lists[li];
      for (var k = bp.length - 1; k >= 0; k--) if (fits(el, chars, a, bp[k])) return bp[k];
    }
    // 最後手段：逐字（二分搜尋最多能放幾個字）
    var lo = a + 1, hi = b;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (fits(el, chars, a, mid)) lo = mid; else hi = mid - 1; }
    return Math.max(a + 1, lo);
  }
  function smallestTailStart(el, chars, a, b) {
    var lists = [breakpoints(chars, a, b, STRONG), breakpoints(chars, a, b, WEAK)];
    for (var li = 0; li < lists.length; li++) {
      var bp = lists[li];
      for (var k = 0; k < bp.length; k++) if (fits(el, chars, skipSpace(chars, bp[k], b), b)) return bp[k];
    }
    var lo = a + 1, hi = b - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (fits(el, chars, mid, b)) hi = mid; else lo = mid + 1; }
    return lo;
  }

  root.RpgText = { parse: parse, plain: plain, escape: escape, render: render, paginate: paginate, classes: CLASSES };
})(window);
