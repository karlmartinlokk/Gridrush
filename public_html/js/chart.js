
// Kuvab Eesti elektrihinnad liikuval joongraafikul.

// Graafiku ja mängu muutujad
let chart = null;
let hinnad = [];
let hetkeIndeks = 0;
let taimer = null;
let laetudKuupaev = "";
let paringuNumber = 0;

// Üks mängupäev kestab ligikaudu 60 sekundit
// Tavakiiruse peal tekib iga 15-minutiline punkt ehk üks ajahetk iga sekund
const TAVALINE_SAMM_MS = 90000 / 96;

let kiirus = 1;

// Leiame kiiruse valiku HTML-ist
const kiiruseNupud = document.querySelectorAll(".speed-buttons button");

// Leiame HTML-ist vajalikud elemendid
const kuupaev = document.getElementById("date");
const teade = document.getElementById("message");
const stats = document.getElementById("stats");
const praeguneHind = document.getElementById("current-price")

const playPauseNupp = document.getElementById("play-pause");
const resetNupp = document.getElementById("reset");


// Muudame graafiku kiirust ka liikumise ajal
function muudaKiirust(event) {
    const valitudNupp = event.currentTarget;
    kiirus = Number(valitudNupp.dataset.speed);

    kiiruseNupud.forEach(nupp => {
        nupp.setAttribute("aria-pressed", String(nupp === valitudNupp));
    });

    // Kui graafik on peatatud, rakendub kiirus järgmisel Start-il
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

    teade.textContent =`${kell(praegune.timestamp)} | ${praegune.price} €/MWh`;
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
        teade.textContent = "Päev läbi";
    }

    uuendaNupud();
}


// Käivitame graafiku liikumise

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
    teade.textContent = "Pausil";

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

    teade.textContent = "Laen hindu…";
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
        laetudKuupaev = andmed.date;

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

                        borderColor: "#cbd2da",
                        borderWidth: 2,

                        // Näitame väikest punkti ainult joone lõpus
                        pointRadius: context =>
                            context.dataIndex === hetkeIndeks
                                ? 4
                                : 0,

                        pointHoverRadius: 5,
                        tension: 0.2,
                        fill: false
                    }]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    // Uue punkti ilmumisel lühike animatsioon
                    animation: {
                        duration: 200
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
                                display: false
                            },

                            ticks: {
                                color: "#8b949e",
                                maxTicksLimit: 12,
                                maxRotation: 0
                            }
                        },

                        y: {
                            title: {
                                display: true,
                                text: "€/MWh",
                                color: "#8b949e"
                            },

                            grid: {
                                color: "#252a31"
                            },

                            ticks: {
                                color: "#8b949e"
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

        teade.textContent = `Viga: ${viga.message}`;

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
