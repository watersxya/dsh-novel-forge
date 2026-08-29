@echo off
setlocal
rem DSH web restart: give the in-flight turn a few seconds to answer, then kill 3080 and relaunch.
timeout /t 4 /nobreak >nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":3080 .*LISTENING"') do (
  taskkill /f /pid %%a >nul 2>&1
)
:wait
netstat -ano | findstr /R /C:":3080 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait
)
start "dsh-web" node "C:\Users\Ryan\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js" web --no-open
endlocal
