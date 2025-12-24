import express from 'express';
import Response from '../models/Response.js';
import ResponseNormalizer from '../services/ResponseNormalizer.js';
import SurveyService from '../services/SurveyService.js';
import ResponseService from '../services/ResponseService.js';

const router = express.Router();

// Middleware pour logger toutes les requêtes
router.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Body:', req.body);
  next();
});


/* GET : récupérer toutes les réponses d’un questionnaire (par surveyId) */
/* URL : /api/responses/survey/:surveyId */
router.get('/survey/:surveyId', async (req, res) => {
    try {
      const { surveyId } = req.params;
  
      const responses = await Response.find({ surveyId });
  
      res.status(200).json({
        surveyId,
        count: responses.length,
        responses
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

/* GET : récupérer toutes les documents Response */
router.get('/all', async (req, res) => {
  try {
    const responses = await Response.find();
    res.status(200).json(responses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST réponse
// POST réponse
router.post('/:surveyId/:stepId', async (req, res) => {
  const { surveyId, stepId } = req.params;
  let { responseId } = req.body;
  const userId = req.body.userId || 'anonymous';

  const survey = SurveyService.loadSurvey(surveyId);
  const step = SurveyService.getStep(survey, stepId);
  if (!step) return res.status(404).send('Question introuvable');

  // Récupérer la précision si elle existe
const precisionValue = req.body[`precision_${req.body.value}`] || null;
  // Normaliser la réponse
  const answer = ResponseNormalizer.normalize(step, req.body.value,precisionValue);

  try {
    let response;
    if (!responseId) {
      // Première réponse → créer le document
      response = await ResponseService.createResponse(surveyId, userId, answer);
    } else {
      // Document existant → ajouter la réponse
      response = await ResponseService.addAnswer(responseId, answer);
    }
    responseId = response._id;
  } catch (err) {
    return res.status(500).send('Erreur sauvegarde réponse');
  }

  // Redirection vers la prochaine question
  const next = SurveyService.getNextStep(step);
  //if (!next) return res.send('<h2>Merci pour votre participation</h2>');
  if (!next) {
  // Redirection vers la page finale
  return res.redirect(`/survey/${surveyId}/end`);
}

  res.redirect(`/survey/${surveyId}/${next}?responseId=${responseId}`);
});


export default router;




// //response.route.js
// import express, { response } from 'express';
// import Response from '../models/Response.js';
// import ResponseNormalizer from '../services/ResponseNormalizer.js';
// import SurveyService from '../services/SurveyService.js';
// import ResponseService from '../services/ResponseService.js';

// const router = express.Router();

// // // Middleware pour logger toutes les requêtes
// // router.use((req, res, next) => {
// //   console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
// //   console.log('Body:', req.body);
// //   next();
// // });


// /* GET : récupérer toutes les réponses d’un questionnaire (par surveyId) */
// /* URL : /api/responses/survey/:surveyId */
// router.get('/survey/:surveyId', async (req, res) => {
//     try {
//       const { surveyId } = req.params;
  
//       const responses = await Response.find({ surveyId });
  
//       res.status(200).json({
//         surveyId,
//         count: responses.length,
//         responses
//       });
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: 'Erreur serveur' });
//     }
//   });

// /* GET : récupérer toutes les documents Response */
// router.get('/all', async (req, res) => {
//   try {
//     const responses = await Response.find();
//     res.status(200).json(responses);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Erreur serveur' });
//   }
// });

// // POST réponse
// // POST réponse
// router.post('/:surveyId/:stepId', async (req, res) => {
//   const { surveyId, stepId } = req.params;
//   let { responseId } = req.body;
//   const userId = req.body.userId || 'anonymous';

//   const survey = SurveyService.loadSurvey(surveyId);
//   const step = SurveyService.getStep(survey, stepId);
//   if (!step) return res.status(404).send('Question introuvable');

//   // Normaliser la réponse
//   const answer = ResponseNormalizer.normalize(step, req.body.value);

//   try {
//     let response;
//     if (!responseId) {
//       // Première réponse → créer le document
//       response = await ResponseService.createResponse(surveyId, userId, answer);
//     } else {
//       // Document existant → ajouter la réponse
//       response = await ResponseService.addAnswer(responseId, answer);
//     }
//     responseId = response._id;
//   } catch (err) {
//     return res.status(500).send('Erreur sauvegarde réponse');
//   }

//   // Redirection vers la prochaine question
//   const next = SurveyService.getNextStep(step);
//   //if (!next) return res.send('<h2>Merci pour votre participation</h2>');
//   if (!next) {
//      // Mettre completed à true
//   await ResponseService.markCompleted(responseId);
//   // Redirection vers la page finale
//   return res.redirect(`/survey/${surveyId}/end`);
// }

//   res.redirect(`/survey/${surveyId}/${next}?responseId=${responseId}`);
// });


// export default router;
