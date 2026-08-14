# Generates PWA icons for the Walid platform matching the favicon identity:
# deep-space #070513 rounded square + aurora gradient ring + the letter "و".
# Usage: powershell -ExecutionPolicy Bypass -File scripts/generate-pwa-icons.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path (Join-Path (Join-Path $PSScriptRoot '..') 'public') 'icons'
$outDir = [System.IO.Path]::GetFullPath($outDir)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Add-RoundedRectPath {
    param(
        [System.Drawing.Drawing2D.GraphicsPath]$Path,
        [System.Drawing.RectangleF]$Rect,
        [float]$Radius
    )
    $d = [math]::Min($Radius * 2, [math]::Min($Rect.Width, $Rect.Height))
    if ($d -le 1) {
        $Path.AddRectangle($Rect)
        return
    }
    $x = $Rect.X
    $y = $Rect.Y
    $w = $Rect.Width
    $h = $Rect.Height
    $arc = New-Object System.Drawing.RectangleF($x, $y, $d, $d)
    $Path.AddArc($arc, 180, 90)
    $arc2x = $x + $w - $d
    $arc = New-Object System.Drawing.RectangleF($arc2x, $y, $d, $d)
    $Path.AddArc($arc, 270, 90)
    $arc2y = $y + $h - $d
    $arc = New-Object System.Drawing.RectangleF($arc2x, $arc2y, $d, $d)
    $Path.AddArc($arc, 0, 90)
    $arc = New-Object System.Drawing.RectangleF($x, $arc2y, $d, $d)
    $Path.AddArc($arc, 90, 90)
    $Path.CloseFigure()
}

function New-Icon {
    param(
        [int]$Size,
        [string]$Name,
        [bool]$Rounded = $true,
        [double]$LetterScale = 0.56,
        [double]$RingScale = 0.041
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $padRatio = 0.5 - ($LetterScale / 3.1)  # maskable safe-zone friendly letter placement
    $left = [int][math]::Round($Size * $padRatio)
    $top = [int][math]::Round($Size * $padRatio)
    $right = [int][math]::Round($Size * (1 - $padRatio))
    $bottom = [int][math]::Round($Size * (1 - $padRatio))

    if ($Rounded) {
        $bgRect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
        $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-RoundedRectPath -Path $bg -Rect $bgRect -Radius ($Size * 0.28)
        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 7, 5, 19))
        $g.FillPath($bgBrush, $bg)
        $bgBrush.Dispose()
        $bg.Dispose()
    } else {
        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 7, 5, 19))
        $g.FillRectangle($bgBrush, 0, 0, $Size, $Size)
        $bgBrush.Dispose()
    }

    $colors = @(
        [System.Drawing.Color]::FromArgb(99, 102, 241),
        [System.Drawing.Color]::FromArgb(168, 85, 247),
        [System.Drawing.Color]::FromArgb(34, 211, 238)
    )
    $positions = @(0.0, 0.55, 1.0)

    $ringInset = [math]::Max(6, $Size * 0.014)
    $ringW = $Size - 2 * $ringInset
    $ringRect = New-Object System.Drawing.RectangleF($ringInset, $ringInset, $ringW, $ringW)
    $ringBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($ringRect, [System.Drawing.Color]::White, [System.Drawing.Color]::White, 60)
    $gradient = New-Object System.Drawing.Drawing2D.ColorBlend
    $gradient.Colors = $colors
    $gradient.Positions = $positions
    $ringBrush.InterpolationColors = $gradient

    $stroke = [math]::Max(4, [math]::Round($Size * $RingScale))
    $pen = New-Object System.Drawing.Pen($ringBrush, $stroke)
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    if ($Rounded) {
        $ringPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-RoundedRectPath -Path $ringPath -Rect $ringRect -Radius ($Size * 0.26)
        $g.DrawPath($pen, $ringPath)
        $ringPath.Dispose()
    } else {
        # Maskable: draw the ring as a centered rounded frame inside the safe zone
        $safe = $Size * 0.16
        $frameW = $Size - 2 * $safe
        $frameRect = New-Object System.Drawing.RectangleF($safe, $safe, $frameW, $frameW)
        $framePath = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-RoundedRectPath -Path $framePath -Rect $frameRect -Radius ($Size * 0.2)
        $g.DrawPath($pen, $framePath)
        $framePath.Dispose()
    }
    $pen.Dispose()
    $ringBrush.Dispose()

    $fontSize = [math]::Round($Size * $LetterScale)
    $font = New-Object System.Drawing.Font('Tahoma', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $letterW = $right - $left
    $letterH = $bottom - $top
    $letterRect = New-Object System.Drawing.RectangleF($left, $top, $letterW, $letterH)
    $letterBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($letterRect, [System.Drawing.Color]::White, [System.Drawing.Color]::White, 120)
    $letterBrush.InterpolationColors = $gradient

    $g.DrawString('و', $font, $letterBrush, $letterRect, $sf)
    $g.Flush([System.Drawing.Drawing2D.FlushIntention]::Sync)

    $sf.Dispose()
    $font.Dispose()
    $letterBrush.Dispose()
    $g.Dispose()

    $path = Join-Path $outDir $Name
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated $Name ($($Size)x$($Size))"
}

New-Icon -Size 512 -Name 'icon-512.png' -Rounded $true -LetterScale 0.56 -RingScale 0.041
New-Icon -Size 192 -Name 'icon-192.png' -Rounded $true -LetterScale 0.56 -RingScale 0.041
New-Icon -Size 512 -Name 'icon-maskable-512.png' -Rounded $false -LetterScale 0.5 -RingScale 0.035
New-Icon -Size 180 -Name 'apple-touch-icon.png' -Rounded $true -LetterScale 0.58 -RingScale 0.045

Write-Host "Done -> $outDir"