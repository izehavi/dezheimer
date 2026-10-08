@echo off
rem Starts Dezheimer and opens it in the browser. Double-click this file.
rem The virtual environment lives outside the project so that OneDrive does not sync it.
set "VENV=%USERPROFILE%\.venvs\dezheimer"
cd /d "%~dp0"

if not exist "%VENV%\Scripts\python.exe" (
  echo First start: installing the dependencies. This takes a few minutes.
  python -m venv "%VENV%" || goto :error
  "%VENV%\Scripts\python.exe" -m pip install -r requirements.txt || goto :error
)

"%VENV%\Scripts\python.exe" -m server
goto :eof

:error
echo.
echo Something went wrong. See the message above.
pause
