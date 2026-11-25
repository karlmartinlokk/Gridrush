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
const resetNupp = document.getElementById("reset");

// Päeva lõpu teavitusaken.
const paevaLopuDialog = document.getElementById("day-end-dialog");


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
    if (uusIndeks > hetkeIndeks ||
        !Number.isFinite(hinnad[uusIndeks]?.price)) {
        void uuendaNahtavaidHindu().catch(viga => {
            window.kauplemine?.teata(`Viga: ${viga.message}`);
        });
        return;
    }

    // Tehingu hetkel juba nähtav hind on teada.
    kuvaSeis();
};


// Hoiame meeles, kas mängija oli ise mängu pausile pannud.
function salvestaMangijaSoov(kaib) {
    try {
        sessionStorage.setItem(
            'gridrush_was_playing',
            kaib ? '1' : '0'
        );
    } catch (_viga) {
        // Salvestamise piirang ei tohi mängu peatada.
    }
}


// Loeme mängija viimase salvestatud Play/Pause valiku.
function eelmineMangijaSoov() {
    try {
        return sessionStorage.getItem('gridrush_was_playing');
    } catch (_viga) {
        return null;
    }
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


// Kuvame päeva lõpu kokkuvõtte Pythoni kinnitatud mänguseisust.
function avaPaevaLopuTeavitus() {
    // Kontrollime, kas teavitusaken on HTML-is olemas.
    if (!paevaLopuDialog) {
        window.kauplemine?.teata(
            'Päev läbi. Päeva lõpu teavitus puudub index.html failist.'
        );
        return;
    }

    // Võtame viimase serveri kinnitatud mänguseisu.
    const seis = window.kauplemine?.seis;

    if (seis) {
        // Kuvame rahajäägi Eesti arvuvormingus.
        document.getElementById('day-end-balance').textContent =
            `${seis.balance.toLocaleString('et-EE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })} €`;

        // Kuvame salvestatud elektrienergia ja aku mahutavuse.
        document.getElementById('day-end-energy').textContent =
            `${seis.energy} / ${seis.capacity} MWh`;

        // Kuvame Pythoni arvutatud kasumiprotsendi.
        const protsent = seis.profit_percent;

        document.getElementById('day-end-profit').textContent =
            `${protsent > 0 ? '+' : ''}${protsent.toFixed(1)}%`;
    }

    // Eemaldame eelmise võimaliku veateate.
    document.getElementById('day-end-error').textContent = '';

    // Avame teavituse ainult siis, kui see pole juba avatud.
    if (!paevaLopuDialog.open) {
        paevaLopuDialog.showModal();
    }
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
        paevaLopuDialog?.close();

        salvestaMangijaSoov(true);

        // Graafik liigub edaspidi ilma iga hinnapunkti POST-päringuta.
        taimer = setInterval(
            lisaPunkt,
            TAVALINE_SAMM_MS / kiirus
        );

        window.kauplemine.teata(
            `Algas uus mängupäev: ${seis.date}`
        );

    } catch (viga) {
        // Kui laadimine ebaõnnestub, jääb teavitus avatuks.
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
    // Nii ei vilgu Play ja Reset iga hinnasammu ajal.
    const lukus = kaivitamine || laadimine;

    playPauseNupp.disabled = lukus;
    resetNupp.disabled = chart === null || lukus;

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
            salvestaMangijaSoov(false);
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
    const vastus = await fetch('/api/demo/prices', {
        cache: 'no-store'
    });

    const andmed = await vastus.json();

    if (!vastus.ok) {
        throw new Error(andmed.error || 'Hindu ei saanud laadida.');
    }

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
        hetkeIndeks = andmed.index;

        chart.data.datasets[0].data = hinnad.map((punkt, indeks) =>
            indeks <= hetkeIndeks ? punkt.price : null
        );

        kuvaSeis();
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

    if (uusIndeks > hetkeIndeks && !hindadeParing) {
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
        let uusMang = false;

        if (automaatne) {
            // Lehe avamisel või brauseri vahemälust taastamisel
            // küsime mänguseisu Pythonilt.
            //
            // Seda ka siis, kui vana JS-i olek on mälus alles.
            seis = await window.kauplemine.taasta();

            if (!seis) {
                // Kui mängu ei leitud, alustame uut mängu.
                seis = await window.kauplemine.alusta();
                uusMang = true;
            }

        } else if (!window.kauplemine.aktiivne) {
            // Kui kasutaja laadis käsitsi kindla kuupäeva,
            // alustame sellel päeval uut mängu.
            seis = await window.kauplemine.alusta(
                chart ? kuupaev.value : undefined
            );

            uusMang = true;

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
            salvestaMangijaSoov(false);
            avaPaevaLopuTeavitus();
            return;
        }

        paevLabi = false;

        // Kui mängija jättis mängu ise pausile,
        // taastame mängu samamoodi pausil.
        //
        // Uus mäng käivitub ka siis, kui salvestatud
        // pausimärge pärineb eelmisest mängust.
        if (
            automaatne &&
            !uusMang &&
            eelmineMangijaSoov() === '0'
        ) {
            if (seis.running) {
                seis = await window.kauplemine.peata();

                synkroniseeriKell(seis);
                window.synkroniseeriManguseis(seis);
            }

            window.kauplemine.teata(
                'Eelmine mäng taastatud. Pausil.'
            );
            return;
        }

        // Käivitame serveri mängukella ühe POST-päringuga.
        seis = await window.kauplemine.jatka();

        synkroniseeriKell(seis);
        salvestaMangijaSoov(true);

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
            salvestaMangijaSoov(false);
            avaPaevaLopuTeavitus();

        } else {
            // Tavaline paus.
            salvestaMangijaSoov(false);
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


// Reset alustab sama päeva uuesti ainult selle mängija mänguseansis.
async function nulliGraafik() {
    if (
        !chart ||
        kaivitamine ||
        sammKaib ||
        laadimine ||
        window.kauplemine?.toimetab
    ) return;

    peataTaimer();

    kaivitamine = true;
    uuendaNupud();
    nahtudIndeksid.clear()

    try {
        // Python nullib raha, aku ja mängukella.
        const seis = await window.kauplemine.alusta(
            kuupaev.value
        );

        synkroniseeriKell(seis);

        // Laeme reset'i järel uuesti ainult esimese avatud hinna.
        // Eelmise mängu hinnad ei jää graafiku andmetesse alles.
        const korras = await laadiGraafik({ sailitaMang: true });

        if (!korras) {
            throw new Error('Alguse hindu ei saanud laadida.');
        }

        kuvaSeis();

        // Reset tühistab päeva lõpu oleku.
        paevLabi = false;
        salvestaMangijaSoov(false);

        if (paevaLopuDialog?.open) {
            paevaLopuDialog.close();
        }

        window.kauplemine.teata(
            'Mäng lähtestatud. Vajuta Play.'
        );

    } catch (viga) {
        window.kauplemine?.teata(
            `Viga: ${viga.message}`
        );

    } finally {
        kaivitamine = false;
        uuendaNupud();
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

        if (paevaLopuDialog?.open) {
            paevaLopuDialog.close();
        }

        peataTaimer();
        salvestaMangijaSoov(false);

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

// Seome Reset-nupu.
resetNupp.addEventListener(
    "click", nulliGraafik
);

// Kuupäeva käsitsi muutmisel laadime valitud päeva.
kuupaev.addEventListener(
    "change", () => laadiGraafik()
);


// Seome päeva lõpu teavitusakna nupud.
if (paevaLopuDialog) {
    // Käivitame järgmise päeva ainult mängija soovil.
    document.getElementById('next-day-button').addEventListener(
        'click', alustaUutPaeva
    );

    // Sulgeme teavituse ja jätame mängu pausile.
    document.getElementById('later-button').addEventListener(
        'click', () => paevaLopuDialog.close()
    );
}


// Lehe avamisel taastame serverist selle mängijaseansi mängu.
window.addEventListener('load', () => {
    void alustaGraafik({ automaatne: true });
});


// Lehelt lahkudes fikseerime, kas mäng oli käimas, ja palume serveril
// see pausile panna. sendBeacon toimib ka lehe sulgemise ajal paremini
// kui tavaline asünkroonne fetch, kuid kohalejõudmine pole garanteeritud.
window.addEventListener('pagehide', () => {
    const oliKaimas = taimer !== null;

    salvestaMangijaSoov(oliKaimas);
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
