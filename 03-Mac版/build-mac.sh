#!/bin/bash
# 务思语 macOS 版构建脚本
# 在 Mac 终端运行: bash build-mac.sh

set -e

echo "📦 务思语 macOS 版构建"
echo "========================"
echo ""

# 1. 安装 Python 依赖
echo "[1/4] 安装 Python 依赖..."
cd flask-app
pip3 install -r requirements.txt 2>/dev/null || pip install -r requirements.txt
cd ..

# 2. 安装 Node.js 依赖
echo "[2/4] 安装 Node.js 依赖..."
npm install

# 3. 生成 .icns 图标（如果没有就用默认）
echo "[3/4] 检查图标..."
if [ ! -f "build/icon.icns" ]; then
  echo "  未找到图标，使用默认 Electron 图标"
fi

# 4. 编译为 macOS .dmg 安装包
echo "[4/4] 编译 .dmg 安装包..."
npx electron-builder --mac

echo ""
echo "✅ 构建完成！"
echo "安装包在: dist/务思语-1.5.0.dmg"
