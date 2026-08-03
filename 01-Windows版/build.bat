@echo off
chcp 65001 > nul
echo ╔══════════════════════════════════════╗
echo ║     务思语 - 打包构建脚本             ║
echo ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM 清理旧构建
echo [1/3] 清理旧构建...
rmdir /s /q build 2>nul
rmdir /s /q dist 2>nul
del /q "务思语.spec" 2>nul

echo [2/3] 执行 PyInstaller 打包...
python -m PyInstaller ^
    --name "务思语" ^
    --onedir ^
    --console ^
    --add-data "static;static" ^
    --add-data "books;books" ^
    --hidden-import ebooklib ^
    --hidden-import fitz ^
    --hidden-import docx ^
    --hidden-import bs4 ^
    --hidden-import lxml ^
    --hidden-import requests ^
    --hidden-import flask ^
    --hidden-import PIL ^
    app.py

if %ERRORLEVEL% NEQ 0 (
    echo [错误] 打包失败！
    pause
    exit /b 1
)

echo.
echo [3/3] 打包完成！
echo.
echo 输出目录: %~dp0dist\务思语\
echo 执行文件: %~dp0dist\务思语\务思语.exe
echo.
echo 提示:
echo   - 首次运行会自动打开浏览器
echo   - 书籍放在 务思语.exe 旁边的 books\ 文件夹
echo   - 配置保存在 务思语.exe 旁边的 config.json
echo.

pause
