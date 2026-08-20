# 务思语 macOS 版

务思语 macOS 版是 Electron 原生窗口应用，内置 Flask 后端和阅读器前端。安装后直接打开应用即可使用，不需要手动运行 Python 服务。

## 当前特性

- 支持 TXT / EPUB / PDF / DOCX / HTML 导入阅读
- TXT 自动识别 UTF-8 / GBK / GB18030 / ANSI 编码，减少乱码
- 阅读器按内容块分页，支持章节、页码/段落跳转和阅读历史恢复
- 点击单词或选中句子可翻译，并可加入单词本
- 背单词采用“先回忆 → 点卡片看释义 → 查看详细解释 → 三键评分”的流程
- 复习间隔按 SM-2 思路保存 repetitions / interval / easeFactor / nextReview
- 用户书籍、API Key、单词本和阅读历史保存在本机应用数据目录，不写入源码仓库

## 构建方法

### 在 Mac 上执行以下步骤：

```bash
# 1. 打开终端
# 2. 进入项目目录
cd /路径/到/务思语-mac

# 3. 一键构建 .dmg 安装包
bash build-mac.sh
```

编译完成后，安装包在 `dist/务思语-1.5.5-arm64.dmg`。

## 前提条件

- macOS 10.13+ (High Sierra 以上)
- [Node.js](https://nodejs.org) (v18+)
- Python 3.8+
- Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```

## 文件说明

```
务思语-mac/
├── main.js              ← Electron 主进程（启动 Flask + 创建窗口）
├── package.json         ← npm 配置（含 macOS 打包配置）
├── build-mac.sh         ← 一键构建脚本
├── flask-app/           ← Flask 后端源码
│   ├── app.py
│   ├── static/          ← 前端页面（包含所有功能）
│   ├── requirements.txt
│   └── wusiyu_backend.spec
└── build/
    └── icon.icns        ← 应用图标（可选）
```
