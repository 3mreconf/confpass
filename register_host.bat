@echo off
setlocal

echo ConfPass Native Host Kayit Araci
echo =================================

REM Dizinleri ayarla
set "PROJECT_ROOT=%~dp0"
set "TARGET_DIR=%PROJECT_ROOT%src-tauri\target\release"
set "HOST_EXE=%TARGET_DIR%\confpass-native-host.exe"
set "MANIFEST_PATH=%TARGET_DIR%\com.confpass.password.json"
set "HOST_NAME=com.confpass.password"

REM Release klasorunun varligini kontrol et
if not exist "%TARGET_DIR%" (
    echo [HATA] Release klasoru bulunamadi!
    echo Lutfen once projeyi derleyin: npm run tauri build
    pause
    exit /b 1
)

REM Exe kontrolu
if not exist "%HOST_EXE%" (
    echo [HATA] Native Host exesi bulunamadi: %HOST_EXE%
    echo Lutfen projeyi derleyin.
    pause
    exit /b 1
)

echo [BILGI] Host Manifest dosyasi olusturuluyor...
set "EXT_ID=cmaddhojekgkmkihchnpmilnamiflmeb"

(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "ConfPass Native Host",
echo   "path": "confpass-native-host.exe",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXT_ID%/"
echo   ]
echo }
) > "%MANIFEST_PATH%"

echo [BILGI] Manifest olusturuldu: %MANIFEST_PATH%

echo [BILGI] Kayit Defteri (Registry) guncelleniyor...
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f

if %errorlevel% equ 0 (
    echo [BASARILI] Native Host basariyla kaydedildi!
    echo Tarayicinizi yeniden baslatmaniz gerekebilir.
) else (
    echo [HATA] Kayit defteri guncellenemedi. Yonetici olarak calistirmayi deneyin.
)

pause
