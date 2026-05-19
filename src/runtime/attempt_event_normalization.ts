import type { AttemptEvent, NormalizedAttemptEvent } from '../../sdk/app-sdk.ts';

export function normalizeAttemptEvent(event: AttemptEvent): NormalizedAttemptEvent {
  switch (event.type) {
    case 'answer':
      return {
        eventType: event.type,
        learningVerb: 'answered',
        objectId: event.questionId,
        objectType: 'question',
        result: {
          response: event.answer,
          success: event.correct ?? null,
          scoreGiven: event.scoreGiven ?? null,
          scoreMaximum: event.scoreMaximum ?? null,
        },
        timestamp: event.timestamp,
      };
    case 'progress':
      return {
        eventType: event.type,
        learningVerb: 'progressed',
        objectId: event.checkpoint,
        objectType: 'checkpoint',
        result: {
          value: event.value,
        },
        timestamp: event.timestamp,
      };
    case 'complete':
      return {
        eventType: event.type,
        learningVerb: 'completed',
        objectId: 'activity',
        objectType: 'activity',
        result: {
          completionState: 'completed',
        },
        timestamp: event.timestamp,
      };
  }
}
