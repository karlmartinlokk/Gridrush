""" Seab päeva kestuse ning filtreerib kogu andmetest selle päeva hinnad """

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Eesti ajavöönd arvestab suve/talve
EESTI_AEG = ZoneInfo("Europe/Tallinn")

# Leiab etteantud päeva alguse ja järgmise päeva alguse Eesti aja järgi
def paeva_piirid(paev):
    if isinstance(paev, str):
        paev = date.fromisoformat(paev)

    algus = datetime.combine(
        paev, time.min, tzinfo=EESTI_AEG
    )

    lopp = datetime.combine(
        paev + timedelta(days=1), time.min, tzinfo=EESTI_AEG
    )

    return algus, lopp

# Töötleb Eleringi API-st saadud elektrihinnad
def tootle_hinnad(toorandmed, algus, lopp,
                   kontrolli_taispaeva=True):
    esimene = int(algus.timestamp())
    viimane = int(lopp.timestamp())

    hinnad = {}

    for kirje in toorandmed:
        aeg = int(kirje["timestamp"])

        # Sama ajatempliga kirjed kirjutatakse üle, et vältida duplikaate
        if esimene <= aeg < viimane:
            hinnad[aeg] = float(kirje["price"])

    if kontrolli_taispaeva:
        # Genereerime oodatud timestambid 15-minutiliste vahedega (900 sekundit)
        oodatud = set(range(esimene, viimane, 900))

        if set(hinnad) != oodatud:
            raise ValueError(
                "Selle päeva hinnakirjed ei ole täielikud."
            )

    return [
        {"timestamp": aeg, "price": hinnad[aeg]}
        for aeg in sorted(hinnad)
    ]
