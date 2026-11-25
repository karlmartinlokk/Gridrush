
"""Gridrushi saavutused ja nende edenemise arvutamine."""


SAAVUTUSED = [
    (
        "first_buy", "First Steps",
        "Soorita esimene ostutehing.",
        "buy_count", 1
    ),
    (
        "first_sell", "Power Seller",
        "Soorita esimene müügitehing.",
        "sell_count", 1
    ),
    (
        "full_battery", "Fully Charged",
        "Lae aku täielikult täis.",
        "full_battery", 1
    ),
    (
        "empty_battery", "Empty Tank",
        "Tühjenda aku müügitehinguga.",
        "empty_battery", 1
    ),
    (
        "negative_price", "Paid to Charge",
        "Osta elektrit negatiivse hinnaga.",
        "negative_buys", 1
    ),
    (
        "double_money", "Double or Nothing",
        "Saavuta 2000 euro väärtuses vara.",
        "best_value", 2000
    ),
    (
        "power_trader", "Power Trader",
        "Saavuta 5000 euro väärtuses vara.",
        "best_value", 5000
    ),
    (
        "energy_baron", "Energy Baron",
        "Saavuta 10 000 euro väärtuses vara.",
        "best_value", 10000
    ),
    (
        "trades_10", "Getting Started",
        "Soorita 10 tehingut.",
        "total_trades", 10
    ),
    (
        "trades_100", "Trading Machine",
        "Soorita 100 tehingut.",
        "total_trades", 100
    ),
    (
        "trades_1000", "Market Master",
        "Soorita 1000 tehingut.",
        "total_trades", 1000
    ),
    (
        "energy_100", "Energy Dealer",
        "Müü kokku 100 MWh elektrit.",
        "energy_sold", 100
    ),
    (
        "days_10", "Market Regular",
        "Lõpeta 10 mängupäeva.",
        "days_played", 10
    ),
    (
        "days_30", "Market Veteran",
        "Lõpeta 30 mängupäeva.",
        "days_played", 30
    ),
    (
        "streak_5", "Hot Streak",
        "Lõpeta 5 järjestikust päeva kasumiga.",
        "longest_streak", 5
    )
]


def loe_saavutused(statistika):
    """Arvutab saavutused mängija kogu ajaloo põhjal."""

    tulemused = []

    for tunnus, nimi, kirjeldus, naitaja, eesmärk in SAAVUTUSED:
        vaartus = statistika.get(naitaja, 0) or 0
        avatud = vaartus >= eesmärk

        tulemused.append({
            "id": tunnus,
            "name": nimi,
            "description": kirjeldus,
            "current": round(min(vaartus, eesmärk), 2),
            "target": eesmärk,
            "progress": round(
                min(vaartus / eesmärk, 1) * 100, 1
            ),
            "unlocked": avatud
        })

    return tulemused
