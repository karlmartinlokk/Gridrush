![Gridrush](public_html/img/gridrush-logo.png)

Mathias Mander, Jaak Prommik, Karl-Martin Lokk

### Eesmärk

Gridrush on veebipõhine strateegia- ja kauplemismäng, kus mängija eesmärk on teenida võimalikult palju raha, kasutades ära elektri börsihinna kõikumisi.

Mängija saab osta elektrit madala hinnaga, salvestada selle akudesse ning müüa hiljem kõrgema hinnaga. Teenitud kasumit saab kasutada uute seadmete ostmiseks, olemasolevate täiustamiseks ja oma elektrisalvestusvõimekuse suurendamiseks.

Mängu ülesehitus ja kauplemisvahendid on inspireeritud börsikauplemisplatvormidest (näiteks TradingView), kus mängija saab jälgida hinnagraafikuid, analüüsida hinnamuutusi ning automatiseerida ostu- ja müügitehinguid.

### Tööjaotus

Kokkuvõttes tegid kõik grupiliikmed natukene kõike. Põhitööjaotus oli aga järgnev:
- Karl-Martin: Projektijuhtimine, *frontend*, logode-ikoonide disain, repositooriumi- ja versioonihaldus
- Mathias: *Backend* (server, API ja andmebaas), mänguloogika teostamine, dokumentatsioon
- Jaak: Projekti idee ja n-ö äriloogika, akude ja generaatorite mudelid, *event*id

### Rühmatöö käitumisnormid

Plaanis otsustatud normid on üle vaadatud ja meile jätkuvalt tähtsad, otsustasime need jätta samale kujule. Siiani probleeme ei ole tekkinud ja kõik on aktiivselt kaasa teinud.

### Tehisintellekti kasutamine

Tehisintellekti on projektis kasutatud vastutustundlikult. Kõige enam tuimaks tööks, nagu kommentaaride ja dokumentatsiooni kirjutamine, komplekssemate disainide-animatsioonide realiseerimine SVG kujul ning koodi vorminduse ühtlustamine, kuid tehisintellekti abi on kasutatud ka näiteks koodi ülevaatusel ja äärejuhtude leidmisel.

### Käivitamine oma arvutis

Enne käskluste läbiviimist on soovitatud luua virtuaalkeskkond (virtual environment) ja see tööle panna.

1. Paigalda sõltuvused:
```
   pip install -r requirements.txt
```
2. Lae andmed andmebaasi, seda avalikus repositooriumis ei ole, esmane laadimine võtab veits aega:
```
   python -m tools.sync_prices backfill
```
3. Käivita lokaalne testserver:
```
   python -m tools.dev_server
```
4. Ava veebibrauseris `http://127.0.0.1:8000/index.html`
