# 务思语 · 交接文档：P0 修复已完成 + 后续改进路线

> 执行：ox-alpha（Hermes Agent）　日期：2026-08-24
> 交付：commit `4935026`（P0 修复）→ Codex 复审 → **`<本轮>`（复审问题修复）**（均已在 main）
> **给 Codex：本文档自足，读完即可接手，无需其他上下文。**

---

## ⭐ 第二轮：Codex 复审问题已修复（本轮提交）

Codex 审出两个问题，均已修复并升级验证：

### R1（P1，Codex Finding-1，成立）Anthropic 分支消息结构错误
- **问题**：上轮只改了传输层（URL/headers），仍把 OpenAI 风格 `[system, user]` 数组原样发给 Anthropic。Messages API 要求 system prompt 放顶层 `system` 字段，messages 只留 user/assistant——真实 API 会 400。当时的"格式校验全过"只断言了 URL/headers，未查 body 结构，**结论下早了，已纠正**。
- **修复**：三处分支（web / Android / app.py）都增加 system 提取——`system` 拼接为顶层字段，`messages` 过滤掉 system 轮次。
- **验证（这次查的是 body 结构）**：
  - app.py 行为验证 10/10 PASS：A 组（provider=claude 触发）断言顶层 system 内容正确、messages 无 system role 且只剩 user；B 组（无 provider、代理域名含 anthropic 子串兜底）同样正确提取；C 组 DeepSeek 回归确认 system 留在 messages 内、无顶层泄漏。
  - 浏览器实测 web 版真实调用路径 `translateWord('hello','simple')`：url=/v1/messages ✓ 顶层 system 含词典提示词 ✓ messagesRoles=["user"] ✓ 返回解析正常 ✓。

### R2（P2，Codex Finding-2，采纳）协议判定改用 provider 字段优先
- **修复**：app.py 判定改为 `config.get("provider") == "claude" or "anthropic" in api_base.lower()`——provider 显式优先，子串仅作兜底（覆盖代理域名场景）；Mac 前端 `/api/config/test` 请求补传 `provider` 字段（配置 schema 本就有该字段，非破坏性变更）。
- **遗留说明**：若用户选 provider=openai 但自定义网关域名恰好含 "anthropic" 字样，子串兜底仍会命中 Anthropic 分支。这是兜底的固有取舍，评估真实概率极低，未再叠加复杂度；如要彻底消除需引入显式 protocol 字段（schema 变更），留给后续决策。

### B 清单顺序已按审查意见调整（见下文 B 节）：句子转义提到第一位，quota 保护先于翻译缓存，resize 先于 TTS。

---

## A. 已完成的工作

### A1. 四个 P0 修复（三端核对，逐条实测）

| # | Bug | 根因 | 修复 | 涉及文件 |
|---|-----|------|------|---------|
| 1 | 示例书章节跳错位 | chapters 写 start:7/11，实际索引是 8/12 | 改为 8/12 | web、Android |
| 2 | Claude 供应商连不通 | 按 OpenAI 协议调 Anthropic | web/Android：`callDeepSeek` 加原生分支（/v1/messages + x-api-key + anthropic-version + 浏览器直调头 + system 提取）；桌面版：app.py 按 provider/api_base 自动识别（含 system 提取） | web、Android、02-Mac版/flask-app/app.py |
| 3 | don't 类词条删不掉 | id 含撇号打断行内 onclick | data-del-id + 事件委托 | web、Android |
| 4 | 拖拽覆盖层永不显示 | dropOverlay 嵌在 settings-panel 内继承 opacity:0 | 移至 body 层级 | web、Android、Mac static |

### A2. 验证证据
- `node --check` 三份内联 JS ✓；`py_compile` app.py ✓
- 真实 Chromium 实测：章节跳转落位、overlay 结构、撇号词条增删、翻页回归 —— 全过
- Claude 链路双层验证：app.py mock 断言 10/10（含 body 结构）+ 浏览器拦截 fetch 实测真实调用路径（URL/headers/body 结构/响应解析）。**均为 mock 网络，未打真实 Anthropic API**；上线前建议用真实 key 做一次端到端冒烟。
- Mac 本地打包：`releases/wusiyu-P0修复-*.zip`

### A3. Windows 安装包状态
本机无法构建（缺 dist/务思语-win32-x64 与 flask-app/务思语.exe）。Windows 机重建步骤见 `docs/WINDOWS_FOLLOWUP.md`；要点：**必须重新打 flask-app 后端**（Claude 修复在 app.py），static 用仓库最新版。版本号已是 1.5.5 无需动。

---

## B. 后续改进路线（已按 Codex 复审意见重排）

### 第一批：安全与快赢
1. **句子翻译转义**（安全，原第2位提至第1）：`translateSelection()` AI 返回内容未 escapeHtml 直接 innerHTML。1 行。
2. **fetch 超时**：`callDeepSeek` 加 AbortController（60s）。约 15 行。
3. **quota 保护**（原第8位提前）：saveWordbook 的 setItem 配额溢出静默失败，try/catch + 提示。翻译缓存依赖它。
4. **翻译缓存**：localStorage LRU ~500 条，key=`provider|model|word|mode`。

### 第二批：稳定性
5. **跳页异步化**：buildPageIndexTo 同步串行渲染冻结 UI，改 rAF 分片+进度提示+超界快速拒绝。
6. **resize 页码失效**（原在 TTS 之后，按意见提前）：resize 后重建 pageStarts/pageEnds。
7. **单词本内存缓存**：每段落渲染 JSON.parse 全量单词本 → 模块级缓存。

### 第三批：体验增强
8. **TTS 发音**：speechSynthesis，Android WebView 需插件兜底。（体验项，按意见排在稳定性之后）
9. **背单词对齐**：SM-2 仅 Android 有（84 处 vs 其余各 2 处），移植进 canonical source 或宣传语标注 Android 专属。

### 结构性债务（认真做一次，长期受益）
10. **三端单一 source**：本次 4 bug 中 3 个源于三份拷贝漂移。以 web 版为 canonical，Node 构建脚本注入平台差异生成另外两份。

### 顺手修的小项
- 章节正则 `[\s.、]?` 的 `?` 导致 "Chapters..." 正文误判，去掉 `?`
- detectType 与 addCurrentSentenceToBook 类型判定矛盾，统一前者
- 删除当前书后 emptyState display 'flex'/'block' 不一致；web 版欢迎页残留 books/ 文案
- app.py realpath 前缀检查缺 os.sep（upload 处已正确）；死代码清理；CSP 权衡后再上

### 产品功能方向（供决策，非缺陷）
- 查词带上下文原句（entry.sentence 已有只差传出）、流式输出、导出 CSV/Anki、词形还原高亮、书内搜索、阅读统计

---

## C. 给 Codex 的审阅请求
1. ~~审 `4935026`~~ → **已完成，两处 finding 均有效并已修复（见顶部第二轮）**；
2. 请复审本轮提交：重点验 system 提取逻辑与 provider 判定路径；
3. B 清单重排后如仍有异议请指出；
4. D 组边界情况（provider=openai + 域名含 anthropic 子串走兜底）的取舍是否接受，或建议引入显式 protocol 字段。
