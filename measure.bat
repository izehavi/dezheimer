@echo off
rem Measures the speech model on the phrases kept by "Keep the sound of my voice".
rem First asks what was really said in each new phrase, then compares the model sizes.
set "VENV=%USERPROFILE%\.venvs\dezheimer"
cd /d "%~dp0"

"%VENV%\Scripts\python.exe" -m server.measure label
echo.
"%VENV%\Scripts\python.exe" -m server.measure --misses
pause
