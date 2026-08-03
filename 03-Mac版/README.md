# 务思语 macOS 版

## 构建方法

### 在 Mac 上执行以下步骤：

```bash
# 1. 打开终端
# 2. 进入项目目录
cd /路径/到/务思语-mac

# 3. 安装 Python 依赖
pip3 install flask requests

# 4. 安装 Node.js 依赖
npm install

# 5. 编译 .dmg 安装包
npm run build-mac
```

编译完成后，安装包在 `dist/务思语-1.5.0.dmg`。

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
│   ├── books/           ← 书籍目录
│   └── requirements.txt
└── build/
    └── icon.icns        ← 应用图标（可选）
```
