import random
import sys
import time
from datetime import date, datetime, timedelta

from gridrush.db import loe_paev, salvesta_hinnad, statistika, vanim_hind
from gridrush.day_filter import EESTI_AEG, paeva_piirid
from gridrush.fetch_day import fetch_day


# 2. oktoober 2025 on esimene päev, millest alates kasutame
# 15-minutilise intervalliga elektrihindu.
ALGUS = date(2025, 10, 2)

# Kontrollib, kas päevas on tavapärased 96 hinnaperioodi
def sobiv_paev(paev):
    algus, lopp = paeva_piirid(paev)

    return int((lopp.timestamp() - algus.timestamp()) / 900) == 96


# Kontrollib, kas kõik 96 hinnakirjet on andmebaasis olemas
def taielik_paev(paev, hinnad):
    if not sobiv_paev(paev):
        return False

    algus, lopp = paeva_piirid(paev)

    oodatud = set(range(
        int(algus.timestamp()),
        int(lopp.timestamp()),
        900
    ))

    olemas = {h["timestamp"] for h in hinnad}

    return olemas == oodatud


# Laeb valitud päeva hinnad andmebaasi
def laadi_paev(paev):
    if isinstance(paev, str):
        paev = date.fromisoformat(paev)

    # Jätame kellakeeramise päevad vahele
    if not sobiv_paev(paev):
        print(f"{paev}: kellakeeramise päev, jätame vahele.")
        return []

    # Kontrollime, kas hinnad on juba andmebaasis
    olemas = loe_paev(paev)

    if taielik_paev(paev, olemas):
        print(f"{paev}: hinnad juba andmebaasis.")
        return olemas

    # Puuduvate andmete korral küsime hinnad Eleringilt
    hinnad = fetch_day(paev)
    lisatud = salvesta_hinnad(hinnad)

    print(f"{paev}: lisatud {lisatud} uut hinnakirjet.")
    return loe_paev(paev)


# Kontrollib viimase kolme lõppenud päeva hindu
def uuenda():
    tana = datetime.now(EESTI_AEG).date()

    for vahe in (-3, -2, -1):
        paev = tana + timedelta(days=vahe)

        # Kellakeeramise päevi ei lae
        if not sobiv_paev(paev):
            continue

        # Juba salvestatud päevi uuesti ei küsi
        if taielik_paev(paev, loe_paev(paev)):
            continue

        try:
            laadi_paev(paev)
            time.sleep(5)

        except (ValueError, OSError, KeyError) as viga:
            print(f"{paev}: viga - {viga}")
            break

# Laeb kõik puuduvad elektrihinnad alates ALGUS kuupäevast
def backfill():
    tana = datetime.now(EESTI_AEG).date()
    vigased_paevad = []

    for i in range((tana - ALGUS).days, 0, -1):
        paev = tana - timedelta(days=i)

        # Kellakeeramise päevi ei lae
        if not sobiv_paev(paev):
            continue

        # Kontrollime, kas päev on juba täielikult olemas
        try:
            if taielik_paev(paev, loe_paev(paev)):
                continue
        except (OSError, ValueError, KeyError) as viga:
            print(f"{paev}: kontrollimisel tekkis viga - {viga}")
            vigased_paevad.append(paev)
            continue

        # Proovime puuduvad hinnad laadida
        try:
            laadi_paev(paev)

        except (OSError, ValueError, KeyError) as viga:
            print(f"{paev}: laadimisel tekkis viga - {viga}")
            vigased_paevad.append(paev)

        finally:
            # Ootame ka siis, kui laadimisel tekkis viga
            time.sleep(5)

    # Kokkuvõte
    if vigased_paevad:
        print(f"Andmete laadimise katse lõpetatud. Vigaseid päevi: {len(vigased_paevad)}")
    else:
        print("Andmete laadimine lõpetatud.")

# Esmane andmete laadimine ja uuendamine
def alusta():
    kogus, _ = statistika()

    # Tühja andmebaasi korral valime juhusliku ajaloolise päeva
    if kogus == 0:
        eile = datetime.now(EESTI_AEG).date() - timedelta(days=1)

        while True:
            suvaline = ALGUS + timedelta(
                days=random.randint(0, (eile - ALGUS).days)
            )

            if sobiv_paev(suvaline):
                break

        laadi_paev(suvaline)
        time.sleep(5)

    uuenda()


# Kuvab andmebaasi statistika
def naita_seisu():
    kogus, viimane = statistika()

    print(f"Andmebaasis: {kogus} hinnakirjet")

    if viimane is not None:
        print(
            "Uusim hind:",
            datetime.fromtimestamp(viimane, EESTI_AEG)
        )

    vanim = vanim_hind()

    if vanim:
        aeg, hind = vanim

        print("Vanim hind:", datetime.fromtimestamp(aeg, EESTI_AEG))
        print("Hind:", hind, "€/MWh")


# Käskude valimine terminalist
if __name__ == "__main__":
    kask = sys.argv[1] if len(sys.argv) > 1 else "start"

    if kask == "start":
        alusta()

    elif kask == "backfill":
        backfill()

    elif kask == "update":
        uuenda()

    elif kask == "day" and len(sys.argv) > 2:
        laadi_paev(sys.argv[2])

    elif kask == "status":
        naita_seisu()

    else:
        print("Kasutus: start | backfill | update | day YYYY-MM-DD | status")
