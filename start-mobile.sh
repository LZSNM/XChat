#!/bin/bash

# 移动设备启动脚本

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装"
    echo "请先安装 Node.js: https://nodejs.org/en/download/"
    exit 1
fi

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "错误: 依赖安装失败"
        exit 1
    fi
fi

# 启动服务器
echo "正在启动聊天系统服务器..."
echo "服务器将运行在 http://localhost:3000"
echo "按 Ctrl+C 停止服务器"
echo ""

npm start