// Simulatsiooni, seadistuse ja statistika lehe ühine kood: parempoolne paneel (raha, kasum, aku) ja saavutuste teavitused.
// Autor: Karl-Martin Lokk

async function loeAPI(aadress, veateade = 'Päring ebaõnnestus.') {
    const vastus = await fetch(aadress, { cache: 'no-store' });
    const tulemus = await vastus.json();

    if (!vastus.ok)
        throw new Error(tulemus.error || veateade);

    return tulemus;
}


async function saadaAPI(aadress, andmed = {}) {
    const vastus = await fetch(aadress, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(andmed)
    });

    const tulemus = await vastus.json();

    if (!vastus.ok)
        throw new Error(tulemus.error || 'Päring ebaõnnestus.');

    return tulemus;
}


function vormindaEuro(summa) {
    if (summa == null) return '-';

    return `${Number(summa).toLocaleString('et-EE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} €`;
}


// Määrab aku tüübi võimsuse ja mahutavuse suhte järgi.
function leiaAkuTuup(mahutavus, voimsus) {
    const suhe = voimsus / mahutavus;

    if (suhe >= 1.5) return 'power';
    if (suhe <= 0.6) return 'storage';
    return 'balanced';
}


// Kuvab mänguseisu parempoolses paneelis. Kui mängu pole alustatud, on s null.
function kuvaParemPaneel(s) {
    const leiaElement = valija => document.querySelector(valija);

    // Rahajääk ja aku täituvus
    leiaElement('.ri-money-sum span').textContent =
        s ? vormindaEuro(s.balance) : '- €';

    leiaElement('.battery-percent').textContent =
        s ? `${Math.round(s.energy / s.capacity * 100)}%` : '0%';

    leiaElement('.battery-capacity').textContent =
        s ? `${s.energy} / ${s.capacity} MWh` : '0 / 10 MWh';

    const akuNimi = s ? s.battery_models[s.active_battery].nimi : 'Starter';

    document.querySelectorAll('.battery-label').forEach(silt => {
        silt.textContent = akuNimi;
    });

    const akuIkoon = leiaElement('.ri-battery .battery');
    const tuup = s ? leiaAkuTuup(s.capacity, s.battery_power) : 'balanced';

    akuIkoon.classList.remove('balanced', 'storage', 'power');
    akuIkoon.classList.add(tuup);
    akuIkoon.classList.toggle('top-tier', Boolean(s) && s.capacity >= 100);

    // Täis aku täidise laius SVG-s on 184 ühikut.
    leiaElement('#battery-fill').setAttribute(
        'width', s ? 184 * s.energy / s.capacity : 0
    );

    const muutusElement = leiaElement('.ri-gain-percent');
    const muutus = s ? s.profit_percent : null;

    if (muutus === null) {
        muutusElement.textContent = '-';
        muutusElement.style.color = 'var(--color-text-tertiary)';
        return;
    }

    muutusElement.textContent =
        `${muutus > 0 ? '+' : ''}${muutus.toFixed(1)}%`;

    // Värv näitab, kas mängija on kasumis, kahjumis või nullis.
    if (muutus > 0) {
        muutusElement.style.color = 'var(--color-charging)';
    } else if (muutus < 0) {
        muutusElement.style.color = 'var(--color-loss, #8f4a4a)';
    } else {
        muutusElement.style.color = 'var(--color-text-tertiary)';
    }
}


// Kuvab mängupäeva numbri lehtedel, kus päevaloendur on olemas.
function kuvaPaevadeLoendur(s) {
    const loendur = document.getElementById('day-count');
    if (!loendur) return;

    loendur.textContent =
        s && Number.isInteger(s.day_number) && s.day_number > 0
            ? `${s.day_number}. päev`
            : 'Päev -';
}


// Kuvab seadistuse lehel aku laetuse püstise tulbana.
function kuvaSeadistuseLaetus(s) {
    const taide = document.getElementById('setup-charge-fill');
    if (!taide) return;

    const korgus = s ? 251 * s.energy / s.capacity : 0;

    // SVG y-telg kasvab allapoole, seega nihutame tulba ülaserva, et see täituks alt üles.
    taide.setAttribute('height', korgus);
    taide.setAttribute('y', 255.5 - korgus);
}


// Küsib serverilt mänguseisu ja uuendab kõiki paneele.
async function laadiParemPaneel() {
    try {
        const tulemus = await loeAPI('/api/demo/state');
        const seis = tulemus.active ? tulemus : null;

        kuvaParemPaneel(seis);
        kuvaPaevadeLoendur(seis);
        kuvaSeadistuseLaetus(seis);
        if (typeof kuvaOmatudAkud === 'function') kuvaOmatudAkud(seis);
        return seis;

    } catch {
        // Kui server ei vasta, kuvame tühja seisu.
        kuvaParemPaneel(null);
        kuvaPaevadeLoendur(null);
        kuvaSeadistuseLaetus(null);
        return null;
    }
}


// Simulatsiooni lehel uuendab paneeli trading.js, teistel lehtedel teeme seda siin.
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof laadiStatistika !== 'function') {
        kontrolliSaavutusi();
    }

    if (window.kauplemine) return;

    const seis = await laadiParemPaneel();

    // Käiva mängu seisu uuendame iga 5 sekundi järel.
    if (seis && seis.running) {
        setInterval(laadiParemPaneel, 5000);
    }
});


const achievementIcons = {
    first_buy: 'buy',
    first_sell: 'sell',
    full_battery: 'battery-full',
    empty_battery: 'battery-empty',
    negative_price: 'bolt-minus',
    double_money: 'coin-1',
    power_trader: 'coin-2',
    energy_baron: 'coin-3',
    trades_10: 'swap-1',
    trades_100: 'swap-2',
    trades_1000: 'swap-3',
    energy_100: 'bolt-tag',
    days_10: 'calendar-1',
    days_30: 'calendar-2',
    streak_5: 'trend'
};


function looSvgIkoon(nimi, klass) {
    const svgNimeruum = 'http://www.w3.org/2000/svg';
    const ikoon = document.createElementNS(svgNimeruum, 'svg');
    const viide = document.createElementNS(svgNimeruum, 'use');

    ikoon.setAttribute('class', klass);
    ikoon.setAttribute('aria-hidden', 'true');
    viide.setAttribute('href', `img/icons/achievements.svg#icon-${nimi}`);

    ikoon.append(viide);

    return ikoon;
}


function naitaSaavutust(saavutus) {
    let konteiner = document.querySelector('.popup-container');

    if (!konteiner) {
        konteiner = document.createElement('div');
        konteiner.className = 'popup-container';
        konteiner.setAttribute('aria-live', 'polite');
        document.body.append(konteiner);
    }

    const teade = document.createElement('div');
    teade.className = 'achievement-popup';

    const silt = document.createElement('div');
    silt.className = 'achievement-popup-label';
    silt.textContent = 'Saavutus avatud!';

    const nimi = document.createElement('div');
    nimi.className = 'achievement-popup-name';
    nimi.textContent = saavutus.name;

    const kirjeldus = document.createElement('div');
    kirjeldus.className = 'achievement-popup-description';
    kirjeldus.textContent = saavutus.description;

    const tekst = document.createElement('div');
    tekst.className = 'achievement-popup-text';
    tekst.append(silt, nimi, kirjeldus);

    teade.append(
        looSvgIkoon(
            achievementIcons[saavutus.id] || 'trend',
            'achievement-popup-icon'
        ),
        tekst
    );
    konteiner.append(teade);

    setTimeout(() => {
        teade.classList.add('leaving');
        teade.addEventListener('animationend', () => teade.remove(), {
            once: true
        });
    }, 8000);
}


const SAAVUTUSTE_VOTI = 'gridrush-unlocked';

function loeTeadaolevad() {
    try {
        return JSON.parse(localStorage.getItem(SAAVUTUSTE_VOTI));
    } catch {
        return null;
    }
}


function salvestaTeadaolevad(tunnused) {
    try {
        localStorage.setItem(SAAVUTUSTE_VOTI, JSON.stringify(tunnused));
    } catch {}
}


function kasitleSaavutusi(saavutused) {
    const avatud = saavutused.filter(a => a.unlocked);
    const teada = loeTeadaolevad();

    if (Array.isArray(teada)) {
        avatud
            .filter(a => !teada.includes(a.id))
            .forEach(naitaSaavutust);
    }

    salvestaTeadaolevad(avatud.map(a => a.id));
}


async function kontrolliSaavutusi() {
    try {
        const andmed = await loeAPI('/api/stats?scope=all');
        kasitleSaavutusi(andmed.achievements);
    } catch {}
}
