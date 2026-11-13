
"""Gridrushi kohalik testserver."""

import importlib.util
import json
import os

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from gridrush.trading import Kauplemismang, ManguViga


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT / "public_html")


# Laeme olemasoleva elektrihindade API
spec = importlib.util.spec_from_file_location(
    "get_prices",
    ROOT / "public_html" / "cgi-bin" / "get_prices.py"
)

api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


# Loome ühe kohaliku testmängu
mang = Kauplemismang()


class Handler(SimpleHTTPRequestHandler):

    # Tagastab brauserile JSON-vastuse
    def saada_json(self, status, andmed):
        body = json.dumps(
            andmed, ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type", "application/json; charset=utf-8"
        )
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()

        self.wfile.write(body)

    # GET-päringud: elektrihinnad ja veebilehe failid
    def do_GET(self):
        url = urlsplit(self.path)

        if url.path == "/cgi-bin/get_prices.py":
            status, andmed = api.get_prices_response(url.query)
            self.saada_json(status, andmed)
        else:
            super().do_GET()

    # POST-päringud: mängu alustamine, aeg ja tehingud
    def do_POST(self):
        aadress = urlsplit(self.path).path

        if aadress not in (
            "/api/demo/start",
            "/api/demo/next",
            "/api/demo/trade"
        ):
            self.saada_json(404, {"error": "Tundmatu API aadress."})
            return

        try:
            # Loeme brauseri saadetud JSON-andmed
            pikkus = int(self.headers.get("Content-Length", "0"))

            if pikkus <= 0 or pikkus > 4096:
                raise ManguViga("Vigane päringu pikkus.")

            andmed = json.loads(
                self.rfile.read(pikkus).decode("utf-8")
            )

            if not isinstance(andmed, dict):
                raise ManguViga("Vigane päring.")

            # Valime soovitud mängutoimingu
            if aadress == "/api/demo/start":
                tulemus = mang.alusta(andmed.get("date"))

            elif aadress == "/api/demo/next":
                tulemus = mang.jargmine()

            else:
                tulemus = mang.tehing(
                    andmed.get("action"),
                    andmed.get("quantity")
                )

            self.saada_json(200, tulemus)

        except (ValueError, UnicodeDecodeError) as viga:
            self.saada_json(400, {"error": str(viga)})


if __name__ == "__main__":
    print(
        "Ava http://127.0.0.1:8000/index.html",
        flush=True
    )

    ThreadingHTTPServer(
        ("127.0.0.1", 8000),
        Handler
    ).serve_forever()
