
"""Gridrushi mänguajaloo ja statistika haldamine."""

import sqlite3

from contextlib import contextmanager
from gridrush.db import yhenda


@contextmanager
def uhendus():
    db = yhenda()
    db.row_factory = sqlite3.Row

    try:
        with db:
            yield db
    finally:
        db.close()


def loo_tabelid():
    """Loob mänguajaloo tabelid, kui neid veel ei eksisteeri."""

    with uhendus() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id TEXT NOT NULL,
                started_at TEXT DEFAULT CURRENT_TIMESTAMP,
                initial_balance REAL NOT NULL,
                last_value REAL NOT NULL,
                peak_value REAL NOT NULL,
                play_seconds REAL NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL REFERENCES games(id),
                day_number INTEGER NOT NULL,
                market_timestamp INTEGER NOT NULL,
                action TEXT NOT NULL
                    CHECK (action IN ('buy', 'sell')),
                quantity REAL NOT NULL,
                price REAL NOT NULL,
                cash_change REAL NOT NULL,
                balance_after REAL NOT NULL,
                energy_after REAL NOT NULL,
                capacity REAL NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS daily_stats (
                game_id INTEGER NOT NULL REFERENCES games(id),
                day_number INTEGER NOT NULL,
                market_date TEXT NOT NULL,
                start_value REAL NOT NULL,
                end_value REAL NOT NULL,
                profit REAL NOT NULL,
                PRIMARY KEY (game_id, day_number)
            );

            CREATE INDEX IF NOT EXISTS idx_games_player
                ON games(player_id);

            CREATE INDEX IF NOT EXISTS idx_transactions_game
                ON transactions(game_id);
        """)


def mangija_olemas(player_id):
    """Kontrollib, kas mängijal on salvestatud mänguajalugu."""

    if not player_id:
        return False

    with uhendus() as db:
        return db.execute("""
            SELECT 1 FROM games
            WHERE player_id = ?
            LIMIT 1
        """, (player_id,)).fetchone() is not None


def loo_mang(player_id, algsumma):
    """Salvestab uue mängu ja tagastab selle ID."""

    with uhendus() as db:
        tulemus = db.execute("""
            INSERT INTO games (
                player_id,
                initial_balance,
                last_value,
                peak_value
            )
            VALUES (?, ?, ?, ?)
        """, (player_id, algsumma, algsumma, algsumma))

        return tulemus.lastrowid


def salvesta_seis(game_id, seis, manguaeg, tipp,
                  paeva_algvaartus, tehing=None):
    """Salvestab mängu hetkeseisu ja vajadusel tehingu."""

    if game_id is None:
        return

    with uhendus() as db:
        db.execute("""
            UPDATE games
            SET last_value = ?,
                peak_value = MAX(peak_value, ?),
                play_seconds = ?
            WHERE id = ?
        """, (
            seis["asset_value"],
            max(tipp, seis["asset_value"]),
            manguaeg,
            game_id
        ))

        if tehing is not None:
            db.execute("""
                INSERT INTO transactions (
                    game_id,
                    day_number,
                    market_timestamp,
                    action,
                    quantity,
                    price,
                    cash_change,
                    balance_after,
                    energy_after,
                    capacity
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                game_id,
                seis["day_number"],
                seis["timestamp"],
                tehing["action"],
                tehing["quantity"],
                seis["price"],
                tehing["cash_change"],
                seis["balance"],
                seis["energy"],
                seis["capacity"]
            ))

        # Üks mängupäev salvestatakse ainult ühe korra.
        if seis["day_finished"]:
            kasum = round(
                seis["asset_value"] - paeva_algvaartus, 2
            )

            db.execute("""
                INSERT OR IGNORE INTO daily_stats (
                    game_id,
                    day_number,
                    market_date,
                    start_value,
                    end_value,
                    profit
                )
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                game_id,
                seis["day_number"],
                seis["date"],
                paeva_algvaartus,
                seis["asset_value"],
                kasum
            ))


def loe_statistika(player_id, game_id=None):
    """Tagastab ühe mängu või kogu mänguajaloo statistika."""

    tingimus = "g.player_id = ?"
    parameetrid = [player_id]

    if game_id is not None:
        tingimus += " AND g.id = ?"
        parameetrid.append(game_id)

    with uhendus() as db:
        db.execute("BEGIN")

        mangud = db.execute(f"""
            SELECT
                COUNT(*) AS games_started,
                COALESCE(
                    SUM(last_value - initial_balance), 0
                ) AS total_profit,
                COALESCE(MAX(peak_value), 0) AS best_value,
                COALESCE(SUM(play_seconds), 0) AS play_seconds
            FROM games g
            WHERE {tingimus}
        """, parameetrid).fetchone()

        tehingud = db.execute(f"""
            SELECT
                COUNT(*) AS total_trades,

                COUNT(CASE WHEN action = 'buy'
                    THEN 1 END) AS buy_count,

                COUNT(CASE WHEN action = 'sell'
                    THEN 1 END) AS sell_count,

                COALESCE(SUM(CASE WHEN action = 'buy'
                    THEN quantity ELSE 0 END), 0)
                    AS energy_bought,

                COALESCE(SUM(CASE WHEN action = 'sell'
                    THEN quantity ELSE 0 END), 0)
                    AS energy_sold,

                MIN(CASE WHEN action = 'buy'
                    THEN price END) AS lowest_buy,

                MAX(CASE WHEN action = 'sell'
                    THEN price END) AS highest_sell,

                SUM(CASE WHEN action = 'buy'
                    THEN quantity * price END)
                    / NULLIF(SUM(CASE WHEN action = 'buy'
                        THEN quantity END), 0)
                    AS average_buy,

                SUM(CASE WHEN action = 'sell'
                    THEN quantity * price END)
                    / NULLIF(SUM(CASE WHEN action = 'sell'
                        THEN quantity END), 0)
                    AS average_sell,

                COUNT(CASE WHEN action = 'buy'
                    AND price < 0 THEN 1 END)
                    AS negative_buys,

                COUNT(CASE WHEN action = 'buy'
                    AND energy_after >= capacity - 0.000001
                    THEN 1 END) AS full_battery,

                COUNT(CASE WHEN action = 'sell'
                    AND energy_after <= 0.000001
                    THEN 1 END) AS empty_battery

            FROM transactions t
            JOIN games g ON g.id = t.game_id
            WHERE {tingimus}
        """, parameetrid).fetchone()

        paevad = db.execute(f"""
            SELECT d.game_id, d.day_number,
                d.start_value, d.end_value, d.profit
            FROM daily_stats d
            JOIN games g ON g.id = d.game_id
            WHERE {tingimus}
            ORDER BY d.game_id, d.day_number
        """, parameetrid).fetchall()

        ajalugu = db.execute(f"""
            SELECT t.day_number, t.action,
                t.quantity, t.price, t.cash_change,
                strftime('%s', t.created_at) AS created_at
            FROM transactions t
            JOIN games g ON g.id = t.game_id
            WHERE {tingimus}
            ORDER BY t.id DESC
            LIMIT 100
        """, parameetrid).fetchall()

    kasumlikud = sum(p["profit"] > 0 for p in paevad)

    pikim_seeria = 0
    seeria = 0
    eelmine_mang = None

    for paev in paevad:
        # Uue mänguga algab uus päevade seeria.
        if paev["game_id"] != eelmine_mang:
            seeria = 0

        if paev["profit"] > 0:
            seeria += 1
            pikim_seeria = max(pikim_seeria, seeria)
        else:
            seeria = 0

        eelmine_mang = paev["game_id"]

    tulemus = {
        **dict(mangud),
        **dict(tehingud),

        "days_played": len(paevad),
        "profitable_days": kasumlikud,

        "profitable_days_percent": (
            round(kasumlikud / len(paevad) * 100, 1)
            if paevad else 0
        ),

        "best_day": max(
            (p["profit"] for p in paevad), default=None
        ),

        "worst_day": min(
            (p["profit"] for p in paevad), default=None
        ),

        "longest_streak": pikim_seeria,

        "daily_history": [dict(p) for p in paevad[-90:]],
        "transactions": [dict(t) for t in ajalugu]
    }

    return tulemus
