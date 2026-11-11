
"""Gridrushi elektrienergia ostmise ja müümise loogika."""

from datetime import date
from threading import Lock

from gridrush.db import loe_paev


class ManguViga(ValueError):
    pass


class Kauplemismang:
    def __init__(self):
        self.raha = 1000.0
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

        return {
            "date": self.paev,
            "index": self.indeks,
            "total": len(self.hinnad),
            "timestamp": hind["timestamp"],
            "price": hind["price"],
            "balance": round(self.raha, 2),
            "energy": self.energia,
            "capacity": self.aku_maht
        }

    # Alustab uue mängu valitud kuupäevaga
    def alusta(self, paev):
        try:
            if (
                not isinstance(paev, str)
                or date.fromisoformat(paev).isoformat() != paev
            ):
                raise ValueError
        except ValueError:
            raise ManguViga("Vigane kuupäev.")

        hinnad = loe_paev(paev)

        # Mängimiseks peab olema 96 järjestikust hinnapunkti
        if (
            len(hinnad) != 96
            or any(
                hinnad[i + 1]["timestamp"] - hinnad[i]["timestamp"] != 900
                for i in range(95)
            )
        ):
            raise ManguViga("Päeva hinnad puuduvad või on mittetäielikud.")

        with self.lukk:
            self.paev = paev
            self.hinnad = hinnad
            self.indeks = 0
            self.raha = 1000.0
            self.energia = 0

            return self._seis()

    # Liigub järgmise elektrihinna juurde
    def jargmine(self):
        with self.lukk:
            if not self.hinnad:
                raise ManguViga("Mäng pole alustatud.")

            if self.indeks >= len(self.hinnad) - 1:
                raise ManguViga("Päeva viimane hind on käes.")

            self.indeks += 1
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
