@echo off
echo ========================================================
echo RUNNING SDXL IN AUTORETRY LOOP...
echo ========================================================

cd /d "%~dp0.."
call .venv_sdxl\Scripts\activate.bat

:loop
echo Running SDXL Python script...
python scripts\test_sdxl.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Python script exited with error. Restarting in 5 seconds to bypass transient socket issues...
    timeout /t 5
    goto loop
)

echo.
echo ========================================================
echo SDXL IMAGE GENERATED SUCCESSFULLY!
echo ========================================================
