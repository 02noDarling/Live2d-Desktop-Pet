@echo off
:: 设置控制台编码为 UTF-8
chcp 65001 >nul

:: 设置环境变量
set PYTHONIOENCODING=utf-8
set PYTHONLEGACYWINDOWSSTDIO=1

:: 运行 npm start
npm start