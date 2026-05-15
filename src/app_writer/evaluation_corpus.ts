import type { AppWriterStarterId } from './types.ts';

export interface AppWriterEvaluationPrompt {
  id: string;
  promptText: string;
  expectedStarterId: AppWriterStarterId;
  requiredSignals: string[];
}

export const APP_WRITER_EVALUATION_PROMPTS: readonly AppWriterEvaluationPrompt[] = [
  {
    id: 'phonics-game',
    promptText:
      'Create a playful phonics matching game for first graders using these 100 words. Learners should hear or read a sound pattern and choose the matching word.',
    expectedStarterId: 'simple-activity',
    requiredSignals: ['matching', 'phonics', 'completion grading', 'preview title assertion'],
  },
  {
    id: 'flashcards',
    promptText:
      'Create a quick flashcard review app for biology vocabulary. Learners should reveal definitions, mark confidence, and complete the deck.',
    expectedStarterId: 'simple-activity',
    requiredSignals: ['flashcards', 'read activity content', 'attempt events'],
  },
  {
    id: 'matching-activity',
    promptText:
      'Create a matching activity where students pair historical events with dates and get completion credit.',
    expectedStarterId: 'simple-activity',
    requiredSignals: ['matching', 'buttons', 'completion'],
  },
  {
    id: 'sorting-activity',
    promptText:
      'Create a sorting activity where learners drag examples into renewable and nonrenewable energy categories.',
    expectedStarterId: 'simple-activity',
    requiredSignals: ['sorting', 'categories', 'accessible controls'],
  },
  {
    id: 'short-simulation',
    promptText:
      'Create a short simulation that lets students adjust force and mass, observe acceleration, and answer a reflection prompt.',
    expectedStarterId: 'simple-activity',
    requiredSignals: ['simulation', 'interactive controls', 'reflection'],
  },
  {
    id: 'browser-autograder-repair',
    promptText:
      'Create an autograder that checks a submitted web page for semantic headings, alt text, and a visible call to action.',
    expectedStarterId: 'browser-autograder',
    requiredSignals: ['browser grading', 'evidence artifact', 'grader spec'],
  },
] as const;
