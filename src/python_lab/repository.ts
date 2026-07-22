import type { CodeRunPhase, CodeSubmissionEvaluation } from './service.ts';

export type PythonLabState = 'generating' | 'ready' | 'failed' | 'expired';
export type PythonLabRequestStatus = 'new' | 'contacted' | 'closed';

export interface CodeAssignmentDefinitionRecord {
  readonly packageVersionId: number;
  readonly functionName: string;
  readonly privateArtifactKey: string;
  readonly createdAt: string;
}

export interface CodeSubmissionRunRecord {
  readonly runId: string;
  readonly attemptId: string;
  readonly sourceArtifactKey: string;
  readonly phase: Extract<CodeRunPhase, 'final'>;
  readonly publicOutcomes: CodeSubmissionEvaluation['publicOutcomes'];
  readonly hiddenSummary: NonNullable<CodeSubmissionEvaluation['hiddenSummary']>;
  readonly scoreGiven: number;
  readonly scoreMaximum: number;
  readonly createdAt: string;
  readonly sourcePersistedAt: string | null;
  readonly finalizedAt: string;
}

export type CodeSubmissionRunReservation =
  | { readonly status: 'created'; readonly run: CodeSubmissionRunRecord }
  | { readonly status: 'existing'; readonly run: CodeSubmissionRunRecord };

export interface PythonLabRecord {
  readonly labId: string;
  readonly visitorHash: string;
  readonly requestIpHash: string | null;
  readonly accessTokenHash: string;
  readonly state: PythonLabState;
  readonly authorDraft: {
    readonly title: string;
    readonly prompt: string;
    readonly starterCode: string;
    readonly functionName: string;
  };
  readonly packageVersionId: number | null;
  readonly privateArtifactKey: string | null;
  readonly failureMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export type PythonLabAdmission =
  | { readonly status: 'accepted'; readonly lab: PythonLabRecord }
  | { readonly status: 'visitor_limited' }
  | { readonly status: 'ip_limited' };

export interface PythonLabAccessRequestRecord {
  readonly requestId: string;
  readonly labId: string;
  readonly name: string;
  readonly workEmail: string;
  readonly institution: string;
  readonly status: PythonLabRequestStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export interface PythonLabRepository {
  reserveLab(input: {
    readonly lab: PythonLabRecord;
    readonly visitorDay: string;
    readonly ipWindowStartedAt: string | null;
  }): Promise<PythonLabAdmission>;
  getLabById(labId: string): Promise<PythonLabRecord | null>;
  markLabReady(input: {
    readonly labId: string;
    readonly packageVersionId: number;
    readonly privateArtifactKey: string;
    readonly updatedAt: string;
  }): Promise<PythonLabRecord>;
  markLabFailed(input: {
    readonly labId: string;
    readonly failureMessage: string;
    readonly packageVersionId?: number;
    readonly updatedAt: string;
  }): Promise<PythonLabRecord>;
  listExpiredLabs(now: string): Promise<PythonLabRecord[]>;
  deleteLab(labId: string): Promise<void>;
  createCodeAssignmentDefinition(
    record: CodeAssignmentDefinitionRecord,
  ): Promise<CodeAssignmentDefinitionRecord>;
  getCodeAssignmentDefinitionByPackageVersionId(
    packageVersionId: number,
  ): Promise<CodeAssignmentDefinitionRecord | null>;
  reserveCodeSubmissionRun(record: CodeSubmissionRunRecord): Promise<CodeSubmissionRunReservation>;
  markCodeSubmissionSourcePersisted(input: {
    readonly runId: string;
    readonly sourcePersistedAt: string;
  }): Promise<CodeSubmissionRunRecord>;
  deleteUnpersistedCodeSubmissionRun(runId: string): Promise<void>;
  getFinalCodeSubmissionRunByAttemptId(attemptId: string): Promise<CodeSubmissionRunRecord | null>;
  listSubmissionArtifactKeysByPackageVersionId(packageVersionId: number): Promise<string[]>;
  createAccessRequest(record: PythonLabAccessRequestRecord): Promise<PythonLabAccessRequestRecord>;
  listAccessRequests(): Promise<PythonLabAccessRequestRecord[]>;
  updateAccessRequestStatus(input: {
    readonly requestId: string;
    readonly status: PythonLabRequestStatus;
    readonly updatedAt: string;
  }): Promise<PythonLabAccessRequestRecord>;
  listExpiredAccessRequests(now: string): Promise<PythonLabAccessRequestRecord[]>;
  deleteAccessRequest(requestId: string): Promise<void>;
}

export function createUnavailablePythonLabRepository(message: string): PythonLabRepository {
  const unavailable = (): never => {
    throw new Error(message);
  };

  return {
    reserveLab: unavailable,
    getLabById: unavailable,
    markLabReady: unavailable,
    markLabFailed: unavailable,
    listExpiredLabs: unavailable,
    deleteLab: unavailable,
    createCodeAssignmentDefinition: unavailable,
    getCodeAssignmentDefinitionByPackageVersionId: unavailable,
    reserveCodeSubmissionRun: unavailable,
    markCodeSubmissionSourcePersisted: unavailable,
    deleteUnpersistedCodeSubmissionRun: unavailable,
    getFinalCodeSubmissionRunByAttemptId: unavailable,
    listSubmissionArtifactKeysByPackageVersionId: unavailable,
    createAccessRequest: unavailable,
    listAccessRequests: unavailable,
    updateAccessRequestStatus: unavailable,
    listExpiredAccessRequests: unavailable,
    deleteAccessRequest: unavailable,
  };
}
