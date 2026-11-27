
"""Gridrushi saavutused ja nende edenemise arvutamine."""

SAAVUTUSED = [
    (
        "first_buy", "Esimesed sammud",
        "Osta kokku 25 MWh elektrit.",
        "energy_bought", 25
    ),
    (
        "first_sell", "Elektrimüüja",
        "Müü kokku 25 MWh elektrit.",
        "energy_sold", 25
    ),
    (
        "full_battery", "Täis laetud",
        "Täida aku 5 erineval hinnaperioodil.",
        "full_battery_periods", 5
    ),
    (
        "empty_battery", "Viimse vatini",
        "Tühjenda aku 5 erineval hinnaperioodil.",
        "empty_battery_periods", 5
    ),
    (
        "trades_10", "Hoog sisse",
        "Kauple 50 erineval hinnaperioodil.",
        "trade_periods", 50
    ),
    (
        "days_7", "Esimene nädal",
        "Lõpeta 7 mängupäeva.",
        "days_played", 7
    ),
    (
        "profit_day_500", "Edukas päev",
        "Teeni ühe päevaga 500 eurot kasumit.",
        "best_day", 500
    ),
    (
        "negative_price", "Negatiivne arve",
        "Osta negatiivse hinnaga kokku 25 MWh elektrit.",
        "negative_energy_bought", 25
    ),
    (
        "double_money", "Kolmekordne kapital",
        "Saavuta 3000 euro väärtuses vara.",
        "best_value", 3000
    ),
    (
        "energy_100", "Energiakaupmees",
        "Müü kokku 250 MWh elektrit.",
        "energy_sold", 250
    ),
    (
        "buy_250", "Varude koguja",
        "Osta kokku 250 MWh elektrit.",
        "energy_bought", 250
    ),
    (
        "profitable_10", "Kasumlik strateegia",
        "Lõpeta 10 kasumlikku mängupäeva.",
        "profitable_days", 10
    ),
    (
        "days_10", "Püsikaupleja",
        "Lõpeta 15 mängupäeva.",
        "days_played", 15
    ),
    (
        "trades_100", "Kauplemismasin",
        "Kauple 250 erineval hinnaperioodil.",
        "trade_periods", 250
    ),
    (
        "play_30", "Pühendunud kaupleja",
        "Mängi kokku 30 minutit.",
        "play_minutes", 30
    ),
    (
        "full_25", "Akuspetsialist",
        "Täida aku 25 erineval hinnaperioodil.",
        "full_battery_periods", 25
    ),
    (
        "profit_day_1500", "Kuldne päev",
        "Teeni ühe päevaga 1500 eurot kasumit.",
        "best_day", 1500
    ),
    (
        "power_trader", "Elektrikaupleja",
        "Saavuta 10 000 euro väärtuses vara.",
        "best_value", 10000
    ),
    (
        "sell_1000", "Energiavõrgustik",
        "Müü kokku 1000 MWh elektrit.",
        "energy_sold", 1000
    ),
    (
        "buy_1000", "Turu kokkuostja",
        "Osta kokku 1000 MWh elektrit.",
        "energy_bought", 1000
    ),
    (
        "streak_5", "Võiduseeria",
        "Lõpeta 10 järjestikust päeva kasumiga.",
        "longest_streak", 10
    ),
    (
        "negative_250", "Negatiivse hinna meister",
        "Osta negatiivse hinnaga kokku 250 MWh elektrit.",
        "negative_energy_bought", 250
    ),
    (
        "profitable_30", "Stabiilne sissetulek",
        "Lõpeta 30 kasumlikku mängupäeva.",
        "profitable_days", 30
    ),
    (
        "days_30", "Turuveteran",
        "Lõpeta 50 mängupäeva.",
        "days_played", 50
    ),
    (
        "empty_100", "Akumeister",
        "Tühjenda aku 100 erineval hinnaperioodil.",
        "empty_battery_periods", 100
    ),
    (
        "trades_1000", "Turumeister",
        "Kauple 1500 erineval hinnaperioodil.",
        "trade_periods", 1500
    ),
    (
        "play_120", "Elektrisõltlane",
        "Mängi kokku 120 minutit.",
        "play_minutes", 120
    ),
    (
        "energy_baron", "Energiaparun",
        "Saavuta 25 000 euro väärtuses vara.",
        "best_value", 25000
    ),
    (
        "sell_5000", "Suurvarustaja",
        "Müü kokku 5000 MWh elektrit.",
        "energy_sold", 5000
    ),
    (
        "value_100k", "Elektrimagnaat",
        "Saavuta 100 000 euro väärtuses vara.",
        "best_value", 100000
    ),
    (
        "streak_20", "Peatamatu",
        "Lõpeta 20 järjestikust päeva kasumiga.",
        "longest_streak", 20
    ),
    (
        "profitable_100", "Kasumimasin",
        "Lõpeta 100 kasumlikku mängupäeva.",
        "profitable_days", 100
    ),
    (
        "days_150", "Turulegend",
        "Lõpeta 150 mängupäeva.",
        "days_played", 150
    ),
    (
        "trades_5000", "Elektrikuningas",
        "Kauple 5000 erineval hinnaperioodil.",
        "trade_periods", 5000
    ),
    (
        "play_600", "Maratonikaupleja",
        "Mängi kokku 600 minutit.",
        "play_minutes", 600
    ),
    (
        "value_250k", "Elektriimpeerium",
        "Saavuta 250 000 euro väärtuses vara.",
        "best_value", 250000
    )
]


def loe_saavutused(statistika):
    """Arvutab saavutused mängija kogu ajaloo põhjal."""

    tulemused = []

    for tunnus, nimi, kirjeldus, naitaja, eesmärk in SAAVUTUSED:

        vaartus = max(0, statistika.get(naitaja, 0) or 0)
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
