import fs from 'fs';
import path from 'path';
import NavigationRuleService from './NavigationRuleService.js';

export default class SurveyService {

  static loadSurvey(surveyId) {
    const filePath = path.resolve(`backend/data/${surveyId}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  static getStep(survey, stepId) {
    return survey.steps.find(s => s.id === stepId);
  }

  // static getNextStep(survey, step, answerValue) {
  //   const next = NavigationRuleService.resolve(
  //     step,
  //     answerValue,
  //     survey.steps
  //   );

  //   if (next === 'FIN') return null;
  //   return next;
  // }

  static loadTable(tableName) {
    try {
      const filePath = path.resolve(`backend/data/${tableName}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data[tableName] || [];
    } catch (e) {
      console.error(`Impossible de charger la table ${tableName}`, e);
      return [];
    }
  }



  static prepareGridB(step, existingAnswer = null) {
    if (!Array.isArray(step.questions) || !Array.isArray(step.reponses)) return step;
  
    step.questions = step.questions.map(row => {
      const columns = step.reponses.map(col => {
        const input = col.input || {};
        const isRadio = input.type === 'radio';
        const isCheckbox = input.type === 'checkbox';
  
       //  NOUVEAU : état de la cellule
      const cellConfig = row.cells?.[col.id];
      const enabled = cellConfig?.enabled !== false;

      let name = null;
      let value = null;
      let checked = false;

       //  cellule désactivée → rien à préparer
       if (!enabled) {
        return {
          ...col,
          rowId: row.id,
          colId: col.id,
          enabled: false,
          isRadio,
          isCheckbox
        };
      }
  
        // RADIO
        if (isRadio) {
          if (input.axis === 'column') {
            // 1 réponse par colonne
            name = `value[${col.id}]`;
            value = row.id;
  
            if (existingAnswer?.[col.id]?.value === row.id) {
              checked = true;
            }
          }
  
          if (input.axis === 'row') {
            // 1 réponse par ligne
            name = `value[${row.id}]`;
            value = col.id;
  
            if (existingAnswer?.[row.id] === col.id) {
              checked = true;
            }
          }
        }
  
        // CHECKBOX
        if (isCheckbox) {
          name = `value[${row.id}][${col.id}][]`;
          value = row.id;
  
          if (
            Array.isArray(existingAnswer?.[col.id]) &&
            existingAnswer[col.id].some(v => v.value === row.id)
          ) {
            checked = true;
          }
        }
  
        return {
          ...col,
          rowId: row.id,
          colId: col.id,
          enabled, 
          isRadio,
          isCheckbox,
          name,
          value,
          checked
        };
      });
  
      return {
        ...row,
        columns
      };
    });
  
    return step;
  }
  
  static generateRotationQueue(survey, mainQuestionId, answers) {
    const mainStep = survey.steps.find(s => s.id === mainQuestionId);
    if (!mainStep) return [];

    const selectedOptions = answers[mainQuestionId];
    if (!selectedOptions) return [];

    // Si c'est multiple_choice, transformer en array
    const selectedArray = Array.isArray(selectedOptions)
      ? selectedOptions
      : [selectedOptions];


    const rotationQueue = [];

    // Récupérer toutes les sous-questions qui dépendent de la question principale
    const subSteps = survey.steps.filter(s => s.repeatFor === mainQuestionId);

    // Pour chaque option sélectionnée dans la principale
    selectedArray.forEach((optionCode, index) => {
      const optionObj = mainStep.options.find(o => o.codeItem.toString() === optionCode.toString());

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
