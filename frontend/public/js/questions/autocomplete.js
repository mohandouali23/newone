export default function initAutocomplete() {
    const autocompletes = document.querySelectorAll('.autocomplete-input');
    if (!autocompletes.length) return;
  
    autocompletes.forEach(input => {
      const listId = input.getAttribute('list');
      if (!listId) return;
  
      const datalist = document.getElementById(listId);
      if (!datalist) return;
  
      // Affichage lisible pendant la saisie
      input.addEventListener('input', () => {
        const option = Array.from(datalist.options).find(
          opt => opt.value === input.value
        );
        if (option && option.dataset.input) {
          input.value = option.dataset.input; // affichage dans l'input
          try {
            input.dataset.jsonValueObject = JSON.stringify(JSON.parse(option.dataset.json));
          } catch (e) {
            input.dataset.jsonValueObject = undefined;
          }
        }
      });
  
      // Mettre à jour l'objet à chaque changement
      input.addEventListener('change', () => {
        const option = Array.from(datalist.options).find(
          opt => opt.dataset.input === input.value
        );
        if (option && option.dataset.json) {
          try {
            input.dataset.jsonValueObject = JSON.stringify(JSON.parse(option.dataset.json));
          } catch (e) {
            input.dataset.jsonValueObject = undefined;
          }
        } else {
          delete input.dataset.jsonValueObject;
        }
      });
    });
  }
  