import SurveyService from "./SurveyService.js";

export default class PrecisionUtils {
 /**************************krys */
    static buildPrecisionKey(questionId, codeItem) {
        return `${questionId}_pr_${codeItem}`;
      }
      
      static getPrecisionValue({ questionId, codeItem, answers }) {
        const key = this.buildPrecisionKey(questionId, codeItem);
        return answers?.[key]?.trim() || '';
      }

      /* ================================
   * OPTION HELPERS
   * ================================ */

  static optionRequiresPrecision(option) {
    return option?.requiresPrecision === true;
  }

  static findOption(question, codeItem) {
    return question.options?.find(
      o => o.codeItem?.toString() === codeItem?.toString()
    );
  }

  /* ================================
   * VALIDATION
   * ================================ */

  static hasRequiredPrecision({ questionId, codeItem, answers }) {
    return !!this.getPrecisionValue({ questionId, codeItem, answers });
  }

  static validatePrecision({
    question,
    selectedValues,
    answers,
    missing,
    labelPrefix = ''
  }) {
    const values = SurveyService.normalizeToArray(selectedValues);
  

    values.forEach(code => {
      const option = this.findOption(question, code);
      if (!this.optionRequiresPrecision(option)) return;

      if (!this.hasRequiredPrecision({
        questionId: question.id,
        codeItem: code,
        answers
      })) {
        missing.push(
          `${labelPrefix}Précision pour "${option.label || code}"`
        );
      }
    });
  }

  /* ================================
   * SESSION SAVE
   * ================================ */

  static savePrecisions({
    step,
    rawValue,
    selectedValues,
    sessionAnswers
  }) {
    if (!step?.options || !sessionAnswers) return;

    const values = Array.isArray(selectedValues)
      ? selectedValues.map(String)
      : selectedValues !== undefined
        ? [String(selectedValues)]
        : [];

    // Supprimer toutes les anciennes précisions non sélectionnées
    step.options.forEach(opt => {
      const key = this.buildPrecisionKey(step.id, opt.codeItem);
      if (!values.includes(String(opt.codeItem))) {
        delete sessionAnswers[key];
      }
    });

    // Sauvegarder les nouvelles
    values.forEach(code => {
      const option = this.findOption(step, code);
      if (!this.optionRequiresPrecision(option)) return;

      const inputKey = `precision_${step.id}_${code}`;
      const value = rawValue?.[inputKey]?.trim();

      if (value) {
        sessionAnswers[this.buildPrecisionKey(step.id, code)] = value;
      }
    });
  }
}
