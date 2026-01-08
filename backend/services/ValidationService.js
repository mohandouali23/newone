import ToastService from './ToastService.js';

export default class ValidationService {

  // ===========================================================================
  // GENERIC HELPERS
  // ===========================================================================

  /**
   * Vérifie si une valeur contient une vraie réponse utilisateur
   */
  static hasRealAnswer(value) {
    if (value === null || value === undefined) return false;

    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.some(v => this.hasRealAnswer(v));
    if (typeof value === 'object')
      return Object.values(value).some(v => this.hasRealAnswer(v));

    return true;
  }

  /**
   * Normalise une réponse en tableau
   */
  static normalizeToArray(value) {
    if (Array.isArray(value)) return value;
    if (value !== undefined && value !== null) return [value];
    return [];
  }

  /**
   * Construit la clé d’une réponse (wrapper / sous-question)
   */
  static buildAnswerKey(questionId, wrapper) {
    return wrapper?.optionIndex !== undefined
      ? `${questionId}_${wrapper.optionIndex}`
      : questionId;
  }

  /**
   * Vérifie la précision obligatoire d’une option
   */
  static hasRequiredPrecision(questionId, codeItem, answers) {
    const key = `${questionId}_pr_${codeItem}`;
    return !!answers[key]?.trim();
  }

  /**
   * Affiche un toast d’erreur standard
   */
  static showMissingToast(message) {
    ToastService.show(message, { type: 'error' });
  }

  // ===========================================================================
  // SUB QUESTIONS (RECURSIVE)
  // ===========================================================================

  /**
   * Validation récursive des sous-questions
   */
  static validateSubQuestions({
    options = [],
    answers,
    parentAnswerKey,
    path = '',
    wrapper = null
  }) {
    const missing = [];

    options.forEach(option => {
      const parentValue = answers[parentAnswerKey];
      const parentValues = this.normalizeToArray(parentValue).map(v => v?.toString());

      // L’option parent n’est pas sélectionnée → on ignore ses sous-questions
      if (!parentValues.includes(option.codeItem?.toString())) return;

      option.subQuestions?.forEach(subQ => {
        const subKey = wrapper?.optionIndex !== undefined
          ? `${subQ.id}_${wrapper.optionIndex}`
          : `${parentAnswerKey}_${option.codeItem}_${subQ.id}`;

        const value = answers[subKey];
        const labelPath = path ? `${path} > ${subQ.label || subQ.id}` : (subQ.label || subQ.id);

        // Sous-question obligatoire
        if (subQ.required && !this.hasRealAnswer(value)) {
          missing.push(labelPath);
        }

        // Récursivité sur options
        if (subQ.options?.length && this.hasRealAnswer(value)) {
          missing.push(
            ...this.validateSubQuestions({
              options: subQ.options,
              answers,
              parentAnswerKey: subKey,
              path: labelPath,
              wrapper
            })
          );
        }

        // Cas accordion imbriqué
        if (subQ.type === 'accordion') {
          subQ.sections?.forEach(section => {
            section.questions?.forEach(q => {
              const qKey = this.buildAnswerKey(q.id, wrapper);
              const qValue = answers[qKey];
              const accordionPath = `${labelPath} > ${section.title} > ${q.label || q.id}`;

              if (q.required && !this.hasRealAnswer(qValue)) {
                missing.push(accordionPath);
              }

              if (q.options?.length) {
                missing.push(
                  ...this.validateSubQuestions({
                    options: q.options,
                    answers,
                    parentAnswerKey: qKey,
                    path: `${labelPath} > ${section.title}`,
                    wrapper
                  })
                );
              }
            });
          });
        }
      });
    });

    return missing;
  }

  // ===========================================================================
  // ACCORDION
  // ===========================================================================

  static validateAccordion(step, answers, missingFields) {
    const answer = answers[step.id];
    if (!answer || typeof answer !== 'object') {
      missingFields.push(step.label || step.id);
      return;
    }

    step.sections?.forEach(section => {
      section.questions?.forEach(q => {
        if (!q.required) return;

        const value = answer[q.id];
        if (!this.hasRealAnswer(value)) {
          missingFields.push(`${section.title} > ${q.label || q.id}`);
        }
      });
    });
  }

  // ===========================================================================
  // GRID
  // ===========================================================================

  static validateGridStep(step, answers) {
    const value = answers[step.id]?.value;
    if (!value || !Object.keys(value).length) {
      this.showMissingToast(`Veuillez répondre à la question obligatoire : ${step.label || step.id}`);
      return false;
    }

    const missingRows = [];
    const missingColumns = [];

    // Lignes obligatoires
    step.questions?.forEach(row => {
      if (row.required && !this.hasRealAnswer(value[row.id])) {
        missingRows.push(row.label || row.id);
      }
    });

    // Colonnes obligatoires
    step.reponses?.forEach(col => {
      if (col.input?.axis !== 'column' || !col.input?.required) return;

      const colId = col.id;
      let hasAnswer = this.hasRealAnswer(value[colId]);

      step.questions?.forEach(row => {
        const rowValue = value[row.id];
        if (Array.isArray(rowValue) && rowValue.includes(colId)) {
          hasAnswer = true;
        }
      });

      if (!hasAnswer) missingColumns.push(col.label || colId);
    });

    if (missingRows.length || missingColumns.length) {
      let msg = '';
      if (missingRows.length) {
        msg += `Veuillez répondre à chaque ligne obligatoire :<br>${missingRows.map(r => `• ${r}`).join('<br>')}<br>`;
      }
      if (missingColumns.length) {
        msg += `Veuillez répondre à chaque colonne obligatoire :<br>${missingColumns.map(c => `• ${c}`).join('<br>')}`;
      }
      this.showMissingToast(msg);
      return false;
    }

    return true;
  }

  // ===========================================================================
  // STEP VALIDATION
  // ===========================================================================

  static validateStep(step, answers, wrapper = null) {
    if (step.type === 'grid') {
      return this.validateGridStep(step, answers);
    }

    const missing = [];
    const questions = step.questions || [step];

    questions.forEach(q => {
      const answerKey = this.buildAnswerKey(q.id, wrapper);
      const value = answers[answerKey];

      if (q.required && !this.hasRealAnswer(value)) {
        missing.push(q.label || q.id);
      }

      // Validation par type
      if (q.type === 'single_choice' && this.hasRealAnswer(value)) {
        const opt = q.options?.find(o => o.codeItem?.toString() === value?.toString());
        if (opt?.requiresPrecision && !this.hasRequiredPrecision(q.id, value, answers)) {
          missing.push(`Précision pour "${opt.label}"`);
        }
      }

      if (q.type === 'multiple_choice') {
        const values = this.normalizeToArray(value);
        values.forEach(code => {
          const opt = q.options?.find(o => o.codeItem?.toString() === code?.toString());
          if (opt?.requiresPrecision && !this.hasRequiredPrecision(q.id, code, answers)) {
            missing.push(`Précision pour "${opt.label}"`);
          }
        });
      }

      if (q.type === 'accordion') {
        this.validateAccordion(q, answers, missing);
      }

      // Sous-questions
      if (q.options?.length) {
        missing.push(
          ...this.validateSubQuestions({
            options: q.options,
            answers,
            parentAnswerKey: answerKey,
            path: q.label,
            wrapper
          })
        );
      }
    });

    if (missing.length) {
      this.showMissingToast(
        `Veuillez répondre aux questions obligatoires : ${missing.join(', ')}`
      );
      return false;
    }

    return true;
  }
}


// import ToastService from './ToastService.js';

// export default class ValidationService {
  
//   // ---------------- Helper récursif pour sous-questions ----------------
//   static validateSubQuestionsRecursive(options = [], answers, wrapper = null, path = '', parentAnswerKey = null) {
//     const missingFields = [];
    
//     options.forEach(opt => {
//       // Récupérer la valeur du parent
//       let parentValue = parentAnswerKey ? answers[parentAnswerKey] : null;
      
//       console.log('DEBUG: option', opt.label, 'parentValue', parentValue);
      
//       // Vérifier si l’option est sélectionnée dans le parent
//       const isSelected = Array.isArray(parentValue)
//       ? parentValue.some(v => v?.toString() === opt.codeItem?.toString())
//       : parentValue?.toString() === opt.codeItem?.toString();
      
//       console.log('DEBUG: isSelected', isSelected);
//       if (!isSelected) return; // ne pas valider les sous-questions si l’option n’est pas choisie
      
//       if (!opt.subQuestions?.length) return;
      
//       opt.subQuestions.forEach(subQ => {
        
//         // ----- Construire correctement la clé de la sous-question -----
//         let subAnswerKey;
        
//         if (wrapper?.optionIndex !== undefined) {
//           // Cas wrapper (accordion ou liste imbriquée)
//           subAnswerKey = `${subQ.id}_${wrapper.optionIndex}`;
//         } else if (parentAnswerKey) {
//           subAnswerKey = `${parentAnswerKey}_${opt.codeItem}_${subQ.id}`;
//         } else {
//           // Parent single_choice
//           subAnswerKey = subQ.id;
//         }
        
        
//         const value = answers[subAnswerKey];
//         console.log('DEBUG: subQ', subQ.label, 'subAnswerKey', subAnswerKey, 'value', value);
        
//         // Vérifier la sous-question obligatoire
//         if (subQ.required && !ValidationService.hasRealAnswer(value)) {
//           missingFields.push(path ? `${path} > ${subQ.label || subQ.id}` : subQ.label || subQ.id);
//           console.log('DEBUG: missingFields pushed', missingFields[missingFields.length - 1]);
//         }
        
//         // Récursivité sur les options de la sous-question
//         if (subQ.options?.length && (subQ.required || ValidationService.hasRealAnswer(value))) {
//           missingFields.push(
//             ...ValidationService.validateSubQuestionsRecursive(
//               subQ.options,
//               answers,
//               wrapper,
//               path ? `${path} > ${subQ.label}` : subQ.label,
//               subAnswerKey
//             )
//           );
//         }
//         // Si c’est un accordion
//         if (subQ.type === 'accordion') {
//           (subQ.sections || []).forEach(section => {
//             (section.questions || []).forEach(q => {
//               const qAnswerKey = wrapper?.optionIndex !== undefined ? `${q.id}_${wrapper.optionIndex}` : q.id;
//               const qValue = answers[qAnswerKey];
//               if (q.required && !ValidationService.hasRealAnswer(qValue)) {
//                 missingFields.push(`${path ? path + ' > ' : ''}${subQ.label || subQ.id} > ${section.title} > ${q.label || q.id}`);
//                 console.log('DEBUG: accordion missingFields pushed', missingFields[missingFields.length - 1]);
//               }
//               if (q.options?.length) {
//                 missingFields.push(
//                   ...ValidationService.validateSubQuestionsRecursive(q.options, answers, wrapper, `${path ? path + ' > ' : ''}${subQ.label || subQ.id} > ${section.title}`, qAnswerKey)
//                 );
//               }
//             });
//           });
//         }
        
//       });
//     });
    
//     return missingFields;
//   }
  
//   // ---------------- Helper ----------------
  
//   static hasRealAnswer(value) {
//     if (value === null || value === undefined) return false;
//     if (typeof value === 'string') return value.trim() !== '';
//     if (Array.isArray(value)) return value.length > 0;
//     if (typeof value === 'object')
//       return Object.values(value).some(v => ValidationService.hasRealAnswer(v));
//     return true;
//   }
  
//   static checkPrecision(questionId, codeItem, answers) {
//     const precisionKey = `${questionId}_pr_${codeItem}`;
//     const precisionValue = answers[precisionKey];
//     return precisionValue && precisionValue.trim() !== '';
//   }
  
//   static showMissingToast(message) {
//     ToastService.show(message, { type: 'error' });
//   }
  
//   // ---------------- Accordion ----------------
//   static validateAccordion(step, answers, missingFields) {
//     const answer = answers[step.id];
//     if (!answer || typeof answer !== 'object') {
//       missingFields.push(step.label || step.id);
//       return;
//     }
    
//     (step.sections || []).forEach(section => {
//       (section.questions || []).forEach(question => {
//         const value = answer[question.id];
//         if (!question.required) return;
        
//         switch (question.type) {
//           case 'text':
//           case 'spinner':
//           case 'autocomplete':
//           case 'single_choice':
//           if (!ValidationService.hasRealAnswer(value)) {
//             missingFields.push(`${section.title} > ${question.label || question.id}`);
//           }
//           break;
          
//           case 'multiple_choice':
//           if (
//             (!Array.isArray(value) && !value) || // ni tableau ni string
//             (Array.isArray(value) && value.filter(v => v && v.trim() !== '').length === 0) || // tableau vide
//             (typeof value === 'string' && value.trim() === '') // string vide
//           ) {
//             missingFields.push(`${section.title} > ${question.label || question.id}`);
//           }
//           break;
          
          
//           default:
//           if (q.options?.length) {
//             const answerKey = wrapper?.optionIndex !== undefined ? `${q.id}_${wrapper.optionIndex}` : q.id;
//             missingFields.push(
//               ...ValidationService.validateSubQuestionsRecursive(q.options, answers, wrapper, q.label, answerKey)
//             );
//           }
          
//         }
//       });
//     });
//   }
  
//   // ---------------- Grid ----------------
//   static validateGridStep(step, answers) {
//     const answer = answers[step.id]?.value;
//     if (!answer || Object.keys(answer).length === 0) {
//       ValidationService.showMissingToast(`Veuillez répondre à la question obligatoire : ${step.label || step.id}`);
//       return false;
//     }
    
//     const missingRows = [];
//     const missingColumns = [];
    
//     // Lignes obligatoires
//     (step.questions || []).forEach(q => {
//       if (q.required && !ValidationService.hasRealAnswer(answer[q.id])) {
//         missingRows.push(q.label || q.id);
//       }
//     });
    
//     // Colonnes obligatoires
//     (step.reponses || []).forEach(resp => {
//       if (resp.input?.axis === 'column' && resp.input?.required) {
//         const respId = resp.id;
//         let hasAnswer = false;
        
//         if (typeof answer[respId] === 'string' && answer[respId].trim() !== '') {
//           hasAnswer = true;
//         }
        
//         (step.questions || []).forEach(q => {
//           const rowAnswer = answer[q.id];
//           if (!rowAnswer) return;
//           if (q.cells?.[respId]?.enabled === false) return;
//           if (Array.isArray(rowAnswer) && rowAnswer.includes(respId)) hasAnswer = true;
//         });
        
//         if (!hasAnswer) missingColumns.push(resp.label || respId);
//       }
//     });
    
//     if (missingRows.length || missingColumns.length) {
//       let message = '';
//       if (missingRows.length) message += `Veuillez répondre à chaque ligne obligatoire :<br>${missingRows.map(r => `• ${r}`).join('<br>')}<br>`;
//       if (missingColumns.length) message += `Veuillez répondre à chaque colonne obligatoire :<br>${missingColumns.map(c => `• ${c}`).join('<br>')}`;
//       ValidationService.showMissingToast(message);
//       return false;
//     }
    
//     return true;
//   }
  
//   // ---------------- Vérification d'un step ----------------
//   static validateStep(step, answers, wrapper = null) {
//     if (step.type === 'grid') return ValidationService.validateGridStep(step, answers);
    
//     const missingFields = [];
//     const questionList = step.questions || [step];
    
//     questionList.forEach(q => {
//       const answerKey = wrapper?.optionIndex !== undefined ? `${q.id}_${wrapper.optionIndex}` : q.id;
//       const value = answers[answerKey];
//       if (!q.required) return;
      
//       switch (q.type) {
//         case 'text':
//         case 'spinner':
//         case 'autocomplete':
//         if (!ValidationService.hasRealAnswer(value)) missingFields.push(q.label || q.id);
//         break;
        
//         case 'single_choice':
//         if (!ValidationService.hasRealAnswer(value)) missingFields.push(q.label || q.id);
//         else {
//           const selectedOption = q.options?.find(opt => opt.codeItem?.toString() === value?.toString());
//           if (selectedOption?.requiresPrecision && !ValidationService.checkPrecision(q.id, value, answers)) {
//             missingFields.push(`Précision pour "${selectedOption.label}"`);
//           }
//         }
//         break;
        
//         case 'multiple_choice':
//         const selectedArray = Array.isArray(value) ? value.filter(v => v && v.trim() !== '') : [];
//         if (!selectedArray.length) missingFields.push(q.label || q.id);
//         else {
//           selectedArray.forEach(codeItem => {
//             const selectedOption = q.options?.find(opt => opt.codeItem?.toString() === codeItem?.toString());
//             if (selectedOption?.requiresPrecision && !ValidationService.checkPrecision(q.id, codeItem, answers)) {
//               missingFields.push(`Précision pour "${selectedOption.label}"`);
//             }
//           });
//         }
//         break;
        
//         case 'accordion':
//         ValidationService.validateAccordion(q, answers, missingFields);
//         break;
        
//         default:
//         if (!ValidationService.hasRealAnswer(value)) missingFields.push(q.label || q.id);
//       }
//       // Valider récursivement toutes les sous-questions
//       if (q.options?.length) {
//         missingFields.push(
//           ...ValidationService.validateSubQuestionsRecursive(q.options, answers, wrapper, q.label, answerKey)
//         );
//       }
      
//     });
    
//     if (missingFields.length > 0) {
//       const message = `Veuillez répondre aux questions obligatoires : ${missingFields.join(', ')}`;
//       ValidationService.showMissingToast(message);
//       return false;
//     }
    
//     return true;
//   }
// }

