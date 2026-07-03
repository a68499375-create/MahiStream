@echo off
setlocal enabledelayedexpansion

set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set PROJECT_DIR=C:\Users\lenov\Downloads\MahiStream\mahistream-app
set DOWNLOADS_DIR=%USERPROFILE%\Downloads

echo ==========================================
echo Building MahiStream APK
echo ==========================================

cd /d "%PROJECT_DIR%"

echo.
echo [1/4] Installing npm dependencies...
npm install --legacy-peer-deps
if errorlevel 1 (
    echo ERROR: npm install failed
    exit /b 1
)

echo.
echo [2/4] Building Vite app...
npm run build
if errorlevel 1 (
    echo ERROR: Vite build failed
    exit /b 1
)

echo.
echo [3/4] Syncing Capacitor Android...
npx cap sync android
if errorlevel 1 (
    echo ERROR: Capacitor sync failed
    exit /b 1
)

echo.
echo [4/4] Building Release APK...
cd /d "%PROJECT_DIR%\android"
call gradlew assembleRelease
if errorlevel 1 (
    echo ERROR: Gradle build failed
    exit /b 1
)

echo.
echo ==========================================
echo Build successful!
echo ==========================================

echo.
echo Copying APK to Downloads folder...
set APK_SOURCE=%PROJECT_DIR%\android\app\build\outputs\apk\release\app-release.apk
set APK_DEST=%DOWNLOADS_DIR%\MahiStream-v1.4.0-release.apk

if exist "%APK_SOURCE%" (
    copy /y "%APK_SOURCE%" "%APK_DEST%"
    if errorlevel 1 (
        echo WARNING: Failed to copy APK to Downloads
    ) else (
        echo APK copied to: %APK_DEST%
    )
) else (
    echo WARNING: APK not found at expected location: %APK_SOURCE%
    echo Checking alternative locations...
    dir "%PROJECT_DIR%\android\app\build\outputs\apk\" /s /b
)

echo.
echo Build complete!
echo APK location: %APK_DEST%
echo.
pause