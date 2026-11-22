
"""Gridrushi kauplemismäng ja serveripõhine mängukell."""

import random
import time
from datetime import date
from threading import Lock

from gridrush.db import loe_paev, saadaval_paevad
from gridrush.day_filter import paeva_piirid
from gridrush.batteries import AKUD, EFEKTIIVSUS


# Üks mängupäev kestab tavakiirusel kolm minutit.
# Iga päev sisaldab 96 elektrihinna perioodi.
PAEVA_PIKKUS = 180.0
PERIOODI_PIKKUS = PAEVA_PIKKUS / 96

# Kiirused, mida mängija saab valida.
LUBATUD_KIIRUSED = (0.5, 1.0, 2.0, 5.0)


class ManguViga(ValueError):
    pass


class Kauplemismang:
    def __init__(self):
        # Iga mängija saab oma mänguobjekti ja luku.
        self.lukk = Lock()

        # Mängu algseaded.
        self.algsumma = 1000.0
        self.raha = self.algsumma
        self.energia = 0
        self.aktiivne_aku = 'starter'
        self.aku_maht = AKUD[self.aktiivne_aku]['maht']
        self.aku_voimsus = AKUD[self.aktiivne_aku]['võimsus']
        self.max_tehingu_maht = self.aku_voimsus * 0.25 
        self.perioodi_tehingumaht = 0.0
        self.viimane_tehinguperiood = None

        self.omatud_akud = {'starter'}

        # Praegune mängupäev ja hinnapunkt.
        self.paev = None
        self.hinnad = []
        self.indeks = 0
        self.paevade_arv = 0

        # Serveripõhise mängukella muutujad.
        self.mangitud_sekundid = 0.0
        self.viimane_kell = None
        self.kaib = False
        self.paev_labi = False
        self.kiirus = 1.0

    def osta_aku(self, aku_id):
        with self.lukk:
            if aku_id not in AKUD:
                raise ManguViga("Sellist akut ei eksisteeri.")
        
        
            if aku_id in self.omatud_akud:
                raise ManguViga("Sul on see aku juba olemas.")
       
            aku_hind = AKUD[aku_id]['hind']
        
            if self.raha < aku_hind:
                raise ManguViga("Sul pole piisavalt raha selle aku ostmiseks.")
        
            self.raha -= aku_hind
            self.omatud_akud.add(aku_id)


    def vaheta_aku(self, aku_id):
        with self.lukk:

            if aku_id not in self.omatud_akud:
                raise ManguViga("See aku ei kuulu sulle.")
           
            self.aktiivne_aku = aku_id
            self.aku_maht = AKUD[self.aktiivne_aku]['maht']
            self.aku_voimsus = AKUD[self.aktiivne_aku]['võimsus'] 
            self.max_tehingu_maht = self.aku_voimsus * 0.25 


    def _uuenda_kell(self):
        """Arvutab kehtiva hinnapunkti serveris möödunud aja põhjal."""

        # Pausil olles mänguaeg edasi ei liigu.
        if not self.kaib:
            return

        # monotonic() sobib ajavahede mõõtmiseks.
        praegu = time.monotonic()

        if self.viimane_kell is not None:
            vahe = max(0.0, praegu - self.viimane_kell)

            # Mänguaeg sõltub kasutaja valitud kiirusest.
            self.mangitud_sekundid += vahe * self.kiirus

        self.viimane_kell = praegu

        # Kui terve mängupäev on läbi, peatame mängukella.
        if self.mangitud_sekundid >= PAEVA_PIKKUS:
            self.mangitud_sekundid = PAEVA_PIKKUS
            self.paev_labi = True
            self.kaib = False
            self.viimane_kell = None

        # Arvutame hinnaindeksi mänguaja järgi.
        # Brauserist indeksit ei usaldata.
        self.indeks = min(
            len(self.hinnad) - 1,
            int(self.mangitud_sekundid / PERIOODI_PIKKUS)
        )
    def hinnad_nahtavad(self):
        """Tagastab ainult serveri mängukella järgi avanenud hinnad."""

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            self._uuenda_kell()

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






    def _seis(self):
        """Koostab mängija praeguse mänguseisu."""

        if not self.hinnad:
            raise ManguViga("Mäng pole alustatud.")

        hind = self.hinnad[self.indeks]

        # Vara väärtus = raha + akus oleva elektri turuväärtus.
        vara_vaartus = self.raha + self.energia * hind["price"]

        # Kasumi või kahjumi protsent algsummast.
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

            "active_battery": self.aktiivne_aku,
            "owned_batteries": list(self.omatud_akud),
            "battery_power": self.aku_voimsus,
            "max_trade_MWh": self.max_tehingu_maht,
            "battery_models": AKUD,

            "initial_balance": self.algsumma,
            "asset_value": round(vara_vaartus, 2),
            "profit_percent": round(kasum, 1),

            # Brauser kasutab neid mängukella kuvamiseks.
            "elapsed_seconds": round(self.mangitud_sekundid, 6),
            "speed": self.kiirus,
            "running": self.kaib,
            "day_finished": self.paev_labi
        }

    def seis(self):
        """Tagastab olemasoleva mänguseisu seda lähtestamata."""

        with self.lukk:
            # Kui selles seansis mängu pole, tagastame active: false.
            if not self.hinnad:
                return {"active": False}

            # Värskendame kõigepealt serveripõhist mängukella.
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

        # Kui kuupäeva pole antud, valime juhusliku päeva.
        if paev is None:
            paevad = saadaval_paevad()

            if not paevad:
                raise ManguViga(
                    "Andmebaasis pole sobivaid hinnapäevi."
                )

            paev = random.choice(paevad)

        # Kontrollime kuupäeva vormingut.
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
            # Lähtestame raha, aku ja hinnapunkti.
            self.paev = paev
            self.hinnad = hinnad
            self.paevade_arv = 1
            self.indeks = 0
            self.raha = self.algsumma
            self.energia = 0
            self.aktiivne_aku = 'starter'
            self.omatud_akud = {'starter'}
            self.aku_maht = AKUD[self.aktiivne_aku]['maht']
            self.aku_voimsus = AKUD[self.aktiivne_aku]['võimsus']
            self.max_tehingu_maht = self.aku_voimsus * 0.25
            self.perioodi_tehingumaht = 0.0
            self.viimane_tehinguperiood = None

            # Lähtestame mängukella.
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

            # Juba töötavat mängukella uuesti ei alustata.
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

            # Järgmised sekundid liiguvad uue kiirusega.
            self.kiirus = float(kiirus)

            return self._seis()

    def uus_paev(self):
        """Alustab järgmise päeva, säilitades raha ja aku."""

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            self._uuenda_kell()

            # Päeva ei tohi vahetada enne selle lõppu.
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

            # Vahetame päeva ja alustame indeksist 0.
            self.paev = uus_paev
            self.hinnad = uued_hinnad
            self.indeks = 0
            self.paevade_arv += 1

            # Lähtestame ainult mängukella.
            self.mangitud_sekundid = 0.0
            self.viimane_kell = None
            self.kaib = False
            self.paev_labi = False

            # Raha, aku ja kiirus jäävad samaks.
            return self._seis()

    def tehing(self, tegevus, kogus):
        """Ostab või müüb elektrit serveri määratud hinnaga."""

        if tegevus not in ("buy", "sell"):
            raise ManguViga("Tundmatu tehing.")

        if type(kogus) not in (int, float) or kogus <= 0:
            raise ManguViga(
                "Kogus peab olema positiivne arv."
            )

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            # Arvutame serveri kellaga tehingu tegeliku hinnapunkti.
            self._uuenda_kell()

            if self.paev_labi:
                raise ManguViga(
                    "Päev on lõppenud. Alusta uut päeva."
                )

            # Kontrollime, kas algas uus hinnaperiood.
            praegune_periood = (self.paev, self.indeks)

            if praegune_periood != self.viimane_tehinguperiood:
                self.perioodi_tehingumaht = 0.0
                self.viimane_tehinguperiood = praegune_periood

            if self.perioodi_tehingumaht + kogus > self.max_tehingu_maht:
                raise ManguViga("Aku võimsus ei võimalda sellel perioodil nii palju kaubelda.")
            # Pausi ajal saab kaubelda peatatud hinnaga.
            hind = self.hinnad[self.indeks]["price"]
            summa = round(kogus * hind * EFEKTIIVSUS, 2)

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

                summa = round(kogus * hind * EFEKTIIVSUS, 2)
               
                # Negatiivse hinna puhul võib müümine maksta.
                if self.raha + summa < -0.000001:
                    raise ManguViga(
                        "Müümiseks pole piisavalt raha."
                    )

                self.raha = round(self.raha + summa, 2)
                self.energia -= kogus

                teade = f"Müüsid {kogus} MWh elektrit."

            self.perioodi_tehingumaht += kogus

            vastus = self._seis()
            vastus["message"] = teade

            return vastus
