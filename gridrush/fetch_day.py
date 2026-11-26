""" Küsib Eleringilt Eesti elektrihinnad """

import json
from datetime import date, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import urlopen

from gridrush.day_filter import paeva_piirid, tootle_hinnad

API_URL = "https://dashboard.elering.ee/api/nps/price"


# Küsib Eleringilt valitud päeva elektrihinnad
def fetch_day(paev, kontrolli_taispaeva=True):
    algus, lopp = paeva_piirid(paev)

    def utc_tekst(aeg):
        return aeg.astimezone(timezone.utc).isoformat(
            timespec="milliseconds"
        ).replace("+00:00", "Z")

    # Lahutame lõpust ühe millisekundi, et mitte kaasata järgmise päeva algust
    parameetrid = {
        "start": utc_tekst(algus),
        "end": utc_tekst(lopp - timedelta(milliseconds=1))
    }

    url = API_URL + "?" + urlencode(parameetrid)

    with urlopen(url, timeout=20) as vastus:
        andmed = json.load(vastus)

    if not andmed.get("success") or "ee" not in andmed.get("data", {}):
        raise ValueError("Elering ei tagastanud Eesti elektrihindu.")

    return tootle_hinnad(
        andmed["data"]["ee"], algus, lopp, kontrolli_taispaeva
    )


if __name__ == "__main__":
    import sys

    paev = sys.argv[1] if len(sys.argv) > 1 else str(
        date.today() - timedelta(days=1)
    )

    hinnad = fetch_day(paev)

    print(f"{paev}: {len(hinnad)} hinnakirjet")
    print(json.dumps(hinnad[:5], indent=2))
