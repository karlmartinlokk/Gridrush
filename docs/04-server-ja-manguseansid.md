# 04. Kohalik HTTP-server, API ja mänguseansid

## 1. Serveri roll

`tools/dev_server.py` sisaldab Gridrushi praegust **kohalikku arendusserverit**. See lahendab korraga kolm ülesannet: serveerib `public_html` kaustast HTML/CSS/JavaScripti, võtab vastu mängija tegevused JSON-päringutena ning hoiab eri brauseriseansside mänguobjektid lahus.

Serveri alus on `http.server.ThreadingHTTPServer` ja `SimpleHTTPRequestHandler`; käivitamisel kasutatakse aadressi `127.0.0.1:8000`. Server kuulab ainult kohalikus arvutis – see ei ole tootmiskeskkonna juurutuslahendus.

## 2. Serveri käivitumine

```python
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT / "public_html")
```

`ROOT` tuletab projekti juurkausta faili asukoha järgi. `os.chdir(...)` seab staatiliste failide serveri töökataloogiks `public_html`, et näiteks `/index.html`, `/css/index.css` ja `/js/chart.js` oleksid brauserile kättesaadavad.

```python
ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
```

`ThreadingHTTPServer` võimaldab mitut paralleelset päringut. See seletab ka lukustuse vajaduse: kaks päringut võivad sama kasutaja mänguseisu peaaegu üheaegselt muuta.

## 3. Seansside haldus

Serveris on sõnastik:

```python
seansid = {
    # seansitunnus: {"game": Kauplemismang(...), "last_access": ...}
}
```

Sõnastikku kaitseb `seansid_lukk = Lock()`. Igal `Kauplemismang` objektil on omakorda `self.lukk`: esimene kaitseb **seansside kaarti**, teine **ühe mängija mänguolekut**.

### `Handler.leia_mang(self)`

1. Määrab `self.uus_seanss = None` – vanad päringud ei tohi põhjustada uue küpsise saatmist.
2. Loeb päringu `Cookie` päise ja otsib `gridrush_session` väärtust `http.cookies.SimpleCookie` abil.
3. Kasutab `time.monotonic()` väärtust, et hinnata seansi viimast kasutust.
4. Kõige rohkem kord minutis eemaldab seansid, mille `last_access` on üle seitsme päeva vana.
5. Kui tunnusele vastav mäng leiti, värskendab viimase kasutuse aega ning tagastab `Kauplemismang` objekti.
6. Kui tunnus puudub või on aegunud, tagastab `None`, **uut mängu ei loo**.

See eristus on oluline: pelk staatilise lehe või `GET /state` avamine ei pea automaatselt serveris uut kasutajat looma.

### `Handler.loo_seanss(self, mang)`

Kasutab `secrets.token_urlsafe(32)` juhusliku pika seansitunnuse loomiseks. Kui sama tunnus oleks olemas, proovib uuesti. Salvestab mänguobjekti ja ajatempli `seansid` sõnastikku ning kirjutab tunnuse `self.uus_seanss` välja. Hiljem lisab `saada_json` vastusele `Set-Cookie` päise.

### Küpsise omadused

Praegune vastuse päis moodustatakse kujul:

```http
Set-Cookie: gridrush_session=<juhuslik>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800
```

- `HttpOnly` – JavaScript ei saa küpsist otse `document.cookie` kaudu lugeda.
- `SameSite=Lax` – piirab osa ristpäritolu küpsisesaatmisolukordi.
- `Path=/` – küpsis saadetakse samale saidile kõigi API-teekondade puhul.
- `Max-Age=604800` – brauseri küpsise maksimaalne eluiga seitse päeva.
- `Secure` **ei ole kohaliku HTTP testserveri küpsisel seadistatud**; HTTPS-i kasutava avaliku serveri korral tuleb see lisada.

Küpsis ise ei sisalda raha ega hindu – see on serveri mälus oleva seansi identifikaator.

## 4. JSON-vastuse koostamine – `saada_json(self, status, andmed)`

See funktsioon teisendab Pythoni objekti `json.dumps(..., ensure_ascii=False).encode("utf-8")` abil HTTP keha baitideks. Lisab päised `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `Content-Length` ja vajaduse korral uue küpsise. Seejärel saadab keha `self.wfile.write` kaudu.

`Cache-Control: no-store` on oluline, kuna mänguseis ja nähtavad hinnad muutuvad ajas ning neid ei tohi suvaliselt vana vahemälust lugeda.

## 5. API teekonnad

| Meetod | URL | Kutsutav kood | Eesmärk |
|---|---|---|---|
| `GET` | `/api/demo/state` | `mang.seis()` | Olemasoleva mängu seisu tagastamine; seansi puudumisel `{"active": false}` |
| `GET` | `/api/demo/prices` | `mang.hinnad_nahtavad()` | Ainult juba avanenud hindade väljastamine; seansi puudumisel 403 |
| `POST` | `/api/demo/start` | `mang.alusta(date)` | Uue mängu alustamine; seansi puudumisel luuakse mäng ja küpsis |
| `POST` | `/api/demo/trade` | `mang.tehing(action, quantity)` | Ostu või müügi kinnitamine |
| `POST` | `/api/demo/resume` | `mang.jatka()` | Mängukella käivitamine või jätkamine |
| `POST` | `/api/demo/pause` | `mang.peata()` | Mängukella peatamine |
| `POST` | `/api/demo/speed` | `mang.muuda_kiirust(speed)` | Kiiruse muutmine lubatud väärtuseks |
| `POST` | `/api/demo/next-day` | `mang.uus_paev()` | Uue päeva alustamine pärast vana lõppu |

Kõik muud `POST` teekonnad saavad 404 vastuse. `GET` teekonnad, mis pole kaks mängu API teekonda, lähevad staatiliste failide teenindusse (`super().do_GET()`). Vana `public_html/cgi-bin/get_prices.py` on projektist eemaldatud ega väljasta enam täispäeva hindu.

## 6. Näited päringutest ja vastustest

Uue mängu alustamine ilma kuupäevata (server valib sobiva juhusliku päeva):

```http
POST /api/demo/start
Content-Type: application/json

{}
```

Kindla päevaga alustamine *praeguses arendusversioonis*:

```json
{"date": "2025-10-02"}
```

Ostu näide:

```http
POST /api/demo/trade
Content-Type: application/json

{"action": "buy", "quantity": 0.5}
```

Kiiruse muutmise näide:

```json
{"speed": 2}
```

Mänguseisu ja hindade päringute tulemuse väljad on täpsemalt dokumenteeritud [kauplemise](05-kauplemisloogika.md) ja [anti-cheat'i](08-anti-cheat.md) peatükkides.

## 7. Sisendkontroll ja veavastused

`do_POST` kontrollib, et `Content-Length` oleks suurem kui 0 ja kuni 4096 baiti. JSON loetakse `self.rfile.read(pikkus)` abil ja peab olema objekt (`dict`). Seejärel suunatakse päring vastavale mängumeetodile.

| Olukord | Käitumine |
|---|---|
| Tundmatu POST teekond | 404, JSON-viga |
| Vigane pikkus, JSON või mängureegli rikkumine | 400, JSON-viga (käsitletavate erindite puhul) |
| `GET /api/demo/prices` ilma mänguseansita | 403 |
| `GET /api/demo/state` ilma seansita | 200, `{"active": false}` |
| Edukas käsk | 200, uuendatud mänguseis JSON-ina |

`ManguViga` pärib `ValueError`-ist, mistõttu mängureeglite erindid haaratakse `do_POST` lõpus olevas `except (ValueError, UnicodeDecodeError)` harus.

## 8. Turvalisus ja avalikule serverile üleviimine

Praegune teostus on arendamiseks sobiv, kuid avaliku serveri jaoks vajavad tähelepanu järgmised punktid:

- Seansid asuvad ainult RAM-is; protsessi taaskäivitamisel kaovad mängija raha, aku ja mängukell.
- Üks protsess hoiab üht `seansid` sõnastikku; mitme serveriprotsessi vahel pole ühisseansside salvestust.
- Kohaliku testserveri küpsis pole `Secure` ja HTTP ühendus pole krüpteeritud.
- Cookie-põhiseid olekut muutvaid POST-päringuid tuleks avalikul serveril lisaks hinnata CSRF-kaitse vaatenurgast.
- `ThreadingHTTPServer` ei ole iseenesest tootmiskeskkonna asendus spetsiaalsele veebiserverile.
- Kasutaja saab arendusserveris endiselt määrata `date` parameetri; kui kuupäevavalik lõplikult kaob, tuleb keeld kehtestada **ka serveris**, mitte ainult HTML-is.

**TÜ CGI majutuse puhul** ei saa eeldada, et pika elueaga `seansid` sõnastik ja monotonic-kella lähteolek säilivad päringute vahel. Selle jaoks on vaja arhitektuuri kohandada või kasutada sobivat püsiva protsessi majutust.

Seotud: [kauplemine](05-kauplemisloogika.md), [mängukell](06-serveripohine-mangukell.md), [anti-cheat](08-anti-cheat.md).
