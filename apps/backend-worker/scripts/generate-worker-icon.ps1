Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root "assets"
if (!(Test-Path $assetsDir)) {
  New-Item -ItemType Directory -Path $assetsDir | Out-Null
}

$iconPath = Join-Path $assetsDir "cognimail-worker.ico"
$iconSize = 256
$bmp = New-Object System.Drawing.Bitmap -ArgumentList $iconSize, $iconSize
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$rect = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $iconSize, $iconSize
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(6, 182, 212),
  [System.Drawing.Color]::FromArgb(79, 70, 229),
  45
)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 58
$diameter = $radius * 2
$innerW = [int]$iconSize - 28
$innerH = [int]$iconSize - 28
$inner = New-Object System.Drawing.Rectangle -ArgumentList 14, 14, $innerW, $innerH
$path.AddArc($inner.X, $inner.Y, $diameter, $diameter, 180, 90)
$path.AddArc($inner.Right - $diameter, $inner.Y, $diameter, $diameter, 270, 90)
$path.AddArc($inner.Right - $diameter, $inner.Bottom - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc($inner.X, $inner.Bottom - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)

$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(242, 248, 255), 14)
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$mailX = 56
$mailY = 80
$mailW = 144
$mailH = 96
$g.DrawRectangle($pen, $mailX, $mailY, $mailW, $mailH)
$g.DrawLine($pen, $mailX, $mailY, $mailX + ($mailW / 2), $mailY + ($mailH * 0.44))
$g.DrawLine($pen, $mailX + $mailW, $mailY, $mailX + ($mailW / 2), $mailY + ($mailH * 0.44))

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()

[System.Runtime.InteropServices.Marshal]::Release($hIcon) | Out-Null
$icon.Dispose()
$pen.Dispose()
$path.Dispose()
$brush.Dispose()
$g.Dispose()
$bmp.Dispose()

Write-Output "Generated $iconPath"
