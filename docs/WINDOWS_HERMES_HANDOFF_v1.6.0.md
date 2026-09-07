# 给 Windows 电脑 Hermes 的 v1.6.0 修改与验收说明

## 任务目标

从 GitHub 仓库最新的 v1.6.0 Mac/Web 源码接续，完成 Windows 版的源码同步、后端构建、Electron 打包和 Windows 真机验收。不要从旧的 Windows `flask-app` 或旧 exe 反向恢复源码。

## 开始前必须确认

1. 拉取最新默认分支，确认存在：
   - `02-Mac版/flask-app/app.py`
   - `02-Mac版/flask-app/static/index.html`
   - `web/version.json`
   - `tests/test_release_contracts.py`
2. 运行 `python -m unittest discover -s tests -v`，应全部通过。
3. 不覆盖 Mac 和 Web 已完成的修改；Windows 只做平台适配。
4. 开始修改前记录当前 commit，最终报告中写明从哪个 commit 开始。

## 当前 Windows 源码问题

- `01-Windows版/package.json` 仍是 1.5.2，且打包要求的 `flask-app` 在源码中不存在。
- `01-Windows版/main.js` 没有传入 `WUSIYU_DATA_DIR`，用户数据存放位置不稳定。
- Windows 启动失败时直接退出，用户看不到原因和重试入口。
- `install_electron.py` 是另一套旧安装器，只明确保留安装目录里的 `books` 和 `config.json`；v1.6.0 改用系统用户数据目录后，不应再依赖这种跳过复制逻辑保护数据。
- 当前没有 Windows 的可重复后端构建脚本。

## 逐文件修改要求

### 1. `01-Windows版/package.json`

- 版本号改为 `1.6.0`。
- 保留 Electron Builder 的 NSIS x64 目标。
- 明确设置 GitHub publish 仓库为 `hunterhao0127/wusiyu`，但本轮只用自定义 `version.json` 提醒，不接入后台自动安装。
- `extraResources` 必须仅打包脚本生成的 `flask-app/务思语.exe`，不得将 API Key、用户书籍或历史记录打入安装包。

### 2. `01-Windows版/main.js`

- `SERVER_URL` 统一为 `http://127.0.0.1:5980`，不混用 `localhost`。
- 启动后端时增加：

```js
env: {
  ...process.env,
  WUSIYU_ELECTRON: '1',
  WUSIYU_DATA_DIR: app.getPath('userData')
}
```

- 启动失败弹框显示“本地阅读服务未能启动”，提供“重试/退出”，不得静默退出。
- 从 `https://hunterhao0127.github.io/wusiyu/version.json` 检查更新，24 小时内最多检查一次。
- 当远端版本高于 `app.getVersion()` 时，显示更新内容，用户点击后打开 `downloads.windows`。
- Mac/Web 先发布时，`downloads.windows` 暂指向 v1.5.5；Windows v1.6.0 安装包真机验收并上传后，再将它改为 v1.6.0 Release 地址。
- 只允许打开 `https://github.com/hunterhao0127/wusiyu/` 路径下的下载链接，拒绝任意外部 URL。
- 保留单实例锁，第二次打开时聚焦已有窗口。

Mac 版 `02-Mac版/main.js` 中已有可参考的 `isNewerVersion`、`safeDownloadUrl`、`checkForUpdates` 和启动失败处理。复用这些小函数，但下载字段改为 `downloads.windows`。

### 3. Windows 后端构建输入

- 唯一可信后端源码是 `02-Mac版/flask-app/app.py` 和其 `static/`。这里的“Mac版”只是历史目录名，Flask 代码本身是共享后端。
- 新增 `01-Windows版/build-windows.ps1`，由脚本在构建时临时生成 `flask-app/务思语.exe`。
- 使用 Windows Python 安装 `02-Mac版/flask-app/requirements.txt` 和 PyInstaller。
- PyInstaller 要包含 `02-Mac版/flask-app/static` 到目标 `static`，生成无控制台的 `务思语.exe`。
- 不将生成的 exe、`flask-app`、`node_modules`、`dist` 或 `build` 提交到 Git。
- 后端完成后执行 `npm ci` 和 `npm run dist`生成 NSIS x64 安装包。

### 4. 学习数据备份

- Windows 加载的页面必须与 `02-Mac版/flask-app/static/index.html` 来自同一份源码，不单独再写备份功能。
- 导出包含单词本、复习记录、阅读进度和显示设置，不包含 API Key 和书籍原文件。
- 在 Windows 上实际导出一份 JSON，搜索确认不存在真实 API Key；然后清空一个临时测试词条并导入，确认能恢复。

### 5. `install_electron.py`

- 如果继续发布这套安装器，版本号改为 `1.6.0`，并删除“靠跳过安装目录内 books/config 来保数据”的依赖。
- 更推荐只保留 Electron Builder 生成的 NSIS 安装包，停止维护第二套自制安装器。
- 不要同时发布两个名称相似但更新逻辑不同的 Windows 安装包。

## Windows 真机验收清单

### 安装前

- 运行 Python 回归测试，全部通过。
- `flask-app/务思语.exe` 存在，且打包时间晚于最新 `app.py` 和 `static/index.html`。
- 检查安装包内没有 `config.json`、`reading_history.json`、用户书籍和 API Key。

### 新安装

- 新机器/新 Windows 用户首次安装能打开。
- 桌面快捷方式和开始菜单快捷方式正常。
- 设置页显示“导出备份/导入备份”。
- 导入 TXT、EPUB、PDF、DOCX 和 HTML 测试文件。

### 覆盖更新

1. 先在 v1.5.x 导入一本书，配置临时测试 Key，加入两个单词，阅读到非首页。
2. 安装 v1.6.0 覆盖更新。
3. 确认书籍、Key、单词本和阅读位置都仍存在。
4. 确认用户数据实际位于 Electron `userData` 目录，不位于安装目录。

### 启动与端口

- 连续启动/退出 5 次，不白屏，不残留后端进程。
- 重复点击快捷方式只保留一个窗口。
- 先占用 5980 端口再启动，必须出现“重试/退出”错误提示，不能静默退出。

### AI 真实请求

- DeepSeek/OpenAI 兼容服务连接测试和真实短查词各执行一次。
- Claude 连接测试和真实短查词各执行一次；请求必须走 `/v1/messages`，不得走 `/chat/completions`。
- 错误 Key、断网和请求超时时，页面显示可理解错误，不崩溃。

### 更新提醒

- 临时使用比当前版本高的测试版本源，确认出现更新弹框和更新内容。
- 点击“立即下载”只能打开官方 GitHub 仓库的 Release 页。
- 断网后启动仍能正常阅读。

## Hermes 交付内容

- Windows 修改 commit 和变更文件清单。
- 回归测试完整输出。
- Windows 后端 exe 和 NSIS 安装包的 SHA256。
- 新安装、覆盖升级、启动 5 次、端口占用、数据保留、更新提醒和真实 Claude 请求的结果。
- 安装包截图和更新后用户数据仍存在的截图。
- 任何未完成项必须明确写“未验证”，不能用静态检查代替真机结果。
