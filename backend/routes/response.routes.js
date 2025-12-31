// response.routes.js
import express from 'express';
import ResponseNormalizer from '../services/ResponseNormalizer.js';
import SurveyService from '../services/SurveyService.js';
import RotationQueueUtils from '../services/RotationQueueUtils.js';
import ResponseService from '../services/ResponseService.js';

const router = express.Router();

router.post('/:surveyId/run', async (req, res) => {
  const { surveyId } = req.params;
  const action = req.body.action || 'next';
  const userId = 'anonymous';

  const survey = SurveyService.loadSurvey(surveyId);

  if (!req.session.answers) req.session.answers = {};
  if (!req.session.pageNumber) req.session.pageNumber = 1;
  if (!req.session.rotationQueueDone) req.session.rotationQueueDone = {};
  
  let pageNumber = req.session.pageNumber;
  /* ======================================================
     1 Créer le document réponse (UNE SEULE FOIS)
     ====================================================== */
  if (!req.session.responseId) {
    const response = await ResponseService.createSurveyDocument(
      surveyId,
      userId,
      {}
    );
    req.session.responseId = response._id;
    console.log('📄 Document créé:', response._id);
  }

  const responseId = req.session.responseId;


  /* ======================================================
     2 Déterminer le STEP COURANT
     ====================================================== */
     let stepsOnPage = [];

     if (req.session.rotationQueue && req.session.rotationQueue.length > 0) {
       // rotation : ne traiter que la première question
       stepsOnPage = [req.session.rotationQueue[0]];
     } else {
       // page normale : toutes les steps sur cette page
       stepsOnPage = survey.steps.filter(step => step.page === pageNumber);
     }

  /* ======================================================
     3 Sauvegarder la réponse si elle existe
     ====================================================== */
     if (action === 'next') {
     for (const stepWrapper of stepsOnPage)  {
      const stepToNormalize = stepWrapper.step || stepWrapper;
    let rawValue = req.body[stepToNormalize.id];

    if (['accordion','grid','single_choice','multiple_choice'].includes(stepToNormalize.type)) {
      rawValue = req.body;
    }

    if (rawValue !== undefined) {
   console.log("rawvalue",rawValue)
      const normalized = ResponseNormalizer.normalize(stepToNormalize, rawValue,stepWrapper.optionIndex);
      console.log("normlize response",normalized)

      await ResponseService.addAnswer(responseId, normalized);

      // Mémoriser réponse principale (pour rotation)
      if (!stepToNormalize.isSubQuestion) {
         // On stocke seulement la valeur principale pour la rotation
  const mainValue = (stepToNormalize.type === 'multiple_choice')
  ? req.body[stepToNormalize.id] // array des codes sélectionnés
  : rawValue;
        req.session.answers[stepToNormalize.id] = mainValue;
      }

      console.log(` Réponse sauvegardée: ${stepToNormalize.id}_${stepWrapper.optionIndex || ''}`);
    }
  }
}
/* ===============================================
         4 Consommer UNE question de rotation
         =============================================== */
         if (req.session.rotationQueue && req.session.rotationQueue.length > 0) {
          req.session.rotationQueue.shift();
        }
  /* ======================================================
     5️⃣ Initialiser la rotation (UNE SEULE FOIS)
     ====================================================== */
  if (!req.session.rotationQueue) {
    // Pour chaque step qui peut avoir une rotation
    for (const step of survey.steps) {
      if (step.repeatFor && req.session.answers[step.repeatFor] && !req.session.rotationQueueDone[step.repeatFor]) {
        req.session.rotationQueue = RotationQueueUtils.generateRotationQueue(
          survey,
          step.repeatFor,
          req.session.answers
        );
        req.session.rotationQueueDone[step.repeatFor] = true; // rotation générée
      //  console.log(' Rotation générée pour', step.repeatFor, req.session.rotationQueue.map(s => s.id));
        break; // ne générer qu’une rotation à la fois
      }
    }
  }
  /* ======================================================
     6️⃣ Fin de rotation → pagination normale
     ====================================================== */
     if (req.session.rotationQueue && req.session.rotationQueue.length === 0) {
      delete req.session.rotationQueue;
    }
    

  /* ======================================================
     7️⃣ Pagination normale (hors rotation)
     ====================================================== */
  if (!req.session.rotationQueue) {
    const pages = [...new Set(survey.steps.map(s => s.page))].sort((a, b) => a - b);
    const index = pages.indexOf(pageNumber);

    pageNumber = action === 'prev'
      ? pages[Math.max(0, index - 1)]
      : pages[index + 1];

    req.session.pageNumber = pageNumber;
  }

  /* ======================================================
     8️⃣ Fin du questionnaire
     ====================================================== */
  if (!pageNumber) {
    req.session.destroy();
    return res.redirect(`/survey/${surveyId}/end`);
  }

  /* ======================================================
     9️⃣ Afficher la question suivante
     ====================================================== */
  res.redirect(`/survey/${surveyId}/run`);
});

export default router;

