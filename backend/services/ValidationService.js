import PrecisionUtils from './precisionUtils.js';
import SurveyService from './SurveyService.js';
import ToastService from './ToastService.js';

export default class ValidationService {

  // ===========================================================================
  // GENERIC HELPERS
  // ===========================================================================



  /**
   * Construit la clé d’une réponse (wrapper / sous-question)
   */
  static buildAnswerKey(questionId, wrapper) {
    return wrapper?.optionIndex !== undefined
      ? `${questionId}_${wrapper.optionIndex}`
      : questionId;
  }

  // /**
  //  * Vérifie la précision obligatoire d’une option
  //  */
  // static hasRequiredPrecision(questionId, codeItem, answers) {
  //   const key =  PrecisionUtils.buildPrecisionKey(questionId, codeItem);
  //   return !!answers[key]?.trim();
  // }
 
  
  /**
   * Affiche un toast d’erreur standard
   */
  static showMissingToast(message) {
    ToastService.show(message, { type: 'error' });
  }
/**
 * Retourne la liste des messages de validation pour un step
 * Sans afficher le toast côté backend
 */
static getMissingMessages(step, answers) {
  // Si c'est une grille
  if (step.type === 'grid') {
    const value = answers[step.id] || {};
    const missingColumns = [];

    step.reponses?.forEach(col => {
      if (col.input?.axis !== 'column' || !col.input?.required) return;

      let hasAnswer = false;
      step.questions?.forEach(row => {
        const rowValue = value[row.id];
        if (Array.isArray(rowValue) && rowValue.includes(col.id)) {
          hasAnswer = true;
        }
      });

      if (!hasAnswer) missingColumns.push(col.label || col.id);
    });

    if (missingColumns.length) {
      return [`Veuillez répondre à chaque colonne obligatoire : ${missingColumns.join(', ')}`];
    }

    return [];
  }

  // Sinon logique normale
  const missing = [];
  (step.questions || [step]).forEach(q => {
    const value = answers[q.id];
    if (q.required && !SurveyService.hasRealAnswer(value)) missing.push(q.label || q.id);
  });
  return missing;
}


static getInvalidFields(step, answers, wrapper = null) {
  const fields = [];

  // === 1️⃣ Gestion spécifique pour les grids ===
  if (step.type === 'grid') {
    const value = answers[step.id] || {};

    // Colonnes obligatoires
    step.reponses?.forEach(col => {
      if (col.input?.axis !== 'column' || !col.input?.required) return;

      let hasAnswer = false;

      step.questions.forEach(row => {
        const rowValue = value[row.id]; // ex: value["q13_1"] = ["R1"]
        if (Array.isArray(rowValue) && rowValue.includes(col.id)) {
          hasAnswer = true;
        }
      });
      if (!hasAnswer) {
        // renvoyer directement le name HTML de l'input
        // pour axis: column, name = ligne id
        const firstEnabledRow = step.questions.find(
          row => row.cells?.[col.id]?.enabled !== false
        );
        if (firstEnabledRow) {
          fields.push(firstEnabledRow.id); // ex: "q13_1"
        }
      }
    });
  }

  // === 2️⃣ Logique existante pour les questions normales ===
  const questions = step.questions || [step];

  questions.forEach(q => {
    const answerKey = this.buildAnswerKey(q.id, wrapper);
    const value = answers[answerKey];

    // Question obligatoire
    if (q.required && !SurveyService.hasRealAnswer(value)) {
      fields.push(answerKey);
    }

    // Precision requise
    if (
      (q.type === 'single_choice' || q.type === 'multiple_choice') &&
      SurveyService.hasRealAnswer(value)
    ) {
      const values = SurveyService.normalizeToArray(value);

      values.forEach(code => {
        const opt = q.options?.find(
          o => o.codeItem?.toString() === code?.toString()
        );
        if (!opt) return;

        if (opt?.requiresPrecision) {
          const precisionKey = PrecisionUtils.buildPrecisionKey(q.id, code);
          if (!answers[precisionKey]?.trim()) {
            fields.push(precisionKey);
          }
        }

        if (opt.subQuestions?.length) {
          fields.push(
            ...this.getInvalidSubFields({
              options: [opt],
              answers,
              parentAnswerKey: answerKey,
              wrapper
            })
          );
        }
      });
    }

    // Sous-questions hors choice
    if (q.options?.length && q.type !== 'single_choice' && q.type !== 'multiple_choice') {
      fields.push(
        ...this.getInvalidSubFields({
          options: q.options,
          answers,
          parentAnswerKey: answerKey,
          wrapper
        })
      );
    }

    // Accordion
    if (q.type === 'accordion') {
      q.sections?.forEach(section => {
        section.questions?.forEach(subQ => {
          const subKey = this.buildAnswerKey(subQ.id, wrapper);
          const subValue = answers[subKey];
          if (subQ.required && !SurveyService.hasRealAnswer(subValue)) {
            fields.push(subKey);
          }

          if (subQ.options?.length) {
            fields.push(
              ...this.getInvalidSubFields({
                options: subQ.options,
                answers,
                parentAnswerKey: subKey,
                wrapper
              })
            );
          }
        });
      });
    }
  });

  return [...new Set(fields)];
}


static getInvalidSubFields({
  options = [],
  answers,
  parentAnswerKey,
  wrapper = null
}) {
  const fields = [];

  options.forEach(option => {
    const parentValues = SurveyService
      .normalizeToArray(answers[parentAnswerKey])
      .map(v => v?.toString());

    if (!parentValues.includes(option.codeItem?.toString())) return;

    option.subQuestions?.forEach(subQ => {
      const subKey = wrapper?.optionIndex !== undefined
        ? `${subQ.id}_${wrapper.optionIndex}`
        : `${parentAnswerKey}_${option.codeItem}_${subQ.id}`;

      const value = answers[subKey];

      if (subQ.required && !SurveyService.hasRealAnswer(value)) {
        fields.push(subKey);
      }

      if (subQ.options?.length) {
        fields.push(
          ...this.getInvalidSubFields({
            options: subQ.options,
            answers,
            parentAnswerKey: subKey,
            wrapper
          })
        );
      }
    });
  });

  return fields;
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
      const parentValues = SurveyService.normalizeToArray(parentValue).map(v => v?.toString());

      // L’option parent n’est pas sélectionnée → on ignore ses sous-questions
      if (!parentValues.includes(option.codeItem?.toString())) return;

      option.subQuestions?.forEach(subQ => {
        const subKey = wrapper?.optionIndex !== undefined
          ? `${subQ.id}_${wrapper.optionIndex}`
          : `${parentAnswerKey}_${option.codeItem}_${subQ.id}`;

        const value = answers[subKey];
        const labelPath = path ? `${path} > ${subQ.label || subQ.id}` : (subQ.label || subQ.id);

        // Sous-question obligatoire
        if (subQ.required && !SurveyService.hasRealAnswer(value)) {
          missing.push(labelPath);
        }

        // Récursivité sur options
        if (subQ.options?.length && SurveyService.hasRealAnswer(value)) {
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

              if (q.required && !SurveyService.hasRealAnswer(qValue)) {
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
        if (!SurveyService.hasRealAnswer(value)) {
          missingFields.push(`${section.title} > ${q.label || q.id}`);
        }
      });
    });
  }

  // ===========================================================================
  // GRID
  // ===========================================================================

  static validateGridStep(step, answers) {
    const value = answers[step.id]||{};
   // console.log("value big",value)
    const missingRows = [];
    const missingColumns = [];

    // Lignes obligatoires
    step.questions?.forEach(row => {
      
      const rowValue = value[row.id];
      if (row.required && !SurveyService.hasRealAnswer(rowValue)) {
        missingRows.push(row.label || row.id);
      }
    });

    // Colonnes obligatoires
    step.reponses?.forEach(col => {
      if (col.input?.axis !== 'column' || !col.input?.required) return;

      const colId = col.id;
      //console.log("col",col ,"colId",colId)
      let hasAnswer = SurveyService.hasRealAnswer(value[colId]);
//console.log("hasAnswer",hasAnswer)
      step.questions?.forEach(row => {
        const rowValue = value[row.id];
       // console.log("rowValue row col",rowValue ,"value",value)
        if (Array.isArray(rowValue) && rowValue.includes(colId)) {
          hasAnswer = true;
        }
      });
console.log('!hasAnswer',!hasAnswer)
      if (!hasAnswer) missingColumns.push(col.label || colId);
    });
    console.log('missingColumns',missingColumns)
    if (missingRows.length || missingColumns.length) {
      let msg = '';
      if (missingRows.length) {
        msg += `Veuillez répondre à chaque ligne obligatoire :<br>${missingRows.map(r => `• ${r}`).join('<br>')}<br>`;
      }
      if (missingColumns.length) {
       // console.log("missingColumns",missingColumns)

        msg += `Veuillez répondre à chaque colonne obligatoire :<br>${missingColumns.map(c => `• ${c}`).join('<br>')}`;
      }
      console.log('missingColumns msg',msg)
      this.showMissingToast(msg);
      return false;
    }

    return true;
  }

  // static validatePrecision({
  //   question,
  //   selectedValues,
  //   answers,
  //   missing,
  //   labelPrefix = ''
  // }) {
  //   const values = SurveyService.normalizeToArray(selectedValues);
  
  //   values.forEach(code => {
  //     const opt = question.options?.find(
  //       o => o.codeItem?.toString() === code?.toString()
  //     );
  
  //     if (!opt?.requiresPrecision) return;
  
  //     if (!this.hasRequiredPrecision(question.id, code, answers)) {
  //       const label = opt.label || code;
  //       missing.push(
  //         `${labelPrefix}Précision pour "${label}"`
  //       );
  //     }
  //   });
  // }
  
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

      if (q.required && !SurveyService.hasRealAnswer(value)) {
        missing.push(q.label || q.id);
      }

      // Validation par type
      if (
        (q.type === 'single_choice' || q.type === 'multiple_choice') &&
        SurveyService.hasRealAnswer(value)
      ) {
        PrecisionUtils.validatePrecision({
          question: q,
          selectedValues: value,
          answers,
          missing
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
