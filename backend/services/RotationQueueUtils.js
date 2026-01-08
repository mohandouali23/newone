
export default class RotationQueueUtils {
  
  
  static generateRotationQueue(survey, mainQuestionId, answers) {
    const mainStep = survey.steps.find(s => s.id === mainQuestionId);
    if (!mainStep) return [];
    
    const selectedOptions = answers[mainQuestionId];
    if (!selectedOptions) return [];
    
    // Si c'est multiple_choice, transformer en array
    const selectedArray = Array.isArray(selectedOptions)
    ? selectedOptions.map(Number)
    : selectedOptions.toString().split('/').map(Number);
    
    /* ==========================================
    1 Vérifier option exclusive
    ========================================== */
    const hasExclusive = selectedArray.some(code => {
      const opt = mainStep.options.find(o => o.codeItem === code);
      return opt?.exclusive === true;
    });
    if (hasExclusive) {
      return [];
    }
    
    const rotationQueue = [];
    
    // Récupérer toutes les sous-questions qui dépendent de la question principale
    const subSteps = survey.steps.filter(s => s.repeatFor === mainQuestionId);
    
    // Pour chaque option sélectionnée dans la principale
    selectedArray.forEach((optionCode, index) => {
      const optionObj = mainStep.options.find(o => o.codeItem === optionCode);
      
      if (!optionObj) return;
      
      subSteps.forEach(subStep => {
        //  Cloner la step pour ne pas écraser l’original
        const stepClone = { ...subStep };
        
        //  Remplacer TRANSPORT par le label réel
        stepClone.label = stepClone.label.replace("TRANSPORT", optionObj.label);
        
        // Copier la step et ajouter contexte
        rotationQueue.push({
          id: subStep.id,
          parent: mainQuestionId,
          optionCode: optionObj.codeItem,
          optionLabel: optionObj.label,
          optionIndex: optionObj.codeItem,  //  index pour suffixe
          step: stepClone // conserve toute la structure originale si besoin
        });
      });
    });
    
    return rotationQueue;
  }
  //  Fonction pour prev sur rotation
  static getStepWrapperById(session, stepId) {
    if (!session.rotationQueue) return null;
    return session.rotationQueue.find(wrapper => wrapper.step.id === stepId) || null;
  }
  // NOUVELLE FONCTION MANQUANTE
  static getAllRotationsForParent(session, parentId) {
    if (!session.surveyCache) {
      console.warn('surveyCache non disponible dans la session');
      return [];
    }
    
    // Pour recréer la rotationQueue complète, on a besoin:
    // 1. Du survey (peut être stocké dans session.surveyCache)
    // 2. De la réponse à la question parent (session.answers[parentId])
    // 3. De générer la queue complète
    
    const survey = session.surveyCache;
    if (!survey) {
      console.warn('Survey non trouvé dans le cache');
      return [];
    }
    const answers = session.answers;
    
    // Régénérer la rotationQueue complète comme à l'initialisation
    return this.generateRotationQueue(survey, parentId, answers);
  }
  
  // Alternative si vous n'avez pas session.surveyCache
  static getRotationQueueFromHistory(session, parentId) {
    // Récupérer toutes les rotations pour ce parent depuis l'history
    const rotationHistory = session.history
    .filter(h => h.isRotation && h.wrapper?.parent === parentId)
    .map(h => h.wrapper);
    
    return rotationHistory;
  }
}
