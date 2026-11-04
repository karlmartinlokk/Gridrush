""" Seab päeva kestuse ning filtreerib kogu andmetest selle päeva hinnad """

#  Kuupäevade, kellaaegade ja ajavahemikega töötamiseks vajalikud moodulid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Eesti ajavöönd arvestab suve/talve
EESTI_AEG = ZoneInfo("Europe/Tallinn")

# Leiab etteantud päeva alguse ja järgmise päeva alguse Eesti aja järgi
def paeva_piirid(paev):
    # Kui kuupäev on tekstina, teisendame selle date objektiks
    if isinstance(paev, str):
        paev = date.fromisoformat(paev)

    # Määrame päeva alguse kell 00:00
    algus = datetime.combine(
        paev, time.min, tzinfo=EESTI_AEG
    )

    # Määrame järgmise päeva alguse kell 00:00
    lopp = datetime.combine(
        paev + timedelta(days=1), time.min, tzinfo=EESTI_AEG
    )

    return algus, lopp

# Töötleb Eleringi API-st saadud elektrihinnad
def tootle_hinnad(toorandmed, algus, lopp,
                   kontrolli_taispaeva=True):
    # Teisendame ajavahemiku alguse ja lõpu Unix-timestampideks
    esimene = int(algus.timestamp())
    viimane = int(lopp.timestamp())

    # Sõnastik hindade hoidmiseks, kus võtmeks on timestamp
    hinnad = {}

    # Käime kõik API-st saadud hinnad läbi
    for kirje in toorandmed:
        aeg = int(kirje["timestamp"])

        # Lisame ainult valitud päeva hinnad
        # Sama ajatempliga kirjed kirjutatakse üle, et vältida duplikaate
        if esimene <= aeg < viimane:
            hinnad[aeg] = float(kirje["price"])

    # Kontrollime vajadusel, kas kõik päeva hinnad on olemas
    if kontrolli_taispaeva:
        # Genereerime oodatud timestambid 15-minutiliste vahedega (900 sekundit)
        oodatud = set(range(esimene, viimane, 900))

        # Kui mõni timestamp puudub või on üleliigne, anname veateate
        if set(hinnad) != oodatud:
            raise ValueError(
                "Selle päeva hinnakirjed ei ole täielikud."
            )

    # Tagastame hinnad timestampi järgi järjestatud sõnastike loendina
    return [
        {"timestamp": aeg, "price": hinnad[aeg]}
        for aeg in sorted(hinnad)
    ]
