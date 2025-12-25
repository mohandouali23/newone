// AccordionUtils.js
export default class AccordionUtils {

    // Prépare les flags pour toutes les questions (Mustache)
    static prepareQuestionFlags(q) {
      return {
        ...q,
        isText: q.type === 'text',
        isSingleChoice: q.type === 'single_choice',
        isMultipleChoice: q.type === 'multiple_choice',
        isSpinner: q.type === 'spinner',
        isAutocomplete: q.type === 'autocomplete',
        isGrid: q.type === 'grid',
        isAccordion: q.type === 'accordion',
        options: q.options || [],
        rows: q.rows || [],
        columns: q.columns || [],
      };
    }
  }
  