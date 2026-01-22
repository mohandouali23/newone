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
import PrecisionUtils from './precisionUtils.js';

const ResponseService =
process.env.MODE_TEST === 'true'
? MockResponseService
: RealResponseService;

export default class BSurveyRunService {
  
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
        
        const isStepValid = ValidationService.validateStep(currentStep, session.answers, currentStepWrapper);
        
        if (!isStepValid) {
          // Récupérer les messages de validation
          const messages = ValidationService.getMissingMessages(currentStep, session.answers, currentStepWrapper);
          const invalidFields =
          ValidationService.getInvalidFields(
            currentStep,
            session.answers,
            currentStepWrapper
          );
          // Retourner l’erreur au frontend
          return {
            success: false,
            validationError: true,
            messages, // tableau de strings
            invalidFields,
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
        
        console.log("rawValue",rawValue)
        
        const normalizedRaw = ResponseNormalizer.normalize(step, rawValue, wrapper?.optionIndex);
        console.log("norlize",normalizedRaw)
        
        const normalized = Object.fromEntries(
          Object.entries(normalizedRaw || {}).filter(([_, v]) =>
            v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')
        )
      );
      console.log("normalized after clean ",normalized)
      let mainValue = this.getMainValue(step, body, rawValue);
      console.log("mainnnnn value",mainValue)
      
      const previousSelected = session.answers[step.id]; // ex: '7'
      const oldOptionCode = Array.isArray(previousSelected) ? previousSelected[0] : previousSelected;
      const keysToDelete = await this.computeKeysToDelete(step, rawValue, mainValue,oldOptionCode,session,previousSelected);
      
      // --- 2. Nettoyer la session et ajouter d’autres clés à supprimer si nécessaire ---
      await this.cleanupSession(step, session, mainValue, previousSelected);
      
      // --- 3. Enregistrer en DB ---
      await ResponseService.addAnswer(responseId, normalized, keysToDelete);
      
      // Recalculer mainValue après cleanup
      if (step.type === 'multiple_choice') mainValue = Array.isArray(mainValue) ? mainValue : [];
      
      this.saveStepPrecisions({ step, rawValue, mainValue, sessionAnswers: session.answers });
      this.saveSessionAnswers({ step, normalized, mainValue, session, wrapper, isInRotation });
      console.log("session answer", session.answers);
      
    }
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
  static normalizeSelected(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value.map(String) : [String(value)];
  }
  
  static computeDeselected(previousSelected, mainValue) {
    const prev = this.normalizeSelected(previousSelected);
    const next = this.normalizeSelected(mainValue);
    return prev.filter(v => !next.includes(v));
  }
  
  // ============================================================================
  // NETTOYAGE DE SESSION
  // Responsabilité :
  // - Supprimer anciennes sous-questions
  // - Réinitialiser rotations si nécessaire
  // - Nettoyer les précisions obsolètes
  
  // ============================================================================
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
  
  // -------------------- CLEANUP SESSION --------------------
  // static async cleanupSession(step, session, mainValue, previousSelected = []) {
  //   const sessionAnswers = session.answers;
  //   if (!step || !sessionAnswers) return;
    // if (step.type === 'single_choice') {
    //   const { sessionKeysToDelete } = this.computeSubQuestionKeysToDelete({ step, sessionAnswers, newValue: mainValue });
    //   sessionKeysToDelete.forEach(k => delete sessionAnswers[k]);
    // }
    // if (step.type === 'multiple_choice') {
    //   const selectedArray = Array.isArray(mainValue) ? mainValue : [];
    //   const oldSelected = Array.isArray(sessionAnswers[step.id]) ? sessionAnswers[step.id] : [];
    
    //   // Pour chaque option précédemment sélectionnée mais maintenant désélectionnée
    //   previousSelected.forEach(optionCode => {
      //     if (!selectedArray.includes(optionCode)) {
    //       // Supprimer les sous-questions de cette option dans session
    //       const { sessionKeysToDelete } = this.computeSubQuestionKeysToDelete({
    //         step,
    //         sessionAnswers,
    //         oldOptionCode: optionCode
    //       });
    
    //       sessionKeysToDelete.forEach(k => delete sessionAnswers[k]);
    //     }
    //   });
    // }
    
    // // ---- ROTATION CLEANUP ----
    // if (step.rotationTemplate?.length) {
      
      
    //   const newSelected = Array.isArray(mainValue) ? mainValue : [];
    //   console.log("cleanupsession newSelected ",newSelected)
    //   const hasChanged =
    //   previousSelected.length !== newSelected.length ||
    //   previousSelected.some(v => !newSelected.includes(v));
      
    //   if (hasChanged) {
    //     // const { dbKeysToDelete, sessionKeysToDelete } =
    //     // this.computeRotationKeysToDelete({
    //     //   step,
    //     //   sessionAnswers,
    //     //   previousSelected,
    //     //   allSteps: session.surveyCache.steps
    //     // });
    //     const { dbKeysToDelete, sessionKeysToDelete } =
    //     this.computeRotationKeysToDelete({
    //       step,
    //       mainValue,
    //       previousSelected,
    //       allSteps: session.surveyCache.steps
    //     });
        
    //     //  DB
    //     if (dbKeysToDelete.length) {
    //       await ResponseService.deleteAnswers(session.responseId, dbKeysToDelete);
    //     }
        
    //     //  Session
    //     //sessionKeysToDelete.forEach(k => delete session.answers[k]);
        
    //     sessionKeysToDelete.forEach(k => {
    //       Object.keys(session.answers).forEach(sessionKey => {
    //         if (sessionKey.startsWith(k)) {
    //           delete session.answers[sessionKey];
    //         }
    //       });
    //     });
    //     // Indique que la rotation doit être relancée si on revient sur ce parent
    //     session.rotationState ??= {};
    //     session.rotationState[step.id] = { needsRefresh: true };
        
    //     // reset rotation state
    //     delete session.rotationQueue;
    //     delete session.rotationQueueDone[step.id];
        
    //   }
    // }
    //this.cleanupSessionPrecisions(step, sessionAnswers, Array.isArray(mainValue) ? mainValue : [mainValue]);
 // }
  
  
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
  
  // ---------------------------------------------------------------------------
  // CALCUL DES CLÉS À SUPPRIMER EN BASE DE DONNÉES
  // Responsabilité :
  // - Identifier les réponses obsolètes
  // - Gérer la suppression des précisions
  // - Gérer la suppression des sous-questions
  // ---------------------------------------------------------------------------
  
  static async computeKeysToDelete(step, rawValue, mainValue, oldOptionCode = undefined,session,previousSelected = []) {
    const keysToDelete = [];
    
    const isEmpty = v =>
      v === undefined ||
    v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0);
    
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
          console.log("cleanupsession newSelected ",newSelected)
          const hasChanged =
          previousSelected.length !== newSelected.length ||
          previousSelected.some(v => !newSelected.includes(v));
          
          if (hasChanged) {
            // const { dbKeysToDelete, sessionKeysToDelete } =
            // this.computeRotationKeysToDelete({
            //   step,
            //   sessionAnswers,
            //   previousSelected,
            //   allSteps: session.surveyCache.steps
            // });
            const { dbKeysToDelete, sessionKeysToDelete } =
            this.computeRotationKeysToDelete({
              step,
              mainValue,
              previousSelected,
              allSteps: session.surveyCache.steps
            });
            
            //  DB
            if (dbKeysToDelete.length) {
              await ResponseService.deleteAnswers(session.responseId, dbKeysToDelete);
            }
            
            //  Session
            //sessionKeysToDelete.forEach(k => delete session.answers[k]);
            
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
    // 4. PRECISIONS (_pr_) — APPEL DE LA FONCTION
    const precisionKeys = this.computePrecisionKeysToDelete(step, mainValue);
    keysToDelete.push(...precisionKeys);
    
    // 5. SOUS-QUESTIONS (subQuestions)
    if (oldOptionCode !== undefined) {
      const { dbKeysToDelete: subKeys } = this.computeSubQuestionKeysToDelete({ step, mainValue, oldOptionCode });
      keysToDelete.push(...subKeys);
    }
    return keysToDelete;
  }
  
  
  // static computeRotationKeysToDelete({ step,sessionAnswers, previousSelected = [], allSteps }) {
  //   const dbKeysToDelete = [];
  //   const sessionKeysToDelete = [];
  
  //   previousSelected.forEach(optionCode => {
    //     // Keys de session
  //     Object.keys(sessionAnswers).forEach(sessionKey => {
    //       if (sessionKey.includes(`_${optionCode}`) && sessionKey.startsWith(`${step.id}_`)) {
  //         sessionKeysToDelete.push(sessionKey);
  //       }
  //     });
  
  //     // Keys de DB
  //     if (step.rotationTemplate?.length) {
  //       step.rotationTemplate.forEach(rotId => {
    //         const rotStep = allSteps.find(s => s.id === rotId);
  //         if (rotStep?.id_db) {
  //           dbKeysToDelete.push(`${rotStep.id_db}_${optionCode}`);
  //         }
  //       });
  //     } else if (step.id_db) {
  //       dbKeysToDelete.push(`${step.id_db}_${optionCode}`);
  //     }
  //   });
  
  //   return {
  //     dbKeysToDelete: [...new Set(dbKeysToDelete)],
  //     sessionKeysToDelete: [...new Set(sessionKeysToDelete)]
  //   };
  // }
  
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
      
      // --------------------
      // SESSION KEYS
      // --------------------
      // Toutes les clés enfants générées par rotation
      sessionKeysToDelete.push(`${step.id}_${optionCode}`);
      
      // --------------------
      // DB KEYS
      // --------------------
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
  
  
  // ==========================================================
  // Supprimer les clés de sous-questions pour option désélectionnée
  // ==========================================================
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
  
  // ---------------------------------------------------------------------------
  // GESTION DES PRÉCISIONS À SUPPRIMER (DB)
  // Responsabilité :
  // - Supprimer les champs de précision devenus invalides
  // --------------------------------------------------------------------------
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
        console.log("-> Precision key to delete:", dbPrKey);
      } else {
        console.log("-> Precision key kept:", dbPrKey);
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
      // Gestion des rotations
      if (previousStep.isRotation && previousStep.wrapper) {
        const parentId = previousStep.wrapper.parent;
        
        //  Réinitialiser le flag de rotation terminée
        if (session.rotationQueueDone?.[parentId]) {
          delete session.rotationQueueDone[parentId];
        }
        
        // Réinitialiser l'état de rotation
        if (session.rotationState?.[parentId]) {
          // Conserver seulement si la réponse n'a pas changé
          const currentAnswer = session.answers[parentId];
          const originalAnswer = session.rotationState[parentId].originalAnswer;
          
          if (JSON.stringify(currentAnswer) !== JSON.stringify(originalAnswer)) {
            delete session.rotationState[parentId];
          }
        }
        
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
        
        return navigationTarget;
      }
      
    }