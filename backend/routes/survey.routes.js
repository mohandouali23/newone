
// -----------------gestion du questionnaire-----------------
import express from 'express';
import SurveyService from '../services/SurveyService.js';
import AutoCompleteUtils from '../services/AutoCompleteUtils.js';
import ResponseService from '../services/ResponseService.js';

const router = express.Router();

router.get('/:surveyId/:stepId', async (req, res) => {
  const { surveyId, stepId } = req.params;
  const userId = req.query.userId || 'anonymous';

  const survey = SurveyService.loadSurvey(surveyId);
  const step = SurveyService.getStep(survey, stepId);
  if (!step) return res.status(404).send('Question introuvable');

  let options = [];
    if (step.type === 'autocomplete') {
      options = AutoCompleteUtils.getAutocompleteOptions(step);
    }
  //  Créer le document seulement si c'est la première question
  let responseDoc;
  if (stepId === survey.steps[0].id) {
    responseDoc = await ResponseService.createSurveyDocument(surveyId, userId);
  } else {
    responseDoc = await ResponseService.getLatestResponse(surveyId, userId);
  }

res.render(`questions/${step.type}`, 
  { survey, step, options ,
  responseId: responseDoc._id  // passer l'id au formulaire
}, (err, html) => {
  if (err) return res.status(500).send(err.message);

  // Injecter la question dans le layout
  res.render('layout', {
    survey,
    step,
    content: html
  });
});

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
