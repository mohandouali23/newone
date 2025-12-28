export default class ResponseNormalizer {
    static normalize(step, rawValue, precisionValue = null) {
      let value;
  console.log("rawvalue normlize",rawValue)
      switch(step.type) {
        
        case 'gridB': {
          value = {};
          console.log('step.columns:', step.columns);
        
          // Initialisation
          step.rows.forEach(row => {
            step.columns.forEach(col => {
              if (col.input?.type === 'checkbox' && col.input.axis === 'row') {
                value[row.id] = []; // initialisation par ligne
              }
              if (col.input?.type === 'radio' && col.input.axis === 'row') {
                value[row.id] = null; // initialisation par ligne
              }
              if (col.input?.type === 'checkbox' && col.input.axis === 'column') {
                if (!value[col.id]) value[col.id] = []; // initialisation par colonne
              }
              if (col.input?.type === 'radio' && col.input.axis === 'column') {
                value[col.id] = null; // initialisation par colonne
              }
            });
          });
        
          console.log('value init', value);
        
          // Remplissage
          step.rows.forEach(row => {
            step.columns.forEach(col => {
              const cellValue = rawValue?.[row.id];
        
              if (col.input?.type === 'checkbox' && col.input.axis === 'row') {
                const cellValue = rawValue?.[row.id]; // ex: { daily: ['bus'], weekly: ['bus'] }
                if (!cellValue) return;
              
                Object.keys(cellValue).forEach(colId => {
                  const vals = Array.isArray(cellValue[colId]) ? cellValue[colId] : [cellValue[colId]];
                  vals.forEach(v => {
                    value[row.id].push({ value: colId, label: step.columns.find(c => c.id === colId)?.label });
                  });
                });
              }
              
        
              if (col.input?.type === 'radio' && col.input.axis === 'row') {
                if (cellValue === col.id) {
                  value[row.id] = { value: col.id, label: col.label };
                }
              }
        
              if (col.input?.type === 'checkbox' && col.input.axis === 'column') {
                const colValue = rawValue?.[row.id]?.[col.id];
                if (!colValue) return;
        
                const vals = Array.isArray(colValue) ? colValue : [colValue];
                vals.forEach(v => {
                  if (!value[col.id].some(a => a.value === v)) {
                    value[col.id].push({ value: v, label: row.label });
                  }
                });
              }
        
              if (col.input?.type === 'radio' && col.input.axis === 'column') {
                const selectedRowId = rawValue?.[col.id];
                if (!selectedRowId) return;
        
                const rowLabel = step.rows.find(r => r.id === selectedRowId)?.label;
                if (!rowLabel) return;
        
                value[col.id] = { value: selectedRowId, label: rowLabel };
              }
            });
          });
        
          console.log('value final', value);
          break;
        }
        
case 'gridA': {
  value = {};

  // Initialisation
  step.columns.forEach(col => {
    if (col.type === 'multiple_choice') value[col.id] = [];
    if (col.type === 'single_choice') value[col.id] = null;
  });

  // MULTIPLE CHOICE → parcourir lignes
  step.rows.forEach(row => {
    step.columns.forEach(col => {
      if (col.type !== 'multiple_choice') return;

      const colValue = rawValue?.[row.id]?.[col.id];
      if (!colValue) return;

      const vals = Array.isArray(colValue) ? colValue : [colValue];
      vals.forEach(v => {
        if (!value[col.id].some(a => a.value === v)) {
          value[col.id].push({
            value: v,
            label: row.label
          });
        }
      });
    });
  });

  // SINGLE CHOICE → lecture directe par colonne
  step.columns.forEach(col => {
    if (col.type !== 'single_choice') return;

    const selectedRowId = rawValue?.[col.id];
    if (!selectedRowId) return;

    const row = step.rows.find(r => r.id === selectedRowId);
    if (!row) return;

    value[col.id] = {
      value: selectedRowId,
      label: row.label
    };
  });

  break;
}

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
  
  
  case 'grid': {
  value = {};

  const rowIds = Object.keys(rawValue || {});

  rowIds.forEach(rowId => {
    // 1️⃣ retrouver la ligne par ID (IMPORTANT)
    const row = step.rows.find(r => String(r.id) === String(rowId));
    if (!row) return;

    // 2️⃣ normaliser les valeurs (toujours un tableau)
    const vals = Array.isArray(rawValue[rowId])
      ? rawValue[rowId]
      : rawValue[rowId]
        ? [rawValue[rowId]]
        : [];

    // 3️⃣ initialiser la ligne si absente
    if (!value[row.id]) {
      value[row.id] = {
        label: row.label,
        id:row.id,
        answers: []
      };
    }

    // 4️⃣ ajouter les colonnes sélectionnées
    vals.forEach(v => {
      const col = step.columns.find(c => String(c.value) === String(v));
      if (!col) return;

      // éviter les doublons
      if (!value[row.id].answers.some(a => a.value === v)) {
        value[row.id].answers.push({
          value: v,
          label: col.label
        });
      }
    });
  });

  break;
}

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
  