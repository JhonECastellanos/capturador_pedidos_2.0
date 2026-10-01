param([string]$Destino = ".local/pruebas-voz")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$carpetaPrueba = [IO.Path]::GetFullPath((Join-Path (Get-Location) $Destino))
New-Item -ItemType Directory -Force -Path $carpetaPrueba | Out-Null
$sintetizadorPrueba = New-Object System.Speech.Synthesis.SpeechSynthesizer
$vozPrueba = $sintetizadorPrueba.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name.StartsWith("es") } | Select-Object -First 1
if (!$vozPrueba) { throw "No hay voz española local para los ejercicios sintéticos." }
$sintetizadorPrueba.SelectVoice($vozPrueba.VoiceInfo.Name)
$formatoPrueba = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$frasesPrueba = @(
  "quiero cinco yogures de durazno y uno de fresa",
  "me das cinco yogures de durazno y un yogur de fresa",
  "cinco yogures de durazno y uno de fresa",
  "necesito un yogur de fresa",
  "dame dos yogures de durazno",
  "quiero yogur de durazno",
  "dos pepsi de cuatrocientos mililitros",
  "confirmar operacion"
)
$ejerciciosPrueba = for ($iPrueba = 0; $iPrueba -lt $frasesPrueba.Length; $iPrueba++) {
  $nombrePrueba = "ejercicio-$iPrueba.wav"
  $sintetizadorPrueba.SetOutputToWaveFile((Join-Path $carpetaPrueba $nombrePrueba), $formatoPrueba)
  $sintetizadorPrueba.Speak($frasesPrueba[$iPrueba])
  $sintetizadorPrueba.SetOutputToNull()
  @{ archivo = $nombrePrueba; frase = $frasesPrueba[$iPrueba] }
}
$sintetizadorPrueba.Dispose()
$ejerciciosPrueba | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $carpetaPrueba "ejercicios.json") -Encoding utf8
Write-Output "Generados $($frasesPrueba.Length) ejercicios PCM 16 kHz en $carpetaPrueba. Audio sintético, no micrófono físico."
