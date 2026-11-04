
"""Väike lokaalne testserver. TÜ serveris pole seda vaja."""

import importlib.util
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT / "public_html")

# Laeme CGI-faili nagu tavalise mooduli,
# et seda saaks Windowsis testida.
spec = importlib.util.spec_from_file_location(
    "get_prices", ROOT / "public_html" / "cgi-bin" / "get_prices.py"
)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == "/cgi-bin/get_prices.py":
            status, data = api.get_prices_response(
                urlsplit(self.path).query
            )

            body = json.dumps(
                data, ensure_ascii=False
            ).encode("utf-8")

            self.send_response(status)
            self.send_header(
                "Content-Type", "application/json; charset=utf-8"
            )
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


print(
    "Ava brauseris http://127.0.0.1:8000/chart_test.html",
    flush=True
)

ThreadingHTTPServer(
    ("127.0.0.1", 8000), Handler
).serve_forever()
