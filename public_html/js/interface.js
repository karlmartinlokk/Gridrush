function kuvaParemPaneel(s) {
    const leiaElement = valija => document.querySelector(valija);
    const eurodes = arv => arv.toLocaleString('et-EE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });

    leiaElement('.ri-money-sum span').textContent =
        s ? `${eurodes(s.balance)} €` : '- €';

    leiaElement('.battery-percent').textContent =
        s ? `${Math.round(s.energy / s.capacity * 100)}%` : '0%';

    leiaElement('.battery-capacity').textContent =
        s ? `${s.energy} / ${s.capacity} MWh` : '0 / 10 MWh';

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

    if (muutus > 0) {
        muutusElement.style.color = 'var(--color-charging)';
    } else if (muutus < 0) {
        muutusElement.style.color = 'var(--color-loss, #8f4a4a)';
    } else {
        muutusElement.style.color = 'var(--color-text-tertiary)';
    }
}


function kuvaPaevadeLoendur(s) {
    const loendur = document.getElementById('day-count');
    if (!loendur) return;

    loendur.textContent =
        s && Number.isInteger(s.day_number) && s.day_number > 0
            ? `${s.day_number}. päev`
            : 'Päev -';
}


async function laadiParemPaneel() {
    try {
        const vastus = await fetch('/api/demo/state', { cache: 'no-store' });
        const tulemus = await vastus.json();
        const seis = vastus.ok && tulemus.active ? tulemus : null;

        kuvaParemPaneel(seis);
        kuvaPaevadeLoendur(seis);
        return seis;

    } catch {
        kuvaParemPaneel(null);
        kuvaPaevadeLoendur(null);
        return null;
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    if (window.kauplemine) return;

    const seis = await laadiParemPaneel();

    if (seis && seis.running) {
        setInterval(laadiParemPaneel, 5000);
    }
});
