import { compare, parse } from "@std/semver";
import type {
  DeploymentBinding,
  LoginStateRecord,
  RuntimeSessionRecord,
} from "../lti/types.ts";
import type { ImportedPackageVersion } from "../package_review/intake.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  ApprovalStatus,
  AttemptEventRecord,
  AttemptRecord,
  AuditEventRecord,
  CanvasLineItemBindingRecord,
  DeploymentRecord,
  GradePublicationRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";

const DEFAULT_IMPORTED_AT = "2026-03-23T17:30:00Z";
const DEFAULT_REVIEWED_AT = "2026-03-23T18:05:00Z";
const DEFAULT_UPDATED_AT = "2026-03-23T18:15:00Z";
const DEFAULT_PHASE3_AT = "2026-03-24T02:30:00Z";

export function buildPackageVersionRecord(
  overrides: Partial<PackageVersionRecord> = {},
): PackageVersionRecord {
  return {
    id: 1,
    appId: "chapter-4-asteroids",
    version: "0.1.0",
    title: "Chapter 4 Asteroids",
    description: "Shoot the correct vocabulary target.",
    owner: {
      type: "user",
      id: "instructor_123",
    },
    entrypoint: "/dist/index.html",
    roles: ["learner", "instructor"],
    installScope: "course",
    capabilities: [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "finalize_attempt",
      "read_local_state",
      "write_local_state",
    ],
    grading: {
      mode: "declarative",
      rubricFile: "/scoring/rubric.json",
      maxScore: 100,
    },
    approvalStatus: "pending",
    reviewNotes: null,
    reviewedAt: null,
    validationIssues: [],
    manifestJson: {
      app_id: "chapter-4-asteroids",
      version: "0.1.0",
      title: "Chapter 4 Asteroids",
    },
    artifact: {
      snapshotRoot: "var/packages/chapter-4-asteroids/0.1.0",
      manifestPath: "var/packages/chapter-4-asteroids/0.1.0/manifest.json",
      entrypointPath: "var/packages/chapter-4-asteroids/0.1.0/dist/index.html",
      digest: "sha256:chapter-4-asteroids-0.1.0",
    },
    importedAt: DEFAULT_IMPORTED_AT,
    ...overrides,
  };
}

export function buildImportedPackageVersion(
  overrides: Partial<PackageVersionRecord> = {},
): ImportedPackageVersion {
  const record = buildPackageVersionRecord(overrides);

  return {
    reviewData: {
      appId: record.appId,
      version: record.version,
      title: record.title,
      description: record.description,
      owner: record.owner,
      entrypoint: record.entrypoint,
      roles: record.roles,
      installScope: record.installScope,
      capabilities: record.capabilities,
      grading: record.grading,
      manifestJson: record.manifestJson,
      validationIssues: record.validationIssues,
    },
    artifact: record.artifact,
  };
}

export function buildDeploymentRecord(
  overrides: Partial<DeploymentRecord> = {},
): DeploymentRecord {
  return {
    id: 1,
    slug: "chapter-4-asteroids-pilot",
    label: "Chapter 4 Asteroids Pilot Deployment",
    appId: "chapter-4-asteroids",
    enabledPackageVersionId: 1,
    enabledPackageVersion: "0.1.0",
    binding: null,
    updatedAt: DEFAULT_UPDATED_AT,
    ...overrides,
  };
}

export function buildAttemptRecord(
  overrides: Partial<AttemptRecord> = {},
): AttemptRecord {
  return {
    id: overrides.id ?? 1,
    attemptId: overrides.attemptId ?? "attempt-123",
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? "chapter-4-asteroids-pilot",
    appId: overrides.appId ?? "chapter-4-asteroids",
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? "0.1.0",
    userId: overrides.userId ?? "canvas-user-123",
    userRole: overrides.userRole ?? "learner",
    contextId: overrides.contextId ?? "course-42",
    resourceLinkId: overrides.resourceLinkId ?? "resource-link-123",
    activityId: overrides.activityId ?? "activity-123",
    status: overrides.status ?? "in_progress",
    completionState: overrides.completionState ?? null,
    startedAt: overrides.startedAt ?? DEFAULT_PHASE3_AT,
    finalizedAt: overrides.finalizedAt ?? null,
  };
}

export function buildAttemptEventRecord(
  overrides: Partial<AttemptEventRecord> = {},
): AttemptEventRecord {
  return {
    id: overrides.id ?? 1,
    attemptId: overrides.attemptId ?? "attempt-123",
    sequence: overrides.sequence ?? 1,
    eventType: overrides.eventType ?? "answer",
    event: overrides.event ?? {
      type: "answer",
      questionId: "q1",
      answer: "asteroid",
      timestamp: DEFAULT_PHASE3_AT,
    },
    receivedAt: overrides.receivedAt ?? DEFAULT_PHASE3_AT,
  };
}

export function buildCanvasLineItemBindingRecord(
  overrides: Partial<CanvasLineItemBindingRecord> = {},
): CanvasLineItemBindingRecord {
  return {
    id: overrides.id ?? 1,
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    packageVersionId: overrides.packageVersionId ?? 1,
    contextId: overrides.contextId ?? "course-42",
    resourceLinkId: overrides.resourceLinkId ?? "resource-link-123",
    activityId: overrides.activityId ?? "activity-123",
    lineItemsUrl: overrides.lineItemsUrl ??
      "https://canvas.example/api/lti/courses/42/line_items",
    lineItemUrl: overrides.lineItemUrl ??
      "https://canvas.example/api/lti/courses/42/line_items/9",
    resourceId: overrides.resourceId ?? "chapter-4-asteroids:0.1.0",
    tag: overrides.tag ?? "final-grade",
    label: overrides.label ?? "Chapter 4 Asteroids Final Grade",
    scoreMaximum: overrides.scoreMaximum ?? 100,
    createdAt: overrides.createdAt ?? DEFAULT_PHASE3_AT,
    updatedAt: overrides.updatedAt ?? DEFAULT_PHASE3_AT,
  };
}

export function buildGradePublicationRecord(
  overrides: Partial<GradePublicationRecord> = {},
): GradePublicationRecord {
  return {
    id: overrides.id ?? 1,
    attemptId: overrides.attemptId ?? "attempt-123",
    lineItemBindingId: overrides.lineItemBindingId ?? 1,
    lineItemUrl: overrides.lineItemUrl ??
      "https://canvas.example/api/lti/courses/42/line_items/9",
    canvasUserId: overrides.canvasUserId ?? "canvas-user-123",
    scoreGiven: overrides.scoreGiven ?? 85,
    scoreMaximum: overrides.scoreMaximum ?? 100,
    activityProgress: overrides.activityProgress ?? "Completed",
    gradingProgress: overrides.gradingProgress ?? "FullyGraded",
    status: overrides.status ?? "published",
    createdAt: overrides.createdAt ?? DEFAULT_PHASE3_AT,
    updatedAt: overrides.updatedAt ?? DEFAULT_PHASE3_AT,
    publishedAt: overrides.publishedAt ?? DEFAULT_PHASE3_AT,
    errorCode: overrides.errorCode ?? null,
    errorDetail: overrides.errorDetail ?? null,
  };
}

export function buildAuditEventRecord(
  overrides: Partial<AuditEventRecord> = {},
): AuditEventRecord {
  return {
    id: overrides.id ?? 1,
    eventType: overrides.eventType ?? "attempt.submitted",
    actorType: overrides.actorType ?? "system",
    actorId: overrides.actorId ?? null,
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    packageVersionId: overrides.packageVersionId ?? 1,
    attemptId: overrides.attemptId ?? "attempt-123",
    lineItemBindingId: overrides.lineItemBindingId ?? null,
    status: overrides.status ?? "accepted",
    summary: overrides.summary ?? "Accepted attempt submission.",
    detail: overrides.detail ?? {
      route: "/runtime/sessions/runtime-session-123/attempt-events",
    },
    occurredAt: overrides.occurredAt ?? DEFAULT_PHASE3_AT,
  };
}

export function createInMemoryPackageReviewRepository(
  options: {
    packageVersions?: PackageVersionRecord[];
    deployments?: DeploymentRecord[];
    attempts?: AttemptRecord[];
    attemptEvents?: AttemptEventRecord[];
    auditEvents?: AuditEventRecord[];
    loginStates?: LoginStateRecord[];
    runtimeSessions?: RuntimeSessionRecord[];
  } = {},
): PackageReviewRepository {
  const packageVersions = [...(options.packageVersions ?? [])];
  const deployments = [...(options.deployments ?? [])];
  const attempts = [...(options.attempts ?? [])];
  const attemptEvents = [...(options.attemptEvents ?? [])];
  const auditEvents = [...(options.auditEvents ?? [])];
  const loginStates = [...(options.loginStates ?? [])];
  const runtimeSessions = [...(options.runtimeSessions ?? [])];

  return {
    registerPackageVersion(input) {
      const existing = packageVersions.find((record) =>
        record.appId === input.reviewData.appId &&
        record.version === input.reviewData.version
      );

      if (existing) {
        throw new Error(
          `Package version ${input.reviewData.appId}@${input.reviewData.version} already exists and cannot be replaced.`,
        );
      }

      const nextRecord = buildPackageVersionRecord({
        id: nextId(packageVersions),
        appId: input.reviewData.appId,
        version: input.reviewData.version,
        title: input.reviewData.title,
        description: input.reviewData.description,
        owner: input.reviewData.owner,
        entrypoint: input.reviewData.entrypoint,
        roles: input.reviewData.roles,
        installScope: input.reviewData.installScope,
        capabilities: input.reviewData.capabilities,
        grading: input.reviewData.grading,
        validationIssues: input.reviewData.validationIssues,
        manifestJson: input.reviewData.manifestJson,
        artifact: input.artifact,
      });

      packageVersions.push(nextRecord);

      return Promise.resolve(clonePackageVersion(nextRecord));
    },

    listPackageVersions() {
      return Promise.resolve(
        clonePackageVersions(sortPackageVersions(packageVersions)),
      );
    },

    listPackageVersionsByApp(appId) {
      const records = packageVersions.filter((record) =>
        record.appId === appId
      );
      return Promise.resolve(
        clonePackageVersions(sortPackageVersions(records)),
      );
    },

    getPackageVersionById(id) {
      const record = packageVersions.find((candidate) => candidate.id === id);
      return Promise.resolve(record ? clonePackageVersion(record) : null);
    },

    getPackageVersionByAppVersion(appId, version) {
      const record = packageVersions.find((candidate) =>
        candidate.appId === appId && candidate.version === version
      );
      return Promise.resolve(record ? clonePackageVersion(record) : null);
    },

    approvePackageVersion(input) {
      return Promise.resolve(
        clonePackageVersion(
          reviewPackageVersion(
            packageVersions,
            input.id,
            "approved",
            input.reviewNotes,
          ),
        ),
      );
    },

    rejectPackageVersion(input) {
      return Promise.resolve(
        clonePackageVersion(
          reviewPackageVersion(
            packageVersions,
            input.id,
            "rejected",
            input.reviewNotes,
          ),
        ),
      );
    },

    getDeploymentBySlug(slug) {
      const deployment = deployments.find((candidate) =>
        candidate.slug === slug
      );
      return Promise.resolve(deployment ? cloneDeployment(deployment) : null);
    },

    getDeploymentByBinding(binding) {
      const deployment = deployments.find((candidate) =>
        candidate.binding?.issuer === binding.issuer &&
        candidate.binding?.clientId === binding.clientId &&
        candidate.binding?.deploymentId === binding.deploymentId
      );
      return Promise.resolve(deployment ? cloneDeployment(deployment) : null);
    },

    createLoginState(record) {
      const existing = loginStates.find((candidate) =>
        candidate.state === record.state
      );

      if (existing) {
        throw new Error(
          `Login state ${record.state} already exists and cannot be reused.`,
        );
      }

      loginStates.push(cloneLoginState(record));

      return Promise.resolve(cloneLoginState(record));
    },

    getLoginStateByState(state) {
      const record = loginStates.find((candidate) => candidate.state === state);
      return Promise.resolve(record ? cloneLoginState(record) : null);
    },

    consumeLoginState(input) {
      const index = loginStates.findIndex((candidate) =>
        candidate.state === input.state
      );

      if (index < 0) {
        throw new Error(`Login state ${input.state} was not found.`);
      }

      const existing = loginStates[index];

      if (!existing) {
        throw new Error(`Login state ${input.state} was not found.`);
      }

      if (existing.usedAt !== null) {
        throw new Error(`Login state ${input.state} has already been used.`);
      }

      const nextRecord: LoginStateRecord = {
        ...existing,
        usedAt: input.usedAt,
      };

      loginStates.splice(index, 1, nextRecord);

      return Promise.resolve(cloneLoginState(nextRecord));
    },

    createRuntimeSession(record) {
      const existing = runtimeSessions.find((candidate) =>
        candidate.sessionId === record.sessionId ||
        candidate.sessionToken === record.sessionToken
      );

      if (existing) {
        throw new Error(
          `Runtime session ${record.sessionId} already exists and cannot be replaced.`,
        );
      }

      runtimeSessions.push(cloneRuntimeSession(record));

      return Promise.resolve(cloneRuntimeSession(record));
    },

    getRuntimeSessionById(sessionId) {
      const record = runtimeSessions.find((candidate) =>
        candidate.sessionId === sessionId
      );
      return Promise.resolve(record ? cloneRuntimeSession(record) : null);
    },

    createAttempt(record) {
      const existing = attempts.find((candidate) =>
        candidate.attemptId === record.attemptId
      );

      if (existing) {
        throw new Error(
          `Attempt ${record.attemptId} already exists and cannot be replaced.`,
        );
      }

      const nextRecord = structuredClone({
        ...record,
        id: nextId(attempts),
      });

      attempts.push(nextRecord);

      return Promise.resolve(structuredClone(nextRecord));
    },

    getAttemptById(attemptId) {
      const record = attempts.find((candidate) =>
        candidate.attemptId === attemptId
      );
      return Promise.resolve(record ? structuredClone(record) : null);
    },

    appendAttemptEvent(input) {
      const attempt = attempts.find((candidate) =>
        candidate.attemptId === input.attemptId
      );

      if (!attempt) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const sequence = attemptEvents
        .filter((candidate) => candidate.attemptId === input.attemptId)
        .reduce((max, candidate) => Math.max(max, candidate.sequence), 0) + 1;
      const nextRecord = structuredClone({
        id: nextId(attemptEvents),
        attemptId: input.attemptId,
        sequence,
        eventType: input.event.type,
        event: input.event,
        receivedAt: input.receivedAt,
      });

      attemptEvents.push(nextRecord);

      return Promise.resolve(structuredClone(nextRecord));
    },

    listAttemptEvents(attemptId) {
      return Promise.resolve(
        attemptEvents
          .filter((candidate) => candidate.attemptId === attemptId)
          .map((record) => structuredClone(record)),
      );
    },

    finalizeAttempt(input) {
      const index = attempts.findIndex((candidate) =>
        candidate.attemptId === input.attemptId
      );

      if (index < 0) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const existing = attempts[index];

      if (!existing) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      if (existing.finalizedAt !== null) {
        return Promise.resolve(structuredClone(existing));
      }

      const nextRecord = structuredClone({
        ...existing,
        status: input.status,
        completionState: input.completionState,
        finalizedAt: input.finalizedAt,
      });

      attempts.splice(index, 1, nextRecord);

      return Promise.resolve(structuredClone(nextRecord));
    },

    recordAuditEvent(record) {
      const nextRecord = structuredClone({
        ...record,
        id: nextId(auditEvents),
      });

      auditEvents.push(nextRecord);

      return Promise.resolve(structuredClone(nextRecord));
    },

    listAuditEventsByAttemptId(attemptId) {
      return Promise.resolve(
        auditEvents
          .filter((candidate) => candidate.attemptId === attemptId)
          .map((record) => structuredClone(record)),
      );
    },

    listAuditEventsByEventType(eventType) {
      return Promise.resolve(
        auditEvents
          .filter((candidate) => candidate.eventType === eventType)
          .map((record) => structuredClone(record)),
      );
    },

    saveDeploymentBinding(input) {
      const existing = deployments.find((candidate) =>
        candidate.slug === input.slug
      );
      const conflicting = deployments.find((candidate) =>
        candidate.slug !== input.slug &&
        candidate.binding?.issuer === input.binding.issuer &&
        candidate.binding?.clientId === input.binding.clientId &&
        candidate.binding?.deploymentId === input.binding.deploymentId
      );

      if (conflicting) {
        throw new Error(
          `Canvas binding ${input.binding.clientId} / ${input.binding.deploymentId} already belongs to another deployment.`,
        );
      }

      if (existing && existing.appId !== input.appId) {
        throw new Error(
          `Deployment ${input.slug} belongs to app ${existing.appId}.`,
        );
      }

      const nextDeployment = buildDeploymentRecord({
        id: existing?.id ?? nextId(deployments),
        slug: input.slug,
        label: input.label,
        appId: input.appId,
        enabledPackageVersionId: existing?.enabledPackageVersionId ?? null,
        enabledPackageVersion: existing?.enabledPackageVersion ?? null,
        binding: cloneBinding(input.binding),
        updatedAt: DEFAULT_UPDATED_AT,
      });

      if (existing) {
        const index = deployments.findIndex((candidate) =>
          candidate.slug === input.slug
        );
        deployments.splice(index, 1, nextDeployment);
      } else {
        deployments.push(nextDeployment);
      }

      return Promise.resolve(cloneDeployment(nextDeployment));
    },

    pinDeploymentVersion(input) {
      const packageVersion = packageVersions.find((candidate) =>
        candidate.id === input.packageVersionId
      );

      if (!packageVersion) {
        throw new Error(
          `Package version id ${input.packageVersionId} was not found.`,
        );
      }

      if (packageVersion.approvalStatus !== "approved") {
        throw new Error("Only approved package versions can be enabled.");
      }

      if (packageVersion.appId !== input.appId) {
        throw new Error(
          `Package version ${packageVersion.appId}@${packageVersion.version} does not belong to deployment app ${input.appId}.`,
        );
      }

      const existing = deployments.find((candidate) =>
        candidate.slug === input.slug
      );

      if (existing && existing.appId !== input.appId) {
        throw new Error(
          `Deployment ${input.slug} belongs to app ${existing.appId}.`,
        );
      }

      const nextDeployment = buildDeploymentRecord({
        id: existing?.id ?? nextId(deployments),
        slug: input.slug,
        label: input.label,
        appId: input.appId,
        enabledPackageVersionId: packageVersion.id,
        enabledPackageVersion: packageVersion.version,
        binding: existing?.binding ?? null,
        updatedAt: DEFAULT_UPDATED_AT,
      });

      if (existing) {
        const index = deployments.findIndex((candidate) =>
          candidate.slug === input.slug
        );
        deployments.splice(index, 1, nextDeployment);
      } else {
        deployments.push(nextDeployment);
      }

      return Promise.resolve(cloneDeployment(nextDeployment));
    },
  };
}

function reviewPackageVersion(
  packageVersions: PackageVersionRecord[],
  id: number,
  approvalStatus: Exclude<ApprovalStatus, "pending">,
  reviewNotes: string | null,
): PackageVersionRecord {
  const index = packageVersions.findIndex((record) => record.id === id);

  if (index < 0) {
    throw new Error(`Package version id ${id} was not found.`);
  }

  const existing = packageVersions[index];

  if (!existing) {
    throw new Error(`Package version id ${id} was not found.`);
  }

  if (existing.approvalStatus !== "pending") {
    throw new Error(
      `Package version ${existing.appId}@${existing.version} has already been reviewed and cannot change state.`,
    );
  }

  const nextRecord = buildPackageVersionRecord({
    ...existing,
    approvalStatus,
    reviewNotes,
    reviewedAt: DEFAULT_REVIEWED_AT,
  });

  packageVersions.splice(index, 1, nextRecord);

  return nextRecord;
}

function sortPackageVersions(
  packageVersions: PackageVersionRecord[],
): PackageVersionRecord[] {
  return [...packageVersions].sort((left, right) => {
    if (left.appId !== right.appId) {
      return left.appId.localeCompare(right.appId);
    }

    const versionComparison = compare(
      parse(right.version),
      parse(left.version),
    );

    if (versionComparison !== 0) {
      return versionComparison;
    }

    return right.importedAt.localeCompare(left.importedAt);
  });
}

function clonePackageVersions(
  packageVersions: PackageVersionRecord[],
): PackageVersionRecord[] {
  return packageVersions.map(clonePackageVersion);
}

function clonePackageVersion(
  record: PackageVersionRecord,
): PackageVersionRecord {
  return structuredClone(record);
}

function cloneDeployment(record: DeploymentRecord): DeploymentRecord {
  return structuredClone(record);
}

function cloneBinding(binding: DeploymentBinding): DeploymentBinding {
  return structuredClone(binding);
}

function cloneLoginState(record: LoginStateRecord): LoginStateRecord {
  return structuredClone(record);
}

function cloneRuntimeSession(
  record: RuntimeSessionRecord,
): RuntimeSessionRecord {
  return structuredClone(record);
}

function nextId(records: Array<{ id: number }>): number {
  return records.reduce((max, record) => Math.max(max, record.id), 0) + 1;
}
