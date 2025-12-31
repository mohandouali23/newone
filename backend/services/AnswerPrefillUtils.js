// backend/services/AnswerPrefill.js

export default class AnswerPrefillUtils {
  
    // ---------------- Text / Spinner ----------------
    static text(step, sessionAnswers) {
      const saved = sessionAnswers[step.id];
      return saved ? saved : '';
    }
  
    // ---------------- Single Choice ----------------
    static singleChoice(step, sessionAnswers) {
        console.log('🔍 Pré-remplissage single_choice:', {
          stepId: step.id,
          stepId_db: step.id_db,
          sessionAnswers: sessionAnswers
        });
      
        // Récupérer la valeur stockée
        const stored = sessionAnswers[step.id] || sessionAnswers[step.id_db];
        if (!stored) {
          console.log('⚠️ Pas de valeur sauvegardée pour ce step');
          step.options.forEach(opt => opt.isSelected = false);
          return;
        }
      
        // Si c'est un objet (comme dans ton log), extraire la valeur du step.id
        const saved = typeof stored === 'object' ? stored[step.id] : stored;
        if (!saved) {
          console.log('⚠️ Valeur vide pour ce step après extraction');
          step.options.forEach(opt => opt.isSelected = false);
          return;
        }
      
        const savedStr = saved.toString();
        console.log('✅ Valeur sauvegardée pour pré-remplissage:', savedStr);
      
        step.options.forEach(opt => {
          const optStr = opt.codeItem.toString();
          opt.isSelected = optStr === savedStr;
          console.log(`Option ${optStr} (${opt.label}) isSelected: ${opt.isSelected}`);
        });
      }
      
    // ---------------- Multiple Choice ----------------
    static multipleChoice(step, sessionAnswers) {
        const saved = sessionAnswers[step.id];
        
        if (!saved) {
          // Aucune réponse sauvegardée, tout décoché
          step.options.forEach(opt => {
            opt.isSelected = false;
            opt.precisionValue = '';
          });
          return;
        }
        
        // Convertir en tableau si nécessaire
        const savedArray = Array.isArray(saved) ? saved : [saved];
        
        // Convertir tous en string pour la comparaison
        const savedStrings = savedArray.map(item => item.toString());
        
        // Marquer les options sélectionnées
        step.options.forEach(opt => {
            const codeStr = opt.codeItem.toString();

            // Checkbox cochée ou non
            opt.isSelected = savedStrings.includes(codeStr);
        //  récupération de la précision
    const precisionKey = `${step.id_db}_pr_${codeStr}`;
    opt.precisionValue = sessionAnswers[precisionKey] || '';
});
        // console.log('✅ Pré-remplissage multiple_choice:', {
        //   stepId: step.id,
        //   saved: saved,
        //   savedArray: savedArray,
        //   savedStrings: savedStrings,
        //   options: step.options.map(opt => ({
        //     code: opt.codeItem,
        //     label: opt.label,
        //     isSelected: opt.isSelected
        //   }))
        // });
      }
  
    // ---------------- Spinner / Dropdown ----------------
    static spinner(step, sessionAnswers) {
      const saved = sessionAnswers[step.id];
      step.value = saved ? saved : '';
    }
  
    // ---------------- Autocomplete ----------------
    static autocomplete(step, sessionAnswers) {
      const saved = sessionAnswers[step.id];
      step.value = saved ? saved : '';
    }
  
    // ---------------- Accordion ----------------
    static accordion(step, sessionAnswers) {
      const saved = sessionAnswers[step.id];
      if (!saved) return;
  
      step.sections.forEach(section => {
        section.questions.forEach(q => {
          const key = `${section.id_sect}:${q.id}`;
          if (saved[key]) {
            q.value = saved[key];
          }
        });
      });
    }
  
    // ---------------- Grid ----------------
    static grid(step, sessionAnswers) {
      const saved = sessionAnswers[step.id];
      if (!saved) return;
  
      step.questions.forEach(q => {
        if (saved[q.id]) q.value = saved[q.id];
      });
    }
  }
  