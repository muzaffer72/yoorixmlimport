@echo off
echo Fixing Gemini API configuration...

REM Navigate to project directory
cd /d "%~dp0"

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed or not in PATH.
    echo Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is available
npm --version >nul 2>&1
if errorlevel 1 (
    echo npm is not available.
    echo Please ensure npm is installed with Node.js.
    pause
    exit /b 1
)

echo Uninstalling old test package...
npm uninstall @google/genai

echo Installing correct Google Generative AI package...
npm install @google/generative-ai

echo Fixing complete! 
echo.
echo The Gemini API service has been updated to use the real Google Generative AI API instead of the test API.
echo.
echo Changes made:
echo - Updated package.json to use @google/generative-ai instead of @google/genai
echo - Updated GeminiService to use GoogleGenerativeAI class
echo - Renamed test methods to validation methods
echo - Removed mock test functions
echo - Updated API endpoints from /test-api-key to /validate-api-key
echo - Updated client-side API calls
echo.
pause
