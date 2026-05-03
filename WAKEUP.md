# 起床看這個 (Wake-up summary)

> 你睡覺時我做的工作摘要 + 你接下來要做的事。

## TL;DR

✅ Phase 2 後端 + 前端、Phase 3 analytics scaffold、部署設定全部寫完
✅ 26 個 pytest 全綠、frontend 編譯零 error
✅ 全部已合併進 `main` 並 push 到 GitHub（原 `phase-2` 分支已刪除)
❌ **沒有真的部署**（要你登入 Vercel + Render，我沒有你的帳號）

下一步：按 `DEPLOY.md` 步驟把網站推上線。

---

## 1. 哪些東西在哪

### 程式碼
所有改動已合併進 `main`：
👉 https://github.com/trevor1018/ig-autopilot

### 兩個 commit
```
3fe...  Phase 2 frontend + Phase 3 analytics scaffold + deploy configs
xxx...  Phase 2 backend: targets, interaction log, safety guard, scheduler
```

第一個 commit 是 backend（model + service + router + 26 tests），第二個是 frontend（4 個新頁）+ Phase 3 + deploy configs。

---

## 2. Phase 2 蓋了什麼

### 後端 (`backend/`)
| 檔 | 做什麼 |
|---|---|
| `models/target_account.py` | 你要互動的 IG 帳號清單（每個可獨立規則） |
| `models/interaction_log.py` | 每次自動動作寫一筆（含 dry-run 計畫） |
| `models/sweep_run.py` | 每次掃視週期的記錄（成功 / 失敗 / 計數） |
| `services/safety_guard.py` | 每日 cap、90/10 加權隨機、隨機延遲 |
| `services/instagram_client.py` | DryRunClient（預設） + RealClient（instagrapi） |
| `services/comment_generator.py` | Gemini 即時生成短留言（角色內 / 帶 fallback） |
| `services/sweep.py` | 整個 sweep 流程的 orchestrator（依賴可注入，方便測） |
| `services/scheduler.py` | APScheduler 每日 0/8/16 點 UTC 自動跑 |
| `routers/targets.py` | targets CRUD |
| `routers/interactions.py` | log 列表（可 filter） + `/quota/{profile_id}` |
| `routers/sweeps.py` | 列表 + 手動觸發 |
| `tests/` | **26 個 test 全綠**（無真打 IG / Gemini） |

### 前端 (`frontend/src/pages/`)
| 頁 | 做什麼 |
|---|---|
| `Targets.tsx` | 加 / 看 / 刪 target，可 pause / activate，每個有獨立規則 |
| `InteractionLogPage.tsx` | 表格 + filter（profile / action / status） + 連去原 post |
| `SweepDashboard.tsx` | 配額 gauge（紅黃綠燈）、最近 sweep 表格、手動觸發按鈕 |
| `Analytics.tsx` | Phase 3 — 動作 sparkline、top targets、skip reason、內容分析 placeholder |

### 安全鎖（很重要）
- `IG_DRY_RUN=true` 是預設值。**所有 sweep 只寫 log，不真打 IG**。
- 你要切到 LIVE → 在 `.env` 設 `IG_DRY_RUN=false` + IG 帳密。`DEPLOY.md` 第 6 節有完整流程。
- Comment generator 有 fallback 寫死的中文短句，Gemini 失敗也不會卡 sweep。

---

## 3. Phase 3 (analytics) 的狀況

完成的：
- `models/post_analysis.py` — 表結構就緒
- `services/analyzer.py` —
  - **Activity analytics 已上線**：吃 InteractionLog 資料，跑得動
  - **Content analytics 等資料**：empty-state，會回 `status: no_data` 和友善訊息
- `routers/analytics.py` — 兩個 endpoint
- `pages/Analytics.tsx` — 圖表已渲染（empty-state 也好看）

沒完成的（需要 Phase 2 跑幾天累積資料才能寫）：
- 抓真 IG post metadata 寫進 PostAnalysis（要 sweep 過幾輪才有東西可分析）
- 用 Gemini Vision 分類 post 場景（食物 / 戶外 / 自拍 / 周邊）
- Hashtag performance 追蹤

→ Phase 2 上線跑 1-2 週後再回來繼續做 Phase 3 才有意義。

---

## 4. 部署設定 (Option B)

我幫你準備好了所有設定檔，但**真的部署要你執行**：

| 檔 | 用途 |
|---|---|
| `render.yaml` | Render 後端部署 spec（含 1GB persistent disk for SQLite） |
| `frontend/vercel.json` | Vercel 前端 SPA 設定 |
| `DEPLOY.md` | **完整 step-by-step 教學**（30 分鐘可上線） |

**你睡醒要做的事**：
1. 跟著 `DEPLOY.md` 走（Render → Vercel → CORS → seed DB → smoke test）
2. 結果會是兩個 URL：
   - `https://ig-autopilot.vercel.app`（前端）
   - `https://ig-autopilot-api.onrender.com`（後端）

費用：**0 元/月**（兩家都用免費版）。免費版 Render 會 sleep（15min idle 後睡，第一次 request 慢 30 秒），但對自己用沒差。等你要 24/7 自動跑 Phase 2 sweep 時，升級 Render Starter $7/月。

---

## 5. 我沒做 / 不能做的事

| 事 | 為什麼 |
|---|---|
| 真實部署到 Vercel/Render | 要你的帳號登入。`DEPLOY.md` 是手把手教學，30 分鐘可完成。 |
| 真的測 IG 自動互動 | 沒有測試 IG 帳號 + 真打 IG 有風控風險。`DryRunInstagramClient` 已驗證 sweep 流程正確。 |
| 用真 Gemini 跑測試 | 不想燒你 quota。Tests 全部用 mock。 |

---

## 6. 怎麼本地驗證 Phase 2

可以等你睡醒在本地先測一輪確認沒爛：

```powershell
# Backend (terminal 1)
cd D:\python\ig-autopilot\backend
.venv\Scripts\activate
pip install -r requirements.txt    # 裝新 deps (apscheduler, instagrapi, pytest)
pytest tests/ -v                   # 應該 26 passed
uvicorn main:app --reload --port 8000

# Frontend (terminal 2)
cd D:\python\ig-autopilot\frontend
npm install
npm run dev
```

→ 開 http://localhost:5173 → 應該看到 nav 多了 Sweep / Log / Targets / Analytics 四個分頁。

操作流程：
1. 進 **Targets** → 為 `nuannuanzhu_demo` 加幾個假 target（例如 `pikachu_official`、`charmander_lab`）
2. 進 **Sweep** → 按「▶ Trigger sweep now」→ 看 sweep 跑完
3. 進 **Log** → 應該看到一筆 `like` 或 `comment`，標 DRY-RUN
4. 再點一次 Trigger → 第二次會看到 `skip` (no_new_post)
5. 進 **Analytics** → 看到動作 sparkline、top target、skip reason 分布

任何步驟出錯把 backend log 貼給我。

---

## 7. 已知小事

- 第一次 backend 啟動會看到 APScheduler 起來的 log（`scheduler started; sweep hours UTC=0,8,16`），之後幾乎沒輸出（除非真的 sweep 跑）
- Vite build size: 201KB JS / 13KB CSS（gzip 後 62KB / 3KB），合理範圍
- 我有改 `tsconfig.json` 加 `noEmit: true`，因為 `tsc -b` 預設會吐 .js 到 src/，污染 source tree。Vite 自己會編譯。

---

## 8. 任務狀態

19 個 task 全部 completed。可以從 GitHub commit history 對應到每個階段的工作。

---

# 你的 to-do（按優先序）

1. ✅ 本地跑一輪確認沒問題（第 6 節）
2. ⏳ 跟 `DEPLOY.md` 走 → Render 部署後端
3. ⏳ 跟 `DEPLOY.md` 走 → Vercel 部署前端
4. ⏳ Smoke test 通過 → 你有公開網址了
5. ⏳ 跑幾天 dry-run sweep 累積 log
6. ⏳ Phase 3 真實 content analytics（等資料夠了再回來）
7. ⏳ 切 LIVE（先用測試帳號，看 `DEPLOY.md` 第 6 節）

晚安變早安啦 🐷
