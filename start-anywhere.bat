@echo off
rem Starts Dezheimer for this computer AND for a phone anywhere, through Tailscale.
rem The window shows the address to open on the phone.
set "VENV=%USERPROFILE%\.venvs\dezheimer"
cd /d "%~dp0"

if not exist "%VENV%\Scripts\python.exe" (
  echo First start: installing the dependencies. This takes a few minutes.
  python -m venv "%VENV%" || goto :error
  "%VENV%\Scripts\python.exe" -m pip install -r requirements.txt || goto :error
)

"%VENV%\Scripts\python.exe" -m server.anywhere
pause
goto :eof

:error
echo.
echo Something went wrong. See the message above.
pause
