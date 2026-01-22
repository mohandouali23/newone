export default function initPrecisionManager() {

  document.addEventListener('change', e => {
    const el = e.target;

    /* ================= SELECT ================= */
    if (el.tagName === 'SELECT') {
      const selectedOption = el.options[el.selectedIndex];
      if (!selectedOption) return;

      // cacher toutes les précisions de cette question
      document
        .querySelectorAll(
          `.precision-input[data-precision-for^="${el.name}_"]`
        )
        .forEach(i => i.style.display = 'none');

      if (selectedOption.dataset.requiresPrecision !== 'true') return;

      const key = selectedOption.dataset.precisionKey;
      if (!key) return;

      const precisionInput = document.querySelector(
        `.precision-input[data-precision-for="${key}"]`
      );

      if (precisionInput) {
        precisionInput.style.display = 'inline-block';
      }

      return;
    }

    /* ================= RADIO / CHECKBOX ================= */
    if (!el.matches('input[type=radio], input[type=checkbox]')) return;

    // TOUJOURS cacher toutes les précisions de la question
    if (el.type === 'radio') {
      document
        .querySelectorAll(
          `.precision-input[data-precision-for^="${el.name}_"]`
        )
        .forEach(i => i.style.display = 'none');
    }

    // si l’option ne nécessite pas de précision → on s’arrête ici
    if (el.dataset.requiresPrecision !== 'true') return;

    const key = el.dataset.precisionKey;
    if (!key) return;

    const precisionInput = document.querySelector(
      `.precision-input[data-precision-for="${key}"]`
    );

    if (!precisionInput) return;

    precisionInput.style.display =
      el.checked ? 'inline-block' : 'none';
  });
}
