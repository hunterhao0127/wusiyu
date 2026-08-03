@echo off
chcp 65001 > nul
echo ╔══════════════════════════════════════╗
echo ║       务思语 - 英语沉浸阅读器         ║
echo ║                                      ║
echo ║  启动中，请稍候...                    ║
echo ║  浏览器打开后，先配置 API Key 即可使用 ║
echo ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"
start http://localhost:5980
python app.py

pause
