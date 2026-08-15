Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\lenov\.gemini\antigravity-ide\brain\b4142523-2699-4f5b-90aa-ec3b17a8432f\mahiru_official_anime_icon_1784804301693.png"
if (-not (Test-Path $sourcePath)) {
    $sourcePath = "c:\Users\lenov\Downloads\MahiStream\mahistream-app\public\mahiru.png"
}

$resDir = "c:\Users\lenov\Downloads\MahiStream\mahistream-app\android\app\src\main\res"

$sizes = @(
    @{ folder = "mipmap-mdpi"; icon = 48; fg = 108 },
    @{ folder = "mipmap-hdpi"; icon = 72; fg = 162 },
    @{ folder = "mipmap-xhdpi"; icon = 96; fg = 216 },
    @{ folder = "mipmap-xxhdpi"; icon = 144; fg = 324 },
    @{ folder = "mipmap-xxxhdpi"; icon = 192; fg = 432 }
)

function Resize-StandardImage($srcImg, $targetPath, $width, $height) {
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcImg, 0, 0, $width, $height)
    $g.Dispose()

    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

function Resize-ForegroundAdaptive($srcImg, $targetPath, $totalSize) {
    $bmp = New-Object System.Drawing.Bitmap $totalSize, $totalSize
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $g.Clear([System.Drawing.Color]::Transparent)

    # Safe zone padding for adaptive icons: 72% inner scale, 14% margin offset
    $innerSize = [int]($totalSize * 0.72)
    $offset = [int]($totalSize * 0.14)

    $g.DrawImage($srcImg, $offset, $offset, $innerSize, $innerSize)
    $g.Dispose()

    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$src = [System.Drawing.Image]::FromFile($sourcePath)

foreach ($s in $sizes) {
    $dirPath = Join-Path $resDir $s.folder
    if (-not (Test-Path $dirPath)) { New-Item -ItemType Directory -Path $dirPath | Out-Null }

    $iconPath = Join-Path $dirPath "ic_launcher.png"
    $roundPath = Join-Path $dirPath "ic_launcher_round.png"
    $fgPath = Join-Path $dirPath "ic_launcher_foreground.png"

    Resize-StandardImage $src $iconPath $s.icon $s.icon
    Resize-StandardImage $src $roundPath $s.icon $s.icon
    Resize-ForegroundAdaptive $src $fgPath $s.fg

    Write-Host "Updated icons in $($s.folder) ($($s.icon)x$($s.icon), fg: $($s.fg)x$($s.fg))"
}

$src.Dispose()
Write-Host "All Android App Icons successfully updated!"
