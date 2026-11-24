# 07. Hinnagraafik ja kauplemise veebiliides

## 1. Failide rollid

Veebipoole peamised failid on `public_html/index.html`, `public_html/js/chart.js` ja `public_html/js/trading.js`. Graafik teostatakse välise **Chart.js** teegi abil. HTML sisaldab nuppe ja elemente, JavaScript loeb neid `id` või CSS-klassi järgi ning muudab sisu serverilt saadud mänguseisu põhjal.

`chart.js` vastutab hinnagraafiku, kiiruse, Play/Pause'i, Reset'i, päeva lõpu dialoogi ja hinnapäringute eest. `trading.js` vastutab tehingukoguse, raha, aku, tehingusõnumite ja serverisse POST-päringute saatmise eest. Need kaks faili suhtlevad `window.kauplemine` objekti ja `window.synkroniseeriManguseis` funktsiooni kaudu.

## 2. HTML-i tähtsad elemendid

| Element | Eesmärk |
|---|---|
| `#priceChart` | Chart.js joongraafiku `<canvas>` |
| `#graph-message-time` | Nähtava perioodi Eesti kellaaeg |
| `#graph-message-price` | Praegune hind ja selle tõusu/languse värv |
| `#stats` | Seni nähtud hindade min, max ja keskmine |
| `#date`, `#load` | Praeguse arendusversiooni käsitsi kuupäevavalik |
| `#play-pause`, `#reset` | Mängu juhtimine |
| `.speed-buttons button` | Kiiruse valikud 0.5×, 1×, 2×, 5× |
| `#day-count` | Järjestikuse mängupäeva number |
| `.battery-buy-button`, `.battery-sell-button` | Osta ja müü tehingu käivitamine |
| `.target-step-button`, `.target-amount` | Ostetava/müüdava koguse valimine MWh-des |
| `.target-value` | Tehingu summa või hõljumisel rahalise muutuse eelvaade |
| `.ri-money-sum`, `.battery-percent`, `.battery-capacity` | Rahajääk, aku täituvus ja salvestatud MWh |
| `#day-end-dialog` | Päeva lõpu kokkuvõte ja uue päeva nupp |
| `.event-container` | Kasutajale kuvatavad sündmused ja veateated |

Kuupäevavalik on **praeguses koodis olemas**. Kui see enne avalikku juurutamist eemaldatakse, tuleb muuta ka vastavad JavaScripti viited ja kuupäeva lubamine serveri `/start` API-s.

## 3. `chart.js` peamised olekumuutujad

| Muutuja | Tähendus |
|---|---|
| `chart` | Chart.js instants või `null` |
| `hinnad` | 96 elemendiga hinnaloend; tulevaste hindade väärtused `null` |
| `hetkeIndeks` | Viimati serverilt kinnitatud nähtav hinnapunkt |
| `graafikuPaev` | Brauseris laetud kuupäev |
| `serveriSeis` | Viimane serveri mänguseis |
| `kellaKinnitus`, `kellaKinnituseAeg` | Serveri kella lähteandmed ja brauseri `performance.now()` hetkeväärtus |
| `taimer` | `setInterval` ID või `null`, mille järgi juhitakse Play/Pause'i |
| `hindadeParing` | Pooleliolev hinnapäringu `Promise`, et vältida samal ajal mitut päringut |
| `paringuNumber` | Päringute versiooninumber vananenud vastuste välistamiseks |
| `nahtudIndeksid` | Animeeritud punktide identifikaatorite `Set`, et animatsioon ei lähtestuks juhuslikult |
| `kaivitamine`, `laadimine`, `sammKaib`, `paevLabi` | Erinevate asünkroonsete tegevuste ja päeva lõpu lipud |

## 4. Graafiku laadimine – `laadiGraafik({ sailitaMang = false })`

Funktsioonil on kaks erinevat kasutusviisi:

- `sailitaMang = false` tähendab käsitsi kuupäeva valimist: serveris alustatakse **uus mäng** ning raha/aku lähtestatakse.
- `sailitaMang = true` tähendab käimasoleva mängu jaoks õige päeva hindade uuesti laadimist **ilma mängu uuesti alustamata**; seda kasutatakse näiteks lehe taastamisel ja päevavahetusel.

Laadimise etapid:

1. Välditakse samaaegset laadimist; väljalülitamisel peatatakse vajaduse korral vana graafik.
2. `paringuNumber` abil märgitakse aktiivne päringuversioon.
3. Eelmine Chart.js instants hävitatakse (`chart.destroy()`), et graafikut mitte üle vana joonistada.
4. Vajadusel saadetakse uue mängu alustamise päring.
5. Kutsutakse `kysiNahtavadHinnad()`, mis loeb `/api/demo/prices` vastuse.
6. Kontrollitakse, et serveri päeva kuupäev sobib kasutajaliidesega.
7. Uue `Chart` objekti X-telje sildid koostatakse ajatemplite põhjal; Y-andmed sisaldavad üksnes avanenud hindu.
8. `kuvaSeis()` uuendab graafikut ja nähtavat statistikat.
9. Vea korral näidatakse kasutajale veateade ning graafik eemaldatakse, et mitte näidata eksitavat seisundit.

## 5. Serveri hinnavastuse kontroll – `kysiNahtavadHinnad()`

Kasutatakse:

```javascript
fetch('/api/demo/prices', { cache: 'no-store' })
```

Kood nõuab, et:

- `date` oleks string;
- `total` oleks 96 ja `prices.length` samuti 96;
- `index` oleks täisarv 0–95;
- igal hinnapunktil oleks lõplik arvuline `timestamp`;
- **avamenud** indeksitel oleks lõplik arvuline `price`;
- **tulevastel** indeksitel oleks `price === null`.

Kui üks neist tingimustest ei kehti, visatakse erind `Server tagastas vigased hinnaandmed.` See on brauseripoolne andmeleping, mis aitab vältida vigase vastuse tõttu vale graafiku joonistamist.

## 6. Hindade värskendamine – `uuendaNahtavaidHindu()`

Funktsioon väldib päringut, kui graafikut veel ei ole või laadimine juba käib. Kui hinnapäring on pooleli, ootab see olemasolevat `Promise`'i. Vastasel korral salvestab oodatava kuupäeva ja päringu versiooni, pärib serverilt nähtavad hinnad ning kontrollib enne nende rakendamist, et mängupäev pole vahepeal vahetunud.

Kui vastus on sobiv, uuendatakse `hinnad`, `hetkeIndeks` ja Chart.js andmemassiiv. Uue indeksi hind kuvatakse, tulevased väärtused jäävad `null`-iks. `kuvaSeis()` arvutab nähtud hindadest statistika.

Sama lubatud hinna jaoks korduvate päringute tegemine ei avalda järgmisi hindu, sest lubatud indeks arvutatakse alati **serveris**.

## 7. Kohalik graafikukell – `lisaPunkt()`

`lisaPunkt` loeb brauseris arvutatud mänguaja `praeguneManguaeg()` kaudu ja võrdleb eeldatavat hinnaperioodi `hetkeIndeks` väärtusega. Kui aeg on edasi liikunud, küsitakse serverilt uued lubatud hinnad. Kui päring ebaõnnestub, näidatakse viga ning **järgmisel sammul proovitakse uuesti**. Kohalikku taimerit hinnapäringu vea tõttu enam ei peatata – see väldib brauseri ja serveri kellade lahknemist.

Kui kohaliku arvestuse järgi on 180 mängusekundit täis, kutsutakse `kinnitaPaevaLopp()`, mis kontrollib lõppu serverilt. Graafiku joonistamise intervall on tavakiirusel `180000 / 96` millisekundit ning muutub `kiirus` kordaja järgi.

## 8. `kuvaSeis()` ja graafiku animatsioon

Funktsioon `kuvaSeis()` kontrollib, et praegusel indeksil oleks olemas arvuline hind; tulevast `null`-hinda ei kuvata. Seejärel kirjutab praeguse hinna graafikule, kutsub `chart.update()` ning arvutab **ainult seni avatud hindade** miinimumi, maksimumi ja aritmeetilise keskmise.

Praegust hinda võrreldakse eelneva perioodiga, et näidata `Tõuseb`, `Langeb` või `Stabiilne` trendi. Kellaaja tekst arvutatakse Unixi ajatemplist `Europe/Tallinn` ajavööndis.

Chart.js animatsioon kestab X/Y liikumisel 300 ms. Abifunktsioon `indeksiVahe(context, axis)` proovib uue punkti liikumise alguskoordinaadi võtta eelmiselt punktilt. `nahtudIndeksid` Set väldib sama animatsiooni uuesti alustamist iga kasutajaliidese värskenduse korral. Graafiku uuestilaadimisel see Set tühjendatakse.

## 9. `trading.js` – tehingud ja nupud

### `kuvaKauplemine()`

Loeb `manguseis` ja `kogus` väärtusi ning uuendab rahajääki, aku protsenti, MWh teksti, kasumiprotsenti ja tehingunuppude lubatavust. Aku SVG täite ristküliku laius arvutatakse energia suhtena mahutavusse. Ostunupp keelatakse, kui pole ruumi või raha; müüginupp keelatakse, kui akus pole piisavalt energiat või negatiivse hinna müük viiks rahajäägi lubamatult alla nulli. Need on kasutajaliidese kontrollid – server kontrollib reegleid samuti.

### `kauplemiseAPI(aadress, andmed = {})`

Koostab JSON POST-päringu, keelab paralleelsed tehingud `paringKaib` kaudu, loeb JSON-vastuse ning salvestab serveri kinnitatud mänguseisu. Kui tegemist oli `/api/demo/trade` päringuga, kutsub see `window.synkroniseeriManguseis(tulemus)`, et graafik saaks hinnaperioodi serveriga kooskõlla viia. `finally` taastab kasutajaliidese nupud sõltumata päringu tulemusest.

### `taastaKauplemine()`

Saadab `GET /api/demo/state`, et taastada serveris olev mänguseis. Kui server vastab `active: false`, muudetakse kohalik `manguseis = null`. Seega ei kasutata brauseri varasemat infot mängu autoriteetse seisuna.

### `teeTehing(tegevus)`

Saadab valitud tegevuse (`buy` või `sell`) ning koguse `quantity` väljana. Edu korral kuvatakse serveri `message` ja ajutine aku laadimise/tühjendamise CSS-animatsioon; vea korral ilmub `.event-container` alale veateade.

### Koguse valimine ja summa eelvaade

`.target-step-button` elementide `data-step` väärtused on `-10`, `-0.5`, `+0.5`, `+10`. Frontend piirab valitavat kogust vähemalt 0,5 MWh-ni ning kõige rohkem aku maksimaalse mahuni. Kui kasutaja viib hiire ostu- või müüginupule, arvutab UI `kogus * s.price` põhjal tehingu **eelvaate** koos märgi ja värviga; tegelik tulemus arvutatakse tehingu sooritamisel serveris, mistõttu hind võib vahepeal muutuda.

### `window.kauplemine` avalik liides

See objekt võimaldab `chart.js`-il kauplemisloogikat välja kutsuda, ilma et viimane peaks teadma iga HTTP-päringu detaile. Olulised liikmed on `aktiivne`, `toimetab`, `seis`, `taasta`, `alusta`, `jatka`, `peata`, `muudaKiirust`, `uusPaev`, `kuvaHind`, `nulli` ja `teata`.

`kuvaHind` uuendab ainult **brauseris kuvatavat** vara ja kasumit käesoleva nähtava hinnaga; see ei salvesta raha ega energiat serveris ning ei määra tehingute tegelikku hinda.

## 10. Lehe elutsükkel

- `load`: kutsutakse `alustaGraafik({ automaatne: true })`; olemasolev mäng taastatakse või luuakse uus.
- `pagehide`: salvestatakse Play/Pause soov `sessionStorage`-isse, peatatakse kohalik taimer ja püütakse `navigator.sendBeacon` abil serverile pausipäring saata. Selle päringu kohalejõudmine pole garanteeritud.
- `pageshow` koos `event.persisted = true`: brauseri Back/Forward Cache'ist naasmisel taastatakse seis serverist uuesti.

## 11. Piirangud

Veebiliides ei ole turvapiir: DevToolsis saab JavaScripti muuta, kuid serveri raha, aku, hinnaperioodi ja lubatud hindade kontroll jääb serveri ülesandeks. Graafik sõltub Chart.js teegist; ilma selleta ei looda graafikuobjekti. Käsitsi kuupäevavalik ja Reset on käesolevas versioonis olemas; nende hilisem eemaldamine eeldab kooskõlalisi muudatusi HTML-is, JavaScriptis ja API-s.

Seotud: [mängukell](06-serveripohine-mangukell.md), [server](04-server-ja-manguseansid.md), [anti-cheat](08-anti-cheat.md).
