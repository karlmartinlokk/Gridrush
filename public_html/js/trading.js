/** GRIDRUSH-DOC: moodul
 * KAUPLEMISLIIDES: ostu ja müügi nupud, akuvaade, raha ning tehingute API.
 * Python vastutab arvestuse eest; brauser kuvab ainult serveri kinnitatud tulemusi.
 * chart.js kutsub kuvaHind, et uuendada hetkehinna põhist vara väärtuse eelvaadet.
 */


// Kauplemise juhtimine. Raha ja aku muutusi arvutab Python.
let manguseis = null;
let kogus = 1;
let paringKaib = false;
let eelvaade = null;

// Leiame kasutajaliidese elemendid.
const leia = valija => document.querySelector(valija);
const euro = arv => arv.toLocaleString('et-EE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
});
const teata = tekst => leia('.event-container').textContent = tekst;
const sammuNupud = document.querySelectorAll('.target-step-button');


// Kuvame serverist saadud mänguseisu.
/** GRIDRUSH-DOC: function kuvaKauplemine
 * Värskendab ostu-müügi nupud, koguse, tehingu eelvaate, raha ja aku.
 * Nupud keelatakse, kui serveri seisu, aku mahtu või raha ei jätku.
 * Kuvab serverist saadud kasumi (või kohaliku kuvaHind arvutuse) ja aku SVG.
 * Ei tee võrgupäringut; uuendab ainult DOM-i.
 */
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

    // Kontrollime, kas ost ja müük on võimalikud.
    const summa = s ? kogus * s.price : 0;

    // Hõljumisel näitame kui palju raha muutuks nupuvajutusel
    const rahaMuutus =
        eelvaade === 'buy' ? -summa :
        eelvaade === 'sell' ? summa : null;

    const vaartusElement = leia('.target-value');

    if (!s) {
        vaartusElement.textContent = '- €';
    } else if (rahaMuutus === null) {
        vaartusElement.textContent = `${euro(summa)} €`;
    } else {
        const mark = rahaMuutus > 0 ? '+' : rahaMuutus < 0 ? '-' : '';
        vaartusElement.textContent =
            `${mark}${euro(Math.abs(rahaMuutus))} €`;
    }

    vaartusElement.classList.toggle('gain', Boolean(s) && rahaMuutus > 0);
    vaartusElement.classList.toggle('loss', Boolean(s) && rahaMuutus < 0);

    leia('.battery-buy-button').disabled =
        !s || paringKaib ||
        s.energy + kogus > s.capacity ||
        s.balance - summa < -0.000001;

    leia('.battery-sell-button').disabled =
        !s || paringKaib ||
        s.energy < kogus ||
        s.balance + summa < -0.000001;

    kuvaParemPaneel(s);

    // Lukustame vajadusel graafiku juhtnupud.
    if (typeof uuendaNupud === 'function') uuendaNupud();
}


// Saadame tegevuse Pythonile ja salvestame kinnitatud vastuse.
/** GRIDRUSH-DOC: function kauplemiseAPI
 * Saadab JSON POST-päringu Pythoni API-le ja salvestab kinnitatud mänguseisu.
 * paringKaib väldib samaaegseid muutmispäringuid ning lukustab nupud.
 * Pärast /trade vastust teavitab chart.js moodulit uue serveri indeksiga.
 * Vea puhul viskab Error ning taastab nupud finally-plokis.
 * @param {string} aadress - API tee (/api/demo/...).
 * @param {Object} andmed - POST JSON keha.
 * @returns {Promise<Object>} serveri mänguseis.
 */
async function kauplemiseAPI(aadress, andmed = {}) {
    if (paringKaib)
        throw new Error('Eelmine toiming on pooleli.');

    paringKaib = true;

   // Lukustame nupud päringu töötlemise ajaks.
    kuvaKauplemine();

    try {
        const vastus = await fetch(aadress, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(andmed)
        });

        const tulemus = await vastus.json();

        if (!vastus.ok)
            throw new Error(tulemus.error || 'Päring ebaõnnestus.');

       
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
            (aadress === '/api/demo/trade' ||
            aadress === '/api/demo/next-day') &&
            typeof kontrolliSaavutusi === 'function'
        ) {
            kontrolliSaavutusi();
        }

        return tulemus;

    } finally {
        paringKaib = false;
        kuvaKauplemine();
    }
}


// Küsime Pythonilt, kas mäng on juba käimas.
/** GRIDRUSH-DOC: function taastaKauplemine
 * GET /api/demo/state taastab seansi oleku ilma uut mängu loomata.
 * Kui server ütleb active=false, tühjendatakse kohalik manguseis.
 * Päringu ajal on juhtnupud lukus; vastus määrab kuvamisoleku.
 */
async function taastaKauplemine() {

    // Väldime mitut samaaegset päringut.
    if (paringKaib) {
        throw new Error('Eelmine toiming on pooleli.');
    }

    paringKaib = true;
    kuvaKauplemine();

    try {
        // Küsime olemasoleva mänguseisu ilma seda muutmata.
        const vastus = await fetch('/api/demo/state', {
            cache: 'no-store'
        });

        const tulemus = await vastus.json();

        if (!vastus.ok) {
            throw new Error(
                tulemus.error || 'Mänguseisu ei saanud taastada.'
            );
        }

        // Kui mäng on olemas, salvestame serveri kinnitatud seisu.
        // Muidu jätame mänguseisu tühjaks.
        manguseis = tulemus.active ? tulemus : null;

        return manguseis;

    } finally {
        // Uuendame rahajäägi, aku ja tehingunupud.
        paringKaib = false;
        kuvaKauplemine();
    }
};


// Ostame või müüme valitud koguse elektrit.
/** GRIDRUSH-DOC: function teeTehing
 * Saadab valitud MWh koguse ostu või müügi Pythoni serverile.
 * Mängu raha ja aku muutub alles pärast serveri kinnitatud vastust.
 * Õnnestumisel näitab lühikest aku animatsiooni; vea korral kuvab teate.
 * @param {'buy'|'sell'} tegevus - tehingu liik.
 */
async function teeTehing(tegevus) {
    try {
        const tulemus = await kauplemiseAPI('/api/demo/trade', {
            action: tegevus,
            quantity: kogus
        });

        teata(tulemus.message);

        // Näitame hetkeks aku laadimise või tühjendamise animatsiooni.
        const aku = leia('.battery');

        aku.classList.remove('charging', 'discharging');
        aku.classList.add(
            tegevus === 'buy' ? 'charging' : 'discharging'
        );

        setTimeout(() => {
            aku.classList.remove('charging', 'discharging');
        }, 800);

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
leia('.battery-buy-button').addEventListener(
    'click', () => teeTehing('buy')
);

leia('.battery-sell-button').addEventListener(
    'click', () => teeTehing('sell')
);


// Hõljumisel kuvame tehingu eelvaate
/** GRIDRUSH-DOC: const maaraEelvaade
 * Määrab hiirega OSTA/MÜÜ nupule liikudes kuvatava rahamuutuse eelvaate.
 * Ei muuda päris raha ega akut; ainult vaartusElement'i tekst/värv.
 */
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
/** GRIDRUSH-DOC: window.kauplemine
 * Avalik liides, mida chart.js kasutab serveri mängu juhtimiseks.
 * Ekspordib taasta, alusta, jatka, peata, muudaKiirust, uusPaev ja nulli.
 * Tegelikud rahalised tehingud tehakse vaid läbi kauplemiseAPI.
 */
window.kauplemine = {
    get aktiivne() {
        return manguseis !== null;
    },

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


    teata,

    // Tühjendab kohaliku mänguvaate.
    nulli() {
        if (paringKaib) return;

        manguseis = null;
        kogus = 1;

        leia('.battery').classList.remove(
            'charging', 'discharging'
        );

        kuvaKauplemine();
        teata('Mängu alustamiseks vajuta Play.');
    }
};


// Kuvame algseisu.
// Mängu käivitab chart.js pärast lehe laadimist.
kuvaKauplemine();
teata('Laen mänguseisu...');
