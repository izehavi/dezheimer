@echo off
rem Builds the dataset to train a small speech model, from the phrases kept by the app:
rem the sentences read aloud, and what was said to the assistant, written down by a large model.
set "VENV=%USERPROFILE%\.venvs\dezheimer"
cd /d "%~dp0"

"%VENV%\Scripts\python.exe" -m server.dataset
pause
