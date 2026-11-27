// Seadistuse leht: pood, akude valik ja generaatorite kuvamine.
// Autor: Karl-Martin Lokk

// Poe akud. Need andmed peavad ühtima serveri failiga gridrush/batteries.py.
const POE_AKUD = [
    { id: 'starter', nimi: 'Starter', maht: 10, voimsus: 10, hind: 0 },
    { id: 'basic', nimi: 'Basic', maht: 15, voimsus: 12, hind: 1500 },
    { id: 'storage', nimi: 'Storage', maht: 30, voimsus: 10, hind: 4000 },
    { id: 'rapid', nimi: 'Rapid', maht: 15, voimsus: 30, hind: 5000 },
    { id: 'advanced', nimi: 'Advanced', maht: 40, voimsus: 40, hind: 10000 },
    { id: 'mega_storage', nimi: 'Mega Storage', maht: 60, voimsus: 25, hind: 15000 },
    { id: 'hypercharge', nimi: 'HyperCharge', maht: 35, voimsus: 70, hind: 22000 },
    { id: 'industrial', nimi: 'Industrial', maht: 90, voimsus: 45, hind: 32000 },
    { id: 'ultragrid', nimi: 'UltraGrid', maht: 100, voimsus: 100, hind: 50000 },
    { id: 'titan', nimi: 'Titan', maht: 160, voimsus: 120, hind: 90000 }
];


/*
 * Päikesepaneelide ja tuulikute pood.
 * Need mudelid peavad vastama Pythonis
 * gridrush/generators.py failis olevatele mudelitele.
 */

const PAIKESEPARGID = [
    {
        id: 'solar_1',
        nimi: 'Mini',
        voimsus: 1,
        hind: 2500
    },
    {
        id: 'solar_2',
        nimi: 'Basic',
        voimsus: 2,
        hind: 4800
    },
    {
        id: 'solar_3',
        nimi: 'Plus',
        voimsus: 3,
        hind: 7100
    },
    {
        id: 'solar_4',
        nimi: 'Field',
        voimsus: 5,
        hind: 11500
    },
    {
        id: 'solar_5',
        nimi: 'SolarGrid',
        voimsus: 8,
        hind: 18000
    },
    {
        id: 'solar_6',
        nimi: 'Pro',
        voimsus: 10,
        hind: 22500
    },
    {
        id: 'solar_7',
        nimi: 'Advanced',
        voimsus: 15,
        hind: 33500
    },
    {
        id: 'solar_8',
        nimi: 'Industrial',
        voimsus: 20,
        hind: 45000
    },
    {
        id: 'solar_9',
        nimi: 'Mega Solar',
        voimsus: 30,
        hind: 68000
    },
    {
        id: 'solar_10',
        nimi: 'Solar Titan',
        voimsus: 50,
        hind: 115000
    }
];

const TUULIKUD = [
    {
        id: 'wind_1',
        nimi: 'Breeze',
        voimsus: 1,
        hind: 5700
    },
    {
        id: 'wind_2',
        nimi: 'WindStart',
        voimsus: 2,
        hind: 11000
    },
    {
        id: 'wind_3',
        nimi: 'Aero',
        voimsus: 3,
        hind: 16000
    },
    {
        id: 'wind_4',
        nimi: 'WindPro',
        voimsus: 4,
        hind: 21000
    },
    {
        id: 'wind_5',
        nimi: 'Zephyr',
        voimsus: 5,
        hind: 26000
    },
    {
        id: 'wind_6',
        nimi: 'Storm',
        voimsus: 6,
        hind: 31000
    },
    {
        id: 'wind_7',
        nimi: 'Storm Plus',
        voimsus: 8,
        hind: 41000
    },
    {
        id: 'wind_8',
        nimi: 'WindMax',
        voimsus: 10,
        hind: 51000
    },
    {
        id: 'wind_9',
        nimi: 'Offshore',
        voimsus: 12,
        hind: 60000
    },
    {
        id: 'wind_10',
        nimi: 'Titan Wind',
        voimsus: 15,
        hind: 75000
    }
];

const IKOONID = 'img/icons/icons.svg';

const PAIKESE_IKOON =
    `<use class="icon-panel" href="${IKOONID}#icon-solar-panel"/>` +
    `<use class="icon-sun" href="${IKOONID}#icon-sun"/>`;

const TUULIKU_IKOON =
    `<use class="icon-wind" href="${IKOONID}#icon-wind"/>` +
    `<use class="icon-tower" href="${IKOONID}#icon-turbine-tower"/>` +
    `<use class="icon-rotor" href="${IKOONID}#icon-turbine-rotor"/>`;

// Starter on kohe olemas ja valitud, teised akud tuleb osta.
function looAkuKaart(aku) {
    const ostetav = aku.hind > 0;

    // Eesti lokaat ei pane neljakohalistesse arvudesse tühikut, ilma selleta oleks "1500 €".
    const ost = ostetav
        ? `<span class="store-item-price">${aku.hind.toLocaleString('et-EE', { useGrouping: 'always' })} €</span>
           <button type="button" class="store-buy">Osta</button>`
        : '';

    return `
        <div class="store-item ${ostetav ? 'locked' : 'selected'}" data-battery-id="${aku.id}">
            <span class="store-item-name">${aku.nimi}</span>
            <span class="store-item-spec store-item-capacity">${aku.maht} MWh</span>
            <span class="store-item-spec store-item-power">${aku.voimsus} MW</span>
            <div class="store-item-battery"></div>
            ${ost}
        </div>`;
}

function looGeneraatoriKaart(nimi, voimsus, ikoon) {
   
function looGeneraatoriKaart(generaator, ikoon, liik) {

    const hind = generaator.hind.toLocaleString(
        'et-EE',
        { useGrouping: 'always' }
    );

    return `
        <div
            class="store-item locked"
            data-generator-id="${generaator.id}"
        >
            <span class="store-item-name">
                ${liik} ${generaator.nimi}
            </span>

            <span class="store-item-spec">
                ${generaator.voimsus} MW
            </span>

            <span class="store-item-price">
                ${hind} €
            </span>

            <svg
                class="store-item-icon"
                viewBox="0 0 48 48"
                aria-hidden="true"
            >
                ${ikoon}
            </svg>

            <button
                type="button"
                class="store-buy"
            >
                Osta
            </button>
        </div>
    `;
}

}


function looPood() {

    // ==========================================
    // AKUD
    // ==========================================

    document.querySelector(
        '.buy-batteries .store-row'
    ).innerHTML = POE_AKUD
        .map(looAkuKaart)
        .join('');

    // ==========================================
    // PÄIKESEPANEELID
    // ==========================================

    document.querySelector(
        '.buy-solar-panels .store-row'
    ).innerHTML = PAIKESEPARGID
        .map(generaator =>
            looGeneraatoriKaart(
                generaator,
                PAIKESE_IKOON,
                'Päikesepark'
            )
        )
        .join('');

    // ==========================================
    // TUULIKUD
    // ==========================================

    document.querySelector(
        '.buy-wind-turbines .store-row'
    ).innerHTML = TUULIKUD
        .map(generaator =>
            looGeneraatoriKaart(
                generaator,
                TUULIKU_IKOON,
                'Tuulik'
            )
        )
        .join('');
}


looPood();

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

    // Loeme Pythoni kinnitatud mänguseisu.
    const seis = tulemus.active ? tulemus : null;

    // Uuendame raha, kasumit ja aku näitajaid.
    kuvaParemPaneel(seis);

    // Uuendame seadistuse lehe aku laetust.
    kuvaSeadistuseLaetus(seis);

    // Uuendame ostetud akusid ja aktiivset akut.
    kuvaOmatudAkud(seis);

    // Uuendame mängijale kuuluvaid
    // päikesepaneele ja tuulikuid.
    kuvaOmatudGeneraatorid(seis);
}


document.querySelectorAll('.store-buy').forEach(nupp => {

    nupp.addEventListener('click', async event => {

        // Takistame ostunupu klõpsu levimist
        // aku valimise sündmuse käsitlejale.
        event.stopPropagation();

        const kaart = nupp.closest('.store-item');

        // Väldime mitut samaaegset ostupäringut
        // sama nupu kaudu.
        nupp.disabled = true;

        try {

            // ==================================
            // PÄIKESEPANEELI VÕI TUULIKU OST
            // ==================================

            if (kaart.dataset.generatorId) {

                const generaatoriId = (
                    kaart.dataset.generatorId
                );

                // Saadame ostu serverile.
                const tulemus = await saadaAPI(
                    '/api/demo/buy-generator',
                    {
                        generator_id: generaatoriId
                    }
                );

                // Uuendame rahajääki ja ostetud seadmeid.
                uuendaSeadistus(tulemus);

                return;
            }

            // ==================================
            // AKU OST
            // ==================================

            if (kaart.dataset.batteryId) {

                const andmed = {
                    battery_id: kaart.dataset.batteryId
                };

                // Ostame aku serveris.
                const ostuTulemus = await saadaAPI(
                    '/api/demo/buy-battery',
                    andmed
                );

                uuendaSeadistus(ostuTulemus);

                // Aktiveerime äsja ostetud aku.
                const vahetuseTulemus = await saadaAPI(
                    '/api/demo/switch-battery',
                    andmed
                );

                uuendaSeadistus(vahetuseTulemus);
            }

        } catch (viga) {

            // Kui raha ei jätku või server tagastab vea,
            // ei muuda me seadme omandust brauseris.
            window.alert(
                `Ost ei õnnestunud: ${viga.message}`
            );

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
function looAkuIkoon(aku) {
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
        ikoon = `<svg class="battery-type" aria-hidden="true"><use href="img/icons/icons.svg#icon-battery-${tuup}"/></svg>`;
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
    document.getElementById('setup-battery-art').innerHTML = looAkuIkoon(aku);
    document.getElementById('setup-battery-capacity').textContent = loeTekst(aku, '.store-item-capacity');
    document.getElementById('setup-battery-power').textContent = loeTekst(aku, '.store-item-power');
}

// Joonistame poe akud. Klikk valib aku, kui see on juba ostetud.
akud.forEach(aku => {
    aku.querySelector('.store-item-battery').innerHTML = looAkuIkoon(aku);

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

    if (omatud.length === 0) {

        // Eemaldame eelmise mängu generaatorite ikoonid.
        document.getElementById(veeruId).innerHTML = '';

        // Lähtestame koguvõimsuse.
        document.getElementById(
            `${veeruId}-total`
        ).textContent = '0 MW';

        return 0;
    }


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


// ==========================================
// OSTETUD GENERAATORITE KUVAMINE
// ==========================================

function kuvaOmatudGeneraatorid(seis) {

    // Server tagastab generaatorite ID-d:
    //
    // näiteks:
    // ["solar_1", "wind_1"]
    //
    // Kui mäng pole alustatud,
    // ei kuulu mängijale ühtegi generaatorit.

    const omatud = new Set(
        seis?.owned_generators || []
    );

    // Leiame kõik päikese- ja tuulegeneraatorite kaardid.
    const kaardid = document.querySelectorAll(
        '[data-generator-id]'
    );

    kaardid.forEach(kaart => {

        const id = kaart.dataset.generatorId;

        const onOstetud = omatud.has(id);

        // Ostetud seadmel eemaldame locked klassi.
        // Ostmata seadmel on locked klass olemas.
        kaart.classList.toggle(
            'locked',
            !onOstetud
        );
    });

    // Uuendame ostetud generaatorite ikoone
    // ja nende koguvõimsust.
    naitaGeneraatoreid();
}


kuvaOmatudGeneraatorid(null);
