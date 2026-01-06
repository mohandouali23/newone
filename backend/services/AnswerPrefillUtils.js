// backend/services/AnswerPrefillUtils.js

export default class AnswerPrefillUtils {

  // ---------------- Helper clés session ----------------
  static getPrecisionKey(stepId, codeItem) {
    return `${stepId}_pr_${codeItem}`;
  }

  static getSubQuestionKey(parentStepId, selectedValue, subQuestionId) {
    return `${parentStepId}_${selectedValue}_${subQuestionId}`;
  }

  static getValueFromSession(sessionAnswers, key) {
    return sessionAnswers[key];
  }

  // ---------------- Sub-questions ----------------
  static getSubQuestionValue({ parentStep, subQuestion, sessionAnswers }) {
    const selectedValue = sessionAnswers[parentStep.id];
    if (!selectedValue) return undefined;

    const key = this.getSubQuestionKey(parentStep.id, selectedValue, subQuestion.id);
    return sessionAnswers[key];
  }

  // ---------------- Pré-remplissage générique ----------------
  static fillPrecision(opt, stepId, sessionAnswers) {
    const precisionKey = this.getPrecisionKey(stepId, opt.codeItem);
    const precisionValue = this.getValueFromSession(sessionAnswers, precisionKey);
    opt.precisionValue = precisionValue || '';
    opt.showPrecision = !!(opt.isSelected && opt.requiresPrecision);
  }

  static fillSelected(opt, savedStrings) {
    opt.isSelected = savedStrings.includes(opt.codeItem.toString());
  }

  // ---------------- Text / Spinner ----------------
  static text(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    console.log("key",key)
    step.value = sessionAnswers[key] || '';

  }

  static spinner(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    step.value = sessionAnswers[key] || '';
    if (Array.isArray(step.options)) {
      step.options.forEach(opt => {
        opt.isSelected = step.value === opt.codeItem.toString();
      });
    }
  }

  // ---------------- Single Choice ----------------
  static single_choice(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const stored = sessionAnswers[key] || sessionAnswers[step.id_db];
   //  const stored = sessionAnswers[step.id] || sessionAnswers[step.id_db];
    const values = typeof stored === 'object' ? stored : { [key]: stored };
    const selectedValue = values[key];

    step.options.forEach(opt => {
      const optValue = opt.codeItem.toString();
      opt.isSelected = selectedValue?.toString() === optValue;

      // Sous-questions
      if (opt.isSelected && opt.subQuestions) {
        opt.subQuestions.forEach(subQ => {
          const subValue = this.getSubQuestionValue({ parentStep: step, subQuestion: subQ, sessionAnswers });
          if (subValue !== undefined) {
            const fakeSession = { [subQ.id]: subValue };
            if (typeof this[subQ.type] === 'function') this[subQ.type](subQ, fakeSession);
          }
        });
      }

      // Précision
      this.fillPrecision(opt, key, sessionAnswers);
    });
  }

  // ---------------- Multiple Choice ----------------
  static multiple_choice(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const saved = sessionAnswers[key];
    if (!saved) {
      step.options.forEach(opt => {
        opt.isSelected = false;
        opt.precisionValue = '';
        opt.showPrecision = false;
      });
      return;
    }

    const savedArray = Array.isArray(saved) ? saved : [saved];
    const savedStrings = savedArray.map(v => v.toString());

    step.options.forEach(opt => {
      this.fillSelected(opt, savedStrings);
      this.fillPrecision(opt, key, sessionAnswers);
    });
  }

  // ---------------- Autocomplete ----------------
  static autocomplete(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const saved = sessionAnswers[key];
    if (!saved) {
      step.value = '';
      step.displayValue = '';
      return;
    }
    try {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      step.value = JSON.stringify(parsed);

      if (step.columns) {
        const displayColumn = step.columns.find(c => c.displayInInput) || step.columns[0];
        step.displayValue = parsed[displayColumn.name] || '';
      } else {
        step.displayValue = parsed.toString();
      }
    } catch {
      step.value = saved;
      step.displayValue = saved;
    }
  }

  // ---------------- Accordion ----------------
  static accordion(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const saved = sessionAnswers[key];
    if (!saved) return;

    const prefillQuestion = (q, sectionId) => {
      const value = saved[q.id];
      // Flags pour Mustache
      q.isText = q.type === 'text';
      q.isSpinner = q.type === 'spinner';
      q.isSingleChoice = q.type === 'single_choice';
      q.isMultipleChoice = q.type === 'multiple_choice';
      q.isAutocomplete = q.type === 'autocomplete';
      q.isGrid = q.type === 'grid';
      q.isAccordion = q.type === 'accordion';

      if (q.type && typeof this[q.type] === 'function') {
        const sessionForQ = {};
        if (value !== undefined) sessionForQ[q.id] = value;
        this[q.type](q, sessionForQ);
      }

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
  static grid(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const savedWrapper = sessionAnswers[key];
    if (!savedWrapper || !savedWrapper.value) return;
    const saved = savedWrapper.value;

    step.questions.forEach(question => {
      const rowValue = saved[question.id];

      question.columns.forEach(col => {
        const colId = col.colId?.toString();
        col.checked = false;
        if (!colId) return;

        if (typeof rowValue === 'string') col.checked = rowValue === colId;
        else if (Array.isArray(rowValue)) col.checked = rowValue.map(v => v.toString()).includes(colId);
        else if (typeof rowValue === 'object') {
          if (rowValue[colId]) col.checked = true;
          else for (const key of Object.keys(rowValue)) {
            const val = rowValue[key];
            if (Array.isArray(val) && val.map(v => v.toString()).includes(colId)) col.checked = true;
          }
        }
      });
    });
  }
}










// // backend/services/AnswerPrefill.js

// export default class AnswerPrefillUtils {
//   static getSubQuestionValue({ parentStep, subQuestion, sessionAnswers }) {
//     console.log("parentStep",parentStep)
//     console.log("subQuestion",subQuestion)
//     console.log("sessionAnswers",sessionAnswers)

//     const selectedValue = sessionAnswers[parentStep.id];
//     if (!selectedValue) return undefined;
  
//     const key = `${parentStep.id}_${selectedValue}_${subQuestion.id}`;
//     return sessionAnswers[key];
//   }

  
//     // ---------------- Text / Spinner ----------------
//     static text(step, sessionAnswers) {
//       const saved = sessionAnswers[step.id];
//       return step.value= saved ? saved : '';
//     }
  
//     // ---------------- Single Choice ----------------
//     static single_choice(step, sessionAnswers) {
//       const stored = sessionAnswers[step.id] || sessionAnswers[step.id_db];
    
//       // Normaliser
//       const values = typeof stored === 'object'
//         ? stored
//         : { [step.id]: stored };
    
//       console.log("value pr single", values);
    
//       const selectedValue = values[step.id];
    
//       step.options.forEach(opt => {
//         const optValue = opt.codeItem.toString();
    
//         // Sélection radio
//         opt.isSelected = selectedValue?.toString() === optValue;
    
// // 🔹 Pré-remplir les sous-questions
// if (opt.isSelected && opt.subQuestions) {
//   opt.subQuestions.forEach(subQ => {
//     const subValue = AnswerPrefillUtils.getSubQuestionValue({
//       parentStep: step,
//       subQuestion: subQ,
//       sessionAnswers
//     });

//     if (subValue !== undefined) {
//       // Injecter la valeur comme si c'était une question normale
//       const fakeSession = { [subQ.id]: subValue };

//       if (typeof AnswerPrefillUtils[subQ.type] === 'function') {
//         AnswerPrefillUtils[subQ.type](subQ, fakeSession);
//       }
//     }
//   });
// }


//         // ✅ CLÉ RÉELLE DE PRÉCISION
//         const precisionKey = `${step.id}_pr_${optValue}`;
//         console.log('pr key', precisionKey);
    
//         const precisionValue = sessionAnswers[precisionKey];
    
//         opt.precisionValue = precisionValue || '';
//         opt.showPrecision = !!precisionValue;
    
//         console.log({
//           option: optValue,
//           isSelected: opt.isSelected,
//           precision: opt.precisionValue
//         });
//       });
//     }
    
//     // ---------------- Multiple Choice ----------------
//     static multiple_choice(step, sessionAnswers) {
//         const saved = sessionAnswers[step.id];
        
//         if (!saved) {
//           // Aucune réponse sauvegardée, tout décoché
//           step.options.forEach(opt => {
//             opt.isSelected = false;
//             opt.precisionValue = '';
//           });
//           return;
//         }
//         // Convertir en tableau si nécessaire
//         const savedArray = Array.isArray(saved) ? saved : [saved];
//         // Convertir tous en string pour la comparaison
//         const savedStrings = savedArray.map(item => item.toString());
//         // Marquer les options sélectionnées
//         step.options.forEach(opt => {
//             const codeStr = opt.codeItem.toString();
//             // Checkbox cochée ou non
//             opt.isSelected = savedStrings.includes(codeStr);
//         //  récupération de la précision
//     const precisionKey = `${step.id}_pr_${codeStr}`;
//     const precisionValue = sessionAnswers[precisionKey] ;
//      // FLAG UNIQUE pour Mustache
//   opt.showPrecision =
//   opt.isSelected === true &&
//   opt.requiresPrecision === true;

// // Valeur (si existe)
// opt.precisionValue = precisionValue || '';
// });
//       }
  
//     // ---------------- Spinner  ----------------
// static spinner(step, sessionAnswers) {
//   const saved = sessionAnswers[step.id];
//   step.value = saved ? saved : '';
//   // Préparer isSelected pour chaque option
//   if (Array.isArray(step.options)) {
//     step.options.forEach(opt => {
//       opt.isSelected = step.value === opt.codeItem.toString();
//       console.log(opt.codeItem, opt.isSelected)
//     });
//   }
// }
//     // ---------------- Autocomplete ----------------
//     static autocomplete(step, sessionAnswers) {
//       const saved = sessionAnswers[step.id];
//       if (!saved) {
//         step.value = '';          // input vide si pas de valeur
//         step.displayValue = '';   // valeur visible dans l’input
//         return;
//       }
//       try {
//         // saved peut être une string JSON ou déjà un objet
//         const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
//         // Valeur pour la DB
//         step.value = JSON.stringify(parsed);
//         // Valeur affichée à l’utilisateur
//         if (step.columns) {
//           // Si tu veux afficher un champ spécifique, par ex. "commune"
//           const displayColumn = step.columns.find(c => c.displayInInput) || step.columns[0];
//           step.displayValue = parsed[displayColumn.name] || '';
//         } else {
//           step.displayValue = parsed.toString();
//         }
//       } catch (e) {
//         console.warn(`Impossible de parser la valeur autocomplete pour ${step.id}:`, saved);
//         step.value = saved;         // fallback
//         step.displayValue = saved;  // fallback affiché
//       }
//     }
//     // ---------------- Accordion ----------------
//     static accordion(step, sessionAnswers) {
//       console.log('🔍 Pré-remplissage acc:', {
//           stepId: step.id,
//           stepId_db: step.id_db,
//           sessionAnswers: sessionAnswers
//         });
//       const saved = sessionAnswers[step.id];
//       if (!saved) return;
//       const prefillQuestion = (q, sectionId) => {
//         const key = `${sectionId}:${q.id}`;
//         const value = saved[q.id]; // utiliser q.id directement car saved = q16
//         // flags pour Mustache
//         q.isText = q.type === 'text';
//         q.isSpinner = q.type === 'spinner';
//         q.isSingleChoice = q.type === 'single_choice';
//         q.isMultipleChoice = q.type === 'multiple_choice';
//         q.isAutocomplete = q.type === 'autocomplete';
//         q.isGrid = q.type === 'grid';
//         q.isAccordion = q.type === 'accordion';
      
//         // Appeler la méthode du type avec la bonne valeur
//         if (q.type && typeof AnswerPrefillUtils[q.type] === 'function') {
//           const sessionForQ = {};
//           if (value !== undefined) sessionForQ[q.id] = value;
//           AnswerPrefillUtils[q.type](q, sessionForQ);
//         }
//         // récursion pour sous-accordion
//         if (q.type === 'accordion' && Array.isArray(q.sections)) {
//           q.sections.forEach(subSection => {
//             subSection.questions.forEach(subQ => prefillQuestion(subQ, subSection.id_sect));
//           });
//         }
//       };
//       step.sections.forEach(section => {
//         section.questions.forEach(q => prefillQuestion(q, section.id_sect));
//       });
//     }
//    // ---------------- Grid ----------------
//    static grid(step, sessionAnswers) {
//     const savedWrapper = sessionAnswers[step.id];
//     if (!savedWrapper || !savedWrapper.value) return;
  
//     const saved = savedWrapper.value;
  
//     step.questions.forEach(question => {
//       const rowId = question.id;
//       const rowValue = saved[rowId];
  
//       question.columns.forEach(col => {
//       //  const colId = col.value?.toString();
//       const colId = col.colId?.toString();

//         col.checked = false;
  
//         if (!colId) return;
  
//         // ===========================
//         // CAS 1 — CHECKBOX / RADIO ROW
//         // ===========================
//         if (typeof rowValue === 'string') {
//           // radio par ligne
//           if (rowValue === colId) {
//             col.checked = true;
//             return;
//           }
//         }
  
//         if (Array.isArray(rowValue)) {
//           // checkbox par ligne
//           if (rowValue.map(v => v.toString()).includes(colId)) {
//             col.checked = true;
//             return;
//           }
//         }
  
//         // ===========================
//         // CAS 2 — RADIO COLUMN (clé = colonne)
//         // ===========================
//         const columnValue = saved[colId];
//         if (typeof columnValue === 'string' && columnValue === rowId) {
//           col.checked = true;
//           return;
//         }
//       });
//     });
//   }
  
//   }
  