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
const SRV = { caido: false, swExtra: "", reemplazos: {}, peticiones: [] };
const servidor = http.createServer((req, res) => {
  if (SRV.caido) { req.socket.destroy(); return; }            // simula «sin conexión»
  const u = new URL(req.url, "http://x"); SRV.peticiones.push(u.pathname);
  if (u.pathname === "/campana-control") { res.writeHead(301, { Location: "/campana-control/" + u.search }); return res.end(); }   // como GitHub Pages
  if (!u.pathname.startsWith("/campana-control/")) { res.writeHead(404); return res.end(); }
  let rel = decodeURIComponent(u.pathname.slice("/campana-control/".length)) || "index.html";
  const f = path.join(WWW, rel);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("no existe"); }
  let cuerpo = fs.readFileSync(f);
  if (rel === "sw.js" && SRV.swExtra) cuerpo = Buffer.concat([cuerpo, Buffer.from("\n// " + SRV.swExtra + "\n")]);
  for (const [a, b] of SRV.reemplazos[rel] || []) cuerpo = Buffer.from(cuerpo.toString("utf8").split(a).join(b));
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" });
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
  // «Publicar» 2.3.1: cambia la versión de index.html y, como hace construir_www.py, la VERSION de sw.js
  SRV.reemplazos = { "index.html": [['const APP_VERSION = "2.3.0"', 'const APP_VERSION = "2.3.1-prueba"']], "sw.js": [['+ "2.3.0-', '+ "2.3.1-prueba-']] };
  try {
    await ev(w, `const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); await t.esperar(() => document.querySelector("#avisoVersion"), 8000, "aviso de versión nueva");`);
    const carga = new Promise(r => w.webContents.once("did-finish-load", r));
    await w.webContents.executeJavaScript(`document.querySelector("#avisoVersion button").click(); true`);   // el usuario pulsa «Actualizar»
    await carga; await listo(w);
    const despues = await foto(w);
    ok(despues.version === "2.3.1-prueba", "tras «Actualizar» sigue la versión " + despues.version);
    ok(despues.S === antes.S, "los datos cambiaron al actualizar");
    ok(despues.fotos === antes.fotos && despues.fotos, "las fotos cambiaron al actualizar");
    ok(despues.caches.length === 1 && despues.caches[0].startsWith("2.3.1-prueba"), "cachés tras actualizar: " + JSON.stringify(despues.caches));
    SRV.caido = true;
    await recargar(w);
    const sinRed = await foto(w);
    ok(sinRed.version === "2.3.1-prueba" && sinRed.S === antes.S, "sin conexión no abre la versión nueva con los datos");
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

/* ---------- Ejecución ---------- */
async function main() {
  await new Promise(r => servidor.listen(0, "127.0.0.1", r));
  BASE = "http://127.0.0.1:" + servidor.address().port;
  const resultados = [];
  for (const p of PRUEBAS.filter(p => p.id.includes(FILTRO))) {
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
