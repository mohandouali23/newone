// services/RotationService.js

import RotationQueueUtils from "./RotationQueueUtils.js";

/**
 * ============================================================================
 * ROTATION SERVICE
 * ============================================================================
 * Responsabilités :
 * - Déterminer le step courant (rotation ou non)
 * - Initialiser une rotation conditionnelle
 * - Avancer dans une rotation existante
 * - Gérer la fin de rotation et la redirection
 *
 * Ce service ne décide PAS de la navigation globale,
 * il ne fait que gérer la logique de rotation.
 * ============================================================================
 */
export default class RotationService {

  // ==========================================================================
  // CURRENT STEP RESOLUTION
  // ==========================================================================

  /**
   * Détermine le step courant à afficher :
   * - Priorité à la rotation si une rotation est en cours
   * - Sinon, utilise le currentStepId de la session
   * - Sinon, initialise le questionnaire (première page)
   */
  static getCurrentStep(session, survey) {

    // --------------------------------------------------
    // Cas 1 : rotation en cours
    // --------------------------------------------------
    if (session.rotationQueue?.length) {
      const wrapper = session.rotationQueue[0];

      return {
        step: wrapper.step,
        wrapper,
        isInRotation: true
      };
    }

    // --------------------------------------------------
    // Cas 2 : navigation normale
    // --------------------------------------------------
    if (session.currentStepId) {
      return {
        step: survey.steps.find(step => step.id === session.currentStepId),
        isInRotation: false
      };
    }

    // --------------------------------------------------
    // Cas 3 : démarrage du questionnaire
    // --------------------------------------------------
    const firstStep = survey.steps
      .filter(step => step.page !== undefined)
      .sort((a, b) => a.page - b.page)[0];

    session.currentStepId = firstStep.id;

    return {
      step: firstStep,
      isInRotation: false
    };
  }

  // ==========================================================================
  // ROTATION INITIALIZATION
  // ==========================================================================

  /**
   * Initialise une rotation si :
   * - l’action est "next"
   * - aucune rotation n’est déjà active
   * - une question possède repeatFor
   * - la condition de répétition est remplie
   */
  static initRotation({ session, survey, answers, action, generateQueue }) {

    // Une rotation ne démarre que sur "next" et si aucune rotation active
    if (action !== 'next' || session.rotationQueue) return null;

    // Parcours de tous les steps pour détecter une rotation à déclencher
    for (const step of survey.steps) {

      const parentId = step.repeatFor;

      if (
        parentId &&
        answers[parentId] &&
        !session.rotationQueueDone[parentId]
      ) {

        // Génération de la file de rotation
        const queue = RotationQueueUtils.generateRotationQueue(
          survey,
          parentId,
          answers
        );

        // Marquer cette rotation comme déjà traitée
        session.rotationQueueDone[parentId] = true;

        // --------------------------------------------------
        // Cas : rotation exclusive (aucune entrée)
        // --------------------------------------------------
        if (queue.length === 0) {
          const parent = survey.steps.find(s => s.id === parentId);

          return {
            type: 'NO_ROTATION',
            nextStepId: parent?.redirection || 'FIN'
          };
        }

        // --------------------------------------------------
        // Cas : rotation normale
        // --------------------------------------------------
        session.rotationQueue = queue;
        session.currentStepId = queue[0].step.id;

        // Historisation immédiate du premier step de rotation
        session.history.push({
          id: queue[0].step.id,
          isRotation: true,
          wrapper: queue[0]
        });

        return {
          type: 'ROTATION_STARTED',
          nextStepId: queue[0].step.id
        };
      }
    }

    return null;
  }

  // ==========================================================================
  // ROTATION ADVANCEMENT
  // ==========================================================================

  /**
   * Avance dans une rotation existante :
   * - retire le step courant de la queue
   * - retourne le suivant s’il existe
   * - gère la fin de rotation
   */
  static advanceRotation({ session, survey, currentStep, action }) {

    // Aucune rotation active
    if (!session.rotationQueue?.length) return null;

    // Navigation arrière → rester sur le même step
    if (action !== 'next') {
      return { nextStepId: currentStep.id };
    }

    // Retirer le step courant de la rotation
    const processed = session.rotationQueue.shift();

    // --------------------------------------------------
    // Cas : il reste des éléments dans la rotation
    // --------------------------------------------------
    if (session.rotationQueue.length > 0) {
      return {
        nextStepId: session.rotationQueue[0].step.id
      };
    }

    // --------------------------------------------------
    // Cas : fin de rotation
    // --------------------------------------------------
    delete session.rotationQueue;

    const parent = survey.steps.find(step => step.id === processed.parent);

    // Redirection explicite définie sur le parent
    if (parent?.redirection) {
      return { nextStepId: parent.redirection };
    }

    // Fallback → la navigation sera résolue ailleurs
    return {
      nextStepId: null,
      fallbackFrom: processed.step
    };
  }
}


// import RotationQueueUtils from "./RotationQueueUtils.js";

// export default class RotationService {
  
//   static getCurrentStep(session, survey) {
//     if (session.rotationQueue?.length) {
//       const wrapper = session.rotationQueue[0];
//       return {
//         step: wrapper.step,
//         wrapper,
//         isInRotation: true
//       };
//     }
    
//     if (session.currentStepId) {
//       return {
//         step: survey.steps.find(s => s.id === session.currentStepId),
//         isInRotation: false
//       };
//     }
    
//     // démarrage questionnaire
//     const first = survey.steps
//     .filter(s => s.page !== undefined)
//     .sort((a, b) => a.page - b.page)[0];
    
//     session.currentStepId = first.id;
    
//     return {
//       step: first,
//       isInRotation: false
//     };
//   }
  
//   static initRotation({ session, survey, answers, action, generateQueue }) {
//     if (action !== 'next' || session.rotationQueue) return null;
    
//     for (const step of survey.steps) {
//       if (
//         step.repeatFor &&
//         answers[step.repeatFor] &&
//         !session.rotationQueueDone[step.repeatFor]
//       ) {
//         const queue = RotationQueueUtils.generateRotationQueue(survey, step.repeatFor, answers);
//         //console.log('queue',queue)
//         session.rotationQueueDone[step.repeatFor] = true;
        
//         //  exclusive → pas de rotation
//         if (queue.length === 0) {
//           const parent = survey.steps.find(s => s.id === step.repeatFor);
//           return {
//             type: 'NO_ROTATION',
//             nextStepId: parent?.redirection || 'FIN'
//           };
//         }
        
//         //  rotation normale
//         session.rotationQueue = queue;
//         session.currentStepId = queue[0].step.id;
//         // AJOUT ICI
//         session.history.push({
//           id: queue[0].step.id,
//           isRotation: true,
//           wrapper: queue[0]
//         });
//         return {
//           type: 'ROTATION_STARTED',
//           nextStepId: queue[0].step.id
//         };
//       }
//     }
    
//     return null;
//   }
  
//   static advanceRotation({ session, survey, currentStep, action }) {
//     if (!session.rotationQueue?.length) return null;
    
//     if (action !== 'next') {
//       return { nextStepId: currentStep.id };
//     }
    
//     const processed = session.rotationQueue.shift();
    
//     // reste de la rotation
//     if (session.rotationQueue.length > 0) {
//       return {
//         nextStepId: session.rotationQueue[0].step.id
//       };
//     }
//     // fin rotation
//     delete session.rotationQueue;
    
//     const parent = survey.steps.find(s => s.id === processed.parent);
    
//     if (parent?.redirection) {
//       return { nextStepId: parent.redirection };
//     }
    
//     return {
//       nextStepId: null,
//       fallbackFrom: processed.step
//     };
//   }
// }