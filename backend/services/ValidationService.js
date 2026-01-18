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
/**
 * Retourne la liste des messages de validation pour un step
 * Sans afficher le toast côté backend
 */
static getMissingMessages(step, answers, wrapper = null) {
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
      // Appelle la validation récursive des accordion
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

  return missing;
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
    const value = answers[step.id]||{};
   // console.log("value big",value)
    const missingRows = [];
    const missingColumns = [];

    // Lignes obligatoires
    step.questions?.forEach(row => {
      
      const rowValue = value[row.id];
      if (row.required && !this.hasRealAnswer(rowValue)) {
        missingRows.push(row.label || row.id);
      }
    });

    // Colonnes obligatoires
    step.reponses?.forEach(col => {
      if (col.input?.axis !== 'column' || !col.input?.required) return;

      const colId = col.id;
      //console.log("col",col ,"colId",colId)
      let hasAnswer = this.hasRealAnswer(value[colId]);
//console.log("hasAnswer",hasAnswer)
      step.questions?.forEach(row => {
        const rowValue = value[row.id];
       // console.log("rowValue row col",rowValue ,"value",value)
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
       // console.log("missingColumns",missingColumns)

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
