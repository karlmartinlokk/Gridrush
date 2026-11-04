import random
import sys
from datetime import date, datetime, timedelta

# Impordime andmebaasiga töötamiseks vajalikud funktsioonid
from gridrush.db import loe_paev, salvesta_hinnad, statistika, vanim_hind

# Impordime Eesti ajavööndi ja päeva piiride leidmise funktsiooni
from gridrush.process_data import EESTI_AEG, paeva_piirid

# Impordime Eleringi API-st elektrihindade pärimise funktsiooni
from tools.fetch_day import fetch_day

# Kõige varasem kuupäev, mille hulgast juhuslik mängupäev valitakse
ALGUS = date(2025, 10, 2)


# Laeb valitud päeva hinnad andmebaasi, kui need pole veel olemas
def laadi_paev(paev):
    # Loeme andmebaasist juba salvestatud hinnad
    olemas = loe_paev(paev)

    # Leiame päeva alguse ja lõpu ning arvutame oodatud hinnakirjete arvu
    algus, lopp = paeva_piirid(paev)
    oodatud = int(
        (lopp.timestamp() - algus.timestamp()) / 900
    )

    # Kui kõik hinnakirjed on olemas, ei tee uut API päringut
    if len(olemas) == oodatud:
        print(f"{paev}: hinnad juba andmebaasis.")
        return olemas

    # Puuduvate andmete korral küsime hinnad Eleringilt ja salvestame
    hinnad = fetch_day(paev)
    lisatud = salvesta_hinnad(hinnad)

    print(f"{paev}: lisatud {lisatud} uut hinnakirjet.")
    return loe_paev(paev)


# Kontrollib viimaste päevade elektrihindu ja lisab puuduvad andmed
def uuenda():
    # Leiame tänase kuupäeva Eestis
    tana = datetime.now(EESTI_AEG).date()
    kokku = 0

    # Kontrollime üle-eile, eile, täna ja homme
    for vahe in (-2, -1, 0, 1):
        paev = tana + timedelta(days=vahe)

        try:
            # Küsime hinnad ilma terve päeva täielikkuse kontrollita
            # Nii saab salvestada ka jooksva päeva ja homse avaldatud hinnad
            hinnad = fetch_day(
                paev, kontrolli_taispaeva=False
            )

            # Salvestame uued hinnakirjed ja liidame need koguarvule
            uusi = salvesta_hinnad(hinnad)
            kokku += uusi

            print(f"{paev}: {uusi} uut hinnakirjet")

        except (ValueError, OSError) as viga:
            # Homsete hindade puudumine ei katkesta programmi
            if vahe == 1:
                print(f"Homsed hinnad pole veel saadaval: {viga}")
            else:
                raise

    # Kuvame kõigi lisatud hinnakirjete arvu
    print(f"Kokku lisatud: {kokku} uut hinnakirjet.")


# Käivitab esialgse andmete laadimise ja uuendamise
def alusta():
    # Kontrollime, mitu hinnakirjet on juba andmebaasis
    kogus, _ = statistika()

    # Kui andmebaas on tühi, valime ühe juhusliku ajaloolise päeva
    if kogus == 0:
        eile = datetime.now(EESTI_AEG).date() - timedelta(days=1)

        # Valime juhusliku kuupäeva määratud alguse ja eilse päeva vahelt
        suvaline = ALGUS + timedelta(
            days=random.randint(0, (eile - ALGUS).days)
        )

        # Laeme valitud päeva elektrihinnad
        laadi_paev(suvaline)

    # Kontrollime seejärel kõige uuemaid elektrihindu
    uuenda()


# Kuvab andmebaasi hinnakirjete arvu ning uusima ja vanima hinna
def naita_seisu():
    kogus, viimane = statistika()

    print(f"Andmebaasis: {kogus} hinnakirjet")

    # Kui andmebaasis on hinnakirjeid, kuvame kõige uuema timestambi
    if viimane is not None:
        print(
            "Uusim hind:",
            datetime.fromtimestamp(viimane, EESTI_AEG)
        )

    # Leiame andmebaasist kõige vanema hinnakirje
    vanim = vanim_hind()

    if vanim:
        aeg, hind = vanim

        # Kuvame vanima hinna kuupäeva, kellaaja ja väärtuse
        print("Vanim hind:", datetime.fromtimestamp(aeg, EESTI_AEG))
        print("Hind:", hind, "€/MWh")


# Käsurealt käivitamisel valime etteantud tegevuse
if __name__ == "__main__":
    # Kui käsku pole määratud, kasutame vaikimisi start
    kask = sys.argv[1] if len(sys.argv) > 1 else "start"

    # Esmane laadimine ja viimaste hindade uuendamine
    if kask == "start":
        alusta()

    # Ainult viimaste hindade kontrollimine
    elif kask == "update":
        uuenda()

    # Ühe konkreetse ajaloolise päeva laadimine
    elif kask == "day" and len(sys.argv) > 2:
        laadi_paev(sys.argv[2])

    # Andmebaasi statistika kuvamine
    elif kask == "status":
        naita_seisu()

    # Tundmatu käsu korral kuvame kasutusjuhendi
    else:
        print("Kasutus: start | update | day YYYY-MM-DD | status")
