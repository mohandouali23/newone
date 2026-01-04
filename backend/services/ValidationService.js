// import ToastService from './ToastService.js';

// export default class ValidationService {
//   static validateStep(step, answers, wrapper = null) {
//     let isValid = true;
//     const missingFields = [];

//     //  Si c'est une step contenant plusieurs questions
//     const questionList = step.questions || [step]; // si undefined, step est une seule question

//     questionList.forEach(question => {
//       const answerKey = wrapper?.optionIndex !== undefined
//         ? `${question.id}_${wrapper.optionIndex}`
//         : question.id;
// console.log("answerkey",answerKey)
// console.log("answers",answers)
//       const answer = answers[answerKey];
// console.log('answer',answer)
//       if (!question.required) return;

//       // Validation selon type
//       switch (question.type) {
//         case 'text':
//         case 'spinner':
//         case 'autocomplete':
//         case 'single_choice':
//           if (!answer || answer.trim?.() === '') missingFields.push(question.label || question.id);
//           break;

//         case 'multiple_choice':
//           if (!answer || answer.length === 0 || answer === '') missingFields.push(question.label || question.id);
//           break;
//        case 'accordion': {
//   const realValue = answer;
//   console.log('realValue', realValue);

//   if (!realValue) {
//     missingFields.push(question.label || question.id);
//     break;
//   }

//   const hasAnswer = Object.entries(realValue)
//     .filter(([key]) => key !== 'action') // 🔥 on ignore action
//     .some(([_, v]) =>
//       Array.isArray(v)
//         ? v.length > 0
//         : v !== null && v !== '' && v !== undefined
//     );

//   if (!hasAnswer) {
//     missingFields.push(question.label || question.id);
//   }
//   break;
// }

          
//            case 'grid': {
//   const realValue = answer?.value;
//   console.log('grid realValue', realValue);

//   if (!realValue) {
//     missingFields.push(question.label || question.id);
//     break;
//   }

//   const hasAnswer = Object.values(realValue).some(row => {
//     if (!row || typeof row !== 'object') return false;

//     return Object.values(row).some(cell =>
//       Array.isArray(cell)
//         ? cell.length > 0
//         : cell !== null && cell !== '' && cell !== undefined
//     );
//   });

//   if (!hasAnswer) {
//     missingFields.push(question.label || question.id);
//   }
//   break;
// }

            
//         default:
//           if (!answer) missingFields.push(question.label || question.id);
//       }
//     });

//     if (missingFields.length > 0) {
//       isValid = false;
//       const message = `Veuillez répondre aux questions obligatoires : ${missingFields.join(', ')}`;
//       ToastService.show(message, { type: 'error' });
//     }

//     return isValid;
//   }
// }

//-------------------------------------

// 
// import ToastService from './ToastService.js';

// export default class ValidationService {

//   static hasRealAnswer(obj) {
//     if (!obj || typeof obj !== 'object') return false;

//     return Object.entries(obj)
//       .filter(([key]) => key !== 'action')
//       .some(([_, v]) => {
//         if (v === null || v === undefined) return false;
//         if (typeof v === 'string') return v.trim() !== '';
//         if (Array.isArray(v)) return v.length > 0;
//         if (typeof v === 'object') return ValidationService.hasRealAnswer(v);
//         return true;
//       });
//   }

//   static validateStep(step, answers, wrapper = null) {
//     // 🔥 validation spéciale pour grid au niveau step
//     if (step.type === 'grid') {
//       const answer = answers[step.id];
//       const realValue = answer?.value;

//       console.log('GRID realValue', realValue);

//       if (!ValidationService.hasRealAnswer(realValue)) {
//         const message = `Veuillez répondre à la question obligatoire : ${step.label || step.id}`;
//         ToastService.show(message, { type: 'error' });
//         return false;
//       }

//       return true; // grid validée
//     }

//     let isValid = true;
//     const missingFields = [];
//     const questionList = step.questions || [step];

//     questionList.forEach(question => {
//       const answerKey = wrapper?.optionIndex !== undefined
//         ? `${question.id}_${wrapper.optionIndex}`
//         : question.id;

//       const answer = answers[answerKey];

//       if (!question.required) return;

//       switch (question.type) {
//         case 'text':
//         case 'spinner':
//         case 'autocomplete':
//         case 'single_choice':
//           if (!answer || answer.trim?.() === '') missingFields.push(question.label || question.id);
//           break;

//         case 'multiple_choice':
//           if (!answer || answer.length === 0 || answer === '') missingFields.push(question.label || question.id);
//           break;

//         case 'accordion':
//           if (!ValidationService.hasRealAnswer(answer)) missingFields.push(question.label || question.id);
//           break;

//         default:
//           if (!answer) missingFields.push(question.label || question.id);
//       }
//     });

//     if (missingFields.length > 0) {
//       isValid = false;
//       const message = `Veuillez répondre aux questions obligatoires : ${missingFields.join(', ')}`;
//       ToastService.show(message, { type: 'error' });
//     }

//     return isValid;
//   }
// }
//--------------------------------
import ToastService from './ToastService.js';

export default class ValidationService {

  static hasRealAnswer(obj) {
    if (!obj || typeof obj !== 'object') return false;

    return Object.entries(obj)
      .filter(([key]) => key !== 'action')
      .some(([_, v]) => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim() !== '';
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return ValidationService.hasRealAnswer(v);
        return true;
      });
  }

  static validateStep(step, answers, wrapper = null) {
    // 🔥 validation spéciale pour grid au niveau step
    if (step.type === 'grid') {
      const answer = answers[step.id];
      const realValue = answer?.value;

      console.log('GRID realValue', realValue);

      if (!ValidationService.hasRealAnswer(realValue)) {
        const message = `Veuillez répondre à la question obligatoire : ${step.label || step.id}`;
        ToastService.show(message, { type: 'error' });
        return false;
      }

      return true; // grid validée
    }

    let isValid = true;
    const missingFields = [];
    const questionList = step.questions || [step];

    questionList.forEach(question => {
      const answerKey = wrapper?.optionIndex !== undefined
        ? `${question.id}_${wrapper.optionIndex}`
        : question.id;

      const answer = answers[answerKey];

      if (!question.required) return;

      switch (question.type) {
        case 'text':
        case 'spinner':
        case 'autocomplete':
          if (!answer || answer.trim?.() === '') missingFields.push(question.label || question.id);
          break;
case 'single_choice':
  console.log('answer for single_choice:', answers);


          if (!answer || answer.trim?.() === '') {
            missingFields.push(question.label || question.id);
          } else {
            // Vérifier si l'option sélectionnée a un champ de précision requis
            const selectedOption = question.options?.find(
              opt => opt.codeItem?.toString() === answer?.toString()
            );
            if (selectedOption?.requiresPrecision) {
              console.log('precision key:', `precision_${answer}`);

              const precisionValue = answers[`${question.id}_pr_${answer}`] || answers[`precision_${answer}`];
              console.log('precision value:', precisionValue);
              if (!precisionValue || precisionValue.trim() === '') {
                missingFields.push(`Précision pour "${selectedOption.label}"`);
              }
            }
          }
          break;
       case 'multiple_choice': {
  const selectedArray = Array.isArray(answer) ? answer.filter(v => v && v.trim() !== '') : [];
  
  if (selectedArray.length === 0) {
    missingFields.push(question.label || question.id);
  } else {
    selectedArray.forEach(codeItem => {
      const precisionKey = `${question.id}_pr_${codeItem}`;
      const precisionValue = answers[precisionKey];

      const selectedOption = question.options?.find(
        opt => opt.codeItem?.toString() === codeItem?.toString()
      );
      if (selectedOption?.requiresPrecision && (!precisionValue || precisionValue.trim() === '')) {
        missingFields.push(`Précision pour "${selectedOption.label}"`);
      }
    });
  }
  break;
}
        case 'accordion':
          if (!ValidationService.hasRealAnswer(answer)) missingFields.push(question.label || question.id);
          break;

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
