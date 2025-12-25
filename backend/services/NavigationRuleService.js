export default class NavigationRuleService {

  static evaluateRule(rule, answerValue) {
    //const value = answerValue;
   // const value = this.extractValue(answerValue, rule.field);

    const extracted = this.extractValue(answerValue, rule.field);

  // Toujours travailler avec un tableau
  const values = Array.isArray(extracted) ? extracted : [extracted];

    switch (rule.operator) {
      case 'EQUALS':
      return values.some(v => v === rule.value);

        case 'NOT_EQUALS':
          return values.every(v => v !== rule.value);

        case 'IN':
          return values.some(v => rule.values.includes(v));

        case 'NOT_IN':
           return values.every(v => !rule.values.includes(v));

      case 'LT':
        return Number(values) < rule.value;

      case 'LTE':
        return Number(values) <= rule.value;

      case 'GT':
        return Number(values) > rule.value;

      case 'GTE':
        return Number(values) >= rule.value;

      case 'BETWEEN':
        return Number(values) >= rule.values[0] &&
               Number(values) <= rule.values[1];

      case 'FILLED':
        return values.length > 0;
          
      case 'EMPTY':
        return values.length === 0;

      default:
        return false;
    }
  }

  /**
   * Résout la navigation pour une question donnée
   */
  static resolve(step, answerValue, steps) {

    const navigation = step.navigation;

    //  Règles conditionnelles
    if (navigation?.rules?.length) {
      for (const rule of navigation.rules) {
        const match = this.evaluateRule(rule.if, answerValue);
        if (match) {
          return rule.then.goTo;
        }
      }
    }

    // 2Default navigation
    if (navigation?.default === 'NEXT') {
      return this.getNextSequentialStep(step, steps);
    }

    if (navigation?.default === 'redirection') {
      return step.redirection;
    }

    //  Fallback historique
    return step.redirection;
  }

  static getNextSequentialStep(step, steps) {
    const index = steps.findIndex(s => s.id === step.id);
    return steps[index + 1]?.id || 'FIN';
  }

  static extractValue(answerValue, field) {
    if (answerValue == null) return null;
  
    //  multiple_choice → tableau d'objets
    if (Array.isArray(answerValue) && field) {
      return answerValue
        .map(v => v?.[field])
        .filter(v => v !== undefined);
    }
  
    //  objet simple (autocomplete, single_choice avec objet)
    if (typeof answerValue === 'object' && field) {
      return answerValue[field];
    }
  
    //  valeur simple
    return answerValue;
  }
  
  
}
