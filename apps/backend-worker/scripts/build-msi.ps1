$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $root "release"
$payloadDir = if ($env:MSI_PAYLOAD_DIR) { $env:MSI_PAYLOAD_DIR } else { Join-Path $releaseDir "cognimail-worker-win" }
$now = Get-Date
$defaultVersion = "1.$($now.ToString('yy')).$($now.DayOfYear)"
$msiVersion = if ($env:MSI_VERSION) { $env:MSI_VERSION } else { $defaultVersion }
$versionTag = $msiVersion -replace "[^0-9\.]", "."
$msiFileName = if ($env:MSI_FILE_NAME) { $env:MSI_FILE_NAME } else { "CogniMailWorkerSetup-v$versionTag.msi" }
$msiPath = Join-Path $releaseDir $msiFileName
$latestMsiPath = Join-Path $releaseDir "CogniMailWorkerSetup.msi"
$installerDir = Join-Path $root "installer"
$wixDir = Join-Path $root ".tools\wix"
$wixZip = Join-Path $wixDir "wix311-binaries.zip"
$wixBin = Join-Path $wixDir "bin"

function Ensure-Wix {
  if (Test-Path (Join-Path $wixBin "candle.exe")) {
    return
  }

  New-Item -ItemType Directory -Path $wixDir -Force | Out-Null
  $url = "https://github.com/wixtoolset/wix3/releases/download/wix3112rtm/wix311-binaries.zip"
  Write-Host "[WiX] Downloading WiX binaries..."
  Invoke-WebRequest -Uri $url -OutFile $wixZip

  if (Test-Path $wixBin) {
    Remove-Item $wixBin -Recurse -Force
  }
  New-Item -ItemType Directory -Path $wixBin -Force | Out-Null
  Expand-Archive -Path $wixZip -DestinationPath $wixBin -Force
}

Write-Host "[1/6] Build worker package..."
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCmd) {
  Push-Location (Split-Path -Parent $root)
  npm.cmd run package:worker-win --workspace @cognimail/backend-worker | Out-Host
  Pop-Location
} elseif (!(Test-Path $payloadDir)) {
  throw "npm.cmd not found and payload folder missing: $payloadDir"
} else {
  Write-Warning "npm.cmd not found. Reusing existing payload at $payloadDir"
}

if (!(Test-Path $payloadDir)) {
  throw "Payload folder missing: $payloadDir"
}

Write-Host "[2/6] Ensure WiX toolset..."
Ensure-Wix

Write-Host "[3/6] Prepare installer source..."
New-Item -ItemType Directory -Path $installerDir -Force | Out-Null
$payloadWxs = Join-Path $installerDir "payload.wxs"
$productWxs = Join-Path $installerDir "Product.wxs"
$productObj = Join-Path $installerDir "Product.wixobj"
$payloadObj = Join-Path $installerDir "payload.wixobj"

@"
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="CogniMail Worker" Language="1033" Version="$msiVersion" Manufacturer="CogniMail" UpgradeCode="{7F813033-EF1A-4CFB-BE67-D8E5FB1C9A01}">
    <Package InstallerVersion="500" Compressed="yes" InstallScope="perMachine" />
    <MajorUpgrade AllowSameVersionUpgrades="yes" DowngradeErrorMessage="A newer version of CogniMail Worker is already installed." />
    <MediaTemplate EmbedCab="yes" />

    <Icon Id="AppIcon" SourceFile="`$(var.PayloadDir)\assets\cognimail-worker.ico" />
    <Property Id="ARPPRODUCTICON" Value="AppIcon" />

    <Feature Id="MainFeature" Title="CogniMail Worker" Level="1">
      <ComponentGroupRef Id="WorkerPayload" />
      <ComponentRef Id="ApplicationShortcuts" />
    </Feature>
  </Product>

  <Fragment>
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="CogniMail Worker" />
      </Directory>
      <Directory Id="ProgramMenuFolder">
        <Directory Id="ApplicationProgramsFolder" Name="CogniMail Worker" />
      </Directory>
      <Directory Id="DesktopFolder" />
    </Directory>
  </Fragment>

  <Fragment>
    <DirectoryRef Id="ApplicationProgramsFolder">
      <Component Id="ApplicationShortcuts" Guid="{06C0FC71-8B15-4C6A-B19B-34D869AF6748}">
        <Shortcut Id="StartMenuShortcut" Name="CogniMail Worker" Description="Open CogniMail local worker tray" Target="[INSTALLFOLDER]WorkerTray.exe" WorkingDirectory="INSTALLFOLDER" />
        <Shortcut Id="DesktopShortcut" Directory="DesktopFolder" Name="CogniMail Worker" Description="Open CogniMail local worker tray" Target="[INSTALLFOLDER]WorkerTray.exe" WorkingDirectory="INSTALLFOLDER" />
        <RemoveFolder Id="ApplicationProgramsFolder" On="uninstall" />
        <RegistryValue Root="HKCU" Key="Software\CogniMail\Worker" Name="Installed" Type="integer" Value="1" KeyPath="yes" />
      </Component>
    </DirectoryRef>
  </Fragment>
</Wix>
"@ | Set-Content -Path $productWxs -Encoding UTF8

Write-Host "[4/6] Harvest payload..."
& (Join-Path $wixBin "heat.exe") dir $payloadDir -cg WorkerPayload -dr INSTALLFOLDER -gg -srd -scom -sreg -var var.PayloadDir -out $payloadWxs | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "heat.exe failed with exit code $LASTEXITCODE"
}

Write-Host "[5/6] Compile WiX..."
if (Test-Path $productObj) {
  Remove-Item $productObj -Force
}
if (Test-Path $payloadObj) {
  Remove-Item $payloadObj -Force
}
& (Join-Path $wixBin "candle.exe") -dPayloadDir="$payloadDir" -out $installerDir\ $productWxs $payloadWxs | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "candle.exe failed with exit code $LASTEXITCODE"
}

if (Test-Path $msiPath) {
  Remove-Item $msiPath -Force
}

Write-Host "[6/6] Link MSI..."
& (Join-Path $wixBin "light.exe") -out $msiPath $productObj $payloadObj | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "light.exe failed with exit code $LASTEXITCODE"
}

Copy-Item -Path $msiPath -Destination $latestMsiPath -Force

Write-Host "MSI version: $msiVersion"
Write-Host "MSI created: $msiPath"
Write-Host "MSI latest alias: $latestMsiPath"
