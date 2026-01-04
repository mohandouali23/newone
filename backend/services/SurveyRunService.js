import SurveyService from './SurveyService.js';
import ResponseService from './ResponseService.js';
import ResponseNormalizer from './ResponseNormalizer.js';
import RotationService from './RotationService.js';
import RotationQueueUtils from './RotationQueueUtils.js';
import NavigationRuleService from './NavigationRuleService.js';
import ValidationService from './ValidationService.js';

export default class SurveyRunService {

  static async run({ surveyId, action, body, session }) {
    const userId = 'anonymous';
    const survey = SurveyService.loadSurvey(surveyId);

    // 1️⃣ Init session et historique
    this.initSession(session);

    // 2️⃣ Créer document réponse si nécessaire
    const responseId = await this.ensureResponse(surveyId, session, userId);

    // 3️⃣ Step courant
    const { step: currentStep, wrapper: currentStepWrapper, isInRotation } =
      RotationService.getCurrentStep(session, survey);

    // 4️⃣ Sauvegarder réponses si “next”
    if (action === 'next') {
  //  Sauvegarder les réponses
      this.savePageAnswers({
        steps: isInRotation ? [currentStep] : survey.steps.filter(s => s.page === currentStep.page),
        wrappers: isInRotation ? [currentStepWrapper] : undefined,
        body,
        responseId,
        session,
        isInRotation
      });
  //  Vérifier la step avant navigation
  console.log("isStepValid",currentStep," session.answers", session.answers,"currentStepWrapper",currentStepWrapper)
  const isStepValid = ValidationService.validateStep(currentStep, session.answers, currentStepWrapper);
  if (!isStepValid) {
    // Stop navigation si invalid
    return { nextStep: { id: currentStep.id }, validationError: true };
  }
      // 🔹 Mettre la step courante dans l’historique
     // session.history.push(currentStep.id);
    
      this.pushCurrentStepToHistory(session, currentStep, isInRotation);
    }

    // 5️⃣ Navigation précédente
    if (action === 'prev') {
      const prevStepId = this.handlePrevious(session);
      if (prevStepId) {
       // session.currentStepId = prevStepId;
        return { nextStep: { id: prevStepId } };
      }
    }

    // 6️⃣ Init rotation
    const rotationInit = RotationService.initRotation({
      session,
      survey,
      answers: session.answers,
      action,
      generateQueue: RotationQueueUtils.generateRotationQueue
    });
    if (rotationInit) return this.handleRotationInit(rotationInit);

    // 7️⃣ Avancer rotation
    const rotationAdvance = RotationService.advanceRotation({
      session,
      survey,
      currentStep,
      action
    });
    let nextStepId = rotationAdvance?.nextStepId;
    if (!nextStepId && rotationAdvance?.fallbackFrom) {
      nextStepId = NavigationRuleService.resolve(
        rotationAdvance.fallbackFrom,
        session.answers[rotationAdvance.fallbackFrom.id],
        survey.steps
      );
    }

    // 8️⃣ Navigation normale
    if (!nextStepId) {
      nextStepId = NavigationRuleService.resolve(
        currentStep,
        session.answers[currentStep.id],
        survey.steps
      );
    }

    // 9️⃣ Fin questionnaire
    if (!nextStepId || nextStepId === 'FIN') return { finished: true };

    // 🔹 Retour step suivant
    session.currentStepId = nextStepId;
    return { nextStep: { id: nextStepId } };
  }

  /* ---------------- helpers ---------------- */

  static initSession(session) {
    session.answers ??= {};
    session.rotationQueueDone ??= {};
    session.history ??= []; // 🔹 Historique pour previous
  }

  static async ensureResponse(surveyId, session, userId) {
    if (session.responseId) return session.responseId;
    const response = await ResponseService.createSurveyDocument(surveyId, userId, {});
    session.responseId = response._id;
    return session.responseId;
  }

 static savePageAnswers({ steps, wrappers, body, responseId, session, isInRotation }) {
  steps.forEach((step, i) => {
    const wrapper = wrappers?.[i];
    let rawValue;

    // Déterminer rawValue selon le type
    if (['grid', 'accordion', 'single_choice', 'multiple_choice'].includes(step.type)) {
      rawValue = body;
    } else {
      rawValue = body[step.id];
    }

    if (rawValue === undefined) return;

    // Normaliser et sauvegarder dans la base
    const normalized = ResponseNormalizer.normalize(step, rawValue, wrapper?.optionIndex);
    ResponseService.addAnswer(responseId, normalized);

    if (!step.isSubQuestion) {
      // Valeur principale
      let mainValue;
      switch(step.type) {
        case 'multiple_choice':
  // Si body[step.id] est undefined → tableau vide
  mainValue = Array.isArray(body[step.id]) ? body[step.id].filter(v => v && v.trim() !== '') : [];
  break;

        case 'single_choice':
          mainValue = body[step.id] || '';
          break;
        case 'accordion':
        case 'grid':
          mainValue = rawValue;
          break;
        default:
          mainValue = rawValue;
      }

      // Clé pour session.answers
      const answerKey = isInRotation && wrapper?.optionIndex !== undefined
        ? `${step.id}_${wrapper.optionIndex}`
        : step.id;

      // 🔹 Sauvegarder la valeur principale
      session.answers[answerKey] = mainValue;

      // 🔹 Gérer la précision pour single_choice
      if (step.type === 'single_choice') {
        const selectedOption = step.options?.find(opt => opt.codeItem?.toString() === mainValue?.toString());
        if (selectedOption?.requiresPrecision) {
          const precisionValue = rawValue[`precision_${mainValue}`];
          if (precisionValue && precisionValue.trim() !== '') {
            session.answers[`${step.id}_pr_${mainValue}`] = precisionValue.trim();
          }
        }
      }

      // 🔹 Gérer les précisions pour multiple_choice
      if (step.type === 'multiple_choice') {
        mainValue.forEach(codeItem => {
          const precisionKey = `precision_${step.id}_${codeItem}`;
          const precisionValue = rawValue[precisionKey];
          if (precisionValue && precisionValue.trim() !== '') {
            session.answers[`${step.id}_pr_${codeItem}`] = precisionValue.trim();
          }
        });
      }
    }
  });
}


   // 🔹 Historique
   static pushCurrentStepToHistory(session, step, isRotation) {
    if (!step) return;
    session.history ??= [];
    session.history.push({ id: step.id, isRotation: !!isRotation });
  }

  static handlePrevious(session) {
    if (!session.history || session.history.length === 0) return null;

    const lastStep = session.history.pop();
    if (!lastStep) return null;

    // Si c'était une step de rotation, on la remet au début de rotationQueue
    if (lastStep.isRotation) {
      const stepWrapper = RotationQueueUtils.getStepWrapperById(session, lastStep.id);
      session.rotationQueue = [stepWrapper, ...(session.rotationQueue || [])];
    }

    session.currentStepId = lastStep.id;
    return lastStep.id;
  }


  static handleRotationInit(rotationInit) {
    if (!rotationInit.nextStepId || rotationInit.nextStepId === 'FIN') {
      return { finished: true };
    }
    return { nextStep: { id: rotationInit.nextStepId } };
  }
}
