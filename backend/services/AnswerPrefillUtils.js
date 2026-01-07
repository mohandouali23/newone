export default class AnswerPrefillUtils {
  static hasRealAnswer(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '' && value !== '/';
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object')
      return Object.values(value).some(v => AnswerPrefillUtils.hasRealAnswer(v));
    return true;
  }
  
  // ---------------- Reset générique ----------------
  
  static resetQuestionState(q) {
    if (q.type === 'single_choice') {
      q.value = undefined;
      q.options?.forEach(opt => {
        opt.isSelected = false;
        opt.precisionValue = '';
        opt.showPrecision = false;
        
        if (opt.subQuestions) {
          opt.subQuestions.forEach(subQ => this.resetQuestionState(subQ));
        }
      });
    }
    if (q.type === 'multiple_choice') {
      q.value = undefined;
      q.options?.forEach(o => {
        o.isSelected = false;
        o.precisionValue = '';
        o.showPrecision = false;
      });
      if (q.options) {
        q.options.forEach(opt => {
          if (opt.subQuestions) {
            opt.subQuestions.forEach(subQ => this.resetQuestionState(subQ));
          }
        });
      }
    }
  }
  // ---------------- Helper clés session ----------------
  static getPrecisionKey(stepId, codeItem) {
    return `${stepId}_pr_${codeItem}`;
  }
  
  static getSubQuestionKey(parentStepId, selectedValue, subQuestionId) {
    return `${parentStepId}_${selectedValue}_${subQuestionId}`;
  }
  
  static getValueFromSession(sessionAnswers, key) {
    return sessionAnswers[key];
  }
  
  // ---------------- Sub-questions ----------------
  static getSubQuestionValue({ parentStep, subQuestion, sessionAnswers }) {
    const selectedValue = sessionAnswers[parentStep.id];
    if (!selectedValue) return undefined;
    
    // Si parent multiple_choice -> selectedValue est un array
    if (Array.isArray(selectedValue)) {
      for (const val of selectedValue) {
        const key = this.getSubQuestionKey(parentStep.id, val, subQuestion.id);
        console.log("sessionAnswers[key] ",sessionAnswers[key] )
        if (sessionAnswers[key] !== undefined) return sessionAnswers[key];
      }
      return undefined;
    } else {
      const key = this.getSubQuestionKey(parentStep.id, selectedValue, subQuestion.id);
      return sessionAnswers[key];
    }
  }
  
  // ---------------- Pré-remplissage générique ----------------
  static fillPrecision(opt, stepId, sessionAnswers) {
    const precisionKey = this.getPrecisionKey(stepId, opt.codeItem);
    const precisionValue = this.getValueFromSession(sessionAnswers, precisionKey);
    opt.precisionValue = precisionValue || '';
    opt.showPrecision = !!(opt.isSelected && opt.requiresPrecision);
  }
  
  static fillSelected(opt, savedStrings) {
    opt.isSelected = savedStrings.includes(opt.codeItem.toString());
  }
  
  // ---------------- Text / Spinner ----------------
  static text(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    console.log("key",key)
    step.value = sessionAnswers[key] || '';
    
  }
  
  static spinner(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    step.value = sessionAnswers[key] || '';
    if (Array.isArray(step.options)) {
      step.options.forEach(opt => {
        opt.isSelected = step.value === opt.codeItem.toString();
      });
    }
  }
  
  // ---------------- Single Choice ----------------
  static single_choice(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const stored = sessionAnswers[key] || sessionAnswers[step.id_db];
    //  const stored = sessionAnswers[step.id] || sessionAnswers[step.id_db];
    const values = typeof stored === 'object' ? stored : { [key]: stored };
    const selectedValue = values[key];
    
    step.options.forEach(opt => {
      const optValue = opt.codeItem.toString();
      opt.isSelected = selectedValue?.toString() === optValue;
      
      // Sous-questions
      if ( opt.subQuestions) {
        opt.subQuestions.forEach(subQ => {
          //  RESET TOUJOURS
          this.resetQuestionState(subQ);
          const subValue = this.getSubQuestionValue({ parentStep: step, subQuestion: subQ, sessionAnswers });
          
          
          //  S'il n'y a PAS de valeur → on s'arrête ici
          if (subValue === undefined || subValue === null || subValue === '') {
            return;
          }
          
          let fakeValue = subValue;
          if (subQ.type === 'multiple_choice' && typeof subValue === 'string' && subValue.includes('/')) {
            fakeValue = subValue.split('/');
          }
          const fakeSession = { [subQ.id]: fakeValue };
          if (typeof this[subQ.type] === 'function') {
            this[subQ.type](subQ, fakeSession);
          }
          
        });
      }
      
      // Précision
      this.fillPrecision(opt, key, sessionAnswers);
    });
  }
  
  // ---------------- Multiple Choice ----------------
  static multiple_choice(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const saved = sessionAnswers[key];
    if (!saved) {
      step.options.forEach(opt => {
        opt.isSelected = false;
        opt.precisionValue = '';
        opt.showPrecision = false;
        if (opt.subQuestions) {
          opt.subQuestions.forEach(subQ => this.resetQuestionState(subQ));
          
        }
      });
      return;
    }
    
    //  Transformer la valeur session en tableau
    let savedArray;
    if (Array.isArray(saved)) {
      savedArray = saved;
    } else if (typeof saved === 'string' && saved.includes('/')) {
      savedArray = saved.split('/'); // "1/2" -> ["1","2"]
    } else {
      savedArray = [saved];
    }
    const savedStrings = savedArray.map(v => v.toString());
    
    step.options.forEach(opt => {
      this.fillSelected(opt, savedStrings);
      this.fillPrecision(opt, key, sessionAnswers);
      
      // Pré-remplissage des sous-questions si l'option est sélectionnée
      if (opt.subQuestions) {
        opt.subQuestions.forEach(subQ => {
          
          //  RESET TOUJOURS pour les sous-questions single_choice
          if (subQ.type === 'single_choice') {
            this.resetQuestionState(subQ);
          }
          
          // Si l'option parent n'est PAS sélectionnée → on sort
          if (!opt.isSelected) return;
          
          const subValue = this.getSubQuestionValue({ 
            parentStep: step, 
            subQuestion: subQ, 
            sessionAnswers 
          });
          
          //AUCUNE reconstruction si pas de réponse
          if (subValue === undefined) {
            // reset explicite pour éviter héritage UI
            this.resetQuestionState(subQ);
            return;
          }
          
          
          let fakeValue = subValue;
          if (subQ.type === 'multiple_choice' && typeof subValue === 'string' && subValue.includes('/')) {
            fakeValue = subValue.split('/');
          }
          
          const fakeSession = { [subQ.id]: fakeValue };
          if (typeof this[subQ.type] === 'function') {
            this[subQ.type](subQ, fakeSession);
          }
        });
      }
      
    });
  }
  
  // ---------------- Autocomplete ----------------
  static autocomplete(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const saved = sessionAnswers[key];
    if (!saved) {
      step.value = '';
      step.displayValue = '';
      return;
    }
    try {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      step.value = JSON.stringify(parsed);
      
      if (step.columns) {
        const displayColumn = step.columns.find(c => c.displayInInput) || step.columns[0];
        step.displayValue = parsed[displayColumn.name] || '';
      } else {
        step.displayValue = parsed.toString();
      }
    } catch {
      step.value = saved;
      step.displayValue = saved;
    }
  }
  
  // ---------------- Accordion ----------------
  static accordion(step, sessionAnswers,keyOverride) {
    const key = keyOverride || step.id;
    const saved = sessionAnswers[key];
    if (!saved) return;
    
    const prefillQuestion = (q, sectionId) => {
      const value = saved[q.id];
      // Flags pour Mustache
      q.isText = q.type === 'text';
      q.isSpinner = q.type === 'spinner';
      q.isSingleChoice = q.type === 'single_choice';
      q.isMultipleChoice = q.type === 'multiple_choice';
      q.isAutocomplete = q.type === 'autocomplete';
      q.isGrid = q.type === 'grid';
      q.isAccordion = q.type === 'accordion';
      
      if (q.type && typeof this[q.type] === 'function') {
        const sessionForQ = {};
        if (value !== undefined) sessionForQ[q.id] = value;
        this[q.type](q, sessionForQ);
      }
      
      if (q.type === 'accordion' && Array.isArray(q.sections)) {
        q.sections.forEach(subSection => {
          subSection.questions.forEach(subQ => prefillQuestion(subQ, subSection.id_sect));
        });
      }
    };
    
    step.sections.forEach(section => {
      section.questions.forEach(q => prefillQuestion(q, section.id_sect));
    });
  }
  // ---------------- Grid pré-remplissage ----------------
  static grid(step, sessionAnswers, keyOverride) {
    const key = keyOverride || step.id;
    const savedWrapper = sessionAnswers[key];
    if (!savedWrapper || !savedWrapper.value) return;
    const saved = savedWrapper.value;
    
    step.questions.forEach(question => {
      const rowId = question.id;
      const rowValue = saved[rowId];
      
      question.columns.forEach(col => {
        const colId = col.colId?.toString();
        col.checked = false;
        if (!colId) return;
        
        // ===========================
        // CAS 1 — ROW
        // ===========================
        if (typeof rowValue === 'string') {
          if (rowValue === colId) col.checked = true;
        } else if (Array.isArray(rowValue)) {
          if (rowValue.map(v => v.toString()).includes(colId)) col.checked = true;
        } else if (typeof rowValue === 'object' && rowValue !== null) {
          // parcourir toutes les clés de rowValue
          for (const key of Object.keys(rowValue)) {
            const val = rowValue[key];
            if (!val) continue;
            
            if (typeof val === 'string') {
              // valeur simple ou concat "/"
              const parts = val.includes('/') ? val.split('/') : [val];
              if (parts.includes(colId)) {
                col.checked = true;
                break;
              }
            } else if (Array.isArray(val)) {
              if (val.map(v => v.toString()).includes(colId)) {
                col.checked = true;
                break;
              }
            }
          }
        }
        
        // ===========================
        // CAS 2 — COLUMN
        // ===========================
        const columnValue = saved[colId];
        if (!columnValue) return;
        
        if (typeof columnValue === 'string') {
          const parts = columnValue.includes('/') ? columnValue.split('/') : [columnValue];
          if (parts.includes(rowId)) col.checked = true;
        } else if (Array.isArray(columnValue)) {
          if (columnValue.map(v => v.toString()).includes(rowId)) col.checked = true;
        }
      });
    });
  }
  
  
}
