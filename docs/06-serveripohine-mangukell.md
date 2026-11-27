# 06. Serveripõhine mängukell ja päevavahetus

## 1. Miks mängukell on serveris?

Elektrihindade mängus on ajahetk osa mängureeglitest: see määrab, milline hind on tehingu ajal kehtiv ja millised hinnad tohib graafikul avaldada. Kui brauser saaks ise öelda, et järgmine hinnaperiood on kätte jõudnud, oleks võimalik mängukella kiirendades hinnajadas ette liikuda. Seetõttu arvutab **tegeliku mänguaja ja indeksi Python**; JavaScript kasutab serveri aega ainult visuaalseks sünkroonimiseks.

Serveri mängukella loogika on klassis `gridrush/game.py::Kauplemismang`. Brauseripoolne vastavus on `public_html/js/chart.js` funktsioonides `synkroniseeriKell`, `praeguneManguaeg` ja `lisaPunkt`.

## 2. Ajamudeli konstandid

```python
PAEVA_PIKKUS = 180.0
PERIOODI_PIKKUS = PAEVA_PIKKUS / 96
LUBATUD_KIIRUSED = (0.5, 1.0, 2.0, 5.0)
```

Ühe mängupäeva 96 hinnaperioodi on aja mõttes tihendatud 180 **mängusekundi** sisse. 1× kiirusel on ühe hinnaperioodi kestus `180 / 96 = 1.875` päriselu sekundit. Ajaloolistes andmetes vastab üks periood 15 päriselu minutile, kuid mängus liigub ajajoon tahtlikult kiiremini.

| Kiirus | Päeva ligikaudne päriselu kestus | Ühe hinnaperioodi kestus |
|---|---:|---:|
| `0.5×` | 360 sekundit (6 min) | 3,75 s |
| `1×` | 180 sekundit (3 min) | 1,875 s |
| `2×` | 90 sekundit (1,5 min) | 0,9375 s |
| `5×` | 36 sekundit | 0,375 s |

Need kestused on **ideaaltingimustes**; API, brauseri ajastamine või süsteemi koormus võib kuvatava punkti värskendamist viivitada, kuid serveri kell mõõdab tegelikult möödunud aega.

## 3. Serveri kella väljad

| Väli | Kirjeldus |
|---|---|
| `mangitud_sekundid` | Juba kogunenud mängusekundid, maksimaalselt 180 |
| `viimane_kell` | Eelmise mõõtmise `time.monotonic()` ajatempel või `None` |
| `kaib` | Kas mängukell liigub |
| `paev_labi` | Kas mängupäeva lõpp on saavutatud |
| `kiirus` | Mänguaja kulgemise kordaja |
| `indeks` | Praegu kehtiva 15-minutilise elektrihinnaperioodi positsioon 0–95 |

**Miks `time.monotonic()`?** Operatsioonisüsteemi seinakella manuaalne muutmine või aja korrigeerimine ei tohiks muuta möödunud aja mõõtmist. Monotoonne kell on mõeldud kestuste mõõtmiseks, mitte kuupäeva esitamiseks. Väärtus kehtib sama protsessi eluea kontekstis ja seda ei saa lihtsalt salvestada universaalse ajatemplina.

## 4. `_uuenda_kell()` üksikasjalikult

Kella uuendamise pseudokood vastab lähtekoodi loogikale:

```text
kui kell on pausil:
    tagasta, midagi ei muuda

praegu = monotonic()
kui varasem mõõtmine eksisteerib:
    vahe = max(0, praegu - viimane_kell)
    mangitud_sekundid += vahe * kiirus

viimane_kell = praegu
kui mangitud_sekundid >= 180:
    mangitud_sekundid = 180
    paev_labi = True
    kaib = False
    viimane_kell = None

indeks = min(len(hinnad) - 1, int(mangitud_sekundid / 1.875))
```

See algoritm teeb hinnaperioodi indeksi **ainult serveris**. `int` võtab positiivse aja korral täisosa: vahemikus 0–1,875 on indeks 0, vahemikus 1,875–3,75 indeks 1 ja nii edasi. Viimasel piirhetkel väldib `min(..., 95)` indeksit 96, mida massiivis pole.

**Kella uuendamine ei toimu omaette pidevas taustatsüklis.** Mänguaeg liigub kontseptuaalselt kogu aeg, kuid `mangitud_sekundid` ja `indeks` arvutatakse värskeks siis, kui serverimeetod `_uuenda_kell()` välja kutsub – näiteks seisupäringu, hinnapäringu, tehingu või pause/resume tegevuse ajal.

## 5. Käivitamine, paus ja jätkamine

### `jatka()`

Võtab mänguluku, kontrollib, kas mäng on alustatud, uuendab senist aega ja välistab lõpetatud päeva. Kui kell ei käi, seab `viimane_kell = time.monotonic()` ja `kaib = True`. Teistkordne `jatka()` juba käiva kella korral ei käivita seda nullist.

### `peata()`

Enne peatamist kutsutakse `_uuenda_kell()`, et viimase mõõtmise ja pausivajutuse vaheline aeg arvestusse läheks. Seejärel määratakse `kaib = False`, `viimane_kell = None` ning tagastatakse seis. Pausi ajal jääb hinnaperiood samaks. Kood lubab **pausil hinnaga kaupleda** – see on praegu rakendatud mängureegel.

### `muuda_kiirust(kiirus)`

Lubatud väärtused on täpselt `0.5`, `1`, `2` ja `5` (Pythoni `int` või `float`). Muutmise ajal tehakse esmalt `_uuenda_kell()` **vana** kiirusega ja alles seejärel salvestatakse uus kordaja. Nii ei rakendata uut kiirust ekslikult juba möödunud ajale.

Näide: kui kell käis 10 sekundit 1× kiirusega, on mänguaega kulunud 10 sekundit. Kui mängija valib 2×, ei muutu need 10 sekundit tagantjärele 20-ks; edasi lisandub 2 mängusekundit iga päriselu sekundi kohta.

## 6. Päeva lõpp

Kui kogunenud aeg jõuab 180-ni, seab server `paev_labi = True`, `kaib = False` ja `viimane_kell = None`. Serveri tehingumeetod tõrjub seejärel tehinguid veaga `Päev on lõppenud. Alusta uut päeva.`

Brauseris käivitab `chart.js` funktsioon `kinnitaPaevaLopp()` eraldi seisupäringu. Selle mõte on vältida olukorda, kus brauser näitab mängupäeva lõppenuna, kuigi server pole veel sama piiri saavutanud. Alles serveri `day_finished` kinnitusel avatakse päeva lõpu dialoog.

Lõpu eel proovib brauser lisaks laadida viimased avanenud hinnad; selle võrguvea korral ei takistata päeva lõpetamist.

## 7. Järgmise päeva valimine – `uus_paev()`

Selle meetodi käivitamise eeldus on `paev_labi = True`. Seejärel:

1. Hangitakse `saadaval_paevad()` abil sorteeritud sobivate päevade nimekiri.
2. Valitakse esimene päev, mille ISO-kuupäev on praegusest suurem; kui enam suuremat pole, võetakse esimene saadaval päev.
3. Laetakse ja kontrollitakse uue päeva 96 hinda `_loe_taispaev` kaudu.
4. Nullitakse `indeks`, `mangitud_sekundid`, `viimane_kell`, `kaib` ja `paev_labi`.
5. Suurendatakse `paevade_arv` väärtust ühe võrra.
6. **Raha, aku energia ja mängukiirus säilivad.**

Kasutajaliides laeb pärast seda uue päeva graafiku ja käivitab serveri kella uuesti. Päevade valiku algoritm on praegu **kronoloogiline**, mitte hinna amplituudi alusel sarnaste päevade valik.

## 8. Brauseripoolne kella sünkroniseerimine

`chart.js` ei küsi serverilt iga animatsioonikaadri jaoks uut kella. Funktsioon `synkroniseeriKell(seis)` salvestab serveri väljad `elapsed_seconds`, `speed`, `running` ja kohaliku `performance.now()` lähtepunkti. Funktsioon `praeguneManguaeg()` lisab sellele brauseris möödunud aja ja piirab tulemuse 180-ga.

See on **kuvamise hinnang**, mitte serveri autoriteetne kell. Kui brauser hindab, et uus indeks on kätte jõudnud, küsib ta `GET /api/demo/prices`; server ütleb, milline indeks ja hind on tegelikult lubatud.

```text
Serveri seis (elapsed_seconds, speed, running)
      ▼
Brauseri performance.now() vahe
      ▼
Eeldatav praegune hinnaperiood
      ▼
GET /api/demo/prices
      ▼
Server kontrollib aega uuesti ja väljastab ainult lubatud hinnad
```

## 9. Probleemid, mida see lahendus väldib

- Brauseri tavalise kella muutmine ei muuda serveris lubatud hinda.
- Brauser ei saa otsustada hinnapunkti indeksit pelgalt `/trade` parameetri abil.
- Paus ja kiirus on serveri olek, mitte ainult graafiku kujundus.
- Kaks sama seansi päringut ei muuda mänguseisu kontrollimata, sest mängumeetodid kasutavad lukku.

## 10. Piirangud

Mängukell ei säili serveri restardi korral, sest selle seis on mälus. Brauseri lokaalne ajahinnang võib võrguviivituse tõttu serveriga hetkeks erineda; tegelik tehinguhind määratakse alati uuendatud serverikella järgi. Kuna mängijad võivad praegu kasutada eri seansse ja ajaloolisi kuupäevi, ei ole serveripõhine kell üksi täielik kaitse ajalooliste hindade väljastpoolt õppimise vastu.

Seotud: [kauplemisloogika](05-kauplemisloogika.md), [hinnagraafik](07-hinnagraafik-ja-frontend.md), [anti-cheat](08-anti-cheat.md).
