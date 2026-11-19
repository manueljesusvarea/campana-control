#!/usr/bin/env bash
# Construcción del ENTORNO DE PRUEBAS de la 3.0 en Cloudflare Pages (proyecto campana-control-v3-pruebas).
# Cloudflare lo ejecuta en cada «push» a la rama desarrollo/multiusuario-v3. La rama main (2.3.0 en
# GitHub Pages) no se despliega aquí. Si cualquier comprobación falla, Cloudflare no publica nada y la
# versión anterior sigue en línea.
#
# Variables del proyecto en Cloudflare (Settings → Variables): CC_NUBE_URL y CC_NUBE_CLAVE, la URL y la
# clave PÚBLICA (sb_publishable_…) del proyecto Supabase de pruebas. Nunca una clave secreta.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/3 Pruebas de permisos (PostgreSQL local con PGlite, sin conectar a Supabase)"
( cd supabase/pruebas && npm ci --no-audit --no-fund && npm test && node instalacion.test.mjs )

echo "== 2/3 Construcción de www/ con la configuración pública"
if [ -z "${CC_NUBE_URL:-}" ] || [ -z "${CC_NUBE_CLAVE:-}" ]; then
  echo "Faltan las variables CC_NUBE_URL y CC_NUBE_CLAVE en el proyecto de Cloudflare." >&2; exit 1
fi
python3 herramientas/construir_www.py

echo "== 3/3 Comprobaciones de lo publicado"
grep -q '"url": "https://' www/config-nube.js || { echo "config-nube.js sin configuración" >&2; exit 1; }
# (la librería supabase-js de vendor/ menciona «service_role» en su código: no se revisa)
if grep -lE "sb_secret_|service_role|192\.168\.[0-9]+\.[0-9]+" www/index.html www/sw.js www/config-nube.js www/manifest.webmanifest www/_headers; then echo "Hay claves secretas o direcciones locales en www/" >&2; exit 1; fi
for f in index.html sw.js manifest.webmanifest config-nube.js _headers icons/icon-192.png icons/apple-touch-icon.png; do
  [ -s "www/$f" ] || { echo "Falta www/$f" >&2; exit 1; }
done
echo "Listo para publicar: $(grep -o 'const APP_VERSION = "[^"]*"' www/index.html)"
