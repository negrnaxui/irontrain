@echo off
setlocal
cd /d "%~dp0"
title Iron Wastes
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0server.py"
    goto end
)
where python >nul 2>nul
if not errorlevel 1 (
    python "%~dp0server.py"
    goto end
)
echo Python 3 was not found.
echo Install Python 3 from https://www.python.org/downloads/ and try again.
echo During installation, enable "Add Python to PATH".
pause
:end
endlocal
