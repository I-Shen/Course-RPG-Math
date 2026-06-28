@echo off
SET OLLAMA_MODELS=%~dp0models
SET OLLAMA_HOST=127.0.0.1:11434
"%~dp0ollama.exe" serve
