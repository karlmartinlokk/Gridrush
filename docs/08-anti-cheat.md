# 08. Anti-cheat: tulevaste hindade serveripoolne peitmine

## 1. Probleem, mida lahendus väldib

Ajaloolise elektrihinnagraafiku puhul on lihtne viga laadida brauserisse **kõik 96 elektrihinda korraga** ja peita tulevased punktid ainult graafiku joonistuses. Siis saab mängija avada DevTools → Network ja näha juba serverist saadetud tulevasi hindu, isegi kui graafik neid ei näita.

Gridrushi anti-cheat'i muudatus tõi selle otsuse serverisse. Kõik 96 hinda jäävad `Kauplemismang.hinnad` loendisse serveris. Brauserile antakse elektrihind ainult nende indeksite kohta, mille aeg on **serveri enda kella järgi juba saabunud**.

## 2. Usalduspiir

```text
USALDATUD SERVER
  SQLite: kogu ajaloolise päeva hindade jada
       ↓
  Kauplemismang: autoriteetne aeg, indeksi arvutus, tehingute tulemus
       ↓
  hinnad_nahtavad(): tulevased price-väljad asendatakse nulliga
       ↓ JSON üle võrgu
MITTEUSALDATUD BRAUSER
  chart.js: kuvab ainult saadetud hinnad
  trading.js: saadab kasutaja ostu/müügi kavatsuse, mitte hinda
```

**Server ei usalda brauseri hinnaperioodi indeksit, kella ega tehinguhinda.** Brauser võib soovida uut hinda, kuid server otsustab, kas see hind on juba avaldatav.

## 3. `hinnad_nahtavad()` tegelik loogika

Meetod asub `gridrush/game.py` klassis `Kauplemismang`. See võtab `self.lukk` luku, kontrollib mängu olemasolu, värskendab `_uuenda_kell()` kaudu serveri aega ja koostab loendi:

```python
{
    "timestamp": hind["timestamp"],
    "price": hind["price"] if i <= self.indeks else None
}
```

Tagastuse üldkuju:

```json
{
  "date": "2025-10-02",
  "total": 96,
  "index": 0,
  "unit": "EUR/MWh",
  "prices": [
    {"timestamp": 1759352400, "price": 57.42},
    {"timestamp": 1759353300, "price": null},
    {"timestamp": 1759354200, "price": null}
  ]
}
```

**Näide on lühendatud ja arvväärtused näitlikud.** Tegelik loend sisaldab 96 elementi. Ajatemplid on teada kogu päeva kohta, kuid väärtus `price` jääb tulevikus `null`-iks. Kui `index = 10`, võivad indeksid 0–10 sisaldada arvu ja indeksid 11–95 peavad jääma `null`-iks.

## 4. API käitumine – `GET /api/demo/prices`

Serveri `tools/dev_server.py` teeb järgmised sammud:

1. Loeb brauseri `gridrush_session` küpsise ja leiab vastava mängu.
2. Kui seanssi ei leitud, tagastab **HTTP 403** veateatega `Mäng pole alustatud.`.
3. Kutsub `mang.hinnad_nahtavad()`; meetod ei võta vastu brauseri soovitud kuupäeva ega hinnaindeksit.
4. Saadab JSON-vastuse päisega `Cache-Control: no-store`.
5. Kui mängumeetod annab `ManguViga`, tagastatakse **HTTP 400**.

See tähendab, et järjestikused kiired `GET`-päringud ei muuda mänguindeksit ise: kui serveri ajaperiood pole muutunud, on lubatud hindade hulk endine.

## 5. Vana API eemaldamine

Varasem `public_html/cgi-bin/get_prices.py` võimaldas saada kogu valitud päeva hinnaloendi. See fail on praegusest hoidlast eemaldatud ja `dev_server.py` ei suuna enam selle aadressi eraldi hinnapäringuna. Kohaliku serveri staatiliste failide teeninduselt saab vana aadress nüüd **404**, mitte eelneva ajutise blokeerimislahenduse **403**.

Oluline on, et teine avalik teekond ei hakkaks sama andmestikku uuesti väljastama. Uute API-de lisamisel tuleb kontrollida, et ükski mängu jaoks kasutatav endpoint ei tagastaks tulevase perioodi hinda enne õigel ajal avaldamist.

## 6. `chart.js` kontrollid

Brauseri `kysiNahtavadHinnad()` valideerib serveri JSON-vastuse:

- `total === 96` ja `prices.length === 96`;
- `index` on täisarv 0–95;
- ajatemplid on lõplikud arvud;
- juba avanenud indeksite hinnad on lõplikud arvud;
- iga tulevase indeksi `price` on **täpselt** `null`.

`uuendaNahtavaidHindu()` värskendab graafikut ainult siis, kui vastuse päev ja päringu versioon vastavad hetkel aktiivsele graafikule. See väldib hilinenud võrgupäringu vastuse kandmist juba vahetunud päeva graafikule.

`chart.data.datasets[0].data` pannakse kokku nii, et nähtavad indeksid saavad numbrilise väärtuse, tulevased jäävad `null`-iks. `kuvaSeis()` kontrollib eraldi, et praegune hind oleks arv.

## 7. Tehingu hinna sõltumatus brauserist

Teine pool anti-cheat'ist ei ole hinna peitmine, vaid serveripoolne kauplemine. Brauser saadab ostu või müügi puhul näiteks:

```json
{"action": "buy", "quantity": 1.5}
```

Server ise kutsub `tehing(...)`, uuendab oma kella ja loeb hinna `self.hinnad[self.indeks]["price"]`. Brauseri URL-ile lisatud `index=95` või JavaScriptis muudetud nähtav hind ei ole sisendiks, mida server tehingu hinna arvutamisel kasutaks.

## 8. Mis on tegelikult kaitstud?

| Ründevõte või olukord | Praeguse lahenduse mõju |
|---|---|
| DevTools Network → vaata `/api/demo/prices` | Tulevased väärtused on `null` |
| Korda `/api/demo/prices` päringut tuhat korda | Indeks sõltub serveri ajast, mitte päringute arvust |
| Muuda brauseri arvuti kellaaega | Serveri monotonic-kella arvutus sellest ei sõltu |
| Muuda brauseris näidatavat hinda | Server arvutab tehingu hinna ise |
| Päringu parameetrina saada tulevane indeks | API ei kasuta sellist parameetrit |
| Otsi sama ajaloolist hinda välisest allikast | **Ei ole takistatud** |
| Mängi sama päev 5× kiirusega läbi ja tee Reset | **Ei ole takistatud** |
| Ava sama päev teises brauseriseansis | **Ei ole takistatud** |

## 9. Teadlikud piirangud ja tulevased otsused

### Ajaloolised hinnad on avalikud

Eleringi hinnad on ajaloolised avalikud andmed. Kui mängija teab päeva, võib ta teoreetiliselt leida kogu hinnajada väljastpoolt mängu. Anti-cheat **ei saa muuta avalikke ajaloolisi andmeid saladuseks**; see kaitseb eeskätt Gridrushi enda API-t.

### Kuupäevavalik ja Reset

Praeguses koodis on käsitsi kuupäevavalik ja Reset. Meeskonna kokkuleppe järgi on plaan käsitsi kuupäevavalik enne veebisaidi avalikule serverile viimist eemaldada ning Reset'i lõplik käitumine otsustada hiljem. Isegi kui kuupäevavaliku HTML-element eemaldatakse, tuleb kuupäeva valimise õigus vajaduse korral keelata **serveri `/api/demo/start` teekonnas**. Vastasel juhul saab seda jätkuvalt käsitsi HTTP-päringuga proovida.

### Eraldi seansid ja suurem kiirus

Kasutaja võib ühes seansis mängida päeva kiiremini või kasutada mitut seanssi. Selle vältimine eeldaks eraldi võistlusreegleid: sama päevaga korduvmängu piiranguid, kasutaja identiteeti või serveri poolt ühtselt määratud vooru. Need ei kuulu käesoleva anti-cheat teostuse hulka.

### Kohaliku serveri mälupõhine olek

Seansid ja mängukell ei ole püsivalt salvestatud. Avalik tootmiskeskkond vajab kestvat serveriprotsessi või sobivat püsisalvestuse lahendust; staatiline HTML ja üksikute CGI päringute protsessid ei taga sama mälus hoitavat mänguolekut.

## 10. Soovituslikud testjuhtumid

1. **Uus seanss:** alusta mängu, küsi `/api/demo/prices`; kinnita `index=0`, esimene hind on arv ja ülejäänud 95 on `null`.
2. **Aja möödumine:** oota ühe mänguperioodi jagu, küsi uuesti; kontrolli, et nähtav indeks kasvab ja lubatud hinnad avanevad.
3. **Kiirpäringud:** saada mitu päringut järjest; kontrolli, et uus hind ei avane enne serveri aega.
4. **Paus:** pane mäng pausile; oota; kontrolli, et `index` ei kasva.
5. **Kiiruse muutmine:** proovi 0.5×, 1×, 2× ja 5× ning kontrolli, et avamine järgib serveri uut aega.
6. **Kauplemine:** tee tehing vahetult hinnaperioodi üleminekul; kinnita, et serveri tagastatud `price` on see, millega konto muutus arvutati.
7. **Puuduv seanss:** ava `/api/demo/prices` ilma küpsiseta; oota 403.
8. **Vana API:** ava `/cgi-bin/get_prices.py?date=2025-10-02`; kontrolli, et see ei anna tervet hinnajada.
9. **Reset / uus päev:** kontrolli, et graafik ei jäta vana mängu tulevasi hindu mällu ja uus päev alustab avatud hinnaga.
10. **Võrguviga:** katkesta korraks hinnapäring; kontrolli, et järgmise sammu ajal proovib brauser uuesti ega jäta serverit üksinda edasi liikuma.

## 11. Kokkuvõte

Selle muudatuse põhiline turvareegel on: **server teab kogu päeva, brauser näeb ainult juba saabunud hindu**. Sama server määrab ka tehingu hinna. See on vajalik alus ausamale elektrihinnamängule, kuid ajalooliste hindade väliste allikate, korduvmängu ja mitme seansi piirangud nõuavad eraldi mängureeglite otsuseid.

Seotud: [server](04-server-ja-manguseansid.md), [mängukell](06-serveripohine-mangukell.md), [frontend](07-hinnagraafik-ja-frontend.md).
