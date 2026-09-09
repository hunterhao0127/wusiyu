# 务思语 1.6.0 Windows 构建与真机验收（给 Windows Hermes）

目标：从 GitHub `main` 构建 Windows x64 安装包，并在真实 Windows 电脑上验证安装、升级、数据保留和核心功能。共享源码已经由 Mac/Web 验证；Windows 端只做平台构建和真机验收，不重新实现业务逻辑。

## 1. 准备环境

安装以下 64 位工具：

- Git
- Python 3.11（安装时勾选 `Add Python to PATH`）
- Node.js 20 LTS
- PowerShell 5.1 或 7

在 PowerShell 中执行并保留输出：

```powershell
git --version
python --version
node --version
npm --version
```

完成标准：Python 显示 3.11.x，Node 显示 20.x，四条命令均退出成功。

## 2. 获取唯一源码

```powershell
cd $HOME\Desktop
git clone https://github.com/hunterhao0127/wusiyu.git
cd wusiyu
git switch main
git pull --ff-only
git status --short
```

完成标准：最后一条没有输出。不要从 Mac 复制 `wusiyu_backend`；Windows 必须从同一份 `02-Mac版/flask-app/app.py` 生成 `.exe`。

## 3. 先跑共享检查

```powershell
node scripts/prepare-shared-assets.mjs --check
node --test tests/shared/*.test.mjs
python -m unittest tests/test_release_contracts.py
node tests/test_mac_update_helpers.js
```

完成标准：共享文件一致，Node/Python 测试全部通过，最后显示 `Desktop update and shared backend helpers: OK`。任何一项失败都先停止打包并记录完整输出。

## 4. 构建并冒烟测试 Windows 后端

```powershell
python -m pip install -r "02-Mac版/flask-app/requirements.txt" pyinstaller
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-backend.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-windows-backend.ps1 -BackendPath "01-Windows版/backend/wusiyu_backend.exe"
```

完成标准：存在 `01-Windows版/backend/wusiyu_backend.exe`，并显示 `Windows backend smoke test: OK`。这一步已检查版本接口、书库接口、同步记录往返和“学习数据 + 书籍”ZIP 导出。

## 5. 生成安装包

```powershell
cd "01-Windows版"
npm ci
npm run dist
Get-ChildItem .\dist\*.exe | Select-Object FullName,Length,LastWriteTime
Get-FileHash .\dist\*.exe -Algorithm SHA256
cd ..
```

完成标准：`01-Windows版/dist` 中出现新的 x64 NSIS 安装程序，记录文件名、大小、时间和 SHA256。

也可在 GitHub 的 `Actions → Windows build and smoke test → Run workflow` 触发云端构建；成功后下载 `wusiyu-windows` artifact。云端成功只证明构建和后端冒烟通过，不能替代下面的真机验收。

## 6. Windows Defender 与安装

先右键安装包选择“使用 Microsoft Defender 扫描”，或以管理员 PowerShell 执行：

```powershell
Start-MpScan -ScanType CustomScan -ScanPath "安装包的完整路径"
Get-MpThreatDetection
```

然后安装两次：

1. 默认路径安装，确认桌面和开始菜单均出现“务思语”。
2. 卸载后改用含中文的路径，例如 `C:\软件测试\务思语`，再次安装并启动。

完成标准：Defender 无新增威胁；安装、卸载无报错；两个快捷方式都能启动；中文路径可启动。未签名安装包可能出现 SmartScreen 提示，应如实记录提示内容，不能把提示写成“病毒”。

## 7. 核心功能真机验收

启动务思语后逐项操作并截图：

1. 导入 TXT 和 EPUB 各一本，关闭再启动，书籍仍存在。
2. 打开章节目录并跳转；翻下一页，进度条变化。
3. 在设置中切换“滚动”，按 `End` 后进度增加；切回“翻页”。
4. 开启“宽屏双栏”，确认宽窗口显示两栏；缩窄窗口后自动回到一栏。
5. 修改页面边距和段落间距，重启后数值仍保留。
6. 点击一个单词加入单词本；再选中一个词组加入词组本。
7. 打开“复习”，正面只能看到单词/词组，不能提前看到中文释义。
8. 分别使用“忘了、模糊、记得”；评分后才显示释义、例句和详细释义入口。
9. 对当前卡片点“记错了”，确认评分改为“忘了”；点“上一词”并重新评分。
10. 把每日新词改为 7，重启后仍为 7；检查今日完成、记忆率、连续天数、7 天到期和困难词。

完成标准：十项均得到真实界面证据；AI 真实翻译需要用户自己的 API Key，Key 只填在本机，不写进报告或备份。

## 8. Mac/Web/Windows 互导验收

准备一份由 Mac 或 Web 导出的 1.6.0 备份：

1. 导入仅学习数据的 JSON，确认单词本、评分、阅读设置恢复。
2. 导入勾选书籍后的 ZIP，确认书籍与阅读位置一起恢复。
3. 删除一个单词，再次导入较旧备份，确认该词不会复活。
4. 在 Windows 新增一个词并改变阅读位置，分别导出 JSON 和含书 ZIP。
5. 把 Windows 导出文件交回 Mac/Web 导入，确认书籍、单词本和阅读位置恢复。
6. 用文本编辑器搜索导出文件，确认不存在真实 API Key。

完成标准：双向导入成功、删除标记有效、API Key 不进入备份。记录导入文件名和每端恢复数量。

## 9. 覆盖升级与数据保留

若机器上有 1.5.5：先在旧版导入一本书、加入一个单词并翻到非第一页；不卸载旧版，直接运行 1.6.0 安装包覆盖安装。

完成标准：升级后版本为 1.6.0；旧书、单词和阅读位置仍在；新复习入口与新阅读设置出现。若旧数据未保留，立即停止发布并保留 `%APPDATA%` 下相关目录，不要反复安装覆盖现场。

## 10. 新版本提示

1. 1.6.0 首次启动不应错误提示“发现新版本 1.6.0”。
2. 后续 GitHub `version.json` 高于本机版本时，启动后应显示“发现务思语新版本”，点“立即下载”只能打开 `github.com/hunterhao0127/wusiyu` 的 Release 地址。

完成标准：同版本无误报；下一版本发布时补做真实弹窗与下载跳转截图。本次若线上仍为 1.6.0，只能记录“更新比较代码与自动测试通过，等待下一版本做真实弹窗”，不能虚报已看到未来版本。

## 11. 交付报告

向 Mac 端返回：

- 安装包完整文件名、大小、SHA256。
- Windows 版本和测试机器版本。
- 第 3～10 节每项“通过/失败/未测”。
- Defender、SmartScreen、快捷方式、中文路径、覆盖升级的截图。
- 失败项的原始错误、复现步骤和日志位置。

只有构建检查、真机核心功能、互导、覆盖升级和 Defender 全部通过，才可写“Windows 验证完成”。
