// import ToastService from './ToastService.js';

// async function submitStep() {
//   try {
//     const res = await fetch(window.location.pathname, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ action: 'next' })
//     });

//     const data = await res.json();

//     // ❌ Validation backend échouée
//     if (!res.ok && data.success === false) {
//       data.messages.forEach(msg =>
//         ToastService.show(msg, {
//           type: 'error',
//           duration: 4000
//         })
//       );
//       return; // ⛔ rester sur la même page
//     }

//     // ✅ Succès → reload pour afficher l’étape suivante
//     window.location.reload();

//   } catch (err) {
//     ToastService.show('Erreur serveur', { type: 'error' });
//     console.error(err);
//   }
// }


import initPrecisionManager from './precisionManager.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM chargé, JS fonctionne ');
  initPrecisionManager();
  const stepType = document.querySelector('.survey')?.dataset.stepType;
  console.log('stepType:', stepType);

  if (stepType) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/assets/css/questions/${stepType}.css`;
    document.head.appendChild(link);
    console.log('CSS dynamique injecté ', link.href);
  }
});

