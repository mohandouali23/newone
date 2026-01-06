// backend/services/AnswerPrefill.js

export default class AnswerPrefillUtils {
  static getSubQuestionValue({ parentStep, subQuestion, sessionAnswers }) {
    console.log("parentStep",parentStep)
    console.log("subQuestion",subQuestion)
    console.log("sessionAnswers",sessionAnswers)

    const selectedValue = sessionAnswers[parentStep.id];
    if (!selectedValue) return undefined;
  
    const key = `${parentStep.id}_${selectedValue}_${subQuestion.id}`;
    return sessionAnswers[key];
  }

  
    // ---------------- Text / Spinner ----------------
    static text(step, sessionAnswers) {
      const saved = sessionAnswers[step.id];
      return step.value= saved ? saved : '';
    }
  
    // ---------------- Single Choice ----------------
    static single_choice(step, sessionAnswers) {
      const stored = sessionAnswers[step.id] || sessionAnswers[step.id_db];
    
      // Normaliser
      const values = typeof stored === 'object'
        ? stored
        : { [step.id]: stored };
    
      console.log("value pr single", values);
    
      const selectedValue = values[step.id];
    
      step.options.forEach(opt => {
        const optValue = opt.codeItem.toString();
    
        // Sélection radio
        opt.isSelected = selectedValue?.toString() === optValue;
    
// 🔹 Pré-remplir les sous-questions
if (opt.isSelected && opt.subQuestions) {
  opt.subQuestions.forEach(subQ => {
    const subValue = AnswerPrefillUtils.getSubQuestionValue({
      parentStep: step,
      subQuestion: subQ,
      sessionAnswers
    });

    if (subValue !== undefined) {
      // Injecter la valeur comme si c'était une question normale
      const fakeSession = { [subQ.id]: subValue };

      if (typeof AnswerPrefillUtils[subQ.type] === 'function') {
        AnswerPrefillUtils[subQ.type](subQ, fakeSession);
      }
    }
  });
}


        // ✅ CLÉ RÉELLE DE PRÉCISION
        const precisionKey = `${step.id}_pr_${optValue}`;
        console.log('pr key', precisionKey);
    
        const precisionValue = sessionAnswers[precisionKey];
    
        opt.precisionValue = precisionValue || '';
        opt.showPrecision = !!precisionValue;
    
        console.log({
          option: optValue,
          isSelected: opt.isSelected,
          precision: opt.precisionValue
        });
      });
    }
    
    // ---------------- Multiple Choice ----------------
    static multiple_choice(step, sessionAnswers) {
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
    const precisionKey = `${step.id}_pr_${codeStr}`;
    const precisionValue = sessionAnswers[precisionKey] ;
     // 🔑 FLAG UNIQUE pour Mustache
  opt.showPrecision =
  opt.isSelected === true &&
  opt.requiresPrecision === true;

// Valeur (si existe)
opt.precisionValue = precisionValue || '';
});
      }
  
    // ---------------- Spinner  ----------------
static spinner(step, sessionAnswers) {
  const saved = sessionAnswers[step.id];
  step.value = saved ? saved : '';
  // Préparer isSelected pour chaque option
  if (Array.isArray(step.options)) {
    step.options.forEach(opt => {
      opt.isSelected = step.value === opt.codeItem.toString();
      console.log(opt.codeItem, opt.isSelected)
    });
  }
}
    // ---------------- Autocomplete ----------------
    static autocomplete(step, sessionAnswers) {
      const saved = sessionAnswers[step.id];
      if (!saved) {
        step.value = '';          // input vide si pas de valeur
        step.displayValue = '';   // valeur visible dans l’input
        return;
      }
      try {
        // saved peut être une string JSON ou déjà un objet
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        // Valeur pour la DB
        step.value = JSON.stringify(parsed);
        // Valeur affichée à l’utilisateur
        if (step.columns) {
          // Si tu veux afficher un champ spécifique, par ex. "commune"
          const displayColumn = step.columns.find(c => c.displayInInput) || step.columns[0];
          step.displayValue = parsed[displayColumn.name] || '';
        } else {
          step.displayValue = parsed.toString();
        }
      } catch (e) {
        console.warn(`Impossible de parser la valeur autocomplete pour ${step.id}:`, saved);
        step.value = saved;         // fallback
        step.displayValue = saved;  // fallback affiché
      }
    }
    // ---------------- Accordion ----------------
    static accordion(step, sessionAnswers) {
      console.log('🔍 Pré-remplissage acc:', {
          stepId: step.id,
          stepId_db: step.id_db,
          sessionAnswers: sessionAnswers
        });
      const saved = sessionAnswers[step.id];
      if (!saved) return;
      const prefillQuestion = (q, sectionId) => {
        const key = `${sectionId}:${q.id}`;
        const value = saved[q.id]; // utiliser q.id directement car saved = q16
        // flags pour Mustache
        q.isText = q.type === 'text';
        q.isSpinner = q.type === 'spinner';
        q.isSingleChoice = q.type === 'single_choice';
        q.isMultipleChoice = q.type === 'multiple_choice';
        q.isAutocomplete = q.type === 'autocomplete';
        q.isGrid = q.type === 'grid';
        q.isAccordion = q.type === 'accordion';
      
        // Appeler la méthode du type avec la bonne valeur
        if (q.type && typeof AnswerPrefillUtils[q.type] === 'function') {
          const sessionForQ = {};
          if (value !== undefined) sessionForQ[q.id] = value;
          AnswerPrefillUtils[q.type](q, sessionForQ);
        }
        // récursion pour sous-accordion
        if (q.type === 'accordion' && Array.isArray(q.sections)) {
          q.sections.forEach(subSection => {
            subSection.questions.forEach(subQ => prefillQuestion(subQ, subSection.id_sect));
          });
        }
      };
      step.sections.forEach(section => {
        section.questions.forEach(q => prefillQuestion(q, section.id_sect));
      });
    }
   // ---------------- Grid ----------------
   static grid(step, sessionAnswers) {
    const savedWrapper = sessionAnswers[step.id];
    if (!savedWrapper || !savedWrapper.value) return;
  
    const saved = savedWrapper.value;
  
    step.questions.forEach(question => {
      const rowId = question.id;
      const rowValue = saved[rowId];
  
      question.columns.forEach(col => {
      //  const colId = col.value?.toString();
      const colId = col.colId?.toString();

        col.checked = false;
  
        if (!colId) return;
  
        // ===========================
        // CAS 1 — CHECKBOX / RADIO ROW
        // ===========================
        if (typeof rowValue === 'string') {
          // radio par ligne
          if (rowValue === colId) {
            col.checked = true;
            return;
          }
        }
  
        if (Array.isArray(rowValue)) {
          // checkbox par ligne
          if (rowValue.map(v => v.toString()).includes(colId)) {
            col.checked = true;
            return;
          }
        }
  
        // ===========================
        // CAS 2 — RADIO COLUMN (clé = colonne)
        // ===========================
        const columnValue = saved[colId];
        if (typeof columnValue === 'string' && columnValue === rowId) {
          col.checked = true;
          return;
        }
      });
    });
  }
  
  //  static grid(step, sessionAnswers) {
  //   const savedWrapper = sessionAnswers[step.id];
  //   if (!savedWrapper || !savedWrapper.value) return;
  //   const saved = savedWrapper.value;
  //   step.questions.forEach(question => {
  //     const rowValue = saved[question.id];
  //     question.columns.forEach(col => {
  //       col.checked = false;
  //       if (!rowValue || col.value == null) return;
  //       const colKey = col.value.toString();
  
  //       // CAS 1 : rowValue est string → radio simple par ligne
  //       if (typeof rowValue === 'string') {
  //         col.checked = rowValue === colKey;
  //         return;
  //       }
  //       // CAS 2 : rowValue est tableau → multiple checkbox par ligne
  //       if (Array.isArray(rowValue)) {
  //         col.checked = rowValue.map(v => v.toString()).includes(colKey);
  //         return;
  //       }
  //       // CAS 3 : rowValue est objet → row ou column multi
  //       if (typeof rowValue === 'object') {
  //         // vérifier si cette colonne correspond directement à une clé
  //         if (rowValue[colKey]) {
  //           col.checked = true;
  //           return;
  //         }
  //         // sinon, si la valeur est un array, regarder dedans
  //         for (const key of Object.keys(rowValue)) {
  //           const val = rowValue[key];
  //           if (Array.isArray(val) && val.map(v => v.toString()).includes(colKey)) {
  //             col.checked = true;
  //             break;
  //           }
  //         }
  //       }
  //     });
  //   });
  // }


  }
  