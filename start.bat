@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo くく れんしゅう を起動しています...
echo このウィンドウを閉じるとアプリも止まります。
start "" http://localhost:4610/
node server.js
pause
