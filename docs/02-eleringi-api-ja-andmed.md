# 02. Eleringi API ja elektrihindade töötlemine

## 1. Eesmärk

Andmete hankimise toru peab muutma Eleringi toorvastuse mängule sobivaks ühtlaseks jadaks. Selleks kasutatakse kolme koodiosa: `gridrush/fetch_day.py` teeb HTTP-päringu, `gridrush/day_filter.py` filtreerib ja valideerib aja ning `tools/sync_prices.py` salvestab sobivad päevad andmebaasi. Päeva enda hinnad ei ole juhuslikult genereeritud: need pärinevad Eleringi Eesti hinnakirjetest.

## 2. Päeva piirid – `day_filter.py`

Konstant `EESTI_AEG = ZoneInfo("Europe/Tallinn")` tagab, et päeva mõistetakse **Eesti kalendripäevana**, mitte UTC kuupäevana. Eesti päev algab kohaliku aja järgi kell 00:00 ja lõpeb järgmise kohaliku päeva kell 00:00.

### `paeva_piirid(paev)`

**Sisend:** `datetime.date` objekt või ISO-tekst kujul `YYYY-MM-DD`.

**Tagastus:** `(algus, lopp)` – kaks ajavööndiga `datetime` objekti; `lopp` on järgmise päeva algus, seega päeva andmed valitakse poolavatud vahemikust `[algus, lopp)`.

**Töökäik:** string teisendatakse `date.fromisoformat()` abil; `datetime.combine(..., time.min, tzinfo=EESTI_AEG)` moodustab päeva alguse; `timedelta(days=1)` abil arvutatakse järgmise päeva algus.

**Miks nii?** Kui aluseks võtta lihtsalt 24 tundi UTC-s, võivad Eesti kalendripäeva esimesed või viimased hinnakirjed valesse päeva sattuda. Lisaks kestab Eesti kohaliku aja päev suve-/talveajale üleminekul 23 või 25 tundi.

## 3. Toorandmete puhastamine – `tootle_hinnad(...)`

```python
tootle_hinnad(toorandmed, algus, lopp, kontrolli_taispaeva=True)
```

| Parameeter | Tähendus |
|---|---|
| `toorandmed` | Eleringi Eesti hinnakirjete loend; igal kirjel eeldatakse välju `timestamp` ja `price` |
| `algus`, `lopp` | Eelmise funktsiooni arvutatud Eesti päeva piirid |
| `kontrolli_taispaeva` | Kui `True`, nõutakse kõiki ootuspäraseid 15-minutilisi hinnaperioode |

**Töökäik sammhaaval:**

1. `algus.timestamp()` ja `lopp.timestamp()` teisendatakse Unixi täissekunditeks.
2. Käiakse läbi Eleringi kirjed ja võetakse ainult `algus <= timestamp < lopp`.
3. `timestamp` teisendatakse `int`-iks, hind `float`-iks.
4. Hinnad paigutatakse sõnastikku `hinnad[timestamp] = price`. Kui lähteandmetes on sama ajatempel kaks korda, jääb alles hilisem loetud väärtus.
5. Täielikkuse nõudmisel moodustatakse `set(range(esimene, viimane, 900))`, kus 900 sekundit = 15 minutit.
6. Kui tegelikud ajatemplid ei lange täpselt oodatud hulgaga kokku, tekib `ValueError("Selle päeva hinnakirjed ei ole täielikud.")`.
7. Tulemus sorteeritakse ajatembli järgi ja tagastatakse sõnastike loendina.

Tagastatava elemendi kuju:

```json
{"timestamp": 1759352400, "price": 57.42}
```

*Arvväärtus on näitlik; kood ei defineeri konkreetset hinda.*

**Tähelepanek:** kui `kontrolli_taispaeva=False`, lubab see funktsioon tagastada ka osalise päeva. Mäng ise nõuab `trading.py` kaudu täielikku 96-punktilist päeva.

## 4. Päring Eleringisse – `fetch_day.py`

Konstant:

```python
API_URL = "https://dashboard.elering.ee/api/nps/price"
```

### `fetch_day(paev, kontrolli_taispaeva=True)`

**Sisend:** päeva kuupäev ja täielikkuse kontrolli lipp. **Väljund:** sama struktuur, mille tagastab `tootle_hinnad`.

1. Kutsutakse `paeva_piirid(paev)`.
2. Sisemine abifunktsioon `utc_tekst(aeg)` teisendab Eesti kuupäevapiiri UTC ISO 8601 kujule, milles on millisekundid ja lõpus `Z`.
3. Koostatakse `start` ja `end` parameetrid. `end` on järgmise päeva algusest **1 millisekund varem**, et päringusse ei kuuluks järgmise päeva esimest hinnapunkti.
4. `urlencode` liidab parameetrid API URL-i külge.
5. `urllib.request.urlopen(url, timeout=20)` saadab HTTPS-päringu; `json.load` loeb vastuse.
6. Kontrollitakse vastuse `success` märki ja võtme `data.ee` olemasolu. Mängule valitakse **ainult Eesti** (`ee`), kuigi API võib pakkuda ka teiste piirkondade kirjeid.
7. `tootle_hinnad` filtreerib ülejäänud andmed Eesti päeva piiresse ja kontrollib vajadusel täielikkust.

API vastuse kuju, mida kood eeldab, on sisuliselt:

```json
{
  "success": true,
  "data": {
    "ee": [
      {"timestamp": 1759352400, "price": 57.42}
    ]
  }
}
```

See on **struktuurinäide**, mitte Eleringi reaalne täielik vastus. Koodi jaoks olulised on `success`, `data.ee`, `timestamp` ja `price` väljad. Kui API struktuur muutub, tuleb vastavat funktsiooni muuta.

### Võimalikud vead

- Elering ei anna `success` või `data.ee` välja → `ValueError`.
- HTTP-, DNS- või võrguviga → `urlopen`-ist pärinev erind (`OSError`-i alamtüüp või HTTP-erind).
- Vigane JSON → JSON-i parsimise erind.
- Puuduv või vigane `timestamp`/`price` → `KeyError` või teisendamisviga.
- Puudulik 15-minutiline aegrida → `ValueError` täielikkuse kontrollist.

## 5. Ajalooliste päevade laadimine – `tools/sync_prices.py`

See käsureatööriist ei ole sama mis mängu HTTP-server. Selle ülesanne on andmebaasi ette valmistada ja hiljem täiendada.

### Olulised funktsioonid

| Funktsioon | Tegevus ja tulemus |
|---|---|
| `sobiv_paev(paev)` | Tagastab `True`, kui Eesti kalendripäevas on täpselt 96 × 15-minutilist intervalli |
| `taielik_paev(paev, hinnad)` | Võrdleb olemasolevate kirjete ajatempleid kogu päeva oodatud ajatemplitega |
| `laadi_paev(paev)` | Kasutab olemasolevat täielikku päeva või küsib puuduva päeva Eleringilt ja salvestab |
| `uuenda()` | Kontrollib päevi, mis jäävad tänasest 3, 2 ja 1 päeva taha |
| `backfill()` | Liigub läbi kogu ajavahemiku alates `ALGUS` väärtusest kuni eilseni ja laeb puuduvad sobivad päevad |
| `alusta()` | Tühja andmebaasi korral valib ühe juhusliku sobiva päeva; seejärel teeb tavauuenduse |
| `naita_seisu()` | Kuvab hinnakirjete arvu, vanima kirje ja viimase kirje andmed |

**Alguskuupäev:** `ALGUS = date(2025, 10, 2)`.

### Mida teeb `laadi_paev`?

Kõigepealt välistab funktsioon kellakeeramise eripäeva. Seejärel loeb `loe_paev` kaudu andmebaasist olemasolevad hinnad. Kui `taielik_paev` kinnitab, et kõik 96 ajatemplit on olemas, **uut Eleringi päringut ei tehta**. Puuduliku päeva korral tuuakse terve päeva andmestik, salvestatakse `INSERT OR IGNORE` loogikaga ja loetakse andmebaasist uuesti.

### `backfill` tööjärjekord

See iteratsioon kontrollib kõiki päevi alates 02.10.2025 kuni eilse kuupäevani, jättes mittekõlblikud päevad vahele. Iga puuduv päev püütakse Eleringilt laadida ja ebaõnnestumised kogutakse `vigased_paevad` loendisse. Päringute vahel on **5-sekundiline paus**, mis piirab välise API koormust. Päeva olemasolu kontrollitakse enne võrku minemist.

### Käsurea käsud

```powershell
python -m tools.sync_prices start
python -m tools.sync_prices update
python -m tools.sync_prices backfill
python -m tools.sync_prices day 2025-10-02
python -m tools.sync_prices status
```

Tähendused: `start` – esmane käivitus / uuendus; `update` – viimaste lõppenud päevade kontroll; `backfill` – kõik puuduvad päevad; `day` – üks kuupäev; `status` – andmebaasi seis.

## 6. Piirangud ja edasiarendus

- API päringu õnnestumine ei tähenda automaatselt, et päev on täielik; kontroll tehakse eraldi.
- Kellakeeramise päevadel võib perioode olla 92 või 100; praegune mäng neid ei aktsepteeri.
- `backfill` ei käivitu taustateenusena automaatselt: käsurea tööriist tuleb käivitada ise või seadistada eraldi ajastamine.
- Ajalooliste hindade avalik kättesaadavus tähendab, et hindade peitmine Gridrushi API-s ei saa takistada kõikvõimalikke väliseid otsinguid.

Seotud: [andmebaas](03-sqlite-andmebaas.md), [mängukell](06-serveripohine-mangukell.md).
