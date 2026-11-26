
/** Gridrushi statistikalehe juhtimine. */

let varaGraafik = null;
let kasumiGraafik = null;
let paringuNumber = 0;

const leia = id => document.getElementById(id);

const arv = (vaartus, komakohad = 0) =>
    Number(vaartus).toLocaleString("et-EE", {
        minimumFractionDigits: komakohad,
        maximumFractionDigits: komakohad
    });

const euro = vaartus =>
    vaartus == null ? "-" : `${arv(vaartus, 2)} €`;

const vormindaArv = vaartus =>
    Number(vaartus).toLocaleString("et-EE", {
        maximumFractionDigits: 2
    });

const energia = vaartus =>
    `${arv(vaartus, 2)} MWh`;

const elektrihind = vaartus =>
    vaartus == null
        ? "-"
        : `${arv(vaartus, 2)} €/MWh`;


// Vormindab positiivsed ja negatiivsed rahasummad.

function margigaEuro(vaartus) {
    if (vaartus == null) return "-";

    return `${vaartus > 0 ? "+" : ""}${euro(vaartus)}`;
}


// Teisendab sekundid tundideks, minutiteks ja sekunditeks.

function vormindaAeg(sekundid) {
    const kokku = Math.floor(sekundid);

    const tunnid = Math.floor(kokku / 3600);
    const minutid = Math.floor(kokku % 3600 / 60);
    const sekund = kokku % 60;

    if (tunnid > 0) {
        return `${tunnid} h ${minutid} min`;
    }

    return `${minutid} min ${sekund} s`;
}


// Kirjutab statistika väärtuse HTML-i.

function kuvaVaartus(id, vaartus) {
    leia(id).textContent = vaartus;
}


// Värvib kasumi ja kahjumi.

function kasumiKlass(vaartus) {
    if (vaartus > 0) return "stats-positive";
    if (vaartus < 0) return "stats-negative";

    return "";
}


function kuvaKasum(id, summa) {
    const element = leia(id);

    // Ümardamisviga ei tohi nulli värvida.
    const vaartus = summa == null
        ? null
        : Math.round(summa * 100) / 100 || 0;

    element.textContent = margigaEuro(vaartus);
    element.className = kasumiKlass(vaartus);
}


// PEAMISED JA DETAILSED STATISTIKANÄITAJAD

function kuvaStatistika(s) {

    kuvaKasum("stat-profit", s.total_profit);

    kuvaVaartus(
        "stat-best-value",
        s.games_started ? euro(s.best_value) : "-"
    );

    kuvaVaartus(
        "stat-trades", arv(s.total_trades)
    );

    kuvaVaartus(
        "stat-days", arv(s.days_played)
    );

    kuvaVaartus(
        "stat-winrate",
        s.days_played
            ? `${arv(s.profitable_days_percent, 1)}%`
            : "-"
    );

    kuvaVaartus(
        "stat-playtime",
        vormindaAeg(s.play_seconds)
    );

    kuvaVaartus("stat-buy-count", arv(s.buy_count));
    kuvaVaartus("stat-sell-count", arv(s.sell_count));

    kuvaVaartus(
        "stat-energy-bought", energia(s.energy_bought)
    );

    kuvaVaartus(
        "stat-energy-sold", energia(s.energy_sold)
    );

    kuvaVaartus(
        "stat-lowest-buy", elektrihind(s.lowest_buy)
    );

    kuvaVaartus(
        "stat-highest-sell", elektrihind(s.highest_sell)
    );

    kuvaVaartus(
        "stat-average-buy", elektrihind(s.average_buy)
    );

    kuvaVaartus(
        "stat-average-sell", elektrihind(s.average_sell)
    );

    kuvaKasum("stat-best-day", s.best_day);
    kuvaKasum("stat-worst-day", s.worst_day);

    kuvaVaartus(
        "stat-streak",
        `${s.longest_streak} ${
            s.longest_streak === 1 ? "päev" : "päeva"
        }`
    );

    kuvaVaartus(
        "stat-games", arv(s.games_started)
    );
}


// GRAAFIKUD

function cssVarv(nimi) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(nimi)
        .trim();
}


function graafikuSeaded() {
    const tekst = cssVarv("--color-text-secondary");
    const joon = cssVarv("--color-border");

    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,

        interaction: {
            mode: "nearest",
            axis: "x",
            intersect: false
        },

        plugins: {
            legend: {
                display: false
            },

            tooltip: {
                displayColors: false,
                padding: 10,
                backgroundColor: cssVarv("--color-bg-secondary"),
                borderColor: joon,
                borderWidth: 1,
                titleColor: tekst,
                bodyColor: cssVarv("--color-text-primary"),
                callbacks: {}
            }
        },

        scales: {
            x: {
                border: {
                    color: joon
                },
                ticks: {
                    color: tekst,
                    maxTicksLimit: 10,
                    maxRotation: 0,
                    autoSkipPadding: 24
                },
                grid: {
                    display: false
                }
            },

            y: {
                border: {
                    display: false
                },
                ticks: {
                    color: tekst,
                    maxTicksLimit: 5,
                    callback: vaartus =>
                        `${vormindaArv(vaartus)} €`
                },
                grid: {
                    color: joon
                }
            }
        }
    };
}


// Iga mäng on graafikul eraldi joon, mis algab mängu algsummast.

function leiaManguJooned(paevad, algus) {
    const jooned = [];
    let eelmineMang = null;

    paevad.forEach((paev, i) => {
        if (paev.game_id !== eelmineMang) {
            jooned.push([{ x: algus + i, y: paev.start_value }]);
            eelmineMang = paev.game_id;
        }

        jooned.at(-1).push({ x: algus + i + 1, y: paev.end_value });
    });

    return jooned;
}


function looVaraGraafik(paevad, algus) {
    const roheline = cssVarv("--color-charging");
    const seaded = graafikuSeaded();

    seaded.scales.x.type = "linear";
    seaded.scales.x.min = algus;
    seaded.scales.x.max = algus + paevad.length;
    seaded.scales.x.ticks.precision = 0;

    seaded.plugins.tooltip.callbacks = {
        title: valitud => `Päev ${valitud[0].parsed.x}`,
        label: punkt => {
            const nimi = punkt.dataIndex === 0
                ? "Mängu algus"
                : "Vara väärtus";

            return `${nimi}: ${euro(punkt.parsed.y)}`;
        }
    };

    return {
        type: "line",
        options: seaded,
        data: {
            datasets: leiaManguJooned(paevad, algus).map(joon => ({
                data: joon,
                clip: 8,
                borderColor: roheline,
                borderWidth: 2,
                backgroundColor: "rgba(108, 203, 184, 0.1)",
                fill: "start",
                pointBackgroundColor: roheline,
                pointRadius: 2,
                pointHoverRadius: 5
            }))
        }
    };
}


function looKasumiGraafik(paevad, algus) {
    const seaded = graafikuSeaded();

    seaded.interaction.mode = "index";

    seaded.plugins.tooltip.callbacks = {
        title: valitud => `Päev ${valitud[0].label}`,
        label: punkt => `Kasum: ${margigaEuro(punkt.parsed.y)}`
    };

    // Vähemalt viis kohta, et üks päev ei täidaks tervet graafikut.
    const kohti = Math.max(paevad.length, 5);

    const varvid = (kasum, kahjum) => paevad.map(
        paev => paev.profit < 0 ? kahjum : kasum
    );

    return {
        type: "bar",
        options: seaded,
        data: {
            labels: Array.from({ length: kohti }, (_, i) =>
                i < paevad.length ? algus + i + 1 : ""
            ),
            datasets: [{
                data: paevad.map(paev => paev.profit),
                backgroundColor: varvid(
                    "rgba(108, 203, 184, 0.3)",
                    "rgba(255, 60, 34, 0.3)"
                ),
                hoverBackgroundColor: varvid(
                    "rgba(108, 203, 184, 0.5)",
                    "rgba(255, 60, 34, 0.5)"
                ),
                borderColor: varvid(
                    cssVarv("--color-charging"),
                    cssVarv("--color-loss")
                ),
                borderWidth: { top: 2, bottom: 2, left: 0, right: 0 },
                borderRadius: 3,
                categoryPercentage: 1,
                barPercentage: 0.96,
                minBarLength: 2
            }]
        }
    };
}


function uuendaGraafik(graafik, id, seaded) {
    if (graafik === null) {
        return new Chart(leia(id), seaded);
    }

    graafik.data = seaded.data;
    graafik.options = seaded.options;
    graafik.update("none");

    return graafik;
}


function kuvaGraafikud(s) {
    const paevad = s.daily_history;

    leia("stats-charts").classList.toggle(
        "empty", paevad.length === 0
    );

    if (typeof Chart === "undefined" || paevad.length === 0) return;

    // Server saadab ainult viimased päevad, varasemad loeme juurde.
    const algus = s.days_played - paevad.length;

    varaGraafik = uuendaGraafik(
        varaGraafik,
        "asset-chart",
        looVaraGraafik(paevad, algus)
    );

    kasumiGraafik = uuendaGraafik(
        kasumiGraafik,
        "profit-chart",
        looKasumiGraafik(paevad, algus)
    );
}


function valiGraafik(event) {
    const valitud = event.currentTarget.dataset.chart;

    document.querySelectorAll(".chart-buttons button").forEach(nupp => {
        const id = nupp.dataset.chart;

        nupp.setAttribute("aria-pressed", String(id === valitud));
        leia(id).parentElement.hidden = id !== valitud;
    });
}


// SAAVUTUSED

function looElement(tag, klass, tekst) {
    const element = document.createElement(tag);

    if (klass) element.className = klass;
    if (tekst !== undefined) element.textContent = tekst;

    return element;
}


function kuvaSaavutused(saavutused) {

    const avatud = saavutused.filter(
        a => a.unlocked
    ).length;

    kuvaVaartus(
        "achievement-count",
        `${avatud} / ${saavutused.length}`
    );

    leia("achievement-battery").replaceChildren(
        ...saavutused.map((saavutus, i) =>
            looElement("span", i < avatud ? "filled" : "")
        )
    );

    const kaardid = saavutused.map(saavutus => {

        const kaart = looElement(
            "article",
            `achievement-card ${
                saavutus.unlocked ? "unlocked" : "locked"
            }`
        );

        kaart.append(
            looElement("h3", "achievement-name", saavutus.name),
            looElement(
                "div",
                "achievement-description",
                saavutus.description
            ),
            looIkoon(
                achievementIcons[saavutus.id] || "trend",
                "achievement-icon"
            )
        );

        if (saavutus.unlocked) {
            kaart.append(looIkoon("check", "achievement-check"));
            return kaart;
        }

        const progress = document.createElement("progress");

        progress.max = 100;
        progress.value = saavutus.progress;

        progress.setAttribute(
            "aria-label", saavutus.name
        );

        kaart.append(
            looElement(
                "div",
                "achievement-progress",
                `${vormindaArv(saavutus.current)} / ${
                    vormindaArv(saavutus.target)
                }`
            ),
            progress,
            looIkoon("lock", "achievement-lock")
        );

        return kaart;
    });

    leia("achievements-grid").replaceChildren(...kaardid);
}


// TEHINGUTE AJALUGU

const ajaVorming = new Intl.DateTimeFormat("et-EE", {
    timeZone: "Europe/Tallinn",
    dateStyle: "short",
    timeStyle: "medium"
});


function kuvaTehingud(tehingud) {

    const tbody = leia("transactions-body");

    tbody.replaceChildren();

    if (tehingud.length === 0) {

        const rida = looElement("tr");
        const lahter = looElement("td", "", "Tehinguid pole veel tehtud.");

        lahter.colSpan = 6;

        rida.append(lahter);
        tbody.append(rida);

        return;
    }

    for (const t of tehingud) {

        const rida = looElement("tr");
        const tegevus = looElement("td");

        tegevus.append(looElement(
            "span",
            `trade-badge ${t.action}`,
            t.action === "buy" ? "Ost" : "Müük"
        ));

        rida.append(
            looElement("td", "", t.day_number),
            looElement("td", "", ajaVorming.format(t.created_at * 1000)),
            tegevus,
            looElement("td", "", energia(t.quantity)),
            looElement("td", "", elektrihind(t.price)),
            looElement(
                "td",
                kasumiKlass(t.cash_change),
                margigaEuro(t.cash_change)
            )
        );

        tbody.append(rida);
    }
}


// ANDMETE LAADIMINE SERVERIST

async function laadiStatistika() {

    const number = ++paringuNumber;
    const scope = leia("stats-scope").value;

    try {

        const vastus = await fetch(
            `/api/stats?scope=${scope}`,
            { cache: "no-store" }
        );

        const andmed = await vastus.json();

        if (!vastus.ok) {
            throw new Error(
                andmed.error || "Statistika laadimine ebaõnnestus."
            );
        }

        // Väldime vanema päringu kuvamist.
        if (number !== paringuNumber) return;

        kuvaStatistika(andmed.stats);
        kuvaGraafikud(andmed.stats);
        kuvaSaavutused(andmed.achievements);
        kasitleSaavutusi(andmed.achievements);
        kuvaTehingud(andmed.stats.transactions);

        kuvaVaartus("stats-status", "");

    } catch (viga) {

        if (number !== paringuNumber) return;

        kuvaVaartus("stats-status", viga.message);
    }
}


// Laadime statistika lehe avamisel.

document.addEventListener("DOMContentLoaded", () => {

    if (typeof Chart !== "undefined") {
        Chart.defaults.font.family = '"Nata Sans", sans-serif';
    }

    // Graafik mõõdab silte õigesti alles siis, kui font on laetud.
    document.fonts.load('12px "Nata Sans"').finally(laadiStatistika);

    leia("stats-scope").addEventListener(
        "change", laadiStatistika
    );

    document.querySelectorAll(".chart-buttons button").forEach(nupp => {
        nupp.addEventListener("click", valiGraafik);
    });

    // Uuendame statistikat iga viie sekundi järel.
    setInterval(() => {

        if (!document.hidden) {
            laadiStatistika();
        }

    }, 5000);
});
