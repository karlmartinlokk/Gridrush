# Gridrush – tehniline dokumentatsioon

See kaust selgitab Gridrushi andmete laadimise, salvestamise, kauplemise, mängukella, HTTP-liidese, hinnagraafiku ja serveripoolsete hindade peitmise teostust. Dokumendid on mõeldud nii meeskonnale kui ka projekti kaitsmisel kasutamiseks.

## Sisukord

1. [Süsteemi üldine ülesehitus](01-susteemi-ulevaade.md) – moodulid, vastutuse jaotus ning terviklik andmevoog
2. [Eleringi API ja andmete töötlemine](02-eleringi-api-ja-andmed.md) – hindade pärimine, ajavöönd, valideerimine, uuendamine
3. [SQLite'i andmebaas](03-sqlite-andmebaas.md) – andmeskeem, SQL, salvestamine ja päeva valimine
4. [HTTP-server ja mänguseansid](04-server-ja-manguseansid.md) – päringud, küpsised, JSON, lõimede ohutus
5. [Kauplemisloogika](05-kauplemisloogika.md) – mänguseis, ost-müük, raha, energiakogus, valideerimine
6. [Serveripõhine mängukell](06-serveripohine-mangukell.md) – ajamudel, kiirused, paus, päevavahetus
7. [Hinnagraafik ja veebiliides](07-hinnagraafik-ja-frontend.md) – chart.js, javascripti olek ja sündmused
8. [Anti-cheat ja piirangud](08-anti-cheat.md) – hinnateabe väljastamine, usalduspiirid ja nõrkused

## Kuidas kohapeal käivitada?

Käivita käsud projekti **juurkaustas**:

```powershell
python -m pip install -r requirements.txt
python -m tools.sync_prices backfill
python -m tools.dev_server
```

Ava brauseris `http://127.0.0.1:8000/index.html`. Hindade laadimiseks peab olema internetiühendus; mängu töötamiseks peab SQLite'i andmebaasis olema sobiv täielik päev. Pythonis kasutatakse ajavööndi `Europe/Tallinn` andmeid; Windowsi jaoks on `requirements.txt` failis `tzdata`.

## Kõige tähtsamad põhimõtted

- **Andmebaas** säilitab ajaloolisi Eleringi elektrihindu; **mänguseanss** hoiab raha, akut ja kella mälus.
- **Server otsustab** tehingu hinna, aja, lubatavuse ja juba avaldatud elektrihinnad.
- **Brauser kuvab** seisu ja saadab kasutaja tegevused serverisse; tulevase hinna väärtus on graafiku jaoks `null`.
- **Üks kalendripäev** tähendab tavaliselt 96 × 15-minutilist elektrihinnavahemikku. Suve- ja talveajale ülemineku eripäevi aktiivse mängu andmestikust välditakse.
- **Üks mängupäev** kestab 1× kiirusel umbes 180 sekundit päris elus.

