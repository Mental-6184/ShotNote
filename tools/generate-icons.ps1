Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
$AssetsDir = Join-Path $Root 'assets'
$Sizes = @(16, 24, 32, 48, 64, 128, 256, 512)
$BaseSize = 1024
$Scale = $BaseSize / 256

function New-RoundedRectPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-LinePath([single[]]$coords) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.StartFigure()
  for ($i = 0; $i -lt $coords.Length - 2; $i += 2) {
    $path.AddLine($coords[$i], $coords[$i + 1], $coords[$i + 2], $coords[$i + 3])
  }
  return $path
}

function New-BezierPath {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddBezier(79, 157, 104, 126, 139, 118, 171, 145)
  return $path
}

function Draw-Icon([System.Drawing.Bitmap]$Bitmap) {
  $g = [System.Drawing.Graphics]::FromImage($Bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.ScaleTransform($Scale, $Scale)

  $shadow1 = New-RoundedRectPath 24 26 208 216 58
  $shadowBrush1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 95, 73, 55))
  $g.FillPath($shadowBrush1, $shadow1)
  $shadowBrush1.Dispose()
  $shadow1.Dispose()

  $outer = New-RoundedRectPath 24 20 208 216 58
  $rim = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.PointF]::new(44, 28)), ([System.Drawing.PointF]::new(214, 230)), ([System.Drawing.ColorTranslator]::FromHtml('#fbf4ea')), ([System.Drawing.ColorTranslator]::FromHtml('#a97147'))
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Positions = [single[]]@(0, 0.42, 1)
  $blend.Colors = [System.Drawing.Color[]]@([System.Drawing.ColorTranslator]::FromHtml('#fbf4ea'), [System.Drawing.ColorTranslator]::FromHtml('#d7bd9c'), [System.Drawing.ColorTranslator]::FromHtml('#a97147'))
  $rim.InterpolationColors = $blend
  $g.FillPath($rim, $outer)
  $rim.Dispose()
  $outer.Dispose()

  $inner = New-RoundedRectPath 32 28 192 200 50
  $shell = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.PointF]::new(46, 22)), ([System.Drawing.PointF]::new(210, 238)), ([System.Drawing.ColorTranslator]::FromHtml('#ffffff')), ([System.Drawing.ColorTranslator]::FromHtml('#efe3d3'))
  $shellBlend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $shellBlend.Positions = [single[]]@(0, 0.58, 1)
  $shellBlend.Colors = [System.Drawing.Color[]]@([System.Drawing.ColorTranslator]::FromHtml('#ffffff'), [System.Drawing.ColorTranslator]::FromHtml('#fffaf2'), [System.Drawing.ColorTranslator]::FromHtml('#efe3d3'))
  $shell.InterpolationColors = $shellBlend
  $g.FillPath($shell, $inner)
  $shell.Dispose()
  $inner.Dispose()

  $highlight = New-RoundedRectPath 47 44 162 168 38
  $highlightPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(178, 255, 255, 255)), 3
  $g.DrawPath($highlightPen, $highlight)
  $highlightPen.Dispose()
  $highlight.Dispose()

  $dark = [System.Drawing.ColorTranslator]::FromHtml('#2c2925')
  $cropPen = New-Object System.Drawing.Pen $dark, 13
  $cropPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $cropPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $cropPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $paths = @(
    (New-LinePath ([single[]]@(82, 104, 82, 82, 94, 70, 118, 70))),
    (New-LinePath ([single[]]@(174, 104, 174, 82, 162, 70, 138, 70))),
    (New-LinePath ([single[]]@(82, 152, 82, 174, 94, 186, 118, 186))),
    (New-LinePath ([single[]]@(174, 152, 174, 174, 162, 186, 138, 186)))
  )
  foreach ($path in $paths) { $g.DrawPath($cropPen, $path); $path.Dispose() }
  $cropPen.Dispose()

  $markPath = New-BezierPath
  $markBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.PointF]::new(70, 170)), ([System.Drawing.PointF]::new(192, 116)), ([System.Drawing.ColorTranslator]::FromHtml('#9d623d')), ([System.Drawing.ColorTranslator]::FromHtml('#d59a67'))
  $markPen = New-Object System.Drawing.Pen $markBrush, 18
  $markPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $markPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawPath($markPen, $markPath)
  $markPen.Dispose()
  $markPath.Dispose()

  $nib = [System.Drawing.PointF[]]@(([System.Drawing.PointF]::new(164,126)),([System.Drawing.PointF]::new(188,147)),([System.Drawing.PointF]::new(170,169)),([System.Drawing.PointF]::new(146,148)))
  $g.FillPolygon($markBrush, $nib)
  $tipBrush = New-Object System.Drawing.SolidBrush $dark
  $tip = [System.Drawing.PointF[]]@(([System.Drawing.PointF]::new(184,146)),([System.Drawing.PointF]::new(194,155)),([System.Drawing.PointF]::new(181,160)))
  $g.FillPolygon($tipBrush, $tip)
  $tipBrush.Dispose()
  $markBrush.Dispose()

  $creamBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#fffaf2'))
  $centerPen = New-Object System.Drawing.Pen $dark, 7
  $g.FillEllipse($creamBrush, 118, 118, 20, 20)
  $g.DrawEllipse($centerPen, 118, 118, 20, 20)
  $creamBrush.Dispose()
  $centerPen.Dispose()
  $g.Dispose()
}

function Save-ResizedPng([System.Drawing.Bitmap]$Base, [int]$Size, [string]$Path) {
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppPArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($Base, 0, 0, $Size, $Size)
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

function Write-Ico([object[]]$Entries, [string]$Path) {
  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $bw = New-Object System.IO.BinaryWriter($fs)
  try {
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$Entries.Count)
    $offset = 6 + ($Entries.Count * 16)
    foreach ($entry in $Entries) {
      $sizeByte = if ($entry.Size -ge 256) { 0 } else { $entry.Size }
      $bw.Write([byte]$sizeByte)
      $bw.Write([byte]$sizeByte)
      $bw.Write([byte]0)
      $bw.Write([byte]0)
      $bw.Write([uint16]1)
      $bw.Write([uint16]32)
      $bw.Write([uint32]$entry.Bytes.Length)
      $bw.Write([uint32]$offset)
      $offset += $entry.Bytes.Length
    }
    foreach ($entry in $Entries) {
      $bw.Write($entry.Bytes)
    }
  } finally {
    $bw.Dispose()
    $fs.Dispose()
  }
}

New-Item -ItemType Directory -Force $AssetsDir | Out-Null
$base = New-Object System.Drawing.Bitmap $BaseSize, $BaseSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppPArgb)
Draw-Icon $base
$icoEntries = @()
foreach ($size in $Sizes) {
  $pngPath = Join-Path $AssetsDir "icon-$size.png"
  Save-ResizedPng $base $size $pngPath
  if ($size -le 256) {
    $icoEntries += [pscustomobject]@{ Size = $size; Bytes = [System.IO.File]::ReadAllBytes($pngPath) }
  }
}
Copy-Item -LiteralPath (Join-Path $AssetsDir 'icon-512.png') -Destination (Join-Path $AssetsDir 'icon.png') -Force
Write-Ico $icoEntries (Join-Path $AssetsDir 'icon.ico')
$base.Dispose()
Write-Host "Generated ShotNote icons in $AssetsDir"
