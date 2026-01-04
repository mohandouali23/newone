/*affichage de la prochaine question
sauvegarde des réponses
gestion des rotations (sous-questions répétées)
navigation normale ou conditionnelle
fin du questionnaire*/

import express from 'express';
import ResponseController from '../controllers/response.controller.js';

const router = express.Router();
router.post('/:surveyId/run', async (req, res) => {
  await ResponseController.run(req, res);
});

export default router;


// import express from 'express';
// import SurveyService from '../services/SurveyService.js';
// import ResponseService from '../services/ResponseService.js';
// import ResponseNormalizer from '../services/ResponseNormalizer.js';
// import RotationQueueUtils from '../services/RotationQueueUtils.js';
// import RotationService from '../services/RotationService.js';
// import NavigationRuleService from '../services/NavigationRuleService.js';

// const router = express.Router();

// router.post('/:surveyId/run', async (req, res) => {
//   const { surveyId } = req.params;
//   const action = req.body.action || 'next';
//   const userId = 'anonymous';

//   const survey = SurveyService.loadSurvey(surveyId);

//   /* =========================
//      1️⃣ Init session
//   ========================= */
//   if (!req.session.answers) req.session.answers = {};
//   if (!req.session.rotationQueueDone) req.session.rotationQueueDone = {};

//   /* =========================
//      2️⃣ Créer document réponse si pas encore existant
//   ========================= */
//   if (!req.session.responseId) {
//     const response = await ResponseService.createSurveyDocument(
//       surveyId,
//       userId,
//       {}
//     );
//     req.session.responseId = response._id;
//   }

//   const responseId = req.session.responseId;

//   /* =========================
//      3️⃣ Déterminer question courante
//   ========================= */
//   const { step: currentStep, wrapper: currentStepWrapper, isInRotation } =
//     RotationService.getCurrentStep(req.session, survey);

//   const currentPage = currentStep.page;

//   /* =========================
//      4️⃣ Déterminer toutes les questions à afficher sur la page
//   ========================= */
//   const stepsOnPage = isInRotation
//     ? [currentStep]
//     : survey.steps.filter(s => s.page === currentPage);

//   const stepWrappersOnPage = isInRotation
//     ? [currentStepWrapper]
//     : stepsOnPage.map(step => ({ step }));

//   /* =========================
//      5️⃣ Sauvegarder réponses
//   ========================= */
//   if (action === 'next' && stepsOnPage.length > 0) {
//     console.log(`💾 Sauvegarde pour ${stepsOnPage.length} étape(s) sur cette page`);

//     for (let i = 0; i < stepsOnPage.length; i++) {
//       const step = stepsOnPage[i];
//       const stepWrapper = stepWrappersOnPage[i];

//       let rawValue = req.body[step.id];

//       // Gestion types complexes
//       if (['grid', 'accordion', 'single_choice', 'multiple_choice'].includes(step.type)) {
//         rawValue = req.body;
//       }

//       if (rawValue !== undefined) {
//         const normalized = ResponseNormalizer.normalize(step, rawValue, stepWrapper.optionIndex);
//         await ResponseService.addAnswer(responseId, normalized);

//         // Stocker dans session
//         if (!step.isSubQuestion) {
//           let mainValue;
//           switch (step.type) {
//             case 'multiple_choice':
//               mainValue = req.body[step.id] || [];
//               break;
//             case 'single_choice':
//               mainValue = req.body[step.id] || '';
//               break;
//             default:
//               mainValue = rawValue;
//           }

//           if (isInRotation && stepWrapper.optionIndex !== undefined) {
//             req.session.answers[`${step.id}_${stepWrapper.optionIndex}`] = mainValue;
//           } else {
//             req.session.answers[step.id] = mainValue;
//           }
//         }
//       }
//     }
//   }

//   /* =========================
//      6️⃣ Initialiser rotation si nécessaire
//   ========================= */
//   const rotationInit = RotationService.initRotation({
//     session: req.session,
//     survey,
//     answers: req.session.answers,
//     action,
//     generateQueue: RotationQueueUtils.generateRotationQueue
//   });

//   if (rotationInit) {
//     if (!rotationInit.nextStepId || rotationInit.nextStepId === 'FIN') {
//       req.session.destroy();
//       return res.redirect(`/survey/${surveyId}/end`);
//     }
//     req.session.currentStepId = rotationInit.nextStepId;
//     return res.redirect(`/survey/${surveyId}/run`);
//   }

//   /* =========================
//      7️⃣ Avancer dans rotation
//   ========================= */
//   let nextStepId;
//   const rotationAdvance = RotationService.advanceRotation({
//     session: req.session,
//     survey,
//     currentStep,
//     action
//   });

//   if (rotationAdvance) {
//     nextStepId = rotationAdvance.nextStepId;

//     if (!nextStepId && rotationAdvance.fallbackFrom) {
//       nextStepId = NavigationRuleService.resolve(
//         rotationAdvance.fallbackFrom,
//         req.session.answers[rotationAdvance.fallbackFrom.id],
//         survey.steps
//       );
//     }
//   }

//   /* =========================
//      8️⃣ Navigation normale si pas de rotation
//   ========================= */
//   if (!nextStepId) {
//     nextStepId = NavigationRuleService.resolve(
//       currentStep,
//       req.session.answers[currentStep.id],
//       survey.steps
//     );
//   }

//   /* =========================
//      9️⃣ Fin du questionnaire
//   ========================= */
//   if (!nextStepId || nextStepId === 'FIN') {
//     req.session.destroy();
//     return res.redirect(`/survey/${surveyId}/end`);
//   }

//   /* =========================
//      🔟 Aller à la prochaine étape
//   ========================= */
//   req.session.currentStepId = nextStepId;

//   console.log('--- Session actuelle ---');
//   console.log('- answers:', req.session.answers);
//   console.log('- rotationQueue:', req.session.rotationQueue?.length || 0);
//   console.log('------------------------');

//   return res.redirect(`/survey/${surveyId}/run`);
// });

// export default router;