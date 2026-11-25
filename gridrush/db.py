"""Loob ja suhtleb andmebaasiga."""

import sqlite3
from datetime import datetime
from pathlib import Path
from gridrush.day_filter import EESTI_AEG, paeva_piirid

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "gridrush.sqlite3"


# Loob ühenduse andmebaasiga ja vajadusel elektrihindade tabeli
# Ühenduse peab sulgema väljakutsuja.
def yhenda():
    DB_PATH.parent.mkdir(exist_ok=True)
    db = sqlite3.connect(DB_PATH)

    db.execute("""
        CREATE TABLE IF NOT EXISTS electricity_prices (
            timestamp INTEGER PRIMARY KEY,
            price REAL NOT NULL
        )
    """)

    return db


def vanim_hind():
    db = yhenda()

    try:
        return db.execute("""
            SELECT timestamp, price
            FROM electricity_prices
            ORDER BY timestamp ASC
            LIMIT 1
        """).fetchone()

    finally:
        db.close()


# Salvestab elektrihinnad andmebaasi ja tagastab uute kirjete arvu
def salvesta_hinnad(hinnad):
    db = yhenda()

    try:
        enne = db.total_changes

        # INSERT OR IGNORE jätab juba olemasoleva timestambiga kirjed vahele
        db.executemany(
            "INSERT OR IGNORE INTO electricity_prices "
            "(timestamp, price) VALUES (?, ?)",
            [(h["timestamp"], h["price"]) for h in hinnad]
        )

        db.commit()
        return db.total_changes - enne

    finally:
        db.close()


def loe_paev(paev):
    algus, lopp = paeva_piirid(paev)
    db = yhenda()

    try:
        read = db.execute(
            "SELECT timestamp, price FROM electricity_prices "
            "WHERE timestamp >= ? AND timestamp < ? "
            "ORDER BY timestamp",
            (int(algus.timestamp()), int(lopp.timestamp()))
        ).fetchall()

        return [
            {"timestamp": aeg, "price": hind}
            for aeg, hind in read
        ]

    finally:
        db.close()


# Tagastab andmebaasi hinnakirjete koguarvu ja uusima timestambi
def statistika():
    db = yhenda()

    try:
        return db.execute(
            "SELECT COUNT(*), MAX(timestamp) "
            "FROM electricity_prices"
        ).fetchone()

    finally:
        db.close()


# Leiab kõik täielike, 15-minutiliste hinnakirjetega Eesti kalendripäevad.
def saadaval_paevad():
    db = yhenda()
    paevade_hinnad = {}

    try:
        for (aeg,) in db.execute(
            "SELECT timestamp FROM electricity_prices ORDER BY timestamp"
        ):
            paev = datetime.fromtimestamp(aeg, EESTI_AEG).date()
            paevade_hinnad.setdefault(paev, []).append(aeg)
    finally:
        db.close()

    sobivad = []

    for paev, ajatemplid in paevade_hinnad.items():
        algus, lopp = paeva_piirid(paev)
        oodatud = list(range(
            int(algus.timestamp()), int(lopp.timestamp()), 900
        ))

        # Välistame puudulikud ja kellakeeramise tõttu eripikkusega päevad.
        if len(oodatud) == 96 and ajatemplid == oodatud:
            sobivad.append(paev.isoformat())

    return sorted(sobivad)
