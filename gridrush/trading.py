"""Gridrushi kauplemismäng ja serveripõhine mängukell."""

import random
import time
from datetime import date
from threading import Lock

from gridrush.db import loe_paev, saadaval_paevad
from gridrush.day_filter import paeva_piirid


# Üks mängupäev kestab tavakiirusel kolm minutit.
# Iga päev sisaldab 96 elektrihinna perioodi.
PAEVA_PIKKUS = 180.0
PERIOODI_PIKKUS = PAEVA_PIKKUS / 96

LUBATUD_KIIRUSED = (0.5, 1.0, 2.0, 5.0)


# Mängureegli rikkumine või vigane sisend; server vastab sellele koodiga 400.
class ManguViga(ValueError):
    pass


# Ühe brauseriseansi iseseisev mäng koos serveri kellaga.
class Kauplemismang:
    def __init__(self):
        self.lukk = Lock()

        self.algsumma = 1000.0
        self.raha = self.algsumma
        self.energia = 0
        self.aku_maht = 10

        self.paev = None
        self.hinnad = []
        self.indeks = 0
        self.paevade_arv = 0

        self.mangitud_sekundid = 0.0
        self.viimane_kell = None
        self.kaib = False
        self.paev_labi = False
        self.kiirus = 1.0

    # Kutsuda ainult siis, kui self.lukk on hõivatud.
    def _uuenda_kell(self):
        """Arvutab kehtiva hinnapunkti serveris möödunud aja põhjal."""

        if not self.kaib:
            return

        # monotonic() sobib ajavahede mõõtmiseks.
        praegu = time.monotonic()

        if self.viimane_kell is not None:
            vahe = max(0.0, praegu - self.viimane_kell)

            self.mangitud_sekundid += vahe * self.kiirus

        self.viimane_kell = praegu

        if self.mangitud_sekundid >= PAEVA_PIKKUS:
            self.mangitud_sekundid = PAEVA_PIKKUS
            self.paev_labi = True
            self.kaib = False
            self.viimane_kell = None

        # Brauserist indeksit ei usaldata.
        self.indeks = min(
            len(self.hinnad) - 1,
            int(self.mangitud_sekundid / PERIOODI_PIKKUS)
        )

    # Ei uuenda mängukella; väljakutsuja peab seda varem tegema.
    def _seis(self):
        """Koostab mängija praeguse mänguseisu."""

        if not self.hinnad:
            raise ManguViga("Mäng pole alustatud.")

        hind = self.hinnad[self.indeks]

        # Vara väärtus = raha + akus oleva elektri turuväärtus.
        vara_vaartus = self.raha + self.energia * hind["price"]

        if self.algsumma > 0:
            kasum = (
                (vara_vaartus - self.algsumma)
                / self.algsumma
            ) * 100
        else:
            kasum = 0.0

        return {
            "active": True,
            "date": self.paev,
            "day_number": self.paevade_arv,
            "index": self.indeks,
            "total": len(self.hinnad),
            "timestamp": hind["timestamp"],
            "price": hind["price"],
            "balance": round(self.raha, 2),
            "energy": self.energia,
            "capacity": self.aku_maht,
            "initial_balance": self.algsumma,
            "asset_value": round(vara_vaartus, 2),
            "profit_percent": round(kasum, 1),

            "elapsed_seconds": round(self.mangitud_sekundid, 6),
            "speed": self.kiirus,
            "running": self.kaib,
            "day_finished": self.paev_labi
        }

    def hinnad_nahtavad(self):
        """Tagastab ainult serveri mängukella järgi avanenud hinnad."""

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            self._uuenda_kell()

            # Ajatemplid võib ette teada, kuid tulevased hinnad
            # jäävad peidetuks kuni vastava perioodi alguseni.
            return {
                "date": self.paev,
                "total": len(self.hinnad),
                "index": self.indeks,
                "unit": "EUR/MWh",
                "prices": [
                    {
                        "timestamp": hind["timestamp"],
                        "price": hind["price"] if i <= self.indeks else None
                    }
                    for i, hind in enumerate(self.hinnad)
                ]
            }

    def seis(self):
        """Tagastab olemasoleva mänguseisu seda lähtestamata."""

        with self.lukk:
            if not self.hinnad:
                return {"active": False}

            self._uuenda_kell()

            return self._seis()

    def _loe_taispaev(self, paev):
        """Laeb ja kontrollib ühe päeva kõik 96 hinnaperioodi."""

        hinnad = loe_paev(paev)
        algus, lopp = paeva_piirid(paev)

        oodatud = list(range(
            int(algus.timestamp()),
            int(lopp.timestamp()),
            900
        ))

        ajatemplid = [h["timestamp"] for h in hinnad]

        if len(oodatud) != 96 or ajatemplid != oodatud:
            raise ManguViga(
                "Päeva hinnad puuduvad või on mittetäielikud."
            )

        return hinnad

    def alusta(self, paev=None):
        """Alustab ainult selle mängija jaoks uue mängu."""

        if paev is None:
            paevad = saadaval_paevad()

            if not paevad:
                raise ManguViga(
                    "Andmebaasis pole sobivaid hinnapäevi."
                )

            paev = random.choice(paevad)

        try:
            if (
                not isinstance(paev, str)
                or date.fromisoformat(paev).isoformat() != paev
            ):
                raise ValueError

        except ValueError:
            raise ManguViga("Vigane kuupäev.")

        hinnad = self._loe_taispaev(paev)

        with self.lukk:
            self.paev = paev
            self.hinnad = hinnad
            self.paevade_arv = 1
            self.indeks = 0
            self.raha = self.algsumma
            self.energia = 0

            self.mangitud_sekundid = 0.0
            self.viimane_kell = None
            self.kaib = False
            self.paev_labi = False
            self.kiirus = 1.0

            return self._seis()

    def jatka(self):
        """Käivitab või jätkab serveripõhist mängukella."""

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            self._uuenda_kell()

            if self.paev_labi:
                raise ManguViga(
                    "Päev on lõppenud. Alusta uut päeva."
                )

            if not self.kaib:
                self.viimane_kell = time.monotonic()
                self.kaib = True

            return self._seis()

    def peata(self):
        """Peatab mängukella ja jätab hinna samaks."""

        with self.lukk:
            if not self.hinnad:
                return {"active": False}

            # Arvestame enne peatamist möödunud aja sisse.
            self._uuenda_kell()

            self.kaib = False
            self.viimane_kell = None

            return self._seis()

    def muuda_kiirust(self, kiirus):
        """Muudab mängukiirust ilma senist mänguaega kaotamata."""

        if (
            type(kiirus) not in (float, int)
            or kiirus not in LUBATUD_KIIRUSED
        ):
            raise ManguViga(
                "Lubatud kiirused: 0.5, 1, 2, 5."
            )

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            # Arvestame senise aja veel vana kiirusega.
            self._uuenda_kell()

            self.kiirus = float(kiirus)

            return self._seis()

    def uus_paev(self):
        """Alustab järgmise päeva, säilitades raha ja aku."""

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            self._uuenda_kell()

            if not self.paev_labi:
                raise ManguViga(
                    "Praegune päev pole veel lõppenud."
                )

            paevad = saadaval_paevad()

            if not paevad:
                raise ManguViga(
                    "Järgmist hinnapäeva ei leitud."
                )

            # Valime kronoloogiliselt järgmise olemasoleva päeva.
            # Andmebaasi lõpust liigume vajadusel esimesse päeva.
            uus_paev = next(
                (p for p in paevad if p > self.paev),
                paevad[0]
            )

            uued_hinnad = self._loe_taispaev(uus_paev)

            self.paev = uus_paev
            self.hinnad = uued_hinnad
            self.indeks = 0
            self.paevade_arv += 1

            self.mangitud_sekundid = 0.0
            self.viimane_kell = None
            self.kaib = False
            self.paev_labi = False

            return self._seis()

    def tehing(self, tegevus, kogus):
        """Ostab või müüb elektrit serveri määratud hinnaga."""

        if tegevus not in ("buy", "sell"):
            raise ManguViga("Tundmatu tehing.")

        if type(kogus) not in (float, int) or kogus <= 0:
            raise ManguViga(
                "Kogus peab olema positiivne arv."
            )

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            self._uuenda_kell()

            if self.paev_labi:
                raise ManguViga(
                    "Päev on lõppenud. Alusta uut päeva."
                )

            # Pausi ajal saab kaubelda peatatud hinnaga.
            hind = self.hinnad[self.indeks]["price"]
            summa = round(kogus * hind, 2)

            if tegevus == "buy":
                if self.energia + kogus > self.aku_maht:
                    raise ManguViga(
                        "Akus pole piisavalt ruumi."
                    )

                if self.raha - summa < -0.000001:
                    raise ManguViga(
                        "Ostmiseks pole piisavalt raha."
                    )

                self.raha = round(self.raha - summa, 2)
                self.energia += kogus

                teade = f"Ostsid {kogus} MWh elektrit."

            else:
                if self.energia < kogus:
                    raise ManguViga(
                        "Akus pole piisavalt elektrit."
                    )

                # Negatiivse hinna puhul võib müümine maksta.
                if self.raha + summa < -0.000001:
                    raise ManguViga(
                        "Müümiseks pole piisavalt raha."
                    )

                self.raha = round(self.raha + summa, 2)
                self.energia -= kogus

                teade = f"Müüsid {kogus} MWh elektrit."

            vastus = self._seis()
            vastus["message"] = teade

            return vastus
