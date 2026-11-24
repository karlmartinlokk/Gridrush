# 05. Kauplemisloogika: raha, aku ja tehingud

## 1. Mooduli roll

`gridrush/trading.py` sisaldab klassi `Kauplemismang`, mis esindab **ühe kasutaja üht mänguseanssi**. Seda võib käsitleda serveripoolse mängu olekumasinana. Klass ei joonista graafikut ega võta otse vastu HTTP päringuid. Tema ülesanne on hoida mängija raha, aku täituvust, kuupäeva ja mängukella ning rakendada ostu-müügi reegleid.

HTTP-kihi `tools/dev_server.py` ülesanne on leida mänguobjekt ja kutsuda selle meetodeid; brauser kasutab `public_html/js/trading.js` kaudu samu toiminguid.

## 2. `Kauplemismang.__init__` algseadistus

| Väli | Algväärtus | Tähendus |
|---|---|---|
| `self.algsumma` | `1000.0` | Mängija algkapital eurodes |
| `self.raha` | algsumma | Hetke rahajääk eurodes |
| `self.energia` | `0` | Akus olev elektrienergia MWh-des |
| `self.aku_maht` | `10` | Aku maksimaalne maht MWh-des |
| `self.paev` | `None` | Käesolev mängupäev ISO-kuupäevana |
| `self.hinnad` | `[]` | Päeva 96 ajaloolist elektrihinda |
| `self.indeks` | `0` | Praegune hinnaperioodi indeks vahemikus 0–95 |
| `self.paevade_arv` | `0` | Mängitud päevade loendur |
| `self.mangitud_sekundid` | `0.0` | Jooksva mängupäeva möödunud mänguaeg |
| `self.kaib`, `self.paev_labi` | `False` | Käivitus- ja lõpuseis |
| `self.kiirus` | `1.0` | Mängukiiruse kordaja |
| `self.lukk` | `Lock()` | Kaitse sama mängu samaaegsete muudatuste eest |

**Esimene mängu alustamine:** `alusta()` valib päeva ja lähtestab algsummale. **Järgmise päeva alustamine:** `uus_paev()` säilitab raha ja energia; neid kahte toimingut ei tohi segi ajada.

## 3. Tehingu valideerimine – `tehing(tegevus, kogus)`

**Sisend:**

- `tegevus`: täpselt `"buy"` või `"sell"`;
- `kogus`: positiivne `int` või `float`, mille ühik on **MWh**.

**Väljund:** mänguseisu sõnastik koos täiendava väljaga `message`, näiteks `"Ostsid 0.5 MWh elektrit."`.

Enne tehingut kontrollitakse tegevust ja koguse tüüpi ning positiivsust. Seejärel võetakse mängu lukk, kontrollitakse mängu olemasolu, uuendatakse serveripõhist mängukella ja välditakse päeva lõppedes uute tehingute tegemist.

Oluline põhimõte: **klient ei saada tehingu hinda**. Server leiab selle ise käsust:

```python
hind = self.hinnad[self.indeks]["price"]
summa = round(kogus * hind, 2)
```

Hinnaks kasutatakse *tehingu sooritamise hetkel serveris kehtivat* indeksi hinda, mitte tingimata brauseris viimati joonistatud punkti. Seetõttu ei saa mängija odavama hinnaga kaubelda üksnes JavaScriptis `price` muutmise abil.

### Ostutehing (`buy`)

Koodi kontrollid:

```python
if self.energia + kogus > self.aku_maht:
    raise ManguViga("Akus pole piisavalt ruumi.")

if self.raha - summa < -0.000001:
    raise ManguViga("Ostmiseks pole piisavalt raha.")
```

Kui ost lubatakse:

```python
self.raha = round(self.raha - summa, 2)
self.energia += kogus
```

Kogus suurendab aku täituvust ja ostusumma vähendab rahajääki. Hind võib ajaloolistes andmetes olla negatiivne – sel juhul on `summa` negatiivne ja ostmine **suurendab** rahajääki; see on vastavuses negatiivsete elektrihindade arvestusega, kuid võib vajada eraldi mängudisaini otsust.

### Müügitehing (`sell`)

Kood kontrollib, et `self.energia >= kogus`; vastasel juhul pole akus piisavalt elektrit. Lisaks kontrollib, kas rahajääk jääks pärast müüki lubatud piiridesse. Negatiivse elektrihinna korral on `summa` negatiivne ja müümise eest tuleb mängus sisuliselt maksta.

Kui müük lubatakse:

```python
self.raha = round(self.raha + summa, 2)
self.energia -= kogus
```

Müügi järel tagastatakse uus serveris kinnitatud mänguseis.

## 4. Numbriline näide

Oletame **näitlikult**, et hind on 40 €/MWh, mängijal on 1000 € ja aku tühi:

| Tegevus | Arvutus | Raha pärast | Energia pärast |
|---|---|---|---|
| Algseis | – | 1000 € | 0 MWh |
| Osta 2 MWh | `2 × 40 = 80 €` | 920 € | 2 MWh |
| Hind tõuseb 65 €/MWh | Tehingut ei ole | 920 € | 2 MWh |
| Müü 1,5 MWh | `1,5 × 65 = 97,50 €` | 1017,50 € | 0,5 MWh |

See on arvutusnäide, mitte konkreetse Eleringi päeva tõendatud hinnajada. Selles näites jääb osa energiast akusse ning selle väärtus sõltub jätkuvalt hetkehinnast.

## 5. Vara väärtus ja kasum – `_seis()`

`_seis` arvutab mängija vara hetkeväärtuse ning kasumiprotsendi, seejärel koostab JSON-vastuseks sobiva Pythoni sõnastiku.

```python
vara_vaartus = self.raha + self.energia * hind["price"]
kasum = ((vara_vaartus - self.algsumma) / self.algsumma) * 100
```

See tähendab, et **kasumiprotsent ei ole ainult rahakonto muutus**. Arvesse võetakse ka parajasti akus oleva elektri väärtust turuhinnaga. Kui hind tõuseb, võib mängija vara väärtus suureneda juba enne energia müümist.

**Olulised tagastusväljad:**

| Võti | Tüüp | Selgitus |
|---|---|---|
| `active` | boolean | Mäng on loodud |
| `date` | string | Praeguse päeva ISO-kuupäev |
| `day_number` | integer | Mängupäeva järjekorranumber |
| `index` | integer | Hinnaperioodi indeks 0–95 |
| `total` | integer | Selle päeva hinnakirjete arv (96) |
| `timestamp` | integer | Hetkehinnale vastav Unixi aeg |
| `price` | number | Hetke elektrihind €/MWh |
| `balance` | number | Rahajääk €, ümardatud kahe komakohani |
| `energy` | number | Akus olev energia MWh |
| `capacity` | number | Aku maht MWh |
| `initial_balance` | number | Algkapital € |
| `asset_value` | number | Raha ja salvestatud energia hetkeväärtuse summa € |
| `profit_percent` | number | Varaväärtuse muutus algkapitali suhtes % |
| `elapsed_seconds` | number | Käesoleva mängupäeva aeg, 0–180 s |
| `speed` | number | Mängukiiruse kordaja |
| `running` | boolean | Serveri kell käib |
| `day_finished` | boolean | Päev on lõpule jõudnud |

## 6. Muud avalikud meetodid

| Meetod | Sisend | Põhitulemus |
|---|---|---|
| `seis()` | Puudub | Kinnitatud ajakohane mänguseis; ilma mänguta `{"active": False}` |
| `alusta(paev=None)` | ISO-päev või `None` | Uus mäng, raha ja aku lähtestatakse; puudumisel valitakse juhuslik sobiv päev |
| `jatka()` | Puudub | Käivitab/käivitab uuesti mängukella; lõppenud päeva ei jätka |
| `peata()` | Puudub | Peatab mängukella ning säilitab kehtiva hinna |
| `muuda_kiirust(kiirus)` | `0.5`, `1`, `2`, `5` | Arvestab senise aja, määrab uue kiiruse |
| `uus_paev()` | Puudub | Lubatud alles päeva lõppedes, säilitab raha/energia/kiiruse |
| `hinnad_nahtavad()` | Puudub | Väljastab 96 ajatemplit, peidab tulevaste hindade väärtused |

Meetodi `uus_paev()` järgmine päev ei ole täiesti juhuslik: valitakse sorteeritud sobivate kuupäevade hulgas esimene, mis on senisest suurem, või jõutakse nimekirja lõpus tagasi esimese juurde.

## 7. Rounding, tüübid ja piirangud

- Tehingusumma arvutatakse ja rahajääk salvestatakse kahe komakohaga.
- Energia arvutatakse praegu tavaliste `int`/`float` arvudega; backend ei sunni väärtust 0,5 MWh sammule, kuigi praegune UI kasutab selle sammu nuppe.
- `tehing` nõuab positiivset arvulist kogust, kuid ei kontrolli eraldi, et see oleks **lõplik arv** (`NaN`/`Infinity` käsitlemine vajaks lisavalideerimist, kui API-d avalikult kasutatakse).
- Server kasutab tingimust `-0.000001` lubamaks väga väikesi ujukomaarvude ümardusvigu. See on tehniline tolerants, mitte krediidiliin.
- Varade väärtus on hetke turuhinna põhine; akus oleva elektri realiseeritud kasum ja realiseerimata väärtuse muutus pole eraldi väljadena salvestatud.
- Mängija rahajääk ja energia on serveri mälus, mitte SQLite'i tabelis. Serveri taaskäivitamine katkestab seansi.

## 8. Võimalikud testid

Kontrolli ostu ja müügi mõlemat haru, täis akut, tühja akut, ebapiisavat raha, negatiivset hinda, nullkogust, vigast tegevust, päevapiiri, ostu pausil ning kahe samaaegse päringu käitumist. Tõelise turvalisuse jaoks on **serveripoolsed** testid olulisemad kui üksnes keelatud nupud brauseris.

Seotud: [serveri API](04-server-ja-manguseansid.md), [mängukell](06-serveripohine-mangukell.md), [veebiliides](07-hinnagraafik-ja-frontend.md).
