param(
  [string]$JavaHome = 'C:/AfroBooksBuild/jdk17/jdk-17.0.20.1+1',
  [string]$AndroidSdkPath = 'C:/AfroBooksBuild/android-sdk',
  [string]$GradleCache = 'C:/AfroBooksBuild/gradle-cache',
  [string]$BundletoolPath = 'C:/AfroBooksBuild/bundletool.jar'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidSdkPath
$env:GRADLE_USER_HOME = $GradleCache
$env:DEBUG = ''
if (-not (Test-Path -LiteralPath "$JavaHome/bin/java.exe")) { throw 'Install JDK 17 or supply -JavaHome.' }
if (-not (Test-Path -LiteralPath $BundletoolPath)) { throw 'Supply the path to the official bundletool jar.' }
Push-Location (Join-Path $repoRoot 'android')
try {
  & ./gradlew.bat --no-daemon --console=plain bundleRelease assembleRelease
  if ($LASTEXITCODE -ne 0) { throw 'Android compilation failed.' }
  & node (Join-Path $PSScriptRoot 'sign-android.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Android signing failed.' }
  $manifest = Get-Content -LiteralPath './twa-manifest.json' -Raw | ConvertFrom-Json
  $bundle = Join-Path $repoRoot "dist/android/afrobooks-$($manifest.appVersionName).aab"
  & "$JavaHome/bin/java.exe" -jar $BundletoolPath validate "--bundle=$bundle"
  if ($LASTEXITCODE -ne 0) { throw 'App Bundle validation failed.' }
  Write-Output "Validated signed bundle: $bundle"
} finally { Pop-Location }
