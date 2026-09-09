# 务思语三端升级交付状态（2026-09-09）

## 已完成

- Web、Mac、Windows 共用单词本、复习规则、阅读位置、阅读设置和备份核心。
- JSON 轻量备份与可选书籍的 ZIP 完整备份已实现；删除标记可防止旧数据复活，API Key 不进入备份。
- 背单词已支持只显示到期内容、每日计划、单词/词组、忘了/模糊/记得、记错了、上一词纠正、困难词和统计。
- 阅读器已支持目录跳转、进度、分页/滚动、宽屏双栏、页边距和段落间距。
- Mac、Windows、Web 的新版本提示已收口，Windows 下载指向最新 Release。
- 共享测试：23 个 Node 测试和 17 个 Python 测试通过。
- Mac 1.6.0 已打包、校验、安装并真实启动，版本接口返回 1.6.0。
- Windows GitHub Actions `34320455887` 已通过共享测试、PyInstaller 构建、后端真实启动冒烟和 NSIS 安装包构建。
- GitHub `main` 已更新到 `e881377`，`gh-pages` 已更新到 `ecdbde1`，线上页面与正式 Web 源文件逐字一致。
- v1.6.0 Release 已上传新 Mac DMG 和 Windows EXE，GitHub 附件摘要与本地 SHA256 一致。

## 下载与验收

- 公开 Web：<https://hunterhao0127.github.io/wusiyu/>
- 安装包：<https://github.com/hunterhao0127/wusiyu/releases/tag/v1.6.0>
- Windows/Hermes 真机验收：[WINDOWS_FOLLOWUP.md](WINDOWS_FOLLOWUP.md)

## 仍需 Windows 真机确认

- Windows Defender/SmartScreen 表现。
- 安装、卸载、快捷方式、中文路径和 1.5.5 覆盖升级。
- Windows 界面真实操作以及与 Mac/Web 双向导入。

上述项目无法在 Mac 或 GitHub 云端完全代替，在真机证据返回前，不声称“Windows 真机验证完成”。
