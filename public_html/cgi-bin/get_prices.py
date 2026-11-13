#!/usr/bin/env python3

"""Loeb Eesti ühe päeva hinnad SQLite'ist."""

# JSON-andmete, keskkonnamuutujate ja Pythoni moodulitega töötamiseks
import json
import os
import sys
from datetime import date
import sqlite3
from pathlib import Path
from urllib.parse import parse_qs

# Leiame Gridrushi peakausta.
sys.path.insert(
    0, str(Path(__file__).resolve().parents[2])
)

# Impordime funktsiooni hindade lugemiseks andmebaasist
from gridrush.db import loe_paev


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

    # Loeme hinnad ainult andmebaasist
    try:
        hinnad = loe_paev(paev)
    except sqlite3.Error:
        return 500, {"error": "Andmebaasi viga."}

    # Mängus kasutame ainult täielikke 96 hinnapunktiga päevi
    if len(hinnad) != 96:
        return 404, {
            "error": "Selle päeva hinnad puuduvad või on mittetäielikud."
        }

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
