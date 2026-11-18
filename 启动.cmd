@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if not errorlevel 1 (
  node.exe server.mjs
) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.mjs
) else (
  echo Install Node.js 24 and run this launcher again.
)
pause
