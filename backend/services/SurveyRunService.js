// ============================================================================
// SURVEY RUN SERVICE
// Responsabilité :
// - Orchestration complète de l’exécution d’un questionnaire
// - Navigation (next / prev)
// - Sauvegarde des réponses (session + DB)
// - Validation
// - Gestion des rotations
// ===========================================================================
import SurveyService from './SurveyService.js';
import RealResponseService from './ResponseService.js';
import ResponseNormalizer from './ResponseNormalizer.js';
import RotationService from './RotationService.js';
import RotationQueueUtils from './RotationQueueUtils.js';
import NavigationRuleService from './NavigationRuleService.js';
import ValidationService from './ValidationService.js';
import MockResponseService from './ResponseService.mock.js';

const ResponseService =
process.env.MODE_TEST === 'true'
  ? MockResponseService
  : RealResponseService;

export default class SurveyRunService {

  // ============================================================================
  // POINT D’ENTRÉE PRINCIPAL
  // Responsabilité :
  // - Charger le questionnaire
  // - Initialiser la session
  // - Router les actions next / prev
  // - Déterminer le prochain step
  // ==========================================================================
  
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
     await this.savePageAnswers({ steps: this.getStepsForCurrentPage(survey, currentStep, isInRotation), 
        wrappers: isInRotation ? [currentStepWrapper] : undefined, 
        body, 
        responseId, 
        session, 
        isInRotation });
        
        // const isStepValid = ValidationService.validateStep(currentStep, session.answers, currentStepWrapper);
        // if (!isStepValid) return { nextStep: { id: currentStep.id }, validationError: true };
        
        const isStepValid = ValidationService.validateStep(currentStep, session.answers, currentStepWrapper);

if (!isStepValid) {
  // Récupérer les messages de validation
  const missingFields = ValidationService.getMissingMessages(currentStep, session.answers, currentStepWrapper);

  // Retourner l’erreur au frontend
  return {
    success: false,
    validationError: true,
    messages: missingFields, // tableau de strings
    currentStepId: currentStep.id
  };
}

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
    
    // ============================================================================
    // GESTION DES PAGES / STEPS
    // Responsabilité :
    // - Déterminer quels steps appartiennent à la page courante
    // - Gérer les cas de rotation
    // ============================================================================
    static getStepsForCurrentPage(survey, currentStep, isInRotation) {
      if (!currentStep) return []; // éviter TypeError
      
      return isInRotation
      ? [currentStep]
      : survey.steps.filter(s => s.page === currentStep.page);
    }
    
    // ============================================================================
    // SAUVEGARDE DES RÉPONSES DE PAGE
    // Responsabilité :
    // - Extraction des valeurs
    // - Normalisation
    // - Nettoyage
    // - Sauvegarde DB
    // - Sauvegarde session
    // ============================================================================
    // -------------------- SAVE PAGE ANSWERS --------------------
    static async savePageAnswers({ steps, wrappers, body, responseId, session, isInRotation }) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const wrapper = wrappers?.[i];
        const rawValue = this.getRawValueForStep(step, body);
        
        if (rawValue === undefined) return;
        console.log('rawvalue',rawValue)
        const normalizedRaw = ResponseNormalizer.normalize(step, rawValue, wrapper?.optionIndex);
        //console.log("norlize",normalizedRaw)
        
        //  Nettoyage : supprimer undefined / null / string vide
        const normalized = Object.fromEntries(
          Object.entries(normalizedRaw || {}).filter(([_, v]) =>
            v !== undefined &&
          v !== null &&
          !(typeof v === 'string' && v.trim() === '')
        )
      );
      
     // console.log('normalized cleaned', normalized);
     /***********************************565656 */
      let mainValue = this.getMainValue(step, body, rawValue);
      if (
        !normalized ||
        Object.keys(normalized).length === 0 ||
        mainValue === null ||
        mainValue === '' ||
        (Array.isArray(mainValue) && mainValue.length === 0)
      ) {
       // console.log('⛔ normalized vide → skip save', step.id);
        
        return;
      }
      // 1 Calculer les clés à supprimer AVANT nettoyage
      const keysToDelete = this.computeKeysToDelete(
        step,
        session.answers,
        body
      );
        //  snapshot AVANT toute mutation
        const previousSelected =
        Array.isArray(session.answers[step.id])
          ? [...session.answers[step.id]]
          : [];
      
       // 3 Nettoyer la session APRÈS
       await this.cleanupSession(step, session, mainValue, previousSelected);
      
       
      // 2 Sauvegarder en DB
      ResponseService.addAnswer(responseId, normalized, keysToDelete);
     
      //  Recalculer mainValue après cleanup
if (step.type === 'multiple_choice' ) {
  mainValue = Array.isArray(mainValue) ? mainValue : [];

}
console.log('mainvalue after',mainValue)
      this.saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation });
      this.saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers: session.answers });
      console.log("session answer",session.answers)
    };
  }
  
  // ============================================================================
  // EXTRACTION DES VALEURS
  // Responsabilité :
  // - Déterminer la valeur brute envoyée par le client
  // - Déterminer la valeur principale du step
  // ============================================================================
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
  
  // ============================================================================
  // NETTOYAGE DE SESSION
  // Responsabilité :
  // - Supprimer anciennes sous-questions
  // - Réinitialiser rotations si nécessaire
  // - Nettoyer les précisions obsolètes
  // ============================================================================
  // -------------------- CLEANUP SESSION --------------------
  static async cleanupSession(step, session, mainValue, previousSelected = []) {
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
      previousSelected.forEach(optionCode => {
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
   
    // ---- ROTATION CLEANUP ----
if (step.rotationTemplate?.length) {

 
  const newSelected = Array.isArray(mainValue) ? mainValue : [];
  console.log("cleanupsession newSelected ",newSelected)
  const hasChanged =
    previousSelected.length !== newSelected.length ||
    previousSelected.some(v => !newSelected.includes(v));

  if (hasChanged) {
    const { dbKeysToDelete, sessionKeysToDelete } =
      this.computeRotationKeysToDelete({
        step,
        sessionAnswers,
        previousSelected,
        allSteps: session.surveyCache.steps
      });

    //  DB
    if (dbKeysToDelete.length) {
      await ResponseService.deleteAnswers(session.responseId, dbKeysToDelete);
    }

    //  Session
    sessionKeysToDelete.forEach(k => delete session.answers[k]);

     // Indique que la rotation doit être relancée si on revient sur ce parent
     session.rotationState ??= {};
     session.rotationState[step.id] = { needsRefresh: true };

    // reset rotation state
    delete session.rotationQueue;
    delete session.rotationQueueDone[step.id];
   //delete session.rotationState?.[step.id];
 
  }
}
    this.cleanupSessionPrecisions(step, sessionAnswers, Array.isArray(mainValue) ? mainValue : [mainValue]);
  }

  
  // ---------------------------------------------------------------------------
  // SAUVEGARDE DES RÉPONSES EN SESSION
  // Responsabilité :
  // - Enregistrer la valeur principale du step
  // - Enregistrer les sous-questions normalisées
  // - Gérer les clés spécifiques aux rotations
  // ---------------------------------------------------------------------------
  
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
  // ---------------------------------------------------------------------------
  // SAUVEGARDE DES PRÉCISIONS (CHAMPS CONDITIONNELS)
  // Responsabilité :
  // - Enregistrer les champs "précision" liés aux options sélectionnées
  // - Respecter les règles requiresPrecision
  // --------------------------------------------------------------------------
  static saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers }) {
    if (!step || !rawValue || !sessionAnswers) return;
    
    // --- SINGLE CHOICE ---
    if (step.type === 'single_choice') {
      // Supprimer toutes les précisions existantes de cette question
      step.options?.forEach(opt => {
        const key = `${step.id}_pr_${opt.codeItem}`;
        delete sessionAnswers[key];
      });
      
      // Ajouter la précision de l'option sélectionnée
      const selectedOption = step.options?.find(
        opt => opt.codeItem?.toString() === mainValue?.toString()
      );
      if (selectedOption?.requiresPrecision) {
        const val = rawValue[`precision_${mainValue}`];
        if (val?.trim()) {
          sessionAnswers[`${step.id}_pr_${mainValue}`] = val.trim();
        }
      }
    }
    
    // --- MULTIPLE CHOICE ---
    if (step.type === 'multiple_choice' && Array.isArray(mainValue)) {
      // Supprimer les précisions pour les options qui ne sont plus sélectionnées
      step.options?.forEach(opt => {
        const key = `${step.id}_pr_${opt.codeItem}`;
        if (!mainValue.includes(opt.codeItem?.toString())) {
          delete sessionAnswers[key];
        }
      });
      
      // Ajouter/mettre à jour les précisions pour les options sélectionnées
      mainValue.forEach(codeItem => {
        const val = rawValue[`precision_${step.id}_${codeItem}`];
        if (val?.trim()) {
          sessionAnswers[`${step.id}_pr_${codeItem}`] = val.trim();
        }
      });
    }
  }
  
  
  // ---------------------------------------------------------------------------
  // CALCUL DES CLÉS À SUPPRIMER EN BASE DE DONNÉES
  // Responsabilité :
  // - Identifier les réponses obsolètes
  // - Gérer la suppression des précisions
  // - Gérer la suppression des sous-questions
  // ---------------------------------------------------------------------------
  static computeKeysToDelete(step, sessionAnswers, body) {
    const newValue = body[step.id];
    const selectedOptions = 
    step.type === 'multiple_choice' && Array.isArray(newValue)
    ? newValue
    : step.type === 'single_choice' && newValue != null
    ? [newValue.toString()]
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
//   static computeRotationKeysToDelete({ step, sessionAnswers, allSteps }) {
   
//     const dbKeysToDelete = [];
//     const sessionKeysToDelete = [];
  
//     Object.keys(sessionAnswers).forEach(sessionKey => {
//       console.log("sessionAnswers de computeRotationKeysToDelete ",sessionAnswers)
//       console.log("step.id",step.id)
//       // q3_1_1, q3_2_1 ...
//       if (!sessionKey.startsWith(`${step.id}_`)) return;
  
//       sessionKeysToDelete.push(sessionKey);
  
//       // 🔹 construire la clé DB correcte
//       const wrapperStep = step.wrapper?.step || step; // sous-question réelle
//       const optionCode = sessionKey.split('_')[2];   // ex: '1'
//  // console.log("sessionKey",sessionKey)
//  // console.log("optionCode",optionCode)
//  // console.log("wrapperStep",wrapperStep)
//       // vérifier si c’est la sous-question correspondante
//       // if (wrapperStep.id_db) {
//       //   dbKeysToDelete.push(`${wrapperStep.id_db}_${optionCode}`);
//       // }
//         //  Si rotationTemplate existe, récupérer les steps correspondants
//     if (step.rotationTemplate?.length) {
//       step.rotationTemplate.forEach(rotId => {
//         const rotStep = allSteps.find(s => s.id === rotId);
//         if (rotStep?.id_db) {
//           dbKeysToDelete.push(`${rotStep.id_db}_${optionCode}`);
//         }
//       });
//     } else if (step.id_db) {
//       // fallback : parent
//       dbKeysToDelete.push(`${step.id_db}_${optionCode}`);
//     }
//     });
  
//     return {
//       dbKeysToDelete: [...new Set(dbKeysToDelete)],
//       sessionKeysToDelete: [...new Set(sessionKeysToDelete)]
//     };
//   }
  
static computeRotationKeysToDelete({ step,sessionAnswers, previousSelected = [], allSteps }) {
  const dbKeysToDelete = [];
  const sessionKeysToDelete = [];

  previousSelected.forEach(optionCode => {
    // Keys de session
    Object.keys(sessionAnswers).forEach(sessionKey => {
      if (sessionKey.includes(`_${optionCode}`) && sessionKey.startsWith(`${step.id}_`)) {
        sessionKeysToDelete.push(sessionKey);
      }
    });

    // Keys de DB
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

  // ---------------------------------------------------------------------------
  // GESTION DES SOUS-QUESTIONS (DB + SESSION)
  // Responsabilité :
  // - Supprimer les sous-questions liées aux options désélectionnées
  // - Gérer single_choice et multiple_choice
  // ---------------------------------------------------------------------------
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
  // ---------------------------------------------------------------------------
  // GESTION DES PRÉCISIONS À SUPPRIMER (DB)
  // Responsabilité :
  // - Supprimer les champs de précision devenus invalides
  // --------------------------------------------------------------------------
  static computePrecisionKeysToDelete(step, sessionAnswers, selectedOptions = []) {
    const keysToDelete = [];
   // console.log("selectionoption pr",selectedOptions)
    Object.keys(sessionAnswers).forEach(key => {
      if (!key.startsWith(`${step.id}_pr_`)) return;
      
      const optionCode = key.replace(`${step.id}_pr_`, '');
      
      // SINGLE → supprimer toutes sauf la sélectionnée
      if (step.type === 'single_choice' && !selectedOptions.includes(optionCode)) {
        keysToDelete.push(
          key.replace(`${step.id}_pr_`, `${step.id_db}_pr_`)
        );
      }
      
      // MULTI → supprimer celles désélectionnées
      if (
        step.type === 'multiple_choice' &&
        !selectedOptions.includes(optionCode)
      ) {
        keysToDelete.push(
          key.replace(`${step.id}_pr_`, `${step.id_db}_pr_`)
        );
      }
    });
    
    return keysToDelete;
  }
  
  // ---------------------------------------------------------------------------
  // NETTOYAGE DES PRÉCISIONS EN SESSION
  // Responsabilité :
  // - Supprimer les précisions obsolètes de la session
  // - Maintenir la cohérence avec les réponses sélectionnées
  // --------------------------------------------------------------------------
  static cleanupSessionPrecisions(step, sessionAnswers, selectedOptions = []) {
    Object.keys(sessionAnswers).forEach(key => {
      if (step.type === 'single_choice' && key.startsWith(`${step.id}_pr_`)) delete sessionAnswers[key];
      if (step.type === 'multiple_choice' && key.startsWith(`${step.id}_pr_`)) {
        const code = key.replace(`${step.id}_pr_`, '');
        if (!selectedOptions.includes(code)) delete sessionAnswers[key];
      }
    });
  }
  // ============================================================================
  // HISTORIQUE DE NAVIGATION
  // Responsabilité :
  // - Permettre la navigation arrière
  // - Rejouer correctement les rotations
  // =========================================================================
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
    
    static handlePrevious(session) {
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
      //console.log("previousstep",previousStep)
      //console.log("session.rotationQueue before",session.rotationQueue)
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
           // console.log("session.rotationQueue after",session.rotationQueue)
          
        }
        
        session.currentStepId = previousStep.id;
        return previousStep.id;
      }
      // ============================================================================
      // RÉSOLUTION DE LA NAVIGATION
      // Responsabilité :
      // - Initier une rotation
      // - Avancer une rotation
      // - Appliquer les règles de navigation
      // ============================================================================
      // -------------------- NAVIGATION --------------------
      static resolveNextStep(session, survey, currentStep, isInRotation) {
        
        
        const rotationInit = RotationService.initRotation({
          session,
          survey,
          answers: session.answers,
          action: 'next',
          generateQueue: RotationQueueUtils.generateRotationQueue
        });
        console.log('rotationInit next', rotationInit);
        if (rotationInit) return rotationInit.nextStepId;
        
        const rotationAdvance = RotationService.advanceRotation({ session, survey, currentStep, action: 'next' });
        if (rotationAdvance?.nextStepId) return rotationAdvance.nextStepId;
        
        if (rotationAdvance?.fallbackFrom) {
          return NavigationRuleService.resolve(rotationAdvance.fallbackFrom, session.answers[rotationAdvance.fallbackFrom.id], survey.steps);
        }
        
        // return NavigationRuleService.resolve(currentStep, session.answers[currentStep.id], survey.steps);
        return NavigationRuleService.resolve(currentStep, session.answers, survey.steps);  
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
 
  
//   // -------------------- RUN --------------------
//   static async run({ surveyId, action, body, session }) {
//     const userId = 'anonymous';
//     const survey = SurveyService.loadSurvey(surveyId);
//     // Stocker le survey dans le cache de session pour utilisation ultérieure
//     session.surveyCache = survey;
    
//     this.initSession(session);
    
//     const responseId = await this.ensureResponse(surveyId, session, userId);
    
//     const { step: currentStep, wrapper: currentStepWrapper, isInRotation } =
//     RotationService.getCurrentStep(session, survey);
    
//     if (action === 'next') {
//       this.savePageAnswers({ steps: this.getStepsForCurrentPage(survey, currentStep, isInRotation), 
//         wrappers: isInRotation ? [currentStepWrapper] : undefined, 
//         body, 
//         responseId, 
//         session, 
//         isInRotation });
        
//         const isStepValid = ValidationService.validateStep(currentStep, session.answers, currentStepWrapper);
//         if (!isStepValid) return { nextStep: { id: currentStep.id }, validationError: true };
        
//         this.pushCurrentStepToHistory(session, currentStep, isInRotation,currentStepWrapper);
//       }
//       if (action === 'prev') {
//         const prevStepId = this.handlePrevious(session);
//         if (prevStepId) return { nextStep: { id: prevStepId } };
//       }
      
//       const nextStepId = this.resolveNextStep(session, survey, currentStep, isInRotation);
//       if (!nextStepId || nextStepId === 'FIN') return { finished: true };
      
//       session.currentStepId = nextStepId;
      
//       return { nextStep: { id: nextStepId } };
//     }
    
//     // -------------------- Helpers --------------------
//        static initSession(session) {
//       session.answers ??= {};
//       session.rotationQueueDone ??= {};
//       session.history ??= [];
//     }
    
//     static async ensureResponse(surveyId, session, userId) {
//       if (session.responseId) return session.responseId;
//       const response = await ResponseService.createSurveyDocument(surveyId, userId, {});
//       session.responseId = response._id;
//       return session.responseId;
//     }
    
//    static getStepsForCurrentPage(survey, currentStep, isInRotation) {
//       if (!currentStep) return []; // éviter TypeError
      
//       return isInRotation
//       ? [currentStep]
//       : survey.steps.filter(s => s.page === currentStep.page);
//     }
    
//   // -------------------- SAVE PAGE ANSWERS --------------------
//     static savePageAnswers({ steps, wrappers, body, responseId, session, isInRotation }) {
//       steps.forEach((step, i) => {
//         const wrapper = wrappers?.[i];
//         const rawValue = this.getRawValueForStep(step, body);
        
//         if (rawValue === undefined) return;
//         console.log('rawvalue',rawValue)
//         const normalizedRaw = ResponseNormalizer.normalize(step, rawValue, wrapper?.optionIndex);
//         console.log("norlize",normalizedRaw)
        
//         //  Nettoyage : supprimer undefined / null / string vide
//         const normalized = Object.fromEntries(
//           Object.entries(normalizedRaw || {}).filter(([_, v]) =>
//             v !== undefined &&
//           v !== null &&
//           !(typeof v === 'string' && v.trim() === '')
//         )
//       );
      
//       console.log('normalized cleaned', normalized);
/**********************************-------------**********----------***********-------- */
//       const mainValue = this.getMainValue(step, body, rawValue);
//       if (
//         !normalized ||
//         Object.keys(normalized).length === 0 ||
//         mainValue === null ||
//         mainValue === '' ||
//         (Array.isArray(mainValue) && mainValue.length === 0)
//       ) {
//         console.log('⛔ normalized vide → skip save', step.id);
        
//         return;
//       }
//       // 1 Calculer les clés à supprimer AVANT nettoyage
// const keysToDelete = this.computeKeysToDelete(
//   step,
//   session.answers,
//   body
// );

// // 2 Sauvegarder en DB
// ResponseService.addAnswer(responseId, normalized, keysToDelete);
// // 3 Nettoyer la session APRÈS
// this.cleanupSession(step, session, mainValue, body);
//      this.saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation });
//       this.saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers: session.answers });
//       console.log("session answer",session.answers)
//     });
//   }
//    static getRawValueForStep(step, body) {
//     if (['grid', 'accordion', 'single_choice', 'multiple_choice'].includes(step.type)) return body;
//     return body[step.id];
//   }
  
//   static getMainValue(step, body, rawValue) {
//     switch(step.type) {
//       case 'multiple_choice':
//       return Array.isArray(body[step.id]) ? body[step.id].filter(v => v && v.trim() !== '') : [];
//       case 'single_choice': return body[step.id] || '';
//       case 'accordion':
//       case 'grid': return rawValue;
//       default: return rawValue;
//     }
//   }
//  // -------------------- CLEANUP SESSION --------------------
//   static cleanupSession(step, session, mainValue, body) {
//     const sessionAnswers = session.answers;
//     if (!step || !sessionAnswers) return;
//     if (step.type === 'single_choice') {
//       const { sessionKeysToDelete } = this.computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue: mainValue });
//       sessionKeysToDelete.forEach(k => delete sessionAnswers[k]);
//     }
//     if (step.type === 'multiple_choice') {
//       const selectedArray = Array.isArray(mainValue) ? mainValue : [];
//       const oldSelected = Array.isArray(sessionAnswers[step.id]) ? sessionAnswers[step.id] : [];
      
//       // Pour chaque option précédemment sélectionnée mais maintenant désélectionnée
//       oldSelected.forEach(optionCode => {
//         if (!selectedArray.includes(optionCode)) {
//           // Supprimer les sous-questions de cette option dans session
//           const { sessionKeysToDelete } = this.computeSubQuestionKeysToDelete({
//             step,
//             sessionAnswers,
//             oldOptionCode: optionCode
//           });
          
//           sessionKeysToDelete.forEach(k => delete sessionAnswers[k]);
//         }
//       });
//     }
//     // ---- Nouvelle partie ----
//     if (step.repeatFor === undefined && step.id in session.rotationQueueDone) {
//       // reset rotation si question principale modifiée
//       delete session.rotationQueueDone[step.id];
//       delete session.rotationQueue;
//     }
//     // -------------------------
//     this.cleanupSessionPrecisions(step, sessionAnswers, Array.isArray(mainValue) ? mainValue : [mainValue]);
//   }



//  // -------------------- SESSION & DB --------------------
//   static saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation }) {
//     const answerKey = isInRotation && wrapper?.optionIndex !== undefined ? `${step.id}_${wrapper.optionIndex}` : step.id;
//     // Valeur principale
//     session.answers[answerKey] = mainValue;
//     // Fusionner toutes les sous-questions
//     Object.keys(normalized).forEach(dbKey => {
//       if (dbKey === step.id_db) return;// ignorer la clé principale DB
      
//       const parts = dbKey.split('_'); 
//       const codeItem = parts[1]; // code de l'option
//       const subIdDb = parts.slice(2).join('_'); // id_db de la sous-question
//       // Trouver la sous-question correspondante dans le step
//       const subQ = step.options?.flatMap(o => o.subQuestions || [])?.find(sq => sq.id_db === subIdDb);
//       if (!subQ) return;
//       const sessionKey = `${step.id}_${codeItem}_${subQ.id}`;
//       session.answers[sessionKey] = normalized[dbKey];
//     });
//   }
//  // --------------------------------------------------------------------------
//   static saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers }) {
//     if (!step || !rawValue || !sessionAnswers) return;
  
//     // --- SINGLE CHOICE ---
//     if (step.type === 'single_choice') {
//       // Supprimer toutes les précisions existantes de cette question
//       step.options?.forEach(opt => {
//         const key = `${step.id}_pr_${opt.codeItem}`;
//         delete sessionAnswers[key];
//       });
  
//       // Ajouter la précision de l'option sélectionnée
//       const selectedOption = step.options?.find(
//         opt => opt.codeItem?.toString() === mainValue?.toString()
//       );
//       if (selectedOption?.requiresPrecision) {
//         const val = rawValue[`precision_${mainValue}`];
//         if (val?.trim()) {
//           sessionAnswers[`${step.id}_pr_${mainValue}`] = val.trim();
//         }
//       }
//     }
  
//     // --- MULTIPLE CHOICE ---
//     if (step.type === 'multiple_choice' && Array.isArray(mainValue)) {
//       // Supprimer les précisions pour les options qui ne sont plus sélectionnées
//       step.options?.forEach(opt => {
//         const key = `${step.id}_pr_${opt.codeItem}`;
//         if (!mainValue.includes(opt.codeItem?.toString())) {
//           delete sessionAnswers[key];
//         }
//       });
  
//       // Ajouter/mettre à jour les précisions pour les options sélectionnées
//       mainValue.forEach(codeItem => {
//         const val = rawValue[`precision_${step.id}_${codeItem}`];
//         if (val?.trim()) {
//           sessionAnswers[`${step.id}_pr_${codeItem}`] = val.trim();
//         }
//       });
//     }
//   }
//    // ---------------------------------------------------------------------------
//   static computeKeysToDelete(step, sessionAnswers, body) {
//     const newValue = body[step.id];
//     const selectedOptions = 
//     step.type === 'multiple_choice' && Array.isArray(newValue)
//     ? newValue
//     : step.type === 'single_choice' && newValue != null
//     ? [newValue.toString()]
//     : [];
    
//     const keysToDelete = [
//       // Supprimer les précisions qui ne sont plus valides
//       ...this.computePrecisionKeysToDelete(step, sessionAnswers, selectedOptions),
//     ];
    
//     if (step.type === 'single_choice') {
//       // Supprimer les sous-questions de single_choice
//       keysToDelete.push(
//         ...this.computeSubQuestionKeysToDelete({
//           step,
//           sessionAnswers,
//           newValue: body[step.id]
//         }).dbKeysToDelete
//       );
//     }
    
//     if (step.type === 'multiple_choice') {
//       // Supprimer les sous-questions des options désélectionnées
//       const oldSelected = Array.isArray(sessionAnswers[step.id]) ? sessionAnswers[step.id] : [];
//       oldSelected.forEach(optionCode => {
//         if (!selectedOptions.includes(optionCode)) {
//           const { dbKeysToDelete } = this.computeSubQuestionKeysToDelete({
//             step,
//             sessionAnswers,
//             oldOptionCode: optionCode
//           });
//           keysToDelete.push(...dbKeysToDelete);
//         }
//       });
//     }
    
//     return keysToDelete;
//   }
//   // ---------------------------------------------------------------------------
//   static computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue, oldOptionCode }) {
//     const dbKeysToDelete = [], sessionKeysToDelete = [];
//     if (step.type === 'single_choice') {
//       const oldValue = sessionAnswers[step.id];
//       if (!oldValue || oldValue === newValue) return { dbKeysToDelete, sessionKeysToDelete };
      
//       const oldOption = step.options?.find(opt => opt.codeItem?.toString() === oldValue?.toString());
//       if (!oldOption?.subQuestions) return { dbKeysToDelete, sessionKeysToDelete };
      
//       oldOption.subQuestions.forEach(subQ => {
//         dbKeysToDelete.push(`${step.id_db}_${oldValue}_${subQ.id_db}`);
//         sessionKeysToDelete.push(`${step.id}_${oldValue}_${subQ.id}`);
//       });
//     } else if (step.type === 'multiple_choice' && oldOptionCode !== undefined) {
//       const oldOption = step.options?.find(opt => opt.codeItem?.toString() === oldOptionCode?.toString());
//       if (!oldOption?.subQuestions) return { dbKeysToDelete, sessionKeysToDelete };
      
//       oldOption.subQuestions.forEach(subQ => {
//         dbKeysToDelete.push(`${step.id_db}_${oldOptionCode}_${subQ.id_db}`);
//         sessionKeysToDelete.push(`${step.id}_${oldOptionCode}_${subQ.id}`);
//       });
//     }
//     return { dbKeysToDelete, sessionKeysToDelete };
//   }
//  // --------------------------------------------------------------------------
//   static computePrecisionKeysToDelete(step, sessionAnswers, selectedOptions = []) {
//     const keysToDelete = [];
// console.log("selectionoption pr",selectedOptions)
//     Object.keys(sessionAnswers).forEach(key => {
//       if (!key.startsWith(`${step.id}_pr_`)) return;

//       const optionCode = key.replace(`${step.id}_pr_`, '');

//       // SINGLE → supprimer toutes sauf la sélectionnée
//     if (step.type === 'single_choice' && !selectedOptions.includes(optionCode)) {
//       keysToDelete.push(
//         key.replace(`${step.id}_pr_`, `${step.id_db}_pr_`)
//       );
//     }

//     // MULTI → supprimer celles désélectionnées
//     if (
//       step.type === 'multiple_choice' &&
//       !selectedOptions.includes(optionCode)
//     ) {
//       keysToDelete.push(
//         key.replace(`${step.id}_pr_`, `${step.id_db}_pr_`)
//       );
//     }
//   });

//   return keysToDelete;
//   }
//    // --------------------------------------------------------------------------
//   static cleanupSessionPrecisions(step, sessionAnswers, selectedOptions = []) {
//     Object.keys(sessionAnswers).forEach(key => {
//       if (step.type === 'single_choice' && key.startsWith(`${step.id}_pr_`)) delete sessionAnswers[key];
//       if (step.type === 'multiple_choice' && key.startsWith(`${step.id}_pr_`)) {
//         const code = key.replace(`${step.id}_pr_`, '');
//         if (!selectedOptions.includes(code)) delete sessionAnswers[key];
//       }
//     });
//   }
// // -------------------- HISTORIQUE --------------------
//   static pushCurrentStepToHistory(session, step, isRotation,wrapper=null) {
//     if (!step) return;
//     session.history ??= [];
    
//     const last = session.history[session.history.length - 1];
//     if (last?.id === step.id) return; //  empêche doublon
    
//     session.history.push({ 
//       id: step.id, 
//       isRotation: !!isRotation,
//       wrapper: isRotation ? wrapper : null });
//     }
    
//     static handlePrevious(session) {
//       if (!session.history?.length) return null;
      
//       // Retirer la question actuelle si elle correspond
//       let lastIndex = session.history.length - 1;
//       if (session.history[lastIndex].id === session.currentStepId) {
//         session.history.pop();
//         lastIndex--;
//       }
      
//       if (lastIndex < 0) return null;
      
//       const previousStep = session.history[lastIndex];
//       if (!previousStep) return null;
      
//       // Gestion des rotations
//       if (previousStep.isRotation && previousStep.wrapper) {
//         const parentId = previousStep.wrapper.parent;
//         // On récupère TOUTES les rotations du parent
//         const allRotations = RotationQueueUtils.getAllRotationsForParent(session, parentId);
        
//         // On trouve l'index exact de cette instance dans allRotations
//         const rotationIndex = allRotations.findIndex(r => r.id === previousStep.id 
//           && r.optionCode === previousStep.wrapper.optionCode);
          
//           // On remet la rotationQueue à partir de cette instance
//           session.rotationQueue = rotationIndex >= 0 ? allRotations.slice(rotationIndex) : allRotations;
//         } else {
//           delete session.rotationQueue;
//         }
        
//         session.currentStepId = previousStep.id;
//         return previousStep.id;
//       }
//       // -------------------- NAVIGATION --------------------
//       static resolveNextStep(session, survey, currentStep, isInRotation) {
        
        
//         const rotationInit = RotationService.initRotation({
//           session,
//           survey,
//           answers: session.answers,
//           action: 'next',
//           generateQueue: RotationQueueUtils.generateRotationQueue
//         });
//         if (rotationInit) return rotationInit.nextStepId;
        
//         const rotationAdvance = RotationService.advanceRotation({ session, survey, currentStep, action: 'next' });
//         if (rotationAdvance?.nextStepId) return rotationAdvance.nextStepId;
        
//         if (rotationAdvance?.fallbackFrom) {
//           return NavigationRuleService.resolve(rotationAdvance.fallbackFrom, session.answers[rotationAdvance.fallbackFrom.id], survey.steps);
//         }
        
//         // return NavigationRuleService.resolve(currentStep, session.answers[currentStep.id], survey.steps);
//         return NavigationRuleService.resolve(currentStep, session.answers, survey.steps);
        
        
//       }
//     }   