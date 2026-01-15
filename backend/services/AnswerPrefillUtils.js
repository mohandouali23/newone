export default class AnswerPrefillUtils {

  // ===========================================================================
  // GENERIC HELPERS
  // ===========================================================================

  static hasRealAnswer(value) {
    if (value === null || value === undefined) return false;

    if (typeof value === 'string') {
      return value.trim() !== '' && value !== '/';
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === 'object') {
      return Object.values(value).some(v => this.hasRealAnswer(v));
    }

    return true;
  }

  static normalizeToArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.includes('/')) return value.split('/');
    if (value !== undefined && value !== null) return [value];
    return [];
  }

  static getSessionValue(session, key) {
    return session ? session[key] : undefined;
  }

  // ===========================================================================
  // SESSION KEYS
  // ===========================================================================

  static getPrecisionKey(stepId, codeItem) {
    return `${stepId}_pr_${codeItem}`;
  }

  static getSubQuestionKey(parentStepId, selectedValue, subQuestionId) {
    return `${parentStepId}_${selectedValue}_${subQuestionId}`;
  }

  // ===========================================================================
  // RESET
  // ===========================================================================

  static resetQuestionState(question) {
    question.value = undefined;

    if (!question.options) return;

    question.options.forEach(opt => {
      opt.isSelected = false;
      opt.precisionValue = '';
      opt.showPrecision = false;

      if (opt.subQuestions) {
        opt.subQuestions.forEach(subQ => this.resetQuestionState(subQ));
      }
    });
  }

  // ===========================================================================
  // SUB QUESTIONS
  // ===========================================================================

  static getSubQuestionValue({ parentStep, subQuestion, sessionAnswers }) {
    const parentValue = sessionAnswers[parentStep.id];
    if (!parentValue) return undefined;

    const parentValues = this.normalizeToArray(parentValue);

    for (const val of parentValues) {
      const key = this.getSubQuestionKey(parentStep.id, val, subQuestion.id);
      if (sessionAnswers[key] !== undefined) {
        return sessionAnswers[key];
      }
    }

    return undefined;
  }

  static prefillSubQuestion(subQ, value) {
    if (value === undefined || value === null || value === '') {
      this.resetQuestionState(subQ);
      return;
    }

    const normalizedValue =
      subQ.type === 'multiple_choice'
        ? this.normalizeToArray(value)
        : value;

    const fakeSession = { [subQ.id]: normalizedValue };

    if (typeof this[subQ.type] === 'function') {
      this[subQ.type](subQ, fakeSession);
    }
  }

  // ===========================================================================
  // OPTION HELPERS
  // ===========================================================================

  static fillSelectedOption(opt, savedValues) {
    opt.isSelected = savedValues.includes(opt.codeItem.toString());
  }

  static fillPrecision(opt, stepId, sessionAnswers) {
    const key = this.getPrecisionKey(stepId, opt.codeItem);
    opt.precisionValue = sessionAnswers[key] || '';
    opt.showPrecision = !!(opt.isSelected && opt.requiresPrecision);
  }

  // ===========================================================================
  // BASIC TYPES
  // ===========================================================================

  static text(step, sessionAnswers, keyOverride) {
    const key = keyOverride || step.id;
    step.value = sessionAnswers[key] || '';
  }

  static spinner(step, sessionAnswers, keyOverride) {
    const key = keyOverride || step.id;
    step.value = sessionAnswers[key] || '';

    step.options?.forEach(opt => {
      opt.isSelected = step.value === opt.codeItem.toString();
    });
  }

  // ===========================================================================
  // SINGLE CHOICE
  // ===========================================================================

  static single_choice(step, sessionAnswers, keyOverride) {
    const key = keyOverride || step.id;
    const stored = sessionAnswers[key] ?? sessionAnswers[step.id_db];
    const selectedValue = stored?.toString();

    step.options.forEach(opt => {
      opt.isSelected = opt.codeItem.toString() === selectedValue;

      // Sub-questions
      opt.subQuestions?.forEach(subQ => {
        this.resetQuestionState(subQ);

        if (!opt.isSelected) return;

        const subValue = this.getSubQuestionValue({
          parentStep: step,
          subQuestion: subQ,
          sessionAnswers
        });

        this.prefillSubQuestion(subQ, subValue);
      });

      this.fillPrecision(opt, key, sessionAnswers);
    });
  }

  // ===========================================================================
  // MULTIPLE CHOICE
  // ===========================================================================

  static multiple_choice(step, sessionAnswers, keyOverride) {
    const key = keyOverride || step.id;
    const saved = sessionAnswers[key];

    if (!saved) {
      this.resetQuestionState(step);
      return;
    }

    const savedValues = this.normalizeToArray(saved).map(v => v.toString());

    step.options.forEach(opt => {
      this.fillSelectedOption(opt, savedValues);
      this.fillPrecision(opt, key, sessionAnswers);

      opt.subQuestions?.forEach(subQ => {
        if (!opt.isSelected) {
          this.resetQuestionState(subQ);
          return;
        }

        const subValue = this.getSubQuestionValue({
          parentStep: step,
          subQuestion: subQ,
          sessionAnswers
        });

        this.prefillSubQuestion(subQ, subValue);
      });
    });
  }

  // ===========================================================================
  // AUTOCOMPLETE
  // ===========================================================================

  static autocomplete(step, sessionAnswers, keyOverride) {
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

      const displayColumn =
        step.columns?.find(c => c.displayInInput) || step.columns?.[0];

      step.displayValue = displayColumn
        ? parsed[displayColumn.name] || ''
        : parsed.toString();
    } catch {
      step.value = saved;
      step.displayValue = saved;
    }
  }

  // ===========================================================================
  // ACCORDION
  // ===========================================================================

  static accordion(step, sessionAnswers) {
    const saved = sessionAnswers[step.id];
    if (!saved) return;

    const prefillQuestion = q => {
      const value = saved[q.id];

      if (typeof this[q.type] === 'function') {
        const session = value !== undefined ? { [q.id]: value } : {};
        this[q.type](q, session);
      }

      if (q.type === 'accordion') {
        q.sections?.forEach(section =>
          section.questions.forEach(prefillQuestion)
        );
      }
    };

    step.sections.forEach(section =>
      section.questions.forEach(prefillQuestion)
    );
  }

  // ===========================================================================
  // GRID
  // ===========================================================================

  static grid(step, sessionAnswers, keyOverride) {
    const key = keyOverride || step.id;
    const saved = sessionAnswers[key]?.value;
    if (!saved) return;

    step.questions.forEach(row => {
      const rowValue = saved[row.id];

      row.columns.forEach(col => {
        col.checked = false;
        const colId = col.colId?.toString();
        if (!colId) return;

        const rowValues = this.normalizeToArray(rowValue).map(v => v.toString());
        const colValues = this.normalizeToArray(saved[colId]).map(v => v.toString());

        if (rowValues.includes(colId) || colValues.includes(row.id)) {
          col.checked = true;
        }
      });
    });
  }
}

