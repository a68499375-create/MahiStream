set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
cd c:\Users\lenov\Downloads\MahiStream\mahistream-app\android

:loop
call gradlew assembleDebug
if %ERRORLEVEL% equ 0 goto success

echo Build failed, retrying...
timeout /t 5
goto loop

:success
echo Build Succeeded!
