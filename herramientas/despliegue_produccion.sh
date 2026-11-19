#!/usr/bin/env bash
# Construcción de la web de PRODUCCIÓN de la 3.0 en Cloudflare Pages (proyecto aparte del de pruebas).
# Cloudflare lo ejecuta SOLO con un «push» a la rama produccion/v3. Esa rama no recibe nada automáticamente:
# se actualiza a mano cuando el dueño aprueba una versión (avance rápido desde desarrollo/multiusuario-v3, ya
# probada en la beta). Si cualquier comprobación falla, no se publica y sigue en línea la versión anterior.
#
# Variables del proyecto de Cloudflare: CC_NUBE_URL y CC_NUBE_CLAVE (URL y clave PÚBLICA del Supabase de
# PRODUCCIÓN) y CC_ENTORNO=produccion. Nunca una clave secreta.
set -euo pipefail
cd "$(dirname "$0")/.."

[ "${CC_ENTORNO:-}" = "produccion" ] || { echo "Falta CC_ENTORNO=produccion en el proyecto de Cloudflare." >&2; exit 1; }
[ -n "${CC_NUBE_URL:-}" ] && [ -n "${CC_NUBE_CLAVE:-}" ] || { echo "Faltan CC_NUBE_URL y CC_NUBE_CLAVE." >&2; exit 1; }
case "${CF_PAGES_BRANCH:-produccion/v3}" in produccion/v3) ;; *) echo "Producción solo se construye desde produccion/v3 (rama: $CF_PAGES_BRANCH)." >&2; exit 1 ;; esac

echo "== 1/3 Pruebas de permisos e instalación limpia (PostgreSQL local, sin conectar a Supabase)"
( cd supabase/pruebas && npm ci --no-audit --no-fund && npm test && node instalacion.test.mjs )

echo "== 2/3 Construcción de www/ (entorno de producción)"
python3 herramientas/construir_www.py      # se niega si la URL es la del proyecto de pruebas

echo "== 3/3 Comprobaciones de lo publicado"
grep -q '"entorno": "produccion"' www/config-nube.js || { echo "config-nube.js no es de producción" >&2; exit 1; }
if grep -lE "sb_secret_|service_role|192\.168\.[0-9]+\.[0-9]+|rvpftigkagrtkfdzaixf" www/index.html www/sw.js www/config-nube.js www/manifest.webmanifest www/_headers; then
  echo "Hay claves secretas, direcciones locales o el proyecto de pruebas en www/" >&2; exit 1
fi
for f in index.html sw.js manifest.webmanifest config-nube.js _headers icons/icon-192.png icons/apple-touch-icon.png; do
  [ -s "www/$f" ] || { echo "Falta www/$f" >&2; exit 1; }
done
echo "Listo para publicar en producción: $(grep -o 'const APP_VERSION = "[^"]*"' www/index.html)"
