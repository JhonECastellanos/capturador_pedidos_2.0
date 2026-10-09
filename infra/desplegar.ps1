param([switch]$Actualizar)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Docker {
  & docker.exe @args
  if ($LASTEXITCODE -ne 0) { throw "Docker falló: $($args -join ' ')" }
}
if (!(Test-Path -LiteralPath '.env')) { throw 'Falta .env. Configura .env.example con secretos propios.' }
if ($Actualizar) {
  $estado = & git status --porcelain
  if ($LASTEXITCODE -ne 0 -or $estado) { throw 'Revisa los cambios locales antes de actualizar.' }
  & git pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar el repositorio.' }
}
Docker compose config --quiet
Docker compose build api frontend
$postgres = & docker compose ps --status running -q postgres
if ($LASTEXITCODE -ne 0) { throw 'No se pudo revisar PostgreSQL.' }
if ($postgres) {
  New-Item -ItemType Directory -Force -Path '.local/backups' | Out-Null
  $marca = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
  $respaldo = ".local/backups/antes-despliegue-$marca.dump"
  # docker cp evita corromper el formato binario mediante redirección PowerShell.
  $usuarioBd = & docker compose exec -T postgres printenv POSTGRES_USER
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el usuario de BD.' }
  $nombreBd = & docker compose exec -T postgres printenv POSTGRES_DB
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el nombre de BD.' }
  Docker compose exec -T postgres pg_dump -U $usuarioBd.Trim() -d $nombreBd.Trim() -Fc -f /tmp/ambie-despliegue.dump
  Docker cp "${postgres}:/tmp/ambie-despliegue.dump" $respaldo
  if ((Get-Item -LiteralPath $respaldo).Length -eq 0) { throw 'Respaldo vacío.' }
  Write-Host "Respaldo creado: $respaldo"
}
Docker compose up -d --wait --wait-timeout 180
Docker compose ps
Write-Host 'Abre http://localhost:8080 (o el FRONTEND_PORT configurado).'
