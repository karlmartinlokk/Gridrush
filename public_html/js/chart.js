// Kuvab Eesti elektrihinnad liikuval joongraafikul.

// Graafiku ja mängu muutujad
let chart = null;
let hinnad = [];
let hetkeIndeks = 0;
let taimer = null;
let paringuNumber = 0;

// Tavakiiruse peal tekib iga 15-minutiline punkt umbes 2 sekundi jooksul
const TAVALINE_SAMM_MS = 180000 / 96;

let kiirus = 1;

// Leiame kiiruse valiku HTML-ist
const kiiruseNupud = document.querySelectorAll(".speed-buttons button");

// Leiame HTML-ist vajalikud elemendid
const kuupaev = document.getElementById("date");
const teadeAeg = document.getElementById("graph-message-time");
const teade = document.getElementById("graph-message-price");
const teadeUhikud = document.getElementById("graph-message-unit");
const stats = document.getElementById("stats");

const playPauseNupp = document.getElementById("play-pause");
const resetNupp = document.getElementById("reset");


// Muudame graafiku kiirust ka liikumise ajal
function muudaKiirust(event) {
    const valitudNupp = event.currentTarget;
    kiirus = Number(valitudNupp.dataset.speed);

    kiiruseNupud.forEach(nupp => {
        nupp.setAttribute("aria-pressed", String(nupp === valitudNupp));
    });

    // Kui graafik on peatatud, rakendub kiirus järgmisel käivitamisel
    if (taimer === null) {
        return;
    }

    // Peatame vana intervalli
    peataTaimer();

    // Arvutame uue intervalli
    const intervall = TAVALINE_SAMM_MS / kiirus;

    // Jätkame sama koha pealt uue kiirusega
    taimer = setInterval(lisaPunkt, intervall);

    uuendaNupud();
}


// helper funktsioon et kasutada css-is defineeritud värve
function cssVarv(nimi) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(nimi)
        .trim();
}


// Teisendame Unix-timestambi Eesti kellaajaks
function kell(timestamp) {
    return new Date(timestamp * 1000).toLocaleTimeString(
        "et-EE", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Tallinn"
        }
    );
}


// Peatame graafiku taimeri
function peataTaimer() {
    if (taimer !== null) {
        clearInterval(taimer);
        taimer = null;
    }
}


// Muudame nuppude olekut vastavalt mängu seisule
function uuendaNupud() {
    const valmis = chart !== null;
    const kaib = taimer !== null;

    playPauseNupp.disabled =
        !valmis ||
        (!kaib && hetkeIndeks >= hinnad.length - 1);

    playPauseNupp.classList.toggle("playing", kaib);
    playPauseNupp.setAttribute("aria-label", kaib ? "Peata" : "Käivita");

    resetNupp.disabled = !valmis;
}


// Uuendame graafikut ja seni nähtud hindade statistikat
function kuvaSeis() {
    if (!chart || hinnad.length === 0) {
        return;
    }

    const praegune = hinnad[hetkeIndeks];
    
    // vaatame preaguse hinna muutust võrreldes eelmisega
    const vahe = () => {
        if (hetkeIndeks === 0) {
            return 0
        }
        const eelmine = hinnad[hetkeIndeks - 1]
        return praegune.price - eelmine.price
    }

    // Lisame graafikule ainult praeguse hinnapunkti
    chart.data.datasets[0].data[hetkeIndeks] =
        praegune.price;

    // Joonistame muudatuse graafikule
    chart.update();

    // Statistika jaoks kasutame ainult juba nähtud hindu
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

    teadeAeg.textContent = `${kell(praegune.timestamp)} |`;

    teade.textContent = praegune.price.toFixed(2);
    if (vahe() === 0) {
        teade.dataset.trend = 'Stabiilne';
    } else if (vahe() < 0) {
        teade.dataset.trend = 'Langeb';
    } else if (vahe() > 0) {
        teade.dataset.trend = 'Tõuseb';
    };

    teadeUhikud.textContent = " €/MWh";
}


// Lisame graafikule järgmise hinnapunkti
function lisaPunkt() {
    if (hetkeIndeks >= hinnad.length - 1) {
        peataTaimer();
        uuendaNupud();
        return;
    }

    // Liigume järgmise 15-minutilise hinnaperioodini
    hetkeIndeks++;

    kuvaSeis();

    // Kui kõik hinnad on nähtud, lõpetame päeva
    if (hetkeIndeks === hinnad.length - 1) {
        peataTaimer();
        teadeAeg.textContent = "";
        teade.textContent = "Päev läbi";
        teade.dataset.trend = 'Stabiilne'
        teadeUhikud.textContent = "";
    }

    uuendaNupud();
}

// Käivitame graafiku valitud kiirusega
function alustaGraafik() {
    if (
        !chart ||
        taimer !== null ||
        hetkeIndeks >= hinnad.length - 1
    ) {
        return;
    }

    // Arvutame uue hinnapunkti kuvamise intervalli
    const intervall = TAVALINE_SAMM_MS / kiirus;

    // Lisame järgmise hinnapunkti valitud aja järel
    taimer = setInterval(lisaPunkt, intervall);

    uuendaNupud();
}



// Peatame graafiku liikumise
function peataGraafik() {
    if (taimer === null) {
        return;
    }

    peataTaimer();

    // TODO: teha kuhugi paremasse kohta märge et "Pausil"

    uuendaNupud();
}


function lulitaGraafik() {
    if (taimer === null) {
        alustaGraafik();
    } else {
        peataGraafik();
    }
}


// Alustame sama päeva uuesti esimesest hinnapunktist
function nulliGraafik() {
    if (!chart) {
        return;
    }

    peataTaimer();

    // Liigume esimese hinnapunkti juurde
    hetkeIndeks = 0;

    // Eemaldame graafikult kõik varem kuvatud hinnad
    chart.data.datasets[0].data =
        Array(hinnad.length).fill(null);

    // Kuvame uuesti ainult esimese hinna
    kuvaSeis();
    uuendaNupud();
}


// Laeme valitud päeva hinnad SQLite'ist API kaudu
async function laadiGraafik() {
    peataTaimer();

    // Tuvastame, milline laadimispäring on kõige uuem
    const praeguneParing = ++paringuNumber;

    teadeAeg.textContent = "";
    teade.textContent = "Laen hindu...";
    teadeUhikud.textContent = "";
    stats.textContent = "";

    // Eemaldame eelmise graafiku
    if (chart) {
        chart.destroy();
        chart = null;
    }

    hinnad = [];
    hetkeIndeks = 0;
    uuendaNupud();

    try {
        // Küsime valitud kuupäeva hinnad Python backendilt
        const url =
            `cgi-bin/get_prices.py?date=${encodeURIComponent(kuupaev.value)}`;

        const vastus = await fetch(url);
        const andmed = await vastus.json();

        // Ignoreerime vananenud päringu vastust
        if (praeguneParing !== paringuNumber) {
            return;
        }

        if (!vastus.ok) {
            throw new Error(
                andmed.error || "Päring ebaõnnestus."
            );
        }

        if (
            !Array.isArray(andmed.prices) ||
            andmed.prices.length !== 96
        ) {
            throw new Error(
                "Selle päeva 96 hinnapunkti pole saadaval."
            );
        }

        hinnad = andmed.prices;

        // Loome joongraafiku
        chart = new Chart(
            document.getElementById("priceChart"),
            {
                type: "line",

                data: {
                    // Kellaaegade asukohad on kohe teada
                    labels: hinnad.map(
                        p => kell(p.timestamp)
                    ),

                    datasets: [{
                        label: "Elektrihind (€/MWh)",

                        // Hinnad ilmuvad ükshaaval
                        data: Array(hinnad.length).fill(null),

                        borderColor: cssVarv("--color-text-primary"),
                        borderWidth: 2,

                        // Näitame suurt punkti hetkese hinna juures ja väikest iga varasema
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

                    // Uue punkti ilmumisel lühike animatsioon
                    animations: {
                        x: {
                            duration: 300,
                            //järgmise punkti x hakkab genereerima eelmise algusest => sujuv animatsioon
                            from: context => { 
                                if (context.type !== "data" || context.dataIndex !== hetkeIndeks) {
                                    return undefined;
                                }
                                if (context.dataIndex === 0) {
                                    return undefined;
                                }
                                const punktid = context.chart.getDatasetMeta(context.datasetIndex).data;
                                const eelmine = punktid[context.dataIndex - 1];

                                return eelmine.getProps(["x"]).x;
                            }
                        },
                        
                        y: {
                            duration: 300,
                            //järgmise punkti y hakkab genereerima eelmise algusest => sujuv animatsioon
                            from: context => { 
                                if (context.type !== "data" || context.dataIndex !== hetkeIndeks) {
                                    return undefined;
                                }
                                if (context.dataIndex === 0) {
                                    return undefined;
                                }
                                const punktid = context.chart.getDatasetMeta(context.datasetIndex).data;
                                const eelmine = punktid[context.dataIndex - 1];

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
                                    if (index % 8 === 0) { // iga kahe tunni tagant 
                                        return this.getLabelForValue(value) // joon + silt
                                    } else if (index % 4 === 0) { // iga tunni tagant
                                        return "" // joon + tühi silt (ehk aint joon)
                                    } else return null // igal muul hetkel pole joont ega silti
                                },
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

        // Kuvame ainult esimese hinnapunkti
        kuvaSeis();
        uuendaNupud();

    } catch (viga) {
        if (praeguneParing !== paringuNumber) {
            return;
        }

        teadeAeg.textContent = "";
        teade.textContent = `Viga: ${viga.message}`;
        teadeUhikud.textContent = "";

        if (chart) {
            chart.destroy();
            chart = null;
        }

        uuendaNupud();
    }
}


// Seome HTML-i nupud funktsioonidega
document.getElementById("load").addEventListener(
    "click", laadiGraafik
);

// Kiiruse muutmine nuppudega
kiiruseNupud.forEach(nupp => {
    nupp.addEventListener("click", muudaKiirust);
});

playPauseNupp.addEventListener(
    "click", lulitaGraafik
);

resetNupp.addEventListener(
    "click", nulliGraafik
);


// Laeme graafiku lehe avamisel
laadiGraafik();
