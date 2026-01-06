
export default class ResponseNormalizer {
  static normalize(step, rawValue, optionIndex=null) {
    const idDB = optionIndex ? `${step.id_db}_${optionIndex}` : step.id_db;
    let value;
   // console.log('rawvaluegrid',rawValue)

    switch(step.type) {
     
      case 'accordion': {
        value = {};
        if (!rawValue || typeof rawValue !== 'object') break;
        step.sections.forEach(section => {
          const sectionId = optionIndex ? `${section.id_sect}_${optionIndex}` : section.id_sect;
          section.questions.forEach(question => {
            const answerForQuestion = rawValue[question.id];
            if (answerForQuestion === undefined) return;
            // Normaliser la question individuellement
            const normalized = ResponseNormalizer.normalize(question, { [question.id]: answerForQuestion }, optionIndex);
            // Récupérer la clé (idDB) et la valeur
            const qId = Object.keys(normalized)[0];
            let val = normalized[qId];
            // Si val est un objet avec une seule clé (comme { q10_2: 'b12' }), extraire directement la valeur
            if (typeof val === 'object' && val !== null && Object.keys(val).length === 1) {
              val = Object.values(val)[0];
            }
            value[`${sectionId}:${qId}`] = val;
          });
        });
        break;
      }
      case 'text':
      case 'spinner':
        value = rawValue;
        break;
      case 'autocomplete':
        // rawValue est envoyé depuis le front sous forme d'objet JSON { commune, cp, _id, ... }
        try {
          const obj = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
          value = obj._id; // on ne garde que _id
        } catch (e) {
          value = null;
        }
        break;
        case 'single_choice': {
         
          const selectedValue = rawValue[step.id];
         console.log("selected value single",selectedValue)
          value = selectedValue;
          const result = {
            [idDB]: value
          };
          // récupérer l'option sélectionnée
          const selectedOption = step.options?.find(
            opt => opt.codeItem?.toString() === selectedValue?.toString()
          );
          // gérer la précision si requise
          if (selectedOption?.requiresPrecision) {
            const precisionValue = rawValue[`precision_${selectedValue}`];
            if (precisionValue && precisionValue.trim() !== '') {
              result[`${step.id_db}_pr_${selectedValue}`] = precisionValue.trim();
            }
          }
   // --- Sous-questions récursives ---
  if (selectedOption?.subQuestions) {
    selectedOption.subQuestions.forEach(subQ => {
      // normalisation récursive
      const normalizedSubQ = ResponseNormalizer.normalize(subQ, rawValue);
     // fusionner dans le résultat avec clé uniforme
      Object.keys(normalizedSubQ).forEach(subKey => {
        // <id_db_question_principale>_<codeItem_option>_<id_db_sous_question>
        const subQIdDB = `${step.id_db}_${selectedValue}_${subQ.id_db}`;
        result[subQIdDB] = normalizedSubQ[subKey];
      });
    });
  }return result;
        }
        case 'multiple_choice': {
          if (!rawValue) {
            return { [step.id_db]: null };
          }
          // selectedArray contient les codes sélectionnés
          const selectedArray = Array.isArray(rawValue[step.id]) ? rawValue[step.id] : [rawValue[step.id]];
          const mainValue = selectedArray.join('/');
          // Objet final à retourner
          const result = { [step.id_db]: mainValue };
          // Ajouter les champs de précision pour chaque code sélectionné
          selectedArray.forEach(codeItem => {
            const precisionKey = `precision_${step.id}_${codeItem}`;
            const precisionValue = rawValue[precisionKey];
            if (precisionValue && precisionValue.trim() !== '') {
              result[`${step.id_db}_pr_${codeItem}`] = precisionValue;
            }
          });
          return result;
          break;
        }
        case 'grid': {
          const isCellEnabled = (question, responseId) => {
            return question.cells?.[responseId]?.enabled !== false;
          };
          value = {};
          if (!rawValue || typeof rawValue !== 'object') break;
          const data = rawValue.value || rawValue; // <-- prendre la vraie valeur

          const responsesById = {};
          step.reponses.forEach(r => (responsesById[r.id] = r));

         const questionsById = {};
         step.questions.forEach(q => (questionsById[q.id] = q));

/* ***************************par ligne ***********************/
          step.questions.forEach(question => {
            const rawAnswer = data[question.id];
            if (rawAnswer === undefined) return;
         /* ---------- RADIO / AXE ROW ---------- */
            if (typeof rawAnswer === 'string') {
              const response = responsesById[rawAnswer];
              if (
                response &&
                response.input.axis === 'row' &&
                response.input.type === 'radio' &&
                isCellEnabled(question, rawAnswer)
              ) {
                value[question.id] = rawAnswer;
              }
              return;
            }
        
            /* ===========================
               CHECKBOX (row / column)
               =========================== */
if (Array.isArray(rawAnswer)) {
  rawAnswer.forEach(responseId => {
    const response = responsesById[responseId];
    if (!response) return;

    if (!isCellEnabled(question, responseId)) return;

    const axis = response.input.axis;

    // ----- AXE ROW -----
    if (axis === 'row') {
      value[question.id] = value[question.id]
        ? `${value[question.id]}/${responseId}`
        : responseId;
    }

    // ----- AXE COLUMN -----
    if (axis === 'column') {
      value[responseId] = value[responseId]
        ? `${value[responseId]}/${question.id}`
        : question.id;
    }
  });
}});
        /* ===========================
     RADIO + AXE COLUMN (racine)
     =========================== */
  Object.keys(data).forEach(responseId => {
    const response = responsesById[responseId];
    if (
      response &&
      response.input.axis === 'column' &&
      response.input.type === 'radio'
    ) {
      const questionId = data[responseId];
      const question = questionsById[questionId];

      //  cellule désactivée
      if (!question || !isCellEnabled(question, responseId)) return;

      value[responseId] = questionId;
    }
          });
        
          break;
        }
        
        
console.log("value normlize",value)
      default:
        value = rawValue;
        break;
    }

    return { [idDB]: value };
  }
}












/*******************************************************
 * ************************************************
 * ******************** hada code jdid bsh y ecraser valeur rotation
 */
// export default class ResponseNormalizer {

//   // ---------------- Helpers ----------------
//   static normalizePrecision(stepId, selectedValue, rawValue) {
//     const precisionKey = `precision_${stepId}_${selectedValue}`;
//     const precisionValue = rawValue[precisionKey];
//     return (precisionValue && precisionValue.trim() !== '') ? precisionValue.trim() : null;
//   }

//   static normalizeSubQuestions(step, selectedValue, rawValue) {
//     const result = {};
//     const selectedOption = step.options?.find(opt => opt.codeItem?.toString() === selectedValue?.toString());
//     if (!selectedOption?.subQuestions) return result;

//     selectedOption.subQuestions.forEach(subQ => {
//       const normalizedSubQ = ResponseNormalizer.normalize(subQ, rawValue);
//       Object.keys(normalizedSubQ).forEach(subKey => {
//         // <id_db_question_principale>_<codeItem_option>_<id_db_sous_question>
//         const subQIdDB = `${step.id_db}_${selectedValue}_${subQ.id_db}`;
//         result[subQIdDB] = normalizedSubQ[subKey];
//       });
//     });

//     return result;
//   }

//   static isCellEnabled(question, responseId) {
//     return question.cells?.[responseId]?.enabled !== false;
//   }

//   // ---------------- Normalization par type ----------------
//   static normalizeText(step, rawValue) {
//     return rawValue ?? null;
//   }

//   static normalizeSpinner(step, rawValue) {
//     return rawValue ?? null;
//   }

//   static normalizeAutocomplete(step, rawValue) {
//     try {
//       const obj = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
//       return obj?._id ?? null;
//     } catch (e) {
//       return null;
//     }
//   }

//   static normalizeSingleChoice(step, rawValue) {
//     const selectedValue = rawValue[step.id];
//     const result = { [step.id_db]: selectedValue };

//     // gestion de la précision
//     const precisionValue = ResponseNormalizer.normalizePrecision(step.id, selectedValue, rawValue);
//     if (precisionValue) result[`${step.id_db}_pr_${selectedValue}`] = precisionValue;

//     // gestion des sous-questions
//     Object.assign(result, ResponseNormalizer.normalizeSubQuestions(step, selectedValue, rawValue));

//     return result;
//   }

//   static normalizeMultipleChoice(step, rawValue) {
//     if (!rawValue || !rawValue[step.id]) return { [step.id_db]: null };

//     const selectedArray = Array.isArray(rawValue[step.id]) ? rawValue[step.id] : [rawValue[step.id]];
//     const mainValue = selectedArray.join('/');
//     const result = { [step.id_db]: mainValue };

//     selectedArray.forEach(codeItem => {
//       const precisionValue = ResponseNormalizer.normalizePrecision(step.id, codeItem, rawValue);
//       if (precisionValue) result[`${step.id_db}_pr_${codeItem}`] = precisionValue;
//     });

//     return result;
//   }

//   static normalizeAccordion(step, rawValue, optionIndex = null) {
//     const value = {};
//     if (!rawValue || typeof rawValue !== 'object') return value;

//     step.sections.forEach(section => {
//       const sectionId = optionIndex ? `${section.id_sect}_${optionIndex}` : section.id_sect;
//       section.questions.forEach(question => {
//         const answerForQuestion = rawValue[question.id];
//         if (answerForQuestion === undefined) return;

//         const normalized = ResponseNormalizer.normalize(question, { [question.id]: answerForQuestion }, optionIndex);
//         const qId = Object.keys(normalized)[0];
//         let val = normalized[qId];

//         // extraire si objet à une seule clé
//         if (typeof val === 'object' && val !== null && Object.keys(val).length === 1) {
//           val = Object.values(val)[0];
//         }

//         value[`${sectionId}:${qId}`] = val;
//       });
//     });

//     return value;
//   }

//   static normalizeGrid(step, rawValue) {
//     if (!rawValue || typeof rawValue !== 'object') return {};

//     const value = {};
//     const data = rawValue.value || rawValue;

//     const responsesById = Object.fromEntries((step.reponses || []).map(r => [r.id, r]));
//     const questionsById = Object.fromEntries((step.questions || []).map(q => [q.id, q]));

//     // --- Lignes / Colonnes ---
//     (step.questions || []).forEach(question => {
//       const rawAnswer = data[question.id];
//       if (!rawAnswer) return;

//       // RADIO / AXE ROW
//       if (typeof rawAnswer === 'string') {
//         const response = responsesById[rawAnswer];
//         if (response?.input.axis === 'row' && response.input.type === 'radio' && ResponseNormalizer.isCellEnabled(question, rawAnswer)) {
//           value[question.id] = rawAnswer;
//         }
//         return;
//       }

//       // CHECKBOX (row/column)
//       if (Array.isArray(rawAnswer)) {
//         rawAnswer.forEach(responseId => {
//           const response = responsesById[responseId];
//           if (!response || !ResponseNormalizer.isCellEnabled(question, responseId)) return;

//           const axis = response.input.axis;
//           if (axis === 'row') value[question.id] = value[question.id] ? `${value[question.id]}/${responseId}` : responseId;
//           if (axis === 'column') value[responseId] = value[responseId] ? `${value[responseId]}/${question.id}` : question.id;
//         });
//       }
//     });

//     // RADIO + AXE COLUMN à la racine
//     Object.keys(data).forEach(responseId => {
//       const response = responsesById[responseId];
//       if (response?.input.axis === 'column' && response.input.type === 'radio') {
//         const questionId = data[responseId];
//         const question = questionsById[questionId];
//         if (!question || !ResponseNormalizer.isCellEnabled(question, responseId)) return;
//         value[responseId] = questionId;
//       }
//     });

//     return value;
//   }

//   // ---------------- Normalize ----------------
//   static normalize(step, rawValue, optionIndex = null) {
//     const idDB = optionIndex ? `${step.id_db}_${optionIndex}` : step.id_db;

//     let value;
//     switch(step.type) {
//       case 'text': value = ResponseNormalizer.normalizeText(step, rawValue); break;
//       case 'spinner': value = ResponseNormalizer.normalizeSpinner(step, rawValue); break;
//       case 'autocomplete': value = ResponseNormalizer.normalizeAutocomplete(step, rawValue); break;
//       case 'single_choice': return ResponseNormalizer.normalizeSingleChoice(step, rawValue);
//       case 'multiple_choice': return ResponseNormalizer.normalizeMultipleChoice(step, rawValue);
//       case 'accordion': value = ResponseNormalizer.normalizeAccordion(step, rawValue, optionIndex); break;
//       case 'grid': value = ResponseNormalizer.normalizeGrid(step, rawValue); break;
//       default: value = rawValue; break;
//     }

//     return { [idDB]: value };
//   }
// }



//************************************************************* */

//-------------------------------------------- hada yemchi mais fih les commentair bzf di ndir wahed na9ih bech nakhdem rotation bien 

// export default class ResponseNormalizer {
//   static normalize(step, rawValue, optionIndex=null) {
//     const idDB = optionIndex ? `${step.id_db}_${optionIndex}` : step.id_db;
//     let value;
//     console.log('rawvaluegrid',rawValue)

//     switch(step.type) {
     
//       case 'accordion': {
//         value = {};
      
//         if (!rawValue || typeof rawValue !== 'object') break;
      
//         step.sections.forEach(section => {
//           const sectionId = optionIndex ? `${section.id_sect}_${optionIndex}` : section.id_sect;
      
//           section.questions.forEach(question => {
//             const answerForQuestion = rawValue[question.id];
//             if (answerForQuestion === undefined) return;
      
//             // Normaliser la question individuellement
//             const normalized = ResponseNormalizer.normalize(question, { [question.id]: answerForQuestion }, optionIndex);
      
//             // Récupérer la clé (idDB) et la valeur
//             const qId = Object.keys(normalized)[0];
//             let val = normalized[qId];
      
//             // Si val est un objet avec une seule clé (comme { q10_2: 'b12' }), extraire directement la valeur
//             if (typeof val === 'object' && val !== null && Object.keys(val).length === 1) {
//               val = Object.values(val)[0];
//             }
      
//             value[`${sectionId}:${qId}`] = val;
//           });
//         });
      
//         break;
//       }
      
//       case 'text':
//       case 'spinner':
//         value = rawValue;
        
//         break;

//       case 'autocomplete':
//         // rawValue est envoyé depuis le front sous forme d'objet JSON { commune, cp, _id, ... }
//         try {
//           const obj = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
//           value = obj._id; // on ne garde que _id
//         } catch (e) {
//           value = null;
//         }
//         break;

//         case 'single_choice': {
         
//           const selectedValue = rawValue[step.id];
//          console.log("selected value single",selectedValue)
//           value = selectedValue;
        
//           const result = {
//             [idDB]: value
//           };
        
//           // récupérer l'option sélectionnée
//           const selectedOption = step.options?.find(
//             opt => opt.codeItem?.toString() === selectedValue?.toString()
//           );
        
//           // gérer la précision si requise
//           if (selectedOption?.requiresPrecision) {
//             const precisionValue = rawValue[`precision_${selectedValue}`];
        
//             if (precisionValue && precisionValue.trim() !== '') {
//               result[`${step.id_db}_pr_${selectedValue}`] = precisionValue.trim();
//             }
//           }
        
//    // --- Sous-questions récursives ---
//   if (selectedOption?.subQuestions) {
//     selectedOption.subQuestions.forEach(subQ => {
//       // normalisation récursive
//       const normalizedSubQ = ResponseNormalizer.normalize(subQ, rawValue);
//      // fusionner dans le résultat avec clé uniforme
//       Object.keys(normalizedSubQ).forEach(subKey => {
//         // <id_db_question_principale>_<codeItem_option>_<id_db_sous_question>
//         const subQIdDB = `${step.id_db}_${selectedValue}_${subQ.id_db}`;
//         result[subQIdDB] = normalizedSubQ[subKey];
//       });
      
//     });
//   }
//           return result;
//         }
        
       

//         case 'multiple_choice': {
//           // console.log('🔍 Normalizing multiple_choice:', {
//           //   stepId: step.id,
//           //   stepId_db: step.id_db,
//           //   rawValue: rawValue,
//           //   rawValue_stepId: rawValue[step.id]
//           // });

//           if (!rawValue) {
//             return { [step.id_db]: null };
//           }
        
//           // selectedArray contient les codes sélectionnés
//           const selectedArray = Array.isArray(rawValue[step.id]) ? rawValue[step.id] : [rawValue[step.id]];
//           const mainValue = selectedArray.join('/');
        
//           // Objet final à retourner
//           const result = { [step.id_db]: mainValue };
        
//           // Ajouter les champs de précision pour chaque code sélectionné
//           selectedArray.forEach(codeItem => {
//             const precisionKey = `precision_${step.id}_${codeItem}`;
//             const precisionValue = rawValue[precisionKey];
//             if (precisionValue && precisionValue.trim() !== '') {
//               result[`${step.id_db}_pr_${codeItem}`] = precisionValue;
//             }
//           });
        
//           return result;
        
//           break;
//         }
        
        
//         case 'grid': {
//           const isCellEnabled = (question, responseId) => {
//             return question.cells?.[responseId]?.enabled !== false;
//           };
          
//           value = {};
//           if (!rawValue || typeof rawValue !== 'object') break;
          
//           const data = rawValue.value || rawValue; // <-- prendre la vraie valeur

//           const responsesById = {};
//           step.reponses.forEach(r => (responsesById[r.id] = r));

//          const questionsById = {};
//          step.questions.forEach(q => (questionsById[q.id] = q));

// /* ***************************par ligne ***********************/
//           step.questions.forEach(question => {
//             const rawAnswer = data[question.id];
//             if (rawAnswer === undefined) return;
        
//          /* ---------- RADIO / AXE ROW ---------- */
//             if (typeof rawAnswer === 'string') {
//               const response = responsesById[rawAnswer];
//               if (
//                 response &&
//                 response.input.axis === 'row' &&
//                 response.input.type === 'radio' &&
//                 isCellEnabled(question, rawAnswer)
//               ) {
//                 value[question.id] = rawAnswer;
//               }
//               return;
//             }
        
//             /* ===========================
//                CHECKBOX (row / column)
//                =========================== */
//                // ===========================
// // CHECKBOX GRID (array)
// // ===========================
// if (Array.isArray(rawAnswer)) {
//   rawAnswer.forEach(responseId => {
//     const response = responsesById[responseId];
//     if (!response) return;

//     if (!isCellEnabled(question, responseId)) return;

//     const axis = response.input.axis;

//     // ----- AXE ROW -----
//     if (axis === 'row') {
//       value[question.id] = value[question.id]
//         ? `${value[question.id]}/${responseId}`
//         : responseId;
//     }

//     // ----- AXE COLUMN -----
//     if (axis === 'column') {
//       value[responseId] = value[responseId]
//         ? `${value[responseId]}/${question.id}`
//         : question.id;
//     }
//   });
// }

//         //     if (typeof rawAnswer === 'object') {
//         //       Object.keys(rawAnswer).forEach(responseId => {
//         //         const response = responsesById[responseId];
//         //         if (!response) return;

//         //  if (!isCellEnabled(question, responseId)) return;

//         //         const axis = response.input.axis;
        
//         //         // ----- AXE ROW -----
//         //         if (axis === 'row') {
//         //           value[question.id] = value[question.id]
//         //             ? `${value[question.id]}/${responseId}`
//         //             : responseId;
//         //         }
        
//         //         // ----- AXE COLUMN -----
//         //         if (axis === 'column') {
//         //           value[responseId] = value[responseId]
//         //             ? `${value[responseId]}/${question.id}`
//         //             : question.id;
//         //         }
//         //       });
//         //     }
//           });
        
          
//         /* ===========================
//      RADIO + AXE COLUMN (racine)
//      =========================== */
//   Object.keys(data).forEach(responseId => {
//     const response = responsesById[responseId];
//     if (
//       response &&
//       response.input.axis === 'column' &&
//       response.input.type === 'radio'
//     ) {
//       const questionId = data[responseId];
//       const question = questionsById[questionId];

//       //  cellule désactivée
//       if (!question || !isCellEnabled(question, responseId)) return;

//       value[responseId] = questionId;
//     }
//           });
        
//           break;
//         }
        
        
// console.log("value normlize",value)
//       default:
//         value = rawValue;
//         break;
//     }

//     return { [idDB]: value };
//   }
// }
