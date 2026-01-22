
import ToastService from './ToastService.js';
import initPrecisionManager from './precisionManager.js';
import initAutocomplete from './questions/autocomplete.js';
import initSingleChoice from './questions/single_choice.js';
import initMultipleChoice from './questions/multiple_choice.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM chargé, JS fonctionne ');
  initPrecisionManager();
  initAutocomplete();
  const stepType = document.querySelector('.survey')?.dataset.stepType;
  console.log('stepType:', stepType);
  
  if (stepType) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/assets/css/questions/${stepType}.css`;
    document.head.appendChild(link);
    console.log('CSS dynamique injecté ', link.href);
  }
  // Initialiser les questions single choice
  document.querySelectorAll('input[type=radio]').forEach(input => {
    const name = input.name;
    initSingleChoice(name);
  });

  document.querySelectorAll('input[type=checkbox]').forEach(input => {
    const name = input.name.replace(/\[\]$/, '');
    initMultipleChoice(name);
  });
  const form = document.getElementById('surveyForm');
  if (!form) return;

  /* ========== RETIRER LE HIGHLIGHT SUR MODIFICATION ========== */
  form.addEventListener('input', e => {
    if (e.target.classList.contains('input-error')) {
      e.target.classList.remove('input-error');
    }
  });
  
  form.addEventListener('change', e => {
    if (e.target.classList.contains('input-error')) {
      e.target.classList.remove('input-error');
    }
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const button = document.activeElement;
    const action = button?.value || 'next';
    
    const answers = serializeForm(form);
    answers._action = action;
    console.log("answers",answers)
    
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers)
        
      });
      
      const data = await res.json();
      console.log("data",data)
      
      if (data.success === false) {
        if (data.messages?.length) {
          ToastService.show('Veuillez compléter les champs obligatoires', {
            type: 'error',
            duration: 4000
          });
        } 
        if (data.invalidFields?.length) {
          markInvalidFields(data.invalidFields);
          setTimeout(() => {
            const field = form.querySelector(
              `[name="${data.invalidFields[0]}"], [name="${data.invalidFields[0]}[]"]`
            );
            
            if (field) {
              field.scrollIntoView({ behavior: 'smooth', block: 'center' });
              field.focus();
            }
          }, 200);
        }
        return;
      }
      
      if (data.finished) {
        window.location.href = data.redirectUrl;
        return;
      }
      
      window.location.reload();
      
    } catch (err) {
      ToastService.show('Erreur serveur', { type: 'error' });
      console.error(err);
    }
  });
});


// ------------------ Helpers ------------------
function serializeForm(form) {
  const obj = {};
  const elements = form.querySelectorAll('input, select, textarea');

  elements.forEach(el => {
    let name = el.name;
    if (!name) return;

    const isArray = name.endsWith('[]');
    if (isArray) name = name.slice(0, -2);

    let value;
    if (el.dataset.jsonValueObject) {
      // convertir string JSON stockée en objet JS
      try {
        value = JSON.parse(el.dataset.jsonValueObject);
      } catch {
        value = el.value;
      }
    } else {
      value = el.value;
    }

    if (el.type === 'checkbox') {
      if (!obj[name]) obj[name] = [];
      if (el.checked) obj[name].push(el.value);
    } else if (el.type === 'radio') {
      if (el.checked) obj[name] = el.value;
    } else {
      obj[name] = value;
    }
  });

  return obj;
}

function markInvalidFields(fields) {
  document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

  fields.forEach(name => {
    const input = document.querySelector(`[name="${name}"]`);
    if (input) {
      input.classList.add('input-error');

      if (input.classList.contains('precision-input') && input.style.display === 'none') {
        input.style.display = 'inline-block';
      }
    }
  });

  const first = fields
    .map(name => document.querySelector(`[name="${name}"]`))
    .find(el => el && el.offsetParent !== null);
  if (first) first.focus({ preventScroll: false });
}
