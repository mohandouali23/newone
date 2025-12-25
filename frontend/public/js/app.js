const stepType = document.querySelector('.survey')?.dataset.stepType;

if (stepType) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/assets/css/questions/${stepType}.css`;
  document.head.appendChild(link);
}








// import SurveyManager from './SurveyManager.js';

// // Initialiser le manager
// // surveyId = dynamique ou récupéré depuis Mustache
// const surveyId = document.body.dataset.surveyId; 
// const userId = 'anonymous1'; // ou depuis auth
// const surveyManager = new SurveyManager(surveyId, userId);

// // Exemple : appel depuis formulaire
// function handleSubmitQuestion(stepId, type) {
//   // récupérer la valeur du champ correspondant
//   const input = document.querySelector(`[name="value"]`);
//   let value = input ? input.value : null;

//   // Pour checkbox/multiple_choice
//   if (type === 'multiple_choice') {
//     value = Array.from(document.querySelectorAll('[name="value"]:checked')).map(el => el.value);
//   }

//   surveyManager.submitQuestion(stepId, type, value);

//   // Passer à la prochaine question ou finir
//   const nextStepId = input.dataset.nextStep;
//   if (nextStepId) {
//     window.location.href = `/survey/${surveyId}/${nextStepId}`;
//   } else {
//     surveyManager.submitSurvey();
//   }
// }
