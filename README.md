# 📖 务思语 — 英语沉浸阅读器

> 一个支持 **Windows / macOS / Android / 网页版** 四端的英语阅读器，内置 AI 翻译、单词本、背单词记忆曲线，让英语阅读像微信一样轻快自然。

[![🚀 在线体验网页版（点击直达）](https://img.shields.io/badge/%F0%9F%9A%80_%E5%9C%A8%E7%BA%BF%E4%BD%93%E9%AA%8C_%E7%BD%91%E9%A1%B5%E7%89%88-%E7%82%B9%E5%87%BB%E7%9B%B4%E8%BE%BE-2ea44f?style=for-the-badge)](https://hunterhao0127.github.io/wusiyu/)

![version](https://img.shields.io/badge/version-1.5.5-blue)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Android%20%7C%20Web-green)
![license](https://img.shields.io/badge/license-MIT-orange)

---

## 🚀 快速下载 / 安装

| 使用方式 | 入口 | 适合 |
|---------|------|------|
| 网页版 | [在线打开](https://hunterhao0127.github.io/wusiyu/) | 不想安装，直接体验 |
| macOS 版 | [Releases 下载页](https://github.com/hunterhao0127/wusiyu/releases) | 想安装为 Mac 原生窗口应用 |
| 源码包 | [Download ZIP](https://github.com/hunterhao0127/wusiyu/archive/refs/heads/main.zip) | 想自己构建或二次开发 |

macOS 源码构建：

```bash
cd 02-Mac版
bash build-mac.sh
```

构建完成后，安装包在 `dist/务思语-1.5.5-arm64.dmg`。仓库不提交 `.dmg`、书籍、API Key、单词本和阅读历史；这些都只保存在用户本机。

---

## 🌐 网页版（无需安装，任何设备直接访问）

> 浏览器打开即用：`https://hunterhao0127.github.io/wusiyu/`

- 手机 / 平板 / 电脑浏览器直接访问，**无需安装任何 App**
- 支持 TXT · EPUB · PDF · DOCX · HTML 导入
- 🔒 **隐私保障**：你的书籍、API Key、单词本、背单词记录**只存在你自己的浏览器里**（IndexedDB / localStorage），
  - 不上传任何服务器，GitHub 只托管网页程序本身
  - API Key 由你的浏览器**直接发送给你选择的 AI 厂商**（DeepSeek / 千问 / OpenAI / Gemini / Claude / Kimi / 智谱 / 自定义），任何人（包括站长）都看不到
  - 换浏览器或清除浏览器数据后需重新导入（纯前端设计，无账号体系）

---

## ✨ 功能特性

### 📚 全格式阅读
- 支持 **TXT / EPUB / PDF / DOCX / HTML** 五种常见格式
- 智能分页排版，段落自动适配屏幕
- 章节识别、页码/段落跳转、阅读历史自动保存

### 🖱️ 沉浸式查词
- **点击任意单词** → 弹出精简翻译（音标 + 词性 + 中文释义）
- 点「查看详细释义」→ 展开完整解析：英式/美式发音、CEFR 难度、英文释义、本句义高亮、例句、同义词、反义词
- **选中句子** → 句子翻译 + 结构解析
- AI 引擎：支持 **8 家 AI 大模型供应商**（DeepSeek / 千问 DashScope / OpenAI / Gemini / Claude / Kimi / 智谱 GLM / 自定义）

### 📕 单词本 + 背单词
- 单词 / 词组 / 句子一键加入单词本（AI 自动识别类型）
- 原文中标记内容显示三色下划线（单词=金、词组=绿、句子=蓝），可选经典/温和/极简三套配色
- 背单词模式采用“先回忆 → 点卡片看释义 → 查看详细解释 → 三键评分”的复习流程
- 记忆曲线使用 SM-2 思路，按 repetitions / interval / easeFactor / nextReview 安排下次复习

### 🎨 阅读体验
- 白天 / 护眼 / 夜间 三主题
- 字号、行距自由调节
- 标记后阅读位置**不跳页**，保持进度
- TXT 自动识别 UTF-8 / GBK / GB18030 / ANSI 编码，减少乱码
- 支持按页码或段落跳转，阅读历史自动恢复

---

## 📱 三端支持

| 平台 | 技术方案 | 形态 |
|------|---------|------|
| **Windows** | Flask + pywebview | 原生窗口（无浏览器、无控制台） |
| **macOS** | Flask + Electron | 原生窗口 .dmg 安装包 |
| **华为平板** | 纯前端 + Capacitor | Android WebView APK |

> 🎯 设计宗旨：桌面端永远弹出**自己的原生窗口**（像微信一样），绝不打开浏览器。

---

## 📂 项目结构

```
务思语项目/
├── 01-Windows版/          # Windows 版（Flask + pywebview 原生窗口）
│   ├── app.py             # Flask 后端（书籍解析 + 服务）
│   ├── static/index.html  # 前端（阅读器 + 翻译 + 单词本）
│   └── installer/         # 安装程序（自动检测原位置更新）
├── 01-Windows版/         # Electron 原生窗口版（Windows）
│   ├── main.js            # Electron 主进程
│   ├── install_electron.py# 安装程序
│   └── flask-app/         # Flask 后端
├── 02-Mac版/              # macOS 版项目
│   ├── main.js            # Electron 主进程
│   ├── build-mac.sh       # 一键构建脚本
│   └── flask-app/         # Flask 后端源码
└── 03-Android版/             # 华为Android版
    ├── www/               # 纯前端（JS 解析 TXT/EPUB/PDF/DOCX）
    └── capacitor.config.json
```

---

## 🚀 快速开始

### Windows

```bash
# 方式一：安装包（推荐）
双击 installer/dist/务思语_Setup.exe

# 方式二：源码运行
cd 01-Windows版
pip install flask requests ebooklib pymupdf python-docx pywebview
python app.py
```

首次使用：⚙️ 设置 → 选择任一支持的 AI 服务商，填入 API Key → 保存并测试 → 开始阅读。

### macOS

```bash
cd 02-Mac版
bash build-mac.sh   # 自动安装依赖、打包 Flask 后端并生成 .dmg
```

macOS 版使用 Electron 原生窗口和内置 Flask 后端，安装后不需要用户手动启动 Python 服务。用户书籍、API Key、单词本和阅读历史保存在本机应用数据目录，不会提交到仓库。

### 华为平板

```bash
cd 03-Android版
# 用 Capacitor 打包 APK（需要 Android SDK）
npx cap add android
npx cap sync android
cd android && gradle assembleDebug
```

APK 传到平板后：微信收到书籍文件 → 右上角 ⋯ → **「用其他应用打开」→ 务思语** → 自动导入书库。

---

## 🔑 API Key 说明

务思语调用 AI 大模型进行翻译，支持 8 家供应商（全部 OpenAI 兼容接口）：

| 服务商 | 接口地址 | 默认模型 |
|--------|---------|---------|
| 🟢 DeepSeek | `api.deepseek.com/v1` | `deepseek-chat` |
| 🔵 千问 DashScope | `dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| ⚪ OpenAI | `api.openai.com/v1` | `gpt-4o-mini` |
| 🔴 Google Gemini | `generativelanguage.googleapis.com/v1beta/openai` | `gemini-1.5-flash` |
| 🟠 Anthropic Claude | `api.anthropic.com/v1` | `claude-3-5-haiku-latest` |
| 🟣 Kimi 月之暗面 | `api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 🟡 智谱 GLM | `open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| ✨ 自定义 | 任意 OpenAI 兼容接口 | 自定义 |

Key 在 **⚙️ 设置** 中配置，保存在本地（Android版保存在设备本地，与电脑版相互独立）。

---

## 🛠️ 更新机制

所有安装程序遵循同一原则：
1. **自动检测**原有安装位置（记忆文件 → 桌面快捷方式 → 常见目录）
2. **原地更新**，绝不让用户重新选择目录
3. **保留用户数据**（书籍 / 配置 / 单词本），只替换程序文件

---

## 📄 License

MIT License © 2026

---

*Made with ❤️ for English learners*
