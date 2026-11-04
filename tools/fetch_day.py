
# Küsib Eleringilt Eesti elektrihinnad.

# JSON-andmete lugemiseks ja kuupäevadega töötamiseks vajalikud moodulid
import json
from datetime import date, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import urlopen

# Impordime funktsioonid päeva piiride leidmiseks ja hindade töötlemiseks
from gridrush.process_data import paeva_piirid, tootle_hinnad

# Eleringi avaliku elektrihindade API aadress
API_URL = "https://dashboard.elering.ee/api/nps/price"


# Küsib Eleringilt valitud päeva elektrihinnad
def fetch_day(paev, kontrolli_taispaeva=True):
    # Leiame valitud päeva alguse ja lõpu Eesti aja järgi
    algus, lopp = paeva_piirid(paev)

    # Teisendab Eesti ajavööndi kellaaja UTC-vormingusse
    def utc_tekst(aeg):
        return aeg.astimezone(timezone.utc).isoformat(
            timespec="milliseconds"
        ).replace("+00:00", "Z")

    # Määrame API päringu alguse ja lõpu
    # Lahutame lõpust ühe millisekundi, et mitte kaasata järgmise päeva algust
    parameetrid = {
        "start": utc_tekst(algus),
        "end": utc_tekst(lopp - timedelta(milliseconds=1))
    }

    # Koostame API päringu URL-i koos kuupäevaparameetritega
    url = API_URL + "?" + urlencode(parameetrid)

    # Saadame Eleringile päringu ja loeme JSON-vastuse
    with urlopen(url, timeout=20) as vastus:
        andmed = json.load(vastus)

    # Kontrollime, kas päring õnnestus ja Eesti hinnad on olemas
    if not andmed.get("success") or "ee" not in andmed.get("data", {}):
        raise ValueError("Elering ei tagastanud Eesti elektrihindu.")

    # Töötleme ja tagastame ainult valitud päeva Eesti hinnad
    return tootle_hinnad(
        andmed["data"]["ee"], algus, lopp, kontrolli_taispaeva
    )


# Järgmine osa käivitub ainult faili otse käivitamisel
if __name__ == "__main__":
    import sys

    # Võtame kuupäeva käsurealt või kasutame vaikimisi eilset päeva
    paev = sys.argv[1] if len(sys.argv) > 1 else str(
        date.today() - timedelta(days=1)
    )

    # Küsime valitud päeva elektrihinnad
    hinnad = fetch_day(paev)

    # Kuvame hinnakirjete arvu ja esimesed viis kirjet JSON-vormingus
    print(f"{paev}: {len(hinnad)} hinnakirjet")
    print(json.dumps(hinnad[:5], indent=2))
