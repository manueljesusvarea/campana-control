# CAMPAÑA CONTROL 3.0 · Lanza la copia diaria (respaldo_diario.mjs) en este ordenador con Windows.
#
# La primera vez:  powershell -ExecutionPolicy Bypass -File respaldo_diario.ps1 -Configurar
#   Pide (sin mostrarlos) la contraseña de la cuenta de respaldo y la frase de paso, y los guarda CIFRADOS con DPAPI
#   de Windows en %APPDATA%\CampanaControl\respaldo.xml: solo tu usuario de Windows en este ordenador puede leerlos.
#   No se guardan en el proyecto ni en git. Pide también la URL, la clave PÚBLICA, el usuario y la carpeta de destino.
# Después:         powershell -ExecutionPolicy Bypass -File respaldo_diario.ps1
#   (para que sea diaria, prográmalo en el Programador de tareas de Windows: ver docs/COPIAS_Y_RECUPERACION.md)
param([switch]$Configurar)
$ErrorActionPreference = "Stop"
$dir = Join-Path $env:APPDATA "CampanaControl"; $conf = Join-Path $dir "respaldo.xml"
if ($Configurar) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  $c = [ordered]@{
    url = Read-Host "URL del proyecto Supabase (https://….supabase.co)"
    clavePublica = Read-Host "Clave PÚBLICA (sb_publishable_…)"
    usuario = Read-Host "Usuario de la cuenta de respaldo (superadministrador)"
    clave = Read-Host "Contraseña de esa cuenta" -AsSecureString
    frase = Read-Host "Frase de paso para cifrar las copias (mínimo 12 caracteres; apúntala en un sitio seguro)" -AsSecureString
    destino = Read-Host "Carpeta de destino (mejor sincronizada fuera de este ordenador o en una memoria USB)"
  }
  if ($c.clavePublica -match "sb_secret|service_role") { throw "Pon la clave PÚBLICA, nunca una secreta." }
  [pscustomobject]$c | Export-Clixml -Path $conf    # las SecureString quedan cifradas con DPAPI (usuario + equipo)
  Write-Host "Configuración guardada (cifrada) en $conf"
  exit 0
}
if (-not (Test-Path $conf)) { throw "Primero: respaldo_diario.ps1 -Configurar" }
$c = Import-Clixml -Path $conf
$plano = { param($s) [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
# Las variables solo existen para este proceso y sus hijos; no quedan en el sistema ni en el historial
$env:CC_URL = $c.url; $env:CC_CLAVE_PUBLICA = $c.clavePublica; $env:CC_RESPALDO_USUARIO = $c.usuario; $env:CC_RESPALDO_DESTINO = $c.destino
$env:CC_RESPALDO_CLAVE = & $plano $c.clave; $env:CC_RESPALDO_FRASE = & $plano $c.frase
try { Push-Location $PSScriptRoot; node respaldo_diario.mjs; $codigo = $LASTEXITCODE } finally { Pop-Location; Remove-Item Env:CC_RESPALDO_CLAVE, Env:CC_RESPALDO_FRASE -ErrorAction SilentlyContinue }
exit $codigo
