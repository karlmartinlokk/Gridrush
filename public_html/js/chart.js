
// Kuvab Eesti elektrihinnad joongraafikul.

// Muutuja loodud graafiku hoidmiseks
let chart;

// Leiame HTML-ist kuupäevavaliku, teadete ja statistika elemendid
const kuupaev = document.getElementById("date");
const teade = document.getElementById("message");
const stats = document.getElementById("stats");


// Teisendame Unix-timestambi Eesti kellaajaks.
function kell(timestamp) {
    // Unix-timestamp on sekundites, JavaScript kasutab millisekundeid
    return new Date(timestamp * 1000).toLocaleTimeString(
        "et-EE", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Tallinn"
        }
    );
}


// Laeme andmed ja joonistame graafiku.
async function laadiGraafik() {
    // Kuvame laadimisteate ja tühjendame eelmise statistika
    teade.textContent = "Laen hindu…";
    stats.textContent = "";

    try {
        // Koostame API päringu valitud kuupäevaga
        const url = `cgi-bin/get_prices.py?date=${encodeURIComponent(kuupaev.value)}`;

        // Küsime Python backendilt andmed ja teisendame JSON-i objektiks
        const vastus = await fetch(url);
        const andmed = await vastus.json();

        // Kontrollime, kas päring õnnestus
        if (!vastus.ok) {
            throw new Error(
                andmed.error || "Päring ebaõnnestus."
            );
        }

        // Eraldame hinnakirjed ja hinnaväärtused
        const hinnad = andmed.prices;
        const vaartused = hinnad.map(p => p.price);

        // Päeva statistika
        const summa = vaartused.reduce(
            (a, b) => a + b, 0
        );

        // Leiame päeva madalaima, kõrgeima ja keskmise hinna
        const min = Math.min(...vaartused);
        const max = Math.max(...vaartused);
        const keskmine = summa / hinnad.length;

        // Kuvame arvutatud statistika veebilehel
        stats.textContent =
            `${hinnad.length} hinnapunkti · ` +
            `Min ${min.toFixed(2)} · ` +
            `Max ${max.toFixed(2)} · ` +
            `Keskmine ${keskmine.toFixed(2)} €/MWh`;

        // Eemaldame eelmise graafiku.
        if (chart) {
            chart.destroy();
        }

        // Loome uue graafiku.
        chart = new Chart(
            document.getElementById("priceChart"),
            {
                // Kasutame joongraafikut
                type: "line",

                data: {
                    // X-teljel kuvame hinnakirjete kellaajad
                    labels: hinnad.map(
                        p => kell(p.timestamp)
                    ),

                    datasets: [{
                        // Graafiku hinnaväärtused ja joone kujundus
                        label: "Elektrihind (€/MWh)",
                        data: vaartused,
                        borderColor: "#cbd2da",
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0,
                        fill: false
                    }]
                },

                options: {
                    // Graafik kohandub ekraani suurusega
                    responsive: true,
                    maintainAspectRatio: false,

                    // Hiirega liikudes näitame lähima ajapunkti hinda
                    interaction: {
                        intersect: false,
                        mode: "index"
                    },

                    plugins: {
                        // Peidame graafiku legendi
                        legend: {
                            display: false
                        }
                    },

                    scales: {
                        x: {
                            // Peidame X-telje ruudustiku
                            grid: {
                                display: false
                            },

                            // X-telje kellaaegade kujundus
                            ticks: {
                                color: "#8b949e",
                                maxTicksLimit: 12,
                                maxRotation: 0
                            }
                        },

                        y: {
                            // Y-telje pealkiri ja hinnaühik
                            title: {
                                display: true,
                                text: "€/MWh",
                                color: "#8b949e"
                            },

                            // Y-telje ruudustiku värv
                            grid: {
                                color: "#252a31"
                            },

                            // Y-telje väärtuste värv
                            ticks: {
                                color: "#8b949e"
                            }
                        }
                    }
                }
            }
        );

        // Kuvame edukalt laaditud päeva kuupäeva
        teade.textContent = `Kuupäev: ${andmed.date}`;

    } catch (viga) {
        // Päringu või graafiku loomise vea korral kuvame veateate
        teade.textContent = `Viga: ${viga.message}`;

        // Eemaldame eelmise graafiku, et vigaseid andmeid ei kuvataks
        if (chart) {
            chart.destroy();
            chart = null;
        }
    }
}


// Laadimisnupu vajutamine
document.getElementById("load").addEventListener(
    "click", laadiGraafik
);

// Laeme graafiku kohe lehe avamisel.
laadiGraafik();
