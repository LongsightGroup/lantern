import {
  buildLtiActivityResourceId,
  type LmsType,
  type RuntimeSessionRecord,
} from '../lti/types.ts';
import type {
  AttemptRecord,
  GradePublicationRecord,
  PackageVersionRecord,
} from '../package_review/types.ts';

export interface ManagedLineItemSpec {
  resourceId: string;
  tag: string;
  label: string;
  scoreMaximum: number;
}

export function buildFinalGradeLineItemSpec(input: {
  session: RuntimeSessionRecord;
  packageVersion: Pick<PackageVersionRecord, 'title'>;
  scoreMaximum: number;
}): ManagedLineItemSpec {
  return {
    resourceId: buildLineItemResourceId(input.session),
    tag: 'final-grade',
    label: `${input.packageVersion.title} Final Grade`,
    scoreMaximum: input.scoreMaximum,
  };
}

export function buildSmokeVerificationLineItemSpec(input: {
  appId: string;
  appTitle: string;
  lms: LmsType;
}): ManagedLineItemSpec {
  return {
    resourceId: `lantern:${input.appId}:${input.lms}:smoke`,
    tag: 'smoke-verification',
    label: `${input.appTitle} Smoke Verification`,
    scoreMaximum: 1,
  };
}

export function resolveActivityProgress(
  attempt: AttemptRecord,
): GradePublicationRecord['activityProgress'] {
  return attempt.completionState === 'completed' ? 'Completed' : 'InProgress';
}

function buildLineItemResourceId(session: RuntimeSessionRecord): string {
  return buildLtiActivityResourceId({
    appId: session.appId,
    packageVersion: session.packageVersion,
    activityId: session.launch.activityId,
  });
}
