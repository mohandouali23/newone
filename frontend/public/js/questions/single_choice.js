// document.addEventListener('DOMContentLoaded', () => {
//     // Toutes les questions single_choice
//     document.querySelectorAll('.question-block').forEach(block => {
//       const radios = block.querySelectorAll('input[type=radio]');
  
//       const updateSubQuestions = () => {
//         radios.forEach(radio => {
//           const subBlock = block.querySelector(`.sub-questions[data-parent="${radio.value}"]`);
//           if (subBlock) {
//             if (radio.checked) {
//               subBlock.style.display = 'block';
//             } else {
//               subBlock.style.display = 'none';
//             }
//           }
//         });
//       };
  
//       // Au changement d'une radio
//       radios.forEach(radio => {
//         radio.addEventListener('change', updateSubQuestions);
//       });
  
//       // Initialisation au chargement
//       updateSubQuestions();
//     });
//   });
  