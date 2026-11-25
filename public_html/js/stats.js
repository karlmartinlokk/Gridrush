
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
    vaartus == null ? "–" : `${arv(vaartus, 2)} €`;

const energia = vaartus =>
    `${arv(vaartus, 2)} MWh`;

const elektrihind = vaartus =>
    vaartus == null
        ? "–"
        : `${arv(vaartus, 2)} €/MWh`;


// Vormindab positiivsed ja negatiivsed rahasummad.

function margigaEuro(vaartus) {
    if (vaartus == null) return "–";

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

function kuvaKasum(id, vaartus) {
    const element = leia(id);

    element.textContent = margigaEuro(vaartus);

    element.classList.toggle(
        "stats-positive", vaartus > 0
    );

    element.classList.toggle(
        "stats-negative", vaartus < 0
    );
}


// PEAMISED JA DETAILSED STATISTIKANÄITAJAD

function kuvaStatistika(s) {

    kuvaKasum("stat-profit", s.total_profit);

    kuvaVaartus(
        "stat-best-value",
        s.games_started ? euro(s.best_value) : "–"
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
            : "–"
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
        "stat-streak", `${s.longest_streak} päeva`
    );

    kuvaVaartus(
        "stat-games", arv(s.games_started)
    );
}


// GRAAFIKUD

function graafikuSeaded() {

    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,

        plugins: {
            legend: {
                display: false
            },

            tooltip: {
                callbacks: {
                    label: punkt =>
                        euro(punkt.parsed.y)
                }
            }
        },

        scales: {
            x: {
                ticks: {
                    color: "#9ba5af",
                    maxTicksLimit: 8
                },
                grid: {
                    display: false
                }
            },

            y: {
                ticks: {
                    color: "#9ba5af",
                    callback: vaartus => `${vaartus} €`
                },
                grid: {
                    color: "rgba(255,255,255,0.06)"
                }
            }
        }
    };
}


function kuvaGraafikud(paevad) {

    if (typeof Chart === "undefined") return;

    const sildid = [];
    const varad = [];
    const kasumid = [];

    let eelmineMang = null;

    for (const paev of paevad) {

        // Katkestame joone erinevate mängude vahel.
        if (
            eelmineMang !== null &&
            eelmineMang !== paev.game_id
        ) {
            sildid.push("");
            varad.push(null);
            kasumid.push(null);
        }

        const silt = leia("stats-scope").value === "all"
            ? `#${paev.game_id} / P${paev.day_number}`
            : `Päev ${paev.day_number}`;

        sildid.push(silt);
        varad.push(paev.end_value);
        kasumid.push(paev.profit);

        eelmineMang = paev.game_id;
    }

    const varaAndmed = {
        labels: sildid,
        datasets: [{
            data: varad,
            borderColor: "#6CCBB8",
            backgroundColor: "rgba(108,203,184,0.08)",
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 2,
            spanGaps: false,
            fill: true
        }]
    };

    const kasumiAndmed = {
        labels: sildid,
        datasets: [{
            data: kasumid,
            backgroundColor: kasumid.map(
                k => k >= 0 ? "#6CCBB8" : "#E06B60"
            ),
            borderRadius: 3
        }]
    };

    if (varaGraafik === null) {

        varaGraafik = new Chart(leia("asset-chart"), {
            type: "line",
            data: varaAndmed,
            options: graafikuSeaded()
        });

    } else {

        varaGraafik.data = varaAndmed;
        varaGraafik.update("none");
    }

    if (kasumiGraafik === null) {

        kasumiGraafik = new Chart(leia("profit-chart"), {
            type: "bar",
            data: kasumiAndmed,
            options: graafikuSeaded()
        });

    } else {

        kasumiGraafik.data = kasumiAndmed;
        kasumiGraafik.update("none");
    }
}


// ACHIEVEMENTS

const achievementIcons = {
    first_buy: "↓",
    first_sell: "↑",
    full_battery: "▰",
    empty_battery: "▱",
    negative_price: "⚡",
    double_money: "2×",
    power_trader: "€",
    energy_baron: "♛",
    trades_10: "10",
    trades_100: "100",
    trades_1000: "★",
    energy_100: "⚡",
    days_10: "10",
    days_30: "30",
    streak_5: "↗"
};


function looElement(tag, klass, tekst) {
    const element = document.createElement(tag);

    if (klass) element.className = klass;
    if (tekst !== undefined) element.textContent = tekst;

    return element;
}


function kuvaSaavutused(saavutused) {

    const konteiner = leia("achievements-grid");

    konteiner.replaceChildren();

    const avatud = saavutused.filter(
        a => a.unlocked
    ).length;

    kuvaVaartus(
        "achievement-count",
        `${avatud} / ${saavutused.length}`
    );

    leia("achievement-total-progress").value =
        saavutused.length
            ? avatud / saavutused.length * 100
            : 0;

    for (const saavutus of saavutused) {

        const kaart = looElement(
            "article",
            `achievement-card ${
                saavutus.unlocked ? "unlocked" : "locked"
            }`
        );

        const ylaosa = looElement(
            "div", "achievement-top"
        );

        const ikoon = looElement(
            "span",
            "achievement-icon",
            achievementIcons[saavutus.id] || "★"
        );

        const olek = looElement(
            "span",
            saavutus.unlocked
                ? "stats-positive"
                : "achievement-progress",
            saavutus.unlocked ? "✓ Avatud" : "Lukus"
        );

        ylaosa.append(ikoon, olek);

        const nimi = looElement(
            "h3",
            "achievement-name",
            saavutus.name
        );

        const kirjeldus = looElement(
            "div",
            "achievement-description",
            saavutus.description
        );

        const progress = document.createElement("progress");

        progress.max = 100;
        progress.value = saavutus.progress;

        progress.setAttribute(
            "aria-label", saavutus.name
        );

        const edenemine = looElement(
            "div",
            "achievement-progress",
            `${arv(saavutus.current, 2)} / ${
                arv(saavutus.target, 2)
            }`
        );

        kaart.append(
            ylaosa,
            nimi,
            kirjeldus,
            progress,
            edenemine
        );

        konteiner.append(kaart);
    }
}


// TEHINGUTE AJALUGU

const ajaVorming = new Intl.DateTimeFormat("et-EE", {
    timeZone: "Europe/Tallinn",
    dateStyle: "short",
    timeStyle: "short"
});


function kuvaTehingud(tehingud) {

    const tbody = leia("transactions-body");

    tbody.replaceChildren();

    if (tehingud.length === 0) {

        const rida = document.createElement("tr");
        const lahter = document.createElement("td");

        lahter.colSpan = 7;
        lahter.textContent = "Tehinguid pole veel tehtud.";

        rida.append(lahter);
        tbody.append(rida);

        return;
    }

    for (const t of tehingud) {

        const rida = document.createElement("tr");

        const vaartused = [
            `#${t.game_id}`,
            t.day_number,
            ajaVorming.format(
                new Date(t.market_timestamp * 1000)
            ),
            t.action === "buy" ? "Ost" : "Müük",
            energia(t.quantity),
            elektrihind(t.price),
            margigaEuro(t.cash_change)
        ];

        vaartused.forEach((vaartus, indeks) => {

            const lahter = document.createElement("td");

            lahter.textContent = vaartus;

            if (indeks === 6) {

                if (t.cash_change > 0) {
                    lahter.className = "stats-positive";
                }

                if (t.cash_change < 0) {
                    lahter.className = "stats-negative";
                }
            }

            rida.append(lahter);
        });

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
        kuvaGraafikud(andmed.stats.daily_history);
        kuvaSaavutused(andmed.achievements);
        kuvaTehingud(andmed.stats.transactions);

        if (!andmed.stats.games_started) {

            kuvaVaartus(
                "stats-status",
                "Valitud perioodil pole veel mänguajalugu."
            );

        } else if (!andmed.stats.days_played) {

            kuvaVaartus(
                "stats-status",
                "Graafikute kuvamiseks lõpeta esimene mängupäev."
            );

        } else {
            kuvaVaartus("stats-status", "");
        }

    } catch (viga) {

        if (number !== paringuNumber) return;

        kuvaVaartus("stats-status", viga.message);
    }
}


// Laadime statistika lehe avamisel.

document.addEventListener("DOMContentLoaded", () => {

    laadiStatistika();

    leia("stats-scope").addEventListener(
        "change", laadiStatistika
    );

    // Uuendame statistikat iga viie sekundi järel.
    setInterval(() => {

        if (!document.hidden) {
            laadiStatistika();
        }

    }, 5000);
});
