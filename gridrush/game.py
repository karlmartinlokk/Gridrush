"""Gridrushi kauplemismäng ja serveripõhine mängukell."""

import random
import time
from datetime import date
from threading import Lock
import sqlite3
import secrets
import math

from gridrush.statistics import loo_mang, salvesta_seis
from gridrush.db import loe_paev, saadaval_paevad
from gridrush.day_filter import paeva_piirid
from gridrush.batteries import AKUD, EFEKTIIVSUS
from gridrush.generators import GENERAATORID, perioodi_toodang


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

    def __init__(self, player_id=None):
        # Iga mängija saab oma mänguobjekti ja luku.
        self.lukk = Lock()

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

        # Mängijale kuuluvad päikesepaneelid ja tuulikud.
        # Sõnastiku võti: generaatori ID, nt "wind_1".
        # Väärtus: (ostmise mängupäeva number, esimene tootmisperiood).
        # Näide:
        # "wind_1": (1, 10)
        # Tähendab, et tuulik osteti 1. mängupäeval
        # ja hakkab tootma 10. hinnaperioodist.
        self.omatud_generaatorid = {}

        # Viimane hinnaperiood, mille toodang on juba müüdud.
        # -1 tähendab, et ühtegi perioodi pole veel müüdud.
        self.viimane_muudud_periood = -1

        # Kogu mängu jooksul generaatoritega teenitud tulu.
        self.generaatori_tulu = 0.0

        # Kogu mängu jooksul toodetud ja müüdud energia.
        self.generaatori_energia = 0.0

        # Käesoleva mängupäeva generaatorite müügitulu.
        self.paeva_generaatori_tulu = 0.0

        # Käesoleval mängupäeval müüdud energiakogus.
        self.paeva_generaatori_energia = 0.0

        # Viimase automaatmüügi info kasutajaliidese jaoks.
        self.viimane_automaatselt_muudud = None

        self.paev = None
        self.hinnad = []
        self.indeks = 0
        self.paevade_arv = 0
        self.paeva_tehinguid = 0

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

    
    def osta_generaator(self, generaatori_id):

        with self.lukk:

            if not self.hinnad:
                raise ManguViga(
                    "Mäng pole alustatud."
                )

            if (
                not isinstance(generaatori_id, str)
                or generaatori_id not in GENERAATORID
            ):
                raise ManguViga(
                    "Sellist generaatorit pole olemas."
                )

            # Enne ostu uuendame mängukella.
            # Kui vahepeal lõppes hinnaperiood, müüme
            # selle perioodi toodangu kõigepealt ära.
            self._uuenda_kell()

            if generaatori_id in self.omatud_generaatorid:
                raise ManguViga(
                    "See generaator on juba ostetud."
                )

            mudel = GENERAATORID[generaatori_id]

            ostuhind = mudel["hind"]

            if self.raha < ostuhind:
                raise ManguViga(
                    "Generaatori ostmiseks pole piisavalt raha."
                )

            # Mängu päris alguses ostetud generaator
            # toodab juba esimeses hinnaperioodis.
            if (
                self.mangitud_sekundid == 0
                and not self.paev_labi
            ):
                esimene_periood = 0

            else:
                # Keset perioodi ostes ei saa mängija
                # juba osaliselt möödunud aja eest toodangut.
                esimene_periood = self.indeks + 1

            # Jätame raha meelde, et andmebaasivea korral
            # oleks võimalik ost tagasi võtta.
            eelmine_raha = self.raha

            # Arvestame ostuhinna mängijalt maha.
            self.raha = round(
                self.raha - ostuhind,
                2
            )

            # Lisame generaatori mängija omandisse.
            self.omatud_generaatorid[generaatori_id] = (
                self.paevade_arv,
                esimene_periood
            )

            try:
                # Uuendame mängu vara väärtust statistikas.
                self._salvesta_ajalugu()

            except sqlite3.Error:
                # Kui salvestamine ebaõnnestus,
                # võtame ostu tagasi.
                self.raha = eelmine_raha

                del self.omatud_generaatorid[
                    generaatori_id
                ]

                raise

            # Tagastame serveris kinnitatud mänguseisu.
            return self._seis()

    def osta_aku(self, aku_id):
        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            if not isinstance(aku_id, str) or aku_id not in AKUD:
                raise ManguViga("Sellist akut pole olemas.")

            if aku_id in self.omatud_akud:
                raise ManguViga("Sul on see aku juba olemas.")
       
            self._uuenda_kell()

            aku_hind = AKUD[aku_id]['hind']

            if self.raha < aku_hind:
                raise ManguViga("Sul pole piisavalt raha selle aku ostmiseks.")

            self.raha = round(self.raha - aku_hind, 2)
            self.omatud_akud.add(aku_id)
            return self._seis()


    def vaheta_aku(self, aku_id):
        with self.lukk:

            if not isinstance(aku_id, str) or aku_id not in AKUD:
                raise ManguViga("Sellist akut pole olemas.")

            if aku_id not in self.omatud_akud:
                raise ManguViga("See aku ei kuulu sulle.")

            uue_aku_maht = AKUD[aku_id]['maht']

            if self.energia > uue_aku_maht:
                raise ManguViga("Energiat on uue aku jaoks liiga palju.")
           
            self.aktiivne_aku = aku_id
            self.aku_maht = AKUD[self.aktiivne_aku]['maht']
            self.aku_voimsus = AKUD[self.aktiivne_aku]['võimsus'] 
            self.max_tehingu_maht = self.aku_voimsus * 0.25 


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

        self._arvesta_generaatorite_myyk()

        # Leiame suurima vara väärtuse ka vahepealsetel
        # hinnapunktidel, millest kell võis üle liikuda.
        tipp = max(
            self.raha + self.energia * self.hinnad[i]["price"]
            for i in range(eelmine_indeks, self.indeks + 1)
        )

        # Salvestab ka lõpetatud mängupäeva.
        self._salvesta_ajalugu(tipp=round(tipp, 2))


    def _arvesta_generaatorite_myyk(self):

        if not self.hinnad:
            return

        # Kui mängupäev on läbi, on kõik 96 perioodi lõppenud.
        if self.paev_labi:
            viimane_loppenud = len(self.hinnad) - 1

        else:
            # Kui oleme jõudnud näiteks indeksini 5,
            # siis hinnaperiood 4 on viimane lõppenud periood.
            viimane_loppenud = self.indeks - 1

        # Kui midagi uut pole lõppenud, pole vaja müüa.
        if viimane_loppenud <= self.viimane_muudud_periood:
            return

        # Töötleme kõik veel müümata lõppenud perioodid.
        for i in range(
            self.viimane_muudud_periood + 1,
            viimane_loppenud + 1
        ):

            # Selle konkreetse 15-minutilise perioodi börsihind.
            hind = self.hinnad[i]["price"]

            # Perioodi alguse Unix timestamp.
            timestamp = self.hinnad[i]["timestamp"]

            perioodi_energia = 0.0

            # Käime kõik mängija generaatorid läbi.
            for generaatori_id, ostu_info in (
                self.omatud_generaatorid.items()
            ):

                ostupaev, esimene_periood = ostu_info

                # Kui generaator osteti käesoleval mängupäeval,
                # ei anna see varasemate perioodide eest tulu.
                if (
                    ostupaev == self.paevade_arv
                    and i < esimene_periood
                ):
                    continue

                # Arvutame ühe generaatori elektritoodangu.
                toodang = perioodi_toodang(
                    generaatori_id,
                    timestamp
                )

                perioodi_energia += toodang

            # ==========================================
            # AUTOMAATNE MÜÜK
            # ==========================================

            # Müüme elektri selle perioodi hinnaga.
            #
            # Näide:
            # 0.2 MWh * 70 €/MWh = 14 €
            perioodi_tulu = round(
                perioodi_energia * hind,
                2
            )

            # Raha lisandub kohe serveripoolsele mänguseisule.
            # Negatiivse elektrihinna korral võib tulu
            # olla negatiivne.
            self.raha = round(
                self.raha + perioodi_tulu,
                2
            )

            # Suurendame kogu mängu müügitulu.
            self.generaatori_tulu = round(
                self.generaatori_tulu + perioodi_tulu,
                2
            )

            # Suurendame käesoleva päeva müügitulu.
            self.paeva_generaatori_tulu = round(
                self.paeva_generaatori_tulu + perioodi_tulu,
                2
            )

            # Salvestame müüdud energiakogused.
            self.generaatori_energia += perioodi_energia

            self.paeva_generaatori_energia += (
                perioodi_energia
            )

            # Märgime perioodi lõplikult arvestatuks.
            #
            # Tänu sellele ei saa sama perioodi
            # elektrit teist korda müüa.
            self.viimane_muudud_periood = i

            # Viimase tegeliku tootmisega perioodi info.
            if perioodi_energia > 0:

                self.viimane_automaatselt_muudud = {
                    "period_index": i,
                    "timestamp": timestamp,
                    "energy_MWh": round(
                        perioodi_energia,
                        4
                    ),
                    "price_EUR_MWh": hind,
                    "revenue_EUR": perioodi_tulu
                }

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

            "active_battery": self.aktiivne_aku,
            "owned_batteries": list(self.omatud_akud),
            "battery_power": self.aku_voimsus,
            "max_trade_MWh": self.max_tehingu_maht,
            "battery_models": AKUD,


            # Kõik poes müüdavad generaatorimudelid.
            "generator_models": GENERAATORID,

            # Mängijale kuuluvate generaatorite ID-d.
            "owned_generators": sorted(
                self.omatud_generaatorid
            ),

            # Kogu mängu jooksul teenitud generaatorite tulu.
            "generator_revenue_total": self.generaatori_tulu,

            # Ainult käesoleva päeva generaatorite tulu.
            "generator_revenue_today": (
                self.paeva_generaatori_tulu
            ),

            # Kogu mängu jooksul automaatselt müüdud energia.
            "generator_energy_total_MWh": round(
                self.generaatori_energia,
                4
            ),

            # Käesoleva päeva automaatselt müüdud energia.
            "generator_energy_today_MWh": round(
                self.paeva_generaatori_energia,
                4
            ),

            # Kõige hiljutisema automaatmüügi andmed.
            "generator_last_sale": (
                self.viimane_automaatselt_muudud
            ),


            "initial_balance": self.algsumma,
            "asset_value": round(vara_vaartus, 2),
            "profit_percent": round(kasum, 1),
            "day_trades": self.paeva_tehinguid,
            "day_profit": round(vara_vaartus - self.paeva_algvaartus, 2),

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
                "state": self._seis(),
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
            self.paeva_tehinguid = 0
            self.indeks = 0
            self.raha = self.algsumma
            self.energia = 0
            self.aktiivne_aku = 'starter'
            self.omatud_akud = {'starter'}

            # Uue mängu alustamisel ei säili eelmise
            # mängu päikesepargid ega tuulikud.
            self.omatud_generaatorid = {}
            self.viimane_muudud_periood = -1
            self.generaatori_tulu = 0.0
            self.generaatori_energia = 0.0
            self.paeva_generaatori_tulu = 0.0
            self.paeva_generaatori_energia = 0.0
            self.viimane_automaatselt_muudud = None
            
            self.aku_maht = AKUD[self.aktiivne_aku]['maht']
            self.aku_voimsus = AKUD[self.aktiivne_aku]['võimsus']
            self.max_tehingu_maht = self.aku_voimsus * 0.25
            self.perioodi_tehingumaht = 0.0
            self.viimane_tehinguperiood = None

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

            self._salvesta_ajalugu()

            # Uue päeva võrdluspunkt on eelmise päeva lõppväärtus.
            self.paeva_algvaartus = self._seis()["asset_value"]

            # Vahetame päeva ja alustame indeksist 0.
            self.paev = uus_paev
            self.hinnad = uued_hinnad
            self.indeks = 0
            self.paevade_arv += 1
            self.paeva_tehinguid = 0

            # Uuel päeval alustame elektri müügi arvestamist
            # uuesti 0. hinnaperioodist.
            self.viimane_muudud_periood = -1

            # Lähtestame ainult uue päeva näitajad.
            self.paeva_generaatori_tulu = 0.0
            self.paeva_generaatori_energia = 0.0
            self.viimane_automaatselt_muudud = None


            self.mangitud_sekundid = 0.0
            self.viimane_kell = None
            self.kaib = False
            self.paev_labi = False

            return self._seis()


    
    def tehing(self, tegevus, kogus):
        """Ostab või müüb elektrit ja salvestab tehingu."""

        if tegevus not in ("buy", "sell"):
            raise ManguViga("Tundmatu tehing.")

        if (
            type(kogus) not in (int, float) or not math.isfinite(kogus)
            or not 0 < kogus <= self.aku_maht or kogus % 0.5 != 0
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

            # Kontrollime, kas algas uus hinnaperiood.
            praegune_periood = (self.paev, self.indeks)

            if praegune_periood != self.viimane_tehinguperiood:
                self.perioodi_tehingumaht = 0.0
                self.viimane_tehinguperiood = praegune_periood

            if self.perioodi_tehingumaht + kogus > self.max_tehingu_maht:
                raise ManguViga("Aku võimsus ei võimalda sellel perioodil nii palju kaubelda.")
            # Pausi ajal saab kaubelda peatatud hinnaga.
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

                summa = round(kogus * hind * EFEKTIIVSUS, 2)
               
                # Negatiivse hinna puhul võib müümine maksta.
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

            self.perioodi_tehingumaht += kogus
            self.paeva_tehinguid += 1

            vastus = self._seis()
            vastus["message"] = teade

            return vastus
