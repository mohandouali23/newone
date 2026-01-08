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
  static async addAnswer(responseId, answer,keysToDelete = []) {
    const response = await Response.findById(responseId);
    if (!response) throw new Error('Document introuvable');
    
    // fusionner Map existante avec les nouvelles réponses
    const currentAnswers = new Map(response.answers); // récupère l'existant
    //  Supprimer les anciennes clés
    keysToDelete.forEach(key => currentAnswers.delete(key));

    for (const [key, value] of Object.entries(answer)) {
      // Pour les tableaux (multi-choice), on peut stocker directement le tableau
    if (Array.isArray(value)) {
      currentAnswers.set(key, value);
    } else {
      currentAnswers.set(key, value);
    }
    }
    response.answers = currentAnswers;
    
    await response.save();
    return response;
  }
  static async deleteAnswers(responseId, keys = []) {
    if (!responseId || !keys.length) return;
  
    const response = await Response.findById(responseId);
    if (!response) return;
  
    // Convert Map en objet pour faciliter la suppression
    const answersObj = Object.fromEntries(response.answers);
  
    // Supprimer les clés
    keys.forEach(key => delete answersObj[key]);
  
    // Remettre à jour la Map
    response.answers = new Map(Object.entries(answersObj));
  
    await response.save();
    console.log(' Suppression effectuée pour:', keys);
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
