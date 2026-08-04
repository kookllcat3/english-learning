param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$projectDirectory = Split-Path -Parent $PSScriptRoot
$runtimeVersion = "24.16.0"
$minimumNodeMajor = 24

function Get-SystemArchitecture {
  $architecture = if ($env:PROCESSOR_ARCHITEW6432) {
    $env:PROCESSOR_ARCHITEW6432
  } else {
    $env:PROCESSOR_ARCHITECTURE
  }

  if ($architecture -eq "ARM64") {
    return "arm64"
  }

  return "x64"
}

function Test-CompatibleNode {
  param([string]$NodePath)

  if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    return $false
  }

  try {
    $version = & $NodePath --version
    return $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge $minimumNodeMajor
  } catch {
    return $false
  }
}

function Install-PortableNode {
  param([string]$Architecture)

  $archiveName = "node-v$runtimeVersion-win-$Architecture.zip"
  $releaseUrl = "https://nodejs.org/dist/v$runtimeVersion"
  $runtimeDirectory = Join-Path $projectDirectory ".runtime"
  $installDirectory = Join-Path $runtimeDirectory "node-v$runtimeVersion-win-$Architecture"
  $nodePath = Join-Path $installDirectory "node.exe"

  if (Test-CompatibleNode $nodePath) {
    return $nodePath
  }

  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  $downloadDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "english-learning-node-$runtimeVersion-$Architecture"
  New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null
  $archivePath = Join-Path $downloadDirectory $archiveName
  $checksumsPath = Join-Path $downloadDirectory "SHASUMS256.txt"

  Write-Host "Node.js was not found. Downloading the official portable runtime..."
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest "$releaseUrl/$archiveName" -OutFile $archivePath -UseBasicParsing
    Invoke-WebRequest "$releaseUrl/SHASUMS256.txt" -OutFile $checksumsPath -UseBasicParsing

    $checksumLine = Get-Content -LiteralPath $checksumsPath |
      Where-Object { $_ -match "^[a-fA-F0-9]{64}\s+$([regex]::Escape($archiveName))$" } |
      Select-Object -First 1
    if (-not $checksumLine) {
      throw "The official checksum for $archiveName was not found."
    }

    $expectedChecksum = ($checksumLine -split '\s+')[0].ToUpperInvariant()
    $actualChecksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
    if ($actualChecksum -ne $expectedChecksum) {
      throw "The downloaded Node.js archive failed SHA-256 verification."
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDirectory -Force
    if (-not (Test-CompatibleNode $nodePath)) {
      throw "The portable Node.js runtime could not be prepared."
    }
  } catch {
    throw "Unable to install the portable Node.js runtime. Check the internet connection and try again. $($_.Exception.Message)"
  } finally {
    Remove-Item -LiteralPath $archivePath, $checksumsPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $downloadDirectory -Force -ErrorAction SilentlyContinue
  }

  Write-Host "Portable Node.js $runtimeVersion is ready."
  return $nodePath
}

function Get-NpmCliPath {
  param([string]$NodePath)

  $nodeDirectory = Split-Path -Parent $NodePath
  $npmCliPath = Join-Path $nodeDirectory "node_modules\npm\bin\npm-cli.js"
  if (-not (Test-Path -LiteralPath $npmCliPath -PathType Leaf)) {
    throw "npm was not found next to the selected Node.js runtime."
  }

  return $npmCliPath
}

function Install-Dependencies {
  param(
    [string]$NodePath,
    [string]$NpmCliPath
  )

  $lockFile = Join-Path $projectDirectory "package-lock.json"
  if (-not (Test-Path -LiteralPath $lockFile -PathType Leaf)) {
    throw "package-lock.json was not found. The application cannot install locked dependencies."
  }

  $runtimeDirectory = Join-Path $projectDirectory ".runtime"
  $lockMarker = Join-Path $runtimeDirectory "dependency-lock.sha256"
  $viteEntryPoint = Join-Path $projectDirectory "node_modules\vite\bin\vite.js"
  $expectedLockHash = (Get-FileHash -LiteralPath $lockFile -Algorithm SHA256).Hash
  $installedLockHash = if (Test-Path -LiteralPath $lockMarker -PathType Leaf) {
    (Get-Content -LiteralPath $lockMarker -Raw).Trim()
  } else {
    ""
  }

  if (
    (Test-Path -LiteralPath $viteEntryPoint -PathType Leaf) -and
    $installedLockHash -eq $expectedLockHash
  ) {
    return
  }

  if (
    (Test-Path -LiteralPath $viteEntryPoint -PathType Leaf) -and
    -not $installedLockHash
  ) {
    Set-Location -LiteralPath $projectDirectory
    & $NodePath $NpmCliPath ls --depth=0 --silent | Out-Null
    if ($LASTEXITCODE -eq 0) {
      New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
      Set-Content -LiteralPath $lockMarker -Value $expectedLockHash -Encoding Ascii
      return
    }
  }

  Write-Host "Preparing the locked application dependencies..."
  Set-Location -LiteralPath $projectDirectory
  & $NodePath $NpmCliPath ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to install application dependencies. Check the internet connection and try again."
  }

  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  Set-Content -LiteralPath $lockMarker -Value $expectedLockHash -Encoding Ascii
  Write-Host "Application dependencies are ready."
}

$systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExecutable = if ($systemNode -and (Test-CompatibleNode $systemNode.Source)) {
  $systemNode.Source
} else {
  Install-PortableNode (Get-SystemArchitecture)
}
$npmCli = Get-NpmCliPath $nodeExecutable

if ($CheckOnly) {
  Write-Host "Compatible Node.js: $nodeExecutable"
  Write-Host "Compatible npm: $npmCli"
  exit 0
}

Set-Location -LiteralPath $projectDirectory
Install-Dependencies $nodeExecutable $npmCli
$viteEntryPoint = Join-Path $projectDirectory "node_modules\vite\bin\vite.js"

Write-Host "Starting English Learning..."
Write-Host "The website will open at http://127.0.0.1:4173/"
Write-Host "Close this window or press Ctrl+C to stop the service."
Write-Host ""

Start-Job -ScriptBlock {
  Start-Sleep -Milliseconds 800
  Start-Process "http://127.0.0.1:4173/"
} | Out-Null

& $nodeExecutable $viteEntryPoint --host 127.0.0.1 --port 4173 --strictPort
exit $LASTEXITCODE
