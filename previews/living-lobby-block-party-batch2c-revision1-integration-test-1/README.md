# Living Lobby Art v1.0｜Batch 2-C Revision 1 Integration Test 1

把已驗收的「吊臂搬運」動畫接進目前正式上線的動態大廳。整合本身在這個分支的 `index.html` 與 `assets/living-lobby/` 中；這個資料夾放的是測試、影片與交接文件。

## 觀看

- **影片**：`videos/full-lobby-desktop.mp4`（桌面）、`videos/full-lobby-phone.mp4`（手機）。
- **本機預覽**：取出這個分支後，在 repo 根目錄執行 `python3 -m http.server 8765`，開啟以下網址：
  - `http://127.0.0.1:8765/index.html`（吊起 12 px）
  - 加上 `?craneLift=10` 或 `?craneLift=15` 可切換高度
  - 加上 `?craneLift=0` 會關閉吊臂，方便對照

## 複驗

```sh
python3 -m http.server 8765 &
python3 previews/living-lobby-block-party-batch2c-revision1-integration-test-1/check-integration.py
python3 previews/living-lobby-block-party-batch2c-revision1-integration-test-1/record.py http://127.0.0.1:8765/ <輸出目錄>
```

需要 Python 3（Pillow、NumPy、Playwright）、Chrome 與 ffmpeg。

詳細內容請見 `HANDOFF.md`。
