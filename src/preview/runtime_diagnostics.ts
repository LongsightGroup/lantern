import type { Capability } from '../../sdk/app-sdk.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AuditEventRecord, PreviewSessionRecord } from '../package_review/types.ts';

export interface PreviewRuntimeDiagnostic {
  eventType: string;
  summary: string;
  occurredAt: string;
  route: string | null;
  category: string | null;
  code: string | null;
  capability: Capability | null;
  sandboxModel: string | null;
  boundary: string | null;
  sessionId: string | null;
  request: PreviewRuntimeDiagnosticRequest | null;
}

export interface PreviewRuntimeDiagnosticRequest {
  method: string | null;
  path: string | null;
  queryKeys: string[];
  bodyKeys: string[];
  contentType: string | null;
}

const PREVIEW_RUNTIME_FAILURE_EVENT_TYPES = new Set([
  'runtime.capability.denied',
  'runtime.session.denied',
  'runtime.session.integrity_failed',
  'runtime.session.timeout',
]);

export async function loadPreviewRuntimeDiagnostics(input: {
  repository: PackageReviewRepository;
  session: PreviewSessionRecord;
}): Promise<PreviewRuntimeDiagnostic[]> {
  const attemptIds = new Set([
    input.session.fakeAttemptId,
    `${input.session.fakeAttemptId}:${input.session.sessionId}`,
  ]);
  const auditEvents = (await Promise.all(
    [...attemptIds].map((attemptId) => input.repository.listAuditEventsByAttemptId(attemptId)),
  )).flat();

  return auditEvents
    .filter((event) =>
      event.packageVersionId === input.session.packageVersionId &&
      PREVIEW_RUNTIME_FAILURE_EVENT_TYPES.has(event.eventType)
    )
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id - right.id)
    .map(toPreviewRuntimeDiagnostic);
}

function toPreviewRuntimeDiagnostic(event: AuditEventRecord): PreviewRuntimeDiagnostic {
  return {
    eventType: event.eventType,
    summary: event.summary,
    occurredAt: event.occurredAt,
    route: readStringDetail(event.detail, 'route'),
    category: readStringDetail(event.detail, 'category'),
    code: readStringDetail(event.detail, 'code'),
    capability: readCapabilityDetail(event.detail),
    sandboxModel: readStringDetail(event.detail, 'sandboxModel'),
    boundary: readStringDetail(event.detail, 'boundary'),
    sessionId: readStringDetail(event.detail, 'sessionId'),
    request: readPreviewRuntimeDiagnosticRequest(event.detail),
  };
}

function readPreviewRuntimeDiagnosticRequest(
  detail: Record<string, unknown>,
): PreviewRuntimeDiagnosticRequest | null {
  const request = detail.request;

  if (!isRecord(request)) {
    return null;
  }

  return {
    method: readStringDetail(request, 'method'),
    path: sanitizeRuntimeRequestPath(readStringDetail(request, 'path')),
    queryKeys: readStringArrayDetail(request, 'queryKeys'),
    bodyKeys: readStringArrayDetail(request, 'bodyKeys'),
    contentType: readStringDetail(request, 'contentType'),
  };
}

function sanitizeRuntimeRequestPath(path: string | null): string | null {
  if (path === null) {
    return null;
  }

  return path.replace(/\/files\/__token__\/[^/]+\//, '/files/__token__/[token]/');
}

function readCapabilityDetail(detail: Record<string, unknown>): Capability | null {
  const value = detail.capability;

  switch (value) {
    case 'read_launch_context':
    case 'read_activity_content':
    case 'submit_attempt_event':
    case 'submit_evidence_artifact':
    case 'finalize_attempt':
    case 'read_local_state':
    case 'write_local_state':
      return value;
    default:
      return null;
  }
}

function readStringDetail(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function readStringArrayDetail(detail: Record<string, unknown>, key: string): string[] {
  const value = detail[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
