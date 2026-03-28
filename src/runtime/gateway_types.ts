import type { AttemptScoreResult } from '../grading/service.ts';
import type { PublishFinalScoreInput, PublishFinalScoreResult } from '../lti/services.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type {
  AttemptRecord,
  GradePublicationRecord,
  LineItemBindingRecord,
} from '../package_review/types.ts';

export interface FinalizeAttemptInput {
  completionState: 'completed' | 'abandoned';
}

export interface FinalizeAttemptResult {
  attempt: AttemptRecord;
  score: AttemptScoreResult;
  finalizedNow: boolean;
  lineItemBinding: LineItemBindingRecord | null;
  gradePublication: GradePublicationRecord | null;
  gradePublishedNow: boolean;
  publishError: {
    code: string;
    message: string;
    detail: Record<string, unknown>;
  } | null;
}

export interface GovernedGradePublicationInput {
  repository: Pick<PackageReviewRepository, 'updateGradePublication'>;
  attemptId: string;
  publication: Pick<
    GradePublicationRecord,
    'lineItemUrl' | 'platformUserId' | 'scoreGiven' | 'scoreMaximum' | 'activityProgress'
  >;
  accessToken: string;
  now: () => Date;
  publishScore?: (input: PublishFinalScoreInput) => Promise<PublishFinalScoreResult>;
}

export interface GovernedGradePublicationResult {
  gradePublication: GradePublicationRecord;
  gradePublishedNow: boolean;
  publishError: FinalizeAttemptResult['publishError'];
}
