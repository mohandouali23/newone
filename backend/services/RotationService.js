
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

  // static clearRotationForParent(session, parentId) {
  //   delete session.rotationQueue;
  //   delete session.rotationQueueDone?.[parentId];
  //   delete session.rotationState?.[parentId];
  
  //   if (session.rotationQueueDone) {
  //     delete session.rotationQueueDone[parentId];
  //   }
  
  //   if (session.rotationState) {
  //     delete session.rotationState[parentId];
  //   }
  // }
  
  // ==========================================================================
  // ROTATION INITIALIZATION
  // ==========================================================================
  static initRotation({ session, survey, answers, action, generateQueue, currentStep }) {

    if (action !== 'next') return null;
  
    const parentId = currentStep.id;
  
    // 1️⃣ Ce step n'est pas un parent de rotation
    const hasChildren = survey.steps.some(s => s.repeatFor === parentId);
    if (!hasChildren) return null;
  
    // 2️⃣ Pas de réponse → pas de rotation
    if (!answers[parentId]) return null;
  
    session.rotationState ??= {};
    session.rotationQueueDone ??= {};
  
    // 3️⃣ ⚠️ rotationQueueDone est valide UNIQUEMENT
    // si on est déjà passé par la rotation ET qu'on n'est PAS revenu au parent
    if (
      session.rotationQueueDone[parentId] &&
      session.currentStepId !== parentId
    ) {
      return null;
    }
  
    // 4️⃣ Génération de la rotation
    const queue = generateQueue(survey, parentId, answers);
  
    // 5️⃣ Pas de rotation à faire
    if (queue.length === 0) {
      session.rotationQueueDone[parentId] = true;
      return {
        type: 'NO_ROTATION',
        nextStepId: currentStep.redirection
      };
    }
  
    // 6️⃣ Init rotation
    session.rotationQueue = queue;
    session.rotationQueueDone[parentId] = true;
  
    session.history ??= [];
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
  
  // static initRotation({ session, survey, answers, action, generateQueue }) {

  //   if (action !== 'next') return null;
  //   session.rotationState ??= {};
  //   session.rotationQueueDone ??= {};
  //   // Parcours de tous les steps pour détecter une rotation à déclencher
  //   for (const step of survey.steps) {
  
  //     const parentId = step.repeatFor;
  //     if (!parentId || !answers[parentId]) continue;
  //     //  Détecter si une rotation devrait être lancée
  //     const hasRotation = session.rotationState?.[parentId]?.hasRotation;
  //     const rotationDone = session.rotationQueueDone?.[parentId];
     
  //     if (!session.rotationQueue && !rotationDone) {
  //       const queue = generateQueue(survey, parentId, answers);
      
  //       // S'il n'y a rien à répéter → rotation vide
  //       if (queue.length === 0) {
  //         session.rotationQueueDone[parentId] = true; // marque comme traitée
  //         const parent = survey.steps.find(s => s.id === parentId);
  //         return {
  //           type: 'NO_ROTATION',
  //           nextStepId: parent?.redirection || 'FIN'
  //         };
  //       }
  
  //       // --------------------------------------------------
  //       // Rotation normale
  //       // --------------------------------------------------
  //       session.rotationQueue = queue;
  //       session.rotationQueueDone[parentId] = true;
  //       session.currentStepId = queue[0].step.id;
  
  //       // Historisation du premier step de rotation
  //       session.history ??= [];
  //       session.history.push({
  //         id: queue[0].step.id,
  //         isRotation: true,
  //         wrapper: queue[0]
  //       });
  // // Reset flag de refresh
  // session.rotationState[parentId] = { needsRefresh: false };
  //       return {
  //         type: 'ROTATION_STARTED',
  //         nextStepId: queue[0].step.id
  //       };
      
  //   }
  //   }
  //   return null;
  // }

  // static initRotation({ session, survey, answers, action, generateQueue, currentStep }) {

  //   if (action !== 'next') return null;
  
  //   const parentId = currentStep.id;
  
  //   // Ce step n'a pas de rotation
  //   const hasChildren = survey.steps.some(s => s.repeatFor === parentId);
  //   if (!hasChildren) return null;
  
  //   if (!answers[parentId]) return null;
  
  //   session.rotationState ??= {};
  //   session.rotationQueueDone ??= {};
  
  //   if (session.rotationQueueDone[parentId]) return null;
  
  //   const queue = generateQueue(survey, parentId, answers);
  
  //   if (queue.length === 0) {
  //     session.rotationQueueDone[parentId] = true;
  //     return { type: 'NO_ROTATION', nextStepId: currentStep.redirection };
  //   }
  
  //   session.rotationQueue = queue;
  //   session.rotationQueueDone[parentId] = true;
  
  //   session.history ??= [];
  //   session.history.push({
  //     id: queue[0].step.id,
  //     isRotation: true,
  //     wrapper: queue[0]
  //   });
  
  //   return {
  //     type: 'ROTATION_STARTED',
  //     nextStepId: queue[0].step.id
  //   };
  // }
  
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
    if (session.rotationQueue.length === 0) {
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


static resetRotationIfNeeded(session,survey, currentStepId, answers) {
  // Vérifier si on est sur une question parent qui a une rotation
  const parentStep = survey.steps.find(step => step.id === currentStepId);
  
  if (!parentStep || !parentStep.options) return;
  
  // Vérifier si cette question a déjà lancé une rotation
  const rotationState = session.rotationState?.[currentStepId];
  
  if (rotationState) {
    // Vérifier si la réponse a changé
    const currentAnswer = answers[currentStepId];
    const originalAnswer = rotationState.originalAnswer;
    
    if (JSON.stringify(currentAnswer) !== JSON.stringify(originalAnswer)) {
      // La réponse a changé, on peut relancer une rotation
      delete session.rotationState[currentStepId];
      delete session.rotationQueueDone[currentStepId];
    }
  }
}
}
