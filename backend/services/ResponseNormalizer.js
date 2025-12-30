export default class ResponseNormalizer {
  static normalize(step, rawValue, optionIndex=null) {
    const idDB = optionIndex ? `${step.id_db}_${optionIndex}` : step.id_db;
    let value;

    switch(step.type) {
      case 'accordion': {
        value = {};
      
        if (!rawValue || typeof rawValue !== 'object') break;
      
        step.sections.forEach(section => {
          const sectionId = optionIndex ? `${section.id_sect}_${optionIndex}` : section.id_sect;
          value[sectionId] = {};
      
          section.questions.forEach(question => {
            const answer = rawValue[question.id];
            if (answer === undefined) return;
      
            // Appel récursif
            const normalized = ResponseNormalizer.normalize(question, answer, optionIndex);
      
            // Prendre la première valeur de l'objet retourné (il n'y a qu'une clé)
            const firstKey = Object.keys(normalized)[0];
            value[sectionId][question.id] = normalized[firstKey];
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

      case 'single_choice':
        value = rawValue;
        break;

        case 'multiple_choice': {
          if (!rawValue) {
            value = null;
            break;
          }
          // rawValue peut être un array ou une string
          if (Array.isArray(rawValue)) {
            value = rawValue.join('/'); // concatène les valeurs avec /
          } else {
            value = rawValue.toString();
          }
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
            if (typeof rawAnswer === 'object') {
              Object.keys(rawAnswer).forEach(responseId => {
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
            }
          });
        
          
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
        
        

      default:
        value = rawValue;
        break;
    }

    return { [idDB]: value };
  }
}
