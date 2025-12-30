import Response from '../models/Response.js';

export default class ResponseService {

  // Créer un nouveau document pour un utilisateur
  static async createSurveyDocument(surveyId, userId, initialAnswer = {}) {
    const response = new Response({
      surveyId,
      userId,
      answers: new Map(Object.entries(initialAnswer)), // initialise comme Map
      
    });
    await response.save();
    return response;
  }

  // Ajouter ou fusionner une réponse dans un document existant
  static async addAnswer(responseId, answer) {
    const response = await Response.findById(responseId);
    if (!response) throw new Error('Document introuvable');

    // fusionner Map existante avec les nouvelles réponses
    const currentAnswers = new Map(response.answers); // récupère l'existant
    for (const [key, value] of Object.entries(answer)) {
      currentAnswers.set(key, value);
    }
    response.answers = currentAnswers;

    await response.save();
    return response;
  }

  // Obtenir le dernier document pour un user
  static async getLatestResponse(surveyId, userId) {
    return await Response.findOne({ surveyId, userId }).sort({ createdAt: -1 });
  }

  // Méthode utilitaire pour sauvegarder une réponse (fusion automatique)
  static async saveAnswer(surveyId, userId, answer) {
    let response = await Response.findOne({ surveyId, userId });
    if (!response) {
      response = new Response({
        surveyId,
        userId,
        answers: new Map()
      });
    }

    // Fusionner la nouvelle réponse dans la Map
    const currentAnswers = new Map(response.answers);
    for (const [key, value] of Object.entries(answer)) {
      currentAnswers.set(key, value);
    }
    response.answers = currentAnswers;

    await response.save();
    return response;
  }

  // Créer un document avec la première réponse
  static async createResponse(surveyId, userId, answer) {
    const response = new Response({
      surveyId,
      userId,
      answers: new Map(Object.entries(answer))
    });
    await response.save();
    return response;
  }
}
