import SurveyService from './SurveyService.js';
import RealResponseService from './ResponseService.js';
import ResponseNormalizer from './ResponseNormalizer.js';
import RotationService from './RotationService.js';
import RotationQueueUtils from './RotationQueueUtils.js';
import NavigationRuleService from './NavigationRuleService.js';
import ValidationService from './ValidationService.js';
import MockResponseService from './ResponseService.mock.js';
import PrecisionUtils from './precisionUtils.js';

const ResponseService =
process.env.MODE_TEST === 'true'
? MockResponseService
: RealResponseService;

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
      await this.savePageAnswers({ steps: this.getStepsForCurrentPage(survey, currentStep, isInRotation), 
        wrappers: isInRotation ? [currentStepWrapper] : undefined, 
        body, 
        responseId, 
        session, 
        isInRotation,survey });
        
        const isStepValid = ValidationService.validateStep(currentStep, session.answers, currentStepWrapper);
        
        if (!isStepValid) {
          
          const messages = ValidationService.getMissingMessages(currentStep, session.answers, currentStepWrapper);
          const invalidFields =
          ValidationService.getInvalidFields(
            currentStep,
            session.answers,
            currentStepWrapper
          );
          
          return {
            success: false,
            validationError: true,
            messages, 
            invalidFields,
            currentStepId: currentStep.id
          };
        }
        
        this.pushCurrentStepToHistory(session, currentStep, isInRotation,currentStepWrapper);
      }
      if (action === 'prev') {
        const prevStepId = this.handlePrevious(session,survey);
        if (prevStepId) return { nextStep: { id: prevStepId } };
      }
      
      const nextStepId = this.resolveNextStep(session, survey, currentStep, isInRotation);
      if (!nextStepId || nextStepId === 'FIN') return { finished: true };
      
      session.currentStepId = nextStepId;
      
      return { nextStep: { id: nextStepId } };
    }
    
    // -------------------- Helpers --------------------
    // ============================================================================
    // INITIALISATION DE SESSION
    // Responsabilité :
    // - Préparer les structures nécessaires au run du questionnaire
    // ===========================================================================
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
    
    static getStepsForCurrentPage(survey, currentStep, isInRotation) {
      if (!currentStep) return []; // éviter TypeError
      
      return isInRotation
      ? [currentStep]
      : survey.steps.filter(s => s.page === currentStep.page);
    }
    
    // -------------------- SAVE PAGE ANSWERS --------------------
    
    static async savePageAnswers({ steps, wrappers, body, responseId, session, isInRotation,survey }) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const wrapper = wrappers?.[i];
        const rawValue = this.getRawValueForStep(step, body);
        if (rawValue === undefined) return;
        
        console.log("rawValue",rawValue)
        
        const normalizedRaw = ResponseNormalizer.normalize(step, rawValue, wrapper?.optionIndex);
        console.log("norlize",normalizedRaw)
        
        const normalized = Object.fromEntries(
          Object.entries(normalizedRaw || {}).filter(([_, v]) =>
            v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')
        )
      );
      
      let mainValue = this.getMainValue(step, body, rawValue);
      
      
      const previousSelected = session.answers[step.id]; 
      const oldOptionCode = Array.isArray(previousSelected) ? previousSelected[0] : previousSelected;
      const keysToDelete = await this.computeKeysToDelete(step, rawValue, mainValue,oldOptionCode,session,previousSelected,survey);
      
      
      await this.cleanupSession(step, session, mainValue, previousSelected);
      
      
      await ResponseService.addAnswer(responseId, normalized, keysToDelete);
      
      // Recalculer mainValue après cleanup
      if (step.type === 'multiple_choice') mainValue = Array.isArray(mainValue) ? mainValue : [];
      
      this.saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers: session.answers });
      this.saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation });
      console.log("session answer", session.answers);
      
    }
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
  static normalizeSelected(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value.map(String) : [String(value)];
  }
  
  static computeDeselected(previousSelected, mainValue) {
    const prev = this.normalizeSelected(previousSelected);
    const next = this.normalizeSelected(mainValue);
    return prev.filter(v => !next.includes(v));
  }
  
  
  static async cleanupSession(step, session, mainValue, previousSelected = []) {
    const sessionAnswers = session.answers;
    if (!sessionAnswers) return;
    
    const deselected = this.computeDeselected(previousSelected, mainValue);
    
    deselected.forEach(code => {
      Object.keys(sessionAnswers).forEach(k => {
        if (
          k.startsWith(`${step.id}_${code}`) ||
          k.startsWith(`${step.id}_pr_${code}`)
        ) {
          delete sessionAnswers[k];
        }
      });
    });
    
    if (step.rotationTemplate?.length && deselected.length) {
      session.rotationState ??= {};
      session.rotationState[step.id] = { needsRefresh: true };
      delete session.rotationQueue;
      delete session.rotationQueueDone?.[step.id];
    }
  }
  
  
  // -------------------- SESSION & DB --------------------
  static saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation }) {
    const answerKey = isInRotation && wrapper?.optionIndex !== undefined ? `${step.id}_${wrapper.optionIndex}` : step.id;
    // Valeur principale
    session.answers[answerKey] = mainValue;
    // Fusionner toutes les sous-questions
    Object.keys(normalized).forEach(dbKey => {
      if (dbKey === step.id_db) return;
      
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
    
    const selectedValues = SurveyService.normalizeToArray(mainValue).map(v => v?.toString());
    
    //  Supprimer toutes les précisions obsolètes
    step.options?.forEach(opt => {
      const key = PrecisionUtils.buildPrecisionKey(step.id, opt.codeItem);
      if (!selectedValues.includes(opt.codeItem?.toString())) {
        delete sessionAnswers[key];
      }
    });
    
    // Sauvegarder les précisions des options sélectionnées
    selectedValues.forEach(codeItem => {
      const opt = step.options?.find(
        o => o.codeItem?.toString() === codeItem
      );
      
      if (!opt?.requiresPrecision) return;
      
      const rawKey = `precision_${step.id}_${codeItem}`;
      const value = rawValue[rawKey];
      
      if (SurveyService.hasRealAnswer(value)) {
        sessionAnswers[
          PrecisionUtils.buildPrecisionKey(step.id, codeItem)
        ] = value.trim();
      }
    });
  }
  
  static async computeKeysToDelete(step, rawValue, mainValue, oldOptionCode = undefined,session,previousSelected = [],survey) {
    const keysToDelete = [];
    
    const isEmpty = v =>
      v === undefined ||
    v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0);
    
    
  // ==========================================================
  // CAS AUTOCOMPLETE
  // ==========================================================
  if (step.type === 'autocomplete') {
    if (isEmpty(mainValue) || isEmpty(rawValue)) {
      // Supprimer toutes les clés dérivées : id_db_colonne
      step.columns?.forEach(col => {
        if (col.saveInDB) {
          keysToDelete.push(`${step.id_db}_${col.name}`);
        }
      });
    }
    return keysToDelete;
  }
  
    // ==========================================================
    // CAS 1 : ACCORDION
    // ==========================================================
    if (step.type === 'accordion' && step.sections) {
      step.sections.forEach(section => {
        section.questions?.forEach(question => {
          const dbKey = question.id_db;
          const qId = question.id;
          
          const currentValue =
          rawValue?.[qId] ??
          mainValue?.[qId];
          
          if (isEmpty(currentValue)) {
            keysToDelete.push(dbKey);
          }
        });
      });
      
      return keysToDelete;
    }
    
    // ==========================================================
    // CAS GRID (AXIS AWARE)
    // ==========================================================
    if (step.type === 'grid') {
      
      console.log("=== GRID DEBUG START ===");
      console.log("Step ID:", step.id);
      console.log("Raw Value:", rawValue);
      console.log("Reponses:", step.reponses);
      
      const axis = step.reponses?.[0]?.input?.axis;
      console.log("Axis detected:", axis);
      
      // ------------------------------------------------------
      // AXIS = ROW  → clés DB = lignes
      // ------------------------------------------------------
      if (axis === 'row') {
        console.log("Processing GRID axis ROW");
        step.questions.forEach(question => {
          const qId = question.id;
          const qDbKey = question.id_db_qst;
          
          const currentValue = rawValue?.[qId];
          console.log(`Question: ${qId}, DB Key: ${qDbKey}, Current Value:`, currentValue);
          
          if (
            currentValue === undefined ||
            currentValue === null ||
            currentValue === ''||
            (Array.isArray(currentValue) && currentValue.length === 0)
          ) {
            console.log("-> Empty! Will delete:", qDbKey);
            keysToDelete.push(qDbKey);
          } else {
            console.log("-> Has value, keep:", qDbKey);
          }
        });
        
        console.log("Keys to delete ROW:", keysToDelete);
        console.log("=== GRID DEBUG END ===");
        return keysToDelete;
      }
      
      // ------------------------------------------------------
      // AXIS = COLUMN → clés DB = colonnes
      // ------------------------------------------------------
      if (axis === 'column') {
        
        console.log("Processing GRID axis COLUMN");
        
        step.reponses.forEach(rep => {
          const rId = rep.id;           // R1, R2…
          const rDbKey = rep.id_db_rps; // Y1UEGY_R1
          
          const hasAnySelection = step.questions.some(q => {
            const values = rawValue?.[q.id];
            console.log(`Checking question ${q.id} for column ${rId}, values:`, values);
            return Array.isArray(values) && values.includes(rId);
          });
          console.log(`Column ${rId}, DB Key ${rDbKey}, any selection:`, hasAnySelection);
          
          if (!hasAnySelection) {
            console.log("-> Empty! Will delete:", rDbKey);
            keysToDelete.push(rDbKey);
          }else {
            console.log("-> Has selection, keep:", rDbKey);
          }
        });
        console.log("Keys to delete COLUMN:", keysToDelete);
        console.log("=== GRID DEBUG END ===");
        return keysToDelete;
      }
    }
    
    // ---- ROTATION CLEANUP ----
    if (step.rotationTemplate?.length) {
      
      const newSelected = Array.isArray(mainValue) ? mainValue : [];
     // console.log("cleanupsession newSelected ",newSelected)
      const hasChanged =
      previousSelected.length !== newSelected.length ||
      previousSelected.some(v => !newSelected.includes(v));
      
      if (hasChanged) {
        
        const { dbKeysToDelete, sessionKeysToDelete } =
        this.computeRotationKeysToDelete({
          step,
          mainValue,
          previousSelected,
          allSteps: survey.steps
        });
        
        //  DB
        if (dbKeysToDelete.length) {
          await ResponseService.deleteAnswers(session.responseId, dbKeysToDelete);
        }
        
        //  Session
        sessionKeysToDelete.forEach(k => {
          Object.keys(session.answers).forEach(sessionKey => {
            if (sessionKey.startsWith(k)) {
              delete session.answers[sessionKey];
            }
          });
        });
        // Indique que la rotation doit être relancée si on revient sur ce parent
        session.rotationState ??= {};
        session.rotationState[step.id] = { needsRefresh: true };
        
        // reset rotation state
        delete session.rotationQueue;
        delete session.rotationQueueDone[step.id];
        
      }
    }
    
    // ==========================================================
    // CAS 3 : STEP SIMPLE
    // ==========================================================
    if (step.id_db && isEmpty(mainValue)) {
      keysToDelete.push(step.id_db);
    }
    // 4. PRECISIONS (_pr_)
    const precisionKeys = this.computePrecisionKeysToDelete(step, mainValue);
    keysToDelete.push(...precisionKeys);
    
    // 5. SOUS-QUESTIONS (subQuestions)
    if (oldOptionCode !== undefined) {
      const { dbKeysToDelete: subKeys } = this.computeSubQuestionKeysToDelete({ step, mainValue, oldOptionCode });
      keysToDelete.push(...subKeys);
    }
    return keysToDelete;
  }
  
  static computeRotationKeysToDelete({
    step,
    mainValue,
    previousSelected = [],
    allSteps
  }) {
    const dbKeysToDelete = [];
    const sessionKeysToDelete = [];
    // Nouvelle sélection normalisée
    const newSelected = Array.isArray(mainValue) ? mainValue.map(String) : [String(mainValue)];
    
    // Options désélectionnées
    const deselectedOptions = previousSelected
    .map(String)
    .filter(opt => !newSelected.includes(opt));
    
    if (!deselectedOptions.length) {
      return { dbKeysToDelete, sessionKeysToDelete };
    }
    
    deselectedOptions.forEach(optionCode => {
      
      // SESSION KEYS
      // Toutes les clés enfants générées par rotation
      sessionKeysToDelete.push(`${step.id}_${optionCode}`);
      
      // DB KEYS
      if (step.rotationTemplate?.length) {
        step.rotationTemplate.forEach(rotId => {
          const rotStep = allSteps.find(s => s.id === rotId);
          if (rotStep?.id_db) {
            dbKeysToDelete.push(`${rotStep.id_db}_${optionCode}`);
          }
        });
      } else if (step.id_db) {
        dbKeysToDelete.push(`${step.id_db}_${optionCode}`);
      }
    });
    
    return {
      dbKeysToDelete: [...new Set(dbKeysToDelete)],
      sessionKeysToDelete: [...new Set(sessionKeysToDelete)]
    };
  }
  
  // Supprimer les clés de sous-questions pour option désélectionnée
  
  static computeSubQuestionKeysToDelete({ step, mainValue, oldOptionCode }) {
    const dbKeysToDelete = [];
    const sessionKeysToDelete = [];
    
    if (!step.options?.length || oldOptionCode === undefined) return { dbKeysToDelete, sessionKeysToDelete };
    
    const oldOption = step.options.find(opt => String(opt.codeItem) === String(oldOptionCode));
    if (!oldOption?.subQuestions) return { dbKeysToDelete, sessionKeysToDelete };
    
    oldOption.subQuestions.forEach(subQ => {
      dbKeysToDelete.push(`${step.id_db}_${oldOptionCode}_${subQ.id_db}`);
      sessionKeysToDelete.push(`${step.id}_${oldOptionCode}_${subQ.id}`);
      console.log("-> Sub-question key to delete:", subQ.id);
    });
    
    return { dbKeysToDelete, sessionKeysToDelete };
  }
  
  static computePrecisionKeysToDelete(step, mainValue) {
    const keysToDelete = [];
    
    if (!step.options?.length) return keysToDelete;
    
    // Convertir mainValue en tableau de codes sélectionnés
    const selected = Array.isArray(mainValue) ? mainValue.map(String) : [String(mainValue)];
    
    step.options.forEach(opt => {
      const code = String(opt.codeItem);
      const dbPrKey = `${step.id_db}_pr_${code}`;
      
      if (!selected.includes(code)) {
        keysToDelete.push(dbPrKey);
       // console.log("-> Precision key to delete:", dbPrKey);
      } else {
       // console.log("-> Precision key kept:", dbPrKey);
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
    if (last?.id === step.id) return; //  empêche doublon
    
    session.history.push({ 
      id: step.id, 
      isRotation: !!isRotation,
      wrapper: isRotation ? wrapper : null });
    }
    
    static handlePrevious(session,survey) {
      if (!session.history?.length) {
        // On est déjà à la première question
        return session.currentStepId; // on reste sur la première question
      }
      
      // Retirer la question actuelle si elle correspond
      let lastIndex = session.history.length - 1;
      if (session.history[lastIndex].id === session.currentStepId) {
        session.history.pop();
        lastIndex--;
      }
      
      if (lastIndex < 0) {
        // Pas de question précédente, rester sur la première
        return session.currentStepId;
      }
      
      const previousStep = session.history[lastIndex];
      if (!previousStep) return null;
      // Si on revient sur un parent de rotation → reset total
const isParent = survey.steps.some(
  s => s.repeatFor === previousStep.id
);

if (isParent) {
  delete session.rotationQueue;
  if (session.rotationQueueDone) {
    delete session.rotationQueueDone[previousStep.id];
  }
  if (session.rotationState) {
    delete session.rotationState[previousStep.id];
  }
}

      // Gestion des rotations
      if (previousStep.isRotation && previousStep.wrapper) {
        const parentId = previousStep.wrapper.parent;
        
        //  Réinitialiser le flag de rotation terminée
        if (session.rotationQueueDone?.[parentId]) {
          delete session.rotationQueueDone[parentId];
        }
        // console.log("rotationState",session.rotationState)
        // // Réinitialiser l'état de rotation
        // if (session.rotationState?.[parentId]) {
        //   // Conserver seulement si la réponse n'a pas changé
        //   const currentAnswer = session.answers[parentId];
        //   const originalAnswer = session.rotationState[parentId].originalAnswer;
        //   console.log("rotationState666",session.rotationState)
        //   if (JSON.stringify(currentAnswer) !== JSON.stringify(originalAnswer)) {
        //     delete session.rotationState[parentId];
        //   }
        // }
        
        // On récupère TOUTES les rotations du parent
        const allRotations = RotationQueueUtils.getAllRotationsForParent(session,survey, parentId);
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
        // 1 NAVIGATION CONDITIONNELLE D’ABORD
        const navigationTarget = NavigationRuleService.resolve(
          currentStep,
          session.answers,
          survey.steps
        );
        
        // Si la navigation n’est PAS la redirection par défaut → priorité absolue
        if (
          navigationTarget &&
          navigationTarget !== currentStep.redirection
        ) {
          return navigationTarget;
        }
        
        // Réinitialiser si nécessaire
        RotationService.resetRotationIfNeeded(session,survey, currentStep.id, session.answers);
        
        // Init rotation seulement si action 'next' et rotationQueue vide
        if (!session.rotationQueue) {
          const rotationInit = RotationService.initRotation({
            session,
            survey,
            answers: session.answers,
            action: 'next',
            currentStep,
            generateQueue: RotationQueueUtils.generateRotationQueue
          });
          console.log('rotationInit next', rotationInit);
          if (rotationInit) return rotationInit.nextStepId;
        }
        const rotationAdvance = RotationService.advanceRotation({ session, survey, currentStep, action: 'next' });
        if (rotationAdvance?.nextStepId) return rotationAdvance.nextStepId;
        
        return navigationTarget;
      }
      
    }