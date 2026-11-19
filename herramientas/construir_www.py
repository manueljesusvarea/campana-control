"""Genera www/index.html (app instalable) a partir de claude-artifact/campana-control.html.

La app es un único archivo. La versión de claude.ai (claude-artifact/) no lleva <head>: la plataforma
lo añade al publicar. Este script le pone la cabecera de app instalable (manifiesto, iconos, modo
pantalla completa) y registra el service worker para que funcione sin conexión.

Además cambia las librerías de cdnjs y las fuentes de Google por las copias locales de www/vendor/
y www/fonts/, para que la app funcione siempre sin conexión y dentro del APK. Solo en www/: el código
fuente sigue apuntando a cdnjs porque claude.ai lo necesita así.
  https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js  ->  vendor/jspdf/2.5.1/jspdf.umd.min.js
  https://fonts.googleapis.com/css2?family=...                          ->  fonts/fonts.css

Uso:  python herramientas/construir_www.py
"""
import hashlib, json, os, re, sys
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(RAIZ, "www")
SRC = os.path.join(RAIZ, "claude-artifact", "campana-control.html")
DST = os.path.join(WWW, "index.html")

HEAD = """<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{title}
<meta name="description" content="Control de la campaña de aceituna: partes diarios, horas, maquinaria, kilos, pagos y cuentas en PDF y Excel.">
<meta name="theme-color" content="#46561c">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/favicon.png">
<link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Campaña">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px system-ui,sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
</head><body>
"""
SW = """
<script>
// App instalable: funciona sin conexión una vez abierta (solo con https o en localhost).
// En el APK (Capacitor) no hace falta: los archivos ya están dentro de la app.
if ("serviceWorker" in navigator && !window.Capacitor && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").then(reg => {
    // Una app abierta durante días no recarga la página: al volver a ella se busca versión nueva (como mucho cada hora)
    let ultima = Date.now();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - ultima > 36e5) { ultima = Date.now(); reg.update().catch(() => {}); } });
  }).catch(() => {}));
  // Cuando se activa una versión nueva, esta página sigue con la anterior: se avisa para recargar cuando el usuario quiera
  let habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habia) { habia = true; return; }            // primera instalación: no hay nada que actualizar
    if (document.getElementById("avisoVersion")) return;
    const d = document.createElement("div"); d.id = "avisoVersion"; d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top,0px));z-index:70;background:var(--ink,#1c2113);color:var(--bg,#fff);padding:10px 14px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;max-width:92vw;font-weight:600";
    d.innerHTML = '<span>Hay una versión nueva de la app.</span><button type="button" class="btn sm pri">Actualizar</button>';
    d.querySelector("button").onclick = () => location.reload();   // si hay un parte sin guardar, el navegador lo avisa antes
    document.body.appendChild(d);
  });
}
</script>
</body></html>
"""
FUENTES = '<link rel="stylesheet" href="fonts/fonts.css">'

def existe(ruta):
    return os.path.isfile(os.path.join(WWW, *ruta.split("/")))

def a_local(body):
    """Cambia cdnjs y Google Fonts por las copias de www/vendor/ y www/fonts/."""
    def lib(m):
        ruta = "vendor/" + m.group(1)
        if not existe(ruta):
            sys.exit(f"Falta www/{ruta}. Cópiala desde node_modules (ver docs/PLAN.md, paso 1).")
        return f'src="{ruta}"'
    body = re.sub(r'src="https://cdnjs\.cloudflare\.com/ajax/libs/([^"]+)"', lib, body)
    # jsDelivr (paquetes npm): https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js
    #                        → vendor/supabase-js/2.119.0/supabase.js
    def npm(m):
        ruta = f"vendor/{m.group(1)}/{m.group(2)}/{m.group(3)}"
        if not existe(ruta):
            sys.exit(f"Falta www/{ruta}. Cópiala desde node_modules del paquete {m.group(1)}@{m.group(2)}.")
        return f'src="{ruta}"'
    body = re.sub(r'src="https://cdn\.jsdelivr\.net/npm/(?:@[^/"]+/)?([^@/"]+)@([^/"]+)/(?:[^"]*/)?([^/"]+)"', npm, body)
    # Configuración del modo con cuenta: solo en www/ (claude.ai no la usa). Se genera en escribir_config().
    body = body.replace('<script>\n"use strict";', '<script src="config-nube.js"></script>\n<script>\n"use strict";', 1)
    body = re.sub(r'<link rel="preconnect"[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*', "", body)
    body = re.sub(r'<link[^>]*href="https://fonts\.googleapis\.com/[^"]*"[^>]*>', FUENTES, body)
    externos = re.findall(r'(?:src|href)="(https?://[^"]+)"', body)
    if externos:
        sys.exit("Quedan recursos externos en www/index.html (cópialos en local): " + ", ".join(externos))
    return body

def archivos_sw():
    """Lista APP de sw.js: lo que el service worker guarda al instalarse."""
    sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
    m = re.search(r"const APP = \[(.*?)\];", sw, re.S)
    if not m:
        sys.exit("No encuentro la lista APP en www/sw.js.")
    return [r for r in re.findall(r'"\./([^"]*)"', m.group(1)) if r]

def comprobar_sw():
    """Si falta un archivo de la lista APP de sw.js, el service worker no se instala y la app no va sin conexión."""
    faltan = [r for r in archivos_sw() if not existe(r)]
    if faltan:
        sys.exit("www/sw.js guarda archivos que no existen: " + ", ".join(faltan))

def version_sw(version_app):
    """Pone en sw.js una VERSION con la huella del contenido de todos los archivos de APP.
    Si cambia cualquier archivo publicado, cambia sw.js y los dispositivos reciben la versión nueva:
    ya no hace falta acordarse de subirla a mano."""
    h = hashlib.sha256()
    for r in sorted(set(archivos_sw())):
        h.update(r.encode("utf-8") + b"\0")
        h.update(open(os.path.join(WWW, *r.split("/")), "rb").read())
    nueva = f'{version_app}-{h.hexdigest()[:10]}'
    ruta = os.path.join(WWW, "sw.js")
    sw = open(ruta, encoding="utf-8").read()
    sw2, n = re.subn(r'const VERSION = PREFIJO \+ "[^"]*";', f'const VERSION = PREFIJO + "{nueva}";', sw)
    if n != 1:
        sys.exit('No encuentro la línea const VERSION = PREFIJO + "…"; en www/sw.js.')
    if sw2 != sw:
        open(ruta, "w", encoding="utf-8", newline="\n").write(sw2)
    return nueva

PROYECTO_PRUEBAS = "rvpftigkagrtkfdzaixf"   # proyecto Supabase de pruebas (público): nunca puede ser «produccion»

def escribir_config():
    """Genera www/config-nube.js (modo con cuenta, versión 3.0).
    - supabase/config-app.local.json (ignorado por git): proyecto de PRUEBAS, solo en este ordenador.
    - supabase/config-app.json (se sube a git): proyecto de PRODUCCIÓN, cuando se autorice publicar la 3.0.
    - Variables de entorno CC_NUBE_URL y CC_NUBE_CLAVE (tienen prioridad): las define el despliegue de
      pruebas en Cloudflare Pages (rama desarrollo/multiusuario-v3), sin guardar la configuración en git.
    - Sin ninguno: window.CC_NUBE = null y la app funciona sin cuenta, como la 2.3.0.
    Solo admite la URL y la clave PÚBLICA (sb_publishable_…); nunca claves secretas."""
    cfg, origen = None, "sin cuenta"
    if os.environ.get("CC_NUBE_URL") or os.environ.get("CC_NUBE_CLAVE"):
        cfg = {"url": os.environ.get("CC_NUBE_URL", "").strip(), "clave": os.environ.get("CC_NUBE_CLAVE", "").strip()}
        origen = "variables de entorno CC_NUBE_URL / CC_NUBE_CLAVE"
    for nombre in (() if cfg else ("config-app.local.json", "config-app.json")):
        f = os.path.join(RAIZ, "supabase", nombre)
        if os.path.isfile(f):
            cfg, origen = json.load(open(f, encoding="utf-8")), nombre
            break
    if cfg:
        url, clave = cfg.get("url", ""), cfg.get("clave", "")
        if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url):
            sys.exit(f"{origen}: la URL no parece de Supabase.")
        if not clave.startswith("sb_publishable_") or re.search(r"secret|service_role", clave, re.I):
            sys.exit(f"{origen}: solo se admite la clave pública sb_publishable_ (nunca una secreta).")
        # Entorno: «produccion» solo si se pide expresamente (CC_ENTORNO=produccion) o con config-app.json (producción).
        # Todo lo demás se marca «pruebas» y la app lo enseña con una etiqueta bien visible.
        entorno = os.environ.get("CC_ENTORNO") or ("produccion" if origen == "config-app.json" else "pruebas")
        if entorno not in ("pruebas", "produccion"):
            sys.exit("CC_ENTORNO debe ser «pruebas» o «produccion».")
        if entorno == "produccion" and PROYECTO_PRUEBAS in url:
            sys.exit("Se ha pedido producción con el proyecto Supabase de PRUEBAS: no se construye nada.")
        cfg = {"url": url, "clave": clave, "entorno": entorno}
    js = ("// Generado por herramientas/construir_www.py (" + origen + "). No editar a mano.\n"
          "window.CC_NUBE = " + (json.dumps(cfg) if cfg else "null") + ";\n")
    open(os.path.join(WWW, "config-nube.js"), "w", encoding="utf-8", newline="\n").write(js)
    return origen

def main():
    print("Modo con cuenta:", escribir_config())
    src = open(SRC, encoding="utf-8").read()
    m = re.match(r"\s*(<title>.*?</title>)\s*", src, re.S)
    title = m.group(1) if m else "<title>CAMPAÑA CONTROL</title>"
    body = a_local(src[m.end():] if m else src)
    comprobar_sw()
    va = re.search(r'const APP_VERSION = "([^"]+)"', src)
    if not va:
        sys.exit("No encuentro APP_VERSION en el código fuente.")
    open(DST, "w", encoding="utf-8").write(HEAD.format(title=title) + body + SW)
    print("www/index.html generado (", len(body) // 1024, "KB )")
    print("Versión de caché del service worker:", version_sw(va.group(1)))

if __name__ == "__main__":
    main()
