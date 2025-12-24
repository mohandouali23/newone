
// -----------------gestion du questionnaire-----------------
import express from 'express';
import SurveyService from '../services/SurveyService.js';
import AutoCompleteUtils from '../services/AutoCompleteUtils.js';


const router = express.Router();

// Route pour afficher les questions
router.get('/:surveyId/:stepId', async (req, res, next) => {
  if (req.params.stepId === 'end') return next(); // passe à la route /end

  const { surveyId, stepId } = req.params;
  const responseId = req.query.responseId;
  const userId = req.query.userId || 'anonymous';

  const survey = SurveyService.loadSurvey(surveyId);
  const step = SurveyService.getStep(survey, stepId);
  if (!step) return res.status(404).send('Question introuvable');

  let options = [];
  if (step.type === 'autocomplete') {
    options = AutoCompleteUtils.getAutocompleteOptions(step);
  }

  res.render(`questions/${step.type}`, { survey, step, options, responseId }, (err, html) => {
    if (err) return res.status(500).send(err.message);
    res.render('layout', { survey, step, content: html });
  });
});

// Route pour la page finale “Merci”
router.get('/:surveyId/end', (req, res) => {
  const { surveyId } = req.params;
  const survey = SurveyService.loadSurvey(surveyId);
  const firstStepId = survey.steps[0].id;

  res.render('end', { surveyId, firstStepId });
});

/* Afficher une question 
router.get('/:surveyId/:stepId', (req, res) => {

    const { surveyId, stepId } = req.params;
  
    const survey = SurveyService.loadSurvey(surveyId);
    const step = SurveyService.getStep(survey, stepId);
  
    if (!step) return res.status(404).send('Question introuvable');
    
    let options = [];
    if (step.type === 'autocomplete') {
      options = AutoCompleteUtils.getAutocompleteOptions(step);
    }

    //  Rendre la question seule
    res.render(`questions/${step.type}`, { survey, step,options}, (err, html) => {
      if (err) return res.status(500).send(err.message);
  
      //  Injecter la question dans le layout
      res.render('layout', {
        survey,
        step,
        content: html
      });
    });
  });
*/

export default router;




// //survey.route.js
// import express from 'express';
// import SurveyService from '../services/SurveyService.js';
// import AutoCompleteUtils from '../services/AutoCompleteUtils.js';
// import checkCompleted from '../middlewares/checkCompleted.js';

// const router = express.Router();

// router.get('/:surveyId/:stepId', async (req, res, next) => {
//   if (req.params.stepId === 'end') return next();

//   const { surveyId, stepId } = req.params;
//   const responseId = req.query.responseId || 'anonymous';

//   const survey = SurveyService.loadSurvey(surveyId);
//   const step = SurveyService.getStep(survey, stepId);
//   if (!step) return res.status(404).send('Question introuvable');

//   let options = [];
//   if (step.type === 'autocomplete') {
//     options = AutoCompleteUtils.getAutocompleteOptions(step);
//   }

//   // Render le contenu de la question
//   res.render(`questions/${step.type}`, { survey, step, options, responseId }, (err, questionHtml) => {
//     if (err) return res.status(500).send(err.message);

//     // Render la layout avec le contenu de la question
//     res.render('layout', { survey, step, content: questionHtml });
//   });
// });

// // Affichage d’une question
// // router.get('/:surveyId/:stepId',  async (req, res, next) => {
// //    // Si on est sur la page finale, ne pas passer par checkCompleted
// //   if (req.params.stepId === 'end') return next();

// //   // Middleware checkCompleted uniquement pour les questions
// //   await checkCompleted(req, res, next);

// //   const { surveyId, stepId } = req.params;
// //   const responseId = req.query.responseId;
// //   const userId = req.query.userId || 'anonymous';

// //   const survey = SurveyService.loadSurvey(surveyId);
// //   const step = SurveyService.getStep(survey, stepId);
// //   if (!step) return res.status(404).send('Question introuvable');

// //   let options = [];
// //   if (step.type === 'autocomplete') {
// //     options = AutoCompleteUtils.getAutocompleteOptions(step);
// //   }

// //   res.render(`questions/${step.type}`, { survey, step, options, responseId }, (err, html) => {
// //     if (err) return res.status(500).send(err.message);
// //     res.render('layout', { survey, step, content: html });
// //   });
// // });

// // Page finale “Merci”
// router.get('/:surveyId/end', (req, res) => {
//   const { surveyId } = req.params;
//   const survey = SurveyService.loadSurvey(surveyId);
//   const firstStepId = survey.steps[0].id;

//   res.render('end', { surveyId, firstStepId });
// });

// export default router;
