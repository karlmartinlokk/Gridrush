
"""Gridrushi kohalik testserver: eraldi mängijad ja mängukell."""

import importlib.util
import json
import os
import secrets
import time

from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit

from gridrush.trading import Kauplemismang, ManguViga


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT / "public_html")


# Laeme olemasoleva elektrihindade API.
spec = importlib.util.spec_from_file_location(
    "get_prices",
    ROOT / "public_html" / "cgi-bin" / "get_prices.py"
)

api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


# Hoiame iga brauseriseansi mängu eraldi sõnastikus.
# Seansid salvestatakse praegu serveri mällu.
seansid = {}
seansid_lukk = Lock()

# Kasutamata seansi maksimaalne eluiga on 7 päeva.
SEANSI_KESTUS = 7 * 24 * 60 * 60
viimane_puhastus = 0.0


class Handler(SimpleHTTPRequestHandler):

    def leia_mang(self):
        """Leiab olemasoleva mängu, kuid ei loo uut seanssi."""

        # Iga päringu alguses eeldame, et uut küpsist pole vaja.
        self.uus_seanss = None

        # Loeme brauseri olemasoleva seansiküpsise.
        purk = cookies.SimpleCookie()

        try:
            purk.load(self.headers.get("Cookie", ""))
            seanss = purk.get("gridrush_session")
            tunnus = seanss.value if seanss else None

        except cookies.CookieError:
            tunnus = None

        praegu = time.monotonic()

        global viimane_puhastus

        # Kaitseme seansside sõnastikku samaaegsete päringute eest.
        with seansid_lukk:

            # Eemaldame aegunud seansid kõige rohkem kord minutis.
            if praegu - viimane_puhastus >= 60:
                vanad = [
                    k for k, v in seansid.items()
                    if praegu - v["last_access"] > SEANSI_KESTUS
                ]

                for k in vanad:
                    del seansid[k]

                viimane_puhastus = praegu

            # Kui küpsis puudub või seanss on aegunud,
            # ei loo me uut mängu ega küpsist.
            kirje = seansid.get(tunnus) if tunnus else None

            if kirje is None:
                return None

            # Olemasolev mängija jätkab oma varasemat mängu.
            kirje["last_access"] = praegu

            return kirje["game"]

    def loo_seanss(self, mang):
        """Loob uue seansi ainult pärast edukat mängu alustamist."""

        praegu = time.monotonic()

        with seansid_lukk:

            # Loome juhusliku ja turvalise seansitunnuse.
            tunnus = secrets.token_urlsafe(32)

            # Väldime võimalikku olemasoleva tunnuse kordumist.
            while tunnus in seansid:
                tunnus = secrets.token_urlsafe(32)

            # Salvestame uue mängija mänguobjekti.
            seansid[tunnus] = {
                "game": mang,
                "last_access": praegu
            }

        # Uus küpsis lisatakse mängu alustamise JSON-vastusele.
        self.uus_seanss = tunnus

    def saada_json(self, status, andmed):
        """Saadab brauserile JSON-vastuse."""

        body = json.dumps(
            andmed,
            ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)

        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )

        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))

        # Seansiküpsis lisatakse ainult uue mängija loomisel.
        if getattr(self, "uus_seanss", None):
            cookie = (
                f"gridrush_session={self.uus_seanss}; "
                f"Path=/; HttpOnly; SameSite=Lax; "
                f"Max-Age={SEANSI_KESTUS}"
            )

            # HTTPS-i puhul peaks küpsis olema Secure.
            # See kohalik testserver kasutab praegu HTTP-d.
            self.send_header("Set-Cookie", cookie)

        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        """Tagastab mänguseisu, elektrihinnad või veebilehe failid."""

        url = urlsplit(self.path)

        if url.path == "/api/demo/state":
            # Kontrollime, kas brauseril on olemasolev mäng.
            # Kui ei ole, ei loo me uut seanssi ega küpsist.
            mang = self.leia_mang()

            if mang is None:
                self.saada_json(200, {"active": False})

            else:
                self.saada_json(200, mang.seis())

        elif url.path == "/cgi-bin/get_prices.py":
            # Hindade andmebaas on kõigile mängijatele ühine.
            status, andmed = api.get_prices_response(url.query)
            self.saada_json(status, andmed)

        else:
            # HTML, CSS, JavaScript ja pildid.
            super().do_GET()

    def do_POST(self):
        """Käsitleb mängu alustamist, kella ja tehinguid."""

        aadress = urlsplit(self.path).path

        # Iga hinnapunkti jaoks enam /next päringut ei tehta.
        lubatud = {
            "/api/demo/start",
            "/api/demo/trade",
            "/api/demo/resume",
            "/api/demo/pause",
            "/api/demo/speed",
            "/api/demo/next-day"
        }

        if aadress not in lubatud:
            self.saada_json(
                404,
                {"error": "Tundmatu API aadress."}
            )
            return

        try:
            # Kontrollime päringu pikkust ja JSON-i vormingut.
            pikkus = int(
                self.headers.get("Content-Length", "0")
            )

            if pikkus <= 0 or pikkus > 4096:
                raise ManguViga("Vigane päringu pikkus.")

            andmed = json.loads(
                self.rfile.read(pikkus).decode("utf-8")
            )

            if not isinstance(andmed, dict):
                raise ManguViga("Vigane päring.")

            # Otsime olemasolevat seanssi.
            # See funktsioon ei loo uut mängu ega küpsist.
            mang = self.leia_mang()

            if aadress == "/api/demo/start":

                # Kui mängijal pole veel seanssi,
                # loome uue mänguobjekti.
                uus_mang = mang is None

                if uus_mang:
                    mang = Kauplemismang()

                # Alustame mängu kõigepealt.
                # Kui see ebaõnnestub, uut seanssi ei salvestata.
                tulemus = mang.alusta(
                    andmed.get("date")
                )

                # Alles edukas mängu alustamine loob uue seansi.
                if uus_mang:
                    self.loo_seanss(mang)

            else:
                # Kõik muud toimingud nõuavad olemasolevat mängu.
                if mang is None:
                    raise ManguViga("Mäng pole alustatud.")

                if aadress == "/api/demo/trade":
                    tulemus = mang.tehing(
                        andmed.get("action"),
                        andmed.get("quantity")
                    )

                elif aadress == "/api/demo/resume":
                    tulemus = mang.jatka()

                elif aadress == "/api/demo/pause":
                    tulemus = mang.peata()

                elif aadress == "/api/demo/speed":
                    tulemus = mang.muuda_kiirust(
                        andmed.get("speed")
                    )

                else:
                    tulemus = mang.uus_paev()

            self.saada_json(200, tulemus)

        except (ValueError, UnicodeDecodeError) as viga:
            self.saada_json(
                400,
                {"error": str(viga)}
            )


if __name__ == "__main__":
    print(
        "Ava http://127.0.0.1:8000/index.html",
        flush=True
    )

    ThreadingHTTPServer(
        ("127.0.0.1", 8000),
        Handler
    ).serve_forever()
