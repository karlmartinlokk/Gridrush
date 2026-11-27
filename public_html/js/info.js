const resetNupp = document.getElementById('reset');
const resetTeade = document.getElementById('reset-status');

// Lõpetab serveris praeguse mängu. Mängijaküpsis jääb alles,
// nii et uus mäng läheb statistikas sama mängija alla.
// Uus mäng algab simulatsiooni lehel Play vajutamisel.
async function lahtestaMang() {
    // Reset kustutab raha, akud ja päevad, seega küsime enne kinnitust.
    if (!confirm('Kas lähtestada mäng? Kõik senine progress kaob.')) {
        return;
    }

    resetNupp.disabled = true;
    resetTeade.textContent = '';

    try {
        const vastus = await fetch('/api/demo/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });

        if (!vastus.ok) {
            throw new Error('Mängu ei saanud lähtestada.');
        }

        resetTeade.textContent =
            'Mäng lähtestatud.';

    } catch (viga) {
        resetTeade.textContent = `Viga: ${viga.message}`;

    } finally {
        resetNupp.disabled = false;
    }
}

resetNupp.addEventListener('click', lahtestaMang);
