# Activa el usuario de base de datos de SOLO LECTURA «respaldo_lectura» (migración 000016) y guarda CC_DB_URL
# en el repositorio privado de copias. Lo ejecuta el dueño en su PC.
#
# Por qué así: producción registra las sentencias DDL (log_statement = ddl). Un «alter role … password 'texto'»
# dejaría la contraseña en claro en los registros de PostgreSQL. Este script genera la contraseña aquí, calcula su
# huella SCRAM-SHA-256 (la que PostgreSQL guarda) y solo esa huella va al editor SQL. La contraseña no se muestra:
# va directamente al secreto CC_DB_URL de GitHub. Si se pierde, basta con volver a ejecutar el script (la cambia).
#
# Uso:  powershell -ExecutionPolicy Bypass -File herramientas\respaldo\activar_lectura_bd.ps1
param([string]$PruebaClave, [string]$PruebaSal)   # solo para comprobar el cálculo con valores ficticios

$ErrorActionPreference = 'Stop'
$Proyecto = 'voxhvqysgzgpuvvsgecz'
$Pooler   = 'aws-0-eu-west-1.pooler.supabase.com:5432'
$Repo     = 'manueljesusvarea/campana-control-copias'

function Hmac([byte[]]$k, [byte[]]$d) { $h = New-Object Security.Cryptography.HMACSHA256 (,$k); $h.ComputeHash($d) }
function Scram([string]$clave, [byte[]]$sal) {
  $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes ([Text.Encoding]::UTF8.GetBytes($clave)), $sal, 4096, ([Security.Cryptography.HashAlgorithmName]::SHA256)
  $salted = $kdf.GetBytes(32)
  $stored = [Security.Cryptography.SHA256]::Create().ComputeHash((Hmac $salted ([Text.Encoding]::ASCII.GetBytes('Client Key'))))
  $server = Hmac $salted ([Text.Encoding]::ASCII.GetBytes('Server Key'))
  'SCRAM-SHA-256$4096:' + [Convert]::ToBase64String($sal) + '$' + [Convert]::ToBase64String($stored) + ':' + [Convert]::ToBase64String($server)
}

if ($PruebaClave) { Scram $PruebaClave ([Convert]::FromBase64String($PruebaSal)); return }

$rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
$b = New-Object byte[] 32; $rng.GetBytes($b); $clave = ($b | ForEach-Object { $_.ToString('x2') }) -join ''   # 64 caracteres hexadecimales: sin símbolos que romper en la URI
$sal = New-Object byte[] 16; $rng.GetBytes($sal)
$sql = "alter role respaldo_lectura with login password '" + (Scram $clave $sal) + "';"
Set-Clipboard -Value $sql

Write-Host ''
Write-Host 'PASO A: ya está copiada en el portapapeles la sentencia SQL (solo contiene la huella, no la contraseña).' -ForegroundColor Cyan
Write-Host '  1. Supabase, proyecto «campana-control» (PRODUCCIÓN) → SQL Editor → pestaña nueva (+).'
Write-Host '  2. Pega (Ctrl+V) y pulsa Run. Debe salir «Success. No rows returned».'
Write-Host '  3. Borra esa pestaña de consulta (botón derecho → Delete query).'
Read-Host 'Cuando esté hecho, pulsa Enter (o cierra esta ventana para cancelar sin guardar nada en GitHub)' | Out-Null
Set-Clipboard -Value ' '

$uri = "postgresql://respaldo_lectura.${Proyecto}:${clave}@${Pooler}/postgres"
$gh = Join-Path $env:LOCALAPPDATA 'Programs\gh\bin\gh.exe'
if (-not (Test-Path $gh)) { $gh = (Get-Command gh -ErrorAction Stop).Source }
$cred = "protocol=https`nhost=github.com`n`n" | git credential fill
$env:GH_TOKEN = (($cred | Where-Object { $_ -like 'password=*' }) -replace '^password=', '')
try {
  $uri | & $gh secret set CC_DB_URL -R $Repo
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar CC_DB_URL en GitHub' }
} finally { Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue }
$clave = $null; $uri = $null; $sql = $null
Write-Host ''
Write-Host 'PASO B hecho: CC_DB_URL guardado en GitHub con el usuario de solo lectura. La contraseña no se ha mostrado ni guardado en ningún otro sitio.' -ForegroundColor Green
