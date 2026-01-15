export default class ResponseNormalizer {

  /* ============================================================
   * API PUBLIQUE
   * ============================================================ */
  static normalize(step, rawValue, optionIndex = null) {
    if (!step) return {};

    const idDB = this.buildIdDB(step, optionIndex);

    const handler = this.handlers[step.type];
    if (!handler) {
      return { [idDB]: rawValue };
    }

    return handler.call(this, step, rawValue, idDB, optionIndex);
  }

  /* ============================================================
   * HANDLERS PAR TYPE DE QUESTION
   * ============================================================ */
  static handlers = {

    /* ---------------- ACCORDION ---------------- */
    accordion(step, rawValue, _idDB, optionIndex) {
      if (!this.isObject(rawValue)) return {};

      const result = {};

      step.sections?.forEach(section => {
        section.questions?.forEach(question => {
          const answer = rawValue[question.id];
          if (answer === undefined) return;

          // Normalisation récursive de chaque question interne
          const normalized = this.normalize(
            question,
            { [question.id]: answer },
            optionIndex
          );

          this.flattenResult(result, normalized);
        });
      });

      return result;
    },

    /* ---------------- TEXT / SPINNER ---------------- */
    text(step, rawValue, idDB) {
      return { [idDB]: rawValue };
    },

    spinner(step, rawValue, idDB) {
      return { [idDB]: rawValue };
    },

    /* ---------------- AUTOCOMPLETE ---------------- */
    autocomplete(step, rawValue, idDB) {
      try {
        const obj = typeof rawValue === 'string'
          ? JSON.parse(rawValue)
          : rawValue;

        return { [idDB]: obj?._id ?? null };
      } catch {
        return { [idDB]: null };
      }
    },

    /* ---------------- SINGLE CHOICE ---------------- */
    single_choice(step, rawValue, idDB) {
      const selectedValue = rawValue?.[step.id];
      const result = { [idDB]: selectedValue };

      const selectedOption = step.options?.find(
        opt => opt.codeItem?.toString() === selectedValue?.toString()
      );

      // Précision optionnelle
      this.appendPrecision(result, step, selectedValue, rawValue);

      // Sous-questions
      if (selectedOption?.subQuestions) {
        this.handleSubQuestions({
          parentStep: step,
          optionCode: selectedValue,
          subQuestions: selectedOption.subQuestions,
          rawValue,
          target: result
        });
      }

      return result;
    },

    /* ---------------- MULTIPLE CHOICE ---------------- */
    multiple_choice(step, rawValue) {
      if (!rawValue || !step.options) {
        return { [step.id_db]: null };
      }

      const selected = this.normalizeToArray(rawValue[step.id]);
      const result = { [step.id_db]: selected.join('/') };

      selected.forEach(codeItem => {
        if (codeItem == null) return;

        // Précision optionnelle
        this.appendPrecision(result, step, codeItem, rawValue);

        // Sous-questions
        const option = step.options.find(
          opt => opt.codeItem?.toString() === codeItem.toString()
        );

        if (option?.subQuestions) {
          this.handleSubQuestions({
            parentStep: step,
            optionCode: codeItem,
            subQuestions: option.subQuestions,
            rawValue,
            target: result
          });
        }
      });

      return result;
    },

    /* ---------------- GRID ---------------- */
    grid(step, rawValue) {
      if (!this.isObject(rawValue)) return {};

      const data = rawValue.value || rawValue;
      const value = {};

      const responsesById = this.indexById(step.reponses);
      const questionsById = this.indexById(step.questions);

      const isCellEnabled = (question, responseId) =>
        question.cells?.[responseId]?.enabled !== false;

      /* ======= PAR LIGNE ======= */
      step.questions.forEach(question => {
        const rawAnswer = data[question.id];
        if (rawAnswer === undefined) return;

        // RADIO AXE ROW
        if (typeof rawAnswer === 'string') {
          const response = responsesById[rawAnswer];
          if (
            response?.input?.axis === 'row' &&
            response.input.type === 'radio' &&
            isCellEnabled(question, rawAnswer)
          ) {
            value[question.id_db_qst] = response.id_db_rps;
          }
          return;
        }

        // CHECKBOX
        if (Array.isArray(rawAnswer)) {
          rawAnswer.forEach(responseId => {
            const response = responsesById[responseId];
            if (!response || !isCellEnabled(question, responseId)) return;

            if (response.input.axis === 'row') {
              value[question.id_db_qst] =
                value[question.id_db_qst]
                  ? `${value[question.id_db_qst]}/${response.id_db_rps}`
                  : response.id_db_rps;
            }

            if (response.input.axis === 'column') {
              value[response.id_db_rps] =
                value[response.id_db_rps]
                  ? `${value[response.id_db_rps]}/${question.id_db_qst}`
                  : question.id_db_qst;
            }
          });
        }
      });

      /* ======= RADIO AXE COLUMN (RACINE) ======= */
      Object.keys(data).forEach(responseId => {
        const response = responsesById[responseId];
        if (response?.input?.axis !== 'column' || response.input.type !== 'radio') return;

        const question = questionsById[data[responseId]];
        if (!question || !isCellEnabled(question, responseId)) return;

        value[response.id_db_rps] =
          value[response.id_db_rps]
            ? `${value[response.id_db_rps]}/${question.id_db_qst}`
            : question.id_db_qst;
      });

      return value;
    }
  };

  /* ============================================================
   * UTILITAIRES
   * ============================================================ */

  static buildIdDB(step, optionIndex) {
    return optionIndex ? `${step.id_db}_${optionIndex}` : step.id_db;
  }

  static isObject(val) {
    return val !== null && typeof val === 'object';
  }

  static normalizeToArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  static indexById(list = []) {
    return list.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }

  static flattenResult(target, source) {
    if (!this.isObject(source)) return;

    Object.entries(source).forEach(([key, value]) => {
      if (
        this.isObject(value) &&
        Object.keys(value).length === 1
      ) {
        target[key] = Object.values(value)[0];
      } else {
        target[key] = value;
      }
    });
  }

  static appendPrecision(target, step, codeItem, rawValue) {
    if (!rawValue) return;
   // console.log("rawvalue pr", rawValue)

    // single_choice → precision_5
    // multiple_choice → precision_q3_2
    const possibleKeys = [
      `precision_${codeItem}`,
      `precision_${step.id}_${codeItem}`
    ];
  
    const precisionValue = possibleKeys
      .map(k => rawValue[k])
      .find(v => typeof v === 'string' && v.trim() !== '');
  
    if (precisionValue) {
      target[`${step.id_db}_pr_${codeItem}`] = precisionValue.trim();
    }
  }
  

  static handleSubQuestions({
    parentStep,
    optionCode,
    subQuestions,
    rawValue,
    target
  }) {
    subQuestions.forEach(subQ => {
      const normalized = this.normalize(subQ, rawValue);
      Object.entries(normalized).forEach(([key, value]) => {
        const finalKey = `${parentStep.id_db}_${optionCode}_${key}`;
        target[finalKey] = value;
      });
    });
  }
}

