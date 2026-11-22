const seadistuseNupud = document.querySelectorAll('.current-setup-selection [role="tab"]');

seadistuseNupud.forEach(nupp => {
    nupp.addEventListener('click', () => {
        seadistuseNupud.forEach(teineNupp => {
            const valitud = teineNupp === nupp;

            teineNupp.setAttribute('aria-selected', valitud);
            document.getElementById(
                teineNupp.getAttribute('aria-controls')
            ).hidden = !valitud;
        });
    });
});


const poeRead = document.querySelectorAll('.store-row');

function uuendaHajutust(rida) {
    const lopuni = rida.scrollWidth - rida.clientWidth - rida.scrollLeft;

    rida.classList.toggle('fade-left', rida.scrollLeft > 1);
    rida.classList.toggle('fade-right', lopuni > 1);
}

poeRead.forEach(rida => {
    rida.addEventListener('scroll', () => uuendaHajutust(rida), { passive: true });
    uuendaHajutust(rida);
});

window.addEventListener('resize', () => poeRead.forEach(uuendaHajutust));


document.querySelectorAll('.store-buy').forEach(nupp => {
    nupp.addEventListener('click', () => {
        nupp.closest('.store-item').classList.remove('locked');
    });
});


const akud = document.querySelectorAll('.buy-batteries .store-item');
const akuVaade = document.getElementById('setup-panel-aku');

function naitaAkut(aku) {
    akuVaade.textContent = 
    `${aku.querySelector('.store-item-name').textContent} |
    ${aku.querySelector('.store-item-capacity').textContent} |
    ${aku.querySelector('.store-item-power').textContent}`;
}

akud.forEach(aku => {
    aku.addEventListener('click', () => {
        if (aku.classList.contains('locked')) return;

        akud.forEach(teineAku => {
            teineAku.classList.toggle('selected', teineAku === aku);
        });
        naitaAkut(aku);
    });
});

naitaAkut(document.querySelector('.buy-batteries .store-item.selected'));
