//survey.routes.js
// -----------------gestion du questionnaire-----------------
import express from 'express';
import SurveyService from '../services/SurveyService.js';
import AutoCompleteUtils from '../services/AutoCompleteUtils.js';
import AccordionUtils from '../services/AccordionUtils.js';
import Response from '../models/Response.js';
import path from 'path';
import ExcelService from '../services/ExcelService.js';


const router = express.Router();
// Route pour générer le fichier Excel et le télécharger
router.get('/:surveyId/download', async (req, res) => {
  const { surveyId } = req.params;

  try {
    const responses = await Response.find({ surveyId });
    const surveyFile = path.resolve(`./backend/data/${surveyId}.json`);
    const outputFile = path.resolve(`./backend/data/${surveyId}_responses.xlsx`);
    console.log("Fichier survey:", surveyFile);

    await ExcelService.generateExcelWide(responses, surveyFile, outputFile);

    // Télécharger le fichier
    res.download(outputFile);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur génération Excel');
  }
});

router.get('/:surveyId/end', (req, res) => {
  const { surveyId } = req.params;
  const survey = SurveyService.loadSurvey(surveyId);
  const firstStepId = survey.steps[0].id;

  const step = { type: 'end', id: 'end', title: 'Fin du questionnaire' };

  // Rendu du contenu du end.mustache
  // On injecte l'URL de téléchargement du fichier Excel
  res.render('end', { 
    surveyId, 
    firstStepId,
    downloadUrl: `/survey/${surveyId}/download` 
  }, (err, html) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur lors du rendu de la page de fin');
    }

    // Injecte le HTML de la page de fin dans le layout
    res.render('layout', { survey, step, content: html });
  });
});


// Route pour afficher les questions
router.get('/:surveyId/:stepId', async (req, res, next) => {
  if (req.params.stepId === 'end') return next(); // passe à la route /end

  const { surveyId, stepId } = req.params;
  const responseId = req.query.responseId;
  const userId = req.query.userId || 'anonymous';

  const survey = SurveyService.loadSurvey(surveyId);
let step = SurveyService.getStep(survey, stepId);
  if (!step) return res.status(404).send('Question introuvable');

  let options = [];
  if (step.type === 'autocomplete') {
    options = AutoCompleteUtils.getAutocompleteOptions(step);
  }

if (step.type === 'grid') {
  step = SurveyService.prepareGridB(step);
  console.log('gridB',step)
}

 //  Préparation des flags pour le step
if (step.type === 'accordion' && Array.isArray(step.sections)) {
  step.sections = step.sections.map(section => ({
    ...section,
    questions: section.questions.map(q => AccordionUtils.prepareQuestionFlags(q))
  }));
} else {
  step = AccordionUtils.prepareQuestionFlags(step);
}
  res.render(`questions/${step.type}`, { survey, step, options, responseId }, (err, html) => {
    if (err) {
      console.log("step err",err)
      return res.status(500).send(err.message);}

    res.render('layout', { survey, step, content: html });
  });
});





export default router;