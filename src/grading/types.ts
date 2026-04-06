import type {
  AttemptEventRecord,
  AttemptRecord,
  GradingSettings,
} from '../package_review/types.ts';

export interface RawReviewedRubricRule {
  question_id: string;
  correct_answer: string | string[];
  points: number;
}

export interface RawReviewedRubric {
  mode: 'per-answer';
  max_score: number;
  rules: RawReviewedRubricRule[];
}

export interface ReviewedRubricRule {
  questionId: string;
  correctAnswer: string | string[];
  points: number;
}

export interface ReviewedRubric {
  mode: 'per-answer';
  maxScore: number;
  rules: ReviewedRubricRule[];
}

export interface ScoreAttemptInput {
  attempt: AttemptRecord;
  events: AttemptEventRecord[];
  grading: GradingSettings;
  rubric?: ReviewedRubric;
}

export interface AttemptScoreResult {
  scoreGiven: number;
  scoreMaximum: number;
}
