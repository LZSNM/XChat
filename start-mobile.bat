@echo off

REM 移动设备启动脚本 (Windows)

REM 检查Node.js是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: Node.js 未安装
    echo 请先安装 Node.js: https://nodejs.org/en/download/
    pause
    exit /b 1
)

REM 检查依赖是否安装
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo 错误: 依赖安装失败
        pause
        exit /b 1
    )
)

REM 启动服务器
echo 正在启动聊天系统服务器...
echo 服务器将运行在 http://localhost:3000
echo 按 Ctrl+C 停止服务器
echo.

npm start

pause