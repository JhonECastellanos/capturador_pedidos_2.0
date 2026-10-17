param([switch]$ReutilizarTunel)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location $taskRoot
try {
    New-Item -ItemType Directory -Path '.local' -Force | Out-Null
    $taskApiJson = docker.exe inspect abinova-api-1
    if ($LASTEXITCODE -ne 0) { throw 'Inicia primero la aplicación; este comando no instala ni migra bases de datos.' }
    $taskApi = ($taskApiJson | ConvertFrom-Json)[0]
    $taskCorsLine = $taskApi.Config.Env | Where-Object { $_ -like 'CORS_ALLOWED_ORIGIN=*' }
    $taskOrigins = @('http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:8792', 'http://127.0.0.1:8792')
    if ($taskCorsLine) { $taskOrigins += $taskCorsLine.Substring('CORS_ALLOWED_ORIGIN='.Length).Split(',') | Where-Object { $_ -and $_ -notlike '*trycloudflare.com*' } }
    $taskCompose = @('compose', '-p', 'abinova', '-f', 'docker-compose.yml', '-f', 'infra/cloudflare-validacion.yml')
    if (-not $ReutilizarTunel) {
        docker.exe @taskCompose --profile cloudflare up -d --no-deps --no-build --force-recreate cloudflared
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el túnel de validación.' }
    } else {
        $taskTunnelJson = docker.exe inspect abinova-cloudflared-1
        if ($LASTEXITCODE -ne 0) { throw 'No hay un túnel activo que reutilizar.' }
        $taskTunnel = ($taskTunnelJson | ConvertFrom-Json)[0]
        if (-not $taskTunnel.State.Running -or $taskTunnel.Config.Cmd -notcontains '--url') { throw 'El túnel existente no es una instancia temporal activa.' }
    }
    $taskOrigin = $null
    for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
        # cloudflared escribe avisos normales por stderr; no tratarlos como fallos de PowerShell 5.
        $taskPriorErrorAction = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $taskLogs = docker.exe logs --tail 200 abinova-cloudflared-1 2>&1 | Out-String
        $taskLogExit = $LASTEXITCODE
        $ErrorActionPreference = $taskPriorErrorAction
        if ($taskLogExit -ne 0) { throw 'No se pudieron consultar los avisos del túnel.' }
        $taskMatches = [regex]::Matches($taskLogs, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($taskMatches.Count) { $taskOrigin = $taskMatches[$taskMatches.Count-1].Value; break }
        Start-Sleep -Seconds 2
    }
    if (-not $taskOrigin) { throw 'Cloudflare no generó una dirección nueva. La aplicación local conserva sus datos.' }
    $taskOverride = @{ services = @{ api = @{ environment = @{
        APP_ORIGIN = $taskOrigin
        CORS_ALLOWED_ORIGIN = (@($taskOrigins) + $taskOrigin | Select-Object -Unique) -join ','
        COOKIE_SECURE = 'true'
    } } } } | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText((Join-Path $taskRoot '.local/tunel-inicial-actual.json'), $taskOverride, (New-Object System.Text.UTF8Encoding($false)))
    $taskRuntime = $taskCompose + @('-f', '.local/tunel-inicial-actual.json')
    docker.exe @taskRuntime up -d --no-deps --no-build --wait --wait-timeout 180 api frontend
    if ($LASTEXITCODE -ne 0) { throw 'El origen quedó configurado, pero hay que revisar la salud de API/frontend.' }
    [System.IO.File]::WriteAllText((Join-Path $taskRoot '.local/cloudflare-url-actual.txt'), $taskOrigin+"`n", (New-Object System.Text.UTF8Encoding($false)))
    Write-Output ('Aplicativo del cliente (web responsive y PWA): '+$taskOrigin+'/')
    Write-Output ('Panel de mando del operador: '+$taskOrigin+'/operador')
    Write-Output ('Landing comercial: '+$taskOrigin+'/comercial/')
    Write-Output 'Es temporal: vuelve a ejecutar este archivo si reinicias el túnel. Usa tu cuenta normal para acceder.'
} finally { Pop-Location }
