@echo off
echo === LiveKit Server ===
echo.
echo 请先下载 livekit-server.exe 放到本目录:
echo   https://github.com/livekit/livekit/releases
echo   下载 windows-amd64 版本
echo.
echo 按任意键启动...
pause > nul
livekit-server --config livekit.yaml --node-ip 127.0.0.1
pause
