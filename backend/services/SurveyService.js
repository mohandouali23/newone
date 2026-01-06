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

  static resolveNextStep({ survey, step, answers }) {
    if (!step) return null;
  
    const answerValue = answers[step.id];
  
    const nextStepId = NavigationRuleService.resolve(
      step,
      answerValue,
      survey.steps
    );
  
    if (!nextStepId || nextStepId === 'FIN') {
      return null;
    }
  
    return nextStepId;
  }
  
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
// ------------------ Utilitaire : récupérer steps par page ------------------
static prepareStepForPage(step) {
  // Flags pour Mustache
  step.type_text = step.type === 'text';
  step.type_single_choice = step.type === 'single_choice';
  step.type_multiple_choice = step.type === 'multiple_choice';
  step.type_spinner = step.type === 'spinner';
  step.type_autocomplete = step.type === 'autocomplete';
  step.type_grid = step.type === 'grid';
  step.type_accordion = step.type === 'accordion';

  if (step.options) {
    step.options = step.options.map(option => {
      option.hasSubQuestions =
        Array.isArray(option.subQuestions) && option.subQuestions.length > 0;
  
      option.showSubQuestions = option.isSelected === true;
  
      if (option.hasSubQuestions) {
        option.subQuestions = option.subQuestions.map(q => {
          //  sécuriser tous les champs obligatoires
          if (!q || !q.id || !q.type) return null;
  
          return {
            id: q.id,
            type: q.type,
            label: q.label || '',
            placeholder: q.placeholder || '',
            options: q.options || [],
            value: q.value || '',
  
            parentOption: option.codeItem,
  
            // flags pour accQuestion.mustache
            isText: q.type === 'text',
            isSingleChoice: q.type === 'single_choice',
            isMultipleChoice: q.type === 'multiple_choice',
            isSpinner: q.type === 'spinner'
          };
        }).filter(Boolean); // supprimer les sous-questions null
      
        if (step.options) {
          step.options.forEach(opt => {
            if (opt.subQuestions) {
              opt.subQuestions.forEach(subQ => {
                if (!subQ.id || !subQ.type || !subQ.label) {
                  console.warn('Sous-question invalide détectée:', subQ);
                }
              });
            }
          });
        }
        
      }
  
      return option;
    });
  }
  
  return step;
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
          // name = `value[${row.id}][${col.id}][]`;
          // value = row.id;
          name = `value[${row.id}][]`;
          value = col.id;

          checked =
          Array.isArray(existingAnswer?.[row.id]) &&
          existingAnswer[row.id].includes(col.id);
      }
  //1 // On vérifie uniquement la ligne et la colonne correspondantes
  // if (
  //   existingAnswer?.[row.id]?.[col.id] &&
  //   Array.isArray(existingAnswer[row.id][col.id]) &&
  //   existingAnswer[row.id][col.id].includes(row.id)
  // ) {
  //   checked = true;
  // }
          //2 if (
          //   Array.isArray(existingAnswer?.[col.id]) &&
          //   existingAnswer[col.id].some(v => v.value === row.id)
          // ) {
          //   checked = true;
          // }
        //}
  
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
  
}
