const battery = document.querySelector('.battery');
const buttons = document.querySelectorAll('.battery-buttons button');

buttons.forEach(button => {
  button.addEventListener('click', () => {
    const initialName = button.dataset.text
    const state = button.dataset.state;
    const wasActive = battery.classList.contains(state);

    battery.classList.remove('charging', 'discharging');
    buttons.forEach(b => {
      b.setAttribute('aria-pressed', 'false')
      b.textContent = initialName
    });
    button.textContent = initialName

    if (!wasActive) {
      battery.classList.add(state);
      button.setAttribute('aria-pressed', 'true');
      button.textContent = 'STOPP'
    }
  });
});
