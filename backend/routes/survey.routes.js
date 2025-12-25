//survey.routes.js
// -----------------gestion du questionnaire-----------------
import express from 'express';
import SurveyService from '../services/SurveyService.js';
import AutoCompleteUtils from '../services/AutoCompleteUtils.js';
import AccordionUtils from '../services/AccordionUtils.js';


const router = express.Router();
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

 //  Injection des colonnes dans chaque ligne (GRID)
 if (step.type === 'grid' && Array.isArray(step.rows) && Array.isArray(step.columns)) {
  step.rows = step.rows.map(row => ({
    ...row,
    columns: step.columns
    
  }));
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
    console.log("step",step)

    console.log("json step",JSON.stringify(step, null, 2));

    res.render('layout', { survey, step, content: html });
  });
});

// Route pour la page finale “Merci”
// router.get('/:surveyId/end', (req, res) => {
//   const { surveyId } = req.params;
//   const survey = SurveyService.loadSurvey(surveyId);
//   const firstStepId = survey.steps[0].id;

//   res.render('end', { surveyId, firstStepId });
// });
router.get('/:surveyId/end', (req, res) => {
  const { surveyId } = req.params;
  const survey = SurveyService.loadSurvey(surveyId);
  const firstStepId = survey.steps[0].id;

  const step = { type: 'end', id: 'end', title: 'Fin du questionnaire' };

  // Rendu du contenu du end.mustache
  res.render('end', { surveyId, firstStepId }, (err, html) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur lors du rendu de la page de fin');
    }

    // Ensuite on rend layout en injectant le HTML dans content
    res.render('layout', { survey, step, content: html });
  });
});


export default router;