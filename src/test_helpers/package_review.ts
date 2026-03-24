import { compare, parse } from "@std/semver";
import type {
  DeepLinkingSessionRecord,
  DeploymentBinding,
  LoginStateRecord,
  RuntimeSessionRecord,
} from "../lti/types.ts";
import type { ImportedPackageVersion } from "../package_review/intake.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  BrokerVerificationRunStatus,
  BrokerVerificationSource,
  BrokerVerificationStatus,
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneDeploymentHealth,
  ControlPlaneDeploymentInventoryRow,
  ControlPlaneDiagnosticItem,
  ControlPlaneHealthDimension,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  InternalBrokerVerificationStatus,
  OfficialBrokerCertificationStatus,
  PilotUsageMetrics,
  RetryableGradePublicationLookup,
  RetryRuntimeSessionLookup,
} from "../ops/types.ts";
import type {
  ApprovalStatus,
  AttemptEventRecord,
  AttemptRecord,
  AuditEventRecord,
  CanvasLineItemBindingRecord,
  DeepLinkingResourceOption,
  DeepLinkingResourceSelection,
  DeploymentRecord,
  GradePublicationRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";

const DEFAULT_IMPORTED_AT = "2026-03-23T17:30:00Z";
const DEFAULT_REVIEWED_AT = "2026-03-23T18:05:00Z";
const DEFAULT_UPDATED_AT = "2026-03-23T18:15:00Z";
const DEFAULT_PHASE3_AT = "2026-03-24T02:30:00Z";
const DEFAULT_PHASE4_AT = "2026-03-24T12:30:00Z";
const DEFAULT_PHASE5_AT = "2026-03-24T16:15:00Z";

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

export function buildDeepLinkingResourceOption(
  overrides: Partial<DeepLinkingResourceOption> = {},
): DeepLinkingResourceOption {
  return {
    packageVersionId: overrides.packageVersionId ?? 1,
    appId: overrides.appId ?? "chapter-4-asteroids",
    packageVersion: overrides.packageVersion ?? "0.1.0",
    packageTitle: overrides.packageTitle ?? "Chapter 4 Asteroids",
    ownerId: overrides.ownerId ?? "instructor_123",
    installScope: "assignment",
    approvalStatus: "approved",
    reviewedAt: overrides.reviewedAt ?? DEFAULT_REVIEWED_AT,
    activityId: overrides.activityId ?? "/content/activity.json",
    contentPath: overrides.contentPath ?? "/content/activity.json",
    contentTitle: overrides.contentTitle ?? "Activity",
  };
}

export function buildDeepLinkingResourceSelection(
  overrides: Partial<DeepLinkingResourceSelection> = {},
): DeepLinkingResourceSelection {
  return {
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? "0.1.0",
    packageTitle: overrides.packageTitle ?? "Chapter 4 Asteroids",
    activityId: overrides.activityId ?? "/content/activity.json",
    contentPath: overrides.contentPath ?? "/content/activity.json",
    contentTitle: overrides.contentTitle ?? "Activity",
  };
}

export function buildPilotUsageMetrics(
  overrides: Partial<PilotUsageMetrics> = {},
): PilotUsageMetrics {
  return {
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    totalLaunches: overrides.totalLaunches ?? 4,
    attemptsStarted: overrides.attemptsStarted ?? 3,
    attemptsCompleted: overrides.attemptsCompleted ?? 2,
    gradePublishesSucceeded: overrides.gradePublishesSucceeded ?? 2,
    gradePublishesFailed: overrides.gradePublishesFailed ?? 1,
    recentActiveUsers: overrides.recentActiveUsers ?? 2,
    lastLaunchAt: overrides.lastLaunchAt ?? DEFAULT_PHASE4_AT,
    measuredAt: overrides.measuredAt ?? DEFAULT_PHASE4_AT,
  };
}

export function buildControlPlaneHealthDimension(
  overrides: Partial<ControlPlaneHealthDimension> = {},
): ControlPlaneHealthDimension {
  return {
    name: overrides.name ?? "review",
    status: overrides.status ?? "healthy",
    summary: overrides.summary ?? "Approved version is pinned for the pilot.",
    checkedAt: overrides.checkedAt ?? DEFAULT_PHASE4_AT,
  };
}

export function buildControlPlaneDeploymentHealth(
  overrides: Partial<ControlPlaneDeploymentHealth> = {},
): ControlPlaneDeploymentHealth {
  return {
    overallStatus: overrides.overallStatus ?? "attention",
    summary: overrides.summary ??
      "Deployment is readable in the control plane and needs one operator follow-up.",
    dimensions: overrides.dimensions ?? {
      review: buildControlPlaneHealthDimension({
        name: "review",
        status: "healthy",
        summary: "Reviewed version is approved.",
      }),
      enablement: buildControlPlaneHealthDimension({
        name: "enablement",
        status: "healthy",
        summary: "Deployment pin and Canvas binding are present.",
      }),
      launch: buildControlPlaneHealthDimension({
        name: "launch",
        status: "attention",
        summary:
          "Latest launch needs confirmation from fresh operator evidence.",
      }),
      gradePublication: buildControlPlaneHealthDimension({
        name: "gradePublication",
        status: "attention",
        summary: "Latest grade publish requires review.",
      }),
      nrps: buildControlPlaneHealthDimension({
        name: "nrps",
        status: "healthy",
        summary: "Roster verification succeeded on the saved deployment path.",
      }),
      brokerVerification: buildControlPlaneHealthDimension({
        name: "brokerVerification",
        status: "healthy",
        summary: "Latest broker verification evidence passed.",
      }),
    },
  };
}

export function buildDeploymentActivitySnapshot(
  overrides: Partial<DeploymentActivitySnapshot> = {},
): DeploymentActivitySnapshot {
  return {
    status: overrides.status ?? "succeeded",
    occurredAt: overrides.occurredAt ?? DEFAULT_PHASE4_AT,
    summary: overrides.summary ?? "Latest operator-visible activity succeeded.",
    attemptId: overrides.attemptId ?? "attempt-123",
    contextId: overrides.contextId ?? "course-42",
    detail: overrides.detail ?? {
      code: "ok",
    },
  };
}

export function buildDeploymentGradePublicationSnapshot(
  overrides: Partial<DeploymentGradePublicationSnapshot> = {},
): DeploymentGradePublicationSnapshot {
  return {
    attemptId: overrides.attemptId ?? "attempt-123",
    status: overrides.status ?? "failed",
    lineItemUrl: overrides.lineItemUrl ??
      "https://canvas.example/api/lti/courses/42/line_items/9",
    canvasUserId: overrides.canvasUserId ?? "canvas-user-123",
    scoreGiven: overrides.scoreGiven ?? 85,
    scoreMaximum: overrides.scoreMaximum ?? 100,
    activityProgress: overrides.activityProgress ?? "Completed",
    gradingProgress: overrides.gradingProgress ?? "Failed",
    publishedAt: overrides.publishedAt ?? null,
    updatedAt: overrides.updatedAt ?? DEFAULT_PHASE4_AT,
    errorCode: overrides.errorCode ?? "canvas_score_rejected",
    errorDetail: overrides.errorDetail ?? {
      status: 422,
    },
  };
}

export function buildControlPlaneDiagnosticItem(
  overrides: Partial<ControlPlaneDiagnosticItem> = {},
): ControlPlaneDiagnosticItem {
  return {
    id: overrides.id ?? 1,
    kind: overrides.kind ?? "gradePublication",
    eventType: overrides.eventType ?? "grade_publish.failed",
    actorType: overrides.actorType ?? "platform",
    status: overrides.status ?? "failed",
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    attemptId: overrides.attemptId ?? "attempt-123",
    code: overrides.code ?? "canvas_score_rejected",
    summary: overrides.summary ?? "Canvas rejected the score publish.",
    operatorSummary: overrides.operatorSummary ??
      "Grade publish failed and can be retried from the control plane.",
    retryable: overrides.retryable ?? false,
    detail: overrides.detail ?? {
      httpStatus: 422,
    },
    occurredAt: overrides.occurredAt ?? DEFAULT_PHASE4_AT,
  };
}

export function buildRetryRuntimeSessionLookup(
  overrides: Partial<RetryRuntimeSessionLookup> = {},
): RetryRuntimeSessionLookup {
  return {
    sessionId: overrides.sessionId ?? "runtime-session-123",
    attemptId: overrides.attemptId ?? "attempt-123",
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? "chapter-4-asteroids-pilot",
    appId: overrides.appId ?? "chapter-4-asteroids",
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? "0.1.0",
    services: overrides.services ?? {
      ags: {
        scope: [
          "https://purl.imsglobal.org/spec/lti-ags/scope/score",
          "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
        ],
        lineitemsUrl: "https://canvas.example/api/lti/courses/42/line_items",
        lineitemUrl: "https://canvas.example/api/lti/courses/42/line_items/9",
      },
      nrps: {
        contextMembershipsUrl:
          "https://canvas.example/api/lti/courses/42/names_and_roles",
        serviceVersions: ["2.0"],
      },
    },
    createdAt: overrides.createdAt ?? DEFAULT_PHASE3_AT,
    expiresAt: overrides.expiresAt ?? "2026-03-25T02:45:00Z",
  };
}

export function buildRetryableGradePublicationLookup(
  overrides: Partial<RetryableGradePublicationLookup> = {},
): RetryableGradePublicationLookup {
  return {
    attemptId: overrides.attemptId ?? "attempt-123",
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? "chapter-4-asteroids-pilot",
    publication: overrides.publication ??
      buildDeploymentGradePublicationSnapshot(),
    binding: overrides.binding ?? {
      canvasEnvironment: "production",
      issuer: "https://canvas.instructure.com",
      clientId: "10000000000001",
      deploymentId: "deployment-123",
    },
    runtimeSession: overrides.runtimeSession ??
      buildRetryRuntimeSessionLookup(),
  };
}

export function buildInternalBrokerVerificationStatus(
  overrides: Partial<InternalBrokerVerificationStatus> = {},
): InternalBrokerVerificationStatus {
  return {
    source: overrides.source ?? "manual",
    status: overrides.status ?? "passed",
    checkedAt: overrides.checkedAt ?? DEFAULT_PHASE4_AT,
    summary: overrides.summary ??
      "Canvas launch, AGS publish, and NRPS verification all passed for the supported broker path.",
    evidenceUrl: overrides.evidenceUrl ??
      "https://example.test/verification/internal-run",
  };
}

export function buildOfficialBrokerCertificationStatus(
  overrides: Partial<OfficialBrokerCertificationStatus> = {},
): OfficialBrokerCertificationStatus {
  return {
    state: overrides.state ?? "notCertified",
    checkedAt: overrides.checkedAt ?? DEFAULT_PHASE4_AT,
    directoryUrl: overrides.directoryUrl ?? null,
  };
}

export function buildBrokerVerificationStatus(
  overrides: Partial<BrokerVerificationStatus> = {},
): BrokerVerificationStatus {
  return {
    supportedPath: overrides.supportedPath ?? "canvasLti13LaunchAgsNrps",
    internal: overrides.internal ?? buildInternalBrokerVerificationStatus(),
    official: overrides.official ??
      buildOfficialBrokerCertificationStatus(),
  };
}

export function buildControlPlaneDeploymentInventoryRow(
  overrides: Partial<ControlPlaneDeploymentInventoryRow> = {},
): ControlPlaneDeploymentInventoryRow {
  return {
    deploymentId: overrides.deploymentId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? "chapter-4-asteroids-pilot",
    deploymentLabel: overrides.deploymentLabel ??
      "Chapter 4 Asteroids Pilot Deployment",
    appId: overrides.appId ?? "chapter-4-asteroids",
    appTitle: overrides.appTitle ?? "Chapter 4 Asteroids",
    ownerId: overrides.ownerId ?? "instructor_123",
    enabledPackageVersionId: overrides.enabledPackageVersionId ?? 1,
    enabledPackageVersion: overrides.enabledPackageVersion ?? "0.1.0",
    approvalStatus: overrides.approvalStatus ?? "approved",
    binding: overrides.binding ?? {
      canvasEnvironment: "production",
      issuer: "https://canvas.instructure.com",
      clientId: "10000000000001",
      deploymentId: "deployment-123",
    },
    updatedAt: overrides.updatedAt ?? DEFAULT_UPDATED_AT,
    lastLaunchAt: overrides.lastLaunchAt ?? DEFAULT_PHASE4_AT,
    lastLaunchStatus: overrides.lastLaunchStatus ?? "succeeded",
    lastGradePublishAt: overrides.lastGradePublishAt ?? DEFAULT_PHASE4_AT,
    lastGradePublishStatus: overrides.lastGradePublishStatus ?? "failed",
    lastNrpsReadAt: overrides.lastNrpsReadAt ?? DEFAULT_PHASE4_AT,
    lastNrpsReadStatus: overrides.lastNrpsReadStatus ?? "succeeded",
    pilotUsage: overrides.pilotUsage ?? buildPilotUsageMetrics(),
    health: overrides.health ?? buildControlPlaneDeploymentHealth(),
    brokerVerification: overrides.brokerVerification ??
      buildBrokerVerificationStatus(),
  };
}

export function buildControlPlaneDeploymentDetailSnapshot(
  overrides: Partial<ControlPlaneDeploymentDetailSnapshot> = {},
): ControlPlaneDeploymentDetailSnapshot {
  return {
    inventory: overrides.inventory ?? buildControlPlaneDeploymentInventoryRow(),
    latestLaunch: overrides.latestLaunch ?? buildDeploymentActivitySnapshot({
      summary: "Latest launch completed and reached the runtime handoff.",
    }),
    latestNrpsRead: overrides.latestNrpsRead ??
      buildDeploymentActivitySnapshot({
        summary: "Latest roster verification succeeded.",
      }),
    latestGradePublish: overrides.latestGradePublish ??
      buildDeploymentGradePublicationSnapshot(),
    pilotUsage: overrides.pilotUsage ?? buildPilotUsageMetrics(),
    diagnostics: overrides.diagnostics ?? [
      buildControlPlaneDiagnosticItem(),
    ],
    retryableGradePublication: overrides.retryableGradePublication ??
      buildRetryableGradePublicationLookup(),
    brokerVerification: overrides.brokerVerification ??
      buildBrokerVerificationStatus(),
  };
}

export interface InMemoryOpsRepository {
  listControlPlaneDeployments(): Promise<ControlPlaneDeploymentInventoryRow[]>;
  getControlPlaneDeploymentDetail(
    deploymentRecordId: number,
  ): Promise<ControlPlaneDeploymentDetailSnapshot | null>;
  listControlPlaneDiagnostics(
    deploymentRecordId: number,
  ): Promise<ControlPlaneDiagnosticItem[]>;
  getLatestBrokerVerification(): Promise<BrokerVerificationStatus | null>;
  getLatestBrokerVerificationStatus(): Promise<BrokerVerificationStatus | null>;
  recordBrokerVerificationRun(input: {
    source: BrokerVerificationSource;
    scope: BrokerVerificationStatus["supportedPath"];
    status: BrokerVerificationRunStatus | "notCertified";
    certificationState:
      | Exclude<OfficialBrokerCertificationStatus["state"], "notCertified">
      | null;
    summary: string;
    detailUrl: string | null;
    checkedAt: string;
  }): Promise<void>;
  getRetryableGradePublicationLookup(
    attemptId: string,
  ): Promise<RetryableGradePublicationLookup | null>;
  getRuntimeSessionByAttemptId(
    attemptId: string,
  ): Promise<RuntimeSessionRecord | null>;
}

export interface InMemoryDeepLinkingRepository {
  createDeepLinkingSession(
    record: DeepLinkingSessionRecord,
  ): Promise<DeepLinkingSessionRecord>;
  getDeepLinkingSessionById(
    sessionId: string,
  ): Promise<DeepLinkingSessionRecord | null>;
  updateDeepLinkingSessionSelection(input: {
    sessionId: string;
    selection: DeepLinkingSessionRecord["selection"];
  }): Promise<DeepLinkingSessionRecord>;
  listDeepLinkingResourceOptions(
    appId: string,
  ): Promise<DeepLinkingResourceOption[]>;
}

export function createInMemoryPackageReviewRepository(
  options: {
    packageVersions?: PackageVersionRecord[];
    deployments?: DeploymentRecord[];
    attempts?: AttemptRecord[];
    attemptEvents?: AttemptEventRecord[];
    lineItemBindings?: CanvasLineItemBindingRecord[];
    gradePublications?: GradePublicationRecord[];
    auditEvents?: AuditEventRecord[];
    loginStates?: LoginStateRecord[];
    runtimeSessions?: RuntimeSessionRecord[];
    deepLinkingSessions?: DeepLinkingSessionRecord[];
    deepLinkingResourceOptions?: DeepLinkingResourceOption[];
    controlPlaneDeployments?: ControlPlaneDeploymentInventoryRow[];
    controlPlaneDeploymentDetails?: ControlPlaneDeploymentDetailSnapshot[];
    controlPlaneDiagnostics?: ControlPlaneDiagnosticItem[];
    brokerVerifications?: BrokerVerificationStatus[];
    retryableGradePublications?: RetryableGradePublicationLookup[];
  } = {},
): PackageReviewRepository & InMemoryOpsRepository & InMemoryDeepLinkingRepository {
  const packageVersions = [...(options.packageVersions ?? [])];
  const deployments = [...(options.deployments ?? [])];
  const attempts = [...(options.attempts ?? [])];
  const attemptEvents = [...(options.attemptEvents ?? [])];
  const lineItemBindings = [...(options.lineItemBindings ?? [])];
  const gradePublications = [...(options.gradePublications ?? [])];
  const auditEvents = [...(options.auditEvents ?? [])];
  const loginStates = [...(options.loginStates ?? [])];
  const runtimeSessions = [...(options.runtimeSessions ?? [])];
  const deepLinkingSessions = [...(options.deepLinkingSessions ?? [])];
  const deepLinkingResourceOptions = [
    ...(options.deepLinkingResourceOptions ?? []),
  ];
  const controlPlaneDeployments = [...(options.controlPlaneDeployments ?? [])];
  const controlPlaneDeploymentDetails = [
    ...(options.controlPlaneDeploymentDetails ?? []),
  ];
  const controlPlaneDiagnostics = [...(options.controlPlaneDiagnostics ?? [])];
  const brokerVerifications = [...(options.brokerVerifications ?? [])];
  const retryableGradePublications = [
    ...(options.retryableGradePublications ?? []),
  ];

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

    getLatestRuntimeSessionByDeploymentId(deploymentRecordId) {
      const record = [...runtimeSessions].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ).find((candidate) =>
        candidate.deploymentRecordId === deploymentRecordId
      );

      return Promise.resolve(record ? cloneRuntimeSession(record) : null);
    },

    getRuntimeSessionByAttemptId(attemptId) {
      const record = [...runtimeSessions].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ).find((candidate) => candidate.attemptId === attemptId);

      return Promise.resolve(record ? cloneRuntimeSession(record) : null);
    },

    createDeepLinkingSession(record) {
      const existing = deepLinkingSessions.find((candidate) =>
        candidate.sessionId === record.sessionId ||
        candidate.sessionToken === record.sessionToken
      );

      if (existing) {
        throw new Error(
          `Deep Linking session ${record.sessionId} already exists and cannot be replaced.`,
        );
      }

      deepLinkingSessions.push(cloneDeepLinkingSession(record));

      return Promise.resolve(cloneDeepLinkingSession(record));
    },

    getDeepLinkingSessionById(sessionId) {
      const record = deepLinkingSessions.find((candidate) =>
        candidate.sessionId === sessionId
      );

      return Promise.resolve(
        record ? cloneDeepLinkingSession(record) : null,
      );
    },

    updateDeepLinkingSessionSelection(input) {
      const index = deepLinkingSessions.findIndex((candidate) =>
        candidate.sessionId === input.sessionId
      );

      if (index < 0) {
        throw new Error(
          `Deep Linking session ${input.sessionId} was not found.`,
        );
      }

      const existing = deepLinkingSessions[index];

      if (!existing) {
        throw new Error(
          `Deep Linking session ${input.sessionId} was not found.`,
        );
      }

      const nextRecord: DeepLinkingSessionRecord = {
        ...existing,
        selection: input.selection === null ? null : structuredClone({
          ...input.selection,
        }),
      };

      deepLinkingSessions.splice(index, 1, nextRecord);

      return Promise.resolve(cloneDeepLinkingSession(nextRecord));
    },

    listDeepLinkingResourceOptions(appId) {
      return Promise.resolve(
        deepLinkingResourceOptions
          .filter((candidate) => candidate.appId === appId)
          .map(cloneDeepLinkingResourceOption),
      );
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

    getLineItemBinding(input) {
      const record = lineItemBindings.find((candidate) =>
        candidate.deploymentRecordId === input.deploymentRecordId &&
        candidate.packageVersionId === input.packageVersionId &&
        candidate.contextId === input.contextId &&
        candidate.resourceLinkId === input.resourceLinkId &&
        candidate.activityId === input.activityId
      );

      return Promise.resolve(record ? structuredClone(record) : null);
    },

    saveLineItemBinding(record) {
      const existing = lineItemBindings.find((candidate) =>
        candidate.deploymentRecordId === record.deploymentRecordId &&
        candidate.packageVersionId === record.packageVersionId &&
        candidate.contextId === record.contextId &&
        candidate.resourceLinkId === record.resourceLinkId &&
        candidate.activityId === record.activityId
      );

      if (existing) {
        return Promise.resolve(structuredClone(existing));
      }

      const nextRecord = structuredClone({
        ...record,
        id: nextId(lineItemBindings),
      });

      lineItemBindings.push(nextRecord);

      return Promise.resolve(structuredClone(nextRecord));
    },

    getGradePublicationByAttemptId(attemptId) {
      const record = gradePublications.find((candidate) =>
        candidate.attemptId === attemptId
      );

      return Promise.resolve(record ? structuredClone(record) : null);
    },

    createGradePublication(record) {
      const existing = gradePublications.find((candidate) =>
        candidate.attemptId === record.attemptId
      );

      if (existing) {
        return Promise.resolve(structuredClone(existing));
      }

      const nextRecord = structuredClone({
        ...record,
        id: nextId(gradePublications),
      });

      gradePublications.push(nextRecord);

      return Promise.resolve(structuredClone(nextRecord));
    },

    updateGradePublication(input) {
      const index = gradePublications.findIndex((candidate) =>
        candidate.attemptId === input.attemptId
      );

      if (index < 0) {
        throw new Error(
          `Grade publication for attempt ${input.attemptId} was not found.`,
        );
      }

      const existing = gradePublications[index];

      if (!existing) {
        throw new Error(
          `Grade publication for attempt ${input.attemptId} was not found.`,
        );
      }

      const nextRecord = structuredClone({
        ...existing,
        status: input.status,
        updatedAt: input.updatedAt,
        publishedAt: input.publishedAt,
        errorCode: input.errorCode,
        errorDetail: input.errorDetail,
      });

      gradePublications.splice(index, 1, nextRecord);

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

    listControlPlaneDeployments() {
      return Promise.resolve(
        controlPlaneDeployments
          .map((record) => structuredClone(record))
          .sort((left, right) => {
            const updatedAt = right.updatedAt.localeCompare(left.updatedAt);

            if (updatedAt !== 0) {
              return updatedAt;
            }

            return right.deploymentId - left.deploymentId;
          }),
      );
    },

    getControlPlaneDeploymentDetail(deploymentRecordId) {
      const record = controlPlaneDeploymentDetails.find((candidate) =>
        candidate.inventory.deploymentId === deploymentRecordId
      );

      return Promise.resolve(record ? structuredClone(record) : null);
    },

    listControlPlaneDiagnostics(deploymentRecordId) {
      return Promise.resolve(
        controlPlaneDiagnostics
          .filter((candidate) =>
            candidate.deploymentRecordId === deploymentRecordId
          )
          .map((record) => structuredClone(record))
          .sort((left, right) => {
            const occurredAt = right.occurredAt.localeCompare(left.occurredAt);

            if (occurredAt !== 0) {
              return occurredAt;
            }

            return right.id - left.id;
          }),
      );
    },

    getLatestBrokerVerification() {
      const record = getLatestBrokerVerificationRecord(brokerVerifications);

      return Promise.resolve(record ? structuredClone(record) : null);
    },

    getLatestBrokerVerificationStatus() {
      const record = getLatestBrokerVerificationRecord(brokerVerifications);

      return Promise.resolve(record ? structuredClone(record) : null);
    },

    recordBrokerVerificationRun(input) {
      const latestRecord = getLatestBrokerVerificationRecord(
        brokerVerifications,
      );
      const nextRecord: BrokerVerificationStatus = input.source === "1edtech"
        ? {
          supportedPath: input.scope,
          internal: latestRecord?.internal ?? null,
          official: {
            state: input.certificationState ?? "notCertified",
            checkedAt: input.checkedAt,
            directoryUrl: input.detailUrl,
          },
        }
        : {
          supportedPath: input.scope,
          internal: {
            source: input.source,
            status: input.status as BrokerVerificationRunStatus,
            checkedAt: input.checkedAt,
            summary: input.summary,
            evidenceUrl: input.detailUrl,
          },
          official: latestRecord?.official ?? {
            state: "notCertified",
            checkedAt: null,
            directoryUrl: null,
          },
        };

      brokerVerifications.push(structuredClone(nextRecord));

      return Promise.resolve();
    },

    getRetryableGradePublicationLookup(attemptId) {
      const seededRecord = retryableGradePublications.find((candidate) =>
        candidate.attemptId === attemptId
      );

      if (seededRecord) {
        return Promise.resolve(structuredClone(seededRecord));
      }

      const publication = gradePublications.find((candidate) =>
        candidate.attemptId === attemptId && candidate.status === "failed"
      );
      const attempt = attempts.find((candidate) =>
        candidate.attemptId === attemptId
      );

      if (!publication || !attempt) {
        return Promise.resolve(null);
      }

      const deployment = deployments.find((candidate) =>
        candidate.id === attempt.deploymentRecordId
      );
      const runtimeSession = [...runtimeSessions].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ).find((candidate) => candidate.attemptId === attemptId);

      return Promise.resolve(
        buildRetryableGradePublicationLookup({
          attemptId,
          deploymentRecordId: attempt.deploymentRecordId,
          deploymentSlug: attempt.deploymentSlug,
          publication: buildDeploymentGradePublicationSnapshot({
            attemptId: publication.attemptId,
            status: publication.status,
            lineItemUrl: publication.lineItemUrl,
            canvasUserId: publication.canvasUserId,
            scoreGiven: publication.scoreGiven,
            scoreMaximum: publication.scoreMaximum,
            activityProgress: publication.activityProgress,
            gradingProgress: publication.gradingProgress,
            publishedAt: publication.publishedAt,
            updatedAt: publication.updatedAt,
            errorCode: publication.errorCode,
            errorDetail: publication.errorDetail,
          }),
          binding: deployment?.binding ?? null,
          runtimeSession: runtimeSession
            ? buildRetryRuntimeSessionLookup({
              sessionId: runtimeSession.sessionId,
              attemptId: runtimeSession.attemptId,
              deploymentRecordId: runtimeSession.deploymentRecordId,
              deploymentSlug: runtimeSession.deploymentSlug,
              appId: runtimeSession.appId,
              packageVersionId: runtimeSession.packageVersionId,
              packageVersion: runtimeSession.packageVersion,
              services: runtimeSession.services,
              createdAt: runtimeSession.createdAt,
              expiresAt: runtimeSession.expiresAt,
            })
            : null,
        }),
      );
    },
  };
}

function getLatestBrokerVerificationRecord(
  brokerVerifications: BrokerVerificationStatus[],
): BrokerVerificationStatus | null {
  return [...brokerVerifications].sort((left, right) => {
    const leftCheckedAt = left.internal?.checkedAt ??
      left.official.checkedAt ?? "";
    const rightCheckedAt = right.internal?.checkedAt ??
      right.official.checkedAt ?? "";

    return rightCheckedAt.localeCompare(leftCheckedAt);
  })[0] ?? null;
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

function cloneDeepLinkingSession(
  record: DeepLinkingSessionRecord,
): DeepLinkingSessionRecord {
  return structuredClone(record);
}

function cloneDeepLinkingResourceOption(
  record: DeepLinkingResourceOption,
): DeepLinkingResourceOption {
  return structuredClone(record);
}

function nextId(records: Array<{ id: number }>): number {
  return records.reduce((max, record) => Math.max(max, record.id), 0) + 1;
}
