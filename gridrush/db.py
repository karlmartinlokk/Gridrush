""" Loob ja suhtleb andmebaasiga """

# SQLite andmebaasi ja failiteedega töötamiseks vajalikud moodulid
import sqlite3
from pathlib import Path
from gridrush.day_filter import paeva_piirid

# Andmebaasifaili asukoht Gridrushi projekti data kaustas
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "gridrush.sqlite3"


# Loob ühenduse andmebaasiga ja vajadusel elektrihindade tabeli
def yhenda():
    DB_PATH.parent.mkdir(exist_ok=True)
    db = sqlite3.connect(DB_PATH)

    # Tabelis on iga hinna timestamp ja sellele vastav elektrihind
    # timestamp on unikaalne, et vältida sama hinna korduvat salvestamist
    db.execute("""
        CREATE TABLE IF NOT EXISTS electricity_prices (
            timestamp INTEGER PRIMARY KEY,
            price REAL NOT NULL
        )
    """)

    return db


# Leiab andmebaasist kõige vanema hinna
def vanim_hind():
    db = yhenda()

    try:
        # Järjestab hinnad timestambi järgi ja tagastab esimese kirje
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
        # Jätame meelde, mitu muudatust oli enne salvestamist tehtud
        enne = db.total_changes

        # Lisame hinnad andmebaasi
        # INSERT OR IGNORE jätab juba olemasoleva timestambiga kirjed vahele
        db.executemany(
            "INSERT OR IGNORE INTO electricity_prices "
            "(timestamp, price) VALUES (?, ?)",
            [(h["timestamp"], h["price"]) for h in hinnad]
        )

        # Salvestame muudatused ja tagastame lisatud kirjete arvu
        db.commit()
        return db.total_changes - enne

    finally:
        # Sulgeme ühenduse ka vea tekkimisel
        db.close()


# Loeb andmebaasist ühe kindla päeva elektrihinnad
def loe_paev(paev):
    # Leiame valitud päeva alguse ja lõpu
    algus, lopp = paeva_piirid(paev)
    db = yhenda()

    try:
        # Valime ainult selle päeva hinnad ja järjestame need ajaliselt
        read = db.execute(
            "SELECT timestamp, price FROM electricity_prices "
            "WHERE timestamp >= ? AND timestamp < ? "
            "ORDER BY timestamp",
            (int(algus.timestamp()), int(lopp.timestamp()))
        ).fetchall()

        # Teisendame andmebaasi read sõnastike loendiks
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
