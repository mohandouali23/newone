export default class ResponseServiceMock {
    static async createSurveyDocument(surveyId, userId, initialData) {
      // faux responseId
      return { _id: `mock_${Date.now()}` };
    }
  
    static async addAnswer(responseId, normalized, keysToDelete = []) {
      // NO-OP
      console.log(' [MOCK] addAnswer', { responseId, normalized, keysToDelete });
    }
  
    static async deleteAnswers(responseId, keys = []) {
      // NO-OP
      console.log(' [MOCK] deleteAnswers', { responseId, keys });
    }
    
  }
  