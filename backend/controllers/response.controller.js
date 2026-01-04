import SurveyRunService from '../services/SurveyRunService.js';

export default class ResponseController {
  static async run(req, res) {
    const { surveyId } = req.params;
    const action = req.body.action || 'next';

    try {
      const result = await SurveyRunService.run({
        surveyId,
        action,
        body: req.body,
        session: req.session
      });

      // console.log("SurveyRunService.run,surveyId,", surveyId,
      //   ",action",action,
      //   ",body: req.body",req.body,
      //   ",session",req.session
      // ) 
        
      if (result.finished) {
        req.session.destroy();
        return res.redirect(`/survey/${surveyId}/end`);
      }

      // sauvegarde step courant dans session
      req.session.currentStepId = result.nextStep.id;

      return res.redirect(`/survey/${surveyId}/run`);
    } catch (err) {
      console.error('Erreur SurveyRunController:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
}
