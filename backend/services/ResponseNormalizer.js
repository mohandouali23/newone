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


// export default class ResponseNormalizer {
//   static normalize(step, rawValue, optionIndex=null) {
//     const idDB = optionIndex ? `${step.id_db}_${optionIndex}` : step.id_db;
//     let value;
    
//     switch(step.type) {
      
//       case 'accordion': {
//         const result = {};
        
//         if (!rawValue || typeof rawValue !== 'object') return result;
        
//         step.sections.forEach(section => {
//           section.questions.forEach(question => {
//             const answer = rawValue[question.id];
//             if (answer === undefined) return;
            
//             // Normaliser la question individuellement
//             const normalized = ResponseNormalizer.normalize(
//               question,
//               { [question.id]: answer },
//               optionIndex
//             );
            
//             if (!normalized || typeof normalized !== 'object') return;
            
//             //  Injecter toutes les réponses directement dans result (plat)
//             Object.entries(normalized).forEach(([k, v]) => {
//               // si v est un objet à 1 clé, extraire la valeur
//               if (typeof v === 'object' && v !== null && Object.keys(v).length === 1) {
//                 v = Object.values(v)[0];
//               }
              
//               result[k] = v;
//             });
//           });
//         });
        
//         return result; 
//       }
      
//       case 'text':
//       case 'spinner':
//       value = rawValue;
//       break;
//       case 'autocomplete':
//       // rawValue est envoyé depuis le front sous forme d'objet JSON { commune, cp, _id, ... }
//       try {
//         const obj = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
//         value = obj._id; // on ne garde que _id
//       } catch (e) {
//         value = null;
//       }
//       break;
//       case 'single_choice': {
//         const selectedValue = rawValue[step.id];
//         value = selectedValue;
//         const result = {
//           [idDB]: value
//         };
//         // récupérer l'option sélectionnée
//         const selectedOption = step.options?.find(
//           opt => opt.codeItem?.toString() === selectedValue?.toString()
//         );
//         // gérer la précision si requise
//         if (selectedOption?.requiresPrecision) {
//           const precisionValue = rawValue[`precision_${selectedValue}`];
//           if (precisionValue && precisionValue.trim() !== '') {
//             result[`${step.id_db}_pr_${selectedValue}`] = precisionValue.trim();
//           }
//         }
//         // --- Sous-questions récursives ---
//         if (selectedOption?.subQuestions) {
//           selectedOption.subQuestions.forEach(subQ => {
//             // normalisation récursive
//             const normalizedSubQ = ResponseNormalizer.normalize(subQ, rawValue);
//             // fusionner dans le résultat avec clé uniforme
//             Object.keys(normalizedSubQ).forEach(subKey => {
//               // <id_db_question_principale>_<codeItem_option>_<id_db_sous_question>
//               const subQIdDB = `${step.id_db}_${selectedValue}_${subQ.id_db}`;
//               result[subQIdDB] = normalizedSubQ[subKey];
//             });
//           });
//         }return result;
//       }
//       case 'multiple_choice': {
//         // if (!rawValue) {
//         //   return { [step.id_db]: null };
//         // }
//         if (!rawValue || !step.options) return { [step.id_db]: null };

//         // selectedArray contient les codes sélectionnés
//         const selectedArray = Array.isArray(rawValue[step.id]) ? rawValue[step.id] : [rawValue[step.id]];
//         const mainValue = selectedArray.join('/');
//         // Objet final à retourner
//         const result = { [step.id_db]: mainValue };
//         // Ajouter les champs de précision pour chaque code sélectionné
//         selectedArray.forEach(codeItem => {
//           if (codeItem === undefined || codeItem === null) return; // ✅ skip undefined

//           const precisionKey = `precision_${step.id}_${codeItem}`;
//           const precisionValue = rawValue[precisionKey];
//           if (precisionValue && precisionValue.trim() !== '') {
//             result[`${step.id_db}_pr_${codeItem}`] = precisionValue;
//           }
          
//           // gérer sous-questions
//           const option = step.options.find(opt => opt.codeItem.toString() === codeItem.toString());
//           if (!option?.subQuestions) return; //  skip si option ou subQuestions absent

//           // console.log("option subQ",option)

//           if (option?.subQuestions) {
//             option.subQuestions.forEach(subQ => {
//                // Normalisation récursive
//               const normalizedSubQ = ResponseNormalizer.normalize(subQ, rawValue);
//               console.log("normalizedSubQ",normalizedSubQ)
//                // Fusion avec clé : question principale _ code option _ id_db_sous_question
//         Object.keys(normalizedSubQ).forEach(subKey => {
//           const finalKey = `${step.id_db}_${codeItem}_${subKey}`;
//           result[finalKey] = normalizedSubQ[subKey];
//         });
//             });
//           }
//         });
//         return result;
//         break;
//       }
//       case 'grid': {
//         const value = {};
//         if (!rawValue || typeof rawValue !== 'object') break;
        
//         const data = rawValue.value || rawValue;
        
//         const responsesById = {};
//         step.reponses.forEach(r => (responsesById[r.id] = r));
        
//         const questionsById = {};
//         step.questions.forEach(q => (questionsById[q.id] = q));
        
//         const isCellEnabled = (question, responseId) =>
//           question.cells?.[responseId]?.enabled !== false;
        
//         /* *************************** par ligne ********************** */
//         step.questions.forEach(question => {
//           const rawAnswer = data[question.id];
//           if (rawAnswer === undefined) return;
          
//           /* ---------- RADIO / AXE ROW ---------- */
//           if (typeof rawAnswer === 'string') {
//             const response = responsesById[rawAnswer];
//             if (
//               response &&
//               response.input?.axis === 'row' &&
//               response.input?.type === 'radio' &&
//               isCellEnabled(question, rawAnswer)
//             ) {
//               value[question.id_db_qst] = response.id_db_rps;
//             }
//             return;
//           }
          
//           /* ===========================
//           CHECKBOX (row / column)
//           =========================== */
//           if (Array.isArray(rawAnswer)) {
//             rawAnswer.forEach(responseId => {
//               const response = responsesById[responseId];
//               if (!response) return;
//               if (!isCellEnabled(question, responseId)) return;
              
//               const axis = response.input.axis;
              
//               // ----- AXE ROW -----
//               if (axis === 'row') {
//                 value[question.id_db_qst] = value[question.id_db_qst]
//                 ? `${value[question.id_db_qst]}/${response.id_db_rps}`
//                 : response.id_db_rps;
//               }
              
//               // ----- AXE COLUMN -----
//               if (axis === 'column') {
//                 value[response.id_db_rps] = value[response.id_db_rps]
//                 ? `${value[response.id_db_rps]}/${question.id_db_qst}`
//                 : question.id_db_qst;
//               }
//             });
//           }
//         });
        
//         /* ===========================
//         RADIO + AXE COLUMN (racine)
//         =========================== */
//         Object.keys(data).forEach(responseId => {
//           const response = responsesById[responseId];
//           if (
//             response &&
//             response.input?.axis === 'column' &&
//             response.input?.type === 'radio'
//           ) {
//             const questionId = data[responseId];
//             const question = questionsById[questionId];
            
//             // cellule désactivée
//             if (!question || !isCellEnabled(question, responseId)) return;
            
//             const key = response.id_db_rps;
//             const val = question.id_db_qst;
            
//             // concaténer si déjà existant
//             value[key] = value[key] ? `${value[key]}/${val}` : val;
//           }
//         });
        
//         return value; //  plat, toutes les réponses avec id_db_qst/id_db_rps
//       }
//       default:
//       value = rawValue;
//       break;
//     }
    
//     return { [idDB]: value };
//   }
// }

