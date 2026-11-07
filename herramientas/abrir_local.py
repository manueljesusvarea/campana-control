"""Abre la app en este PC con una dirección estable para conservar la campaña."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

RAIZ_WEB = Path(__file__).resolve().parents[1] / "www"
URL = "http://localhost:8000/"

def main():
    try:
        servidor = ThreadingHTTPServer(
            ("127.0.0.1", 8000), partial(SimpleHTTPRequestHandler, directory=str(RAIZ_WEB))
        )
    except OSError:
        raise SystemExit("El puerto 8000 está ocupado. Cierra la otra vista local y vuelve a intentarlo.")
    with servidor:
        print(f"Abre {URL} en tu navegador. Para terminar, cierra esta ventana.")
        webbrowser.open(URL)
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            pass

if __name__ == "__main__":
    main()
