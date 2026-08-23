# 务思语多端修改经验记录

这份文档给以后接手 Web、Mac、Windows、Android 任一版本时先读，避免同一个问题在不同端反复发现、反复修。

## 总原则

- 先确认目标端实际用的是哪份前端。Windows 可能只是外壳，真正页面可能来自打包进去的 Flask 静态文件；不要没确认就新建第二份页面。
- 遇到阅读器、分页、标注、书籍解析、单词本这类同源问题，要同时搜索 Web、Mac、Android、Windows 的入口文件，先评估能不能迁移已有修复。
- 非当前目标端不要随手大改。Windows 安装包、快捷方式、exe 启动、覆盖更新必须在 Windows 电脑上验证。
- 推送前至少做三件事：语法检查、常见 API Key/token 扫描、确认 GitHub Pages 试用网址不变。

## 已修过的问题和复用方式

### 1. 符号乱码

症状：英文引号、破折号、省略号显示成乱码或问号。

处理方式：优先修文件读取和解码流程，覆盖 UTF-8、UTF-16、GBK/GB18030 等来源，不要只在显示层替换乱码字符。

### 2. 分段、分页和页码跳转

症状：页面显示成一大段，页码不跟着内容变，跳页突然跳到奇怪位置。

处理方式：先把书拆成 `blocks`，再用 `pageStarts` / `pageEnds` 生成分页。页码显示、上一页下一页、跳转输入、阅读位置保存都必须来自同一套分页状态。

### 3. 图片保留

症状：EPUB、HTML、DOCX 里的图片丢失或位置错乱。

处理方式：图片作为独立 block 保留顺序和占位，不要只抽纯文本。

### 4. 文件损坏或扩展名不匹配

症状：导入或打开 EPUB/DOCX/PDF 时出现 `incorrect header check`、`decompressing data` 这类底层英文压缩错误。

处理方式：导入时先检查文件头。EPUB/DOCX 必须是 ZIP 头 `PK`，PDF 必须是 `%PDF`。不合法时直接拒绝导入，并删除刚保存的坏文件；打开旧书时也要把底层错误翻译成中文提示。

### 5. 标注下划线断裂

症状：`g/y/p` 这类下伸字母会把下划线视觉切断，或者词组跨多个 span 时线断开。

处理方式：优先使用统一的标注样式，并设置 `text-decoration-skip-ink: none`。如果以后要继续强化，再考虑按整段范围渲染标注，避免一个标注被拆成多个孤立 span。

### 6. 背单词功能

症状：旧背单词功能流程不成熟，按钮不自动进入下一个，复习间隔不专业，干扰主阅读体验。

处理方式：当前 Web 和 Mac 已先删除背单词入口、覆盖层、评分按钮和旧调度逻辑。单词本只保留收藏、查看、删除和原文标注。以后如果要重做，流程应是：先显示单词，点击后显示释义，再可选详细解释，评分后自动下一个，复习间隔采用 SM-2 或同等级成熟算法。

### 7. API 和隐私提示

症状：用户不敢填 API Key，担心上传到服务器。

处理方式：网页端必须明确说明：书籍、API Key、单词本、阅读记录保存在本地浏览器或本机应用数据目录；GitHub Pages 只托管网页程序本身。

### 8. Mac 阅读位置保存

症状：Mac 版重启后从第一页开始。

处理方式：Mac 后端增加 `reading_history.json`，前端打开书时先读 `/api/reading-history/<filename>`，保存时同时写后端和 localStorage 兜底。这样重新打开 App 也能恢复到上次阅读位置。

### 9. Mac 打包顺序

Mac 静态页面或 Flask 后端改完后，不能只改源码。需要先重新打包 `flask-app/dist/wusiyu_backend`，再用 Electron 生成 `.dmg`，最后覆盖 GitHub Release 附件。

顺序：

1. 测网页或本地页面。
2. 重新打包 PyInstaller 后端。
3. 重新生成 Mac `.dmg`。
4. 替换桌面已安装 App。
5. 提交 GitHub 源码。
6. 替换 Release 下载包。

### 10. GitHub Pages 试用网址

当前试用网址是：

`https://hunterhao0127.github.io/wusiyu/`

GitHub Pages 发布源是 `gh-pages` 分支根目录。同步网页时更新 `gh-pages/index.html`，不要改 Pages 设置、仓库名或链接路径。

## 各端入口

- Web 源码：`web/index.html`
- GitHub Pages 线上试用：`gh-pages` 分支的 `index.html`
- Mac 前端：`02-Mac版/flask-app/static/index.html`
- Mac 后端：`02-Mac版/flask-app/app.py`
- Android 前端：`03-Android版/www/index.html`
- Windows 跟进说明：`docs/WINDOWS_FOLLOWUP.md`

## Windows 电脑接手时先做

1. 先读 `docs/WINDOWS_FOLLOWUP.md`。
2. 确认 `01-Windows版` 是否有实际打包进去的 `flask-app/static/index.html`。
3. 如果 Windows 复用 Flask 前端，优先同步 Mac/Web 已经验证过的阅读器修复。
4. 在 Windows 上验证安装包、桌面快捷方式、开始菜单、覆盖更新、数据保留、连续启动稳定性。
