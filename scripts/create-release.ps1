param(
    [Parameter(Position=0)]
    [ValidateSet("patch", "minor", "major")]
    [string]$BumpType = "patch"
)

# Get the directory where the script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check if we are running from root or scripts folder and adjust
if (Test-Path "$ScriptDir\..\package.json") {
    Set-Location "$ScriptDir\.."
} elseif (!(Test-Path "package.json")) {
    Write-Host "[ERROR] Could not find package.json. Please run this script from the project root directory." -ForegroundColor Red
    exit 1
}

Write-Host ">>> Creating release with version bump: $BumpType" -ForegroundColor Cyan

# Bump version
Write-Host "`n[1/4] Bumping version..." -ForegroundColor Yellow
node scripts/bump-version.cjs $BumpType

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Version bump failed." -ForegroundColor Red
    exit 1
}

# Get new version from package.json
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$newVersion = $packageJson.version

Write-Host "`n[2/4] New version: v$newVersion" -ForegroundColor Green

# Git operations
Write-Host "`n[3/4] Committing changes..." -ForegroundColor Yellow
git add .
git commit -m "chore: bump version to $newVersion and sync all configs"

Write-Host "`n[4/4] Creating tag v$newVersion..." -ForegroundColor Yellow
git tag "v$newVersion"

Write-Host "`n>>> Pushing to GitHub..." -ForegroundColor Yellow
git push origin main
git push origin "v$newVersion"

Write-Host "`nSUCCESS: Release created! GitHub Actions will build and publish the release." -ForegroundColor Green
Write-Host "Release URL: https://github.com/3mreconf/confpass/releases/tag/v$newVersion" -ForegroundColor Cyan
