@echo off
echo ========================================================
echo SETTING UP PYTHON VIRTUAL ENVIRONMENT FOR SDXL...
echo ========================================================

cd /d "%~dp0.."

:: Create virtual environment if it doesn't exist
if not exist ".venv_sdxl" (
    echo Creating virtual environment '.venv_sdxl'...
    python -m venv .venv_sdxl
) else (
    echo Virtual environment '.venv_sdxl' already exists.
)

:: Activate virtual environment
echo Activating virtual environment...
call .venv_sdxl\Scripts\activate.bat

:: Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip

:: Install PyTorch with CUDA 12.4 support (supports Python 3.13)
echo Installing PyTorch with CUDA 12.4 support...
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

:: Install diffusers, transformers, accelerate, peft
echo Installing Diffusers, Transformers, Accelerate, and PEFT...
pip install diffusers transformers accelerate peft huggingface_hub

echo ========================================================
echo DEPENDENCIES INSTALLED SUCCESSFULLY!
echo ========================================================

