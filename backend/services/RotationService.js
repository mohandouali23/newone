// services/RotationService.js

import RotationQueueUtils from "./RotationQueueUtils.js";

export default class RotationService {

  static getCurrentStep(session, survey) {
    if (session.rotationQueue?.length) {
      const wrapper = session.rotationQueue[0];
      return {
        step: wrapper.step,
        wrapper,
        isInRotation: true
      };
    }

    if (session.currentStepId) {
      return {
        step: survey.steps.find(s => s.id === session.currentStepId),
        isInRotation: false
      };
    }

    // démarrage questionnaire
    const first = survey.steps
      .filter(s => s.page !== undefined)
      .sort((a, b) => a.page - b.page)[0];

    session.currentStepId = first.id;

    return {
      step: first,
      isInRotation: false
    };
  }

  static initRotation({ session, survey, answers, action, generateQueue }) {
    if (action !== 'next' || session.rotationQueue) return null;

    for (const step of survey.steps) {
      if (
        step.repeatFor &&
        answers[step.repeatFor] &&
        !session.rotationQueueDone[step.repeatFor]
      ) {
        const queue = RotationQueueUtils.generateRotationQueue(survey, step.repeatFor, answers);
//console.log('queue',queue)
        session.rotationQueueDone[step.repeatFor] = true;

        //  exclusive → pas de rotation
        if (queue.length === 0) {
          const parent = survey.steps.find(s => s.id === step.repeatFor);
          return {
            type: 'NO_ROTATION',
            nextStepId: parent?.redirection || 'FIN'
          };
        }

        //  rotation normale
        session.rotationQueue = queue;
        session.currentStepId = queue[0].step.id;
// ✅ AJOUT ICI
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

  static advanceRotation({ session, survey, currentStep, action }) {
    if (!session.rotationQueue?.length) return null;

    if (action !== 'next') {
      return { nextStepId: currentStep.id };
    }

    const processed = session.rotationQueue.shift();

    // reste de la rotation
    if (session.rotationQueue.length > 0) {
      return {
        nextStepId: session.rotationQueue[0].step.id
      };
    }

    // fin rotation
    delete session.rotationQueue;

    const parent = survey.steps.find(s => s.id === processed.parent);

    if (parent?.redirection) {
      return { nextStepId: parent.redirection };
    }

    return {
      nextStepId: null,
      fallbackFrom: processed.step
    };
  }
}