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
