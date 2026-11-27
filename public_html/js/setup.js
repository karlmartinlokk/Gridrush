// Seadistuse leht: pood, akude valik ja generaatorite kuvamine.
// Autor: Karl-Martin Lokk

const poeRead = document.querySelectorAll('.store-row');

// Hajutab poe rea serva, kui sealtpoolt saab veel edasi kerida.
function uuendaHajutust(rida) {
    const lopuni = rida.scrollWidth - rida.clientWidth - rida.scrollLeft;

    rida.classList.toggle('fade-left', rida.scrollLeft > 1);
    rida.classList.toggle('fade-right', lopuni > 1);
}

// Uuendame hajutust kerimisel, lehe avamisel ja akna suuruse muutmisel.
poeRead.forEach(rida => {
    rida.addEventListener('scroll', () => uuendaHajutust(rida), { passive: true });
    uuendaHajutust(rida);
});

window.addEventListener('resize', () => poeRead.forEach(uuendaHajutust));

function uuendaSeadistus(tulemus) {
    const seis = tulemus.active ? tulemus : null;

    kuvaParemPaneel(seis);
    kuvaSeadistuseLaetus(seis);
    kuvaOmatudAkud(seis);
}


// Aku ostu kinnitab server. Generaatorite ostmisel raha praegu maha ei arvestata.
document.querySelectorAll('.store-buy').forEach(nupp => {
    nupp.addEventListener('click', async () => {
        const kaart = nupp.closest('.store-item');

        if (!kaart.dataset.batteryId) {
            kaart.classList.remove('locked');
            naitaGeneraatoreid();
            return;
        }

        nupp.disabled = true;

        try {
            const andmed = { battery_id: kaart.dataset.batteryId };

            uuendaSeadistus(await saadaAPI('/api/demo/buy-battery', andmed));
            uuendaSeadistus(await saadaAPI('/api/demo/switch-battery', andmed));
        } finally {
            nupp.disabled = false;
        }
    });
});


const akud = document.querySelectorAll('.buy-batteries .store-item');

// Loeb poe kaardilt valitud elemendi teksti.
function loeTekst(kaart, valija) {
    return kaart.querySelector(valija).textContent;
}

// Leiab veergude arvu, millega akuelemendid täidavad kõik read täielikult.
function leiaVeerud(elemente) {
    let veerud = Math.ceil(Math.sqrt(elemente));

    while (elemente % veerud !== 0) {
        veerud++;
    }
    return veerud;
}

// Koostab aku joonise HTML-i poe kaardil olevate andmete põhjal.
function looAkuJoonis(aku) {
    const nimi = loeTekst(aku, '.store-item-name');
    const mahutavus = parseFloat(loeTekst(aku, '.store-item-capacity'));
    const voimsus = parseFloat(loeTekst(aku, '.store-item-power'));

    // Üks element tähistab umbes 10 MWh, klemmi kõrgus (%) kasvab võimsusega.
    const tuup = leiaAkuTuup(mahutavus, voimsus);
    const tase = mahutavus >= 100 ? 'top-tier' : '';
    const elemente = Math.round(mahutavus / 10);
    const klemm = 20 + voimsus * 0.45;

    // Tasakaalustatud akul eraldi tüübiikooni pole.
    let ikoon = '';
    if (tuup !== 'balanced') {
        ikoon = `<svg class="battery-type" aria-hidden="true"><use href="#icon-battery-${tuup}"/></svg>`;
    }

    return `
        <div class="battery-art ${tuup} ${tase}"
             style="--cell-columns: ${leiaVeerud(elemente)}; --terminal-height: ${klemm}%">
            <div class="battery-cells">${'<span></span>'.repeat(elemente)}</div>
            ${ikoon}
            <span class="battery-name">${nimi}</span>
        </div>`;
}

// Kuvab valitud aku joonise ja andmed seadistuse vaates.
function naitaAkut(aku) {
    document.getElementById('setup-battery-art').innerHTML = looAkuJoonis(aku);
    document.getElementById('setup-battery-capacity').textContent = loeTekst(aku, '.store-item-capacity');
    document.getElementById('setup-battery-power').textContent = loeTekst(aku, '.store-item-power');
}

// Joonistame poe akud. Klikk valib aku, kui see on juba ostetud.
akud.forEach(aku => {
    aku.querySelector('.store-item-battery').innerHTML = looAkuJoonis(aku);

    aku.addEventListener('click', async () => {
        if (aku.classList.contains('locked') || aku.classList.contains('selected')) return;

        uuendaSeadistus(await saadaAPI('/api/demo/switch-battery', {
            battery_id: aku.dataset.batteryId
        }));
    });
});

let naidatudAku = null;

function kuvaOmatudAkud(seis) {
    const omatud = seis ? seis.owned_batteries : ['starter'];
    const aktiivne = seis ? seis.active_battery : 'starter';

    akud.forEach(aku => {
        const id = aku.dataset.batteryId;

        aku.classList.toggle('locked', !omatud.includes(id));
        aku.classList.toggle('selected', id === aktiivne);
    });

    if (aktiivne === naidatudAku) return;

    naidatudAku = aktiivne;
    naitaAkut(document.querySelector(`.buy-batteries .store-item[data-battery-id="${aktiivne}"]`));
}

// Lehe avamisel kuvame vaikimisi valitud aku.
kuvaOmatudAkud(null);


// Kuvab ühes veerus ostetud generaatorid ja tagastab nende koguvõimsuse.
function taidaVeerg(veeruId, poeSektsioon) {
    const omatud = document.querySelectorAll(`${poeSektsioon} .store-item:not(.locked)`);
    if (omatud.length === 0) return 0;

    let summa = 0;
    let ikoonid = '';

    // Ikooni kujutise võtame poe kaardilt.
    omatud.forEach(generaator => {
        const nimi = loeTekst(generaator, '.store-item-name');
        const voimsus = loeTekst(generaator, '.store-item-spec');
        const ikoon = generaator.querySelector('.store-item-icon').innerHTML;

        summa += parseFloat(voimsus);
        ikoonid += `
            <div class="setup-generator" role="img" title="${nimi} (${voimsus})">
                <svg class="setup-generator-icon" viewBox="0 0 48 48" aria-hidden="true">${ikoon}</svg>
            </div>`;
    });

    document.getElementById(veeruId).innerHTML = ikoonid;
    document.getElementById(`${veeruId}-total`).textContent = `${summa} MW`;
    return summa;
}

// Uuendab päikese- ja tuuleenergia veerge ning kogutoodangut.
function naitaGeneraatoreid() {
    const paike = taidaVeerg('setup-solar', '.buy-solar-panels');
    const tuul = taidaVeerg('setup-wind', '.buy-wind-turbines');
    const kokku = paike + tuul;

    document.getElementById('setup-output-total').textContent = `${kokku} MW`;

    // Juhtmete animatsioon töötab ainult siis, kui generaatorid toodavad.
    document.querySelector('.setup-output').classList.toggle('active', kokku > 0);
}

naitaGeneraatoreid();
