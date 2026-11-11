
// Gridrushi ostu-müügi kasutajaliides

let tradeSeis = null;
let tradeKogus = 1;
let tradeToimetab = false;

// Leiame HTML-ist vajalikud elemendid
const tradeEl = id => document.getElementById(id);


// Saadame päringu Python backendile
async function tradeApi(aadress, andmed = {}) {
    const vastus = await fetch(aadress, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(andmed)
    });

    const tulemus = await vastus.json();

    if (!vastus.ok) {
        throw new Error(tulemus.error || "Päring ebaõnnestus.");
    }

    return tulemus;
}


// Kuvame mänguseisu ja uuendame nuppude olekut
function tradeKuva() {
    tradeEl("trade-quantity").textContent = `${tradeKogus} MWh`;
    tradeEl("trade-start").disabled = tradeToimetab;

    const nupud = ["next", "minus", "plus", "buy", "sell"];

    if (!tradeSeis) {
        for (const nimi of nupud) {
            tradeEl(`trade-${nimi}`).disabled = true;
        }

        return;
    }

    const s = tradeSeis;

    // Kuvame serverist saadud andmed
    tradeEl("trade-price").textContent =
        `${s.price.toFixed(2)} €/MWh`;

    tradeEl("trade-balance").textContent =
        `${s.balance.toFixed(2)} €`;

    tradeEl("trade-energy").textContent =
        `${s.energy} / ${s.capacity} MWh`;

    tradeEl("trade-step").textContent =
        `${s.index + 1} / ${s.total}`;

    tradeEl("trade-time").textContent =
        new Date(s.timestamp * 1000).toLocaleString(
            "et-EE", { timeZone: "Europe/Tallinn" }
        );

    // Keelame nupud, kui tegevus pole võimalik
    tradeEl("trade-next").disabled =
        tradeToimetab || s.index >= s.total - 1;

    tradeEl("trade-minus").disabled =
        tradeToimetab || tradeKogus <= 1;

    tradeEl("trade-plus").disabled =
        tradeToimetab || tradeKogus >= s.capacity;

    const summa = tradeKogus * s.price;

    tradeEl("trade-buy").disabled =
        tradeToimetab ||
        s.energy + tradeKogus > s.capacity ||
        s.balance - summa < -0.000001;

    tradeEl("trade-sell").disabled =
        tradeToimetab ||
        s.energy < tradeKogus ||
        s.balance + summa < -0.000001;
}


// Teeme päringu ja kuvame tulemuse
async function tradeParing(aadress, andmed = {}) {
    if (tradeToimetab) return;

    tradeToimetab = true;
    tradeKuva();

    try {
        tradeSeis = await tradeApi(aadress, andmed);

        tradeEl("trade-message").textContent =
            tradeSeis.message || "Tegevus õnnestus.";

    } catch (viga) {
        tradeEl("trade-message").textContent =
            `Viga: ${viga.message}`;

    } finally {
        tradeToimetab = false;
        tradeKuva();
    }
}


// Alustame uut mängu
tradeEl("trade-start").addEventListener("click", () => {
    const paev = tradeEl("date").value;

    tradeKogus = 1;
    tradeSeis = null;

    // Laeme ka valitud päeva graafiku
    tradeEl("load").click();

    tradeParing("/api/demo/start", {
        date: paev
    });
});


// Liigume järgmise elektrihinna juurde
tradeEl("trade-next").addEventListener("click", () => {
    tradeParing("/api/demo/next");
});


// Ostame elektrit
tradeEl("trade-buy").addEventListener("click", () => {
    tradeParing("/api/demo/trade", {
        action: "buy",
        quantity: tradeKogus
    });
});


// Müüme elektrit
tradeEl("trade-sell").addEventListener("click", () => {
    tradeParing("/api/demo/trade", {
        action: "sell",
        quantity: tradeKogus
    });
});


// Suurendame kogust
tradeEl("trade-plus").addEventListener("click", () => {
    if (
        tradeSeis &&
        !tradeToimetab &&
        tradeKogus < tradeSeis.capacity
    ) {
        tradeKogus++;
    }

    tradeKuva();
});


// Vähendame kogust
tradeEl("trade-minus").addEventListener("click", () => {
    if (!tradeToimetab) {
        tradeKogus = Math.max(1, tradeKogus - 1);
    }

    tradeKuva();
});


// Kuupäeva muutmisel lähtestame kauplemisvaate
tradeEl("date").addEventListener("change", () => {
    tradeSeis = null;
    tradeKogus = 1;

    tradeEl("trade-message").textContent =
        "Kuupäev muutus. Alusta uut mängu.";

    tradeKuva();
});


// Kuvame algseisu
tradeKuva();
