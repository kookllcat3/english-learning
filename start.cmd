@echo off
setlocal
cd /d "%~dp0"
title English Learning

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
if errorlevel 1 (
  echo.
  echo English Learning could not be started.
  pause
)
