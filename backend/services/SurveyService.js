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
}
