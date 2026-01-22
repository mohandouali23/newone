import SurveyRunService from '../services/SurveyRunService.js';

export default class ResponseController {
  static async run(req, res) {
    const { surveyId } = req.params;
    const action = req.body._action || 'next';
    
    try {
      const result = await SurveyRunService.run({
        surveyId,
        action,
        body: req.body,
        session: req.session
      });
     console.log("result",result)
      // if (result.finished) {
      //   req.session.destroy();
      //   return res.redirect(`/survey/${surveyId}/end`);
      // }
      if (result.finished) {
        req.session.destroy();
        return res.json({
          success: true,
          finished: true,
          redirectUrl: `/survey/${surveyId}/end`
        });
      }
      

      if (result.validationError) {
        return res.status(400).json({
          success: false,
          messages: result.messages,
          invalidFields: result.invalidFields,
          currentStepId: result.currentStepId
        });
      }
      // sauvegarde step courant dans session
      req.session.currentStepId = result.nextStep.id;
      return res.json({ success: true, nextStepId: result.nextStep.id });
      //return res.redirect(`/survey/${surveyId}/run`);
    } catch (err) {
      console.error('Erreur SurveyRunController:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
}
