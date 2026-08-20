#!/bin/bash
# 务思语 macOS 版构建脚本
# 在 Mac 终端运行: bash build-mac.sh

set -e

echo "📦 务思语 macOS 版构建"
echo "========================"
echo ""

# 1. 安装 Python 依赖并打包后端
echo "[1/4] 安装 Python 依赖..."
cd flask-app
python3 -m pip install -r requirements.txt
python3 -m pip show pyinstaller >/dev/null 2>&1 || python3 -m pip install pyinstaller
echo "     打包 Flask 后端..."
python3 -m PyInstaller --clean --noconfirm wusiyu_backend.spec
cd ..

# 2. 安装 Node.js 依赖
echo "[2/4] 安装 Node.js 依赖..."
npm install

# 3. 图标（未提供时使用默认 Electron 图标）
echo "[3/4] 检查图标..."
if [ ! -f "build/icon.icns" ]; then
  echo "  未找到图标，使用默认 Electron 图标"
fi

# 4. 编译为 macOS .dmg 安装包
echo "[4/4] 编译 .dmg 安装包..."
npx electron-builder --mac

echo ""
echo "✅ 构建完成！"
echo "安装包在: dist/务思语-1.5.5-arm64.dmg"
