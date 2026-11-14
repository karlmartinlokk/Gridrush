
// Kauplemise juhtimine. Raha ja aku muutusi arvutab Python.
let manguseis = null;
let kogus = 1;
let paringKaib = false;

// Leiame kasutajaliidese elemendid.
const leia = valija => document.querySelector(valija);
const euro = arv => arv.toLocaleString('et-EE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
});
const teata = tekst => leia('.event-container').textContent = tekst;


// Kuvame serverist saadud mänguseisu.
function kuvaKauplemine() {
    const s = manguseis;

    // Kuvame valitud elektrikoguse.
    leia('.target-amount').textContent =
        kogus.toFixed(1).replace('.', ',');

    // Piirame koguse valimist aku mahutavusega.
    leia('.target-decrease-button').disabled =
        !s || paringKaib || kogus <= 1;

    leia('.target-increase-button').disabled =
        !s || paringKaib || kogus >= s.capacity;

    // Kontrollime, kas ost ja müük on võimalikud.
    const summa = s ? kogus * s.price : 0;

    leia('.battery-buy-button').disabled =
        !s || paringKaib ||
        s.energy + kogus > s.capacity ||
        s.balance - summa < -0.000001;

    leia('.battery-sell-button').disabled =
        !s || paringKaib ||
        s.energy < kogus ||
        s.balance + summa < -0.000001;

    // Kuvame rahajäägi ja aku täituvuse.
    leia('.ri-money-sum span').textContent =
        s ? `${euro(s.balance)} €` : '– €';

    leia('.battery-percent').textContent =
        s ? `${Math.round(s.energy / s.capacity * 100)}%` : '0%';

    leia('.battery-capacity').textContent =
        s ? `${s.energy} / ${s.capacity} MWh` : '0 / 10 MWh';

    // Aku SVG täitub vastavalt salvestatud energiale.
    leia('#battery-fill').setAttribute(
        'width', s ? 184 * s.energy / s.capacity : 0
    );

    // Kasumiprotsent tuleb otse Python backendist.
    const muutusElement = leia('.ri-gain-percent');
    const muutus = s ? s.profit_percent : null;

    if (muutus === null) {
        // Kui mäng pole alanud, näitame halli kriipsu.
        muutusElement.textContent = '–';
        muutusElement.style.color =
            'var(--color-text-tertiary)';

    } else {
        // Kuvame kasumi või kahjumi protsendi.
        muutusElement.textContent =
            `${muutus > 0 ? '+' : ''}${muutus.toFixed(1)}%`;

        // Positiivne on roheline, negatiivne punane.
        if (muutus > 0) {
            muutusElement.style.color =
                'var(--color-charging)';
        } else if (muutus < 0) {
            muutusElement.style.color =
                'var(--color-loss, #8f4a4a)';
        } else {
            // Muutuse puudumisel kasutame halli.
            muutusElement.style.color =
                'var(--color-text-tertiary)';
        }
    }

    // Lukustame vajadusel graafiku juhtnupud.
    if (typeof uuendaNupud === 'function') uuendaNupud();
}


// Saadame tegevuse Pythonile ja salvestame kinnitatud vastuse.
async function kauplemiseAPI(aadress, andmed = {}) {
    if (paringKaib)
        throw new Error('Eelmine toiming on pooleli.');

    paringKaib = true;
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

        // Salvestame serveri kinnitatud mänguseisu.
        manguseis = tulemus;
        return tulemus;

    } finally {
        paringKaib = false;
        kuvaKauplemine();
    }
}


// Ostame või müüme valitud koguse elektrit.
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


// Pluss suurendab valitud elektrikogust.
leia('.target-increase-button').addEventListener('click', () => {
    if (manguseis && !paringKaib)
        kogus = Math.min(kogus + 1, manguseis.capacity);

    kuvaKauplemine();
});


// Miinus vähendab valitud elektrikogust.
leia('.target-decrease-button').addEventListener('click', () => {
    if (!paringKaib)
        kogus = Math.max(1, kogus - 1);

    kuvaKauplemine();
});


// Seome OSTA ja MÜÜ nupud Pythoni tehingutega.
leia('.battery-buy-button').addEventListener(
    'click', () => teeTehing('buy')
);

leia('.battery-sell-button').addEventListener(
    'click', () => teeTehing('sell')
);


// Graafik kasutab neid funktsioone mänguaja juhtimiseks.
window.kauplemine = {
    get aktiivne() {
        return manguseis !== null;
    },

    get toimetab() {
        return paringKaib;
    },

    // Alustab Pythonis uue mängu.
    alusta: paev => kauplemiseAPI('/api/demo/start', {
        date: paev
    }),

    // Liigub Pythonis järgmise hinnaperioodi juurde.
    jargmine: () => kauplemiseAPI('/api/demo/next'),

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
kuvaKauplemine();
teata('Mängu alustamiseks vajuta Play.');
