import SurveyService from '../services/SurveyService.js';
import AutoCompleteUtils from '../services/AutoCompleteUtils.js';
import AccordionUtils from '../services/AccordionUtils.js';
import AnswerPrefillUtils from '../services/AnswerPrefillUtils.js';
import Response from '../models/Response.js';
import path from 'path';
import ExcelService from '../services/ExcelService.js';
import fs from 'fs';
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
  
  // Charger le contenu dynamique depuis un fichier JSON
  let endContent = [];
  try {
    const filePath = path.resolve(`./backend/data/${surveyId}_endcontent.json`);
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, 'utf-8');
      endContent = JSON.parse(fileData).endContent || [];
    } else return;
  } catch (err) {
    console.error("Erreur lecture endContent.json :", err);
  }
   // Préparer les flags pour Mustache
   endContent = endContent.map(item => ({
    ...item,
    isText: item.type === "text",
    isButton: item.type === "button",
    isHtml: item.type === "html"
  }));
  
  const step = { type: 'end', id: 'end', title: 'Fin du questionnaire' };
  
  res.render('end', { 
    surveyId,
    endContent,  // <-- ici on passe le tableau dynamique
    survey
   // restartUrl: `/survey/${surveyId}/run`,
   // downloadUrl: `/survey/${surveyId}/download`
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

  // pages existantes triées
  const pages = [...new Set(
    survey.steps
      .filter(s => s.page !== undefined)
      .map(s => s.page)
  )].sort((a, b) => a - b);

  const isFirstPage = currentPage === pages[0];

  const stepsOnPage = getStepsForPage(req, survey, currentPage);
  
  const options = [];
  const preparedSteps = prepareSteps(stepsOnPage, req.session.answers, options,req.session.rotationQueue || []);
  renderSurveyPage(res, survey, currentPage, preparedSteps, options,isFirstPage);
};








/** ---------- Fonctions utilitaires ---------- **/
function prepareStepsWithPrecisionKey(steps) {
  return steps.map(step => {
    if (!step.options) return step;

    const newOptions = step.options.map(option => ({
      ...option,
      precisionKey: `${step.id}_${option.codeItem}`, // clé calculée
      requiresPrecision: option.requiresPrecision || false // assure que la clé existe
    }));

    return { ...step, options: newOptions };
  });
}

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
    //  randomiser les options si ordre_aleatoire === true ---
    if (step.options && step.ordre_aleatoire) {
      step.options = shuffleArray(step.options);
    }
    return SurveyService.prepareStepForPage(step);
  });
}
// Fonction utilitaire de mélange Fisher–Yates
function shuffleArray(array) {
  const arr = [...array]; // copie pour ne pas modifier l'original
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
function renderSurveyPage(res, survey, page, steps, options,isFirstPage) {

    // calculer precisionKey
    const stepsWithPrecision = prepareStepsWithPrecisionKey(steps);
//console.log("stepsWithPrecision",stepsWithPrecision)
//console.log("tt",JSON.stringify(stepsWithPrecision, null, 2));

  res.render('questions/page', { survey, 
    steps: stepsWithPrecision,
     options,isFirstPage}, (err, html) => {
    if (err) return res.status(500).send('Erreur rendu page');
    
    res.render('layout', {
      survey,
      step: { id: `page-${page}`, type: 'page', title: survey.title },
      content: html,
      isFirstPage
    });
  });
}
