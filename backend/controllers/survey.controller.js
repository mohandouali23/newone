import SurveyService from '../services/SurveyService.js';
import AutoCompleteUtils from '../services/AutoCompleteUtils.js';
import AccordionUtils from '../services/AccordionUtils.js';
import AnswerPrefillUtils from '../services/AnswerPrefillUtils.js';
import Response from '../models/Response.js';
import path from 'path';
import ExcelService from '../services/ExcelService.js';

export const downloadSurveyResponses = async (req, res) => {
  const { surveyId } = req.params;
  try {
    const responses = await Response.find({ surveyId });
    const surveyFile = path.resolve(`./backend/data/${surveyId}.json`);
    const outputFile = path.resolve(`./backend/data/${surveyId}_responses.xlsx`);
    await ExcelService.generateExcelWide(responses, surveyFile, outputFile);
    res.download(outputFile);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur génération Excel');
  }
};

export const endSurvey = (req, res) => {
  const { surveyId } = req.params;
  const survey = SurveyService.loadSurvey(surveyId);
  
  req.session.destroy(err => {
    if (err) console.error('Erreur destruction session:', err);
  });
  
  const step = { type: 'end', id: 'end', title: 'Fin du questionnaire' };
  
  res.render('end', { 
    surveyId,
    restartUrl: `/survey/${surveyId}/run`,
    downloadUrl: `/survey/${surveyId}/download`
  }, (err, html) => {
    if (err) return res.status(500).send('Erreur rendu page de fin');
    res.render('layout', { survey, step, content: html });
  });
};

/**
* Contrôleur principal pour afficher une page de questionnaire
*/
export const runSurveyPage = (req, res) => {
  const { surveyId } = req.params;
  const survey = SurveyService.loadSurvey(surveyId);
  
    // Récupérer dynamiquement le logo
    if (survey.logoName) {
      survey.logo = SurveyService.getLogoUrl(survey.logoName);
    }
  initSession(req);
  
  const currentStep = getCurrentStep(req, survey);
  if (!currentStep) return res.redirect(`/survey/${surveyId}/end`);
  
  const currentPage = currentStep.page;
  const stepsOnPage = getStepsForPage(req, survey, currentPage);
  
  const options = [];
  const preparedSteps = prepareSteps(stepsOnPage, req.session.answers, options,req.session.rotationQueue || []);
  renderSurveyPage(res, survey, currentPage, preparedSteps, options);
};








/** ---------- Fonctions utilitaires ---------- **/

// Initialiser la session answers si vide
function initSession(req) {
  if (!req.session.answers) req.session.answers = {};
}

// Récupérer l'étape courante (currentStepId)
function getCurrentStep(req, survey) {
  if (!req.session.currentStepId) {
    const firstStep = survey.steps
    .filter(s => s.page !== undefined)
    .sort((a, b) => a.page - b.page)[0];
    req.session.currentStepId = firstStep.id;
  }
  return survey.steps.find(step => step.id === req.session.currentStepId);
}

// Récupérer les steps à afficher pour une page ou rotation
function getStepsForPage(req, survey, page) {
  if (Array.isArray(req.session.rotationQueue) && req.session.rotationQueue.length > 0) {
    return [req.session.rotationQueue[0].step];
  }
  return survey.steps.filter(step => step.page === page);
}

// Préparer chaque step : grid, autocomplete, accordion + pré-remplissage
function prepareSteps(steps, sessionAnswers, options, rotationQueue = []) {
  return steps.map(step => {
    
    const rotationItem = rotationQueue.find(r => r.step.id === step.id);
    if (rotationItem) {
      step.wrapper = {
        id: rotationItem.id,
        parent: rotationItem.parent,
        optionCode: rotationItem.optionCode,
        optionIndex: rotationItem.optionIndex,
        optionLabel: rotationItem.optionLabel
      };
      //step.wrapper = rotationItem;
      //console.log('  step.wrapper = rotationItem',rotationItem)
      if (step.wrapper.optionIndex === undefined && step.wrapper.optionCode !== undefined) {
        step.wrapper.optionIndex = step.wrapper.optionCode;
      }
    }
    
    // Préparer selon le type
    
    if (step.type === 'grid') {
      const existingAnswer = sessionAnswers[step.id]?.value;
      step = SurveyService.prepareGridB(step, existingAnswer);
    } 
    if (step.type === 'autocomplete') options.push(...AutoCompleteUtils.getAutocompleteOptions(step));
    if (step.type === 'accordion') prepareAccordion(step);
    
    prefillStep(step, sessionAnswers);
    // ---- Rotation : si step a un wrapper (dans rotation) ----
    if (step.wrapper) {
      prefillRotationStep(step, sessionAnswers);
    }
    return SurveyService.prepareStepForPage(step);
  });
}

// Préparer les sections/questions d'un accordion
function prepareAccordion(step) {
  step.sections = step.sections.map(section => ({
    ...section,
    questions: section.questions.map(q => AccordionUtils.prepareQuestionFlags(q))
  }));
}

// Pré-remplir les réponses selon le type
function prefillStep(step, sessionAnswers) {
  if (typeof AnswerPrefillUtils[step.type] === 'function') {
    AnswerPrefillUtils[step.type](step, sessionAnswers);
  }
}
function prefillRotationStep(step, sessionAnswers) {
  if (!step.wrapper) return;
  const indexOrCode = step.wrapper.optionIndex ?? step.wrapper.optionCode;
  const rotationKey = `${step.id}_${indexOrCode}`; // ex: q3_2_1
  if (typeof AnswerPrefillUtils[step.type] === 'function') {
    // Appeler le pré-remplissage comme pour une question normale
    AnswerPrefillUtils[step.type](step, sessionAnswers, rotationKey);
  }
  // Copier éventuellement les réponses existantes dans la session
  if (sessionAnswers[rotationKey] !== undefined) {
    step.prefilledValue = sessionAnswers[rotationKey];
  }
}

// Rendu final de la page
function renderSurveyPage(res, survey, page, steps, options) {
  res.render('questions/page', { survey, steps, options }, (err, html) => {
    if (err) return res.status(500).send('Erreur rendu page');
    
    res.render('layout', {
      survey,
      step: { id: `page-${page}`, type: 'page', title: survey.title },
      content: html
    });
  });
}
