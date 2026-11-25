# GRIDRUSH-DOC: moodul
# MÄNGULOOGIKA: serveripoolne mängukell, hinnavalik, aku ja tehinguarvestus.
# Kauplemismang hoiab ühe mängija olekut; eri seansid saavad eri objektid.
# Brauser ei määra tehinguhinda ega avaneva hinnapunkti indeksit.
# Iga olekut muutva toimingu kaitseb Lock, et paralleelpäringud ei põrkuks.


"""Gridrushi kauplemismäng ja serveripõhine mängukell."""

import random
import time
from datetime import date
from threading import Lock
import sqlite3
import secrets

from gridrush.statistics import loo_mang, salvesta_seis
from gridrush.db import loe_paev, saadaval_paevad
from gridrush.day_filter import paeva_piirid


# Üks mängupäev kestab tavakiirusel kolm minutit.
# Iga päev sisaldab 96 elektrihinna perioodi.
PAEVA_PIKKUS = 180.0
PERIOODI_PIKKUS = PAEVA_PIKKUS / 96

# Kiirused, mida mängija saab valida.
LUBATUD_KIIRUSED = (0.5, 1.0, 2.0, 5.0)


# GRIDRUSH-DOC: class ManguViga
# Mängureegli rikkumise või vale sisendi erind; päringukäsitleja vastab 400-ga.
# Pärineb ValueError-ist, et server saaks valideerimisvead ühtselt töödelda.
class ManguViga(ValueError):
    pass


# GRIDRUSH-DOC: class Kauplemismang
# Ühe brauseriseansi iseseisev mäng koos serveri kellaga.
# Hoiab sularaha, salvestatud MWh, aku mahutavust, aktiivset päeva ja hindu.
# Kell liigub monotonic-ajavahede põhjal ainult siis, kui self.kaib on True.
# Avalikud meetodid on POST/GET API toimingute aluseks.
class Kauplemismang:
    # GRIDRUSH-DOC: def __init__
    # Seadistab uue mängija vaikimisi 1000 euro, 0 MWh ja 10 MWh akuga.
    # Mängu kuupäev ning hinnad on alguses määramata; aeg on pausil.
    # Loob threading.Lock'i, mida kasutatakse kõigi olekutoimingute kaitseks.
    def __init__(self, player_id=None):
        # Iga mängija saab oma mänguobjekti ja luku.
        self.lukk = Lock()

        # Mängu algseaded.
        self.algsumma = 1000.0
        self.raha = self.algsumma
        self.energia = 0
        self.aku_maht = 10

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
        # Mänguajaloo jaoks vajalikud muutujad.
        self.player_id = player_id or secrets.token_urlsafe(32)
        self.game_id = None

        self.tegelik_manguaeg = 0.0
        self.paeva_algvaartus = self.algsumma


    def _salvesta_ajalugu(self, tehing=None, tipp=None):
        """Salvestab mänguseisu ja vajadusel tehingu."""

        if self.game_id is None or not self.hinnad:
            return

        seis = self._seis()

        salvesta_seis(
            game_id=self.game_id,
            seis=seis,
            manguaeg=self.tegelik_manguaeg,
            tipp=seis["asset_value"] if tipp is None else tipp,
            paeva_algvaartus=self.paeva_algvaartus,
            tehing=tehing
        )
    # GRIDRUSH-DOC: def _uuenda_kell
    # Arvutab serveris möödunud mänguaja; brauseri kella ei usaldata.
    # time.monotonic mõõdab tegelikku ajavahet ka süsteemikella muutumisel.
    # Möödunud aeg korrutatakse valitud kiirusega 0.5/1/2/5.
    # Päev kestab 180 mängusekundit, 96 perioodi ning 1.875 s perioodi kohta.
    # Aja lõpp peatab kella ja seab indeksi viimasele hinnapunktile.
    # Meetodit tohib kutsuda lukustatud kontekstist, sest see muudab olekut.

    def _uuenda_kell(self):
        """Uuendab mängukella ja salvestab ajaloo."""

        if not self.kaib:
            return

        praegu = time.monotonic()
        eelmine_indeks = self.indeks

        if self.viimane_kell is not None:
            vahe = max(0.0, praegu - self.viimane_kell)

            # Arvestame tegelikku mänguaega ainult päeva lõpuni.
            jaanud_aeg = max(
                0.0,
                PAEVA_PIKKUS - self.mangitud_sekundid
            )

            tegelik_vahe = min(
                vahe,
                jaanud_aeg / self.kiirus
            )

            self.tegelik_manguaeg += tegelik_vahe
            self.mangitud_sekundid += vahe * self.kiirus

        self.viimane_kell = praegu

        if self.mangitud_sekundid >= PAEVA_PIKKUS:
            self.mangitud_sekundid = PAEVA_PIKKUS
            self.paev_labi = True
            self.kaib = False
            self.viimane_kell = None

        self.indeks = min(
            len(self.hinnad) - 1,
            int(self.mangitud_sekundid / PERIOODI_PIKKUS)
        )

        # Leiame suurima vara väärtuse ka vahepealsetel
        # hinnapunktidel, millest kell võis üle liikuda.
        tipp = max(
            self.raha + self.energia * self.hinnad[i]["price"]
            for i in range(eelmine_indeks, self.indeks + 1)
        )

        # Salvestab ka lõpetatud mängupäeva.
        self._salvesta_ajalugu(tipp=round(tipp, 2))


    # GRIDRUSH-DOC: def _seis
    # Koostab ühe API-vastuse jaoks serveris arvutatud mänguseisu sõnastiku.
    # Vara turuväärtus = raha + akus olev energia × aktiivne elektrihind.
    # Kasumiprotsent võrdleb varade väärtust algse rahasummaga.
    # Tagastab ka kella, päeva, hinnaindeksi ja juhtnuppude seisundi.
    # Ei uuenda mängukella ise: väljakutsuja peab selle varem tegema.
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
            "initial_balance": self.algsumma,
            "asset_value": round(vara_vaartus, 2),
            "profit_percent": round(kasum, 1),

            # Brauser kasutab neid mängukella kuvamiseks.
            "elapsed_seconds": round(self.mangitud_sekundid, 6),
            "speed": self.kiirus,
            "running": self.kaib,
            "day_finished": self.paev_labi
        }

    # GRIDRUSH-DOC: def hinnad_nahtavad
    # Turvaline GET-hinnavastus: avaldab ainult serveri aja järgi möödunud hinnad.
    # Kutsub lukus _uuenda_kell(), seejärel koostab 96 kirje vastuse.
    # Tulevaste perioodide timestamp jääb nähtavaks, kuid price on None/null.
    # Päringust ei loeta kliendi soovitud hinnaindeksit ega kuupäeva.
    # See kaitseb Gridrushi API-t, mitte avalikke ajaloolisi välisandmeid.
    def hinnad_nahtavad(self):
        """Tagastab ainult serveri mängukella järgi avanenud hinnad."""

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            # Enne vastuse koostamist uuendame mängukella.
            # Brauser ei saa ise määrata, milliseid hindu näeb.
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

    # GRIDRUSH-DOC: def seis
    # Tagastab olemasoleva seansi praeguse mänguoleku.
    # Kui mäng pole alustatud, tagastab {'active': False}.
    # Olemasoleva mängu korral lukustab, uuendab kella ja tagastab _seis().
    def seis(self):
        """Tagastab olemasoleva mänguseisu seda lähtestamata."""

        with self.lukk:
            # Kui selles seansis mängu pole, tagastame active: false.
            if not self.hinnad:
                return {"active": False}

            # Värskendame kõigepealt serveripõhist mängukella.
            self._uuenda_kell()

            return self._seis()

    # GRIDRUSH-DOC: def _loe_taispaev
    # Loeb SQLite'ist ja kontrollib kõik päeva 96 järjestikust ajatemplit.
    # Võrdleb tegelikke ajatembli väärtusi 900-sekundiliste oodatud väärtustega.
    # Eripikkusega ja puudulikud päevad annavad ManguViga erindi.
    # Tulemuseks on kronoloogiline 96 hinnapunkti loend serveri jaoks.
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

    # GRIDRUSH-DOC: def alusta
    # Lähtestab ühe mängija raha, aku, mängukella ja päevade loenduri.
    # Kui paev=None, valitakse juhuslik päev saadaval_paevad() hulgast.
    # Kui kuupäev antakse, kontrollitakse YYYY-MM-DD kuju ja andmete täielikkust.
    # Oluline: see on serveri API-meetod, mistõttu kuupäevavalikut tuleb vajadusel
    # serveri poolel piirata (mitte ainult HTML-ist eemaldada).
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
            # Salvestame eelmise mängu viimase seisu.
            if self.game_id is not None:
                self._uuenda_kell()
                self._salvesta_ajalugu()

            # Loome andmebaasi uue mängu.
            self.game_id = loo_mang(
                self.player_id,
                self.algsumma
            )

            self.tegelik_manguaeg = 0.0
            self.paeva_algvaartus = self.algsumma
            # Lähtestame raha, aku ja hinnapunkti.
            self.paev = paev
            self.hinnad = hinnad
            self.paevade_arv = 1
            self.indeks = 0
            self.raha = self.algsumma
            self.energia = 0

            # Lähtestame mängukella.
            self.mangitud_sekundid = 0.0
            self.viimane_kell = None
            self.kaib = False
            self.paev_labi = False
            self.kiirus = 1.0

            return self._seis()

    # GRIDRUSH-DOC: def jatka
    # Käivitab või jätkab mängukella ilma seni mängitud sekundeid nullimata.
    # Juba käiva kella korral ei alustata uut ajamõõtu.
    # Lõppenud päeva korral visatakse ManguViga; esmalt tuleb uus_paev().
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

    # GRIDRUSH-DOC: def peata
    # Lisab esmalt jooksva ajavahe, siis peatab kella ja fikseerib hinna.
    # Pausil saab tehinguid sooritada külmutatud hinnaga, kuna kell ei liigu.
    # Alustamata seansi korral tagastab {'active': False}.
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

    # GRIDRUSH-DOC: def muuda_kiirust
    # Valideerib lubatud kiiruse ning jätkab ajamõõtu uue teguriga.
    # Kogub enne muutmist aja kokku vana kiirusega, et mitte kaotada sekundeid.
    # Lubatud on ainult arvulised 0.5, 1, 2, 5; muu sisend tõstab ManguViga.
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

    # GRIDRUSH-DOC: def uus_paev
    # Liigub järgmisele kronoloogiliselt saadaolevale 96-hinnalisele päevale.
    # Andmebaasi viimase päeva juurest alustatakse vajadusel algusest uuesti.
    # Päeva saab vahetada ainult pärast serveri kinnitatud päeva lõppu.
    # Raha, akus olev energia ja kiirus jäävad alles; kell algab uuesti nullist.
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

            # Uue päeva võrdluspunkt on eelmise päeva lõppväärtus.
            self.paeva_algvaartus = self._seis()["asset_value"]

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

            self._salvesta_ajalugu()
            # Raha, aku ja kiirus jäävad samaks.
            return self._seis()

    # GRIDRUSH-DOC: def tehing
    # Ostab või müüb MWh koguse serveri määratud hetkehinna alusel.
    # tegevus peab olema buy/sell ja kogus positiivne int/float.
    # Kontrollib aku piire ja rahajääki, sh negatiivse elektrihinna olukorda.
    # Muutused salvestatakse serveris; brauser saab kinnitatud seisu ja teate.
    # round(..., 2) tagab rahasummade senti täpsuse.
    
    def tehing(self, tegevus, kogus):
        """Ostab või müüb elektrit ja salvestab tehingu."""

        if tegevus not in ("buy", "sell"):
            raise ManguViga("Tundmatu tehing.")

        if (
            type(kogus) not in (float, int)
            or not 0 < kogus <= self.aku_maht
        ):
            raise ManguViga("Vigane elektrikogus.")

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            self._uuenda_kell()

            if self.paev_labi:
                raise ManguViga(
                    "Päev on lõppenud. Alusta uut päeva."
                )

            hind = self.hinnad[self.indeks]["price"]
            summa = round(kogus * hind, 2)

            # Jätame eelmise oleku meelde.
            eelmine_raha = self.raha
            eelmine_energia = self.energia

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

                if self.raha + summa < -0.000001:
                    raise ManguViga(
                        "Müümiseks pole piisavalt raha."
                    )

                self.raha = round(self.raha + summa, 2)
                self.energia -= kogus

                teade = f"Müüsid {kogus} MWh elektrit."

            # Arvutame tegeliku raha muutuse.
            raha_muutus = round(
                self.raha - eelmine_raha, 2
            )

            try:
                # Salvestame ainult õnnestunud tehingud.
                self._salvesta_ajalugu(tehing={
                    "action": tegevus,
                    "quantity": kogus,
                    "cash_change": raha_muutus
                })

            except sqlite3.Error:
                # Kui andmebaasi salvestamine ebaõnnestub,
                # taastame tehingueelse raha ja aku seisu.
                self.raha = eelmine_raha
                self.energia = eelmine_energia
                raise

            vastus = self._seis()
            vastus["message"] = teade

            return vastus
