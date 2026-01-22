// document.addEventListener('DOMContentLoaded', () => {
//     const autocompletes = document.querySelectorAll('.autocomplete-input');
//     if (!autocompletes.length) return;
  
//     autocompletes.forEach(input => {
//       const form = document.getElementById('surveyForm');
//       if (!form) return;
  
//       const datalist = document.getElementById(input.getAttribute('list'));
//       if (!datalist) return;
  
//       // Afficher inputDisplay après sélection
//       input.addEventListener('input', () => {
//         const option = Array.from(datalist.options)
//           .find(opt => opt.value === input.value);
//         if (option) {
//           input.value = option.dataset.input;
//         }
//       });
  
//       // Avant soumission, envoyer JSON avec saveInDB
//       form.addEventListener('submit', () => {
//         const option = Array.from(datalist.options)
//           .find(opt => opt.value === input.value || opt.dataset.input === input.value);
//         if (option) {
//           input.value = option.dataset.json; // valeur JSON côté serveur
//         }
//       });
//     });
//   });
  