// response.routes.js
import express from 'express';
import ResponseNormalizer from '../services/ResponseNormalizer.js';
import SurveyService from '../services/SurveyService.js';
import ResponseService from '../services/ResponseService.js';

const router = express.Router();

router.post('/:surveyId/run', async (req, res) => {
  const { surveyId } = req.params;
  const action = req.body.action || 'next';
  const userId = 'anonymous';

  const survey = SurveyService.loadSurvey(surveyId);

  if (!req.session.answers) req.session.answers = {};
  if (!req.session.pageNumber) req.session.pageNumber = 1;

  let pageNumber = req.session.pageNumber;

  /* ======================================================
     1️⃣ Créer le document réponse (UNE SEULE FOIS)
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
     2️⃣ Déterminer le STEP COURANT
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
     3️⃣ Sauvegarder la réponse si elle existe
     ====================================================== */
     for (const stepWrapper of stepsOnPage)  {
      const stepToNormalize = stepWrapper.step || stepWrapper;
    let rawValue = req.body[stepToNormalize.id];

    if (stepToNormalize.type === 'accordion' || stepToNormalize.type === 'grid') {
      rawValue = req.body;
    }

    if (rawValue !== undefined) {
      // const context = {
      //   optionCode: stepToNormalize.optionCode,
      //   optionLabel: stepToNormalize.optionLabel
      // };
   
      const normalized = ResponseNormalizer.normalize(stepToNormalize, rawValue,stepWrapper.optionIndex);
      await ResponseService.addAnswer(responseId, normalized);

      // Mémoriser réponse principale (pour rotation)
      if (!stepToNormalize.isSubQuestion) {
        const key = stepWrapper.optionIndex
        ? `${stepToNormalize.id}_${stepWrapper.optionIndex}`
        : stepToNormalize.id;
        req.session.answers[stepToNormalize.id] = rawValue;
      }

      console.log(`✅ Réponse sauvegardée: ${stepToNormalize.id}_${stepWrapper.optionIndex || ''}`);
    }
  }
/* ===============================================
         4️⃣ Consommer UNE question de rotation
         =============================================== */
         if (req.session.rotationQueue && req.session.rotationQueue.length > 0) {
          req.session.rotationQueue.shift();
        }
  /* ======================================================
     5️⃣ Initialiser la rotation (UNE SEULE FOIS)
     ====================================================== */
  if (!req.session.rotationQueue && req.session.answers['q3']) {
    req.session.rotationQueue = SurveyService.generateRotationQueue(
      survey,
      'q3',
      req.session.answers
    );

    console.log('🔁 Rotation générée:', req.session.rotationQueue.map(s => ({
      id: s.id,
      parent: s.parent,
      optionCode: s.optionCode,
      optionLabel: s.optionLabel
    })));  }

  /* ======================================================
     6️⃣ Fin de rotation → pagination normale
     ====================================================== */
  if (req.session.rotationQueue && req.session.rotationQueue.length === 0) {
    delete req.session.rotationQueue;

    const pages = [...new Set(survey.steps.map(s => s.page))].sort((a, b) => a - b);
    const index = pages.indexOf(pageNumber);

    pageNumber = pages[index + 1];
    req.session.pageNumber = pageNumber;
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

