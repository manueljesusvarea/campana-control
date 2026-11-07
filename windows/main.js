// CAMPAÑA CONTROL para Windows: una ventana de Electron que abre la misma app de www/.
// Los datos (localStorage e IndexedDB) se guardan en %APPDATA%\CAMPAÑA CONTROL y no se borran al desinstalar.
const { app, BrowserWindow, Menu, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");

// En el instalador www/ va dentro de la app; al probar con «npm run empezar» se usa ../www
const WWW = fs.existsSync(path.join(__dirname, "www")) ? path.join(__dirname, "www") : path.join(__dirname, "..", "www");

// Una sola ventana: si ya está abierta, se trae al frente
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function crearVentana() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 360, minHeight: 500,
    backgroundColor: "#f2f3ec",
    icon: path.join(WWW, "icons", "icon-512.png"),
    title: "CAMPAÑA CONTROL",
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true }
  });
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(WWW, "index.html"));

  // Enlaces externos (si los hubiera): en el navegador, nunca dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setSpellCheckerLanguages(["es-ES"]);
  // PDF, Excel y copias de seguridad: diálogo de «Guardar como», empezando en la carpeta Descargas
  session.defaultSession.on("will-download", (e, item) => {
    item.setSaveDialogOptions({ title: "Guardar archivo", defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
  });
  crearVentana();
});
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
