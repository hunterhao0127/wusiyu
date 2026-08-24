# 务思语 · 交接文档：P0 修复已完成 + 后续改进路线

> 执行：ox-alpha（Hermes Agent）　日期：2026-08-24
> 交付：commit `4935026`（已推送 main）｜本文档 = 任务报告 + 全部待办交接
> **给 Codex：本文档自足，读完即可接手，无需其他上下文。**

---

## A. 已完成的工作

### A1. 四个 P0 修复（三端核对，逐条实测）

| # | Bug | 根因 | 修复 | 涉及文件 |
|---|-----|------|------|---------|
| 1 | 示例书章节跳错位 | chapters 写 start:7/11，实际索引是 8/12 | 改为 8/12 | web、Android |
| 2 | Claude 供应商连不通 | 按 OpenAI 协议调 Anthropic | web/Android：`callDeepSeek` 加原生分支（/v1/messages + x-api-key + anthropic-version + 浏览器直调头）；桌面版：app.py `call_ai_api` 按 api_base 自动识别 | web、Android、02-Mac版/flask-app/app.py |
| 3 | don't 类词条删不掉 | id 含撇号打断行内 onclick | data-del-id + 事件委托 | web、Android |
| 4 | 拖拽覆盖层永不显示 | dropOverlay 嵌在 settings-panel 内继承 opacity:0 | 移至 body 层级 | web、Android、Mac static |

### A2. 验证证据
- `node --check` 三份内联 JS ✓；`py_compile` app.py ✓
- 真实 Chromium 实测：章节跳转落位、overlay 结构、撇号词条增删、Claude 请求格式拦截校验、翻页回归 —— 全过
- app.py 行为级定向验证（stub flask + mock requests）：Anthropic 分支 / DeepSeek 回归 / 空 key 边界 **9/9 PASS**（mock 网络，未覆盖真实 HTTP 与 Flask 路由层）
- Mac 本地打包：`releases/wusiyu-P0修复-4935026.zip`

### A3. Windows 安装包状态
本机无法构建（缺 dist/务思语-win32-x64 与 flask-app/务思语.exe）。Windows 机重建步骤见 `docs/WINDOWS_FOLLOWUP.md`；要点：**必须重新打 flask-app 后端**（Claude 修复在 app.py），static 用仓库最新版。版本号已是 1.5.5 无需动。

---

## B. 后续改进路线（ox-alpha 建议，按性价比排序）

### 第一批：快赢（合计约一个下午，收益立现）
1. **fetch 超时**：`callDeepSeek` 加 AbortController（60s），超时提示"网络超时请重试"。现状：网络挂起时"翻译中..."永久转圈。约 15 行。
2. **句子翻译转义**：`translateSelection()` L2721 一带，AI 返回内容未 escapeHtml 直接 innerHTML（单词路径已转义）。1 行安全修复。
3. **翻译缓存**：localStorage 存 `{provider}|{model}|{word}|{mode}` → 结果，LRU 上限 ~500 条。同一个词第二次查 0 成本 0 等待。约 30 行。注意配合第 8 条的 quota 保护。
4. **TTS 发音**：单词弹窗加 🔊 按钮，`speechSynthesis`（en-US voice）。英语阅读器不能发音是最大体验缺口。Android WebView 若不支持需 Capacitor TTS 插件兜底。

### 第二批：稳定性
5. **跳页异步化**：`buildPageIndexTo` 目前同步串行渲染全书（800 页书跳尾页冻结 UI 数十秒，且先量完才报"超范围"）。改 rAF 分片 + 进度 toast；先用平均页容量估上界，超出直接拒绝。
6. **resize 页码失效**：窗口尺寸变化后 pageStarts/pageEnds 未重建 → 页码算错。resize handler 里 `resetPageIndex()` 即可。
7. **单词本内存缓存**：现在每个段落渲染都 `JSON.parse` 整个单词本（一页 80 段 = 80 次解析 + 全量高亮扫描）。模块级缓存，增删时更新。
8. **quota 保护**：`saveWordbook` 的 setItem 会因句子+长释义撑爆 5MB 配额且静默失败。try/catch + 明确提示。

### 第三批：结构性债务（认真做一次，长期受益）
9. **三端单一 source**：这是本仓库反复出现"修一端漏两端"的根因（本次 4 个 bug 有 3 个就是三份拷贝漂移造成的）。建议以 web/index.html 为 canonical，用一个 Node 构建脚本按平台注入差异（标题、导入入口），产出另外两份。改动前先跑通一次生成对比，确保零行为差异。
10. **背单词对齐**：README 宣传 SM-2 背单词，实际代码只在 Android 版存在（84 处 vs web/Mac 各 2 处痕迹）。二选一：移植进 canonical source，或宣传语标注"Android 版专属"。

### 顺手修的小项
- 章节正则 `[\s.、]?` 的 `?` 导致 "Chapters of life..." 正文被当章节名，去掉 `?`
- `detectType`（≤5词=phrase）与 `addCurrentSentenceToBook`（>1词=sentence）判定矛盾，统一前者
- 删除当前书后 `emptyState.style.display='flex'` 与他处 'block' 不一致
- web 版欢迎页残留桌面版"放入 books/ 文件夹"文案
- app.py L586 realpath 前缀检查缺 `os.sep`（upload 处已正确）
- 死代码：`state.pendingTranslate`、`addCurrentWordToBook/addCurrentSentenceToBook` 无调用方
- CSP meta 缺失（注意：加白名单会限制自定义 provider 域名，需权衡后再上）

### 产品功能方向（供决策，非缺陷）
- **查词带上下文**：把单词所在原句一起发给模型（`entry.sentence` 字段已有，只差传出去），一词多义判断准确率明显提升
- **流式输出**：详细释义要等 5-10 秒，ReadableStream 打字机效果砍掉等待感
- **导出 CSV/Anki**：词汇数据是用户资产，也是换浏览器丢数据的补偿手段
- **词形还原高亮**：存了 look，文中 looked/looking 也应高亮，简单后缀规则覆盖大半场景
- 书内搜索（⌘F 自实现）、阅读统计、跟随系统深浅色

---

## C. 给 Codex 的审阅请求
1. 审 `4935026` 的四处 diff 是否符合实现标准；
2. app.py 用 api_base 子串判 Anthropic 是否够稳？（更稳方案：config 显式 provider 字段，但涉及 schema 变更，本次为最小侵入未采用）；
3. B 清单的批次划分和顺序，给出你的意见；
4. 发现本次修复引入问题，直接指出或在 GitHub 回滚 `4935026`。
