# 01. Gridrushi süsteemi ülesehitus

## 1. Eesmärk ja kasutaja vaade

Gridrush on elektrihindadel põhinev kauplemismäng. Mängija jälgib hinnagraafikut ja otsustab, millal **osta** elektrit, salvestada see **akusse** ning hiljem **müüa**. Kauplemine on simuleeritud; kasutaja päris raha ega elektrit ei liiguta. Hetkel kirjeldatav mäng kasutab andmebaasi kogutud **ajaloolisi Eesti elektrihindu**.

Oluline arhitektuuriline otsus on eraldada hindade toorandmed, mängureeglid ja kasutajaliides. Ajaloolised hinnad saab server täielikult lugeda, kuid brauserile tohib mängu ajal väljastada ainult juba avanenud perioodide hinnad. Mängija saab JavaScripti muuta, kuid serveris olev kontojääk ega mängukell ei tohiks selle tõttu muutuda.

## 2. Komponendid ja vastutus

| Fail või moodul | Vastutus | Kellega suhtleb? |
|---|---|---|
| `gridrush/fetch_day.py` | Küsib Eleringi hinnapäringuga andmed | Eleringi HTTPS API, `day_filter.py` |
| `gridrush/day_filter.py` | Määrab Eesti päeva ajapiirid ning normaliseerib hinnad | `fetch_day.py`, `db.py`, `game.py`, `sync_prices.py` |
| `gridrush/db.py` | Hoiab hinnad SQLite'i tabelis, loeb valitud päeva | `game.py`, `sync_prices.py` |
| `tools/sync_prices.py` | Laeb puuduvad päevad ja uuendab hinnabaasi | `db.py`, `fetch_day.py` |
| `gridrush/game.py` | Hoiab ühe mängija olekut ja otsustab tehingute tulemused | `db.py`, `day_filter.py`, server |
| `tools/dev_server.py` | Teenindab staatilisi faile ning mängu JSON API | `game.py`, brauser |
| `public_html/js/chart.js` | Joonistab graafiku ning juhib mänguaja kasutajaliidest | `/api/demo/prices`, `trading.js`, Chart.js |
| `public_html/js/trading.js` | Kuvab raha ja akut, saadab ostu-müügi päringud | `/api/demo/*`, `chart.js` |
| `public_html/index.html` ja CSS | Määravad kuvatavad elemendid ja nende kujunduse | `chart.js`, `trading.js` |

## 3. Terviklik andmevoog

```text
Eleringi avalik elektrihindade API
    │ HTTPS, JSON, Eesti hinnakirjed
    ⇓
gridrush/fetch_day.py
    │ aja- ja riigipõhine päring
    ⇓
gridrush/day_filter.py
    │ sorteeritud [{timestamp, price}, ...]
    ⇓
tools/sync_prices.py
    │ kontroll: täielikkus, duplikaadid
    ⇓
gridrush/db.py ── SQLite: data/gridrush.sqlite3
    │
    │ mängu alustamisel: sobiva päeva 96 hinda
    ⇓
gridrush/game.py ── ühe kasutaja mänguseis mälus
    │                   └─ raha, aku, kell, kiirus, hindade indeks
    ⇓
tools/dev_server.py ── HTTP JSON API ja seansiküpsis
    │
    ├── GET /api/demo/state     → praegune mänguseis
    ├── GET /api/demo/prices    → nähtud hinnad, ülejäänud null
    └── POST /api/demo/trade   → serveri kinnitatud tehing
    ⇓
Brauser: chart.js + trading.js + Chart.js
    └─ graafik, nupud, raha, aku ja teated
```

**Väga oluline** `tools/sync_prices.py` ja mänguserver on erinevad protsessid. Mänguserver ei too iga tehingu eel uusi elektrihindu internetist; hindade kogumine toimub eraldi tööriistaga ja mäng loeb need SQLite'ist.

## 4. Mängu elutsükkel

1. Andmebaasi kogutakse täielikud ajaloolised hinnapäevad.
2. Brauseri leht käivitub. `chart.js` küsib `trading.js` kaudu, kas brauseri küpsisele vastab olemasolev mäng.
3. Kui mängu pole, saadab kasutajaliides `/api/demo/start`. Server loob `Kauplemismang` objekti, valib sobiva päeva ning väljastab seansiküpsise.
4. `chart.js` küsib `/api/demo/prices`. Vastuses on 96 ajatemplit, aga ainult praeguseks avanenud hinnad; ülejäänud hinnaväärtused on `null`.
5. `/api/demo/resume` käivitab mängukella. `chart.js` arvutab serveri kella lähtepunktist eeldatava nähtava indeksi ja küsib uue hinna, kui ajaperiood vahetub.
6. Mängija teeb ostu või müügi. `trading.js` saadab `action` ja `quantity`; `game.py` kontrollib need serveris ja saadab kinnitatud uue seisu.
7. Kui 180 mängusekundit täitub, kinnitab brauser päeva lõpu serverilt. Päeva lõpu pop up aken võimaldab järgmise päeva alustamist.
8. `/api/demo/next-day` säilitab raha, aku ja kiiruse, kuid vahetab päeva ning nullib päevakella.

## 5. Süsteemi olulised tehnilised kokkulepped

- Andmevahetuseks kasutatakse JSON-i ja HTTP-meetodeid GET/POST.
- Elektrihindade ajatemplid on **Unixi sekundid UTC ajaskaalal**, Eesti kalendripäeva määramiseks kasutatakse `Europe/Tallinn` ajavööndit.
- Hindade andmebaas kasutab ühikut **€/MWh**. Mängu energiaühik on **MWh**, rahaühik **€**.
- Brauser ei saada tehingu hinda ega serveri hinnapunkti indeksit. Tehingu hind leitakse serveris.
- `gridrush/game.py` kasutab ühe mängu muutmiseks `threading.Lock` lukku; serveri seansside sõnastikul on eraldi lukk.
- Mängupäeva fikseeritud kestus ja 96 perioodi piiravad mängitavate päevade valikut. Aja ülemineku päevad ei kuulu tavapärasesse 96-perioodilisse hulka.