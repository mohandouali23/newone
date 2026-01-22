export default function initMultipleChoice(questionId) {
    if (!questionId) return;
  
    const checkboxes = document.querySelectorAll(`input[type=checkbox][name="${questionId}[]"]`);
    if (!checkboxes.length) return;
  
    // cacher un champ de précision
    function hidePrecision(id, value) {
      const input = document.querySelector(`input[name="precision_${id}_${value}"]`);
      if (input) input.style.display = 'none';
    }
  
    function updateSubQuestionsAndExclusive(cb) {
      const isExclusive = cb.dataset.exclusive === 'true';
  
      // ---- Sous-questions ----
      const subQ = document.querySelector(`.sub-questions[data-parent="${cb.value}"]`);
      if (subQ) subQ.style.display = cb.checked ? 'block' : 'none';
  
      // ---- Option exclusive cochée ----
      if (isExclusive && cb.checked) {
        checkboxes.forEach(other => {
          if (other === cb) return;
          other.checked = false;
          other.disabled = true;
          hidePrecision(questionId, other.value);
  
          const otherSub = document.querySelector(`.sub-questions[data-parent="${other.value}"]`);
          if (otherSub) otherSub.style.display = 'none';
        });
      }
  
      // ---- Option exclusive décochée ----
      if (isExclusive && !cb.checked) {
        checkboxes.forEach(other => {
          if (other !== cb) other.disabled = false;
        });
      }
  
      // ---- Option NON exclusive cochée ----
      if (!isExclusive && cb.checked) {
        checkboxes.forEach(other => {
          if (other.dataset.exclusive === 'true') {
            other.checked = false;
            other.disabled = true;
            hidePrecision(questionId, other.value);
          }
        });
      }
  
      // ---- aucune option exclusive sélectionnée ----
      const hasExclusiveChecked = [...checkboxes].some(c => c.dataset.exclusive === 'true' && c.checked);
      if (!hasExclusiveChecked) {
        checkboxes.forEach(c => c.disabled = false);
      }
    }
  
    // ajout des listeners
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => updateSubQuestionsAndExclusive(cb));
    });
  
    // ---- Réinitialisation au chargement ----
    const exclusiveChecked = [...checkboxes].find(cb => cb.dataset.exclusive === 'true' && cb.checked);
    if (exclusiveChecked) {
      checkboxes.forEach(other => {
        if (other === exclusiveChecked) return;
        other.checked = false;
        other.disabled = true;
        hidePrecision(questionId, other.value);
  
        const otherSub = document.querySelector(`.sub-questions[data-parent="${other.value}"]`);
        if (otherSub) otherSub.style.display = 'none';
      });
    }
  
    // ---- Affichage des sous-questions déjà cochées ----
    checkboxes.forEach(cb => {
      if (cb.checked) {
        const subQ = document.querySelector(`.sub-questions[data-parent="${cb.value}"]`);
        if (subQ) subQ.style.display = 'block';
      }
    });
  }
  