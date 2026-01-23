$hostName = "com.emreconf.confpass"
$appData = $env:LOCALAPPDATA
$chromePath = "$appData\Google\Chrome\User Data\NativeMessagingHosts"
$edgePath = "$appData\Microsoft\Edge\User Data\NativeMessagingHosts"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostJsonPath = Join-Path $scriptPath "native-messaging-host.json"
$exePath = Join-Path $scriptPath "..\src-tauri\target\release\confpass-native-host.exe"

if (-not (Test-Path $hostJsonPath)) {
    Write-Host "native-messaging-host.json bulunamadı!" -ForegroundColor Red
    exit 1
}

$hostJson = Get-Content $hostJsonPath | ConvertFrom-Json
$hostJson.path = $exePath.Replace('\', '\\')

$hostJson | ConvertTo-Json | Set-Content $hostJsonPath

if (Test-Path $chromePath) {
    $chromeHostPath = Join-Path $chromePath "$hostName.json"
    Copy-Item $hostJsonPath $chromeHostPath -Force
    Write-Host "Chrome native messaging host kaydedildi: $chromeHostPath" -ForegroundColor Green
} else {
    Write-Host "Chrome NativeMessagingHosts klasörü bulunamadı" -ForegroundColor Yellow
}

if (Test-Path $edgePath) {
    $edgeHostPath = Join-Path $edgePath "$hostName.json"
    Copy-Item $hostJsonPath $edgeHostPath -Force
    Write-Host "Edge native messaging host kaydedildi: $edgeHostPath" -ForegroundColor Green
} else {
    Write-Host "Edge NativeMessagingHosts klasörü bulunamadı" -ForegroundColor Yellow
}

Write-Host "`nNative messaging host kurulumu tamamlandı!" -ForegroundColor Green
Write-Host "Not: Extension ID'yi native-messaging-host.json dosyasında güncellemeyi unutmayın!" -ForegroundColor Yellow
