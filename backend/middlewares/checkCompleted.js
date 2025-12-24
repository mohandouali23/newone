import ResponseService from '../services/ResponseService.js';

export default async function checkCompleted(req, res, next) {
  const { surveyId } = req.params;
  const userId = req.query.userId || 'anonymous';

  try {
    const lastResponse = await ResponseService.getLatestResponse(surveyId, userId);
  
    if (lastResponse?.completed) {
      // Questionnaire déjà terminé, redirige vers la page finale
      return res.redirect(`/survey/${surveyId}/end`);
    }

    next();
  } catch (err) {
    console.error('Erreur middleware checkCompleted:', err);
    next();
  }
}
