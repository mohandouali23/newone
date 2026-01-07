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
    // Stocker le survey dans le cache de session pour utilisation ultérieure
    session.surveyCache = survey;
    
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
        console.log('rawvalue',rawValue)
        const normalizedRaw = ResponseNormalizer.normalize(step, rawValue, wrapper?.optionIndex);
        console.log("norlize",normalizedRaw)
        
        //  Nettoyage : supprimer undefined / null / string vide
        const normalized = Object.fromEntries(
          Object.entries(normalizedRaw || {}).filter(([_, v]) =>
            v !== undefined &&
          v !== null &&
          !(typeof v === 'string' && v.trim() === '')
        )
      );
      
      console.log('normalized cleaned', normalized);
      const mainValue = this.getMainValue(step, body, rawValue);
      if (
        !normalized ||
        Object.keys(normalized).length === 0 ||
        mainValue === null ||
        mainValue === '' ||
        (Array.isArray(mainValue) && mainValue.length === 0)
      ) {
        console.log('⛔ normalized vide → skip save', step.id);
        
        return;
      }
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
    if (!step || !sessionAnswers) return;
    if (step.type === 'single_choice') {
      const { sessionKeysToDelete } = this.computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue: mainValue });
      sessionKeysToDelete.forEach(k => delete sessionAnswers[k]);
    }
    if (step.type === 'multiple_choice') {
      const selectedArray = Array.isArray(mainValue) ? mainValue : [];
      const oldSelected = Array.isArray(sessionAnswers[step.id]) ? sessionAnswers[step.id] : [];
      
      // Pour chaque option précédemment sélectionnée mais maintenant désélectionnée
      oldSelected.forEach(optionCode => {
        if (!selectedArray.includes(optionCode)) {
          // Supprimer les sous-questions de cette option dans session
          const { sessionKeysToDelete } = this.computeSubQuestionKeysToDelete({
            step,
            sessionAnswers,
            oldOptionCode: optionCode
          });
          
          sessionKeysToDelete.forEach(k => delete sessionAnswers[k]);
        }
      });
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
    // Valeur principale
    session.answers[answerKey] = mainValue;
    // Fusionner toutes les sous-questions
    Object.keys(normalized).forEach(dbKey => {
      if (dbKey === step.id_db) return;// ignorer la clé principale DB
      
      const parts = dbKey.split('_'); 
      const codeItem = parts[1]; // code de l'option
      const subIdDb = parts.slice(2).join('_'); // id_db de la sous-question
      // Trouver la sous-question correspondante dans le step
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
  
  // static computeKeysToDelete(step, sessionAnswers, body) {
  //   const selectedOptions = step.type === 'multiple_choice' && Array.isArray(body[step.id]) ? body[step.id] : [];
  //   console.log("selectedOptions key delete",selectedOptions)
  //   return [
  //     ...this.computePrecisionKeysToDelete(step, sessionAnswers, selectedOptions),
  //     ...(step.type === 'single_choice' ? this.computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue: body[step.id] }).dbKeysToDelete : [])
  //   ];
  // }
  static computeKeysToDelete(step, sessionAnswers, body) {
    const selectedOptions = step.type === 'multiple_choice' && Array.isArray(body[step.id])
    ? body[step.id]
    : [];
    
    const keysToDelete = [
      // Supprimer les précisions qui ne sont plus valides
      ...this.computePrecisionKeysToDelete(step, sessionAnswers, selectedOptions),
    ];
    
    if (step.type === 'single_choice') {
      // Supprimer les sous-questions de single_choice
      keysToDelete.push(
        ...this.computeSubQuestionKeysToDelete({
          step,
          sessionAnswers,
          newValue: body[step.id]
        }).dbKeysToDelete
      );
    }
    
    if (step.type === 'multiple_choice') {
      // Supprimer les sous-questions des options désélectionnées
      const oldSelected = Array.isArray(sessionAnswers[step.id]) ? sessionAnswers[step.id] : [];
      oldSelected.forEach(optionCode => {
        if (!selectedOptions.includes(optionCode)) {
          const { dbKeysToDelete } = this.computeSubQuestionKeysToDelete({
            step,
            sessionAnswers,
            oldOptionCode: optionCode
          });
          keysToDelete.push(...dbKeysToDelete);
        }
      });
    }
    
    return keysToDelete;
  }
  
  static computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue, oldOptionCode }) {
    const dbKeysToDelete = [], sessionKeysToDelete = [];
    if (step.type === 'single_choice') {
      const oldValue = sessionAnswers[step.id];
      if (!oldValue || oldValue === newValue) return { dbKeysToDelete, sessionKeysToDelete };
      
      const oldOption = step.options?.find(opt => opt.codeItem?.toString() === oldValue?.toString());
      if (!oldOption?.subQuestions) return { dbKeysToDelete, sessionKeysToDelete };
      
      oldOption.subQuestions.forEach(subQ => {
        dbKeysToDelete.push(`${step.id_db}_${oldValue}_${subQ.id_db}`);
        sessionKeysToDelete.push(`${step.id}_${oldValue}_${subQ.id}`);
      });
    } else if (step.type === 'multiple_choice' && oldOptionCode !== undefined) {
      const oldOption = step.options?.find(opt => opt.codeItem?.toString() === oldOptionCode?.toString());
      if (!oldOption?.subQuestions) return { dbKeysToDelete, sessionKeysToDelete };
      
      oldOption.subQuestions.forEach(subQ => {
        dbKeysToDelete.push(`${step.id_db}_${oldOptionCode}_${subQ.id_db}`);
        sessionKeysToDelete.push(`${step.id}_${oldOptionCode}_${subQ.id}`);
      });
    }
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
      
      // console.log('⬅️ PREV CLIQUÉ');
      // console.log('📜 history:', session.history.map(h => h.id));
      // console.log('📦 rotationQueue:', session.rotationQueue?.map(w => w.id));
      // console.log('📍 currentStepId:', session.currentStepId);
      
      // Retirer la question actuelle si elle correspond
      let lastIndex = session.history.length - 1;
      if (session.history[lastIndex].id === session.currentStepId) {
        session.history.pop();
        lastIndex--;
      }
      
      if (lastIndex < 0) return null;
      
      const previousStep = session.history[lastIndex];
      if (!previousStep) return null;
      
      // Gestion des rotations
      if (previousStep.isRotation && previousStep.wrapper) {
        const parentId = previousStep.wrapper.parent;
        // On récupère TOUTES les rotations du parent
        const allRotations = RotationQueueUtils.getAllRotationsForParent(session, parentId);
        
        // On trouve l'index exact de cette instance dans allRotations
        const rotationIndex = allRotations.findIndex(r => r.id === previousStep.id 
          && r.optionCode === previousStep.wrapper.optionCode);
          
          // On remet la rotationQueue à partir de cette instance
          session.rotationQueue = rotationIndex >= 0 ? allRotations.slice(rotationIndex) : allRotations;
        } else {
          delete session.rotationQueue;
        }
        
        session.currentStepId = previousStep.id;
        return previousStep.id;
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
    