# 📖 务思语 — 英语沉浸阅读器

> 一个支持 **Windows / macOS / 华为平板** 三端的英语阅读器，内置 AI 翻译、单词本、背单词记忆曲线，让英语阅读像微信一样轻快自然。

![version](https://img.shields.io/badge/version-1.5.1-blue)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Android-green)
![license](https://img.shields.io/badge/license-MIT-orange)

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
- AI 引擎：支持 **DeepSeek** 和 **阿里千问 DashScope** 双提供商

### 📕 单词本 + 背单词
- 单词 / 词组 / 句子一键加入单词本（AI 自动识别类型）
- 原文中标记内容显示**三色波浪下划线**（单词=金、词组=绿、句子=蓝），可选经典/温和/极简三套配色
- **背单词模式**：卡片翻转 + 知道/模糊/不认识 三键
- **记忆曲线**（SM-2 算法）：知道→间隔翻倍，模糊→不变，不认识→重置

### 🎨 阅读体验
- 白天 / 护眼 / 夜间 三主题
- 字号、行距自由调节
- 标记后阅读位置**不跳页**，保持进度

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

首次使用：⚙️ 设置 → 填入 DeepSeek 或 DashScope API Key → 保存并测试 → 开始阅读。

### macOS

```bash
cd 02-Mac版
pip3 install flask requests
npm install
npm run build-mac   # 生成 .dmg 安装包
```

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

务思语调用 AI 大模型进行翻译，支持两个提供商：

| 提供商 | 接口地址 | 模型 |
|--------|---------|------|
| DeepSeek | `api.deepseek.com` | `deepseek-chat` |
| 阿里千问 | `dashscope.aliyuncs.com` | `qwen-plus` |

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
