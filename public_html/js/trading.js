// Kauplemine. Raha ja aku muutusi arvutab Python.
// Autorid: Mathias Mander, Karl-Martin Lokk

let manguseis = null;
let kogus = 1;
let paringKaib = false;
let eelvaade = null;
let hetkeAnimatsioon = null;

// Leiame kasutajaliidese elemendid.
const leia = valija => document.querySelector(valija);
const teata = tekst => leia('.event-container').textContent = tekst;
const sammuNupud = document.querySelectorAll('.target-step-button');


// Kuvame serverist saadud mänguseisu.
function kuvaKauplemine() {
    const s = manguseis;

    // Kuvame valitud elektrikoguse.
    leia('.target-amount').textContent =
        kogus.toFixed(1).replace('.', ',');

    // Piirame koguse valimist aku mahutavusega.
    sammuNupud.forEach(nupp => {
        const samm = Number(nupp.dataset.step);
        nupp.disabled = !s || paringKaib ||
            (samm < 0 ? kogus <= 0.5 : kogus >= s.capacity);
    });

    // Arvutame valitud koguse väärtuse hetkehinnaga.
    const summa = s ? kogus * s.price : 0;

    // Ootel korralduse suund ('buy' või 'sell'), muidu null.
    const ootel = s?.pending_order?.tegevus ?? null;

    // Hõljumisel näitame kui palju raha muutuks nupuvajutusel.
    // PEATA nupu peal eelvaadet pole, sest see ei tee uut tehingut.
    const rahaMuutus =
        ootel ? null :
        eelvaade === 'buy' ? -summa :
        eelvaade === 'sell' ? summa : null;

    const vaartusElement = leia('.target-value');

    // Üle ühe perioodi piiri jagatakse korraldus osadeks,
    // mis täituvad järgmiste perioodide hinnaga.
    const ligikaudne = s && kogus > s.max_trade_MWh ? '≈ ' : '';

    // Eelvaates lisame summale märgi, muidu kuvame tehingu väärtuse.
    if (!s) {
        vaartusElement.textContent = '- €';
    } else if (rahaMuutus === null) {
        vaartusElement.textContent = `${ligikaudne}${vormindaEuro(summa)}`;
    } else {
        const mark = rahaMuutus > 0 ? '+' : rahaMuutus < 0 ? '-' : '';
        vaartusElement.textContent =
            `${ligikaudne}${mark}${vormindaEuro(Math.abs(rahaMuutus))}`;
    }

    vaartusElement.classList.toggle('gain', Boolean(s) && rahaMuutus > 0);
    vaartusElement.classList.toggle('loss', Boolean(s) && rahaMuutus < 0);

    const ostuNupp = leia('.battery-buy-button');
    const myygiNupp = leia('.battery-sell-button');

    // Ootel korralduse suunaga nupp muutub PEATA nupuks.
    ostuNupp.textContent = ootel === 'buy' ? 'PEATA' : 'OSTA';
    myygiNupp.textContent = ootel === 'sell' ? 'PEATA' : 'MÜÜ';
    ostuNupp.setAttribute('aria-pressed', String(ootel === 'buy'));
    myygiNupp.setAttribute('aria-pressed', String(ootel === 'sell'));

    // Aku animatsioon käib terve ootel korralduse aja.
    const animatsioon = ootel ?? hetkeAnimatsioon;
    const aku = leia('.battery');

    aku.classList.toggle('charging', animatsioon === 'buy');
    aku.classList.toggle('discharging', animatsioon === 'sell');

    // Keelame nupud, kui aku mahust, energiast või rahast ei piisa.
    ostuNupp.disabled = ootel === 'buy' ? paringKaib :
        !s || paringKaib || Boolean(ootel) ||
        s.energy + kogus > s.capacity ||
        s.balance - summa < -0.000001;

    myygiNupp.disabled = ootel === 'sell' ? paringKaib :
        !s || paringKaib || Boolean(ootel) ||
        s.energy < kogus ||
        s.balance + summa < -0.000001;

    kuvaParemPaneel(s);

    // Lukustame vajadusel graafiku juhtnupud.
    if (typeof uuendaNupud === 'function') uuendaNupud();
}


// Saadame tegevuse Pythonile ja salvestame kinnitatud vastuse.
async function kauplemiseAPI(aadress, andmed = {}) {
    if (paringKaib)
        throw new Error('Eelmine toiming on pooleli.');

    paringKaib = true;

   // Lukustame nupud päringu töötlemise ajaks.
    kuvaKauplemine();

    try {
        const tulemus = await saadaAPI(aadress, andmed);

        // Salvestame Pythonist saadud mänguseisu.
        manguseis = tulemus;

        // Pärast ostu või müüki sünkroonime graafiku serveri kellaga.
        // Nii kasutab graafik sama hinnapunkti, millega tehing tehti.
        if (
            aadress === '/api/demo/trade' &&
            typeof window.synkroniseeriManguseis === 'function'
        ) {
            window.synkroniseeriManguseis(tulemus);
        }

        if (
            tulemus.achievements &&
            typeof kasitleSaavutusi === 'function'
        ) {
            kasitleSaavutusi(tulemus.achievements);
        }

        return tulemus;

    } finally {
        paringKaib = false;
        kuvaKauplemine();
    }
}


// Küsime Pythonilt, kas mäng on juba käimas.
async function taastaKauplemine() {

    // Väldime mitut samaaegset päringut.
    if (paringKaib) {
        throw new Error('Eelmine toiming on pooleli.');
    }

    paringKaib = true;
    kuvaKauplemine();

    try {
        // Küsime olemasoleva mänguseisu ilma seda muutmata.
        const tulemus = await loeAPI(
            '/api/demo/state',
            'Mänguseisu ei saanud taastada.'
        );

        // Kui mäng on olemas, salvestame serveri kinnitatud seisu.
        // Muidu jätame mänguseisu tühjaks.
        manguseis = tulemus.active ? tulemus : null;

        // Server teatab, kui korraldus tühistati mängukella käigus.
        if (tulemus.order_notice) teata(tulemus.order_notice);

        return manguseis;

    } finally {
        // Uuendame rahajäägi, aku ja tehingunupud.
        paringKaib = false;
        kuvaKauplemine();
    }
};


// Ostame või müüme valitud koguse elektrit.
async function teeTehing(tegevus) {
    try {
        const tulemus = await kauplemiseAPI('/api/demo/trade', {
            action: tegevus,
            quantity: kogus
        });

        teata(tulemus.message);

        // Kohe täitunud korralduse puhul näitame animatsiooni hetkeks.
        // Ootel korralduse animatsiooni hoiab käigus kuvaKauplemine.
        if (!tulemus.pending_order) {
            hetkeAnimatsioon = tegevus;
            kuvaKauplemine();

            setTimeout(() => {
                hetkeAnimatsioon = null;
                kuvaKauplemine();
            }, 800);
        }

    } catch (viga) {
        teata(`Viga: ${viga.message}`);
    }
}


// Peatame ootel korralduse, juba täidetud osad jäävad kehtima.
async function peataKorraldus() {
    try {
        const tulemus = await kauplemiseAPI('/api/demo/cancel-order');
        teata(tulemus.message);
    } catch (viga) {
        teata(`Viga: ${viga.message}`);
    }
}


// Suured nupud muudavad kogust 10 kaupa, väikesed 0,5 kaupa.
sammuNupud.forEach(nupp => {
    nupp.addEventListener('click', () => {
        if (manguseis && !paringKaib) {
            const samm = Number(nupp.dataset.step);
            kogus = Math.min(
                Math.max(0.5, kogus + samm),
                manguseis.capacity
            );
        }

        kuvaKauplemine();
    });
});


// Seome OSTA ja MÜÜ nupud Pythoni tehingutega.
// Kui sama suuna korraldus on ootel, peatab nupp selle.
function nupuVajutus(tegevus) {
    if (manguseis?.pending_order?.tegevus === tegevus) {
        peataKorraldus();
    } else {
        teeTehing(tegevus);
    }
}

leia('.battery-buy-button').addEventListener(
    'click', () => nupuVajutus('buy')
);

leia('.battery-sell-button').addEventListener(
    'click', () => nupuVajutus('sell')
);


// Hõljumisel kuvame tehingu eelvaate
const maaraEelvaade = tegevus => {
    eelvaade = tegevus;
    kuvaKauplemine();
};

leia('.battery-buy-button').addEventListener(
    'mouseenter', () => maaraEelvaade('buy')
);

leia('.battery-sell-button').addEventListener(
    'mouseenter', () => maaraEelvaade('sell')
);

leia('.battery-buy-button').addEventListener(
    'mouseleave', () => maaraEelvaade(null)
);

leia('.battery-sell-button').addEventListener(
    'mouseleave', () => maaraEelvaade(null)
);


// Graafik kasutab neid funktsioone mänguaja juhtimiseks.
window.kauplemine = {
    // Kas mäng on alustatud?
    get aktiivne() {
        return manguseis !== null;
    },

    // Kas serveripäring on pooleli?
    get toimetab() {
        return paringKaib;
    },

    // Taastab Pythonis olemasoleva mänguseisu.
    taasta: taastaKauplemine,

    // Kui kuupäeva pole, valib Python ise juhusliku päeva.
    alusta: (paev, ainultPuudumisel = false) => kauplemiseAPI(
        '/api/demo/start',
        { date: paev || null, only_if_missing: ainultPuudumisel }
    ),

    // Viimane teadaolev mänguseis
    get seis() {
    return manguseis;
},
   
// Uuendame brauseris kuvatavat mänguseisu kohaliku hinnapunktiga.
// See funktsioon ei saada serverisse ühtegi päringut.
kuvaHind: (hind, indeks) => {
    if (!manguseis || paringKaib) return;

    // Arvutame kuvatava vara väärtuse ja kasumiprotsendi.
    const vara = manguseis.balance + manguseis.energy * hind.price;

    const protsent = (
        (vara - manguseis.initial_balance) /
        manguseis.initial_balance
    ) * 100;

    // Uuendame ainult brauseri kuvamisandmeid.
    // Päris tehinguhinna määrab endiselt Python.
    manguseis = {
        ...manguseis,
        index: indeks,
        price: hind.price,
        timestamp: hind.timestamp,
        asset_value: Math.round(vara * 100) / 100,
        profit_percent: Math.round(protsent * 10) / 10
    };

    kuvaKauplemine();
},

    // Jätkame serveripõhist mängukella.
    jatka: () => kauplemiseAPI('/api/demo/resume'),

    // Paneme serveripõhise mängukella pausile.
    peata: () => kauplemiseAPI('/api/demo/pause'),

    // Muudame serveris mängukiirust.
    muudaKiirust: speed => kauplemiseAPI(
        '/api/demo/speed',
        { speed }
    ),

    // Alustame järgmist päeva pärast eelmise päeva lõppu.
    uusPaev: () => kauplemiseAPI('/api/demo/next-day'),

    // Kuvab mängijale teate.
    teata,

    // Tühjendab kohaliku mänguvaate.
    nulli() {
        if (paringKaib) return;

        manguseis = null;
        kogus = 1;
        hetkeAnimatsioon = null;

        kuvaKauplemine();
        teata('Mängu alustamiseks vajuta Play.');
    }
};


// Kuvame algseisu.
// Mängu käivitab chart.js pärast lehe laadimist.
kuvaKauplemine();
teata('Laen mänguseisu...');
