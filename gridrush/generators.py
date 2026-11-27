

import math

from datetime import datetime
from zoneinfo import ZoneInfo


# Eesti ajavöönd arvestab suve- ja talveaega.
EESTI_AEG = ZoneInfo("Europe/Tallinn")

# Üks elektrihinna periood kestab 15 minutit = 0,25 tundi.
PERIOODI_TUNNID = 0.25


# Kõik mudelid ja hinnad.
#
# voimsus = nimivõimsus MW-des
# hind = ostuhind mängueurodes
# tuup = solar (päikesepark) või wind (tuulik)
#
# Need ei ole päris elektrijaamade ehitushinnad.
# Hinnad on tasakaalustatud Gridrushi mängumajanduse jaoks.

GENERAATORID = {

    # ==========================================
    # PÄIKESEPARGID
    # ==========================================

    "solar_1": {
        "nimi": "Mini",
        "tuup": "solar",
        "voimsus": 1,
        "hind": 2500
    },

    "solar_2": {
        "nimi": "Basic",
        "tuup": "solar",
        "voimsus": 2,
        "hind": 4800
    },

    "solar_3": {
        "nimi": "Plus",
        "tuup": "solar",
        "voimsus": 3,
        "hind": 7100
    },

    "solar_4": {
        "nimi": "Field",
        "tuup": "solar",
        "voimsus": 5,
        "hind": 11500
    },

    "solar_5": {
        "nimi": "SolarGrid",
        "tuup": "solar",
        "voimsus": 8,
        "hind": 18000
    },

    "solar_6": {
        "nimi": "Pro",
        "tuup": "solar",
        "voimsus": 10,
        "hind": 22500
    },

    "solar_7": {
        "nimi": "Advanced",
        "tuup": "solar",
        "voimsus": 15,
        "hind": 33500
    },

    "solar_8": {
        "nimi": "Industrial",
        "tuup": "solar",
        "voimsus": 20,
        "hind": 45000
    },

    "solar_9": {
        "nimi": "Mega Solar",
        "tuup": "solar",
        "voimsus": 30,
        "hind": 68000
    },

    "solar_10": {
        "nimi": "Solar Titan",
        "tuup": "solar",
        "voimsus": 50,
        "hind": 115000
    },

    # ==========================================
    # TUULIKUD
    # ==========================================

    "wind_1": {
        "nimi": "Breeze",
        "tuup": "wind",
        "voimsus": 1,
        "hind": 5700
    },

    "wind_2": {
        "nimi": "WindStart",
        "tuup": "wind",
        "voimsus": 2,
        "hind": 11000
    },

    "wind_3": {
        "nimi": "Aero",
        "tuup": "wind",
        "voimsus": 3,
        "hind": 16000
    },

    "wind_4": {
        "nimi": "WindPro",
        "tuup": "wind",
        "voimsus": 4,
        "hind": 21000
    },

    "wind_5": {
        "nimi": "Zephyr",
        "tuup": "wind",
        "voimsus": 5,
        "hind": 26000
    },

    "wind_6": {
        "nimi": "Storm",
        "tuup": "wind",
        "voimsus": 6,
        "hind": 31000
    },

    "wind_7": {
        "nimi": "Storm Plus",
        "tuup": "wind",
        "voimsus": 8,
        "hind": 41000
    },

    "wind_8": {
        "nimi": "WindMax",
        "tuup": "wind",
        "voimsus": 10,
        "hind": 51000
    },

    "wind_9": {
        "nimi": "Offshore",
        "tuup": "wind",
        "voimsus": 12,
        "hind": 60000
    },

    "wind_10": {
        "nimi": "Titan Wind",
        "tuup": "wind",
        "voimsus": 15,
        "hind": 75000
    }
}


def tootmistegur(tuup, timestamp):
    """
    Arvutab generaatori tootmisteguri vahemikus 0–1.

    tuup:
        "solar" või "wind"

    timestamp:
        15-minutilise hinnaperioodi alguse Unix timestamp.

    Tagastus:
        float, näiteks 0.8 tähendab 80% nimivõimsusest.

    Sama ajatempel annab alati sama tulemuse, et mängija
    ei saaks lehte värskendades uusi ilmaolusid genereerida.
    """

    # Võtame tootmise arvutamiseks perioodi keskpunkti.
    keskpunkt = datetime.fromtimestamp(
        timestamp + 450,
        tz=EESTI_AEG
    )

    paev_aastas = keskpunkt.timetuple().tm_yday

    # ==========================================
    # PÄIKESEPANEELID
    # ==========================================

    if tuup == "solar":

        # Simuleerime Eesti aastaajalist päevapikkust.
        # Suvel on päevad pikemad kui talvel.
        aastafaktor = math.cos(
            2 * math.pi *
            (paev_aastas - 172) /
            365.2425
        )

        paevapikkus = 12 + 6.2 * aastafaktor

        # Päikesekeskpäev muutub kohaliku suveajaga.
        suveaeg = (
            keskpunkt.utcoffset().total_seconds() / 3600
        ) - 2

        keskpaev = 12.5 + suveaeg

        kellaaeg = (
            keskpunkt.hour
            + keskpunkt.minute / 60
            + keskpunkt.second / 3600
        )

        # Kaugus päikesekeskpäevast tundides.
        kaugus = abs(kellaaeg - keskpaev)

        # Öösel päikesepaneelid elektrit ei tooda.
        if kaugus >= paevapikkus / 2:
            return 0.0

        # Päikese tõusu ja loojumise mõju.
        paikesekaar = math.cos(
            math.pi * kaugus / paevapikkus
        )

        # Suvel on päikese tootmispotentsiaal suurem.
        hooaja_lagi = (
            0.36
            + 0.46 * (1 + aastafaktor) / 2
        )

        # Simuleeritud pilvisus.
        # See on deterministlik, mitte juhuslik arv igal päringul.
        pilvisus = (
            0.75
            + 0.22 *
            math.sin(timestamp / 20137 + 1.7) ** 2
        )

        tegur = (
            paikesekaar
            * hooaja_lagi
            * pilvisus
        )

        return round(
            max(0.0, min(1.0, tegur)),
            6
        )

    # ==========================================
    # TUULIKUD
    # ==========================================

    if tuup == "wind":

        tund = timestamp / 3600

        # Kaks erineva perioodiga kõikumist.
        # Nii muutub tuule tugevus ajas sujuvalt.
        tegur = (
            0.34
            + 0.17 * math.sin(tund / 7.4)
            + 0.11 * math.sin(tund / 2.9 + 1.8)
        )

        # Minimaalne 5%, maksimaalne 80% nimivõimsusest.
        tegur = max(0.05, min(0.80, tegur))

        return round(tegur, 6)

    raise ValueError("Tundmatu generaatori tüüp.")


def perioodi_toodang(generaatori_id, timestamp):
    """
    Arvutab generaatori toodangu ühes 15-minutilises perioodis.

    Valem:
        energia_MWh = voimsus_MW * 0.25 * tootmistegur

    Näide:
        1 MW tuulik, tootmistegur 0.8:

        1 * 0.25 * 0.8 = 0.2 MWh

    Funktsioon ei muuda mängija raha ega akut.
    """

    mudel = GENERAATORID[generaatori_id]

    voimsus = mudel["voimsus"]

    tegur = tootmistegur(
        mudel["tuup"],
        timestamp
    )

    energia = voimsus * PERIOODI_TUNNID * tegur

    return round(energia, 6)
