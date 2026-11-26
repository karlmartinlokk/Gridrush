// Simulatsiooni, seadistuse ja statistika lehe ühine paneel: raha, kasum ja aku.
// Autor: Karl-Martin Lokk

// Kuvab mänguseisu parempoolses paneelis. Kui mängu pole alustatud, on s null.
function kuvaParemPaneel(s) {
    const leiaElement = valija => document.querySelector(valija);
    const eurodes = arv => arv.toLocaleString('et-EE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });

    // Rahajääk ja aku täituvus
    leiaElement('.ri-money-sum span').textContent =
        s ? `${eurodes(s.balance)} €` : '- €';

    leiaElement('.battery-percent').textContent =
        s ? `${Math.round(s.energy / s.capacity * 100)}%` : '0%';

    leiaElement('.battery-capacity').textContent =
        s ? `${s.energy} / ${s.capacity} MWh` : '0 / 10 MWh';

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
        const vastus = await fetch('/api/demo/state', { cache: 'no-store' });
        const tulemus = await vastus.json();
        const seis = vastus.ok && tulemus.active ? tulemus : null;

        kuvaParemPaneel(seis);
        kuvaPaevadeLoendur(seis);
        kuvaSeadistuseLaetus(seis);
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
    if (window.kauplemine) return;

    const seis = await laadiParemPaneel();

    // Käiva mängu seisu uuendame iga 5 sekundi järel.
    if (seis && seis.running) {
        setInterval(laadiParemPaneel, 5000);
    }
});
