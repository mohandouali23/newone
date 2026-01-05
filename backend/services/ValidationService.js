import ToastService from './ToastService.js';

export default class ValidationService {

  static hasRealAnswer(obj) {
    if (!obj || typeof obj !== 'object') return false;

    return Object.entries(obj)
      .filter(([key]) => key !== 'action')
      .some(([_, v]) => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim() !== '';
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return ValidationService.hasRealAnswer(v);
        return true;
      });
  }
  static validateAccordion(step, answers, missingFields) {
    const answer = answers[step.id]; // q16
    if (!answer || typeof answer !== 'object') {
      missingFields.push(step.label || step.id);
      return;
    }
  
    (step.sections || []).forEach(section => {
      (section.questions || []).forEach(question => {
        const key = question.id;
        const value = answer[key];
  
        if (!question.required) return;
  
        switch (question.type) {
          case 'text':
          case 'spinner':
          case 'autocomplete':
          case 'single_choice':
            if (!value || value.trim?.() === '') {
              missingFields.push(`${section.title} > ${question.label || question.id}`);
            }
            break;
  
          case 'multiple_choice':
            const arr = Array.isArray(value) ? value.filter(v => v && v.trim() !== '') : [];
            if (arr.length === 0) {
              missingFields.push(`${section.title} > ${question.label || question.id}`);
            }
            break;
  
          default:
            if (!value) missingFields.push(`${section.title} > ${question.label || question.id}`);
        }
      });
    });
  }

  static validateGridStep(step, answers) {
    const answer = answers[step.id];
    const realValue = answer?.value;
  
    console.log('GRID realValue', realValue);
  
    // Vérification initiale
    if (!realValue || Object.keys(realValue).length === 0) {
      ToastService.show(
        `Veuillez répondre à la question obligatoire : ${step.label || step.id}`,
        { type: 'error' }
      );
      return false;
    }
  
    const missingRows = [];
    const missingColumns = [];
  
    // ===========================
    // VALIDATION LIGNES (required)
    // ===========================
    (step.questions || []).forEach(question => {
      if (question.required === true) {
        const questionAnswer = realValue[question.id];
        let hasAnswer = false;
  
        if (typeof questionAnswer === 'string') {
          hasAnswer = questionAnswer.trim() !== '';
        } 
        else if (Array.isArray(questionAnswer)) {
          hasAnswer = questionAnswer.length > 0;
        }
  
        if (!hasAnswer) {
          missingRows.push(question.label || question.id);
        }
      }
    });
  
    // ===========================
    // VALIDATION COLONNES (axis=column)
    // ===========================
    (step.reponses || []).forEach(response => {
      if (response.input?.axis === 'column' && response.input?.required === true) {
        const responseId = response.id;
        let hasAnswer = false;
  
        // CAS 1 — RADIO COLUMN (clé = colonne)
        if (
          typeof realValue[responseId] === 'string' &&
          realValue[responseId].trim() !== ''
        ) {
          hasAnswer = true;
        }
  
        // CAS 2 — CHECKBOX COLUMN (clé = ligne)
        (step.questions || []).forEach(question => {
          const rowAnswer = realValue[question.id];
          if (!rowAnswer) return;
  
          // cellule désactivée
          if (question.cells?.[responseId]?.enabled === false) return;
  
          if (Array.isArray(rowAnswer) && rowAnswer.includes(responseId)) {
            hasAnswer = true;
          }
        });
  
        if (!hasAnswer) {
          missingColumns.push(response.label || responseId);
        }
      }
    });
  
    // ===========================
    // MESSAGE ERREUR
    // ===========================
    if (missingRows.length > 0 || missingColumns.length > 0) {
      let message = '';
  
      if (missingRows.length > 0) {
        message += `Veuillez répondre à chaque ligne obligatoire :<br>${missingRows
          .map(r => `• ${r}`)
          .join('<br>')}<br>`;
      }
  
      if (missingColumns.length > 0) {
        message += `Veuillez répondre à chaque colonne obligatoire :<br>${missingColumns
          .map(c => `• ${c}`)
          .join('<br>')}`;
      }
  
      ToastService.show(message, { type: 'error' });
      return false;
    }
  
    return true;
  }
  
  
  static validateStep(step, answers, wrapper = null) {
    //  validation spéciale pour grid au niveau step
//     if (step.type === 'grid') {
//       const answer = answers[step.id];
//       const realValue = answer?.value;
    
//       console.log('GRID realValue', realValue);
    
//       // Vérification initiale
//       if (!realValue || Object.keys(realValue).length === 0) {
//         const message = `Veuillez répondre à la question obligatoire : ${step.label || step.id}`;
//         ToastService.show(message, { type: 'error' });
//         return false;
//       }
      
//       console.log("step grid", step);
      
//       // Vérification des lignes obligatoires
//       if (step.questions && step.questions.length > 0) {
//         const missingRows = [];
//         const missingColumns = [];
      
// // ===========================
//   // VALIDATION LIGNES (required)
//   // ===========================
//         step.questions.forEach(question => {
//           if (question.required === true) {
//             const questionId = question.id;
//             const questionLabel = question.label || questionId;
//             const questionAnswer = realValue[questionId];     
//             let hasAnswer = false;

//             if (questionAnswer) {
//               if (typeof questionAnswer === 'string') {
//                 // Cas radio: string non vide
//                 hasAnswer = questionAnswer.trim() !== '';
//               } else if (Array.isArray(questionAnswer)) {
//                 // CHECKBOX
//                 hasAnswer = questionAnswer.length > 0;
//               }
//               // else if (typeof questionAnswer === 'object') {
//               //   // Cas checkbox: objet avec des tableaux
//               //   // Vérifier si au moins un tableau n'est pas vide
//               //   for (const key in questionAnswer) {
//               //     const value = questionAnswer[key];
//               //     if (Array.isArray(value) && value.length > 0) {
//               //       hasAnswer = true;
//               //       break;
//               //     }
//               //   }
//               // }
//             }
            
//             if (!hasAnswer) {
//               missingRows.push(questionLabel);
//             }
//           }
//         });
//   // ===========================
// // VALIDATION COLONNES (axis=column)
// // ===========================
// step.reponses.forEach(response => {
//   if (response.input?.axis === 'column' && response.input?.required === true) {
//     const responseId = response.id;
//     let hasAnswer = false;

//     // CAS 1 — RADIO COLUMN (clé = colonne)
//     if (
//       typeof realValue[responseId] === 'string' &&
//       realValue[responseId].trim() !== ''
//     ) {
//       hasAnswer = true;
//     }

//     // CAS 2 — CHECKBOX COLUMN (clé = ligne)
//     step.questions.forEach(question => {
//       const rowAnswer = realValue[question.id];
//       if (!rowAnswer) return;

//       // cellule désactivée
//       if (question.cells?.[responseId]?.enabled === false) return;

//       if (Array.isArray(rowAnswer) && rowAnswer.includes(responseId)) {
//         hasAnswer = true;
//       }
//     });

//     if (!hasAnswer) {
//       missingColumns.push(response.label || responseId);
//     }
//   }
// });

  
        
//   // ===========================
//   // MESSAGE ERREUR
//   // ===========================
//   if (missingRows.length > 0 || missingColumns.length > 0) {
//     let message = '';

//     if (missingRows.length > 0) {
//       message += `Veuillez répondre à chaque ligne obligatoire :<br>${missingRows
//         .map(r => `• ${r}`)
//         .join('<br>')}<br>`;
//     }

//     if (missingColumns.length > 0) {
//       message += `Veuillez répondre à chaque colonne obligatoire :<br>${missingColumns
//         .map(c => `• ${c}`)
//         .join('<br>')}`;
//     }

//     ToastService.show(message, { type: 'error' });
//     return false;
//   }
//       }
    
//       return true; // Grid validée
//     }

if (step.type === 'grid') {
  return ValidationService.validateGridStep(step, answers);
}

    let isValid = true;
    const missingFields = [];
    const questionList = step.questions || [step];

    questionList.forEach(question => {
      const answerKey = wrapper?.optionIndex !== undefined
        ? `${question.id}_${wrapper.optionIndex}`
        : question.id;

      const answer = answers[answerKey];

      if (!question.required) return;

      switch (question.type) {
        case 'text':
        case 'spinner':
        case 'autocomplete':
          if (!answer || answer.trim?.() === '') missingFields.push(question.label || question.id);
          break;
case 'single_choice':
  //console.log('answer for single_choice:', answers);


          if (!answer || answer.trim?.() === '') {
            missingFields.push(question.label || question.id);
          } else {
            // Vérifier si l'option sélectionnée a un champ de précision requis
            const selectedOption = question.options?.find(
              opt => opt.codeItem?.toString() === answer?.toString()
            );
            if (selectedOption?.requiresPrecision) {
              //console.log('precision key:', `precision_${answer}`);

              const precisionValue = answers[`${question.id}_pr_${answer}`] || answers[`precision_${answer}`];
              //console.log('precision value:', precisionValue);
              if (!precisionValue || precisionValue.trim() === '') {
                missingFields.push(`Précision pour "${selectedOption.label}"`);
              }
            }
          }
          break;
       case 'multiple_choice': {
  const selectedArray = Array.isArray(answer) ? answer.filter(v => v && v.trim() !== '') : [];
  
  if (selectedArray.length === 0) {
    missingFields.push(question.label || question.id);
  } else {
    selectedArray.forEach(codeItem => {
      const precisionKey = `${question.id}_pr_${codeItem}`;
      const precisionValue = answers[precisionKey];

      const selectedOption = question.options?.find(
        opt => opt.codeItem?.toString() === codeItem?.toString()
      );
      if (selectedOption?.requiresPrecision && (!precisionValue || precisionValue.trim() === '')) {
        missingFields.push(`Précision pour "${selectedOption.label}"`);
      }
    });
  }
  break;
}
        // case 'accordion':
        //   if (!ValidationService.hasRealAnswer(answer)) missingFields.push(question.label || question.id);
        //   break;
case 'accordion':
  ValidationService.validateAccordion(question, answers, missingFields);
  break;

        default:
          if (!answer) missingFields.push(question.label || question.id);
      }
    });

    if (missingFields.length > 0) {
      isValid = false;
      const message = `Veuillez répondre aux questions obligatoires : ${missingFields.join(', ')}`;
      ToastService.show(message, { type: 'error' });
    }

    return isValid;
  }
}
