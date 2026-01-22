export default function initSingleChoice(questionId) {
    if (!questionId) return;
  
    const radios = document.querySelectorAll(`input[type=radio][name="${questionId}"]`);
    if (!radios.length) return;
  
    radios.forEach(radio => {
      radio.addEventListener('change', function () {
        // masquer seulement les sous-questions liées à cette question
        radios.forEach(r => {
          const block = document.querySelector(`.sub-questions[data-parent="${r.value}"]`);
          if (block) block.style.display = 'none';
        });
  
        // afficher le block lié à la valeur sélectionnée
        const subBlock = document.querySelector(`.sub-questions[data-parent="${this.value}"]`);
        if (subBlock) subBlock.style.display = 'block';
      });
    });
  
    // afficher le block déjà sélectionné au chargement (utile si la page est reload)
    const checkedRadio = Array.from(radios).find(r => r.checked);
    if (checkedRadio) {
      const subBlock = document.querySelector(`.sub-questions[data-parent="${checkedRadio.value}"]`);
      if (subBlock) subBlock.style.display = 'block';
    }
  }
  