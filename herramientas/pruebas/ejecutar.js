// Banco de pruebas automático de CAMPAÑA CONTROL.
//
// Abre la app web (www/) con Electron como navegador, servida en /campana-control/ igual que en GitHub Pages,
// y recorre las funciones principales con datos ficticios. Cada prueba usa perfiles propios dentro de una
// carpeta temporal: NUNCA toca los datos reales (ni localhost:8000 ni la app instalada).
//
// Uso (desde la carpeta del proyecto):
//   windows\node_modules\.bin\electron herramientas\pruebas\ejecutar.js            → todas
//   windows\node_modules\.bin\electron herramientas\pruebas\ejecutar.js fotos      → solo las que contienen «fotos»
// Resultado: tabla en la consola y herramientas/pruebas/resultado.json (no se sube a git).
"use strict";
const { app, BrowserWindow, session } = require("electron");
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");

const RAIZ = path.resolve(__dirname, "..", "..");
const WWW = path.join(RAIZ, "www");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cc-pruebas-"));
app.setPath("userData", path.join(TMP, "electron"));   // perfiles aislados, nunca los reales
const FILTRO = process.argv.slice(2).find(a => !a.startsWith("-")) || "";

/* ---------- Servidor estático en /campana-control/ ---------- */
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webmanifest": "application/manifest+json", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
// reemplazos: { "index.html": [[texto, nuevo]…] } simula publicar una versión nueva sin tocar www/
const SRV = { caido: false, swExtra: "", reemplazos: {}, peticiones: [], nube: false, nubeFalsa: false };
// La misma política de seguridad (CSP) que envía Cloudflare Pages (www/_headers): así las pruebas detectan si la bloquea algo.
const CSP = (() => { try { return (fs.readFileSync(path.join(WWW, "_headers"), "utf8").match(/^\s*Content-Security-Policy:\s*(.+)$/m) || [])[1]?.trim() || null; } catch (e) { return null; } })();
const servidor = http.createServer((req, res) => {
  if (SRV.caido) { req.socket.destroy(); return; }            // simula «sin conexión»
  const u = new URL(req.url, "http://x"); SRV.peticiones.push(u.pathname);
  if (u.pathname === "/campana-control") { res.writeHead(301, { Location: "/campana-control/" + u.search }); return res.end(); }   // como GitHub Pages
  if (!u.pathname.startsWith("/campana-control/")) { res.writeHead(404); return res.end(); }
  let rel = decodeURIComponent(u.pathname.slice("/campana-control/".length)) || "index.html";
  const f = path.join(WWW, rel);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("no existe"); }
  let cuerpo = fs.readFileSync(f);
  if (rel === "config-nube.js" && SRV.nubeFalsa) cuerpo = Buffer.from('window.CC_NUBE = {"url":"https://proyecto-simulado.supabase.co","clave":"sb_publishable_simulada"};\n');   // pantallas con respuestas simuladas, sin red
  else if (rel === "config-nube.js" && !SRV.nube) cuerpo = Buffer.from("window.CC_NUBE = null;\n");   // pruebas de la 2.3.0: sin cuenta
  if (rel === "sw.js" && SRV.swExtra) cuerpo = Buffer.concat([cuerpo, Buffer.from("\n// " + SRV.swExtra + "\n")]);
  for (const [a, b] of SRV.reemplazos[rel] || []) cuerpo = Buffer.from(cuerpo.toString("utf8").split(a).join(b));
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache", ...(CSP ? { "Content-Security-Policy": CSP } : {}) });
  res.end(cuerpo);
});
let BASE = "";

/* ---------- Ayudas ---------- */
const AYUDAS = `window.__t = {
  q: s => document.querySelector(s),
  dormir: ms => new Promise(r => setTimeout(r, ms)),
  async esperar(fn, ms = 6000, txt = "") { const t0 = Date.now(); let ultimo; while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) { ultimo = e; } await new Promise(r => setTimeout(r, 50)); } throw new Error("Tiempo agotado: " + (txt || fn) + (ultimo ? " (" + ultimo.message + ")" : "")); },
  async pulsar(sel) { const el = typeof sel === "string" ? document.querySelector(sel) : sel; if (!el) throw new Error("No existe " + sel); el.click(); await new Promise(r => setTimeout(r, 150)); },
  rellenar(sel, v) { const el = typeof sel === "string" ? document.querySelector(sel) : sel; if (!el) throw new Error("No existe " + sel); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); },
  texto: () => document.querySelector("#view").innerText,
  ir: async h => { location.hash = h; await new Promise(r => setTimeout(r, 120)); }
};`;
const ventanas = [];
const descargas = [];
const erroresConsola = [];
function prepararSesion(perfil) {
  const ses = session.fromPartition("persist:" + perfil);
  if (!ses.__preparada) {
    ses.__preparada = true;
    // Como programa (file://) la página no pasa por el servidor de pruebas: sin SRV.nube se simula un
    // www/ compilado sin cuenta (lo que hace GitHub Actions), aunque en este ordenador haya config de pruebas.
    ses.webRequest.onBeforeRequest({ urls: ["file:///*"] }, (d, cb) =>
      cb(!SRV.nube && /\/config-nube\.js$/.test(d.url) ? { redirectURL: "data:text/javascript,window.CC_NUBE%20%3D%20null%3B" } : {}));
    ses.on("will-download", (e, item) => {
      const dir = path.join(TMP, "descargas", perfil); fs.mkdirSync(dir, { recursive: true });
      const ruta = path.join(dir, Date.now() + "-" + item.getFilename()); item.setSavePath(ruta);
      item.once("done", (ev, estado) => descargas.push({ perfil, nombre: item.getFilename(), ruta, estado }));
    });
  }
  return ses;
}
async function abrir(perfil, { ruta = "", ancho = 1280, alto = 860, esperarApp = true, url = null } = {}) {
  prepararSesion(perfil);
  const win = new BrowserWindow({ show: false, width: ancho, height: alto, webPreferences: { partition: "persist:" + perfil, backgroundThrottling: false } });
  win.__perfil = perfil; ventanas.push(win);
  win.webContents.on("console-message", (ev) => { const nivel = ev.level ?? ev.params?.level; const msg = ev.message ?? ev.params?.message; if (nivel === "error" || nivel === 3) erroresConsola.push({ perfil, msg }); });
  await win.loadURL(url || BASE + "/campana-control/" + ruta);
  if (esperarApp) await listo(win);
  return win;
}
async function listo(win) {
  await win.webContents.executeJavaScript(AYUDAS + "; true");
  await ev(win, `await t.esperar(() => typeof MODE !== "undefined" && MODE === "local", 8000, "arranque de la app");`);
}
async function recargar(win) { await win.webContents.reload(); await new Promise(r => win.webContents.once("did-finish-load", r)); await listo(win); }
async function cerrar(win) { if (!win.isDestroyed()) { const p = new Promise(r => win.once("closed", r)); win.close(); await p; } }
async function ev(win, cuerpo) {
  const r = await win.webContents.executeJavaScript(`(async () => { const t = window.__t; try { return { v: await (async () => { ${cuerpo}
})() }; } catch (e) { return { error: (e && e.message) || String(e) }; } })()`, true);
  if (r && r.error) throw new Error(r.error); return r ? r.v : undefined;
}
async function esperarDescarga(perfil, desde, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const d = descargas.slice(desde).find(x => x.perfil === perfil); if (d) return d; await new Promise(r => setTimeout(r, 100)); }
  throw new Error("No llegó ninguna descarga");
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
function cerca(a, b, msg) { if (Math.abs(a - b) > 0.005) throw new Error(`${msg}: esperaba ${b} y salió ${a}`); }

/* ---------- Datos ficticios ---------- */
// Caso de control de docs/ENCARGO-MOVILES.md: 12 €/h al dueño, 10 €/h al trabajador, IVA 0,
// 7,5 h el día 15 y 6 h el 16; entrega de 20 € al trabajador y pago de 30 € del dueño el día 15.
async function crearCasoControlPorPantalla(win) {
  return ev(win, `
    await t.ir("#ajustes"); await t.pulsar('[data-act="nuevaCamp"]');
    t.rellenar('#fnc [name="nombre"]', "Campaña PRUEBA"); t.rellenar('#fnc [name="anio"]', "2026"); t.rellenar('#fnc [name="inicio"]', "2026-11-01");
    await t.pulsar('[data-act="crearCamp"]'); await t.esperar(() => camp(), 3000, "campaña creada");
    await t.ir("#ajustes"); await t.dormir(100);
    t.rellenar('#fcamp [name="horasDia"]', "7,5"); t.rellenar('#fcamp [name="precioHoraTrab"]', "10"); t.rellenar('#fcamp [name="precioHoraDueno"]', "12"); t.rellenar('#fcamp [name="iva"]', "0");
    await t.pulsar('[data-act="guardarCamp"]');
    await t.ir("#trabajadores"); await t.pulsar('[data-act="nuevoT"]'); t.rellenar('#ftrab [name="nombre"]', "Trabajador Ficticio"); await t.pulsar('[data-act="guardarT"]');
    await t.ir("#duenos"); await t.pulsar('[data-act="nuevoDueno"]'); t.rellenar('#fdueno [name="nombre"]', "Dueño Ficticio"); await t.pulsar('[data-act="guardarDueno"]');
    await t.ir("#partes"); await t.dormir(100);
    t.rellenar("#pfecha", "2026-11-15"); await t.dormir(150);
    await t.pulsar('[data-act="guardarParte"]');
    t.rellenar("#pfecha", "2026-11-16"); await t.dormir(150);
    const sel = document.querySelector('select[data-act="tipoT"]'); sel.value = "especial"; sel.dispatchEvent(new Event("change", { bubbles: true })); await t.dormir(120);
    t.rellenar('input[data-act="horasT"]', "6"); await t.pulsar('[data-act="guardarParte"]');
    const tid = Object.keys(S.trabajadores)[0], did = Object.keys(S.duenos)[0];
    await t.ir("#trabajadores"); UI.trabVer = null; render(); await t.pulsar('[data-act="verT"]'); await t.pulsar('[data-act="nuevoPago"][data-tipo="trabajador"]');
    t.rellenar('#fpago [name="importe"]', "20"); t.rellenar('#fpago [name="fecha"]', "2026-11-15"); await t.pulsar('[data-act="guardarPago"]');
    await t.ir("#duenos"); UI.dueVer = null; render(); await t.pulsar('[data-act="verDueno"]'); await t.pulsar('[data-act="nuevoPago"][data-tipo="dueno"]');
    t.rellenar('#fpago [name="importe"]', "30"); t.rellenar('#fpago [name="fecha"]', "2026-11-15"); await t.pulsar('[data-act="guardarPago"]');
    return { tid, did, partes: Object.keys(S.partes).length, pagos: Object.keys(S.pagos).length };`);
}
const PERIODOS = { q1: { desde: "2026-11-01", hasta: "2026-11-15" }, q2: { desde: "2026-11-16", hasta: "2026-11-30" }, mes: { desde: "2026-11-01", hasta: "2026-11-30" } };
const ESPERADO = { q1: { horas: 7.5, ganado: 75, trab: 55, dueno: 60 }, q2: { horas: 6, ganado: 60, trab: 60, dueno: 72 }, mes: { horas: 13.5, ganado: 135, trab: 115, dueno: 132 } };
// Imagen JPEG generada en la página (sin archivos externos)
const JPEG = (txt, w = 400, h = 300) => `(() => { const c = document.createElement("canvas"); c.width = ${w}; c.height = ${h}; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, ${w}, ${h}); x.fillStyle = "#46561c"; x.font = "40px sans-serif"; x.fillText(${JSON.stringify(txt)}, 20, ${h / 2}); return c; })()`;

/* ---------- Pruebas ---------- */
const PRUEBAS = [];
const prueba = (id, nombre, fn) => PRUEBAS.push({ id, nombre, fn });

prueba("carga", "Carga en /campana-control/, versión y sin recursos externos", async () => {
  const w = await abrir("carga");
  const r = await ev(w, `return { version: APP_VERSION, jspdf: !!window.jspdf?.jsPDF, autotable: typeof window.jspdf?.jsPDF?.API?.autoTable, xlsx: window.XLSX?.version,
    externos: performance.getEntriesByType("resource").map(e => e.name).filter(u => !u.startsWith(location.origin)), titulo: document.title };`);
  ok(r.jspdf && r.autotable === "function" && r.xlsx === "0.18.5", "librerías locales no cargadas: " + JSON.stringify(r));
  ok(r.externos.length === 0, "peticiones externas: " + r.externos.join(", "));
  return r;
});

prueba("calculos", "Caso de control (ENCARGO-MOVILES): horas, ganado y saldos por quincena", async () => {
  const w = await abrir("calculos");
  const ids = await crearCasoControlPorPantalla(w);
  ok(ids.partes === 2 && ids.pagos === 2, "no se crearon 2 partes y 2 pagos por pantalla: " + JSON.stringify(ids));
  const res = {};
  for (const [k, p] of Object.entries(PERIODOS)) {
    res[k] = await ev(w, `const tr = resumenTrab(${JSON.stringify(ids.tid)}, ${JSON.stringify(p)}); const du = cuentaDueno(${JSON.stringify(ids.did)}, ${JSON.stringify(p)});
      return { horas: tr.horas, ganado: tr.importe, trab: tr.pendiente, dueno: du.pendiente, cuentaDueno: du.total };`);
    cerca(res[k].horas, ESPERADO[k].horas, k + " horas"); cerca(res[k].ganado, ESPERADO[k].ganado, k + " ganado");
    cerca(res[k].trab, ESPERADO[k].trab, k + " pendiente trabajador"); cerca(res[k].dueno, ESPERADO[k].dueno, k + " pendiente dueño");
  }
  // Lo que se ve en pantalla (ficha del dueño, 2.ª quincena)
  const pant = await ev(w, `await t.ir("#duenos"); UI.dueVer = Object.keys(S.duenos)[0]; render(); await t.dormir(80);
    const chip = [...document.querySelectorAll('[data-act="perSet"]')].find(b => b.dataset.d === "2026-11-16"); await t.pulsar(chip);
    return document.querySelector(".saldo .resto").innerText;`);
  ok(/72,00/.test(pant), "la ficha del dueño (2.ª quincena) no muestra 72,00 €: " + pant);
  return { ...res, pantallaDueno2Q: pant.replace(/\s+/g, " ") };
});

prueba("crud", "Altas, cambios y bajas por pantalla; maquinaria y kilos «2.350»", async () => {
  const w = await abrir("crud");
  await crearCasoControlPorPantalla(w);
  const r = await ev(w, `
    // Cambio: renombrar al trabajador
    await t.ir("#trabajadores"); UI.trabVer = Object.keys(S.trabajadores)[0]; render(); await t.pulsar('[data-act="editT"]');
    t.rellenar('#ftrab [name="nombre"]', "Trabajador Renombrado"); await t.pulsar('[data-act="guardarT"]');
    // Alta y baja de otro trabajador
    UI.trabVer = null; await t.ir("#inicio"); await t.ir("#trabajadores"); await t.pulsar('[data-act="nuevoT"]'); t.rellenar('#ftrab [name="nombre"]', "Para Borrar"); await t.pulsar('[data-act="guardarT"]');
    const idB = Object.entries(S.trabajadores).find(([, v]) => v.nombre === "Para Borrar")[0];
    UI.trabVer = idB; render(); await t.pulsar('[data-act="editT"]'); await t.pulsar('[data-act="borrarT"]'); await t.pulsar("#cfOk");
    // Segundo dueño con maquinaria y kilos
    await t.ir("#duenos"); UI.dueVer = null; render(); await t.pulsar('[data-act="nuevoDueno"]'); t.rellenar('#fdueno [name="nombre"]', "Dueño Máquinas"); await t.pulsar('[data-act="guardarDueno"]');
    const d2 = Object.entries(S.duenos).find(([, v]) => v.nombre === "Dueño Máquinas")[0];
    UI.duenoSel = d2; await t.ir("#partes"); t.rellenar("#pfecha", "2026-11-17"); await t.dormir(150);
    UI.duenoSel = d2; UI.draft = null; render(); await t.dormir(80);
    await t.pulsar('[data-act="maqMas"][data-id="tractor"]'); await t.pulsar('[data-act="maqMas"][data-id="sopladora"]'); await t.pulsar('[data-act="maqMas"][data-id="sopladora"]');
    t.rellenar("#pkilos", "2.350"); await t.pulsar('[data-act="guardarParte"]');
    const k = cuentaDueno(d2, {});
    const guardado = JSON.parse(localStorage.getItem("campana-control-v1")).S;
    return { nombres: Object.values(guardado.trabajadores).map(x => x.nombre), kilos: k.kilos, tMaq: k.tMaq, tMano: k.tMano, total: k.total,
      parteKilos: guardado.partes[d2 + "_2026-11-17"]?.kilos, maquinas: guardado.partes[d2 + "_2026-11-17"]?.maquinas };`);
  ok(r.nombres.length === 1 && r.nombres[0] === "Trabajador Renombrado", "alta/cambio/baja de trabajador: " + JSON.stringify(r.nombres));
  ok(r.parteKilos === 2350 && r.kilos === 2350, "kilos «2.350» no guardados como 2350: " + r.parteKilos);
  cerca(r.tMaq, 60, "maquinaria (tractor 40 + 2 sopladoras × 10)"); cerca(r.tMano, 90, "mano de obra 7,5 h × 12 €");
  cerca(r.total, 150, "total cuenta dueño máquinas");
  return r;
});

prueba("persistencia", "Los datos siguen tras recargar y tras cerrar y volver a abrir", async () => {
  let w = await abrir("persistencia");
  await crearCasoControlPorPantalla(w);
  const antes = await ev(w, `return JSON.stringify(S);`);
  await recargar(w);
  const trasRecarga = await ev(w, `return JSON.stringify(S);`);
  await cerrar(w);
  w = await abrir("persistencia");
  const trasReabrir = await ev(w, `return JSON.stringify(S);`);
  ok(antes === trasRecarga, "los datos cambian al recargar"); ok(antes === trasReabrir, "los datos cambian al cerrar y reabrir");
  return { bytes: antes.length };
});

prueba("informes", "Informes: 4 tipos en PDF y en Excel, con importes del caso de control", async () => {
  const w = await abrir("informes");
  await crearCasoControlPorPantalla(w);
  const out = {};
  for (const tipo of ["dueno", "trab", "reg", "graf"]) {
    for (const fmt of ["Pdf", "Xls"]) {
      const n0 = descargas.length;
      await ev(w, `await t.ir("#informes"); UI.inf = { ...infDef(), tipo: ${JSON.stringify(tipo)}, desde: "2026-11-01", hasta: "2026-11-15" }; render(); await t.dormir(80); await t.pulsar('[data-act="inf${fmt}"]');`);
      const d = await esperarDescarga("informes", n0);
      const buf = fs.readFileSync(d.ruta);
      if (fmt === "Pdf") {
        const s = buf.toString("latin1");
        ok(s.startsWith("%PDF-"), tipo + ": no es un PDF");
        out[tipo + ".pdf"] = { nombre: d.nombre, bytes: buf.length, contiene55: /55,00/.test(s), contiene60: /60,00/.test(s) };
      } else {
        const hojas = await ev(w, `const wb = XLSX.read(${JSON.stringify(buf.toString("base64"))}, { type: "base64" }); return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })]));`);
        out[tipo + ".xlsx"] = { nombre: d.nombre, bytes: buf.length, hojas: Object.keys(hojas) };
        if (tipo === "dueno") { const fila = hojas.Resumen.find(f => f[0] === "Dueño Ficticio"); ok(fila && fila[11] === 60, "Excel dueños (1.ª quincena): pendiente debería ser 60: " + JSON.stringify(fila)); }
        if (tipo === "trab") { const fila = hojas.Resumen.find(f => f[0] === "Trabajador Ficticio"); ok(fila && fila[8] === 55, "Excel trabajadores (1.ª quincena): le queda debería ser 55: " + JSON.stringify(fila)); }
      }
    }
  }
  ok(out["dueno.pdf"].contiene60, "el PDF de dueños (1.ª quincena) no muestra 60,00");
  ok(out["trab.pdf"].contiene55, "el PDF de trabajadores (1.ª quincena) no muestra 55,00");
  return out;
});

prueba("fotos-migracion", "Migración de fotos antiguas (localStorage → IndexedDB) sin perder el documento", async () => {
  const w = await abrir("migracion");
  await ev(w, `const data = ${JPEG("ANTIGUA")}.toDataURL("image/jpeg", .6);
    const S0 = { ajustes: { general: { campanaActiva: "c1" } }, campanas: { c1: { nombre: "Campaña vieja", anio: 2026, inicio: "2026-11-01", horasDia: 7.5, horaInicio: "08:00", precioHoraTrab: 10, precioHoraDueno: 12, iva: 0, maquinas: [] } },
      trabajadores: { t1: { nombre: "José", activo: true } }, duenos: { d1: { campanaId: "c1", nombre: "Antonio", trabajadores: ["t1"], num: 1 } }, partes: {}, plantillas: {}, pagos: {},
      documentos: { doc1: { campanaId: "c1", duenoId: "d1", plantillaId: "gen-riesgos", nombre: "Doc antiguo", fecha: "2026-11-05", campos: {}, trabajadores: ["t1"], escaneos: [{ data }] } } };
    localStorage.setItem("campana-control-v1", JSON.stringify({ S: S0 }));`);
  await recargar(w);   // recarga real de la página (no un cambio de #)
  const r = await ev(w, `await t.esperar(() => S.documentos.doc1?.escaneos?.[0]?.foto, 4000, "migración");
    const guardado = localStorage.getItem("campana-control-v1");
    abrirDocumento("doc1"); await t.esperar(() => document.querySelector("#docThumbs img")?.naturalWidth, 3000, "miniatura");
    return { documento: !!S.documentos.doc1, escaneo: S.documentos.doc1.escaneos[0], claves: await fotoKeys(), dataURLenLocalStorage: guardado.includes("data:image"), miniatura: document.querySelector("#docThumbs img").naturalWidth };`);
  ok(r.documento, "el documento desapareció"); ok(!r.dataURLenLocalStorage, "la foto sigue en localStorage"); ok(r.claves.length === 1 && r.miniatura === 400, "la foto no está en IndexedDB o no se ve");
  await recargar(w);
  const r2 = await ev(w, `return { documento: !!S.documentos.doc1, foto: S.documentos.doc1?.escaneos?.[0], claves: await fotoKeys() };`);
  ok(r2.documento && r2.claves.length === 1 && r2.foto.foto === r.escaneo.foto, "tras una segunda recarga cambia el documento o se duplica la foto: " + JSON.stringify(r2));
  return { ...r, segundaRecarga: r2 };
});

prueba("fotos-copia", "Copia con fotos: exportar, importar en un perfil vacío, cuentas y PDF con fotos", async () => {
  const a = await abrir("copia-origen");
  await crearCasoControlPorPantalla(a);
  await ev(a, `const did = Object.keys(S.duenos)[0]; UI.dueVer = did; await t.ir("#duenos"); render(); await t.pulsar('[data-act="nuevoDoc"]'); await t.pulsar('[data-act="crearDoc"]');
    const blob = await new Promise(r => ${JPEG("PAPEL", 3000, 2000)}.toBlob(r, "image/jpeg", .9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "papel.jpg", { type: "image/jpeg" }));
    const inp = document.querySelector("#docFoto"); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
    await t.esperar(() => Object.values(S.documentos)[0]?.escaneos?.length === 1, 6000, "foto guardada");`);
  const n0 = descargas.length;
  await ev(a, `await t.ir("#ajustes"); await t.pulsar('[data-act="exportar"]');`);
  const d = await esperarDescarga("copia-origen", n0);
  const copia = JSON.parse(fs.readFileSync(d.ruta, "utf8"));
  ok(copia.app === "campana-control" && Object.keys(copia.fotos || {}).length === 1, "la copia no lleva la foto");
  const b = await abrir("copia-destino");
  await ev(b, `await t.ir("#ajustes"); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(JSON.stringify(copia))}], "copia.json", { type: "application/json" }));
    const inp = document.querySelector("#impCopia"); inp.files = dt.files; inp.dispatchEvent(new Event("change")); await t.esperar(() => document.querySelector("#cfOk"), 3000, "confirmación");
    await t.pulsar("#cfOk"); await t.esperar(() => Object.keys(S.documentos).length === 1, 6000, "importación");`);
  const r = await ev(b, `const tid = Object.keys(S.trabajadores)[0], did = Object.keys(S.duenos)[0]; const doc = Object.keys(S.documentos)[0];
    abrirDocumento(doc); await t.esperar(() => document.querySelector("#docThumbs img")?.naturalWidth, 4000, "miniatura importada");
    return { trabMes: resumenTrab(tid, ${JSON.stringify(PERIODOS.mes)}).pendiente, duenoMes: cuentaDueno(did, ${JSON.stringify(PERIODOS.mes)}).pendiente, partes: Object.keys(S.partes).length, pagos: Object.keys(S.pagos).length,
      foto: document.querySelector("#docThumbs img").naturalWidth + "x" + document.querySelector("#docThumbs img").naturalHeight, claves: (await fotoKeys()).length, doc };`);
  cerca(r.trabMes, 115, "pendiente del trabajador tras importar"); cerca(r.duenoMes, 132, "pendiente del dueño tras importar");
  ok(r.partes === 2 && r.pagos === 2 && r.claves === 1, "faltan partes, pagos o la foto tras importar: " + JSON.stringify(r));
  const n1 = descargas.length;
  await ev(b, `await t.pulsar('[data-act="pdfDoc"]');`);
  const pdf = fs.readFileSync((await esperarDescarga("copia-destino", n1)).ruta).toString("latin1");
  const imagenes = (pdf.match(/\/Subtype \/Image/g) || []).length;
  ok(imagenes >= 1, "el PDF del documento no lleva la foto");
  return { copia: { bytes: fs.statSync(d.ruta).size, version: copia.version, fotos: Object.keys(copia.fotos).length }, destino: r, imagenesEnPdf: imagenes };
});

prueba("copia-incompleta", "Exportar con una foto perdida: la copia debe avisar y no parecer completa", async () => {
  const w = await abrir("incompleta");
  await crearCasoControlPorPantalla(w);
  await ev(w, `const did = Object.keys(S.duenos)[0]; UI.dueVer = did; await t.ir("#duenos"); render(); await t.pulsar('[data-act="nuevoDoc"]'); await t.pulsar('[data-act="crearDoc"]');
    const blob = await new Promise(r => ${JPEG("PERDIDA")}.toBlob(r, "image/jpeg", .8)); const dt = new DataTransfer(); dt.items.add(new File([blob], "a.jpg", { type: "image/jpeg" }));
    const inp = document.querySelector("#docFoto"); inp.files = dt.files; inp.dispatchEvent(new Event("change")); await t.esperar(() => Object.values(S.documentos)[0]?.escaneos?.length === 1, 6000);
    closeModal(); for (const k of await fotoKeys()) await fotoDel(k);   // se pierde la imagen del almacén`);
  const n0 = descargas.length;
  await ev(w, `await t.ir("#ajustes"); await t.pulsar('[data-act="exportar"]');`);
  const d = await esperarDescarga("incompleta", n0);
  const copia = JSON.parse(fs.readFileSync(d.ruta, "utf8"));
  const aviso = await ev(w, `await t.dormir(3600); const m = document.querySelector("#modal"); return { modal: m.innerText, toast: document.querySelector("#toast").hidden ? "" : document.querySelector("#toast").innerText };`);
  const marcada = copia.fotosFaltan === 1 || copia.incompleta === true;
  ok(marcada, "la copia no indica que le falta una foto (campo fotosFaltan/incompleta)");
  ok(/foto/i.test(aviso.modal), "no hay un aviso persistente (ventana) de que falta una foto; solo: " + JSON.stringify(aviso));
  return { fotosEnCopia: Object.keys(copia.fotos || {}).length, fotosFaltan: copia.fotosFaltan, aviso };
});

prueba("multipestana", "Dos pestañas abiertas a la vez no se pisan los datos", async () => {
  const a = await abrir("pestanas"); const b = await abrir("pestanas");
  await ev(a, `await t.ir("#trabajadores"); await t.pulsar('[data-act="nuevoT"]'); t.rellenar('#ftrab [name="nombre"]', "Desde A"); await t.pulsar('[data-act="guardarT"]');`);
  await new Promise(r => setTimeout(r, 300));
  await ev(b, `await t.ir("#trabajadores"); await t.pulsar('[data-act="nuevoT"]'); t.rellenar('#ftrab [name="nombre"]', "Desde B"); await t.pulsar('[data-act="guardarT"]');`);
  const w = await abrir("pestanas");
  const nombres = await ev(w, `return Object.values(S.trabajadores).map(x => x.nombre).sort();`);
  const enA = await ev(a, `return Object.values(S.trabajadores).map(x => x.nombre).sort();`);
  ok(nombres.length === 2, "se perdió un trabajador al guardar desde otra pestaña: " + JSON.stringify(nombres));
  ok(enA.length === 2, "la pestaña A no ve lo que guardó la B: " + JSON.stringify(enA));
  return { guardado: nombres, pestanaA: enA };
});

prueba("datos-danados", "Si el almacenamiento está dañado, no se sobrescribe sin guardar una copia", async () => {
  const w = await abrir("danado");
  await ev(w, `localStorage.setItem("campana-control-v1", '{"S":{"trabajadores":{"t1":{"nombre":"Recuperable"'); `);
  await recargar(w);
  await ev(w, `await t.ir("#trabajadores"); await t.pulsar('[data-act="nuevoT"]'); t.rellenar('#ftrab [name="nombre"]', "Nuevo"); await t.pulsar('[data-act="guardarT"]');`);
  const r = await ev(w, `const claves = Object.keys(localStorage); return { claves, conservado: claves.some(k => (localStorage.getItem(k) || "").includes("Recuperable")) };`);
  ok(r.conservado, "el contenido dañado se perdió al guardar: " + JSON.stringify(r.claves));
  return r;
});

prueba("sin-conexion", "Sin conexión: reabrir la app, PDF y Excel desde la caché del service worker", async () => {
  const w = await abrir("offline");
  await ev(w, `await t.esperar(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", 8000, "service worker activo");`);
  await crearCasoControlPorPantalla(w);
  SRV.caido = true;
  try {
    await recargar(w);
    const n0 = descargas.length;
    const r = await ev(w, `const reg = await navigator.serviceWorker.getRegistration();
      await t.ir("#informes"); UI.inf = { ...infDef(), tipo: "dueno" }; render(); await t.dormir(80); await t.pulsar('[data-act="infPdf"]');
      return { version: APP_VERSION, controlado: !!navigator.serviceWorker.controller, alcance: reg?.scope, jspdf: !!window.jspdf, xlsx: !!window.XLSX, fuentes: [...document.fonts].filter(f => f.status === "loaded").length, partes: Object.keys(S.partes).length };`);
    const d = await esperarDescarga("offline", n0);
    ok(r.controlado && r.jspdf && r.xlsx && r.partes === 2, "la app sin conexión no funciona completa: " + JSON.stringify(r));
    ok(r.alcance.endsWith("/campana-control/"), "alcance del service worker inesperado: " + r.alcance);
    return { ...r, pdfSinConexion: d.nombre };
  } finally { SRV.caido = false; }
});

prueba("responsive", "Sin desbordes horizontales en móvil (390 px) y ordenador (1280 px)", async () => {
  const out = {};
  for (const [nombre, ancho, alto] of [["movil", 390, 844], ["ordenador", 1280, 860]]) {
    const w = await abrir("resp-" + nombre, { ancho, alto });
    await crearCasoControlPorPantalla(w);
    out[nombre] = await ev(w, `const r = {}; for (const h of ["inicio", "partes", "duenos", "trabajadores", "informes", "documentos", "ajustes"]) { UI.dueVer = null; UI.trabVer = null; await t.ir("#" + h); render(); await t.dormir(80);
      r[h] = { desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth, menu: getComputedStyle(document.querySelector(innerWidth < 900 ? "#tabs" : "#side")).display }; }
      return { ancho: innerWidth, rutas: r };`);
    for (const [h, v] of Object.entries(out[nombre].rutas)) { ok(v.desborde <= 1, `${nombre} · ${h}: la página se desborda ${v.desborde} px`); ok(v.menu !== "none", `${nombre} · ${h}: no se ve el menú`); }
  }
  return out;
});

prueba("actualizacion", "Versión nueva del service worker: caché antigua borrada y aviso para recargar", async () => {
  const w = await abrir("actualizacion");
  await ev(w, `await t.esperar(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", 8000, "service worker activo");
    await caches.open("cc-2.0.1");   // caché de una versión anterior de la app (antes de cambiar el nombre de las cachés)`);
  const antes = await ev(w, `return await caches.keys();`);
  SRV.swExtra = "nueva versión " + Date.now();
  const r = await ev(w, `const reg = await navigator.serviceWorker.getRegistration(); const viejo = navigator.serviceWorker.controller?.scriptURL; await reg.update();
    await t.esperar(() => document.querySelector("#avisoVersion"), 8000, "aviso de versión nueva");
    return { aviso: document.querySelector("#avisoVersion").innerText, caches: await caches.keys() };`).catch(e => ({ error: e.message }));
  SRV.swExtra = "";
  // El aviso llega al empezar a activarse; la limpieza de cachés termina un momento después
  const despues = await ev(w, `await t.esperar(async () => !(await caches.keys()).includes("cc-2.0.1"), 5000, "limpieza de cachés").catch(() => {}); return await caches.keys();`);
  ok(!r.error, "no aparece aviso de versión nueva: " + r.error);
  ok(!despues.includes("cc-2.0.1"), "la caché de la versión anterior (cc-2.0.1) no se borra: " + JSON.stringify(despues));
  return { antes, despues, aviso: r.aviso };
});

prueba("instalacion", "Aviso de instalación según el dispositivo, y oculto si ya está instalada", async () => {
  const out = {};
  const casos = [
    ["iphone-safari", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", /Añadir a pantalla de inicio/i],
    ["android-chrome", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", /Instalar|pantalla de inicio/i],
    ["windows-edge", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", /Instalar|instalador/i]
  ];
  for (const [nombre, ua, patron] of casos) {
    const ses = prepararSesion("inst-" + nombre); ses.setUserAgent(ua);
    const w = await abrir("inst-" + nombre, { ancho: nombre === "windows-edge" ? 1280 : 390 });
    out[nombre] = await ev(w, `await t.ir("#ajustes"); await t.dormir(100); const s = document.querySelector("#instalar"); return s ? s.innerText : "";`);
    ok(patron.test(out[nombre]), nombre + ": la sección de instalación no da las instrucciones adecuadas: " + JSON.stringify(out[nombre].slice(0, 200)));
  }
  // Ya instalada (modo app web en un Android): no debe insistir
  prepararSesion("inst-instalada").setUserAgent(casos[1][1]);
  const w = await abrir("inst-instalada", { ancho: 390 });
  out.instalada = await ev(w, `window.matchMedia = q => ({ matches: /standalone/.test(q), media: q, addEventListener() {}, removeEventListener() {} }); await t.ir("#inicio"); render(); await t.ir("#ajustes"); render(); await t.dormir(80);
    return { inicio: !!document.querySelector("#avisoInstalar"), ajustes: (document.querySelector("#instalar")?.innerText || "") };`);
  ok(!out.instalada.inicio, "con la app ya instalada sigue apareciendo el aviso de instalar en Inicio");
  ok(/instalada/i.test(out.instalada.ajustes), "con la app instalada, Ajustes no indica que ya está instalada");
  return out;
});

prueba("plataformas", "Compatibilidad simulada: APK (Capacitor) y claude.ai (window.claude)", async () => {
  // APK: se simula el puente de Capacitor después de cargar (lo que importa es entorno() y guardarArchivo())
  const a = await abrir("plat-apk", { ancho: 390 });
  const apk = await ev(a, `const llamadas = [];
    window.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile: async o => { llamadas.push("writeFile:" + o.directory + ":" + o.path); return { uri: "file:///cache/" + o.path }; } }, Share: { share: async o => { llamadas.push("share:" + o.files[0]); } } } };
    await t.ir("#ajustes"); render(); const seccion = document.querySelector("#instalar")?.innerText || "";
    await t.ir("#inicio"); render(); const avisoInicio = !!document.querySelector("#avisoInstalar");
    await guardarArchivo("prueba.txt", new Blob(["hola"]));
    delete window.Capacitor; return { seccion, avisoInicio, llamadas };`);
  ok(/app de Android/i.test(apk.seccion) && !apk.avisoInicio, "en el APK no reconoce que ya está instalada: " + JSON.stringify(apk));
  ok(apk.llamadas.length === 2 && apk.llamadas[1] === "share:file:///cache/prueba.txt", "en el APK no guarda y comparte el archivo: " + JSON.stringify(apk.llamadas));
  // claude.ai: window.claude existe antes de que arranque la app (se inyecta con un preload) y no ofrece servicios
  const pre = path.join(TMP, "preload-claude.js");
  fs.writeFileSync(pre, `require("electron").contextBridge.exposeInMainWorld("claude", { use: () => Promise.reject(new Error("no disponible en la prueba")) });`);
  const ses = prepararSesion("plat-claude");
  if (ses.registerPreloadScript) ses.registerPreloadScript({ type: "frame", filePath: pre }); else ses.setPreloads([pre]);
  const c = await abrir("plat-claude");
  const cl = await ev(c, `await t.ir("#ajustes"); render(); return { standalone: STANDALONE, modo: MODE, seccionInstalar: !!document.querySelector("#instalar"), banner: document.querySelector(".banner")?.innerText || "" };`);
  ok(cl.standalone === false && cl.modo === "local" && !cl.seccionInstalar, "en claude.ai no debe ofrecer instalar ni romper el arranque: " + JSON.stringify(cl));
  return { apk, claude: cl };
});

/* ---------- Verificación de publicación (6-11-2026) ---------- */
const SW_ACTIVO = `await t.esperar(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", 8000, "service worker activo");`;
const URL_ARCHIVO = () => require("url").pathToFileURL(path.join(WWW, "index.html")).href;   // como abre la página el programa de Windows
async function anadirDocConFoto(win, txt) {
  await ev(win, `const did = Object.keys(S.duenos)[0]; UI.dueVer = did; await t.ir("#duenos"); render(); await t.pulsar('[data-act="nuevoDoc"]'); await t.pulsar('[data-act="crearDoc"]');
    const blob = await new Promise(r => ${JPEG(txt, 1200, 900)}.toBlob(r, "image/jpeg", .85)); const dt = new DataTransfer(); dt.items.add(new File([blob], "papel.jpg", { type: "image/jpeg" }));
    const inp = document.querySelector("#docFoto"); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
    await t.esperar(() => Object.values(S.documentos).some(d => (d.escaneos || []).length), 6000, "foto guardada"); closeModal();`);
}
async function exportarCopia(win, perfil) {
  const n0 = descargas.length;
  await ev(win, `await t.ir("#ajustes"); render(); await t.pulsar('[data-act="exportar"]');`);
  return fs.readFileSync((await esperarDescarga(perfil, n0)).ruta, "utf8");
}
async function importarCopia(win, texto) {
  return ev(win, `await t.ir("#ajustes"); render(); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(texto)}], "copia.json", { type: "application/json" }));
    const inp = document.querySelector("#impCopia"); inp.files = dt.files; inp.dispatchEvent(new Event("change")); await t.esperar(() => document.querySelector("#cfOk"), 3000, "confirmación");
    const aviso = document.querySelector("#modal").innerText; await t.pulsar("#cfOk"); await t.esperar(() => /importada/i.test(document.querySelector("#toast").innerText), 8000, "importación"); return aviso;`);
}
const ESTADO = `const tid = Object.entries(S.trabajadores).find(([, v]) => v.nombre === "Trabajador Ficticio")?.[0], did = Object.keys(S.duenos)[0];
  const doc = Object.keys(S.documentos)[0]; let foto = "";
  if (doc) { abrirDocumento(doc); await t.esperar(() => document.querySelector("#docThumbs img")?.naturalWidth, 4000, "miniatura"); const im = document.querySelector("#docThumbs img"); foto = im.naturalWidth + "x" + im.naturalHeight; closeModal(); }
  return { trabMes: tid ? resumenTrab(tid, ${JSON.stringify(PERIODOS.mes)}).pendiente : null, duenoMes: did ? cuentaDueno(did, ${JSON.stringify(PERIODOS.mes)}).pendiente : null,
    partes: Object.keys(S.partes).length, pagos: Object.keys(S.pagos).length, fotosIDB: (await fotoKeys()).length, foto };`;

prueba("rutas", "Rutas en /campana-control/: sin barra final, enlaces directos a cada sección, con y sin conexión", async () => {
  const w0 = await abrir("rutas", { url: BASE + "/campana-control" });          // GitHub Pages redirige a la barra final
  const sinBarra = await ev(w0, `return location.pathname;`);
  ok(sinBarra === "/campana-control/", "/campana-control sin barra no lleva a la app: " + sinBarra);
  await ev(w0, SW_ACTIVO); await crearCasoControlPorPantalla(w0); await cerrar(w0);
  const secciones = ["inicio", "partes", "duenos", "trabajadores", "informes", "documentos", "ajustes"];
  let comprobadas = 0;
  for (const conexion of ["con conexión", "sin conexión"]) {
    SRV.caido = conexion === "sin conexión";
    try {
      for (const h of secciones) for (const pref of ["", "index.html", "index.html?utm_source=prueba"]) {
        const w = await abrir("rutas", { url: BASE + "/campana-control/" + pref + "#" + h });
        const r = await ev(w, `await t.dormir(60); return { ruta: route(), titulo: document.querySelector("#view h1")?.innerText || "", partes: Object.keys(S.partes).length };`);
        ok(r.ruta === h && r.titulo && r.partes === 2, `${conexion} · /campana-control/${pref}#${h}: ${JSON.stringify(r)}`);
        comprobadas++; await cerrar(w);
      }
    } finally { SRV.caido = false; }
  }
  return { sinBarra, comprobadas };
});

prueba("manifest-iconos", "Manifiesto válido para Chrome, iconos con su tamaño real y metadatos de iPhone", async () => {
  const w = await abrir("manifest");
  await ev(w, SW_ACTIVO + " await t.dormir(300);");
  const dbg = w.webContents.debugger; dbg.attach("1.3");
  let man, inst;
  try { man = await dbg.sendCommand("Page.getAppManifest"); inst = await dbg.sendCommand("Page.getInstallabilityErrors"); } finally { dbg.detach(); }
  const r = await ev(w, `const base = document.querySelector('link[rel=manifest]').href; const m = await (await fetch(base)).json();
    const medir = src => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth + "x" + i.naturalHeight); i.onerror = () => res("ERROR"); i.src = new URL(src, base).href; });
    const iconos = {}; for (const ic of m.icons) iconos[ic.src + " · " + ic.purpose] = { declarado: ic.sizes, real: await medir(ic.src) };
    const at = document.querySelector('link[rel="apple-touch-icon"]'); iconos["apple-touch-icon"] = { declarado: at.getAttribute("sizes"), real: await medir(at.getAttribute("href")) };
    iconos.favicon = { declarado: "", real: await medir(document.querySelector('link[rel="icon"]').getAttribute("href")) };
    const start = new URL(m.start_url, base).href;
    return { iconos, id: new URL(m.id, start).href, start, scope: new URL(m.scope, base).href, display: m.display,
      metas: ["apple-mobile-web-app-capable", "apple-mobile-web-app-title", "apple-mobile-web-app-status-bar-style", "mobile-web-app-capable", "theme-color", "viewport"].map(n => n + "=" + (document.querySelector('meta[name="' + n + '"]')?.content || "FALTA")) };`);
  ok(!(man.errors || []).length, "errores al leer el manifiesto: " + JSON.stringify(man.errors));
  for (const [k, v] of Object.entries(r.iconos)) ok(v.real !== "ERROR" && (!v.declarado || v.declarado === v.real), `icono ${k}: declarado ${v.declarado}, real ${v.real}`);
  ok(r.start.endsWith("/campana-control/index.html") && r.scope.endsWith("/campana-control/") && r.id === r.start, "start_url, scope o id fuera de /campana-control/: " + JSON.stringify([r.start, r.scope, r.id]));
  ok(!r.metas.some(m => m.endsWith("FALTA")), "falta un metadato: " + r.metas.join(", "));
  return { erroresManifiesto: man.errors, erroresInstalabilidadChrome: inst.installabilityErrors, ...r };
});

prueba("actualizacion-datos", "Publicar una versión nueva: la app se actualiza y conserva datos y fotos (también sin conexión)", async () => {
  const w = await abrir("act-datos");
  await ev(w, SW_ACTIVO); await crearCasoControlPorPantalla(w); await anadirDocConFoto(w, "ANTES");
  const foto = w => ev(w, `return { S: JSON.stringify(S), fotos: (await fotoKeys()).sort().join(","), version: APP_VERSION, caches: (await caches.keys()).filter(n => n.startsWith("campana-control:")).map(n => n.split(":").pop()) };`);
  const antes = await foto(w);
  // «Publicar» una versión nueva: cambia la versión de index.html y, como hace construir_www.py, la VERSION de sw.js
  const V = fs.readFileSync(path.join(WWW, "index.html"), "utf8").match(/const APP_VERSION = "([^"]+)"/)[1];   // versión actual, sea cual sea
  SRV.reemplazos = { "index.html": [[`const APP_VERSION = "${V}"`, 'const APP_VERSION = "9.9.9-prueba"']], "sw.js": [[`+ "${V}-`, '+ "9.9.9-prueba-']] };
  try {
    await ev(w, `const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); await t.esperar(() => document.querySelector("#avisoVersion"), 8000, "aviso de versión nueva");`);
    const carga = new Promise(r => w.webContents.once("did-finish-load", r));
    await w.webContents.executeJavaScript(`document.querySelector("#avisoVersion button").click(); true`);   // el usuario pulsa «Actualizar»
    await carga; await listo(w);
    const despues = await foto(w);
    ok(despues.version === "9.9.9-prueba", "tras «Actualizar» sigue la versión " + despues.version);
    ok(despues.S === antes.S, "los datos cambiaron al actualizar");
    ok(despues.fotos === antes.fotos && despues.fotos, "las fotos cambiaron al actualizar");
    ok(despues.caches.length === 1 && despues.caches[0].startsWith("9.9.9-prueba"), "cachés tras actualizar: " + JSON.stringify(despues.caches));
    SRV.caido = true;
    await recargar(w);
    const sinRed = await foto(w);
    ok(sinRed.version === "9.9.9-prueba" && sinRed.S === antes.S, "sin conexión no abre la versión nueva con los datos");
    return { antes: { version: antes.version, caches: antes.caches }, despues: { version: despues.version, caches: despues.caches }, datosIguales: true, fotos: despues.fotos.split(",").length, sinConexion: sinRed.version };
  } finally { SRV.caido = false; SRV.reemplazos = {}; }
});

prueba("almacenes", "Almacenamientos independientes: misma app en otra dirección, otro perfil o como programa (file://)", async () => {
  const web = await abrir("alm-web"); await crearCasoControlPorPantalla(web);
  const cuenta = w => ev(w, `return Object.keys(S.trabajadores).length + Object.keys(S.partes).length + Object.keys(S.pagos).length;`);
  const r = {
    otraPestanaMismoOrigenYPerfil: await cuenta(await abrir("alm-web")),
    mismoPerfilOtraDireccion_localhost: await cuenta(await abrir("alm-web", { url: BASE.replace("127.0.0.1", "localhost") + "/campana-control/" })),
    mismaDireccionOtroPerfilONavegador: await cuenta(await abrir("alm-otro-navegador")),
    paginaDeArchivo_comoProgramaWindows: await cuenta(await abrir("alm-programa", { url: URL_ARCHIVO() }))
  };
  ok(r.otraPestanaMismoOrigenYPerfil === 5, "otra pestaña del mismo origen y perfil no ve los datos: " + JSON.stringify(r));
  ok(r.mismoPerfilOtraDireccion_localhost === 0 && r.mismaDireccionOtroPerfilONavegador === 0 && r.paginaDeArchivo_comoProgramaWindows === 0, "se comparten datos entre entornos que deberían ser independientes: " + JSON.stringify(r));
  return r;
});

prueba("transferencia", "Cambio de instalación con copia (con fotos): web → programa de Windows (file://) → otra web", async () => {
  const web = await abrir("tr-web"); await crearCasoControlPorPantalla(web); await anadirDocConFoto(web, "TRASPASO");
  const origen = await ev(web, ESTADO);
  const copia1 = await exportarCopia(web, "tr-web");
  const prog = await abrir("tr-programa", { url: URL_ARCHIVO() });
  const aviso1 = await importarCopia(prog, copia1);
  const enPrograma = await ev(prog, ESTADO);
  ok(JSON.stringify(enPrograma) === JSON.stringify(origen), "web → programa: no coincide " + JSON.stringify({ origen, enPrograma }));
  // En el programa se anota una entrega más y se vuelve a pasar a otra instalación web vacía
  await ev(prog, `const tid = Object.entries(S.trabajadores).find(([, v]) => v.nombre === "Trabajador Ficticio")[0]; UI.trabVer = tid; await t.ir("#trabajadores"); render();
    await t.pulsar('[data-act="nuevoPago"][data-tipo="trabajador"]'); t.rellenar('#fpago [name="importe"]', "15"); t.rellenar('#fpago [name="fecha"]', "2026-11-20"); await t.pulsar('[data-act="guardarPago"]');`);
  const copia2 = await exportarCopia(prog, "tr-programa");
  const web2 = await abrir("tr-web-nueva");
  await importarCopia(web2, copia2);
  const enWeb2 = await ev(web2, ESTADO);
  ok(enWeb2.trabMes === origen.trabMes - 15 && enWeb2.pagos === origen.pagos + 1 && enWeb2.foto === origen.foto && enWeb2.fotosIDB === 1, "programa → web: " + JSON.stringify(enWeb2));
  return { origen, enPrograma, enWebNueva: enWeb2, avisoImportar: aviso1.replace(/\s+/g, " ").slice(0, 160), bytesCopia: [copia1.length, copia2.length] };
});

prueba("migracion-v3", "Versión 3.0 con cuenta configurada: un dispositivo con datos de la 2.3.0 sigue abriendo sus datos", async () => {
  SRV.nube = true;   // config-nube.js real (proyecto de pruebas): ningún paso de esta prueba inicia sesión ni llama al servidor
  try {
    const modo = async (w, esperado) => { await w.webContents.executeJavaScript(AYUDAS + "; true"); await ev(w, `await t.esperar(() => typeof MODE !== "undefined" && MODE === ${JSON.stringify(esperado)}, 8000, "modo ${esperado}");`); };
    const recargarSin = async w => { await w.webContents.reload(); await new Promise(r => w.webContents.once("did-finish-load", r)); };
    // 1) Dispositivo nuevo: pantalla de entrar
    const nuevo = await abrir("m3-nuevo", { esperarApp: false }); await modo(nuevo, "cuenta");
    const pantalla = await ev(nuevo, `return { entrar: !!document.querySelector("#fentrar [name=usuario]"), sinCuenta: !!document.querySelector('[data-act="nSinCuenta"]') };`);
    ok(pantalla.entrar && pantalla.sinCuenta, "dispositivo nuevo sin pantalla de entrar: " + JSON.stringify(pantalla));
    // 2) Dispositivo que ya usaba la 2.3.0 (datos guardados y sin preferencia de modo)
    const v23 = await abrir("m3-v23", { esperarApp: false }); await modo(v23, "cuenta");
    await ev(v23, `localStorage.setItem("campana-control-modo", "local"); return true;`); await recargarSin(v23); await listo(v23);
    await crearCasoControlPorPantalla(v23);
    const cuenta = w => ev(w, `return Object.keys(S.trabajadores).length + Object.keys(S.partes).length + Object.keys(S.pagos).length;`);
    const antes = await cuenta(v23);
    await ev(v23, `localStorage.removeItem("campana-control-modo"); return true;`);
    await recargarSin(v23); await listo(v23);
    const despues = await cuenta(v23);
    ok(antes > 0 && despues === antes, `datos de la 2.3.0 no visibles al abrir: antes ${antes}, después ${despues}`);
    await ev(v23, `await t.ir("#ajustes"); render(); return true;`);
    const boton = await ev(v23, `return !!document.querySelector('[data-act="nConCuenta"]');`);
    ok(boton, "Ajustes no ofrece entrar con cuenta");
    // 3) Elegir «Entrar con mi cuenta»: la elección se recuerda y los datos locales no se borran
    await ev(v23, `document.querySelector('[data-act="nConCuenta"]').click(); return true;`);
    await new Promise(r => v23.webContents.once("did-finish-load", r)); await modo(v23, "cuenta");
    const tras = await ev(v23, `return { pref: localStorage.getItem("campana-control-modo"), datos: localStorage.getItem("campana-control-v1") != null, entrar: !!document.querySelector("#fentrar") };`);
    ok(tras.pref === "cuenta" && tras.datos && tras.entrar, "al elegir cuenta: " + JSON.stringify(tras));
    return { nuevo: pantalla, registros: { antes, despues }, trasElegirCuenta: tras };
  } finally { SRV.nube = false; }
});

/* ---------- Versión 3.0: prueba real contra el proyecto Supabase de PRUEBAS (solo con filtro «nube») ----------
   Cuentas privadas: usuario y contraseña, sin correo. Necesita conexión, supabase/config-app.local.json y el
   superadministrador de pruebas en supabase/pruebas/.cuentas-pruebas.json (propietario). Cada ventana es un
   dispositivo con su propio almacenamiento y su propia sesión. Todo se hace pulsando la app contra la base real. */
const pruebaRed = (id, nombre, fn) => PRUEBAS.push({ id, nombre, fn, red: true });
// Con URL_PUBLICADA=https://… la misma prueba se hace contra la web publicada (Cloudflare Pages) en vez del servidor local.
const URL_PUBLICADA = process.env.URL_PUBLICADA ? process.env.URL_PUBLICADA.replace(/\/?$/, "/") : null;
pruebaRed("nube-sesiones", "3.0 real: superadministrador → creador → cuentas; editor y lector; trabajador y jefe; bloqueo; restablecer; tiempo real", async () => {
  const fijas = JSON.parse(fs.readFileSync(path.join(RAIZ, "supabase", "pruebas", ".cuentas-pruebas.json"), "utf8"));
  ok(fijas.propietario && !fijas.propietario.temporal, "falta el superadministrador de pruebas (node real.test.mjs lo prepara)");
  const run = Date.now().toString(36).slice(-5), clave = () => require("crypto").randomBytes(12).toString("base64url");
  SRV.nube = true;
  try {
    const dispositivo = async (perfil, ancho, alto) => {
      const w = await abrir(perfil + "-" + run, { esperarApp: false, ancho, alto, url: URL_PUBLICADA });
      await w.webContents.executeJavaScript(AYUDAS + "; true");
      await ev(w, `await t.esperar(() => typeof MODE !== "undefined" && MODE === "cuenta" && t.q("#fentrar"), 15000, "pantalla de entrar"); return true;`);
      return w;
    };
    const aviso = `" · aviso: «" + (t.q("#toast")?.textContent || "") + "»"`;
    const entrar = (w, usuario, password) => ev(w, `t.rellenar('#fentrar [name="usuario"]', ${JSON.stringify(usuario)}); t.rellenar('#fentrar [name="password"]', ${JSON.stringify(password)});
      await t.pulsar('[data-act="nEntrar"]'); try { await t.esperar(() => NUBE.sesion && NUBE.perfil && !t.q("#fentrar"), 20000, "entrar"); } catch (e) { throw new Error(e.message + ${aviso}); }
      return { id: NUBE.sesion.user.id, temporal: !!NUBE.perfil.debe_cambiar_clave, clave: !!t.q("#fclave") };`);
    const ponerClave = (w, actual, nueva) => ev(w, `await t.esperar(() => t.q("#fclave"), 8000, "pantalla de contraseña");
      t.rellenar('#fclave [name="actual"]', ${JSON.stringify(actual)}); t.rellenar('#fclave [name="p1"]', ${JSON.stringify(nueva)}); t.rellenar('#fclave [name="p2"]', ${JSON.stringify(nueva)});
      await t.pulsar('[data-act="nGuardarClave"]'); try { await t.esperar(() => NUBE.perfil && !NUBE.perfil.debe_cambiar_clave && !t.q("#fclave"), 20000, "poner la contraseña"); } catch (e) { throw new Error(e.message + ${aviso}); }
      return true;`);
    // Crear usuario desde «Gestión de usuarios» y leer la contraseña temporal que se muestra una sola vez
    const crearUsuario = (w, d) => ev(w, `await t.ir("#usuarios"); render(); await t.esperar(() => t.q("#fusuario") && NUBE.usuarios, 15000, "gestión de usuarios");
      const sel = async (n, v) => { if (!t.q('#fusuario [name="' + n + '"]')) return; t.rellenar('#fusuario [name="' + n + '"]', v); await t.dormir(150); };
      ${d.tipo ? `await sel("tipo", ${JSON.stringify(d.tipo)});` : ""}
      ${d.rol ? `await sel("campana", ${JSON.stringify(d.campana)}); await sel("rol", ${JSON.stringify(d.rol)});` : ""}
      ${d.ficha ? `await t.esperar(() => [...t.q('#fusuario [name="ficha"]').options].some(o => o.value === ${JSON.stringify(d.ficha)}), 15000, "fichas"); t.rellenar('#fusuario [name="ficha"]', ${JSON.stringify(d.ficha)});` : ""}
      t.rellenar('#fusuario [name="nombre"]', ${JSON.stringify(d.nombre)}); t.rellenar('#fusuario [name="usuario"]', ${JSON.stringify(d.usuario)});
      await t.pulsar('[data-act="nCrearUsuario"]'); let c; try { c = await t.esperar(() => t.q("#codigoInv")?.innerText.trim(), 20000, "contraseña temporal"); } catch (e) { throw new Error(e.message + ${aviso}); }
      const u = t.q("#credUsuario").innerText.trim(); await t.pulsar('[data-act="cerrar"]'); return { usuario: u, clave: c };`);
    const accionCuenta = (w, accion, usuario) => ev(w, `await t.ir("#usuarios"); NUBE.usuarios = null; render(); await t.esperar(() => t.q('[data-usuario="${usuario}"] [data-act="${accion}"]'), 15000, "cuenta en la lista");
      t.q("#toast").textContent = ""; t.q('[data-usuario="${usuario}"] [data-act="${accion}"]').click(); await t.esperar(() => t.q("#cfOk"), 5000, "confirmación"); t.q("#cfOk").click();
      ${accion === "nRestablecer" ? `const c = await t.esperar(() => t.q("#codigoInv")?.innerText.trim(), 20000, "contraseña temporal"); await t.pulsar('[data-act="cerrar"]'); return c;`
        : `await t.esperar(() => /bloqueada|desbloqueada/i.test(t.q("#toast").textContent), 20000, "bloqueo"); return t.q("#toast").textContent;`}`);

    // 1) Superadministrador en el ordenador: crea la cuenta de un creador
    const pcSa = await dispositivo("e2e-superadmin", 1280, 860);
    await entrar(pcSa, fijas.propietario.usuario, fijas.propietario.password);
    const credGestor = await crearUsuario(pcSa, { tipo: "creador", nombre: "Gestor E2E", usuario: "gestor.e2e." + run });
    ok(credGestor.usuario === "gestor.e2e." + run && credGestor.clave.length === 12, "credenciales del creador: " + JSON.stringify({ ...credGestor, clave: credGestor.clave.length }));

    // 2) El creador en su móvil: usuario + temporal → pone la suya → crea campaña, fichas y cuentas
    const movil = await dispositivo("e2e-creador-android", 390, 844);
    const e1 = await entrar(movil, credGestor.usuario, credGestor.clave);
    ok(e1.temporal && e1.clave, "el creador no tuvo que cambiar la temporal: " + JSON.stringify(e1));
    const claveGestor = clave(); await ponerClave(movil, credGestor.clave, claveGestor);
    const nombreCamp = "Campaña E2E " + run;
    await ev(movil, `await t.ir("#campanas"); render(); await t.esperar(() => t.q("#fnueva"), 15000, "puede crear campañas"); t.rellenar('#fnueva [name="nombre"]', ${JSON.stringify(nombreCamp)}); t.rellenar('#fnueva [name="horas"]', "8");
      t.rellenar('#fnueva [name="ptrab"]', "10"); t.rellenar('#fnueva [name="pdueno"]', "12"); await t.pulsar('[data-act="nCrearCampana"]');
      await t.esperar(() => NUBE.c?.nombre === ${JSON.stringify(nombreCamp)} && NUBE.d, 20000, "crear campaña"); return true;`);
    const fichas = await ev(movil, `await t.ir("#n-personas"); render();
      for (const n of ["Trabajador E2E Uno", "Trabajador E2E Dos"]) { const k = NUBE.d.trab.length; t.rellenar('#fntrab [name="nombre"]', n); await t.pulsar('[data-act="nAltaTrab"]'); await t.esperar(() => NUBE.d.trab.length === k + 1, 15000, "alta " + n); }
      for (const n of ["Dueño E2E", "Dueño E2E Dos"]) { const k = NUBE.d.duenos.length; t.rellenar('#fndueno [name="nombre"]', n); await t.pulsar('[data-act="nAltaDueno"]'); await t.esperar(() => NUBE.d.duenos.length === k + 1, 15000, "alta " + n); }
      const id = n => NUBE.d.trab.find(x => x.nombre === n).id, idD = n => NUBE.d.duenos.find(x => x.nombre === n).id;
      return { c: NUBE.c.campana_id, t1: id("Trabajador E2E Uno"), t2: id("Trabajador E2E Dos"), d: idD("Dueño E2E"), d2: idD("Dueño E2E Dos") };`);
    const cred = {};
    for (const [k, rol, ficha] of [["lector", "admin"], ["editor", "admin+"], ["jefe", "jefe"], ["trab1", "trabajador", fichas.t1], ["dueno", "dueno", fichas.d]])
      cred[k] = await crearUsuario(movil, { nombre: k + " E2E", usuario: k + ".e2e." + run, campana: fichas.c, rol, ficha });

    // 3) Cada persona en su dispositivo: entra con la temporal y pone la suya
    const disp = { lector: await dispositivo("e2e-lector-windows", 1280, 860), editor: await dispositivo("e2e-editor-pc", 1280, 860),
      jefe: await dispositivo("e2e-jefe-movil", 390, 844), trab1: await dispositivo("e2e-trab-iphone", 390, 844), dueno: await dispositivo("e2e-dueno-movil", 390, 844) };
    const claves = {};
    for (const k of Object.keys(disp)) {
      const e = await entrar(disp[k], cred[k].usuario, cred[k].clave); ok(e.temporal, k + " entró sin tener que cambiar la temporal");
      await ponerClave(disp[k], cred[k].clave, claves[k] = clave());
      await ev(disp[k], `await t.esperar(() => NUBE.c && NUBE.d, 20000, "su campaña"); return true;`);
    }
    const permisos = await ev(disp.editor, `return { vistas: nubeVistas().map(x => x[0]), edita: nEdita() };`), permisosL = await ev(disp.lector, `return { vistas: nubeVistas().map(x => x[0]), edita: nEdita() };`);
    ok(permisos.edita && permisos.vistas.includes("parte") && !permisosL.edita && !permisosL.vistas.includes("parte"), "vistas: " + JSON.stringify({ permisos, permisosL }));
    // El creador asigna el trabajador Dos al jefe (otro equipo distinto del trabajador Uno)
    const idJefe = await ev(disp.jefe, `return NUBE.sesion.user.id;`);
    await ev(movil, `await t.esperar(() => NUBE.d.miembros.some(m => m.user_id === ${JSON.stringify(idJefe)}), 20000, "el creador ve al jefe"); await t.ir("#n-personas"); render();
      t.rellenar('#fnasig [name="jefe"]', ${JSON.stringify(idJefe)}); t.rellenar('#fnasig [name="trab"]', ${JSON.stringify(fichas.t2)}); await t.pulsar('[data-act="nAsignar"]');
      await t.esperar(() => NUBE.d.asig.length === 1, 15000, "asignar equipo"); return true;`);

    // 4) El creador anota el parte (2 trabajadores, 8 h); el editor lo modifica desde su ordenador
    await ev(disp.trab1, `await t.ir("#n-mis-jornadas"); render(); return true;`); await ev(disp.lector, `await t.ir("#n-inicio"); render(); return true;`); await ev(disp.jefe, `await t.ir("#n-equipo"); render(); return true;`);
    const p1 = await ev(movil, `await t.ir("#n-parte"); render(); await t.esperar(() => t.q('[data-act="nGuardarParte"]'), 8000, "parte");
      if (t.q('[data-np="dueno"]').value !== ${JSON.stringify(fichas.d)}) { t.rellenar('[data-np="dueno"]', ${JSON.stringify(fichas.d)}); await t.esperar(() => t.q('[data-np="dueno"]')?.value === ${JSON.stringify(fichas.d)} && t.q('[data-act="nGuardarParte"]'), 8000, "parte del dueño 1"); }
      t.rellenar('[data-np="kilos"]', "2.350"); t.rellenar(t.q('[data-np="maq"]'), "1"); await t.pulsar('[data-act="nGuardarParte"]'); await t.esperar(() => NUBE.d.partes.length === 1, 20000, "guardar parte"); return NUBE.d.partes[0].version;`);
    const t0 = Date.now();
    const p2 = await ev(disp.editor, `await t.esperar(() => NUBE.d.partes.length === 1, 20000, "el editor recibe el parte"); NUBE.borrador = null; await t.ir("#n-parte"); render();
      await t.esperar(() => t.q('[data-np="tipo"][data-id="${fichas.t1}"]'), 8000, "parte en el editor");
      t.rellenar('[data-np="tipo"][data-id="${fichas.t1}"]', "mas"); await t.dormir(200); await t.pulsar('[data-act="nGuardarParte"]');
      await t.esperar(() => NUBE.d.partes[0].version === ${p1} + 1, 20000, "guardar como editor"); return NUBE.d.partes[0].version;`);
    ok(p2 === p1 + 1, "el editor no pudo modificar la jornada");
    // 5) Lo ven al momento, cada uno lo suyo
    const trab = await ev(disp.trab1, `await t.esperar(() => NUBE.d.resumen && +NUBE.d.resumen.horas === 9, 20000, "el trabajador recibe su jornada"); render();
      return { ms: Date.now(), horas: +NUBE.d.resumen.horas, importe: NUBE.d.resumen.importe_cent, texto: t.texto(), otros: NUBE.d.filas.length + NUBE.d.trab.length };`);
    ok(trab.horas === 9 && trab.importe === 9000 && /90,00\s*€/.test(trab.texto) && !trab.otros && !/Trabajador E2E Dos/.test(trab.texto), "trabajador: " + JSON.stringify({ ...trab, texto: trab.texto.slice(0, 160) }));
    const lect = await ev(disp.lector, `await t.esperar(() => NUBE.d.partes[0]?.version === ${p2}, 20000, "el lector recibe el cambio"); render();
      const api = await NUBE.sb.from("partes_filas").update({ horas: 1 }).eq("campana_id", NUBE.c.campana_id).select();
      return { horas: NUBE.d.filas.reduce((s, f) => s + hFila(f, nHd()), 0), boton: !!t.q('[data-act="nAbrirParte"]'), api: !!api.error || !(api.data || []).length };`);
    ok(lect.horas === 17 && !lect.boton && lect.api, "lector: " + JSON.stringify(lect));
    const jef = await ev(disp.jefe, `await t.esperar(() => (NUBE.d.equipo || []).length === 1, 20000, "el jefe recibe su equipo"); render(); return { equipo: NUBE.d.equipo.map(x => x.trabajador), texto: t.texto() };`);
    ok(jef.equipo.join() === "Trabajador E2E Dos" && !/Trabajador E2E Uno/.test(jef.texto), "jefe: " + JSON.stringify(jef.equipo));
    // 5b) El dueño solo ve su cuenta: la de otro dueño y los datos privados de los trabajadores se rechazan en el servidor
    const due = await ev(disp.dueno, `await t.esperar(() => NUBE.d.cuenta && +NUBE.d.cuenta.horas === 17, 20000, "el dueño recibe su cuenta"); await t.ir("#n-mi-cuenta"); render();
      const otro = await NUBE.sb.rpc("cuenta_dueno", { p_campana: NUBE.c.campana_id, p_dueno: ${JSON.stringify(fichas.d2)} });
      const priv = await NUBE.sb.from("trabajadores_privado").select("*"), pagos = await NUBE.sb.from("pagos").select("*");
      const parte = await NUBE.sb.from("partes_filas").update({ horas: 1 }).eq("campana_id", NUBE.c.campana_id).select();
      return { dueno: NUBE.d.cuenta.dueno, horas: +NUBE.d.cuenta.horas, total: NUBE.d.cuenta.mano_cent, otro: !!otro.error, priv: (priv.data || []).length, pagos: (pagos.data || []).length,
        edita: !(parte.error || !(parte.data || []).length), vistas: nubeVistas().map(x => x[0]), texto: /Dueño E2E Dos/.test(t.texto()) };`);
    ok(due.dueno === "Dueño E2E" && due.horas === 17 && due.total === 20400 && due.otro && !due.priv && !due.pagos && !due.edita && due.vistas.join() === "mi-cuenta,documentos" && !due.texto, "dueño: " + JSON.stringify(due));

    // 5d) Pagos y entregas (creador) e informes de cada rol: mismos cálculos que la 2.3.0, PDF y Excel en el dispositivo
    const pagar = (persona, importe, tipo) => ev(movil, `await t.ir("#n-pagos"); render(); await t.esperar(() => t.q("#fnpago"), 8000, "pagos");
      const k = NUBE.d.pagos.length; t.rellenar('#fnpago [name="tipo"]', ${JSON.stringify(tipo)}); t.rellenar('#fnpago [name="persona"]', ${JSON.stringify(persona)});
      t.rellenar('#fnpago [name="importe"]', ${JSON.stringify(importe)}); await t.pulsar('[data-act="nGuardarPago"]'); await t.esperar(() => NUBE.d.pagos.length === k + 1, 15000, "guardar pago"); return true;`);
    await pagar("t:" + fichas.t1, "25", "trabajador"); await pagar("d:" + fichas.d, "50", "dueno");
    const bajar = async (w, codigo, txt) => { const n0 = descargas.length; await ev(w, codigo); const dsc = await esperarDescarga(w.__perfil, n0, 20000);
      ok(dsc.estado === "completed" && fs.statSync(dsc.ruta).size > 1500, txt + ": descarga " + JSON.stringify(dsc)); return dsc; };
    const archivos = [];
    // Creador: los 4 informes de la 2.3.0 en PDF y Excel; cifras iguales a las del servidor (cuenta_dueno)
    const cmp = await ev(movil, `await t.ir("#n-informes"); render(); await t.esperar(() => t.q('[data-act="infPdf"]'), 8000, "informes");
      const k = conS(snConsulta(), () => cuentaDueno(${JSON.stringify(fichas.d)}, {})), r = conS(snConsulta(), () => resumenTrab(${JSON.stringify(fichas.t1)}, {}));
      const srv = await NUBE.sb.rpc("cuenta_dueno", { p_campana: NUBE.c.campana_id, p_dueno: ${JSON.stringify(fichas.d)} });
      return { total: k.total, horas: k.horas, maq: k.tMaq, pagado: k.pagado, pendiente: k.pendiente, srvTotal: srv.data.total_cent / 100, srvPend: srv.data.pendiente_cent / 100, srvMaq: srv.data.maquinaria_cent / 100,
        trab: { horas: r.horas, importe: r.importe, entregado: r.entregado, pendiente: r.pendiente }, local: Object.keys(S.partes).length, texto: t.texto().includes("Dueño E2E") };`);
    ok(Math.abs(cmp.total - cmp.srvTotal) < 0.005 && Math.abs(cmp.pendiente - cmp.srvPend) < 0.005 && Math.abs(cmp.maq - cmp.srvMaq) < 0.005 && cmp.horas === 17 && cmp.pagado === 50 && cmp.texto, "cuenta del dueño app/servidor: " + JSON.stringify(cmp));
    ok(cmp.trab.horas === 9 && cmp.trab.importe === 90 && cmp.trab.entregado === 25 && cmp.trab.pendiente === 65 && cmp.local === 0, "cuenta del trabajador o datos locales tocados: " + JSON.stringify(cmp));
    for (const tipo of ["dueno", "trab", "reg", "graf"]) for (const f of ["infPdf", "infXls"])
      archivos.push((await bajar(movil, `UI.inf.tipo = ${JSON.stringify(tipo)}; render(); await t.dormir(100); t.q('[data-act="${f}"]').click(); return true;`, "creador " + tipo + " " + f)).nombre);
    // Trabajador, dueño y jefe: sus propios informes y su gráfica por quincena
    const rol = async (w, k, vista) => { await ev(w, `await t.ir("#n-${vista}"); NUBE.borrador = null; await nubeCargar(); render(); await t.esperar(() => t.q('[data-act="nInfRol"]') && t.q('[data-grafica]'), 15000, "informes de ${k}"); return true;`);
      for (const f of ["pdf", "xls"]) archivos.push((await bajar(w, `t.q('[data-act="nInfRol"][data-f="${f}"]').click(); return true;`, k + " " + f)));
      return archivos.slice(-2); };
    const [, trabXls] = await rol(disp.trab1, "trab", "mis-jornadas");
    const [, dueXls] = await rol(disp.dueno, "dueno", "mi-cuenta");
    const [, jefeXls] = await rol(disp.jefe, "equipo", "equipo");
    const hojas = async (w, dsc) => ev(w, `const wb = XLSX.read(${JSON.stringify(fs.readFileSync(dsc.ruta).toString("base64"))}, { type: "base64" });
      return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })]));`);
    const ht = await hojas(disp.trab1, trabXls), hd = await hojas(disp.dueno, dueXls), hj = await hojas(disp.jefe, jefeXls);
    const filaT = ht.Resumen.find(x => x[0] === "Trabajador E2E Uno"), totD = hd.Resumen.find(x => x[0] === "TOTAL");
    ok(filaT && filaT[4] === 9 && filaT[6] === 90 && filaT[7] === 25 && filaT[8] === 65 && !JSON.stringify(ht).includes("Trabajador E2E Dos"), "Excel del trabajador: " + JSON.stringify(filaT));
    ok(totD && Math.abs(totD[9] - cmp.srvTotal) < 0.005 && totD[10] === 50 && !JSON.stringify(hd).includes("Dueño E2E Dos"), "Excel del dueño: " + JSON.stringify(totD));
    ok(!JSON.stringify(hj).includes("Importe") && !JSON.stringify(hj).includes("€") && !JSON.stringify(hj).includes("Trabajador E2E Uno"), "Excel del jefe con dinero o con otro equipo: " + JSON.stringify(hj).slice(0, 300));

    // 5f0) Modelos de documento con cuenta
    const modelo = await ev(movil, `await t.ir("#n-documentos"); NUBE.docAbierto = null; render(); await t.esperar(() => t.q('[data-act="nNuevoModelo"]'), 8000, "modelos");
      await t.pulsar('[data-act="nNuevoModelo"]'); await t.esperar(() => t.q("#fmodelo"), 5000, "editor de modelo");
      t.rellenar('#fmodelo [name="nombre"]', "Modelo E2E"); t.rellenar('#fmodelo [name="asesoria"]', "Asesoría E2E"); t.rellenar('#fmodelo [name="titulo"]', "Contrato de {{finca}}");
      t.q('#fmodelo [name="cuerpo"]').value = "Entre {{empresa}} y {{dueno}}. Precio pactado: {{precio}}."; t.q('#fmodelo [name="campos"]').value = "precio | Precio pactado | 12 €/h";
      await t.pulsar('[data-act="nGuardarModelo"]'); await t.esperar(() => NUBE.d.plantillas.some(p => p.nombre === "Modelo E2E"), 15000, "modelo guardado");
      const id = NUBE.d.plantillas.find(p => p.nombre === "Modelo E2E").id; NUBE.modeloAbierto = null; render();
      t.rellenar('#fndoc [name="dueno"]', ${JSON.stringify(fichas.d)}); t.rellenar('#fndoc [name="modelo"]', id); await t.pulsar('[data-act="nCrearDoc"]');
      await t.esperar(() => NUBE.d.docs.some(x => x.plantilla_ref === id), 15000, "documento con el modelo");
      NUBE.docAbierto = null; NUBE.modeloAbierto = id; render(); await t.pulsar('[data-act="nBorrarModelo"]'); await t.esperar(() => t.q("#cfOk"), 5000, "confirmar"); t.q("#cfOk").click();
      await t.esperar(() => /usan este modelo/.test(t.q("#toast").textContent), 15000, "no se borra en uso");
      NUBE.modeloAbierto = null; await nubeCargar(); render(); return { sigue: NUBE.d.plantillas.some(p => p.id === id), campos: NUBE.d.plantillas.find(p => p.id === id).campos };`);
    ok(modelo.sigue && modelo.campos[0]?.clave === "precio", "modelos: " + JSON.stringify(modelo));
    // 5f) Documentos y fotos privadas por rol: el dueño ve la suya; el lector la ve; trabajador y jefe no pueden leerla
    const foto = await ev(movil, `await t.ir("#n-documentos"); NUBE.docAbierto = null; render(); await t.esperar(() => t.q("#fndoc"), 8000, "documentos");
      t.rellenar('#fndoc [name="dueno"]', ${JSON.stringify(fichas.d)}); t.rellenar('#fndoc [name="modelo"]', "gen-riesgos"); const k = NUBE.d.docs.length; await t.pulsar('[data-act="nCrearDoc"]'); await t.esperar(() => NUBE.docAbierto && NUBE.d.docs.length === k + 1, 15000, "crear documento");
      const f = new File([await new Promise(r => ${JPEG("PARTE EN PAPEL", 1200, 900)}.toBlob(r, "image/jpeg", .9))], "papel.jpg", { type: "image/jpeg" });
      await nSubirFoto(NUBE.docAbierto, f); return NUBE.d.fotos.find(x => x.documento_id === NUBE.docAbierto)?.ruta;`);
    ok(foto, "no se subió la foto del documento");
    const leer = w => ev(w, `const r = await NUBE.sb.storage.from("fotos").download(${JSON.stringify(foto)}); const fl = await NUBE.sb.from("fotos").select("id"); const dc = await NUBE.sb.from("documentos").select("id");
      return { foto: !r.error && r.data?.size > 1000, filas: (fl.data || []).length, docs: (dc.data || []).length };`);
    const vista = { dueno: await leer(disp.dueno), lector: await leer(disp.lector), trabajador: await leer(disp.trab1), jefe: await leer(disp.jefe) };
    ok(vista.dueno.foto && vista.dueno.docs === 2 && vista.lector.foto && !vista.trabajador.foto && !vista.trabajador.filas && !vista.jefe.foto && !vista.jefe.docs,
      "acceso a fotos por rol: " + JSON.stringify(vista));
    const subeDueno = await ev(disp.dueno, `const r = await NUBE.sb.storage.from("fotos").upload(NUBE.c.campana_id + "/intruso.jpg", new Blob(["x"], { type: "image/jpeg" })); const d = await NUBE.sb.storage.from("fotos").remove([${JSON.stringify(foto)}]);
      const sigue = await NUBE.sb.storage.from("fotos").download(${JSON.stringify(foto)}); return { subir: !r.error, borrar: !sigue.error && !!sigue.data };`);
    ok(!subeDueno.subir && subeDueno.borrar, "el dueño pudo subir o borrar fotos: " + JSON.stringify(subeDueno));
    // 5e) Sincronización sin depender del tiempo real y casos de seguridad con la app abierta
    // · Cambios simultáneos: el editor tiene el parte abierto y modificado; el creador lo guarda antes → el editor recibe «conflicto» y no pisa nada
    const conflicto = await ev(disp.editor, `nubeDesuscribir(); await t.ir("#n-parte"); NUBE.borrador = null; render(); await t.esperar(() => t.q('[data-np="kilos"]'), 8000, "parte del editor");
      t.rellenar('[data-np="kilos"]', "9.999"); return NUBE.borrador.version;`);
    await ev(movil, `const p = NUBE.d.partes[0]; const r = await NUBE.sb.rpc("guardar_parte", { p_campana: NUBE.c.campana_id, p_dueno: p.dueno_id, p_fecha: p.fecha, p_version: p.version, p_kilos: 3000, p_notas: "del creador",
      p_filas: NUBE.d.filas.filter(f => f.parte_id === p.id).map(f => ({ trabajador_id: f.trabajador_id, tipo: f.tipo, horas: f.horas, nota: f.nota })), p_maquinas: NUBE.d.pmaq.filter(m => m.parte_id === p.id) }); if (r.error) throw new Error(r.error.message); return true;`);
    const conf = await ev(disp.editor, `await t.pulsar('[data-act="nGuardarParte"]'); await t.esperar(() => /Otra persona ha cambiado/.test(t.q("#toast").textContent), 15000, "aviso de conflicto");
      await t.esperar(() => +NUBE.d.partes[0].kilos === 3000, 15000, "recarga tras el conflicto"); return { kilos: +NUBE.d.partes[0].kilos, notas: NUBE.d.partes[0].notas, version: NUBE.d.partes[0].version };`);
    ok(conf.kilos === 3000 && conf.notas === "del creador" && conf.version === conflicto + 1, "el editor pisó el cambio del creador: " + JSON.stringify(conf));
    // · Aviso en tiempo real perdido (canal caído): la comprobación de la huella trae el cambio igualmente
    await ev(disp.lector, `nubeDesuscribir(); return true;`);
    await pagar("t:" + fichas.t2, "7", "trabajador");
    const perdido = await ev(disp.lector, `await nubeComprobar(); try { await t.esperar(() => NUBE.d.pagos.some(p => p.importe_cent === 700), 15000, "la huella trae el pago"); }
      catch (e) { const h = await NUBE.sb.rpc("huella_campana", { p_campana: NUBE.c.campana_id }); throw new Error(e.message + " · " + JSON.stringify({ online: NUBE.online, vis: document.visibilityState, comprobando: nComprobando, cache: NUBE.desdeCache, huellaD: NUBE.d.huella, huellaS: h.data, err: h.error?.message, pagos: NUBE.d.pagos.map(x => x.importe_cent) })); }
      return NUBE.d.pagos.length;`);
    // · Corregir un pago (7 → 8 €) sin borrarlo: el lector lo ve y el historial guarda antes y después
    const correg = await ev(movil, `await t.ir("#n-pagos"); render(); const p = NUBE.d.pagos.find(x => x.importe_cent === 700);
      t.q('[data-act="nEditarPago"][data-id="' + p.id + '"]').click(); await t.esperar(() => t.q("#fepago"), 5000, "formulario"); t.rellenar('#fepago [name="importe"]', "8");
      await t.pulsar('[data-act="nGuardarPagoEd"]'); await t.esperar(() => t.q("#cfOk"), 5000, "confirmar"); t.q("#cfOk").click();
      await t.esperar(() => NUBE.d.pagos.some(x => x.id === p.id && x.importe_cent === 800), 15000, "pago corregido");
      t.q('[data-act="nHistPago"][data-id="' + p.id + '"]').click(); await t.esperar(() => /Corregido/.test(document.querySelector("#modal")?.innerText || ""), 15000, "historial");
      const h = document.querySelector("#modal").innerText; closeModal(); return { id: p.id, historial: /Anotado/.test(h) && /Corregido/.test(h) && /7,00/.test(h) && /8,00/.test(h) };`);
    const vePago = await ev(disp.lector, `await nubeComprobar(); await t.esperar(() => NUBE.d.pagos.some(x => x.id === ${JSON.stringify(correg.id)} && x.importe_cent === 800), 15000, "el lector ve la corrección"); return true;`);
    ok(correg.historial && vePago, "corrección de pago: " + JSON.stringify(correg));
    // · Consulta sin conexión al reabrir la app: copia privada del dispositivo, con aviso y sin poder guardar
    const dbgC = disp.lector.webContents.debugger; dbgC.attach("1.3"); await dbgC.sendCommand("Network.enable");
    const redC = on => dbgC.sendCommand("Network.emulateNetworkConditions", { offline: !on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    let cache;
    try {
      await redC(false);
      await disp.lector.webContents.reload(); await new Promise(r => disp.lector.webContents.once("did-finish-load", r)); await disp.lector.webContents.executeJavaScript(AYUDAS + "; true");
      cache = await ev(disp.lector, `await t.esperar(() => typeof MODE !== "undefined" && MODE === "cuenta" && NUBE.desdeCache && NUBE.d, 20000, "datos de la copia del dispositivo"); await t.ir("#n-inicio"); render();
        return { pagos: NUBE.d.pagos.length, aviso: /Ves los datos guardados en este dispositivo/.test(t.texto()), bloqueaGuardar: nSinRed(), correccion: NUBE.d.pagos.some(x => x.importe_cent === 800) };`);
    } finally { await redC(true); dbgC.detach(); }
    const vuelta = await ev(disp.lector, `await t.esperar(() => !NUBE.desdeCache && NUBE.d, 20000, "vuelve a la nube"); return true;`);
    ok(cache.pagos > 0 && cache.aviso && cache.bloqueaGuardar && cache.correccion && vuelta, "consulta sin conexión: " + JSON.stringify(cache));
    // · Sin conexión: se conserva lo que había, se avisa y no deja guardar; al volver la conexión se pone al día
    const dbg = disp.lector.webContents.debugger; dbg.attach("1.3"); await dbg.sendCommand("Network.enable");
    const red = on => dbg.sendCommand("Network.emulateNetworkConditions", { offline: !on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await red(false);
    let off; try { off = await ev(disp.lector, `await t.esperar(() => !navigator.onLine && !NUBE.online, 8000, "evento sin conexión"); await t.ir("#n-inicio"); render(); return { datos: !!NUBE.d && NUBE.d.pagos.length, aviso: /Sin conexión/.test(t.texto()) };`); }
    finally { await red(true); dbg.detach(); }
    await pagar("t:" + fichas.t2, "3", "trabajador");
    const on = await ev(disp.lector, `await t.esperar(() => navigator.onLine && NUBE.online, 8000, "evento conexión"); await t.esperar(() => NUBE.d.pagos.some(p => p.importe_cent === 300), 15000, "al día tras volver la conexión"); return NUBE.d.pagos.length;`);
    ok(off.datos && off.aviso && on === perdido + 1, "sin conexión / reconexión: " + JSON.stringify({ off, on, perdido }));
    // · Permisos retirados con la app abierta: el creador quita la edición al editor → su app deja de ofrecer Parte y Pagos
    await ev(movil, `const m = NUBE.d.miembros.find(x => x.user_id === ${JSON.stringify(await ev(disp.editor, "return NUBE.sesion.user.id;"))});
      const r = await NUBE.sb.from("miembros").update({ puede_editar: false }).eq("id", m.id).select(); if (r.error || !r.data.length) throw new Error("no se pudo quitar la edición: " + r.error?.message); return true;`);
    const sinEd = await ev(disp.editor, `await nubeComprobar(); await t.esperar(() => !nEdita(), 15000, "pierde la edición"); return nubeVistas().map(x => x[0]);`);
    ok(!sinEd.includes("parte") && !sinEd.includes("pagos"), "el editor sin permiso sigue viendo Parte/Pagos: " + sinEd);
    // · Cuenta bloqueada con la app abierta: sin recargar, en la siguiente comprobación desaparecen los datos
    await accionCuenta(pcSa, "nBloquear", cred.dueno.usuario);
    const blq = await ev(disp.dueno, `await nubeComprobar(); await t.esperar(() => !NUBE.d && (/bloqueada/i.test(t.texto()) || t.q("#fentrar")), 20000, "dueño bloqueado sin recargar");
      return { datos: !!NUBE.d, texto: /Dueño E2E|€/.test(t.texto()) };`);
    ok(!blq.datos && !blq.texto, "la cuenta bloqueada sigue viendo datos: " + JSON.stringify(blq));
    // 5c) Cerrar sesión: en el dispositivo no queda nada privado (ni en memoria, ni en el almacenamiento, ni en la caché)
    const salida = await ev(disp.jefe, `await t.ir("#ajustes"); render(); await t.esperar(() => t.q('[data-act="nSalir"]'), 8000, "botón cerrar sesión"); await t.pulsar('[data-act="nSalir"]'); await t.esperar(() => t.q("#cfOk"), 5000, "confirmar salir"); t.q("#cfOk").click();
      await t.esperar(() => t.q("#fentrar"), 15000, "pantalla de entrar tras salir");
      const ls = Object.keys(localStorage).map(k => k + "=" + localStorage.getItem(k)).join(" | ");
      let cache = ""; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) cache += r.url + " | ";
      await t.dormir(500); const bases = indexedDB.databases ? (await indexedDB.databases()).map(x => x.name) : [];
      return { cacheNube: bases.includes("campana-control-nube"), sesion: !!NUBE.sesion, datos: !!NUBE.d || NUBE.campanas.length > 0, ls: /Trabajador E2E|${nombreCamp}|access_token|refresh_token/.test(ls), cache: /supabase\\.co/.test(cache), texto: /Trabajador E2E/.test(document.body.innerText) };`);
    ok(!salida.cacheNube && !salida.sesion && !salida.datos && !salida.ls && !salida.cache && !salida.texto, "tras cerrar sesión queda información: " + JSON.stringify(salida));

    // 6) El superadministrador bloquea al trabajador: al volver a abrir la app no ve nada
    const bl = await accionCuenta(pcSa, "nBloquear", cred.trab1.usuario);
    ok(/bloqueada/i.test(bl), "bloqueo: " + bl);
    await disp.trab1.webContents.reload(); await new Promise(r => disp.trab1.webContents.once("did-finish-load", r)); await disp.trab1.webContents.executeJavaScript(AYUDAS + "; true");
    const tb = await ev(disp.trab1, `try { await t.esperar(() => typeof MODE !== "undefined" && MODE === "cuenta" && (t.q("#fentrar") || /bloqueada/i.test(t.texto())), 20000, "estado tras bloquear"); }
      catch (e) { throw new Error(e.message + " · pantalla: «" + (document.querySelector("#view")?.innerText || "").slice(0, 160) + "» · aviso: «" + (t.q("#toast")?.textContent || "") + "»"); }
      return { pantalla: t.q("#fentrar") ? "entrar" : "bloqueada", datos: !!NUBE.d };`);
    ok(!tb.datos, "el trabajador bloqueado ve datos: " + JSON.stringify(tb));
    const tb2 = await ev(disp.trab1, `if (!t.q("#fentrar")) { await NUBE.sb.auth.signOut({ scope: "local" }); await t.esperar(() => t.q("#fentrar"), 10000, "salir"); }
      t.rellenar('#fentrar [name="usuario"]', ${JSON.stringify(cred.trab1.usuario)}); t.rellenar('#fentrar [name="password"]', ${JSON.stringify(claves.trab1)});
      await t.pulsar('[data-act="nEntrar"]'); await t.esperar(() => /bloqueada/i.test(t.q("#toast").textContent), 15000, "aviso de cuenta bloqueada"); return { sesion: !!NUBE.sesion, aviso: t.q("#toast").textContent };`);
    ok(!tb2.sesion, "una cuenta bloqueada inicia sesión: " + JSON.stringify(tb2));

    // 7) El creador restablece la contraseña del lector: la antigua deja de servir y debe poner otra
    const temporal = await accionCuenta(movil, "nRestablecer", cred.lector.usuario);
    await disp.lector.webContents.reload(); await new Promise(r => disp.lector.webContents.once("did-finish-load", r)); await disp.lector.webContents.executeJavaScript(AYUDAS + "; true");
    const lr = await ev(disp.lector, `await t.esperar(() => typeof MODE !== "undefined" && MODE === "cuenta" && (t.q("#fentrar") || t.q("#fclave")), 20000, "tras restablecer");
      if (!t.q("#fentrar")) { await NUBE.sb.auth.signOut({ scope: "local" }); await t.esperar(() => t.q("#fentrar"), 10000, "salir"); }
      t.rellenar('#fentrar [name="usuario"]', ${JSON.stringify(cred.lector.usuario)}); t.rellenar('#fentrar [name="password"]', ${JSON.stringify(claves.lector)});
      await t.pulsar('[data-act="nEntrar"]'); await t.esperar(() => /incorrectos/i.test(t.q("#toast").textContent), 15000, "contraseña antigua rechazada"); return true;`);
    const e2 = await entrar(disp.lector, cred.lector.usuario, temporal); ok(e2.temporal && e2.clave, "con la temporal nueva no pidió cambiarla");
    await ponerClave(disp.lector, temporal, clave());
    const lf = await ev(disp.lector, `await t.esperar(() => NUBE.c && NUBE.d, 20000, "su campaña"); return NUBE.d.filas.length;`);
    ok(lf === 2, "el lector no recuperó el acceso");

    if (process.env.CAPTURAS) {
      fs.mkdirSync(process.env.CAPTURAS, { recursive: true });
      for (const [n, w, h] of [["7-informes-creador", movil, "#n-informes"], ["8-documentos-creador", movil, "#n-documentos"], ["9-copias", pcSa, "#copias"], ["1-usuarios-superadmin", pcSa, "#usuarios"], ["2-usuarios-creador", movil, "#usuarios"], ["3-editor-parte", disp.editor, "#n-parte"], ["4-lector-inicio", disp.lector, "#n-inicio"], ["5-trabajador-bloqueado", disp.trab1, null], ["6-jefe", disp.jefe, "#n-equipo"]]) {
        if (h) await ev(w, `await t.ir(${JSON.stringify(h)}); NUBE.usuarios = null; render(); await t.dormir(1500); render(); return true;`);
        fs.writeFileSync(path.join(process.env.CAPTURAS, n + ".png"), (await w.webContents.capturePage()).toPNG());
      }
    }
    return { campana: nombreCamp, cuentas: Object.keys(cred).length + 1, parte: { creador: p1, editor: p2 }, tiempoReal_ms: trab.ms - t0,
      trabajador: { horas: trab.horas, euros: trab.importe / 100 }, lector: lect, jefeVe: jef.equipo, dueno: { horas: due.horas, euros: due.total / 100, otroDueno: "rechazado" }, informes: { archivos: archivos.length, cuentaDueno: cmp.total, servidor: cmp.srvTotal }, fotosPorRol: vista, sincro: { conflicto: "rechazado y recargado", avisoPerdido: "recuperado por huella", sinConexion: "conserva y se pone al día", permisoRetirado: "sin Parte/Pagos", bloqueoEnVivo: "sin datos" }, salir: "sin datos", web: URL_PUBLICADA || "servidor local", bloqueado: { tras_recargar: tb.pantalla, al_entrar: tb2.aviso }, restablecida: lr && lf === 2 };
  } finally { SRV.nube = false; }
});


// Migración y copias contra el proyecto real: copia de la 2.3.0 (caso de control + documento con foto) → importación con
// asistente (simulación, importación, fotos, comprobación de importes) → copia de campaña 3.0 con fotos → restauración en
// otra campaña (aislada) → mismos importes, documento, foto y PDF. Fotos privadas: acceso según rol, duplicados y restos.
pruebaRed("nube-migracion", "3.0 real: importar copia 2.3.0 (mismos importes y foto), copia de campaña 3.0 y restauración aislada, fotos privadas", async () => {
  const fijas = JSON.parse(fs.readFileSync(path.join(RAIZ, "supabase", "pruebas", ".cuentas-pruebas.json"), "utf8"));
  const run = Date.now().toString(36).slice(-5);
  // 1) Dispositivo con la 2.3.0 (sin cuenta): caso de control, documento con foto y copia .json
  const a = await abrir("mig-origen-" + run);
  const ids = await crearCasoControlPorPantalla(a);
  await ev(a, `const did = Object.keys(S.duenos)[0]; UI.dueVer = did; await t.ir("#duenos"); render(); await t.pulsar('[data-act="nuevoDoc"]'); await t.pulsar('[data-act="crearDoc"]');
    const blob = await new Promise(r => ${JPEG("PAPEL 2.3.0", 1800, 1200)}.toBlob(r, "image/jpeg", .9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "papel.jpg", { type: "image/jpeg" }));
    const inp = document.querySelector("#docFoto"); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
    await t.esperar(() => Object.values(S.documentos)[0]?.escaneos?.length === 1, 6000, "foto guardada"); closeModal(); return true;`);
  const esperado = await ev(a, `const tr = resumenTrab(${JSON.stringify(ids.tid)}, {}), du = cuentaDueno(${JSON.stringify(ids.did)}, {});
    return { ganado: tr.importe, entregado: tr.entregado, horas: tr.horas, cuenta: du.total, pagado: du.pagado };`);
  const n0 = descargas.length; await ev(a, `await t.ir("#ajustes"); await t.pulsar('[data-act="exportar"]'); return true;`);
  const copia230 = fs.readFileSync((await esperarDescarga(a.__perfil, n0)).ruta, "utf8");
  SRV.nube = true;
  try {
    // 2) Superadministrador en la nube: campaña vacía e importación con el asistente
    const w = await abrir("mig-nube-" + run, { esperarApp: false, url: URL_PUBLICADA });
    await w.webContents.executeJavaScript(AYUDAS + "; true");
    await ev(w, `await t.esperar(() => typeof MODE !== "undefined" && MODE === "cuenta" && t.q("#fentrar"), 15000, "entrar");
      t.rellenar('#fentrar [name="usuario"]', ${JSON.stringify(fijas.propietario.usuario)}); t.rellenar('#fentrar [name="password"]', ${JSON.stringify(fijas.propietario.password)});
      await t.pulsar('[data-act="nEntrar"]'); await t.esperar(() => NUBE.perfil && NUBE.campanas, 20000, "sesión"); return true;`);
    const crearCamp = nombre => ev(w, `await t.ir("#campanas"); render(); await t.esperar(() => t.q("#fnueva"), 8000, "nueva campaña"); t.rellenar('#fnueva [name="nombre"]', ${JSON.stringify(nombre)});
      await t.pulsar('[data-act="nCrearCampana"]'); await t.esperar(() => NUBE.c?.nombre === ${JSON.stringify(nombre)} && NUBE.d, 20000, "crear campaña"); return NUBE.c.campana_id;`);
    const importar = (archivo, nombre, destino) => ev(w, `await t.ir("#copias"); render(); await t.esperar(() => t.q("#impArchivo"), 8000, "copias");
      await nImpLeer(new File([${JSON.stringify(archivo)}], ${JSON.stringify(nombre)}, { type: "application/json" })); NUBE.imp.destino = ${JSON.stringify(destino)}; render();
      if (NUBE.imp.error) throw new Error(NUBE.imp.error);
      await t.pulsar('[data-act="nImpRevisar"]'); await t.esperar(() => NUBE.imp.simulacion || NUBE.imp.resultado, 20000, "simulación");
      const sim = NUBE.imp.simulacion; if (!sim) return { error: NUBE.imp.resultado };
      await t.pulsar('[data-act="nImpConfirmar"]'); await t.esperar(() => t.q("#cfOk"), 5000, "confirmar"); t.q("#cfOk").click();
      await t.esperar(() => NUBE.imp.comprobacion || (NUBE.imp.resultado && /No se ha importado/.test(NUBE.imp.resultado)), 60000, "importación y comprobación");
      return { convOk: NUBE.imp.convOk, convDif: NUBE.imp.convDif, sim: { partes: sim.partes.nuevos, pagos: sim.pagos.nuevos, docs: sim.documentos.nuevos }, resultado: NUBE.imp.resultado, coincide: NUBE.imp.coincide,
        totales: { ganado: sumaTot(NUBE.imp.totales, "trabajadores", "ganado"), cuenta: sumaTot(NUBE.imp.totales, "duenos", "total") }, fotos: NUBE.d.fotos.length, docs: NUBE.d.docs.length, campana: NUBE.c.campana_id };`);
    const C1 = await crearCamp("Importación E2E " + run);
    const imp = await importar(copia230, "CampanaControl-copia.json", C1);
    ok(imp.convOk && imp.coincide && imp.sim.partes === 2 && imp.sim.pagos === 2 && imp.fotos === 1 && imp.docs === 1, "importación 2.3.0: " + JSON.stringify(imp));
    ok(Math.abs(imp.totales.ganado - esperado.ganado) < 0.005 && Math.abs(imp.totales.cuenta - esperado.cuenta) < 0.005, "importes distintos de la 2.3.0: " + JSON.stringify({ imp: imp.totales, esperado }));
    // La misma copia otra vez: el servidor la rechaza (no se duplica nada)
    const rep = await importar(copia230, "CampanaControl-copia.json", C1);
    ok(rep.error && /ya se importó/.test(rep.error), "la copia se pudo importar dos veces: " + JSON.stringify(rep));
    // 3) Copia de campaña 3.0 con fotos (huella) y restauración en otra campaña vacía (aislada)
    const n1 = descargas.length;
    await ev(w, `await t.ir("#copias"); render(); await t.esperar(() => t.q("#cpCamp"), 8000, "copias"); t.rellenar("#cpCamp", ${JSON.stringify(C1)}); t.rellenar("#cpFotos", "si"); await t.pulsar('[data-act="nExportar"]'); return true;`);
    const copia3 = JSON.parse(fs.readFileSync((await esperarDescarga(w.__perfil, n1, 30000)).ruta, "utf8"));
    ok(/^[0-9a-f]{64}$/.test(copia3.sello || "") && copia3.tipo === "copia-campana-3" && copia3.fotos.length === 1 && copia3.integridad.sha256.length === 64 && !/password|clave_temporal|sb_secret/i.test(JSON.stringify(copia3)), "copia 3.0: " + JSON.stringify(copia3.integridad).slice(0, 200));
    // Una copia manipulada se rechaza
    const mala = JSON.parse(JSON.stringify(copia3)); mala.datos.pagos[0].importe_cent += 100;
    const manip = await ev(w, `await nImpLeer(new File([${JSON.stringify(JSON.stringify(mala))}], "mala.json")); return NUBE.imp.error || "";`);
    ok(/dañada o se ha modificado/.test(manip), "aceptó una copia manipulada: " + manip);
    // Manipulación «a propósito»: además se recalcula la huella. La huella ya no la delata; el sello sí, y no deja importar sin confirmarlo
    const crypto2 = require("crypto"); mala.integridad.sha256 = crypto2.createHash("sha256").update(JSON.stringify(mala.datos)).digest("hex");
    const manip2 = await ev(w, `await t.ir("#copias"); render(); await nImpLeer(new File([${JSON.stringify(JSON.stringify(mala))}], "mala2.json")); NUBE.imp.destino = ${JSON.stringify(C1)}; render();
      if (NUBE.imp.error) return { error: NUBE.imp.error };
      await t.pulsar('[data-act="nImpRevisar"]'); await t.esperar(() => NUBE.imp.simulacion || NUBE.imp.resultado, 20000, "simulación");
      const aviso = /No se puede comprobar el sello/.test(t.texto()); if (t.q('[data-act="nImpConfirmar"]')) await t.pulsar('[data-act="nImpConfirmar"]');
      await t.dormir(300); return { sello: NUBE.imp.sello, aviso, confirmacion: !!t.q("#cfOk"), toast: t.q("#toast").textContent };`);
    ok(manip2.sello === false && manip2.aviso && !manip2.confirmacion, "una copia con la huella recalculada pasó sin aviso: " + JSON.stringify(manip2));
    await ev(w, `NUBE.imp = null; render(); return true;`);
    const C2 = await crearCamp("Restauración E2E " + run);
    const res = await importar(JSON.stringify(copia3), "copia3.json", C2);
    ok(res.coincide && res.sim.partes === 2 && res.fotos === 1 && res.docs === 1 && /Cuentas autorizadas/.test(res.resultado), "restauración: " + JSON.stringify(res));
    // 4) Documento restaurado: foto legible (privada, con sesión) y PDF del documento con la foto
    const n2 = descargas.length;
    const docInfo = await ev(w, `await t.ir("#n-documentos"); NUBE.docAbierto = NUBE.d.docs[0].id; render(); nAfter.documentos();
      await t.esperar(() => t.q("#nThumbs img")?.src?.startsWith("blob:"), 15000, "foto en pantalla"); t.q('[data-act="nPdfDocN"]').click(); return true;`);
    const pdfDoc = await esperarDescarga(w.__perfil, n2, 30000);
    ok(fs.statSync(pdfDoc.ruta).size > 20000, "el PDF del documento no lleva la foto: " + fs.statSync(pdfDoc.ruta).size + " bytes");
    // 5) Fotos privadas: sin sesión no se pueden leer; duplicado rechazado; archivo suelto detectado y limpiado
    const priv = await ev(w, `const f = NUBE.d.fotos[0];
      const anon = window.supabase.createClient(window.CC_NUBE.url, window.CC_NUBE.clave, { auth: { persistSession: false } });
      const a1 = await anon.storage.from("fotos").download(f.ruta), a2 = await anon.storage.from("fotos").createSignedUrl(f.ruta, 60), a3 = await anon.from("fotos").select("*");
      const pub = await fetch(window.CC_NUBE.url + "/storage/v1/object/public/fotos/" + f.ruta).then(r => r.status);
      const blob = await nFotoBlob(f.ruta); const sha = await sha256Hex(await blob.arrayBuffer());
      // La misma foto elegida dos veces (mismo archivo original): la segunda se rechaza
      const orig = new File([await new Promise(r => ${JPEG("OTRA FOTO", 1500, 1000)}.toBlob(r, "image/jpeg", .9))], "otra.jpg", { type: "image/jpeg" });
      const k0 = NUBE.d.fotos.length; await nSubirFoto(NUBE.docAbierto, orig); const k1 = NUBE.d.fotos.length; await nSubirFoto(NUBE.docAbierto, orig); const dup = k1 === k0 + 1 && NUBE.d.fotos.length === k1;
      const suelta = NUBE.c.campana_id + "/suelta-" + Date.now() + ".jpg"; await NUBE.sb.storage.from("fotos").upload(suelta, blob, { contentType: "image/jpeg" });
      const h1 = (await NUBE.sb.rpc("fotos_huerfanas", { p_campana: NUBE.c.campana_id })).data || [];
      await NUBE.sb.storage.from("fotos").remove(h1); const h2 = (await NUBE.sb.rpc("fotos_huerfanas", { p_campana: NUBE.c.campana_id })).data || [];
      return { anonDescarga: !!a1.error, anonFirma: !!a2.error, anonFilas: (a3.data || []).length, publica: pub, shaIgual: sha === f.sha256, duplicadoRechazado: dup, huerfanas: h1.length, trasLimpiar: h2.length };`);
    ok(priv.anonDescarga && priv.anonFirma && !priv.anonFilas && priv.publica >= 400 && priv.shaIgual && priv.duplicadoRechazado && priv.huerfanas === 1 && priv.trasLimpiar === 0, "fotos privadas: " + JSON.stringify(priv));
    // 6) Borrar el documento borra también su foto en Storage
    const borr = await ev(w, `const ruta = NUBE.d.fotos[0].ruta; t.q('[data-act="nBorrarDoc"]').click(); await t.esperar(() => t.q("#cfOk"), 5000, "confirmar"); t.q("#cfOk").click();
      await t.esperar(() => !NUBE.d.docs.length, 15000, "documento borrado");
      const l = await NUBE.sb.storage.from("fotos").list(NUBE.c.campana_id, { limit: 100 });
      const h = (await NUBE.sb.rpc("fotos_huerfanas", { p_campana: NUBE.c.campana_id })).data || []; return { archivo: (l.data || []).some(o => ruta.endsWith("/" + o.name)), enCarpeta: (l.data || []).length, huerfanas: h.length, fotos: NUBE.d.fotos.length };`);
    ok(!borr.archivo && !borr.huerfanas && !borr.fotos, "al borrar el documento quedó la foto: " + JSON.stringify(borr));
    return { esperado2_3_0: esperado, importada: { convOk: imp.convOk, coincide: imp.coincide, fotos: imp.fotos }, repetida: "rechazada", copia3: { huella: copia3.integridad.sha256.slice(0, 12), fotos: copia3.fotos.length },
      manipulada: "rechazada", restaurada: { coincide: res.coincide, fotos: res.fotos }, pdfDocumento: fs.statSync(pdfDoc.ruta).size, privacidad: priv, borrado: "sin restos", web: URL_PUBLICADA || "servidor local" };
  } finally { SRV.nube = false; }
});
// Solo contra la web publicada (URL_PUBLICADA=https://…): app instalable en HTTPS real (Cloudflare Pages)
pruebaRed("nube-pwa", "Web publicada: HTTPS, service worker, recarga, dirección de inicio, sin conexión, manifiesto e iconos, caché sin datos", async () => {
  ok(URL_PUBLICADA && URL_PUBLICADA.startsWith("https://"), "falta URL_PUBLICADA=https://…");
  const perfil = "pwa-" + Date.now().toString(36), ses = prepararSesion(perfil);
  const w = await abrir(perfil, { esperarApp: false, url: URL_PUBLICADA, ancho: 390, alto: 844 });
  const pantalla = async () => { await w.webContents.executeJavaScript(AYUDAS + "; true");
    return ev(w, `await t.esperar(() => typeof MODE !== "undefined" && MODE === "cuenta" && t.q("#fentrar"), 20000, "pantalla de entrar"); return { url: location.href, controlado: !!navigator.serviceWorker.controller };`); };
  const recargar = async (url) => { const c = new Promise(r => w.webContents.once("did-finish-load", r)); if (url) w.webContents.loadURL(url); else w.webContents.reload(); await c; return pantalla(); };
  const p0 = await pantalla();
  await ev(w, `await navigator.serviceWorker.ready; return true;`);
  const p1 = await recargar();                                    // ya con el service worker al mando
  ok(p1.controlado, "el service worker no controla la página tras recargar");
  const p2 = await recargar(URL_PUBLICADA + "index.html");        // start_url del manifiesto (Cloudflare lo redirige a «/»)
  ses.enableNetworkEmulation({ offline: true });
  let p3; try { p3 = await recargar(); } finally { ses.disableNetworkEmulation(); }
  const info = await ev(w, `const m = await (await fetch("manifest.webmanifest", { cache: "no-store" })).json();
    const est = async u => (await fetch(new URL(u, location.href), { cache: "no-store" })).status;
    const iconos = await Promise.all([...m.icons.map(i => i.src), "icons/apple-touch-icon.png"].map(est));
    let cache = []; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) cache.push(r.url);
    return { https: location.protocol === "https:", seguro: isSecureContext, display: m.display, start: m.start_url, iconos, apple: !!document.querySelector('link[rel="apple-touch-icon"]'),
      cache: cache.length, ajenas: cache.filter(u => !u.startsWith(location.origin)).length, nube: cache.filter(u => /supabase\\.co|rest\\/v1|auth\\/v1/.test(u)).length,
      ipLocal: /192\\.168\\.\\d+\\.\\d+/.test(document.documentElement.outerHTML + JSON.stringify(window.CC_NUBE)), nubeUrl: window.CC_NUBE?.url };`);
  ok(info.https && info.seguro && info.display === "standalone" && info.iconos.every(s => s === 200) && info.apple, "instalable: " + JSON.stringify(info));
  ok(info.cache > 0 && !info.ajenas && !info.nube && !info.ipLocal && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(info.nubeUrl), "caché o configuración: " + JSON.stringify(info));
  return { primera: p0.url, recarga: p1.controlado ? "con service worker" : "sin", inicio: p2.url, sinConexion: p3 ? "abre" : "no", cache: info.cache + " archivos de la app", iconos: info.iconos.join(",") };
});

// 3.0 · administrar campañas (000018): superadministrador sin ser miembro, creador propio y ajeno, administrador,
// trabajador, archivar y restaurar, y eliminar definitivamente. Todo pulsando la app contra el proyecto de PRUEBAS.
pruebaRed("nube-campanas", "3.0 real: superadministrador y creador administran campañas (precios, personas, maquinaria); ajeno, administrador y trabajador no; archivar, restaurar y eliminar", async () => {
  const fijas = JSON.parse(fs.readFileSync(path.join(RAIZ, "supabase", "pruebas", ".cuentas-pruebas.json"), "utf8"));
  ok(fijas.propietario && !fijas.propietario.temporal, "falta el superadministrador de pruebas");
  const run = Date.now().toString(36).slice(-5), clave = () => require("crypto").randomBytes(12).toString("base64url");
  SRV.nube = true;
  try {
    const aviso = `" · aviso: «" + (t.q("#toast")?.textContent || "") + "»"`;
    const dispositivo = async (perfil, ancho = 1280, alto = 860) => {
      const w = await abrir(perfil + "-" + run, { esperarApp: false, ancho, alto, url: URL_PUBLICADA });
      await w.webContents.executeJavaScript(AYUDAS + "; true");
      await ev(w, `await t.esperar(() => typeof MODE !== "undefined" && MODE === "cuenta" && t.q("#fentrar"), 15000, "pantalla de entrar"); return true;`);
      return w;
    };
    const entrar = (w, usuario, password) => ev(w, `t.rellenar('#fentrar [name="usuario"]', ${JSON.stringify(usuario)}); t.rellenar('#fentrar [name="password"]', ${JSON.stringify(password)});
      await t.pulsar('[data-act="nEntrar"]'); try { await t.esperar(() => NUBE.sesion && NUBE.perfil && !t.q("#fentrar"), 20000, "entrar"); } catch (e) { throw new Error(e.message + ${aviso}); } return true;`);
    const ponerClave = (w, actual, nueva) => ev(w, `await t.esperar(() => t.q("#fclave"), 8000, "pantalla de contraseña");
      t.rellenar('#fclave [name="actual"]', ${JSON.stringify(actual)}); t.rellenar('#fclave [name="p1"]', ${JSON.stringify(nueva)}); t.rellenar('#fclave [name="p2"]', ${JSON.stringify(nueva)});
      await t.pulsar('[data-act="nGuardarClave"]'); await t.esperar(() => NUBE.perfil && !NUBE.perfil.debe_cambiar_clave && !t.q("#fclave"), 20000, "poner la contraseña"); return true;`);
    const crearUsuario = (w, d) => ev(w, `await t.ir("#usuarios"); render(); await t.esperar(() => t.q("#fusuario") && NUBE.usuarios, 15000, "gestión de usuarios");
      const sel = async (n, v) => { if (!t.q('#fusuario [name="' + n + '"]')) return; t.rellenar('#fusuario [name="' + n + '"]', v); await t.dormir(150); };
      ${d.tipo ? `await sel("tipo", ${JSON.stringify(d.tipo)});` : ""}
      ${d.rol ? `await sel("campana", ${JSON.stringify(d.campana)}); await sel("rol", ${JSON.stringify(d.rol)});` : ""}
      ${d.ficha ? `await t.esperar(() => [...t.q('#fusuario [name="ficha"]').options].some(o => o.value === ${JSON.stringify(d.ficha)}), 15000, "fichas"); t.rellenar('#fusuario [name="ficha"]', ${JSON.stringify(d.ficha)});` : ""}
      t.rellenar('#fusuario [name="nombre"]', ${JSON.stringify(d.nombre)}); t.rellenar('#fusuario [name="usuario"]', ${JSON.stringify(d.usuario)});
      await t.pulsar('[data-act="nCrearUsuario"]'); let c; try { c = await t.esperar(() => t.q("#codigoInv")?.innerText.trim(), 20000, "contraseña temporal"); } catch (e) { throw new Error(e.message + ${aviso}); }
      const u = t.q("#credUsuario").innerText.trim(); await t.pulsar('[data-act="cerrar"]'); return { usuario: u, clave: c };`);
    const persona = async (w, cred) => { await entrar(w, cred.usuario, cred.clave); await ponerClave(w, cred.clave, clave()); };
    // Abre la campaña desde la lista (como lo haría la persona) y espera a tenerla cargada
    const abrirCampana = (w, id) => ev(w, `await t.ir("#campanas"); render(); await t.esperar(() => t.q('[data-act="nElegir"][data-id="${id}"]'), 15000, "campaña en la lista");
      await t.pulsar('[data-act="nElegir"][data-id="${id}"]'); await t.esperar(() => NUBE.c?.campana_id === "${id}" && NUBE.d?.campana?.id === "${id}", 20000, "abrir campaña"); return true;`);
    // Confirma la ventana de «recalcula las cuentas» y devuelve lo que enseñaba
    const confirmarImpacto = `(await (async () => { const md = await t.esperar(() => t.q("#cfOk") && t.q("#modal").innerText, 8000, "vista previa del cambio"); t.q("#cfOk").click(); return md; })())`;

    // 1) Superadministrador crea un creador y un segundo creador (ajeno)
    const sa = await dispositivo("adm-superadmin");
    await entrar(sa, fijas.propietario.usuario, fijas.propietario.password);
    const credC = await crearUsuario(sa, { tipo: "creador", nombre: "Creador Admin E2E", usuario: "creador.adm." + run });
    const credX = await crearUsuario(sa, { tipo: "creador", nombre: "Creador Ajeno E2E", usuario: "ajeno.adm." + run });

    // 2) El creador prepara una campaña ficticia con datos y cuentas
    const cr = await dispositivo("adm-creador", 390, 844);
    await persona(cr, credC);
    const nombre = "Admin E2E " + run;
    const C = await ev(cr, `await t.ir("#campanas"); render(); await t.esperar(() => t.q("#fnueva"), 15000, "crear campañas");
      t.rellenar('#fnueva [name="nombre"]', ${JSON.stringify(nombre)}); t.rellenar('#fnueva [name="horas"]', "8"); t.rellenar('#fnueva [name="ptrab"]', "10"); t.rellenar('#fnueva [name="pdueno"]', "12");
      await t.pulsar('[data-act="nCrearCampana"]'); await t.esperar(() => NUBE.c?.nombre === ${JSON.stringify(nombre)} && NUBE.d, 20000, "crear campaña");
      await t.ir("#n-personas"); render();
      t.rellenar('#fntrab [name="nombre"]', "Ana Admin E2E"); await t.pulsar('[data-act="nAltaTrab"]'); await t.esperar(() => NUBE.d.trab.length === 1, 15000, "trabajador");
      t.rellenar('#fndueno [name="nombre"]', "Dueño Admin E2E"); await t.pulsar('[data-act="nAltaDueno"]'); await t.esperar(() => NUBE.d.duenos.length === 1, 15000, "dueño");
      const c = NUBE.c.campana_id, tr = NUBE.d.trab[0].id, du = NUBE.d.duenos[0].id;
      const r1 = await NUBE.sb.rpc("guardar_parte", { p_campana: c, p_dueno: du, p_fecha: "2026-11-20", p_version: null, p_kilos: 2350, p_notas: null, p_filas: [{ trabajador_id: tr, tipo: "normal" }], p_maquinas: [] });
      const r2 = await NUBE.sb.from("pagos").insert({ campana_id: c, tipo: "trabajador", trabajador_id: tr, importe_cent: 2000, fecha: "2026-11-20" });
      if (r1.error || r2.error) throw new Error("datos: " + (r1.error || r2.error).message);
      await nubeCargar(); return { c, tr, du };`);
    const credT = await crearUsuario(cr, { nombre: "Ana Cuenta E2E", usuario: "ana.adm." + run, campana: C.c, rol: "trabajador", ficha: C.tr });
    const credA = await crearUsuario(cr, { nombre: "Lector Admin E2E", usuario: "lector.adm." + run, campana: C.c, rol: "admin" });

    // 3) Superadministrador SIN ser miembro: entra, cambia €/h del dueño con vista previa, IVA y una máquina
    await abrirCampana(sa, C.c);
    const sup = await ev(sa, `await t.ir("#ajustes"); render(); await t.esperar(() => t.q("#fncamp"), 8000, "configuración en Ajustes");
      const miembro = NUBE.roles.length; const pagos0 = JSON.stringify(NUBE.d.pagos.map(p => p.importe_cent));
      t.rellenar('#fncamp [name="pdueno"]', "13"); await t.pulsar('[data-act="nGuardarCampana"]');
      const vista = ${confirmarImpacto};
      await t.esperar(() => NUBE.d.eco?.precio_hora_dueno_cent === 1300, 20000, "guardar precio" + ${aviso});
      const m0 = NUBE.d.maq[0]; const fila = t.q('[data-maq="' + m0.id + '"]'); t.rellenar(fila.querySelector('[name="precio"]'), "55"); await t.pulsar(fila.querySelector('[data-act="nGuardarMaq"]'));
      await t.esperar(() => NUBE.d.maq.find(x => x.id === m0.id).precio_cent === 5500, 20000, "guardar máquina" + ${aviso});
      return { miembro, vista, pagosIguales: pagos0 === JSON.stringify(NUBE.d.pagos.map(p => p.importe_cent)) };`);
    ok(sup.miembro === 0 && /Total de los dueños[\s\S]*96,00\s*€[\s\S]*104,00\s*€/.test(sup.vista) && /no cambian/.test(sup.vista) && sup.pagosIguales, "superadministrador: " + JSON.stringify(sup));

    // 4) Creador en su campaña: horas del día y precio propio de un trabajador desde Personas
    const cre = await ev(cr, `await t.esperar(() => NUBE.d.eco?.precio_hora_dueno_cent === 1300, 20000, "el creador recibe el cambio del superadministrador"); await t.ir("#ajustes"); render();
      t.rellenar('#fncamp [name="horas"]', "7,5"); await t.pulsar('[data-act="nGuardarCampana"]'); ${confirmarImpacto};
      await t.esperar(() => +NUBE.d.campana.horas_dia === 7.5, 20000, "guardar horas" + ${aviso});
      await t.ir("#n-personas"); render(); await t.pulsar('[data-act="nEditarPersona"][data-tipo="trabajador"]');
      t.rellenar('#fned [name="precio"]', "11"); await t.pulsar('[data-act="nGuardarPersona"]'); ${confirmarImpacto};
      await t.esperar(() => NUBE.d.trab[0].precio_hora_cent === 1100, 20000, "precio del trabajador" + ${aviso});
      return { horas: +NUBE.d.campana.horas_dia, ana: nResTrab(NUBE.d.trab[0].id).importe };`);
    ok(cre.horas === 7.5 && cre.ana === 8250, "creador: " + JSON.stringify(cre));

    // 5) Creador ajeno, administrador y trabajador: no ven la configuración y el servidor rechaza los cambios
    const aj = await dispositivo("adm-ajeno"); await persona(aj, credX);
    const ajeno = await ev(aj, `const camps = (await NUBE.sb.rpc("mis_campanas")).data || [];
      const u = await NUBE.sb.from("campanas_economia").update({ precio_hora_trab_cent: 1, version: 99 }).eq("campana_id", "${C.c}").select();
      const m = await NUBE.sb.from("maquinas").update({ precio_cent: 1 }).eq("campana_id", "${C.c}").select();
      const del = await NUBE.sb.rpc("eliminar_campana", { p_campana: "${C.c}", p_confirmacion: ${JSON.stringify(nombre)} });
      return { ve: camps.some(x => x.campana_id === "${C.c}"), eco: (u.data || []).length, maq: (m.data || []).length, eliminar: !!del.error };`);
    ok(!ajeno.ve && !ajeno.eco && !ajeno.maq && ajeno.eliminar, "creador ajeno: " + JSON.stringify(ajeno));
    const restringido = async (perfil, cred, ancho) => { const w = await dispositivo(perfil, ancho); await persona(w, cred);
      return ev(w, `await t.esperar(() => NUBE.c && NUBE.d, 20000, "su campaña"); await t.ir("#ajustes"); render();
        const u = await NUBE.sb.from("campanas_economia").update({ precio_hora_trab_cent: 1, version: 99 }).eq("campana_id", "${C.c}").select();
        const tr = await NUBE.sb.from("trabajadores").update({ precio_hora_cent: 1, version: 99 }).eq("campana_id", "${C.c}").select();
        const c = await NUBE.sb.from("campanas").update({ activa: false, version: 99 }).eq("id", "${C.c}").select();
        return { form: !!t.q("#fncamp"), editar: !!t.q('[data-act="nEditarPersona"]'), eco: (u.data || []).length, trab: (tr.data || []).length, archivar: (c.data || []).length };`); };
    const lector = await restringido("adm-lector", credA), trabajador = await restringido("adm-trabajador", credT, 390);
    for (const [k, v] of [["administrador", lector], ["trabajador", trabajador]]) ok(!v.form && !v.editar && !v.eco && !v.trab && !v.archivar, k + ": " + JSON.stringify(v));

    // 6) El creador archiva: solo lectura para todos (también por la API); después la restaura
    const arch = await ev(cr, `await t.ir("#ajustes"); render(); await t.pulsar('[data-act="nArchivar"][data-v="0"]'); ${confirmarImpacto};
      await t.esperar(() => nArchivada(), 20000, "archivar" + ${aviso}); render();
      const vistas = nubeVistas().map(x => x[0]); const banner = /archivada/i.test(document.querySelector("#view").innerText);
      const p = await NUBE.sb.from("pagos").insert({ campana_id: "${C.c}", tipo: "trabajador", trabajador_id: "${C.tr}", importe_cent: 100, fecha: "2026-11-21" });
      const camps = (await NUBE.sb.rpc("mis_campanas")).data.find(x => x.campana_id === "${C.c}");
      await t.pulsar('[data-act="nArchivar"][data-v="1"]'); ${confirmarImpacto};
      try { await t.esperar(() => !nArchivada(), 20000, "restaurar"); } catch (e) { throw new Error(e.message + " · " + JSON.stringify({ d: NUBE.d.campana.activa, c: NUBE.c.activa, v: NUBE.d.campana.version, modal: (t.q("#modal").innerText || "").slice(0, 120), hash: location.hash, toast: t.q("#toast").textContent, boton: !!t.q('[data-act="nArchivar"][data-v="1"]') })); }
      return { parte: vistas.includes("parte"), banner, pago: p.error?.message || "PERMITIDO", lista: camps?.activa, restaurada: nEdita() };`);
    ok(!arch.parte && arch.banner && /ARCHIVADA/.test(arch.pago) && arch.lista === false && arch.restaurada, "archivar: " + JSON.stringify(arch));

    // 7) Superadministrador: archiva, ve el resumen, nombre mal escrito rechazado, elimina definitivamente
    const elim = await ev(sa, `await nubeCargar(); await t.ir("#ajustes"); render(); await t.pulsar('[data-act="nArchivar"][data-v="0"]'); ${confirmarImpacto};
      await t.esperar(() => nArchivada() && t.q('[data-act="nEliminarCampana"]'), 20000, "archivar para eliminar" + ${aviso});
      await t.pulsar('[data-act="nEliminarCampana"]'); const resumen = await t.esperar(() => t.q("#elimNombre") && t.q("#modal").innerText, 15000, "resumen de lo que se pierde");
      t.rellenar("#elimNombre", ${JSON.stringify(nombre.toLowerCase())}); t.q("#toast").textContent = ""; await t.pulsar('[data-act="nConfirmarEliminar"]');
      const mal = await t.esperar(() => t.q("#toast").textContent, 5000, "aviso de nombre"); const sigue = (await NUBE.sb.from("campanas").select("id").eq("id", "${C.c}")).data.length;
      t.rellenar("#elimNombre", ${JSON.stringify(nombre)}); await t.pulsar('[data-act="nConfirmarEliminar"]');
      await t.esperar(() => !NUBE.c && location.hash === "#campanas", 30000, "eliminar" + ${aviso});
      const queda = await Promise.all(["campanas", "trabajadores", "duenos", "partes", "pagos", "miembros"].map(async tb => (await NUBE.sb.from(tb).select("*", { count: "exact", head: true }).eq(tb === "campanas" ? "id" : "campana_id", "${C.c}")).count));
      return { resumen, mal, sigue, queda, lista: NUBE.campanas.some(x => x.campana_id === "${C.c}") };`);
    ok(/Jornadas de trabajadores\s*1/.test(elim.resumen) && /Pagos y entregas\s*1/.test(elim.resumen) && /no se puede deshacer/.test(elim.resumen), "resumen: " + elim.resumen.slice(0, 400));
    ok(/nombre exacto/.test(elim.mal) && elim.sigue === 1, "nombre mal escrito: " + JSON.stringify({ mal: elim.mal, sigue: elim.sigue }));
    ok(elim.queda.every(n => n === 0) && !elim.lista, "tras eliminar: " + JSON.stringify(elim.queda));
    const anaSinCampana = await ev(cr, `const r = await NUBE.sb.rpc("mis_campanas"); return (r.data || []).some(x => x.campana_id === "${C.c}");`);
    ok(!anaSinCampana, "el creador sigue viendo la campaña eliminada");
    return { superadmin: "sin ser miembro: €/h dueño con vista previa (96 € → 104 €), máquina; pagos iguales", creador: cre, ajeno, administrador: lector, trabajador,
      archivar: { pago: "rechazado (ARCHIVADA)", parte: "oculto", restaurada: true }, eliminar: { resumen: "con jornadas y pagos", nombreMal: "rechazado", filasQuedan: elim.queda } };
  } finally { SRV.nube = false; }
});

/* ---------- Ejecución ---------- */
async function main() {
  await new Promise(r => servidor.listen(0, "127.0.0.1", r));
  BASE = "http://127.0.0.1:" + servidor.address().port;
  const resultados = [];
  for (const p of PRUEBAS.filter(p => p.id.includes(FILTRO) && (!p.red || FILTRO.startsWith("nube")))) {   // las de red, solo pidiéndolas
    const t0 = Date.now(); const e0 = erroresConsola.length;
    let estado = "OK", detalle;
    try { detalle = await p.fn(); }
    catch (e) { estado = "FALLA"; detalle = e.message; }
    const errores = erroresConsola.slice(e0).map(x => x.msg);
    if (estado === "OK" && errores.length) { estado = "FALLA"; detalle = { errorDeConsola: errores, detalle }; }
    for (const w of ventanas.splice(0)) await cerrar(w).catch(() => {});
    resultados.push({ id: p.id, nombre: p.nombre, estado, segundos: +((Date.now() - t0) / 1000).toFixed(1), detalle, erroresConsola: errores });
    console.log(`${estado === "OK" ? "OK   " : "FALLA"}  ${p.id.padEnd(17)} ${p.nombre}${estado === "OK" ? "" : "\n       → " + (typeof detalle === "string" ? detalle : JSON.stringify(detalle))}`);
  }
  const resumen = { fecha: new Date().toISOString(), version: (fs.readFileSync(path.join(WWW, "index.html"), "utf8").match(/const APP_VERSION = "([^"]+)"/) || [])[1], electron: process.versions.electron, chrome: process.versions.chrome,
    ok: resultados.filter(r => r.estado === "OK").length, fallos: resultados.filter(r => r.estado !== "OK").length, resultados };
  fs.writeFileSync(path.join(__dirname, "resultado.json"), JSON.stringify(resumen, null, 2));
  console.log(`\n${resumen.ok} correctas, ${resumen.fallos} con fallos · detalle en herramientas/pruebas/resultado.json`);
  servidor.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  app.exit(resumen.fallos ? 1 : 0);
}
app.whenReady().then(main).catch(e => { console.error(e); app.exit(2); });
app.on("window-all-closed", () => {});
