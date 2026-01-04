import ToastService from './ToastService.js';

export default class ValidationService {
  static validateStep(step, answers, wrapper = null) {
    let isValid = true;
    const missingFields = [];

    //  Si c'est une step contenant plusieurs questions
    const questionList = step.questions || [step]; // si undefined, step est une seule question

    questionList.forEach(question => {
      const answerKey = wrapper?.optionIndex !== undefined
        ? `${question.id}_${wrapper.optionIndex}`
        : question.id;
console.log("answerkey",answerKey)
console.log("answers",answers)
      const answer = answers[answerKey];
console.log('answer',answer)
      if (!question.required) return;

      // Validation selon type
      switch (question.type) {
        case 'text':
        case 'spinner':
        case 'autocomplete':
        case 'single_choice':
          if (!answer || answer.trim?.() === '') missingFields.push(question.label || question.id);
          break;

        case 'multiple_choice':
          if (!answer || answer.length === 0 || answer === '') missingFields.push(question.label || question.id);
          break;
          case 'accordion':
             {
              const realValue = answer; 
              if (!realValue || !Object.values(realValue).some(v => v !== null && v !== '' && v !== undefined)) {
                missingFields.push(question.label || question.id);
              }
              break;
            }
          
            case 'grid': {
              const realValue = answer?.value ; 
              if (!realValue || !Object.values(realValue).some(v => v !== null && v !== '' && v !== undefined)) {
                missingFields.push(question.label || question.id);
              }
              break;
            }
            
        default:
          if (!answer) missingFields.push(question.label || question.id);
      }
    });

    if (missingFields.length > 0) {
      isValid = false;
      const message = `Veuillez répondre aux questions obligatoires : ${missingFields.join(', ')}`;
      ToastService.show(message, { type: 'error' });
    }

    return isValid;
  }
}
