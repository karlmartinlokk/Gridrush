
"""Gridrushi elektrienergia ostmise ja müümise loogika."""

import random
from datetime import date
from threading import Lock

from gridrush.db import loe_paev, saadaval_paevad
from gridrush.day_filter import paeva_piirid


class ManguViga(ValueError):
    pass


class Kauplemismang:
    def __init__(self):
        # Mängu algseaded
        self.algsumma = 1000.0
        self.raha = self.algsumma
        self.energia = 0
        self.aku_maht = 10

        self.paev = None
        self.hinnad = []
        self.indeks = 0

        # Väldib samaaegsete tehingute konflikte
        self.lukk = Lock()

    # Tagastab mängija praeguse seisu
    def _seis(self):
        if not self.hinnad:
            raise ManguViga("Mäng pole alustatud.")

        hind = self.hinnad[self.indeks]

        # Vara väärtus = raha + akus oleva elektri turuväärtus
        vara_vaartus = self.raha + self.energia * hind["price"]

        # Arvutame kasumi või kahjumi protsendi algsummast
        if self.algsumma > 0:
            kasumi_protsent = (
                (vara_vaartus - self.algsumma)
                / self.algsumma
            ) * 100
        else:
            kasumi_protsent = 0.0

        return {
            "date": self.paev,
            "index": self.indeks,
            "total": len(self.hinnad),
            "timestamp": hind["timestamp"],
            "price": hind["price"],
            "balance": round(self.raha, 2),
            "energy": self.energia,
            "capacity": self.aku_maht,
            "initial_balance": self.algsumma,
            "asset_value": round(vara_vaartus, 2),
            "profit_percent": round(kasumi_protsent, 1)
        }

    # Laeb ühe päeva hinnad ja kontrollib ka 15-minutilisi vahesid.
    def _loe_taispaev(self, paev):
        hinnad = loe_paev(paev)
        algus, lopp = paeva_piirid(paev)

        oodatud = list(range(
            int(algus.timestamp()), int(lopp.timestamp()), 900
        ))
        ajatemplid = [h["timestamp"] for h in hinnad]

        if len(oodatud) != 96 or ajatemplid != oodatud:
            raise ManguViga("Päeva hinnad puuduvad või on mittetäielikud.")

        return hinnad

    # Alustab uue mängu etteantud või juhuslikust sobivast päevast.
    def alusta(self, paev=None):
        if paev is None:
            paevad = saadaval_paevad()
            if not paevad:
                raise ManguViga("Andmebaasis pole sobivaid hinnapäevi.")
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
            self.indeks = 0
            self.raha = self.algsumma
            self.energia = 0
            return self._seis()

    # Liigub järgmise hinna või järgmise sobiva päeva juurde.
    def jargmine(self):
        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            if self.indeks < len(self.hinnad) - 1:
                self.indeks += 1
            else:
                paevad = saadaval_paevad()
                if not paevad:
                    raise ManguViga("Järgmist hinnapäeva ei leitud.")

                # Võtame kronoloogiliselt järgmise olemasoleva päeva.
                # Andmebaasi lõpust alustame vajadusel esimesest päevast.
                uus_paev = next(
                    (p for p in paevad if p > self.paev),
                    paevad[0]
                )
                uued_hinnad = self._loe_taispaev(uus_paev)

                self.paev = uus_paev
                self.hinnad = uued_hinnad
                self.indeks = 0
                # Raha ja aku ei muutu päeva vahetumisel.

            return self._seis()

    # Ostab või müüb valitud koguse elektrienergiat
    def tehing(self, tegevus, kogus):
        if tegevus not in ("buy", "sell"):
            raise ManguViga("Tundmatu tehing.")

        if type(kogus) is not int or kogus <= 0:
            raise ManguViga("Kogus peab olema positiivne täisarv.")

        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            # Hind võetakse serverist, mitte brauserist
            hind = self.hinnad[self.indeks]["price"]
            summa = round(kogus * hind, 2)

            if tegevus == "buy":
                if self.energia + kogus > self.aku_maht:
                    raise ManguViga("Akus pole piisavalt ruumi.")

                if self.raha - summa < -0.000001:
                    raise ManguViga("Ostmiseks pole piisavalt raha.")

                self.raha = round(self.raha - summa, 2)
                self.energia += kogus
                teade = f"Ostsid {kogus} MWh elektrit."

            else:
                if self.energia < kogus:
                    raise ManguViga("Akus pole piisavalt elektrit.")

                # Negatiivse hinna korral võib müümine maksta
                if self.raha + summa < -0.000001:
                    raise ManguViga("Müümiseks pole piisavalt raha.")

                self.raha = round(self.raha + summa, 2)
                self.energia -= kogus
                teade = f"Müüsid {kogus} MWh elektrit."

            vastus = self._seis()
            vastus["message"] = teade
            return vastus
