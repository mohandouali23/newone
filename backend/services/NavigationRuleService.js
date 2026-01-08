export default class NavigationRuleService {
    //  Évalue un opérateur simple sur une réponse

  static evaluateRule(rule, answerValue) {
    const extracted = this.extractValue(answerValue, rule.field);
       const values = Array.isArray(extracted) ? extracted : [extracted];

//     console.log("NAV DEBUG", {
//   answerValue,
//   extracted,
//   rule,
//   values
// });

    
   // const values = Array.isArray(extracted) ? extracted : [extracted];
    switch (rule.operator) {
      case 'EQUALS':
      return values.some(v => String(v) === String(rule.value));
      
      case 'NOT_EQUALS':
      return values.every(v => String(v) !== String(rule.value));
      
      case 'IN':
        return values.some(v => rule.values.map(String).includes(String(v)));
      
      case 'NOT_IN':
        return values.every(v => !rule.values.map(String).includes(String(v)));
      
      case 'LT':
      return values.some(v => Number(v) < rule.value);
      
      case 'LTE':
      return values.some(v => Number(v) <= rule.value);
      
      case 'GT':
      return values.some(v => Number(v) > rule.value);
      
      case 'GTE':
      return values.some(v => Number(v) >= rule.value);
      
      case 'BETWEEN':
      return values.some(v => Number(v) >= rule.values[0] && Number(v) <= rule.values[1]);
      
      case 'FILLED':
      return values.some(v => v !== null && v !== undefined && v !== '');
      
      case 'EMPTY':
      return values.every(v => v === null || v === undefined || v === '');
      
      default:
      return false;
    }
  }
  //  Évaluer plusieurs conditions AND sur plusieurs questions
 static evaluateConditions(conditions, sessionAnswers, stepId) {
  // console.log("evaluateCondition DEBUG", {
  //   conditions,
  //   stepId,
  //   sessionAnswers
  // });

  const accordionAnswers = sessionAnswers[stepId] || {};

  return conditions.every(cond => {
    const answerValue = accordionAnswers[cond.questionId];
    return this.evaluateRule(cond, answerValue);
  });
}

  //  Résout la navigation d'une étape (accordion ou simple question)
 static resolve(step, sessionAnswers, steps) {
 // console.log("resolveDEBUG", { step, sessionAnswers });

  const navigation = step.navigation;

  if (navigation?.rules?.length) {
    for (const rule of navigation.rules) {
      let match = false;

      //  1. GRID
      if (rule.if?.type === 'GRID') {
        match = this.evaluateGridRule(rule.if, sessionAnswers[step.id]);
        //console.log("GRID match", match);
      }

      // ✅ 2. MULTI-CONDITIONS (accordion, etc.)
      else if (rule.if?.conditions) {
        match = this.evaluateConditions(
          rule.if.conditions,
          sessionAnswers,
          step.id
        );
       //console.log("CONDITIONS match", match);
      }

      // ✅ 3. SIMPLE RULE
      else {
        const answerValue = sessionAnswers[step.id];
        match = this.evaluateRule(rule.if, answerValue);
      //  console.log("SIMPLE match", match);
      }

      if (match) return rule.then.goTo;
    }
  }

  // 🔁 fallback
  if (navigation?.default === 'NEXT') {
    return this.getNextSequentialStep(step, steps);
  }

  if (navigation?.default === 'redirection') {
    return step.redirection;
  }

  return step.redirection;
}


    static getNextSequentialStep(step, steps) {
    const index = steps.findIndex(s => s.id === step.id);
    return steps[index + 1]?.id || 'FIN';
  }

static extractValue(answerValue, field) {
    if (answerValue == null) return [];
  
    //  JSON string (autocomplete, etc.)
    if (typeof answerValue === 'string') {
      try {
        const parsed = JSON.parse(answerValue);
        return this.extractValue(parsed, field);
      } catch {
        return [answerValue];
      }
    }
  
    //  multiple_choice → ['1','7']
    if (Array.isArray(answerValue)) {
      return answerValue.map(v => {
        if (typeof v === 'object' && field) return v[field];
        return v; // string/number
      }).filter(v => v !== undefined);
    }
  
    //  objet (single_choice, spinner, autocomplete)
    if (typeof answerValue === 'object') {
      if (field && field in answerValue) return [answerValue[field]];
      if ('codeItem' in answerValue) return [answerValue.codeItem];
      if ('value' in answerValue) return [answerValue.value];
    }
  
    // 🔹 primitif
    return [answerValue];
  }
static evaluateGridRule(rule, gridAnswer) {
  if (!gridAnswer?.value) return false;

  const valuesByRow = Object.values(gridAnswer.value);

  // ---------------- AXE ROW ----------------
if (rule.axis === 'row') {
  switch (rule.operator) {
    case 'ANY_EQUALS':
      return valuesByRow.some(v => 
        Array.isArray(v) ? v.includes(rule.value) : v === rule.value
      );
    case 'ALL_EQUALS':
      return valuesByRow.every(v => 
        Array.isArray(v) ? v.includes(rule.value) : v === rule.value
      );
    case 'COUNT_GTE':
      return valuesByRow.reduce((acc, v) => acc + ((Array.isArray(v) ? v.includes(rule.value) : v === rule.value) ? 1 : 0), 0) >= rule.value;
    default:
      return false;
  }
}


  // ---------------- AXE COLUMN ----------------
if (rule.axis === 'column') {
  const count = Object.values(gridAnswer.value).reduce((acc, cell) => {
    if (Array.isArray(cell)) {
      return acc + cell.filter(v => v === rule.column).length;
    } else if (typeof cell === 'string') {
      return acc + (cell === rule.column ? 1 : 0);
    }
    return acc;
  }, 0);

  switch (rule.operator) {
    case 'COUNT_GTE': return count >= rule.value;
    case 'COUNT_EQ': return count === rule.value;
    case 'FILLED': return count > 0;
    default: return false;
  }
}


  return false;
}




  // static resolve(step, answerValue, steps) {
    
  //   const navigation = step.navigation;
    
  //   //  Règles conditionnelles
  //   if (navigation?.rules?.length) {
  //     for (const rule of navigation.rules) {
  //       const match = this.evaluateRule(rule.if, answerValue);
  //       if (match) {
  //         return rule.then.goTo;
  //       }
  //     }
      
  //   }
    
    
  //   // 2Default navigation
  //   if (navigation?.default === 'NEXT') {
  //     return this.getNextSequentialStep(step, steps);
  //   }
    
  //   if (navigation?.default === 'redirection') {
  //     return step.redirection;
  //   }
    
  //   //  Fallback historique
  //   return step.redirection;
  // }
  

  // static extractValue(answerValue, field) {
  //   if (answerValue == null) return null;
  //    // 🔥 PATCH : JSON string → objet
  // if (typeof answerValue === 'string') {
  //   try {
  //     const parsed = JSON.parse(answerValue);
  //     return field ? parsed?.[field] : parsed;
  //   } catch {
  //     return answerValue;
  //   }
  // }
  //   // Cas multiple_choice → tableau d'objets
  //   if (Array.isArray(answerValue)) {
  //     if (field) {
  //       return answerValue.map(v => v?.[field]).filter(v => v !== undefined);
  //     }
  //     return answerValue;
  //   }
    
  //   // Cas objet complexe (autocomplete, accordion, single_choice avec objet)
  //   if (typeof answerValue === 'object') {
  //     // Si field fourni, retourner la clé spécifique
  //     if (field && field in answerValue) return answerValue[field];
      
  //     // Sinon on cherche la "valeur principale" (codeItem, value, etc.)
  //     if ('codeItem' in answerValue) return answerValue.codeItem;
  //     if ('value' in answerValue) return answerValue.value;
      
  //     return answerValue;
  //   }
    
  //   // Cas primitif (string, number)
  //   return answerValue;
  // // }
  // static extractValue(answerValue, field) {
  //   if (answerValue == null) return null;
  
  //   // 🔹 Spinner / radio simple
  //   if ((typeof answerValue === 'string' || typeof answerValue === 'number') && field === 'codeItem') {
  //     return answerValue;
  //   }
  
  //   if (typeof answerValue === 'string') {
  //     try {
  //       const parsed = JSON.parse(answerValue);
  //       return field ? parsed?.[field] : parsed;
  //     } catch {
  //       return answerValue;
  //     }
  //   }
  
  //   if (Array.isArray(answerValue)) {
  //     if (field) {
  //       return answerValue.map(v => v?.[field]).filter(v => v !== undefined);
  //     }
  //     return answerValue;
  //   }
  
  //   if (typeof answerValue === 'object') {
  //     if (field && field in answerValue) return answerValue[field];
  //     if ('codeItem' in answerValue) return answerValue.codeItem;
  //     if ('value' in answerValue) return answerValue.value;
  //     return answerValue;
  //   }
  
  //   return answerValue;
  // // }
  // static extractValue(answerValue, field) {
  //   if (answerValue == null) return [];
  
  //   //  JSON string (autocomplete, etc.)
  //   if (typeof answerValue === 'string') {
  //     try {
  //       const parsed = JSON.parse(answerValue);
  //       return this.extractValue(parsed, field);
  //     } catch {
  //       return [answerValue];
  //     }
  //   }
  
  //   //  multiple_choice → ['1','7']
  //   if (Array.isArray(answerValue)) {
  //     return answerValue.map(v => {
  //       if (typeof v === 'object' && field) return v[field];
  //       return v; // string/number
  //     }).filter(v => v !== undefined);
  //   }
  
  //   //  objet (single_choice, spinner, autocomplete)
  //   if (typeof answerValue === 'object') {
  //     if (field && field in answerValue) return [answerValue[field]];
  //     if ('codeItem' in answerValue) return [answerValue.codeItem];
  //     if ('value' in answerValue) return [answerValue.value];
  //   }
  
  //   // 🔹 primitif
  //   return [answerValue];
  // }
  
}