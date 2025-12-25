export default class ResponseNormalizer {
    static normalize(step, rawValue, precisionValue = null) {
      let value;
  
      switch(step.type) {
  
        case 'accordion': {
          value = [];
        
          step.sections.forEach(section => {
            const sectionAnswers = [];
        
            section.questions.forEach(q => {
              const raw = rawValue?.[q.id];
        
              if (raw !== undefined) {
                const normalized = ResponseNormalizer.normalize(q, raw, precisionValue);
                sectionAnswers.push(normalized);
              }
            });
        
            value.push({
              sectionId: section.id,
              answers: sectionAnswers
            });
          });
        
          break;
        }
        
        case 'text':
        case 'spinner':
          value = rawValue;
          break;
  
          case 'single_choice': {
            const selectedOption = step.options.find(
              o => String(o.codeItem) === String(rawValue)
            );
            if (!selectedOption) {
              value = null;
            }else if (selectedOption.requiresPrecision) {
              value = { 
                 codeItem: selectedOption.codeItem,
                  label: selectedOption.label ,
                   precision: precisionValue?.[selectedOption.codeItem] || ''
                  };
            } else {
              value = { codeItem: selectedOption.codeItem, label: selectedOption.label };
            }
            break;
          }
  
         
          case 'multiple_choice': {
            const selectedCodes = Array.isArray(rawValue) ? rawValue : [rawValue];
          
            // Si un choix exclusif est sélectionné, ne garder que lui
            const exclusiveOption = step.options.find(o => o.exclusive && selectedCodes.includes(String(o.codeItem)));
            let filteredCodes = selectedCodes;
            if(exclusiveOption) filteredCodes = [String(exclusiveOption.codeItem)];
          
            value = step.options
              .filter(o => filteredCodes.includes(String(o.codeItem)))
              .map(o => {
                let v = { codeItem: o.codeItem, label: o.label };

                if (o.requiresPrecision)   v.precision =precisionValue[o.codeItem] || '' ;
                // Sous-question
            if(o.requiresSubQst) {
              const subRaw = rawValue[`sub_${o.codeItem}`] || null;
              v.subAnswer = ResponseNormalizer.normalize(o.requiresSubQst, subRaw, precisionValue);
            }
                
                return v;
              });
            break;
          }
        case 'autocomplete':
          try {
            value = JSON.parse(rawValue); // doit être envoyé comme JSON depuis le front
          } catch(e) {
            value = rawValue || null;
          }
          break;
  //         case 'grid':
  // // rawValue = { rowId: [values] }
  // value = [];
  // for (const [rowId, vals] of Object.entries(rawValue || {})) {
  //   const arr = Array.isArray(vals) ? vals : (vals ? [vals] : []);
  //   arr.forEach(v => {
  //     const col = step.columns.find(c => String(c.value) === String(v));
  //     value.push({
  //       rowId,
  //       value: v,
  //       label: col ? col.label : v
  //     });
  //   });
  // }
  // break;

  case 'grid':
    value = [];
    const rowIds = Object.keys(rawValue || {});
    rowIds.forEach((rowIndex, i) => {
      const vals = Array.isArray(rawValue[rowIndex]) ? rawValue[rowIndex] : (rawValue[rowIndex] ? [rawValue[rowIndex]] : []);
      const row = step.rows[i]; // on prend la ligne correspondante par index
      const rowLabel = row ? row.label : rowIndex;
  
      vals.forEach(v => {
        const col = step.columns.find(c => String(c.value) === String(v));
        value.push({
          rowLabel,
          value: v,
          label: col ? col.label : v
        });
      });
    });
    break;    
  
        default:
          value = rawValue;
          break;
      }
  
      return {
        questionId: step.id,
        type: step.type,
        value
      };
    }
  }
  