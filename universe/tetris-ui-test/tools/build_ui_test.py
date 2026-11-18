#!/usr/bin/env python3
"""方塊派對 UI 測試版產生腳本（tetris-universe-ui-v0.3.4-test-1）

由「正式宇宙版」universe/tetris/ 產生 universe/tetris-ui-test/ 的 index.html 與 universe-shell.js。
正式版檔案只讀不寫；正式建置流程 universe/tetris/tools/build_prototype.py 完全不動。

用法（repository 根目錄）：
  python3 -I universe/tetris-ui-test/tools/build_ui_test.py
  python3 -I universe/tetris-ui-test/tools/build_ui_test.py --check   # 只比對，不寫檔（產物與 Repository 不同就失敗）

為什麼要用腳本而不是直接複製後手改：
  正式版 index.html 本身是 build_prototype.py 產生的。以後正式版重新產生時，
  只要重新執行本腳本，UI 測試版就會跟上，UI 修改不會遺失——
  因為 UI 修改全部放在獨立檔案（ui-test.css、ui-test.js、sandbox-guard.js），
  這裡只在 HTML 插入載入它們的標籤，遊戲程式（所有 <script> 內容）與頁面結構一個字都不改。

每一處修改都必須「剛好命中一次」，否則停止，避免改錯地方。
"""
import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEST_DIR = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(TEST_DIR, "..", ".."))
PROD_DIR = os.path.join(ROOT, "universe", "tetris")
VERSION = "tetris-universe-ui-v0.3.4-test-1"
TAG = "[UI 測試版]"


def read(path):
    with open(path, "rb") as f:
        raw = f.read()
    return raw.decode("utf-8"), hashlib.sha256(raw).hexdigest()


def replace_once(s, old, new, what):
    n = s.count(old)
    if n != 1:
        sys.exit(f"停止：{what} 應該剛好出現 1 次，實際 {n} 次")
    return s.replace(old, new)


def build_html(src):
    s = src
    # 1. 檔頭說明（只改註解）
    s = replace_once(s, "<!DOCTYPE html>\n",
        "<!DOCTYPE html>\n"
        f"<!-- {TAG} {VERSION}：由 universe/tetris/index.html 經 universe/tetris-ui-test/tools/build_ui_test.py 產生。\n"
        "     永久 Sandbox（sandbox-guard.js）；不讀寫任何正式資料。請勿手動修改本檔，修改 ui-test.css／ui-test.js 後重新產生。 -->\n",
        "DOCTYPE")
    # 2. 頁面標題
    s = replace_once(s, "<title>氣球小V方塊派對 🎈｜遊戲宇宙換殼測試版</title>",
        "<title>氣球小V方塊派對 🎈｜UI 測試版（Sandbox）</title>", "<title>")
    # 3. Sandbox 防護必須在 SDK 之前載入
    s = replace_once(s, '<script src="../shared/universe-sdk.js"></script>',
        f'<!-- {TAG} Sandbox 強制隔離：必須在 SDK 之前載入 -->\n<script src="sandbox-guard.js"></script>\n'
        '<script src="../shared/universe-sdk.js"></script>', "SDK script tag")
    # 4. UI 樣式（放在原版與換殼樣式之後，只在手機版生效）
    s = replace_once(s, '<link rel="stylesheet" href="universe-shell.css">',
        f'<link rel="stylesheet" href="universe-shell.css">\n<!-- {TAG} 手機版 UI 重新配置 -->\n'
        '<link rel="stylesheet" href="ui-test.css">\n'
        f'<!-- {TAG} 第二階段品牌視覺（v0.2.0）：首頁、結算、HUD 配色 -->\n'
        '<link rel="stylesheet" href="ui-brand.css">\n'
        '<link rel="stylesheet" href="desktop-ui.css?v=0.3.4-layout-2">', "universe-shell.css link")
    # 5. UI 程式（在原版程式之後載入）
    s = replace_once(s, "</body>",
        f'<!-- {TAG} 手機版 UI：棋盤尺寸、半透明觸控按鍵、頂部 HUD -->\n<script src="ui-test.js"></script>\n<script src="desktop-ui.js?v=0.3.4-test-1"></script>\n'
        f'<!-- {TAG} 第二階段品牌視覺：上下式首頁、結算角色、同難度再玩一次 -->\n<script src="ui-brand.js?v=0.3.4-test-1"></script>\n<script src="balloon-assets.js"></script>\n<script src="creation-story.js?v=0.3.3-test-1"></script>\n<link rel="stylesheet" href="creation-story.css?v=0.3.3-test-1">\n<link rel="stylesheet" href="tutorial.css?v=0.3.2-test-1">\n<script src="guided-practice.js?v=0.3.2-test-1"></script>\n<script src="tutorial.js?v=0.3.2-test-1"></script>\n<script src="menu-audio.js?v=0.1.2-test-1"></script>\n</body>',
        "</body>")
    return s


SHELL_SESSION_OLD = '''  var S = U.createGameSession({
    gameId: "tetris",
    gameVersion: GAME_VERSION,
    avatarBaseUrl: AV_BASE,
    lobbyUrl: "../../index.html",
    services: { scores: "mock", leaderboard: "mock" }   // 正式成績 API 尚未完成 → 明確使用 Mock
  });'''

SHELL_SESSION_NEW = f'''  /* {TAG} 永久 Sandbox：不看網址參數，參數由 sandbox-guard.js 寫死
     （mode:"sandbox"、services 全部 mock、SDK 網路請求一律拒絕、只用 Sandbox 測試玩家）。
     sandbox-guard.js 沒有載入就停止，絕不退回正式模式。 */
  if (!window.BVUiTestSandbox || window.BVUiTestSandbox.forced !== true) {{
    throw new Error("UI 測試版：sandbox-guard.js 未載入，為避免寫入正式資料，停止啟動");
  }}
  var S = U.createGameSession(Object.assign({{
    gameId: "tetris",
    gameVersion: GAME_VERSION,
    avatarBaseUrl: AV_BASE,
    lobbyUrl: "../../index.html"
  }}, window.BVUiTestSandbox.sessionOptions()));
  if (S.mode !== "sandbox" || S.isSandbox !== true) {{
    throw new Error("UI 測試版：Session 不是 Sandbox，停止啟動");
  }}'''


def build_shell(src):
    s = src
    s = replace_once(s, "   universe-game-migration-v0.1.0-foundation-test-1\n",
        "   universe-game-migration-v0.1.0-foundation-test-1\n"
        f"   {TAG} {VERSION}：由 universe/tetris/universe-shell.js 產生，只改 Session 參數（永久 Sandbox）\n",
        "shell header")
    s = replace_once(s, 'var GAME_VERSION = "tetris-v1.3.7+universe-v0.3.1-test-1";',
        f'var GAME_VERSION = "tetris-v1.3.7+universe-v0.3.1+{VERSION}";', "GAME_VERSION")
    s = replace_once(s, SHELL_SESSION_OLD, SHELL_SESSION_NEW, "createGameSession")
    return s


def main():
    check = "--check" in sys.argv[1:]
    html_src, html_sha = read(os.path.join(PROD_DIR, "index.html"))
    # The live entry may include a promoted presentation bundle; never import it twice.
    html_src = re.sub(r'<!-- BV-TETRIS-UI:(HEAD|BODY) -->\n[\s\S]*?<!-- /BV-TETRIS-UI:\1 -->\n', '', html_src)
    shell_src, shell_sha = read(os.path.join(PROD_DIR, "universe-shell.js"))
    css_src, css_sha = read(os.path.join(PROD_DIR, "universe-shell.css"))
    outputs = {
        "index.html": build_html(html_src),
        "universe-shell.js": build_shell(shell_src),
        "universe-shell.css": css_src,   # 原樣複製
    }
    bad = []
    for name, text in outputs.items():
        path = os.path.join(TEST_DIR, name)
        if check:
            cur = open(path, "rb").read().decode("utf-8") if os.path.exists(path) else None
            if cur != text:
                bad.append(name)
        else:
            with open(path, "wb") as f:
                f.write(text.encode("utf-8"))
    print(f"來源 universe/tetris/index.html        SHA-256 {html_sha}")
    print(f"來源 universe/tetris/universe-shell.js SHA-256 {shell_sha}")
    print(f"來源 universe/tetris/universe-shell.css SHA-256 {css_sha}")
    if check:
        if bad:
            sys.exit("與重新產生的結果不同：" + ", ".join(bad))
        print("可重現：OK")
    else:
        print("已產生：" + ", ".join(outputs))


if __name__ == "__main__":
    main()
