@echo off
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 goto python
py -3 herramientas\abrir_local.py
goto fin
:python
python herramientas\abrir_local.py
:fin
if errorlevel 1 pause
