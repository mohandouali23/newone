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

  static getNextStep(survey, step, answerValue) {
    const next = NavigationRuleService.resolve(
      step,
      answerValue,
      survey.steps
    );

    if (next === 'FIN') return null;
    return next;
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

  static prepareGrid(step) {
    step.columns = step.columns.map(col => ({
      ...col,
      isMultipleChoice: col.type === 'multiple_choice',
      isSingleChoice: col.type === 'single_choice',
      options: col.options || []
    }));
  
    return step;
  }

  static prepareGridB(step, existingAnswer = null) {
    if (!Array.isArray(step.questions) || !Array.isArray(step.reponses)) return step;
  
    step.questions = step.questions.map(row => {
      const columns = step.reponses.map(col => {
        const input = col.input || {};
        const isRadio = input.type === 'radio';
        const isCheckbox = input.type === 'checkbox';
  
        let name;
        let value;
        let checked = false;
  
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
