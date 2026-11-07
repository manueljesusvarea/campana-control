// Genera el instalador de Windows (dist/CampanaControl-Setup-<versión>.exe).
// La versión sale de APP_VERSION del código fuente, para que no haya dos números que mantener.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const src = fs.readFileSync(path.join(__dirname, "..", "claude-artifact", "campana-control.html"), "utf8");
const m = src.match(/const APP_VERSION = "([^"]+)"/);
if (!m) { console.error("No encuentro APP_VERSION en el código fuente"); process.exit(1); }
console.log("Instalador de la versión", m[1]);
const cli = path.join(__dirname, "node_modules", "electron-builder", "cli.js");
// Argumentos extra (p. ej. -c.directories.output=otra-carpeta) se pasan tal cual a electron-builder
execFileSync(process.execPath, [cli, "--win", "--publish", "never", "-c.extraMetadata.version=" + m[1], ...process.argv.slice(2)], { stdio: "inherit", cwd: __dirname });
