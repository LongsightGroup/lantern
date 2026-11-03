import { type CapabilitySummary, summarizeCapabilities } from '../package_review/summary.ts';
import type {
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from '../package_review/types.ts';
import { escapeHtml } from './layout.ts';
export {
  resolvePreviousApprovedPackageVersion as resolvePreviousApprovedVersion,
  resolvePreviousPackageVersion as resolvePreviousVersion,
} from './package_version_history.ts';

export interface CapabilityChangeSummary {
  previousApprovedVersion: PackageVersionRecord | null;
  added: CapabilitySummary[];
  removed: CapabilitySummary[];
  unchanged: CapabilitySummary[];
}

export function summarizeCapabilityChanges(input: {
  current: CapabilitySummary[];
  previousApprovedVersion: PackageVersionRecord | null;
}): CapabilityChangeSummary {
  if (input.previousApprovedVersion === null) {
    return {
      previousApprovedVersion: null,
      added: input.current,
      removed: [],
      unchanged: [],
    };
  }

  const currentIds = new Set(input.current.map((capability) => capability.id));
  const previous = summarizeCapabilities(input.previousApprovedVersion.capabilities);
  const previousIds = new Set(previous.map((capability) => capability.id));

  return {
    previousApprovedVersion: input.previousApprovedVersion,
    added: input.current.filter((capability) => !previousIds.has(capability.id)),
    removed: previous.filter((capability) => !currentIds.has(capability.id)),
    unchanged: input.current.filter((capability) => previousIds.has(capability.id)),
  };
}

export function renderCapabilityChangeSummary(summary: CapabilityChangeSummary): string {
  const addedSensitive = summary.added.filter((capability) => capability.flagged);

  if (summary.previousApprovedVersion === null) {
    return `<div class="detail-stack">
      <p class="micro muted">Capability baseline: no previously approved version exists. Review every declared runtime capability before approval.</p>
      ${renderCapabilityChangeGroup('Declared for first approval', summary.added)}
    </div>`;
  }

  if (summary.added.length === 0 && summary.removed.length === 0) {
    return `<div class="detail-stack">
      <p class="micro muted">Capability changes since approved version ${escapeHtml(
        summary.previousApprovedVersion.version,
      )}: no capability changes.</p>
      ${renderCapabilityChangeGroup('Unchanged', summary.unchanged)}
    </div>`;
  }

  return `<div class="detail-stack">
    <p class="micro muted">Capability changes since approved version ${escapeHtml(
      summary.previousApprovedVersion.version,
    )}.</p>
    ${renderCapabilityChangeGroup('Added', summary.added)}
    ${renderCapabilityChangeGroup('Removed', summary.removed)}
    ${renderCapabilityChangeGroup('Unchanged', summary.unchanged)}
    ${
      addedSensitive.length === 0
        ? ''
        : `<p class="micro muted">Review impact: this version newly requests ${escapeHtml(
            formatCapabilityNames(addedSensitive),
          )}. Confirm the assignment purpose, evidence or grading flow, and latest preview evidence before approval.</p>`
    }
  </div>`;
}

export function renderCapabilityChangeGroup(
  label: string,
  capabilities: CapabilitySummary[],
): string {
  if (capabilities.length === 0) {
    return `<p class="micro muted">${escapeHtml(label)}: none.</p>`;
  }

  return `<div>
    <p class="micro muted">${escapeHtml(label)}</p>
    <ul>
      ${capabilities
        .map(
          (capability) =>
            `<li><strong>${escapeHtml(capability.label)}</strong>: ${escapeHtml(capability.detail)}${
              capability.flagged
                ? ` <span class="micro muted">${escapeHtml(capability.sensitivityLabel)}</span>`
                : ''
            }</li>`,
        )
        .join('')}
    </ul>
  </div>`;
}

export function formatChangeSummary(
  packageVersion: PackageVersionRecord,
  previousVersion: PackageVersionRecord | null,
): string {
  if (previousVersion === null) {
    return `Version ${packageVersion.version} is the first saved version of this app.`;
  }

  return `Version ${packageVersion.version} is pending review against previous version ${previousVersion.version}.`;
}

export function formatCapabilityNames(capabilities: CapabilitySummary[]): string {
  return capabilities.map((capability) => capability.label).join(', ');
}

export function formatPreviewSessionSummary(session: PreviewSessionRecord | null): string {
  if (session === null) {
    return 'No review test launch has been recorded yet.';
  }

  return `Latest review test launch ${session.sessionId} ran as ${formatPreviewRole(
    session.launch.userRole,
  )} in course ${session.launch.courseId}.`;
}

export function formatRuntimeLogSummary(records: PreviewEvidenceRecord[]): string {
  if (records.length === 0) {
    return 'No runtime events have been recorded yet. Start a review test launch to see gateway activity here.';
  }

  return `${records.length} runtime event${
    records.length === 1 ? '' : 's'
  } recorded from the latest review test launch.`;
}

export function formatPreviewEvidenceLabel(eventType: string): string {
  switch (eventType) {
    case 'preview.launch':
      return 'Started test launch';
    case 'preview.content_read':
      return 'Loaded app content';
    case 'preview.attempt_event':
      return 'Received app progress update';
    case 'preview.evidence_artifact':
      return 'Stored anonymous evidence';
    case 'preview.finalize':
      return 'Finished test attempt';
    default:
      return eventType;
  }
}

export function formatPreviewRole(role: string): string {
  return role === 'learner' ? 'Student' : role === 'instructor' ? 'Instructor' : role;
}

export function versionPreviewHref(packageVersion: PackageVersionRecord): string {
  return `/admin/packages/${escapeHtml(packageVersion.appId)}/versions/${escapeHtml(
    packageVersion.version,
  )}/preview`;
}
