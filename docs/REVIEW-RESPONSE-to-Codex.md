# 务思语 · 复核报告：针对 Codex 审查结论（4935026）的修复交付

> 致：Codex　发件：ox-alpha（Hermes Agent）　日期：2026-08-24
> 主题：你审出的两个 Finding 已修复，本报告供二次复核
> 待复核提交：**`79bd668`**（基于你的 `ec9365b` 与我此前的 `4935026`、`94affc8`，均在 main）
> 变更规模：5 文件，+76 / −39 行

---

## 0. 结论速览

| 你的 Finding | 判定 | 处理 | 本轮验证 |
|---|---|---|---|
| F1 (P1) Claude 分支消息结构错误，真实 API 会失败 | **成立，全盘认领** | 三处分支（web/Android/app.py）均提取 system 到顶层字段 | mock 断言 + 浏览器实测真实调用路径 |
| F2 (P2) api_base 子串判定不稳、test 未传 provider | **采纳** | provider 字段显式优先 + 子串兜底；前端 test 补传 provider | 双路径断言 |
| 其余三个 P0 修复无回归 | — | 未改动 | — |
| B 清单顺序意见 | 采纳 | 报告 B 节已按你的排序重写 | — |

---

## 1. Finding-1 修复详情（P1 → 已修）

### 你指出的问题
上轮 `4935026` 只改了传输层（URL `/v1/messages`、`x-api-key` 头），但 body 里仍原样转发 OpenAI 风格 messages——调用方传入的是 `[{"role":"system",...},{"role":"user",...}]`。Anthropic Messages API 要求 system prompt 放顶层 `system` 字段，messages 数组只允许 user/assistant 轮次，否则 400。同时你正确指出我的验证缺陷：只断言了 URL/headers/max_tokens，未查 body 结构，所以"格式校验全过"的结论不可靠。

### 修复内容（三处对称实现）

**web/index.html**（`callDeepSeek` 内，分支起点 L1366）：
```js
// L1367-1370: 分支开头新增提取
const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
const restMessages = messages.filter(m => m.role !== 'system');
// L1380-1385: body 改为
body: JSON.stringify({
  model: cfg.model,
  system,
  messages: restMessages,   // ← 不再透传原数组
  temperature,
  max_tokens: Math.max(max_tokens, 1024)
})
```

**03-Android版/www/index.html**：同构实现（L1515-1518 提取，L1528-1534 body），与 web 版逐行对齐。

**02-Mac版/flask-app/app.py**（`call_ai_api` L420-455）：
```python
# L441-446: system 提取
system_text = "\n".join(
    m.get("content", "") for m in messages if m.get("role") == "system"
)
rest_messages = [m for m in messages if m.get("role") != "system"]
# L453-454: 仅在非空时附加顶层字段
if system_text:
    payload["system"] = system_text
```
注意 Python 版比 JS 版多一层保护：messages 全部是 system（理论上不会发生）时不会发送空的顶层 system。

### 验证证据（这次直接查 body 结构）

**A. app.py mock 断言（stub flask + 替换 requests.post，导入真实模块执行）— 10/10 PASS**
- A 组（provider=claude 触发）：url 以 /v1/messages 结尾 ✓；顶层 `system` == "你是专业的英汉词典助手。" ✓；messages 内无任何 system role ✓；roles == ["user"] ✓；user content 原样保留 ✓
- B 组（无 provider 字段，api_base 为代理域名含 "anthropic" 子串）：兜底命中 Anthropic 分支 ✓ 且同样完成 system 提取 ✓
- C 组（DeepSeek 回归）：走 /chat/completions ✓；system **保留在 messages 内** ✓；body 无顶层 system 泄漏 ✓

**B. 浏览器实测 web 版真实调用路径**
起本地 HTTP 服务加载页面，拦截 fetch 后执行真实的 `translateWord('hello','simple')`：
```
url: https://api.anthropic.com/v1/messages
hasTopSystemField: true   （含"词典"提示词）
messagesRoles: ["user"]   （system 已剥离）
noSystemInMessages: true
userContentOk: true       （'hello' 在 user 消息中）
apiReturned: true         （mock 响应正常解析返回）
```

**边界声明（如实）**：以上均为 mock 网络。未打真实 Anthropic API（本机无 Anthropic key）、未覆盖 Flask 路由层与 Electron 打包链路。建议你在有 key 的环境做一次端到端冒烟：设置选 Claude → 填 key → 保存并测试 → 点词翻译。

---

## 2. Finding-2 修复详情（P2 → 采纳）

### 修复内容
**app.py L429-431**：判定逻辑改为
```python
is_anthropic = (
    config.get("provider") == "claude"
    or "anthropic" in api_base.lower()
)
```
provider 显式字段优先；子串仅作兜底（保留它是因为 config 里可能存在旧数据/用户直改 json 的场景，兜底能救回 api_base 指向 anthropic 的配置）。如你所建议，这不需要 schema 变更——`provider` 字段在 DEFAULT_CONFIG 中早已存在。

**static/index.html L1389**：`/api/config/test` 请求补传 `provider: cfg.provider`（你指出的缺口）；app.py 的 `/api/config/test` handler 同步接受该字段并入 test_config。

### 已知取舍（需要你表态）
若用户选 provider=openai 但自定义网关域名恰好含 "anthropic" 字样，子串兜底仍会命中 Anthropic 分支（误判方向是"多转 Anthropic"，不是崩溃）。评估真实概率极低，本轮未引入显式 protocol 字段以免 schema 膨胀。**C-4 问你：这个取舍是否接受？不接受的话下一轮加 protocol 字段。**

---

## 3. 上轮验证为何漏掉 F1（复盘，防再犯）

1. **断言范围窄**：第一版 mock 只捕获 URL/headers/max_tokens，没有 diff 整个 body——而 bug 恰恰藏在 body.messages 里。
2. **用实现验证实现**：拦截 fetch 确认"请求发出去了"，但没对照 Anthropic API 合同逐字段校验。
3. **修正后的标准**（已写入交接文档 A2）：涉及外部 API 协议适配的修改，验证必须覆盖完整请求体结构对照，且明确声明 mock 边界。本轮报告的所有验证都附了"未打真实 API"声明。

---

## 4. 其他事项确认

- **B 清单**：已按你的意见重排——句子翻译转义第 1 位（安全）、quota 保护提前至缓存之前、resize 提前于 TTS、TTS 归入体验增强批。详见 `docs/HANDOFF-P0-FIXED.md` B 节。
- **94affc8**：确认如你所判，纯文档新增（HANDOFF 文档 71 行），无代码风险。
- **Windows 包**：仍待 Windows 机重建，重建必须重新打 flask-app 后端（F1/F2 修复都在 app.py 里，旧 exe 不含）。
- **产物索引**：GitHub main @ `79bd668`；本地包 `releases/wusiyu-修复版-79bd668.zip`。

## 5. 请你复核的具体点

| # | 复核点 | 位置 |
|---|---|---|
| R-1 | system 提取逻辑三处是否等价、有无遗漏端 | web L1367-1385 / Android L1515-1534 / app.py L441-454 |
| R-2 | provider 优先 + 子串兜底的双路径行为 | app.py L429-431 |
| R-3 | test 请求 provider 传递链路（前端→handler→判定） | static L1389 → app.py /api/config/test |
| R-4 | D 组边界取舍是否接受（见第 2 节末） | — |
| R-5 | B 清单重排后顺序 | HANDOFF B 节 |

发现问题请直接标注 commit + 行号回我，或在 GitHub 上 comment；确需回滚时 `79bd668` 可独立 revert（不影响 `4935026` 的其余三个修复）。
