// Kuvab Eesti elektrihinnad liikuval joongraafikul.

// Graafiku ja mängu muutujad
let chart = null;
let hinnad = [];
let hetkeIndeks = 0;
let taimer = null;
let paringuNumber = 0;

// Hoiame meeles, millise kuupäeva graafik on laetud.
let graafikuPaev = "";
let serveriSeis = null;
let laadimine = false;

// Päeva lõpus ootame mängija kinnitust enne järgmise päeva alustamist.
let paevLabi = false;

// Väldime samaaegset mängu alustamist ja hinnasammu.
let kaivitamine = false;
let sammKaib = false;

// Tavakiirusel kestab üks mängupäev umbes kolm minutit.
const TAVALINE_SAMM_MS = 180000 / 96;

let kiirus = 1;

// Leiame kiiruse valiku HTML-ist.
const kiiruseNupud = document.querySelectorAll(".speed-buttons button");

// Leiame HTML-ist vajalikud elemendid.
const kuupaev = document.getElementById("date");
const teadeAeg = document.getElementById("graph-message-time");
const teade = document.getElementById("graph-message-price");
const teadeUhikud = document.getElementById("graph-message-unit");
const stats = document.getElementById("stats");

const playPauseNupp = document.getElementById("play-pause");
const resetNupp = document.getElementById("reset");

// Päeva lõpu teavitusaken (lisatakse index.html faili).
const paevaLopuDialog = document.getElementById("day-end-dialog");


// Muudame graafiku kiirust ka liikumise ajal.
function muudaKiirust(event) {
    const valitudNupp = event.currentTarget;
    kiirus = Number(valitudNupp.dataset.speed);

    kiiruseNupud.forEach(nupp => {
        nupp.setAttribute("aria-pressed", String(nupp === valitudNupp));
    });

    // Kui graafik on peatatud, rakendub kiirus järgmisel käivitamisel.
    if (taimer === null) {
        return;
    }

    // Peatame vana intervalli.
    peataTaimer();

    // Arvutame uue intervalli.
    const intervall = TAVALINE_SAMM_MS / kiirus;

    // Jätkame sama koha pealt uue kiirusega.
    taimer = setInterval(lisaPunkt, intervall);

    uuendaNupud();
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


// Alustame järgmist päeva ainult mängija kinnitamisel.
async function alustaUutPaeva() {
    // Väldime korduvaid või kattuvaid päevavahetusi.
    if (
        !paevLabi ||
        sammKaib ||
        laadimine ||
        window.kauplemine?.toimetab
    ) return;

    // Leiame teavituse nupu ja veateate elemendi.
    const nupp = document.getElementById('next-day-button');
    const veateade = document.getElementById('day-end-error');

    // Märgime, et järgmise päeva laadimine on pooleli.
    sammKaib = true;
    nupp.disabled = true;
    veateade.textContent = '';

    uuendaNupud();

    try {
        // Loeme Pythoni viimase kinnitatud mänguseisu.
        let seis = window.kauplemine?.seis;

        if (!seis) {
            throw new Error('Mänguseis puudub.');
        }

        // Kui Python on veel vana päeva viimase hinna juures,
        // küsime serverilt järgmise sobiva päeva.
        //
        // Kui uue päeva graafik varem laadida ei õnnestunud,
        // siis server on juba järgmises päevas ja me ei liigu uuesti edasi.
        if (
            seis.date === graafikuPaev &&
            seis.index === hinnad.length - 1
        ) {
            seis = await window.kauplemine.jargmine();
        }

        // Salvestame serveri kinnitatud mänguseisu.
        serveriSeis = seis;

        // Muudame kuupäevavälja uuele kuupäevale.
        kuupaev.value = seis.date;

        // Laeme uue päeva hinnad ja graafiku.
        // sailitaMang: true tähendab, et raha ja akut ei lähtestata.
        const korras = await laadiGraafik({
            sailitaMang: true
        });

        if (!korras) {
            throw new Error(
                'Uue päeva graafikut ei saanud laadida.'
            );
        }

        // Alustame serveri kinnitatud hinnapunktist.
        hetkeIndeks = seis.index;

        // Kuvame ainult juba läbitud hinnad.
        chart.data.datasets[0].data = hinnad.map(
            (h, i) => i <= hetkeIndeks ? h.price : null
        );

        kuvaSeis();

        // Uue päeva laadimine õnnestus.
        paevLabi = false;

        // Sulgeme päeva lõpu teavituse.
        paevaLopuDialog?.close();

        // Käivitame mängu senise kiirusega.
        taimer = setInterval(
            lisaPunkt,
            TAVALINE_SAMM_MS / kiirus
        );

        // Näitame mängijale uue päeva alguse teadet.
        window.kauplemine.teata(
            `Algas uus mängupäev: ${seis.date}`
        );

    } catch (viga) {
        // Vea korral jääb mäng peatunuks.
        // Mängija saab proovida uut päeva uuesti alustada.
        veateade.textContent = `Viga: ${viga.message}`;

    } finally {
        // Vabastame ajutised lukustused.
        sammKaib = false;
        nupp.disabled = false;

        uuendaNupud();
    }
}


// Uuendame graafiku juhtnuppe vastavalt mängu olekule.
function uuendaNupud() {
    const kaib = taimer !== null;

    // Lukustame nupud mängu käivitamisel ja laadimisel,
    // mitte iga hinnauuenduse ajal.
    //
    // Nii ei vilgu Play ja Reset iga hinnapäringuga.
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
}


// Liigume järgmise hinnapunkti juurde Pythoni kinnitusega.
async function lisaPunkt() {
    // Väldime samaaegseid hinnauuendusi ja tehingupäringuid.
    if (
        !chart ||
        !window.kauplemine?.aktiivne ||
        window.kauplemine.toimetab ||
        sammKaib ||
        laadimine
    ) return;

    // Kui viimane hinnapunkt on juba kuvatud,
    // siis lõppes nüüd ka selle hinnaperioodi aeg.
    //
    // Peatame mängu ja ootame kasutajalt järgmise päeva kinnitust.
    // Pythonile uut hinnapäringut veel ei saadeta.
    if (hetkeIndeks >= hinnad.length - 1) {
        peataTaimer();

        // Märgime mängu päeva lõppu jõudnuks.
        paevLabi = true;

        // Näitame päeva lõpu teavitust.
        avaPaevaLopuTeavitus();

        uuendaNupud();
        return;
    }

    sammKaib = true;
    uuendaNupud();

    try {
        // Python otsustab, milline hinnapunkt on järgmine.
        const uusSeis = await window.kauplemine.jargmine();

        serveriSeis = uusSeis;

        // Uue päeva tuvastamine jääb alles ka varuvariandina.
        // Päevavahetuse teavitus peaks tavaliselt jõudma enne seda.
        if (
            uusSeis.date !== graafikuPaev ||
            uusSeis.index < hetkeIndeks
        ) {
            kuupaev.value = uusSeis.date;

            const korras = await laadiGraafik({
                sailitaMang: true
            });

            if (!korras) {
                throw new Error(
                    'Järgmise päeva hindu ei saanud laadida.'
                );
            }

            // Uus päev algab serveri määratud hinnapunktist.
            hetkeIndeks = uusSeis.index;

            kuvaSeis();

            window.kauplemine.teata(
                `Uus mängupäev: ${uusSeis.date}`
            );

        } else {
            // Sama päeva korral lisame järgmise hinnapunkti.
            hetkeIndeks = uusSeis.index;
            kuvaSeis();
        }

    } catch (viga) {
        // Serverivea korral peatame mängu.
        peataTaimer();

        window.kauplemine?.teata(
            `Viga: ${viga.message}`
        );

    } finally {
        sammKaib = false;
        uuendaNupud();
    }
}


// Käivitame graafiku ja vajadusel alustame Pythonis mängu.
async function alustaGraafik() {
    // Kui eelmine päev lõppes, näitame uue päeva valikut.
    // Me ei käivita vana päeva taimerit uuesti.
    if (paevLabi) {
        avaPaevaLopuTeavitus();
        return;
    }

    // Väldime kattuvaid käivitamisi.
    if (
        taimer !== null ||
        kaivitamine ||
        sammKaib ||
        laadimine
    ) return;

    kaivitamine = true;
    uuendaNupud();

    try {
        if (!window.kauplemine) {
            throw new Error(
                'Kauplemise JavaScript puudub.'
            );
        }

        let seis;

        if (!window.kauplemine.aktiivne) {
            // Lehe avamisel valib Python juhusliku päeva.
            // Käsitsi laetud graafiku korral kasutame valitud kuupäeva.
            seis = await window.kauplemine.alusta(
                chart ? kuupaev.value : undefined
            );

        } else {
            // Pausilt jätkamisel kasutame olemasolevat mänguseisu.
            seis = window.kauplemine.seis || serveriSeis;

            if (!seis) {
                throw new Error('Mänguseis puudub.');
            }
        }

        serveriSeis = seis;

        // Kontrollime, kas graafik ja Python kasutavad sama päeva.
        if (!chart || graafikuPaev !== seis.date) {
            kuupaev.value = seis.date;

            // Laeme graafiku, aga säilitame kauplemise mänguseisu.
            const korras = await laadiGraafik({
                sailitaMang: true
            });

            if (!korras) {
                throw new Error(
                    'Graafikut ei saanud laadida.'
                );
            }
        }

        // Taastame juba nähtud hinnapunktid.
        hetkeIndeks = seis.index;

        chart.data.datasets[0].data = hinnad.map(
            (h, i) => i <= hetkeIndeks ? h.price : null
        );

        kuvaSeis();

        // Kui taastatud mäng jõudis juba viimase hinnani,
        // ei käivita me automaatselt uut päeva.
        if (hetkeIndeks >= hinnad.length - 1) {
            paevLabi = true;
            avaPaevaLopuTeavitus();
            return;
        }

        // Käivitame taimeri praegusel kiirusel.
        const intervall = TAVALINE_SAMM_MS / kiirus;

        taimer = setInterval(lisaPunkt, intervall);

        window.kauplemine.teata('Mäng käib.');

    } catch (viga) {
        // Kuvame veateate ja jätame mängu seisma.
        if (window.kauplemine) {
            window.kauplemine.teata(
                `Viga: ${viga.message}`
            );
        } else {
            teade.textContent = `Viga: ${viga.message}`;
        }

    } finally {
        kaivitamine = false;
        uuendaNupud();
    }
}


// Peatame graafiku liikumise.
function peataGraafik() {
    if (taimer === null) {
        return;
    }

    peataTaimer();

    // Tulevikus võib näidata eraldi teadet "Pausil".
    uuendaNupud();
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


// Lähtestame graafiku ja Pythoni mänguseisu.
async function nulliGraafik() {
    if (
        !chart ||
        kaivitamine ||
        sammKaib ||
        laadimine ||
        window.kauplemine?.toimetab
    ) return;

    // Peatame mängu enne lähtestamist.
    peataTaimer();

    kaivitamine = true;
    uuendaNupud();

    try {
        // Reset alustab sama päeva uuesti.
        // Raha taastub algsummale ja aku tühjeneb.
        if (window.kauplemine?.aktiivne) {
            serveriSeis = await window.kauplemine.alusta(
                kuupaev.value
            );
        }

        // Tühjendame graafiku ja kuvame esimese hinnapunkti.
        hetkeIndeks = 0;

        chart.data.datasets[0].data =
            Array(hinnad.length).fill(null);

        kuvaSeis();

        // Reset tühistab eelmise päeva lõpu oleku.
        paevLabi = false;

        // Sulgeme teavituse, kui see oli avatud.
        if (paevaLopuDialog?.open) {
            paevaLopuDialog.close();
        }

        window.kauplemine?.teata(
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

        window.kauplemine?.nulli();
        serveriSeis = null;
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
    graafikuPaev = "";

    uuendaNupud();

    try {
        // Küsime valitud kuupäeva hinnad Python backendilt.
        const url =
            `cgi-bin/get_prices.py?date=${encodeURIComponent(kuupaev.value)}`;

        const vastus = await fetch(url);
        const andmed = await vastus.json();

        // Ignoreerime vananenud päringu vastust.
        if (praeguneParing !== paringuNumber) {
            return false;
        }

        if (!vastus.ok) {
            throw new Error(
                andmed.error || "Päring ebaõnnestus."
            );
        }

        // Mängus kasutame 96 hinnapunktiga päevi.
        if (
            !Array.isArray(andmed.prices) ||
            andmed.prices.length !== 96
        ) {
            throw new Error(
                "Selle päeva 96 hinnapunkti pole saadaval."
            );
        }

        hinnad = andmed.prices;
        graafikuPaev = andmed.date;

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
                            from: context => {
                                if (
                                    context.type !== "data" ||
                                    context.dataIndex !== hetkeIndeks
                                ) {
                                    return undefined;
                                }

                                if (context.dataIndex === 0) {
                                    return undefined;
                                }

                                const punktid = context.chart
                                    .getDatasetMeta(context.datasetIndex).data;

                                const eelmine =
                                    punktid[context.dataIndex - 1];

                                return eelmine.getProps(["x"]).x;
                            }
                        },

                        y: {
                            duration: 300,

                            // Uus punkt alustab eelmise punkti kõrguselt.
                            from: context => {
                                if (
                                    context.type !== "data" ||
                                    context.dataIndex !== hetkeIndeks
                                ) {
                                    return undefined;
                                }

                                if (context.dataIndex === 0) {
                                    return undefined;
                                }

                                const punktid = context.chart
                                    .getDatasetMeta(context.datasetIndex).data;

                                const eelmine =
                                    punktid[context.dataIndex - 1];

                                return eelmine.getProps(["y"]).y;
                            }
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

        // Kuvame uue päeva esimese hinnapunkti.
        kuvaSeis();

        // Teavitame teisi funktsioone edukast laadimisest.
        return true;

    } catch (viga) {
        // Kui tegemist on vana päringuga, siis ignoreerime seda.
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


// Käivitame mängu pärast teiste skriptide laadimist.
window.addEventListener(
    "load", () => alustaGraafik()
);
