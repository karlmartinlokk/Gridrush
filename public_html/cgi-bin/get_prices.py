"""Loeb Eesti ühe päeva hinnad SQLite'ist."""

# JSON-andmete, keskkonnamuutujate ja Pythoni moodulitega töötamiseks
import json
import os
import sys
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs

# Leiame Gridrushi peakausta.
sys.path.insert(
    0, str(Path(__file__).resolve().parents[2])
)

# Impordime funktsioonid hindade lugemiseks, salvestamiseks ja pärimiseks
from gridrush.db import loe_paev, salvesta_hinnad
from tools.fetch_day import fetch_day


# Töötleb veebilehe päringut ja tagastab valitud päeva elektrihinnad
def get_prices_response(query_string):
    # Eraldame URL-i parameetritest kuupäeva
    params = parse_qs(query_string)
    paev = params.get("date", [""])[0]

    # Kontrollime kuupäeva.
    try:
        if (
            len(paev) != 10
            or date.fromisoformat(paev).isoformat() != paev
        ):
            raise ValueError

    except ValueError:
        # Tagastame veakoodi 400, kui kuupäev on vigane
        return 400, {
            "error": "Kasuta kuupäeva kujul YYYY-MM-DD."
        }

    # Loeme hinnad andmebaasist.

    # Kontrollime, kas hinnad on andmebaasis
    hinnad = loe_paev(paev)

    # Kui ei ole, küsime Eleringilt ja salvestame
    if not hinnad:
        try:
            hinnad = fetch_day(paev)
            salvesta_hinnad(hinnad)
        except (ValueError, OSError, KeyError) as viga:
            # Tagastame veakoodi 502, kui andmete pärimine ebaõnnestub
            return 502, {"error": str(viga)}

    # Tagastame edukal päringul kuupäeva, hinnaühiku ja hinnakirjed
    return 200, {
        "date": paev,
        "unit": "EUR/MWh",
        "prices": hinnad
    }


# Käivitab CGI-päringu töötlemise ja koostab HTTP-vastuse
def main():
    # Kontrollime, et kasutatud oleks GET-meetodit
    if os.environ.get("REQUEST_METHOD", "GET") != "GET":
        status, andmed = 405, {
            "error": "Lubatud on ainult GET."
        }
    else:
        # Loeme URL-ist päringuparameetrid ja töötleme need
        status, andmed = get_prices_response(
            os.environ.get("QUERY_STRING", "")
        )

    # Väljastame HTTP staatuse ja JSON-vastuse päised
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print("Cache-Control: no-store")
    print()

    # Teisendame vastuse JSON-vormingusse ja väljastame brauserile
    print(json.dumps(andmed, ensure_ascii=False))


# Käivitame main() ainult siis, kui seda faili otse käivitatakse
if __name__ == "__main__":
    main()
