export default class ResponseNormalizer {
  static normalize(step, rawValue) {
    const idDB = step.id_db;
    let value;

    switch(step.type) {
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

      case 'multiple_choice':
        value = Array.isArray(rawValue) ? rawValue : [rawValue];
        break;

        
        case 'grid':
      
        // rawValue doit être de type { questionId: { responseId: [questionId,...] } } ou { questionId: responseId }
        value = {};
        if (rawValue && typeof rawValue === 'object') {
          step.questions.forEach(q => {
            const rawAnswer = rawValue[q.id];
            if (rawAnswer !== undefined) {
              if (typeof rawAnswer === 'object' && !Array.isArray(rawAnswer)) {
                // On prend juste la clé (responseId) pour radio ou checkbox
                const keys = Object.keys(rawAnswer);
                if (keys.length === 1) {
                  const key = keys[0];
                  // Si c'est un array, on garde array, sinon on prend juste la clé
                  value[q.id] = Array.isArray(rawAnswer[key]) ? [key] : key;
                } else {
                  // plusieurs réponses ? on prend toutes les clés
                  value[q.id] = keys;
                }
              } else {
                value[q.id] = rawAnswer;
              }
            }
          });
        }
        break;

      default:
        value = rawValue;
        break;
    }

    return { [idDB]: value };
  }
}
