import type { AttemptScoreResult } from '../grading/service.ts';
import type { PublishFinalScoreInput, PublishFinalScoreResult } from '../lti/services.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type {
  AttemptRecord,
  GradePublicationRecord,
  LineItemBindingRecord,
} from '../package_review/types.ts';
import type {
  GatewayBrokerDenial,
  GatewayBrokerDenialCategory,
  GatewayMutationDeniedResult,
  GatewayMutationResult,
  GatewayScoreProposalResult,
  ScoreProposal,
} from '../../sdk/app-sdk.ts';

export const RUNTIME_SANDBOX_MODEL = 'contained_browser_runtime';
export const RUNTIME_BOUNDARY = 'app_runtime_origin';

export type RuntimeSandboxModel = typeof RUNTIME_SANDBOX_MODEL;
export type RuntimeBoundary = typeof RUNTIME_BOUNDARY;
export type RuntimeDetailValue = string | number | boolean | null;
export type RuntimeBrokerDenial = GatewayBrokerDenial;
export type RuntimeBrokerDenialCategory = GatewayBrokerDenialCategory;
export type RuntimeBrokerDeniedResult = GatewayMutationDeniedResult;
export type RuntimeBrokerMutationResult = GatewayMutationResult;
export type RuntimeScoreProposal = ScoreProposal;
export type RuntimeScoreProposalResult = GatewayScoreProposalResult;

export interface RuntimeOutcome {
  type: 'deny' | 'timeout' | 'integrity_failure';
  code: string;
  message: string;
  detail: Record<string, RuntimeDetailValue>;
  status: 404 | 409 | 500;
}

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
  retryUnauthorized?: () => Promise<string>;
  now: () => Date;
  publishScore?: (input: PublishFinalScoreInput) => Promise<PublishFinalScoreResult>;
}

export interface GovernedGradePublicationResult {
  gradePublication: GradePublicationRecord;
  gradePublishedNow: boolean;
  publishError: FinalizeAttemptResult['publishError'];
}
