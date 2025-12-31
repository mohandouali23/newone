//survey.routes.js
// -----------------gestion du questionnaire-----------------
import express from 'express';
import SurveyService from '../services/SurveyService.js';
import AutoCompleteUtils from '../services/AutoCompleteUtils.js';
import AccordionUtils from '../services/AccordionUtils.js';
import Response from '../models/Response.js';
import path from 'path';
import ExcelService from '../services/ExcelService.js';
import ResponseService from '../services/ResponseService.js';

const router = express.Router();

// ------------------ Télécharger Excel ------------------
router.get('/:surveyId/download', async (req, res) => {
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
});
// ------------------ Page de fin ------------------
router.get('/:surveyId/end', (req, res) => {
  const { surveyId } = req.params;
  const survey = SurveyService.loadSurvey(surveyId);

  // Nettoyer la session (fin de parcours)
  req.session.destroy(err => {
    if (err) console.error('Erreur destruction session:', err);
  });
console.log("sessiondestroy")
  const step = { type: 'end', id: 'end', title: 'Fin du questionnaire' };

  res.render('end', { 
    surveyId,
    restartUrl: `/survey/${surveyId}/run`,
    downloadUrl: `/survey/${surveyId}/download`
  }, (err, html) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur lors du rendu de la page de fin');
    }

    res.render('layout', { survey, step, content: html });
  });
});



// Route pour gérer le bouton Précédent
router.get('/:surveyId/prev', async (req, res) => {
  const { surveyId } = req.params;
  const survey = SurveyService.loadSurvey(surveyId);

  if (!req.session.pageNumber) {
    req.session.pageNumber = 1;
  }

  const pages = [...new Set(survey.steps.map(s => s.page))].sort((a, b) => a - b);
  const index = pages.indexOf(req.session.pageNumber);

  // Aller à la page précédente
  req.session.pageNumber = pages[Math.max(0, index - 1)];

  res.redirect(`/survey/${surveyId}/run`);
});


// ------------------ Route pages dynamiques ------------------
router.get('/:surveyId/run', async (req, res) => {
  const { surveyId } = req.params;
  const survey = SurveyService.loadSurvey(surveyId);


  if (!req.session.pageNumber) req.session.pageNumber = 1;
  if (!req.session.answers) req.session.answers = {};

  const pageNumber = req.session.pageNumber;

  let stepsOnPage = survey.steps.filter(step => step.page === pageNumber);
 // console.log('stepOnpage',stepsOnPage)

   // Rotation
   if (req.session.rotationQueue && req.session.rotationQueue.length) {
    stepsOnPage = [req.session.rotationQueue[0].step];
   // console.log("req.session.rotationQueue",req.session.rotationQueue)
    //console.log('stepOnpage rotation',stepsOnPage)
  }else{
    stepsOnPage = survey.steps.filter(step => step.page === pageNumber);
  }
 // console.log('stepOnpage fin rotatin',stepsOnPage)
  let options = [];
  const preparedSteps = stepsOnPage.map(step => {
    
    if (step.type === 'grid') step = SurveyService.prepareGridB(step);
    if (step.type === 'autocomplete') {
      options = AutoCompleteUtils.getAutocompleteOptions(step);
    }
    if (step.type === 'accordion') {
      step.sections = step.sections.map(section => ({
        ...section,
        questions: section.questions.map(q =>
          AccordionUtils.prepareQuestionFlags(q)
        )
      }));
    }
    return SurveyService.prepareStepForPage(step);
  });

  // preparedSteps.forEach(step => async{
  //   const response = await ResponseService.getLatestResponse(surveyId, 'anonymous');
  //   if (response?.answers?.has(step.id)) {
  //     step.value = response.answers.get(step.id).value; // ou answer.value selon structure
  //   }
  // });
  
  res.render('questions/page', {
    survey,
    steps: preparedSteps,
    options
  });
});

export default router;