import SurveyService from './SurveyService.js';
import ResponseService from './ResponseService.js';
import ResponseNormalizer from './ResponseNormalizer.js';
import RotationService from './RotationService.js';
import RotationQueueUtils from './RotationQueueUtils.js';
import NavigationRuleService from './NavigationRuleService.js';
import ValidationService from './ValidationService.js';

export default class SurveyRunService {

  // -------------------- RUN --------------------
  static async run({ surveyId, action, body, session }) {
    const userId = 'anonymous';
    const survey = SurveyService.loadSurvey(surveyId);

    this.initSession(session);

    const responseId = await this.ensureResponse(surveyId, session, userId);

    const { step: currentStep, wrapper: currentStepWrapper, isInRotation } =
      RotationService.getCurrentStep(session, survey);

    if (action === 'next') {
      this.savePageAnswers({ steps: this.getStepsForCurrentPage(survey, currentStep, isInRotation), 
                             wrappers: isInRotation ? [currentStepWrapper] : undefined, 
                             body, 
                             responseId, 
                             session, 
                             isInRotation });

      const isStepValid = ValidationService.validateStep(currentStep, session.answers, currentStepWrapper);
      if (!isStepValid) return { nextStep: { id: currentStep.id }, validationError: true };

      this.pushCurrentStepToHistory(session, currentStep, isInRotation,currentStepWrapper);
    }
    console.log("history",
      session.history.map(h => h.id)
    );
    if (action === 'prev') {
      const prevStepId = this.handlePrevious(session);
      if (prevStepId) return { nextStep: { id: prevStepId } };
    }

    const nextStepId = this.resolveNextStep(session, survey, currentStep, isInRotation);
    if (!nextStepId || nextStepId === 'FIN') return { finished: true };

    session.currentStepId = nextStepId;
    return { nextStep: { id: nextStepId } };
  }

  // -------------------- Helpers --------------------
  static initSession(session) {
    session.answers ??= {};
    session.rotationQueueDone ??= {};
    session.history ??= [];
  }

  static async ensureResponse(surveyId, session, userId) {
    if (session.responseId) return session.responseId;
    const response = await ResponseService.createSurveyDocument(surveyId, userId, {});
    session.responseId = response._id;
    return session.responseId;
  }

  // static getStepsForCurrentPage(survey, currentStep, isInRotation) {
  //   return isInRotation ? [currentStep] : survey.steps.filter(s => s.page === currentStep.page);
  // }
  static getStepsForCurrentPage(survey, currentStep, isInRotation) {
    if (!currentStep) return []; // éviter TypeError
    return isInRotation
        ? [currentStep]
        : survey.steps.filter(s => s.page === currentStep.page);
}

  // -------------------- SAVE PAGE ANSWERS --------------------
  static savePageAnswers({ steps, wrappers, body, responseId, session, isInRotation }) {
    steps.forEach((step, i) => {
      const wrapper = wrappers?.[i];
      const rawValue = this.getRawValueForStep(step, body);

      if (rawValue === undefined) return;

      const normalized = ResponseNormalizer.normalize(step, rawValue, wrapper?.optionIndex);
      const mainValue = this.getMainValue(step, body, rawValue);

      // this.cleanupSession(step, session.answers, mainValue, body);
      this.cleanupSession(step, session, mainValue, body);

      ResponseService.addAnswer(responseId, normalized, this.computeKeysToDelete(step, session.answers, body));
      this.saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation });
      this.saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers: session.answers });
      console.log("session answer",session.answers)
    });
  }

  static getRawValueForStep(step, body) {
    if (['grid', 'accordion', 'single_choice', 'multiple_choice'].includes(step.type)) return body;
    return body[step.id];
  }

  static getMainValue(step, body, rawValue) {
    switch(step.type) {
      case 'multiple_choice':
        return Array.isArray(body[step.id]) ? body[step.id].filter(v => v && v.trim() !== '') : [];
      case 'single_choice': return body[step.id] || '';
      case 'accordion':
      case 'grid': return rawValue;
      default: return rawValue;
    }
  }

  // -------------------- CLEANUP SESSION --------------------
  static cleanupSession(step, session, mainValue, body) {
    const sessionAnswers = session.answers;
    if (step.type === 'single_choice') {
      const { sessionKeysToDelete } = this.computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue: mainValue });
      sessionKeysToDelete.forEach(k => delete sessionAnswers[k]);
    }
     // ---- Nouvelle partie ----
     if (step.repeatFor === undefined && step.id in session.rotationQueueDone) {
      // reset rotation si question principale modifiée
      delete session.rotationQueueDone[step.id];
      delete session.rotationQueue;
  }
  // -------------------------
    this.cleanupSessionPrecisions(step, sessionAnswers, Array.isArray(mainValue) ? mainValue : [mainValue]);
  }

  // -------------------- SESSION & DB --------------------
  static saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation }) {
    const answerKey = isInRotation && wrapper?.optionIndex !== undefined ? `${step.id}_${wrapper.optionIndex}` : step.id;
    session.answers[answerKey] = mainValue;

    Object.keys(normalized).forEach(dbKey => {
      if (dbKey === step.id_db) return;

      const [ , codeItem, ...subParts] = dbKey.split('_');
      const subIdDb = subParts.join('_');
      const subQ = step.options?.flatMap(o => o.subQuestions || [])?.find(sq => sq.id_db === subIdDb);
      if (!subQ) return;

      const sessionKey = `${step.id}_${codeItem}_${subQ.id}`;
      session.answers[sessionKey] = normalized[dbKey];
    });
  }

  static saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers }) {
    if (!step || !rawValue || !sessionAnswers) return;

    if (step.type === 'single_choice') {
      const selectedOption = step.options?.find(opt => opt.codeItem?.toString() === mainValue?.toString());
      if (selectedOption?.requiresPrecision) {
        const val = rawValue[`precision_${mainValue}`];
        if (val?.trim()) sessionAnswers[`${step.id}_pr_${mainValue}`] = val.trim();
      }
    }

    if (step.type === 'multiple_choice' && Array.isArray(mainValue)) {
      mainValue.forEach(codeItem => {
        const val = rawValue[`precision_${step.id}_${codeItem}`];
        if (val?.trim()) sessionAnswers[`${step.id}_pr_${codeItem}`] = val.trim();
      });
    }
  }

  static computeKeysToDelete(step, sessionAnswers, body) {
    const selectedOptions = step.type === 'multiple_choice' && Array.isArray(body[step.id]) ? body[step.id] : [];
    return [
      ...this.computePrecisionKeysToDelete(step, sessionAnswers, selectedOptions),
      ...(step.type === 'single_choice' ? this.computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue: body[step.id] }).dbKeysToDelete : [])
    ];
  }

  static computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue }) {
    const dbKeysToDelete = [], sessionKeysToDelete = [];
    const oldValue = sessionAnswers[step.id];
    if (!oldValue || oldValue === newValue) return { dbKeysToDelete, sessionKeysToDelete };

    const oldOption = step.options?.find(opt => opt.codeItem?.toString() === oldValue?.toString());
    if (!oldOption?.subQuestions) return { dbKeysToDelete, sessionKeysToDelete };

    oldOption.subQuestions.forEach(subQ => {
      dbKeysToDelete.push(`${step.id_db}_${oldValue}_${subQ.id_db}`);
      sessionKeysToDelete.push(`${step.id}_${oldValue}_${subQ.id}`);
    });

    return { dbKeysToDelete, sessionKeysToDelete };
  }

  static computePrecisionKeysToDelete(step, sessionAnswers, selectedOptions = []) {
    const keysToDelete = [];
    Object.keys(sessionAnswers).forEach(key => {
      if ((step.type === 'single_choice' || step.type === 'multiple_choice') && key.startsWith(`${step.id}_pr_`)) {
        const optionCode = key.replace(`${step.id}_pr_`, '');
        if (step.type === 'single_choice' || (step.type === 'multiple_choice' && !selectedOptions.includes(optionCode))) {
          keysToDelete.push(key.replace(`${step.id}_pr_`, `${step.id_db}_pr_`));
        }
      }
    });
    return keysToDelete;
  }

  static cleanupSessionPrecisions(step, sessionAnswers, selectedOptions = []) {
    Object.keys(sessionAnswers).forEach(key => {
      if (step.type === 'single_choice' && key.startsWith(`${step.id}_pr_`)) delete sessionAnswers[key];
      if (step.type === 'multiple_choice' && key.startsWith(`${step.id}_pr_`)) {
        const code = key.replace(`${step.id}_pr_`, '');
        if (!selectedOptions.includes(code)) delete sessionAnswers[key];
      }
    });
  }

  // -------------------- HISTORIQUE --------------------
  static pushCurrentStepToHistory(session, step, isRotation,wrapper=null) {
    if (!step) return;
    session.history ??= [];
    
    const last = session.history[session.history.length - 1];
    if (last?.id === step.id) return; // 🛑 empêche doublon

    session.history.push({ 
      id: step.id, 
      isRotation: !!isRotation,
      wrapper: isRotation ? wrapper : null });
  }

  static handlePrevious(session) {
    if (!session.history?.length) return null;
    const lastStep = session.history.pop();
    if (!lastStep) return null;

    // if (lastStep.isRotation) {
    //   const stepWrapper = RotationQueueUtils.getStepWrapperById(session, lastStep.id);
    //   session.rotationQueue = [stepWrapper, ...(session.rotationQueue || [])];
    // }
    console.log("lastStep ",lastStep )
    console.log("lastStep.wrapper",lastStep.wrapper)
    console.log("lastStep.isRotation ",lastStep.isRotation )
   // cas rotation
   if (lastStep.isRotation && lastStep.wrapper) {
    const parentId = lastStep.wrapper.parent;

    // remettre la wrapper complet dans rotationQueue
    session.rotationQueue = [lastStep.wrapper, ...(session.rotationQueue || [])];

    // si on revient à la question principale, on supprime la rotation
    if (session.answers[parentId] !== undefined) {
        delete session.rotationQueue;
    }

    session.currentStepId = parentId;
    return parentId;
}
    session.currentStepId = lastStep.id;
    return lastStep.id;
  }

  // -------------------- NAVIGATION --------------------
  static resolveNextStep(session, survey, currentStep, isInRotation) {
    
  
    const rotationInit = RotationService.initRotation({
      session,
      survey,
      answers: session.answers,
      action: 'next',
      generateQueue: RotationQueueUtils.generateRotationQueue
    });
    if (rotationInit) return rotationInit.nextStepId;

    const rotationAdvance = RotationService.advanceRotation({ session, survey, currentStep, action: 'next' });
    if (rotationAdvance?.nextStepId) return rotationAdvance.nextStepId;

    if (rotationAdvance?.fallbackFrom) {
      return NavigationRuleService.resolve(rotationAdvance.fallbackFrom, session.answers[rotationAdvance.fallbackFrom.id], survey.steps);
    }

    return NavigationRuleService.resolve(currentStep, session.answers[currentStep.id], survey.steps);
  }
}












// import SurveyService from './SurveyService.js';
// import ResponseService from './ResponseService.js';
// import ResponseNormalizer from './ResponseNormalizer.js';
// import RotationService from './RotationService.js';
// import RotationQueueUtils from './RotationQueueUtils.js';
// import NavigationRuleService from './NavigationRuleService.js';
// import ValidationService from './ValidationService.js';

// export default class SurveyRunService {

//   static async run({ surveyId, action, body, session }) {
//     const userId = 'anonymous';
//     const survey = SurveyService.loadSurvey(surveyId);

//     // 1️⃣ Init session et historique
//     this.initSession(session);

//     // 2️⃣ Créer document réponse si nécessaire
//     const responseId = await this.ensureResponse(surveyId, session, userId);

//     // 3️⃣ Step courant
//     const { step: currentStep, wrapper: currentStepWrapper, isInRotation } =
//       RotationService.getCurrentStep(session, survey);

//     // 4️⃣ Sauvegarder réponses si “next”
//     if (action === 'next') {
//   //  Sauvegarder les réponses
//       this.savePageAnswers({
//         steps: isInRotation ? [currentStep] : survey.steps.filter(s => s.page === currentStep.page),
//         wrappers: isInRotation ? [currentStepWrapper] : undefined,
//         body,
//         responseId,
//         session,
//         isInRotation
//       });
//   //  Vérifier la step avant navigation
//   console.log(" session.answers", session.answers)
//   const isStepValid = ValidationService.validateStep(currentStep, session.answers, currentStepWrapper);
//   if (!isStepValid) {
//     // Stop navigation si invalid
//     return { nextStep: { id: currentStep.id }, validationError: true };
//   }
//       // 🔹 Mettre la step courante dans l’historique
//      // session.history.push(currentStep.id);
    
//       this.pushCurrentStepToHistory(session, currentStep, isInRotation);
//     }

//     // 5️⃣ Navigation précédente
//     if (action === 'prev') {
//       const prevStepId = this.handlePrevious(session);
//       if (prevStepId) {
//        // session.currentStepId = prevStepId;
//         return { nextStep: { id: prevStepId } };
//       }
//     }

//     // 6️⃣ Init rotation
//     const rotationInit = RotationService.initRotation({
//       session,
//       survey,
//       answers: session.answers,
//       action,
//       generateQueue: RotationQueueUtils.generateRotationQueue
//     });
//     if (rotationInit) return this.handleRotationInit(rotationInit);

//     // 7️⃣ Avancer rotation
//     const rotationAdvance = RotationService.advanceRotation({
//       session,
//       survey,
//       currentStep,
//       action
//     });
//     let nextStepId = rotationAdvance?.nextStepId;
//     if (!nextStepId && rotationAdvance?.fallbackFrom) {
//       nextStepId = NavigationRuleService.resolve(
//         rotationAdvance.fallbackFrom,
//         session.answers[rotationAdvance.fallbackFrom.id],
//         survey.steps
//       );
//     }

//     // 8️⃣ Navigation normale
//     if (!nextStepId) {
//       nextStepId = NavigationRuleService.resolve(
//         currentStep,
//         session.answers[currentStep.id],
//         survey.steps
//       );
//     }

//     // 9️⃣ Fin questionnaire
//     if (!nextStepId || nextStepId === 'FIN') return { finished: true };

//     // 🔹 Retour step suivant
//     session.currentStepId = nextStepId;
//     return { nextStep: { id: nextStepId } };
//   }











  
//   /* ---------------- helpers ---------------- */

//   static initSession(session) {
//     session.answers ??= {};
//     session.rotationQueueDone ??= {};
//     session.history ??= []; // 🔹 Historique pour previous
//   }

//   static async ensureResponse(surveyId, session, userId) {
//     if (session.responseId) return session.responseId;
//     const response = await ResponseService.createSurveyDocument(surveyId, userId, {});
//     session.responseId = response._id;
//     return session.responseId;
//   }

//  static savePageAnswers({ steps, wrappers, body, responseId, session, isInRotation }) {
//   steps.forEach((step, i) => {
//     const wrapper = wrappers?.[i];
//     let rawValue;

//     // Déterminer rawValue selon le type
//     if (['grid', 'accordion', 'single_choice', 'multiple_choice'].includes(step.type)) {
//       rawValue = body;
//     } else {
//       rawValue = body[step.id];
//     }

//     if (rawValue === undefined) return;

//     // Normaliser et sauvegarder dans la base
//     const normalized = ResponseNormalizer.normalize(step, rawValue, wrapper?.optionIndex);
//     console.log('normlized',normalized)
 
//    //  Calcul des clés à supprimer
// let selectedOptions = [];
// if (step.type === 'multiple_choice') {
//   selectedOptions = Array.isArray(body[step.id]) ? body[step.id] : [];
// }
//       let mainValue;
//       switch(step.type) {
//         case 'multiple_choice':
//   // Si body[step.id] est undefined → tableau vide
//   mainValue = Array.isArray(body[step.id]) ? body[step.id].filter(v => v && v.trim() !== '') : [];
//   break;

//         case 'single_choice':
//           mainValue = body[step.id] || '';
//           break;
//         case 'accordion':
//         case 'grid':
//           mainValue = rawValue;
//           break;
//         default:
//           mainValue = rawValue;
//       }
     
// //  Nettoyage des sous-questions si changement d’option
// let subQuestionDbKeysToDelete = [];
// let subQuestionSessionKeysToDelete = [];

// if (step.type === 'single_choice') {
//   const cleanup = this.computeSubQuestionKeysToDelete({
//     step,
//     sessionAnswers: session.answers,
//     newValue: mainValue
//   });

//   subQuestionDbKeysToDelete = cleanup.dbKeysToDelete;
//   subQuestionSessionKeysToDelete = cleanup.sessionKeysToDelete;

//   //  Nettoyage session
//   subQuestionSessionKeysToDelete.forEach(k => {
//     delete session.answers[k];
//   });
// }
// const keysToDelete = this.computePrecisionKeysToDelete(step, session.answers, selectedOptions);
// this.cleanupSessionPrecisions(step, session.answers, selectedOptions);
// const allKeysToDelete = [
//   ...keysToDelete,
//   ...subQuestionDbKeysToDelete
// ];

// // Sauvegarde DB
// ResponseService.addAnswer(responseId, normalized, allKeysToDelete);
// this.saveSessionAnswers({
//   step,
//   normalized,
//   mainValue,
//   session,
//   wrapper,
//   isInRotation
// });
// //  Sauvegarde des précisions
// this.saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers: session.answers });


//   });
// }




// static saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation }) {
//   // 🔹 clé principale
//   const answerKey =
//     isInRotation && wrapper?.optionIndex !== undefined
//       ? `${step.id}_${wrapper.optionIndex}`
//       : step.id;

//   // valeur principale
//   session.answers[answerKey] = mainValue;

//   // 🔹 sous-questions
//   Object.keys(normalized).forEach(dbKey => {
//     if (dbKey === step.id_db) return;

//     // format DB : id_db_parent_codeItem_id_db_sub
//     const parts = dbKey.split('_');
//     const codeItem = parts[1];
//     const subIdDb = parts.slice(2).join('_');

//     const subQ = step.options
//       ?.flatMap(o => o.subQuestions || [])
//       ?.find(sq => sq.id_db === subIdDb);

//     if (!subQ) return;

//     // 🔹 format SESSION (sans point)
//     const sessionKey = `${step.id}_${codeItem}_${subQ.id}`;

//     session.answers[sessionKey] = normalized[dbKey];
//   });
// }


// static saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers }) {
//   if (!step || !rawValue || !sessionAnswers) return;

//   // 🔹 Single Choice
//   if (step.type === 'single_choice') {
//     const selectedOption = step.options?.find(opt => opt.codeItem?.toString() === mainValue?.toString());
//     if (selectedOption?.requiresPrecision) {
//       const precisionValue = rawValue[`precision_${mainValue}`];
//       if (precisionValue && precisionValue.trim() !== '') {
//         sessionAnswers[`${step.id}_pr_${mainValue}`] = precisionValue.trim();
//       }
//     }
//   }

//   // 🔹 Multiple Choice
//   if (step.type === 'multiple_choice' && Array.isArray(mainValue)) {
//     mainValue.forEach(codeItem => {
//       const precisionKey = `precision_${step.id}_${codeItem}`;
//       const precisionValue = rawValue[precisionKey];
//       if (precisionValue && precisionValue.trim() !== '') {
//         sessionAnswers[`${step.id}_pr_${codeItem}`] = precisionValue.trim();
//       }
//     });
//   }
// }

// static computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue }) {
//   const dbKeysToDelete = [];
//   const sessionKeysToDelete = [];

//   const oldValue = sessionAnswers[step.id];

//   // si pas de changement → rien à faire
//   if (!oldValue || oldValue === newValue) {
//     return { dbKeysToDelete, sessionKeysToDelete };
//   }

//   // retrouver l’ancienne option
//   const oldOption = step.options?.find(
//     opt => opt.codeItem?.toString() === oldValue?.toString()
//   );

//   if (!oldOption?.subQuestions) {
//     return { dbKeysToDelete, sessionKeysToDelete };
//   }

//   oldOption.subQuestions.forEach(subQ => {
//     // 🔹 DB
//     dbKeysToDelete.push(
//       `${step.id_db}_${oldValue}_${subQ.id_db}`
//     );

//     // 🔹 SESSION
//     sessionKeysToDelete.push(
//       `${step.id}_${oldValue}_${subQ.id}`
//     );
//   });

//   return { dbKeysToDelete, sessionKeysToDelete };
// }

// static computePrecisionKeysToDelete(step, sessionAnswers, selectedOptions = []) {
//   const keysToDelete = [];

//   Object.keys(sessionAnswers).forEach(key => {
//     // single_choice
//     if (step.type === 'single_choice' && key.startsWith(`${step.id}_pr_`)) {
//       keysToDelete.push(key.replace(`${step.id}_pr_`, `${step.id_db}_pr_`));
//     }

//     // multiple_choice
//     if (step.type === 'multiple_choice' && key.startsWith(`${step.id}_pr_`)) {
//       const optionCode = key.replace(`${step.id}_pr_`, '');
//       if (!selectedOptions.includes(optionCode)) {
//         keysToDelete.push(key.replace(`${step.id}_pr_`, `${step.id_db}_pr_`));
//       }
//     }
//   });

//   return keysToDelete;
// }


// static cleanupSessionPrecisions(step, sessionAnswers, selectedOptions = []) {
//   Object.keys(sessionAnswers).forEach(key => {
//     if (step.type === 'single_choice' && key.startsWith(`${step.id}_pr_`)) {
//       delete sessionAnswers[key];
//     }
//     if (step.type === 'multiple_choice' && key.startsWith(`${step.id}_pr_`)) {
//       const optionCode = key.replace(`${step.id}_pr_`, '');
//       if (!selectedOptions.includes(optionCode)) {
//         delete sessionAnswers[key];
//       }
//     }
//   });
// }


//    // 🔹 Historique
//    static pushCurrentStepToHistory(session, step, isRotation) {
//     if (!step) return;
//     session.history ??= [];
//     session.history.push({ id: step.id, isRotation: !!isRotation });
//   }

//   static handlePrevious(session) {
//     if (!session.history || session.history.length === 0) return null;

//     const lastStep = session.history.pop();
//     if (!lastStep) return null;

//     // Si c'était une step de rotation, on la remet au début de rotationQueue
//     if (lastStep.isRotation) {
//       const stepWrapper = RotationQueueUtils.getStepWrapperById(session, lastStep.id);
//       session.rotationQueue = [stepWrapper, ...(session.rotationQueue || [])];
//     }

//     session.currentStepId = lastStep.id;
//     return lastStep.id;
//   }


//   static handleRotationInit(rotationInit) {
//     if (!rotationInit.nextStepId || rotationInit.nextStepId === 'FIN') {
//       return { finished: true };
//     }
//     return { nextStep: { id: rotationInit.nextStepId } };
//   }
// }
