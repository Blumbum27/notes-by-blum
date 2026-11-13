Add-Type -AssemblyName System.Drawing
$projectDirectory = Split-Path -Parent $PSScriptRoot
$outputFile = Join-Path $projectDirectory 'Blumbum\Resources\Assets.xcassets\AppIcon.appiconset\AppIcon.png'
$bitmap = New-Object System.Drawing.Bitmap -ArgumentList 1024,1024,([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(31,92,84))
$paperBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(248,245,234))
$linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(191,204,194)),12
$leafBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(31,92,84))
$graphics.FillRectangle($paperBrush,260,200,504,624)
$graphics.DrawLine($linePen,326,200,326,824)
$graphics.DrawLine($linePen,386,672,676,672)
$graphics.DrawLine($linePen,386,724,604,724)
$leafPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$leafPath.AddBezier(414,564,378,356,556,300,664,316)
$leafPath.AddBezier(664,316,688,496,562,596,414,564)
$graphics.FillPath($leafBrush,$leafPath)
$stemPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(248,245,234)),12
$graphics.DrawBezier($stemPen,422,556,478,490,526,430,602,370)
$bitmap.Save($outputFile,[System.Drawing.Imaging.ImageFormat]::Png)
$stemPen.Dispose()
$leafPath.Dispose()
$leafBrush.Dispose()
$linePen.Dispose()
$paperBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
Write-Output "Generated 1024 x 1024 app icon."
