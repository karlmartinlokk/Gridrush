// Liikuv joongraafik mis genereerib APIst saadud elektrihindade järgi.
// Autorid: Mathias Mander, Karl-Martin Lokk
// Graafiku teek: Chart.js 4 (MIT-litsents), https://www.chartjs.org/

// Graafiku ja mängu muutujad
let chart = null;
let hinnad = [];
let hetkeIndeks = 0;
let nahtudIndeksid = new Set();
let taimer = null;
let paringuNumber = 0;

// Hoiame meeles, millise kuupäeva graafik on laetud.
let graafikuPaev = "";
let serveriSeis = null;
let laadimine = false;

// Korraga küsime serverilt ainult ühe hindade uuenduse.
let hindadeParing = null;

// Serveri poolt avaldatud viimane hinnaindeks. Graafik (hetkeIndeks) võib sellest
// lühikest aega maas olla, kui server annab korraga mitu uut punkti. Nii juhtub,
// kui brauser aeglustab taimerit, näiteks siis, kui aken on teise all.
let avaldatudIndeks = 0;
let avamiseKaader = null;
let viimaneAvamine = 0;

// Kui maha jäänud punkte on rohkem, näitame need kohe ilma animatsioonita
// ja animeerime ainult viimase. Muidu kestaks järele jõudmine liiga kaua.
const SUJUVAID_PUNKTE_MAX = 5;

// Päeva lõpus ootame mängija kinnitust enne järgmise päeva alustamist.
let paevLabi = false;

// Väldime samaaegset mängu alustamist ja hinnasammu.
let kaivitamine = false;
let sammKaib = false;

// Tavakiirusel kestab üks mängupäev umbes kolm minutit.
const TAVALINE_SAMM_MS = 180000 / 96;

// Mängija valitud kiiruse kordaja
let kiirus = 1;

// Leiame kiiruse valiku HTML-ist.
const kiiruseNupud = document.querySelectorAll(".speed-buttons button");

// Leiame HTML-ist vajalikud elemendid.
const kuupaev = document.getElementById("date");
const teadeAeg = document.getElementById("graph-message-time");
const teade = document.getElementById("graph-message-price");
const teadeUhikud = document.getElementById("graph-message-unit");
const stats = document.getElementById("stats");
const paevadeLoendur = document.getElementById("day-count");

const playPauseNupp = document.getElementById("play-pause");

// Päeva lõpus graafikut kattev tume kiht.
const paevaLopuKate = document.getElementById("day-end-overlay");


// Serveri viimase kinnitatud mängukella andmed.
// Brauser arvutab hinnapunkte nende põhjal ega saada iga punkti kohta POST-i.
let kellaKinnitus = null;
let kellaKinnituseAeg = 0;

// Mängupäev jaguneb 96 15-minutiliseks hinnaperioodiks.
const PAEVA_PIKKUS_SEK = 180;
const PERIOODI_PIKKUS_SEK = PAEVA_PIKKUS_SEK / 96;


// Salvestame serveri kinnitatud mänguseisu ja mängukella lähtepunkti.
function synkroniseeriKell(seis) {
    serveriSeis = seis;

    // Kuvame serveri kinnitatud mängupäeva numbri.
    paevadeLoendur.textContent =
        Number.isInteger(seis.day_number) && seis.day_number > 0
            ? `${seis.day_number}. päev`
            : 'Päev -';

    kiirus = Number(seis.speed);

    kellaKinnitus = {
        sekundid: Number(seis.elapsed_seconds),
        kiirus,
        kaib: Boolean(seis.running)
    };

    kellaKinnituseAeg = performance.now();

    // Näitame HTML-is serveris kehtivat mängukiirust.
    kiiruseNupud.forEach(nupp => {
        nupp.setAttribute(
            'aria-pressed',
            String(Number(nupp.dataset.speed) === kiirus)
        );
    });
}


// Arvutame kohaliku mänguaja serveri kinnitatud kella järgi.
function praeguneManguaeg() {
    if (!kellaKinnitus) return 0;

    const juurde = kellaKinnitus.kaib
        ? Math.max(
            0,
            (performance.now() - kellaKinnituseAeg) / 1000
        ) * kellaKinnitus.kiirus
        : 0;

    return Math.min(
        PAEVA_PIKKUS_SEK,
        kellaKinnitus.sekundid + juurde
    );
}


// Graafiku värskendamine pärast ostu või müügi serverivastust.
// trading.js kutsub seda funktsiooni pärast kinnitatud tehingut.
window.synkroniseeriManguseis = seis => {
    if (!seis) return;

    synkroniseeriKell(seis);

    if (!chart || seis.date !== graafikuPaev) return;

    const uusIndeks = Math.min(hinnad.length - 1, seis.index);

    // Kui tehing toimus uuel hinnaperioodil, küsime hinna serverilt.
    // Tulevase perioodi hind ei ole brauseri mälus ette olemas.
    if (uusIndeks > avaldatudIndeks ||
        !Number.isFinite(hinnad[uusIndeks]?.price)) {
        void uuendaNahtavaidHindu().catch(viga => {
            window.kauplemine?.teata(`Viga: ${viga.message}`);
        });
        return;
    }

    // Tehingu hetkel juba nähtav hind on teada.
    kuvaSeis();
};


// Kuvame tühja graafiku teate, kuni mängija vajutab Play.
function kuvaOotel() {
    teadeAeg.textContent = "";
    teade.textContent = "Vajuta Play";
    teade.dataset.trend = 'Stabiilne';
    teadeUhikud.textContent = "";
    stats.textContent = "";
}


// Kiiruse muutmisel teavitame Pythonit ainult ühe POST-päringuga.
async function muudaKiirust(event) {
    if (
        kaivitamine ||
        sammKaib ||
        laadimine ||
        window.kauplemine?.toimetab
    ) return;

    const uusKiirus = Number(event.currentTarget.dataset.speed);

    // Enne mängu alustamist piisab kohaliku valiku uuendamisest.
    if (!window.kauplemine?.aktiivne) {
        kiirus = uusKiirus;

        kiiruseNupud.forEach(nupp => {
            nupp.setAttribute(
                'aria-pressed',
                String(Number(nupp.dataset.speed) === kiirus)
            );
        });

        return;
    }

    try {
        // Server arvestab senise aja vana kiirusega
        // ja hakkab seejärel kasutama uut kiirust.
        const seis = await window.kauplemine.muudaKiirust(
            uusKiirus
        );

        synkroniseeriKell(seis);

        if (seis.day_finished) {
            // Kui päev sai päringu ajal läbi, peatame graafiku.
            peataTaimer();
            paevLabi = true;
            avaPaevaLopuTeavitus();

        } else if (taimer !== null) {
            // Uus kiirus rakendub ka kohaliku graafiku uuendamisele.
            peataTaimer();

            taimer = setInterval(
                lisaPunkt,
                TAVALINE_SAMM_MS / kiirus
            );
        }

    } catch (viga) {
        window.kauplemine?.teata(`Viga: ${viga.message}`);

    } finally {
        uuendaNupud();
    }
}


// Kasutame CSS-is defineeritud värve.
function cssVarv(nimi) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(nimi)
        .trim();
}


// Teisendame Unix-timestambi Eesti kellaajaks.
function kell(timestamp) {
    return new Date(timestamp * 1000).toLocaleTimeString(
        "et-EE", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Tallinn"
        }
    );
}


// Peatame graafiku taimeri.
// Serveri mängukell ei muutu.
function peataTaimer() {
    if (taimer !== null) {
        clearInterval(taimer);
        taimer = null;
    }
}


// Päeva lõpus tumendame graafiku ja näitame "Järgmine päev" nuppu.
// Kate jääb nähtavale, kuni mängija alustab uut päeva
// või laadib käsitsi teise kuupäeva.
function avaPaevaLopuTeavitus() {
    document.getElementById('day-end-error').textContent = '';
    kuvaPaevaKokkuvote(window.kauplemine?.seis);
    paevaLopuKate.hidden = false;
}


// Päeva tehingute arv ja kasum tulevad serverist (day_trades, day_profit).
// Kasum on vara väärtuse muutus päeva jooksul, seega arvestab ka aku ostu.
function kuvaPaevaKokkuvote(seis) {
    const kokkuvote = document.getElementById('day-end-summary');

    if (!seis || !Number.isFinite(seis.day_profit)) {
        kokkuvote.textContent = '';
        return;
    }

    const kasum = seis.day_profit;
    const kasumiElement = document.createElement('span');

    kasumiElement.textContent =
        `${kasum > 0 ? '+' : kasum < 0 ? '-' : ''}${vormindaEuro(Math.abs(kasum))}`;
    kasumiElement.className = kasum > 0 ? 'gain' : kasum < 0 ? 'loss' : '';

    kokkuvote.replaceChildren(
        `Tegid ${seis.day_trades} tehingut ning teenisid kasumit `,
        kasumiElement
    );
}


function peidaPaevaLopuTeavitus() {
    paevaLopuKate.hidden = true;
}


// Päev vahetub ainult mängija soovil; raha ja aku jäävad alles.
async function alustaUutPaeva() {
    if (
        !paevLabi ||
        sammKaib ||
        kaivitamine ||
        laadimine ||
        window.kauplemine?.toimetab
    ) return;

    const nupp = document.getElementById('next-day-button');
    const veateade = document.getElementById('day-end-error');

    // Väldime korduvaid nupuvajutusi.
    sammKaib = true;
    nupp.disabled = true;
    veateade.textContent = '';

    uuendaNupud();

    try {
        let seis = window.kauplemine?.seis;

        if (!seis) {
            throw new Error('Mänguseis puudub.');
        }

        // Pärast edukat päevavahetust, kuid ebaõnnestunud
        // graafikulaadimist, ei tohi järgmine katse
        // serverit veel ühte uude päeva viia.
        if (
            seis.day_finished ||
            seis.date === graafikuPaev
        ) {
            seis = await window.kauplemine.uusPaev();
        }

        // Salvestame serveri kinnitatud uue päeva.
        synkroniseeriKell(seis);
        kuupaev.value = seis.date;

        // Laeme uue päeva graafiku ilma mängu lähtestamata.
        const korras = await laadiGraafik({
            sailitaMang: true
        });

        if (!korras) {
            throw new Error('Uue päeva hindu ei saanud laadida.');
        }

        // laadiGraafik() laadis juba serveris avaldatud hinnad.
        kuvaSeis();

        // Python käivitab selle mängija mängukella.
        seis = await window.kauplemine.jatka();

        synkroniseeriKell(seis);

        // Päevavahetus õnnestus.
        paevLabi = false;
        peidaPaevaLopuTeavitus();

        // Graafik liigub edaspidi ilma iga hinnapunkti POST-päringuta.
        taimer = setInterval(
            lisaPunkt,
            TAVALINE_SAMM_MS / kiirus
        );

        window.kauplemine.teata(
            `Algas uus mängupäev: ${seis.date}`
        );

    } catch (viga) {
        // Kui laadimine ebaõnnestub, jääb kate alles ja nupuga saab uuesti proovida.
        veateade.textContent = `Viga: ${viga.message}`;

    } finally {
        sammKaib = false;
        nupp.disabled = false;

        uuendaNupud();
    }
}


// Uuendame graafiku juhtnuppe vastavalt mängu olekule.
function uuendaNupud() {
    const kaib = taimer !== null;

    // Lukustame nupud ainult mängu käivitamisel
    // ja graafiku laadimisel, mitte iga hinnamuutuse ajal.
    //
    // Nii ei vilgu Play iga hinnasammu ajal.
    const lukus = kaivitamine || laadimine;

    // Päeva lõpus pole midagi mängida, edasi saab ainult "Järgmine päev" nupuga.
    playPauseNupp.disabled = lukus || paevLabi;

    playPauseNupp.classList.toggle('playing', kaib);

    playPauseNupp.setAttribute(
        'aria-label', kaib ? 'Peata' : 'Käivita'
    );

    // Kuupäeva vahetamine pole käiva mängu ajal lubatud.
    document.getElementById('load').disabled =
        lukus || kaib || sammKaib;

    kuupaev.disabled = lukus || kaib || sammKaib;
}


// Uuendame graafikut ja seni nähtud hindade statistikat.
function kuvaSeis() {
    if (!chart || hinnad.length === 0) {
        return;
    }

    const praegune = hinnad[hetkeIndeks];

    // Tulevast hinda ei tohi graafikul ega statistikas kuvada.
    if (!Number.isFinite(praegune?.price)) return;

    // Leiame praeguse hinna muutuse võrreldes eelmisega.
    const vahe = () => {
        if (hetkeIndeks === 0) {
            return 0;
        }

        const eelmine = hinnad[hetkeIndeks - 1];
        return praegune.price - eelmine.price;
    };

    // Lisame graafikule praeguse hinnapunkti.
    chart.data.datasets[0].data[hetkeIndeks] =
        praegune.price;

    // Uuendame graafikut koos olemasoleva animatsiooniga.
    chart.update();

    // Statistika jaoks kasutame ainult juba nähtud hindu.
    const nahtudHinnad = hinnad
        .slice(0, hetkeIndeks + 1)
        .map(p => p.price);

    const summa = nahtudHinnad.reduce(
        (a, b) => a + b, 0
    );

    const min = Math.min(...nahtudHinnad);
    const max = Math.max(...nahtudHinnad);
    const keskmine = summa / nahtudHinnad.length;

    stats.textContent =
        `Min ${min.toFixed(2)} ` +
        `Max ${max.toFixed(2)} ` +
        `Keskmine ${keskmine.toFixed(2)} €/MWh`;

    // Kuvame hetkehinna ja Eesti kohaliku kellaaja.
    teadeAeg.textContent = `${kell(praegune.timestamp)} |`;

    teade.textContent = praegune.price.toFixed(2);

    // Määrame hinna tõusu, languse või stabiilsuse.
    if (vahe() === 0) {
        teade.dataset.trend = 'Stabiilne';

    } else if (vahe() < 0) {
        teade.dataset.trend = 'Langeb';

    } else if (vahe() > 0) {
        teade.dataset.trend = 'Tõuseb';
    }

    teadeUhikud.textContent = " €/MWh";

    // Raha, aku ja kasum uuenevad kohapeal vastavalt nähtavale hinnale.
    // See ei saada serverile päringut; tehinguhinna määrab Python.
    if (window.kauplemine?.seis?.date === graafikuPaev) {
        window.kauplemine.kuvaHind?.(praegune, hetkeIndeks);
    }
}


// Kinnitame serveriga päeva lõpu ühe GET-päringuga.
// Nii ei lõpeta brauser päeva enne, kui see on ka serveris lõppenud.
async function kinnitaPaevaLopp() {
    if (sammKaib || paevLabi) return;

    peataTaimer();
    sammKaib = true;

    try {
        const seis = await window.kauplemine.taasta();

        if (!seis) {
            throw new Error('Mänguseis puudub.');
        }

        synkroniseeriKell(seis);

        if (seis.day_finished) {
            // Enne teavitust küsime ka viimase avanenud hinnapunkti.
            // Kui võrk katkeb, ei takista see päeva lõpetamist.
            try {
                await uuendaNahtavaidHindu();
            } catch (viga) {
                window.kauplemine?.teata(`Hinnapäringu viga: ${viga.message}`);
            }

            // Server kinnitas päeva lõpu.
            paevLabi = true;
            avaPaevaLopuTeavitus();

        } else if (seis.running) {
            // Server ei ole veel päeva lõppu jõudnud.
            // Jätkame serveri kinnitatud mängukella järgi.
            taimer = setInterval(
                lisaPunkt,
                TAVALINE_SAMM_MS / kiirus
            );
        }

    } catch (viga) {
        window.kauplemine?.teata(
            `Viga päeva lõpetamisel: ${viga.message}`
        );

    } finally {
        sammKaib = false;
        uuendaNupud();
    }
}


// Küsime serverilt ainult juba avanenud elektrihinnad.
// Server ei väljasta tulevaste hinnaperioodide hindu.
async function kysiNahtavadHinnad() {
    const andmed = await loeAPI(
        '/api/demo/prices',
        'Hindu ei saanud laadida.'
    );

    // Server saadab 96 ajatemplit, kuid tulevased hinnad on null.
    if (
        typeof andmed.date !== 'string' ||
        andmed.total !== 96 ||
        !Array.isArray(andmed.prices) ||
        andmed.prices.length !== 96 ||
        !Number.isInteger(andmed.index) ||
        andmed.index < 0 ||
        andmed.index >= 96 ||
        andmed.prices.some((punkt, indeks) =>
            !Number.isFinite(punkt?.timestamp) ||
            (indeks <= andmed.index
                ? !Number.isFinite(punkt.price)
                : punkt.price !== null)
        )
    ) {
        throw new Error('Server tagastas vigased hinnaandmed.');
    }

    return andmed;
}


// Värskendame graafikut ainult serveri poolt avaldatud hindadega.
async function uuendaNahtavaidHindu() {
    if (!chart || !graafikuPaev || laadimine) return;

    // Kui sama päring juba käib, ootame selle tulemust.
    if (hindadeParing) {
        await hindadeParing;
        return;
    }

    const oodatudPaev = graafikuPaev;
    const oodatudVersioon = paringuNumber;

    const paring = (async () => {
        const andmed = await kysiNahtavadHinnad();

        // Vana päringu vastus ei tohi muuta uut mängu või päeva.
        if (
            !chart ||
            oodatudVersioon !== paringuNumber ||
            oodatudPaev !== graafikuPaev ||
            andmed.date !== graafikuPaev
        ) return;

        hinnad = andmed.prices;
        avaldatudIndeks = andmed.index;

        if (andmed.state?.active) {

            // Anname uuendatud rahajäägi
            // kauplemise kasutajaliidesele.
            window.kauplemine?.uuendaSeis?.(
                andmed.state
            );
            
            // Sünkroniseerime graafiku mängukella
            // sama serveris kinnitatud seisuga.
            synkroniseeriKell(
                andmed.state
            );
        }


        if (avaldatudIndeks > hetkeIndeks) {
            if (avamiseKaader === null) naitaAvaldatudPunktid();
        } else {
            kuvaSeis();
        }
    })();

    hindadeParing = paring;

    try {
        await paring;
    } finally {
        if (hindadeParing === paring) {
            hindadeParing = null;
        }
    }
}


// Näitame serveri avaldatud punkte ükshaaval, et iga uus punkt
// tuleks eelmise juurest, ka siis, kui server andis korraga mitu.
// requestAnimationFrame ei jää nähtaval lehel maha nagu aeglustatud setTimeout,
// ja peidetud lehel ootab see, kuni leht jälle nähtavale tuleb.
function naitaAvaldatudPunktid(aeg = performance.now()) {
    avamiseKaader = null;

    if (!chart || hetkeIndeks >= avaldatudIndeks) return;

    // Järgmine punkt tuleb poole hinnaperioodi pärast, kuid mitte harvem kui 300 ms järel.
    if (aeg - viimaneAvamine < Math.min(300, TAVALINE_SAMM_MS / kiirus / 2)) {
        avamiseKaader = requestAnimationFrame(naitaAvaldatudPunktid);
        return;
    }

    if (avaldatudIndeks - hetkeIndeks > SUJUVAID_PUNKTE_MAX) {
        const andmed = chart.data.datasets[0].data;

        // Vahepealsed punktid ei tohi animeeruda graafiku alt üles.
        for (let i = hetkeIndeks + 1; i < avaldatudIndeks; i++) {
            andmed[i] = hinnad[i].price;
            nahtudIndeksid.add(`x:${i}`);
            nahtudIndeksid.add(`y:${i}`);
        }

        hetkeIndeks = avaldatudIndeks - 1;
        chart.update('none');
    }

    hetkeIndeks++;
    viimaneAvamine = aeg;
    kuvaSeis();

    if (hetkeIndeks < avaldatudIndeks) {
        avamiseKaader = requestAnimationFrame(naitaAvaldatudPunktid);
    }
}


// Joongraafik liigub brauseris serveri kinnitatud mängukella järgi.
// Uue hinna jaoks teeme GET-päringu, mitte POST-päringut.
function lisaPunkt() {
    if (
        !chart ||
        !kellaKinnitus ||
        !kellaKinnitus.kaib ||
        paevLabi ||
        laadimine ||
        sammKaib
    ) return;

    const sekundid = praeguneManguaeg();

    const uusIndeks = Math.min(
        hinnad.length - 1,
        Math.floor(sekundid / PERIOODI_PIKKUS_SEK)
    );

    if (uusIndeks > avaldatudIndeks && !hindadeParing) {
        // Server otsustab, kas vastav hinnaperiood on saabunud.
        void uuendaNahtavaidHindu().catch(viga => {
            window.kauplemine?.teata(`Viga: ${viga.message}`);
        });
    }

    if (sekundid >= PAEVA_PIKKUS_SEK) {
        // Päeva lõpu kinnitab samuti server.
        void kinnitaPaevaLopp();
    }
}


// Käivitame mängu või taastame selle serveris olevast mänguseansist.
async function alustaGraafik({ automaatne = false } = {}) {
    // Play avab lõppenud päeval uue päeva teavituse.
    if (paevLabi && !automaatne) {
        avaPaevaLopuTeavitus();
        return;
    }

    // Väldime samaaegseid mängu käivitamisi.
    if (
        taimer !== null ||
        kaivitamine ||
        sammKaib ||
        laadimine ||
        window.kauplemine?.toimetab
    ) return;

    kaivitamine = true;
    uuendaNupud();

    try {
        if (!window.kauplemine) {
            throw new Error('Kauplemise JavaScript puudub.');
        }

        let seis;

        if (automaatne) {
            // Lehe avamisel või brauseri vahemälust taastamisel
            // küsime mänguseisu Pythonilt.
            //
            // Seda ka siis, kui vana JS-i olek on mälus alles.
            seis = await window.kauplemine.taasta();

            // Uus mäng algab alles Play vajutamisel.
            if (!seis) {
                kuvaOotel();
                window.kauplemine.teata(
                    'Mängu alustamiseks vajuta mängi nuppu.'
                );
                return;
            }

        } else if (!window.kauplemine.aktiivne) {
            // Kui kasutaja laadis käsitsi kindla kuupäeva,
            // alustame sellel päeval uut mängu.
            seis = await window.kauplemine.alusta(
                chart ? kuupaev.value : undefined
            );

        } else {
            // Play-nupp jätkab olemasolevat mängu pausilt.
            seis = window.kauplemine.seis || serveriSeis;
        }

        if (!seis) {
            throw new Error('Mänguseis puudub.');
        }

        synkroniseeriKell(seis);

        // Vajadusel laadime õige päeva hinnad.
        // Mängija raha ja akut see ei lähtesta.
        if (!chart || graafikuPaev !== seis.date) {
            kuupaev.value = seis.date;

            const korras = await laadiGraafik({
                sailitaMang: true
            });

            if (!korras) {
                throw new Error('Graafikut ei saanud laadida.');
            }
        } else {
            // Taastamisel küsime ka juba avanenud hinnad serverilt.
            // Graafik ei saa kasutada mälus olevaid tulevasi hindu.
            await uuendaNahtavaidHindu();
        }

        kuvaSeis();

        // Päeva lõppedes ei alusta me automaatselt järgmist päeva.
        if (seis.day_finished) {
            paevLabi = true;
            avaPaevaLopuTeavitus();
            return;
        }

        paevLabi = false;

        // Lehe avamisel taastame mängu alati pausil.
        // Graafik hakkab liikuma alles Play vajutamisel.
        if (automaatne) {
            if (seis.running) {
                seis = await window.kauplemine.peata();

                synkroniseeriKell(seis);
                window.synkroniseeriManguseis(seis);
            }

            window.kauplemine.teata(
                'Eelmine mäng taastatud. Vajuta Play.'
            );
            return;
        }

        // Käivitame serveri mängukella ühe POST-päringuga.
        seis = await window.kauplemine.jatka();

        synkroniseeriKell(seis);

        // Kohalik taimer ainult joonistab hinnapunkte.
        // Iga punkti kohta ei tehta serveripäringut.
        taimer = setInterval(
            lisaPunkt,
            TAVALINE_SAMM_MS / kiirus
        );

        window.kauplemine.teata('Mäng käib.');

    } catch (viga) {
        window.kauplemine?.teata(
            `Viga: ${viga.message}`
        );

    } finally {
        kaivitamine = false;
        uuendaNupud();
    }
}


// Peatame nii graafiku kui ka serveris oleva mängukella.
async function peataGraafik() {
    if (
        taimer === null ||
        kaivitamine ||
        sammKaib ||
        window.kauplemine?.toimetab
    ) return;

    // Peatame kõigepealt brauseri taimeri.
    peataTaimer();

    kaivitamine = true;
    uuendaNupud();

    try {
        // Server fikseerib praeguse hinna.
        // Pausil see enam ei muutu.
        const seis = await window.kauplemine.peata();

        if (seis.active) {
            window.synkroniseeriManguseis(seis);
        }

        if (seis.day_finished) {
            // Kui päev lõppes peatamise ajal, näitame teavitust.
            paevLabi = true;
            avaPaevaLopuTeavitus();

        } else {
            // Tavaline paus.
            window.kauplemine.teata('Mäng on pausil.');
        }

    } catch (viga) {
        window.kauplemine?.teata(
            `Viga: ${viga.message}`
        );

    } finally {
        kaivitamine = false;
        uuendaNupud();
    }
}


// Vahetame Play ja Pause vahel.
function lulitaGraafik() {
    // Päeva lõppedes avab Play-nupp teavituse uuesti.
    if (paevLabi) {
        avaPaevaLopuTeavitus();
        return;
    }

    // Poolelioleva päringu ajal mängukella ei muuda.
    if (
        kaivitamine ||
        laadimine ||
        sammKaib ||
        window.kauplemine?.toimetab
    ) return;

    if (taimer === null) {
        alustaGraafik();
    } else {
        peataGraafik();
    }
}


// Laeme valitud päeva hinnad SQLite'ist API kaudu.
async function laadiGraafik({ sailitaMang = false } = {}) {
    // Väldime mitut samaaegset graafiku laadimist.
    if (laadimine) return false;

    // Käsitsi laadimisel lähtestame mängu,
    // automaatsel või kinnitatud päevavahetusel mitte.
    if (!sailitaMang) {
        if (
            kaivitamine ||
            sammKaib ||
            window.kauplemine?.toimetab
        ) return false;

        // Käsitsi päeva vahetamine lõpetab vana päeva oleku.
        paevLabi = false;
        peidaPaevaLopuTeavitus();

        peataTaimer();

        // Käsitsi valitud päeva käivitamisel loob Python uue mängu.
        window.kauplemine?.nulli();
        serveriSeis = null;
        kellaKinnitus = null;

        // Käsitsi uue päeva valimisel eemaldame vana mängu loenduri.
        paevadeLoendur.textContent = 'Päev -';
    }

    laadimine = true;

    // Tuvastame, milline laadimispäring on kõige uuem.
    const praeguneParing = ++paringuNumber;

    teadeAeg.textContent = "";
    teade.textContent = "Laen hindu...";
    teadeUhikud.textContent = "";
    stats.textContent = "";

    // Eemaldame eelmise graafiku.
    if (chart) {
        chart.destroy();
        chart = null;
    }

    hinnad = [];
    hetkeIndeks = 0;
    avaldatudIndeks = 0;
    cancelAnimationFrame(avamiseKaader);
    avamiseKaader = null;
    nahtudIndeksid.clear();
    graafikuPaev = "";

    uuendaNupud();

    // Uue punkti animatsioon algab eelmise punkti asukohast ja toimub vaid korra.
    const indeksiVahe = (context, axis) => {
        if (context.type !== "data" || context.dataIndex !== hetkeIndeks || context.dataIndex === 0) {
            return undefined;
        }
        const voti = `${axis}:${context.dataIndex}`;
        if (nahtudIndeksid.has(voti)) {
            return undefined;
        }
        nahtudIndeksid.add(voti);
        const punktid = context.chart.getDatasetMeta(context.datasetIndex).data;
        const eelmine = punktid[context.dataIndex - 1];
        if (axis === 'x') return eelmine.getProps(['x']).x;
        if (axis === 'y') return eelmine.getProps(['y']).y;
    }

    try {
        if (!sailitaMang) {
            // Käsitsi kuupäeva laadimine alustab valitud päeval
            // uue mängu, mis jääb kuni Play vajutamiseni pausile.
            const seis = await window.kauplemine.alusta(kuupaev.value);
            synkroniseeriKell(seis);
        }

        // Anti-cheat: küsime ainult serveris juba avanenud hindu.
        const andmed = await kysiNahtavadHinnad();

        // Ignoreerime vananenud päringu vastust.
        if (praeguneParing !== paringuNumber) {
            return false;
        }

        if (andmed.date !== kuupaev.value) {
            throw new Error('Serveri mängupäev ei vasta valitud kuupäevale.');
        }

        hinnad = andmed.prices;
        hetkeIndeks = andmed.index;
        avaldatudIndeks = andmed.index;
        graafikuPaev = andmed.date;
        nahtudIndeksid.clear();

        // Loome joongraafiku olemasoleva kujundusega.
        chart = new Chart(
            document.getElementById("priceChart"),
            {
                type: "line",

                data: {
                    // Kellaaegade asukohad on kohe teada.
                    labels: hinnad.map(
                        p => kell(p.timestamp)
                    ),

                    datasets: [{
                        label: "Elektrihind (€/MWh)",

                        // Hinnad ilmuvad ükshaaval.
                        data: Array(hinnad.length).fill(null),

                        borderColor: cssVarv("--color-text-primary"),
                        borderWidth: 2,

                        // Näitame praegust punkti suuremana.
                        pointRadius: context =>
                            context.dataIndex === hetkeIndeks
                                ? 4
                                : 1,

                        pointHoverRadius: 5,
                        tension: 0.1,
                        fill: false
                    }]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    // Uue punkti ilmumisel kasutame sujuvat animatsiooni.
                    animations: {
                        x: {
                            duration: 300,

                            // Uus punkt liigub välja eelmise asukohast.
                            from: context => indeksiVahe(context, 'x')
                        },

                        y: {
                            duration: 300,

                            // Uus punkt alustab eelmise punkti kõrguselt.
                            from: context => indeksiVahe(context, 'y')
                        },

                        radius: {
                            duration: 0
                        }
                    },

                    interaction: {
                        intersect: false,
                        mode: "index"
                    },

                    plugins: {
                        legend: {
                            display: false
                        }
                    },

                    scales: {
                        x: {
                            grid: {
                                display: true,
                                color: cssVarv("--color-border")
                            },

                            ticks: {
                                color: cssVarv("--color-text-secondary"),
                                maxRotation: 0,

                                callback: function(value, index) {
                                    // Iga kahe tunni tagant kellaaeg.
                                    if (index % 8 === 0) {
                                        return this.getLabelForValue(value);
                                    }

                                    // Iga tunni tagant ainult joon.
                                    if (index % 4 === 0) {
                                        return "";
                                    }

                                    return null;
                                }
                            }
                        },

                        y: {
                            title: {
                                display: true,
                                text: "€/MWh",
                                color: cssVarv("--color-text-secondary")
                            },

                            grid: {
                                color: cssVarv("--color-border")
                            },

                            ticks: {
                                color: cssVarv("--color-text-secondary")
                            }
                        }
                    }
                }
            }
        );

        // Kuvame serveris juba avanenud hinnapunktid.
        chart.data.datasets[0].data = hinnad.map((punkt, indeks) =>
            indeks <= hetkeIndeks ? punkt.price : null
        );

        kuvaSeis();

        // Teavitame teisi funktsioone edukast laadimisest.
        return true;

    } catch (viga) {
        // Kui tegemist on vana päringuga, ignoreerime seda.
        if (praeguneParing !== paringuNumber) {
            return false;
        }

        teadeAeg.textContent = "";
        teade.textContent = `Viga: ${viga.message}`;
        teadeUhikud.textContent = "";

        // Eemaldame ebaõnnestunud graafiku.
        if (chart) {
            chart.destroy();
            chart = null;
        }

        graafikuPaev = "";
        return false;

    } finally {
        laadimine = false;
        uuendaNupud();
    }
}


// Seome kuupäeva laadimise nupu funktsiooniga.
document.getElementById("load").addEventListener(
    "click", () => laadiGraafik()
);

// Seome kiiruse muutmise nupud.
kiiruseNupud.forEach(nupp => {
    nupp.addEventListener("click", muudaKiirust);
});

// Seome Play/Pause-nupu.
playPauseNupp.addEventListener(
    "click", lulitaGraafik
);

// Kuupäeva käsitsi muutmisel laadime valitud päeva.
kuupaev.addEventListener(
    "change", () => laadiGraafik()
);


// Järgmine päev käivitub ainult mängija soovil.
document.getElementById('next-day-button').addEventListener(
    'click', alustaUutPaeva
);


// Lehe avamisel taastame serverist selle mängijaseansi mängu.
window.addEventListener('load', () => {
    void alustaGraafik({ automaatne: true });
});


// Lehelt lahkudes palume serveril käiva mängu pausile panna.
// sendBeacon toimib ka lehe sulgemise ajal paremini
// kui tavaline asünkroonne fetch, kuid kohalejõudmine pole garanteeritud.
window.addEventListener('pagehide', () => {
    const oliKaimas = taimer !== null;

    peataTaimer();

    if (oliKaimas && window.kauplemine?.aktiivne) {
        navigator.sendBeacon(
            '/api/demo/pause',
            new Blob(
                ['{}'],
                { type: 'application/json' }
            )
        );
    }

    // Kui leht jääb brauseri tagasiliikumise vahemällu,
    // ei tohi vana kohalik mängukell edasi liikuda.
    if (kellaKinnitus) {
        kellaKinnitus.kaib = false;
    }
});


// Brauser võib lehe Back-nupuga taastada ilma uut load-sündmust saatmata.
// Sel juhul küsime uuesti serverilt, kus mäng pooleli jäi.
window.addEventListener('pageshow', event => {
    if (event.persisted) {
        void alustaGraafik({ automaatne: true });
    }
});
