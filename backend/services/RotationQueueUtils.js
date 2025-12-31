
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
  
      //console.log("selected",selectedArray)

      /* ==========================================
     1 Vérifier option exclusive
     ========================================== */
  const hasExclusive = selectedArray.some(code => {
   // console.log("code",code)
    const opt = mainStep.options.find(o => o.codeItem === code);
    //console.log("opt",opt)
    return opt?.exclusive === true;
  });
 // console.log("exclusive",hasExclusive)
  if (hasExclusive) {
    //console.log(' Option exclusive détectée → pas de rotation');
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
          optionIndex: index + 1,  //  index pour suffixe
          step: stepClone // conserve toute la structure originale si besoin
        });
      });
    });

    return rotationQueue;
  }
  

  }
  