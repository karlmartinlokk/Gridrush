# GRIDRUSH-DOC: moodul
# ANDMEBAASIKIHT: salvestab Eleringi 15-minutilised elektrihinnad SQLite'i.
# Üks timestamp on primaarvõti; korduv laadimine ei tekita duplikaate.
# Kõik kuupäevad piiritleme Eesti ajavööndis, kuid salvestame Unix-ajatempleid.
# Andmebaasifail asub projekti data/gridrush.sqlite3 kaustas, mitte public_html-is.


"""Loob ja suhtleb andmebaasiga."""

# SQLite andmebaasi ja failiteedega töötamiseks vajalikud moodulid
import sqlite3
from datetime import datetime
from pathlib import Path
from gridrush.day_filter import EESTI_AEG, paeva_piirid

# Andmebaasifaili asukoht Gridrushi projekti data kaustas
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "gridrush.sqlite3"


# Loob ühenduse andmebaasiga ja vajadusel elektrihindade tabeli
# GRIDRUSH-DOC: def yhenda
# Avab SQLite'i ühenduse ja loob elektrihindade tabeli, kui seda veel ei ole.
# Tagastab avatud sqlite3.Connection objekti; väljakutsuja peab selle sulgema.
# Tabeli timestamp on INTEGER PRIMARY KEY ja hind REAL NOT NULL.
# CREATE TABLE IF NOT EXISTS võimaldab funktsiooni igal päringul kasutada.
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
# GRIDRUSH-DOC: def vanim_hind
# Leiab andmebaasi kõige vanema timestampi ja sellele vastava hinna.
# Tagastab paari (timestamp, price) või None, kui tabel on tühi.
# ORDER BY ASC ja LIMIT 1 väldivad kõigi kirjete laadimist mällu.
# try/finally sulgeb ühenduse ka SQLite'i vea korral.
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
# GRIDRUSH-DOC: def salvesta_hinnad
# Salvestab hinnakirjete loendi kujul {'timestamp': int, 'price': float}.
# INSERT OR IGNORE jätab olemasoleva ajatempliga kirjed vahele.
# Tagastab tegelikult lisatud kirjete arvu, mitte sisendkirjete arvu.
# db.total_changes võrdlus näitab selle ühenduse käigus lisatud ridu.
# Muudatused kinnitatakse commit() abil; ühendus suletakse lõpuks.
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
# GRIDRUSH-DOC: def loe_paev
# Loeb ühe Eesti kalendripäeva hinnad kronoloogilises järjekorras.
# Sisend 'paev' on YYYY-MM-DD tekst või datetime.date.
# Poolavatud vahemik [algus, lopp) väldib järgmise päeva 00:00 lisamist.
# Tagastab [{timestamp, price}, ...]; funktsioon ei taga ise 96 kirjet.
# Tühja päeva korral tagastatakse tühi loend.
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
# GRIDRUSH-DOC: def statistika
# Tagastab ühe SQL-päringuga kirjete koguarvu ja uusima ajatembli.
# Tulemus on (count, max_timestamp); tühja tabeli korral max_timestamp=None.
# Kasutatakse laadimisskripti oleku kuvamiseks ja algseisu kontrolliks.
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
# GRIDRUSH-DOC: def saadaval_paevad
# Koostab nimekirja päevadest, millel on täpselt 96 järjestikust veerandtundi.
# Teisendab ajatemplid esmalt Eesti kohalikuks kuupäevaks ja rühmitab.
# Kontrollib nii kirjeid kui nende täpseid ajatempleid (900 sekundi samm).
# Välistab puudulikud ning suve-/talveaja ülemineku tõttu eripikad päevad.
# Tagastab sorditud YYYY-MM-DD sõnede loendi; mäng valib sealt päeva.
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
