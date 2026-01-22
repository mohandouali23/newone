import SurveyService from './SurveyService.js';

export default class AutoCompleteUtils {

  /**
   * Génère les options pour une question autocomplete
   * @param {Object} step - question autocomplete
   * @returns {Array} tableau d'options { display, inputDisplay, jsonData }
   */
  static getAutocompleteOptions(step) {
    if (!step.table) return [];

    const tableData = SurveyService.loadTable(step.table);

    return tableData.map(item => {
      // 1. Liste à afficher dans la datalist
      const displayList = [];
      // 2. Objet à envoyer au backend
      const saveObj = {};
      // 3. Valeur à afficher dans l'input
      const inputValues = [];

      step.columns.forEach(col => {
        if (col.displayInList) displayList.push(item[col.name]);
        if (col.saveInDB) saveObj[col.name] = item[col.name];
        if (col.displayInInput) inputValues.push(item[col.name]);
      });

      return {
        display: displayList.join(' - '),               // datalist
        inputDisplay: inputValues.join(' '),           // input visible
        jsonData: JSON.stringify(saveObj)              // envoyé au backend
      };
    });
  }
}
