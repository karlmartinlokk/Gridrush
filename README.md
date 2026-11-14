![Gridrush](public_html/img/gridrush-logo.png)

Mathias Mander, Jaak Prommik, Karl-Martin Lokk

### Eesmärk

Gridrush on veebipõhine strateegia- ja kauplemismäng, kus mängija eesmärk on teenida võimalikult palju raha, kasutades ära elektri börsihinna kõikumisi.

Mängija saab osta elektrit madala hinnaga, salvestada selle akudesse ning müüa hiljem kõrgema hinnaga. Teenitud kasumit saab kasutada uute seadmete ostmiseks, olemasolevate täiustamiseks ja oma elektrisalvestusvõimekuse suurendamiseks.

Mängu ülesehitus ja kauplemisvahendid on inspireeritud börsikauplemisplatvormidest (näiteks TradingView), kus mängija saab jälgida hinnagraafikuid, analüüsida hinnamuutusi ning automatiseerida ostu- ja müügitehinguid.

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
