# 03. SQLite'i andmebaas ja hinnakirjete salvestamine

## 1. Milleks andmebaas?

Mäng vajab ajaloolisi hindu paljude erinevate päevade kohta. Iga brauseriseansi alustamisel Eleringilt hindu uuesti küsimine suurendaks välisest teenusest sõltumist ja aeglustaks mängu. Seetõttu hoitakse eelnevalt kogutud hinnad **SQLite'i failis**. Mängija raha, aku ja mängukell selles tabelis **ei** asu: need on kohaliku mänguserveri protsessi mälus.

Andmebaasiga suhtlemise keskne moodul on `gridrush/db.py`. Hinnakirjete ettevalmistamist ja uuendamist teeb `tools/sync_prices.py`.

## 2. Andmebaasi asukoht ja skeem

Mooduli konstant `DB_PATH` on defineeritud nii:

```python
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "gridrush.sqlite3"
```

Seega asub fail projekti juurkausta `data/` alamkataloogis sõltumata sellest, millisest töökataloogist Python käivitati. `yhenda()` loob vajadusel **kataloogi**, loob SQLite'i ühenduse ja täidab `CREATE TABLE IF NOT EXISTS`.

```sql
CREATE TABLE IF NOT EXISTS electricity_prices (
    timestamp INTEGER PRIMARY KEY,
    price REAL NOT NULL
);
```

| Veerg | SQLite'i tüüp | Tähendus |
|---|---|---|
| `timestamp` | `INTEGER` | Hinnaperioodi alguse Unixi ajatempel sekundites; primaarvõti |
| `price` | `REAL NOT NULL` | Elektrihind eurodes megavatt-tunni kohta (€/MWh) |

**Üks rida = üks 15-minutiline hinnaperiood.** Esitatakse perioodi algus, mitte lõpp. `timestamp` primaarvõtmena ei luba sama ajahetke teist korda lisada. Kuupäeva ega riigi nime ei ole eraldi veerus: päev tuletatakse ajatemplist Eesti ajavööndis; sinna salvestatakse juba Eesti hinnad.

## 3. Andmebaasi funktsioonide detailne kirjeldus

### `yhenda()`

**Sisend:** puudub. **Tagastus:** avatud `sqlite3.Connection`.

1. Loob andmebaasifaili kausta `mkdir(exist_ok=True)` abil.
2. Avab `sqlite3.connect(DB_PATH)`.
3. Tagab tabeli `electricity_prices` olemasolu.
4. Tagastab ühenduse; selle sulgemine jääb kutsuja vastutuseks.

Tabeli loomine käivitatakse ühenduse loomisel. See lihtsustab esmast käivitamist, kuid tootmises võiks skeemi loomise ja päringute tegemise lahutada.

### `vanim_hind()`

**Tagastus:** esimene `(timestamp, price)` paar või `None`, kui tabel on tühi.

```sql
SELECT timestamp, price
FROM electricity_prices
ORDER BY timestamp ASC
LIMIT 1;
```

Funktsioon sobib näiteks kontrollimiseks, millisest ajast andmeid leidub. Ühendus suletakse `finally` plokis ka vea tekkimisel.

### `salvesta_hinnad(hinnad)`

**Sisend:** sõnastike loend, nt `[{"timestamp": ..., "price": ...}, ...]`.

**Tagastus:** **uute** kirjete arv täisarvuna; ei tagasta kogu tabeli suurust.

```sql
INSERT OR IGNORE INTO electricity_prices (timestamp, price)
VALUES (?, ?);
```

`executemany` lisab kogu loendi ühe ühenduse kaudu. `INSERT OR IGNORE` tähendab, et olemasoleva ajatempliga kirje jäetakse vahele. `db.total_changes` väärtuste vahe enne ja pärast päringut annab lisatud kirjete arvu. `db.commit()` kinnitab muudatused ning `finally` sulgeb ühenduse.

**Oluline nüanss:** olemasoleva ajatembli hinna *muutust* see funktsioon ei salvesta – konfliktis kirje jäetakse teadlikult alles. Kui Elering parandaks ajaloolist hinda, vajaks selle ajakohastamine `UPDATE` või `ON CONFLICT DO UPDATE` lahendust.

### `loe_paev(paev)`

**Sisend:** `date` objekt või ISO-kuupäevatekst.

**Tagastus:** ajatembli järgi kasvavalt järjestatud sõnastike loend. Kui hinnakirjeid pole, tagastatakse tühi loend; selle funktsiooni sees päevapikkust ei kontrollita.

Päeva algus ja lõpp leitakse `paeva_piirid(paev)` abil. Kood kasutab parameetritega SQL-i:

```sql
SELECT timestamp, price
FROM electricity_prices
WHERE timestamp >= ? AND timestamp < ?
ORDER BY timestamp;
```

Ajavahemik `[algus, lopp)` on oluline, sest järgmise päeva täpselt kell 00:00 algav hind ei tohi käesolevasse päeva sattuda. SQL-i küsimärgid seovad väärtused parameetritena ega pane kuupäeva otse SQL-stringi sisse.

Tulemus teisendatakse kujule:

```python
[
    {"timestamp": aeg, "price": hind}
    for aeg, hind in read
]
```

### `statistika()`

```sql
SELECT COUNT(*), MAX(timestamp)
FROM electricity_prices;
```

Tagastab `(kirjete_arv, uusim_timestamp)`; kui tabel on tühi, on uusim ajatempel `None`. Seda kasutavad käsureatööriista seisuteated ja esmakäivituse loogika.

### `saadaval_paevad()`

See on üks mängu jaoks olulisimaid funktsioone, sest mitte iga andmebaasis esinev kuupäev ei ole mängukõlblik.

1. Loeb *kõik* olemasolevad ajatemplid järjestatult.
2. Teisendab iga ajatembli Eesti kohalikuks kuupäevaks: `datetime.fromtimestamp(aeg, EESTI_AEG).date()`.
3. Rühmitab ajatemplid Pythonis kuupäevade kaupa.
4. Arvutab iga päeva eeldatavad ajatemplid sammuga 900 sekundit.
5. Lubab ainult päevad, kus oodatud kirjete arv on **96** ja tegelikud ajatemplid langevad täpselt oodatud järjestusega kokku.
6. Tagastab sobivate päevade kuupäevad ISO-tekstina **sorteeritult**.

Kui ühe päeva kirjed on näiteks järjend `[00:00, 00:15, 00:45, ...]` ja 00:30 puudub, siis see päev ei sobi, isegi kui mõni teine timestamp suurendaks kirjete arvu 96-ni. Kontrollitakse täpset järjestust ja väärtusi.

## 4. Päringute ja ühenduste eluiga

Iga funktsioon avab uue SQLite'i ühenduse ning sulgeb selle `finally` plokis. Selline lahendus hoiab funktsioonid lihtsana ja väldib sama ühenduse jagamist paralleelsete HTTP-päringute vahel. SQL-ühenduse elutsükkel on lühike:

```text
Funktsioon kutsutakse → yhenda() → SQL → tulemus → close()
```

Kirjete lisamisel kasutatakse `commit()`; tavaliste SELECT-päringute puhul seda tarvis ei ole. Andmebaasifail püsib kettal ja säilib Python-protsessi sulgemisel.

## 5. Näited tööriista kasutamisest

```powershell
# Üks ajalooline päev
python -m tools.sync_prices day 2025-10-02

# Kogu ajaloo puuduvad päevad
python -m tools.sync_prices backfill

# Andmebaasi seis
python -m tools.sync_prices status
```

Nendes käskudes tähendab `backfill` ajalooliste andmete täitmist ja `status` tabeli üldiseisu kuvamist. Avalikus hoidlas SQLite'i andmebaasifaili ei eeldata, mistõttu tuleb selle sisu kohapeal luua.

## 6. Andmetervikluse reeglid

- Ajatemplid on unikaalsed: primaarvõti.
- Hinnaväärtus ei tohi olla SQL `NULL`: `NOT NULL`.
- Terve mängupäev peab sisaldama täpselt 96 ootuspärase ajatempliga kirjet.
- Kui päev pole täielik, ei saa `trading.py` seda mängupäevana avada (`ManguViga`).
- Kellakeeramise eripäevad filtreeritakse välja, sest selles mängumudelis eeldatakse 96 perioodi.

## 7. Piirangud ja võimalikud parandused

Praegune SQLite'i skeem on sihilikult väike. Näiteks puuduvad `source`, `region`, `last_updated`, hinna algse täpsuse ja salvestamishetke metaandmed. `saadaval_paevad()` loeb kõik ajatemplid Pythonisse; väikese õppemängu jaoks on see lihtne, kuid väga suure hinnabaasi korral võiks seda tulevikus optimeerida.

**Tähtis eristus:** SQLite'i andmebaas on püsiv; `gridrush/trading.py` mänguseanss praegu ei ole. Mängija raha ja akut ei saa serveri restardi järel üksnes hinnatabeli põhjal taastada.

Seotud: [Eleringi andmed](02-eleringi-api-ja-andmed.md), [kauplemisloogika](05-kauplemisloogika.md).
