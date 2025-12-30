// //response.routes.js
// import express from 'express';
// import Response from '../models/Response.js';
// import ResponseNormalizer from '../services/ResponseNormalizer.js';
// import SurveyService from '../services/SurveyService.js';
// import ResponseService from '../services/ResponseService.js';


// const router = express.Router();

// router.post('/:surveyId/run', async (req, res) => {
//   const { surveyId } = req.params;
//   const action = req.body.action || 'next'; // next par défaut
//   const userId = 'anonymous';

//   const survey = SurveyService.loadSurvey(surveyId);

//   if (!req.session.answers) req.session.answers = {};
//   let pageNumber = req.session.pageNumber || 1;

//   //  Création du document UNIQUEMENT ici
//   if (!req.session.responseId) {
//     const response = await ResponseService.createSurveyDocument(
//       surveyId,
//       userId,
//       {}
//     );
//     req.session.responseId = response._id;
//     console.log(' Document créé au premier POST:', response._id);
//   }
  
//   const responseId = req.session.responseId;
//   //const stepsOnPage = survey.steps.filter(step => step.page === pageNumber);
// // --- Mettre à jour les réponses reçues ---
// const mainStep = survey.steps.find(s => s.id === 'q3');
// //console.log("mainStep",mainStep)
// if (mainStep) {
//   const rawValue = req.body['q3'];
//   console.log("rawvalue q3",rawValue)
//   if (rawValue) {
//     const normalized = ResponseNormalizer.normalize(mainStep, rawValue);
//     await ResponseService.addAnswer(responseId, normalized);
//     req.session.answers['q3'] = rawValue;
//     console.log("res qession answers",req.session.answers['q3'])
//   }
// }

//   // --- Rotation : créer queue si question principale Q3 remplie et queue non existante ---
// if (!req.session.rotationQueue && req.session.answers['q3']) {
//   req.session.rotationQueue = SurveyService.generateRotationQueue(
//     survey,
//     'q3', // question principale
//     req.session.answers
//   );
//   console.log("req generatedrotation", req.session.rotationQueue)
// }

// // --- Déterminer les steps à sauvegarder ---
// let stepsOnPage = [];

// if (req.session.rotationQueue && req.session.rotationQueue.length > 0) {
//     // Supprimer la question traitée de la queue
//   req.session.rotationQueue.shift();
// } else {
//   // Page normale
//   stepsOnPage = survey.steps.filter(step => step.page === pageNumber);
// }
//   try {
     
//     // Sauvegarder ou mettre à jour les réponses
//     for (const step of stepsOnPage) {
//       let rawValue = req.body[step.id];

//       if (step.type === 'accordion' || step.type === 'grid') {
//         rawValue = req.body;
//       }
// console.log("rawvalue",rawValue)
//       const answer = ResponseNormalizer.normalize(step, rawValue, {});
//       console.log("answer",answer)
//       //  Mise à jour existante ou insertion
//       await ResponseService.addAnswer(responseId, answer);
//     }

//    // --- Avancer dans la rotation ou la pagination normale ---
//    if (req.session.rotationQueue && req.session.rotationQueue.length > 0) {
//     // Supprimer la question traitée de la queue
//     req.session.rotationQueue.shift();

//     if (req.session.rotationQueue.length === 0) {
//       // Queue terminée → passer à la page suivante normale
//       const pages = [...new Set(survey.steps.map(s => s.page))].sort((a,b)=>a-b);
//       let index = pages.indexOf(pageNumber);
//       pageNumber = index + 1 < pages.length ? pages[index+1] : undefined;
//       req.session.pageNumber = pageNumber;
//     }
//   } else {
//     // Pagination normale
//     const pages = [...new Set(survey.steps.map(s => s.page))].sort((a,b)=>a-b);
//     let index = pages.indexOf(pageNumber);
//     pageNumber = action === 'prev' ? Math.max(0, index-1) : index + 1;
//     req.session.pageNumber = pageNumber;
//   }

 

//     if (pageNumber === undefined) {
//       req.session.destroy();
//       return res.redirect(`/survey/${surveyId}/end`);
//     }

    
//     res.redirect(`/survey/${surveyId}/run`);

//   } catch (err) {
//     console.error(err);
//     res.status(500).send('Erreur sauvegarde réponses');
//   }
// });

// export default router;


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
   
      const normalized = ResponseNormalizer.normalize(stepToNormalize, rawValue);
      await ResponseService.addAnswer(responseId, normalized);

      // Mémoriser réponse principale (pour rotation)
      if (!stepToNormalize.isSubQuestion) {
        req.session.answers[stepToNormalize.id] = rawValue;
      }

      console.log(`✅ Réponse sauvegardée: ${stepToNormalize.id}`);
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


// import express from 'express';
// import ResponseNormalizer from '../services/ResponseNormalizer.js';
// import SurveyService from '../services/SurveyService.js';
// import ResponseService from '../services/ResponseService.js';

// const router = express.Router();
// router.post('/:surveyId/run', async (req, res) => {
//   const { surveyId } = req.params;
//   const action = req.body.action || 'next';
//   const userId = 'anonymous';

//   const survey = SurveyService.loadSurvey(surveyId);

//   if (!req.session.answers) req.session.answers = {};
//   if (!req.session.pageNumber) req.session.pageNumber = 1;

//   let pageNumber = req.session.pageNumber;

//   // 1️⃣ Créer le document réponse si nécessaire
//   if (!req.session.responseId) {
//     const response = await ResponseService.createSurveyDocument(
//       surveyId,
//       userId,
//       {}
//     );
//     req.session.responseId = response._id;
//     console.log('📄 Document créé:', response._id);
//   }

//   const responseId = req.session.responseId;

//   // 2️⃣ Initialiser la rotation si question principale Q3 remplie
//   if (!req.session.rotationQueue && req.session.answers['q3']) {
//     req.session.rotationQueue = SurveyService.generateRotationQueue(
//       survey,
//       'q3',
//       req.session.answers
//     );
//     console.log('🔁 Rotation générée:', req.session.rotationQueue.map(s => ({
//       id: s.id,
//       parent: s.parent,
//       optionCode: s.optionCode,
//       optionLabel: s.optionLabel
//     })));
//   }

//   // 3️⃣ Déterminer les steps à sauvegarder
//   let stepsOnPage = [];
//   if (req.session.rotationQueue && req.session.rotationQueue.length > 0) {
//     // rotation : ne traiter que la première question
//     stepsOnPage = [req.session.rotationQueue[0]];
//   } else {
//     // page normale : toutes les steps sur cette page
//     stepsOnPage = survey.steps.filter(step => step.page === pageNumber);
//   }

//   // 4️⃣ Sauvegarder les réponses pour chaque step
//   for (const stepWrapper of stepsOnPage) {
//     const stepToNormalize = stepWrapper.step || stepWrapper;

//     let rawValue = req.body[stepToNormalize.id];
//     if (stepToNormalize.type === 'accordion' || stepToNormalize.type === 'grid') {
//       rawValue = req.body;
//     }

//     if (rawValue !== undefined) {
//       const normalized = ResponseNormalizer.normalize(stepToNormalize, rawValue);
//       await ResponseService.addAnswer(responseId, normalized);

//       // Sauvegarder la réponse principale pour rotation
//       if (!stepToNormalize.isSubQuestion) {
//         req.session.answers[stepToNormalize.id] = rawValue;
//       }

//       console.log(`✅ Réponse sauvegardée: ${stepToNormalize.id}`);
//     }
//   }

//   // 5️⃣ Consommer la question de rotation
//   if (req.session.rotationQueue && req.session.rotationQueue.length > 0) {
//     req.session.rotationQueue.shift();
//     if (req.session.rotationQueue.length === 0) {
//       delete req.session.rotationQueue;
//       pageNumber++;
//       req.session.pageNumber = pageNumber;
//     }
//   }

//   // 6️⃣ Pagination normale
//   if (!req.session.rotationQueue) {
//     const pages = [...new Set(survey.steps.map(s => s.page))].sort((a, b) => a - b);
//     const index = pages.indexOf(pageNumber);
//     pageNumber = action === 'prev'
//       ? pages[Math.max(0, index - 1)]
//       : pages[index + 1];
//     req.session.pageNumber = pageNumber;
//   }

//   // 7️⃣ Fin du questionnaire
//   if (!pageNumber) {
//     req.session.destroy();
//     return res.redirect(`/survey/${surveyId}/end`);
//   }

//   // 8️⃣ Afficher la question suivante
//   res.redirect(`/survey/${surveyId}/run`);
// });

// export default router;
