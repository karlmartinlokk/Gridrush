"""Gridrushi kohalik testserver: eraldi mängijad ja mängukell."""

import json
import os
import secrets
import time
import sqlite3

from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit, parse_qs

from gridrush.game import Kauplemismang, ManguViga

from gridrush.statistics import (
    loo_tabelid,
    loe_statistika,
    mangija_olemas
)

from gridrush.achievements import loe_saavutused


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT / "public_html")


# Seansid salvestatakse praegu serveri mällu.
seansid = {}
seansid_lukk = Lock()
start_lukk = Lock()

SEANSI_KESTUS = 7 * 24 * 60 * 60
KUPSISE_KESTUS = 365 * 24 * 60 * 60
viimane_puhastus = 0.0


class Handler(SimpleHTTPRequestHandler):

    def leia_mang(self):
        """Leiab olemasoleva mängu, kuid ei loo uut seanssi."""

        self.uus_seanss = None

        purk = cookies.SimpleCookie()

        try:
            purk.load(self.headers.get("Cookie", ""))
            seanss = purk.get("gridrush_session")
            tunnus = seanss.value if seanss else None

        except cookies.CookieError:
            tunnus = None

        praegu = time.monotonic()

        global viimane_puhastus

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

            kirje = seansid.get(tunnus) if tunnus else None

            if kirje is None:
                return None

            kirje["last_access"] = praegu

            return kirje["game"]

    def loe_tunnus(self):
        """Loeb brauseri mängijatunnuse."""

        purk = cookies.SimpleCookie()

        try:
            purk.load(self.headers.get("Cookie", ""))

            seanss = purk.get("gridrush_session")

            return seanss.value if seanss else None

        except cookies.CookieError:
            return None

    
    def loo_seanss(self, mang):
        """Seob mänguobjekti püsiva mängijatunnusega."""

        praegu = time.monotonic()
        tunnus = mang.player_id

        with seansid_lukk:

            seansid[tunnus] = {
                "game": mang,
                "last_access": praegu
            }

        self.uus_seanss = tunnus

    def lopeta_mang(self):
        """Lõpetab praeguse mängu"""

        tunnus = self.loe_tunnus()

        with seansid_lukk:
            kirje = seansid.pop(tunnus, None) if tunnus else None

        if kirje is not None:
            kirje["game"].peata()

        return {"active": False}

    def alusta_mang(self, andmed):
        """Alustab uut mängu või tagastab juba käimasoleva."""

        mang = self.leia_mang()

        if mang is not None and andmed.get("only_if_missing"):
            return mang.seis()

        # Kui mängijal pole veel seanssi,
        # loome uue mänguobjekti.
        uus_mang = mang is None

        if uus_mang:
            tunnus = self.loe_tunnus()

            # Tundmatu mängija saab serveris loodud uue tunnuse.
            if not mangija_olemas(tunnus):
                tunnus = secrets.token_urlsafe(32)

            mang = Kauplemismang(player_id=tunnus)

        # Alustame mängu kõigepealt.
        # Kui see ebaõnnestub, uut seanssi ei salvestata.
        tulemus = mang.alusta(
            andmed.get("date")
        )

        # Alles edukas mängu alustamine loob uue seansi.
        if uus_mang:
            self.loo_seanss(mang)

        return tulemus

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

        if getattr(self, "uus_seanss", None):
            cookie = (
                f"gridrush_session={self.uus_seanss}; "
                f"Path=/; HttpOnly; SameSite=Lax; "
                f"Max-Age={KUPSISE_KESTUS}"
            )

            # HTTPS-i puhul peaks küpsis olema Secure.
            # See kohalik testserver kasutab praegu HTTP-d.
            self.send_header("Set-Cookie", cookie)

        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        """Tagastab mänguseisu, lubatud hinnad või veebilehe failid."""

        url = urlsplit(self.path)


        if url.path == "/api/stats":
            try:
                mang = self.leia_mang()
                tunnus = self.loe_tunnus()

                parameetrid = parse_qs(url.query)
                scope = parameetrid.get("scope", ["all"])[0]

                if scope not in ("all", "game"):
                    self.saada_json(400, {
                        "error": "Vigane statistikaperiood."
                    })
                    return

                # Uuendame aktiivse mängu seisu enne statistikat.
                if mang is not None:
                    mang.seis()

                kogu_statistika = loe_statistika(tunnus)

                if scope == "game":
                    statistika = loe_statistika(
                        tunnus,
                        game_id=mang.game_id if mang else 0
                    )
                else:
                    statistika = kogu_statistika

                self.saada_json(200, {
                    "stats": statistika,
                    "achievements": loe_saavutused(kogu_statistika),
                    "active_game": mang is not None
                })

            except sqlite3.Error:
                self.saada_json(503, {
                    "error": "Statistika pole hetkel kättesaadav."
                })

            return


        if url.path == "/api/demo/state":
            mang = self.leia_mang()

            if mang is None:
                self.saada_json(200, {"active": False})

            else:
                try:
                    self.saada_json(200, mang.seis())

                except sqlite3.Error:
                    self.saada_json(503, {
                        "error": "Andmebaas pole hetkel kättesaadav."
                    })

        elif url.path == "/api/demo/prices":
            # Anti-cheat: näitame ainult serveri mängukellaga
            # juba avanenud hinnapunkte.
            mang = self.leia_mang()

            if mang is None:
                self.saada_json(
                    403,
                    {"error": "Mäng pole alustatud."}
                )
                return

            try:
                andmed = mang.hinnad_nahtavad()

                self.saada_json(200, andmed)

            except ManguViga as viga:
                self.saada_json(
                    400,
                    {"error": str(viga)}
                )

            except sqlite3.Error:
                self.saada_json(503, {
                    "error": "Andmebaas pole hetkel kättesaadav."
                })

        else:
            super().do_GET()

    def do_POST(self):
        """Käsitleb mängu alustamist, kella ja tehinguid."""

        aadress = urlsplit(self.path).path


        lubatud = {
            "/api/demo/start",
            "/api/demo/reset",
            "/api/demo/trade",
            "/api/demo/resume",
            "/api/demo/pause",
            "/api/demo/speed",
            "/api/demo/next-day",

            # Akud
            "/api/demo/buy-battery",
            "/api/demo/switch-battery",

            # Päikeseparkide ja tuulikute ostmine
            "/api/demo/buy-generator"
        }


        if aadress not in lubatud:
            self.saada_json(
                404,
                {"error": "Tundmatu API aadress."}
            )
            return

        try:
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

            if aadress == "/api/demo/start":

                with start_lukk:
                    tulemus = self.alusta_mang(andmed)

            elif aadress == "/api/demo/reset":
                with start_lukk:
                    tulemus = self.lopeta_mang()

            else:
                # Otsime olemasolevat seanssi.
                # See funktsioon ei loo uut mängu ega küpsist.
                mang = self.leia_mang()

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
                elif aadress == "/api/demo/buy-battery":
                    mang.osta_aku(andmed.get("battery_id"))
                    tulemus = mang.seis()
                elif aadress == "/api/demo/switch-battery":
                    mang.vaheta_aku(andmed.get("battery_id"))
                    tulemus = mang.seis()           

                elif aadress == "/api/demo/buy-generator":

                    tulemus = mang.osta_generaator(
                        andmed.get("generator_id")
                    )

                
                else:
                    tulemus = mang.uus_paev()

                if aadress in ("/api/demo/trade", "/api/demo/next-day"):
                    tulemus["achievements"] = loe_saavutused(
                        loe_statistika(mang.player_id)
                    )

            self.saada_json(200, tulemus)

        except (ValueError, UnicodeDecodeError) as viga:
            self.saada_json(
                400,
                {"error": str(viga)}
            )
        except sqlite3.Error:
            self.saada_json(503, {
                "error": "Andmebaas pole hetkel kättesaadav."
            })


if __name__ == "__main__":
    loo_tabelid()
    print(
        "Ava http://127.0.0.1:8000/index.html",
        flush=True
    )

    ThreadingHTTPServer(
        ("127.0.0.1", 8000),
        Handler
    ).serve_forever()
