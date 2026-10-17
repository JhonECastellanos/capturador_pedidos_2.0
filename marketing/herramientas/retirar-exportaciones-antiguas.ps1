# Solo la limpieza expresamente autorizada de exportaciones del generador anterior.
$ErrorActionPreference = 'Stop'
$marketingRaiz = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($marketingRaiz -ne 'D:\Proyectos\Capturador_pedidos_2.0\marketing') { throw 'Raíz inesperada' }
$exportacionesRaiz = (Resolve-Path -LiteralPath (Join-Path $marketingRaiz 'recursos/exportaciones')).Path
$videosRaiz = (Resolve-Path -LiteralPath (Join-Path $marketingRaiz '14-produccion/videos')).Path
$objetivos = @(Get-ChildItem -LiteralPath $exportacionesRaiz -File | Where-Object { $_.Name -match '^\d{2}-(facebook|instagram|tiktok)-[123]-[AB](-[1-5])?\.(png|svg|json)$' })
$objetivos += @(Get-ChildItem -LiteralPath $videosRaiz -File | Where-Object { $_.Name -match '^(0[1-9]|10)-tiktok-2-B\.mp4$' })
if ($objetivos.Count -eq 0) { Write-Output 'No quedan exportaciones antiguas; se conserva el registro anterior.'; return }
foreach ($objetivo in $objetivos) {
 $absoluta = (Resolve-Path -LiteralPath $objetivo.FullName).Path
 if (!$absoluta.StartsWith($marketingRaiz + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Fuera de marketing: $absoluta" }
 if ($objetivo.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Enlace no permitido: $absoluta" }
 if ($objetivo.DirectoryName -notin @($exportacionesRaiz,$videosRaiz)) { throw "Directorio inesperado: $absoluta" }
}
$registro = @($objetivos | ForEach-Object { @{ ruta = $_.FullName; bytes = $_.Length } })
@{ fecha = (Get-Date).ToString('o'); autorizacion = 'Petición explícita del usuario'; archivos = $registro } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $marketingRaiz '14-produccion/limpieza-autorizada.json') -Encoding utf8
foreach ($objetivo in $objetivos) { Remove-Item -LiteralPath $objetivo.FullName }
Write-Output "Retirados $($objetivos.Count) archivos antiguos; originales preservados."
