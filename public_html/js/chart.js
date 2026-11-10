
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

// Leiame kiiruse valiku HTML-ist
const kiiruseValik = document.getElementById("speed");

// Leiame HTML-ist vajalikud elemendid
const kuupaev = document.getElementById("date");
const teade = document.getElementById("message");
const stats = document.getElementById("stats");

const startNupp = document.getElementById("start");
const pauseNupp = document.getElementById("pause");
const resetNupp = document.getElementById("reset");


// Muudame graafiku kiirust ka liikumise ajal
function muudaKiirust() {
    // Kui graafik on peatatud, rakendub kiirus järgmisel Start-il
    if (taimer === null) {
        return;
    }

    // Peatame vana intervalli
    peataTaimer();

    // Arvutame uue intervalli
    const kiirus = Number(kiiruseValik.value);
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

    startNupp.disabled =
        !valmis ||
        taimer !== null ||
        hetkeIndeks >= hinnad.length - 1;

    pauseNupp.disabled = taimer === null;
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
        `${nahtudHinnad.length}/${hinnad.length} hinnapunkti · ` +
        `Min ${min.toFixed(2)} · ` +
        `Max ${max.toFixed(2)} · ` +
        `Keskmine ${keskmine.toFixed(2)} €/MWh`;

    // Kuvame kuupäeva ja praeguse mänguaja
    teade.textContent =
        `Kuupäev: ${laetudKuupaev} · ` +
        `Mänguaeg: ${kell(praegune.timestamp)}`;
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
        teade.textContent += " · Päev läbi";
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

    // Loeme kasutaja valitud kiiruse
    const kiirus = Number(kiiruseValik.value);

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
    teade.textContent += " · Pausil";

    uuendaNupud();
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

// Kiiruse muutmine rippmenüüst
kiiruseValik.addEventListener(
    "change", muudaKiirust
);

startNupp.addEventListener(
    "click", alustaGraafik
);

pauseNupp.addEventListener(
    "click", peataGraafik
);

resetNupp.addEventListener(
    "click", nulliGraafik
);


// Laeme graafiku lehe avamisel
laadiGraafik();
