import {
  approvalStatusClass,
  approvalStatusDetail,
  approvalStatusLabel,
  type CapabilitySummary,
  summarizeAccessibilityReview,
  summarizeCapabilities,
  summarizeGrading,
  summarizeRoles,
  summarizeValidation,
} from '../package_review/summary.ts';
import type {
  AuditEventRecord,
  GradingSettings,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
  ReviewedPlacementRecord,
} from '../package_review/types.ts';
import { type AdminNotice, escapeHtml, formatDateTime, renderAdminLayout } from './layout.ts';
import { renderPackagePageNav } from './package_navigation.ts';
import { renderDecisionSection, renderHistoryRow } from './package_detail_sections.ts';

export function renderPackageDetailPage(input: {
  packageVersion: PackageVersionRecord;
  history: PackageVersionRecord[];
  generationActivityEvents?: AuditEventRecord[];
  reviewedPlacements?: ReviewedPlacementRecord[];
  latestPreviewSession?: PreviewSessionRecord | null;
  previewEvidence?: PreviewEvidenceRecord[];
  notice?: AdminNotice | null;
}): string {
  const packageVersion = input.packageVersion;
  const capabilitySummary = summarizeCapabilities(packageVersion.capabilities);
  const accessibility = summarizeAccessibilityReview(packageVersion);
  const grading = summarizeGrading(packageVersion.grading);
  const validation = summarizeValidation(packageVersion);
  const latestPreviewSession = input.latestPreviewSession ?? null;
  const previewEvidence = input.previewEvidence ?? [];

  return renderAdminLayout({
    title: `${packageVersion.title} ${packageVersion.version}`,
    eyebrow: 'Version details',
    heading: packageVersion.title,
    intro: `Review version ${packageVersion.version} before you make it live.`,
    activePath: '/admin/packages',
    breadcrumbs: [
      { label: 'Apps', href: '/admin/packages' },
      {
        label: packageVersion.title,
        href: `/admin/packages/${packageVersion.appId}`,
      },
      { label: packageVersion.version },
    ],
    notice: input.notice ?? null,
    pageNav: renderPackagePageNav({
      appId: packageVersion.appId,
      history: input.history,
      currentSection: 'version',
      currentVersion: packageVersion,
    }),
    body: `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="${approvalStatusClass(packageVersion.approvalStatus)}">${
      escapeHtml(
        approvalStatusLabel(packageVersion.approvalStatus),
      )
    }</p>
          <div class="stack">
            <h2>Version ${escapeHtml(packageVersion.version)}</h2>
            <p>${
      escapeHtml(
        packageVersion.description ?? 'No package description was provided.',
      )
    }</p>
            <p class="micro muted">${
      escapeHtml(
        approvalStatusDetail(packageVersion.approvalStatus),
      )
    }</p>
          </div>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Owner</span>
              <span class="fact-value">${escapeHtml(packageVersion.owner.id)}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Available to</span>
              <span class="fact-value">${escapeHtml(summarizeRoles(packageVersion.roles))}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Placement</span>
              <span class="fact-value">${
      escapeHtml(
        formatInstallScope(packageVersion.installScope),
      )
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Added</span>
              <span class="fact-value">${
      escapeHtml(
        formatDateTime(packageVersion.importedAt),
      )
    }</span>
            </div>
          </div>
          <section class="stack">
            <p class="section-label">What it can do</p>
            ${renderCapabilityPrivacySummary(packageVersion.grading, capabilitySummary)}
          </section>
        </div>
        <aside class="stack">
          <section class="fact">
            <span class="fact-label">Scoring</span>
            <strong class="fact-value">${escapeHtml(grading.label)}</strong>
            <p class="micro muted">${escapeHtml(grading.detail)}</p>
          </section>
          <section class="fact">
            <span class="fact-label">Accessibility</span>
            <strong class="fact-value">${escapeHtml(accessibility.label)}</strong>
            <p class="micro muted">${escapeHtml(accessibility.detail)}</p>
            ${
      accessibility.exceptionNote === null
        ? ''
        : `<p class="micro muted">${escapeHtml(accessibility.exceptionNote)}</p>`
    }
          </section>
          <section class="fact">
            <span class="fact-label">Checks</span>
            <strong class="fact-value">${escapeHtml(validation.label)}</strong>
            <p class="micro muted">${escapeHtml(validation.detail)}</p>
          </section>
          <section class="fact">
            <span class="fact-label">Next step</span>
            <a class="button-secondary" href="/admin/packages/${
      escapeHtml(
        packageVersion.appId,
      )
    }/deployment">Open app settings</a>
          </section>
        </aside>
      </div>
    </section>
    ${
      packageVersion.approvalStatus === 'pending'
        ? renderPendingReviewOverview({
          packageVersion,
          history: input.history,
          validation,
          capabilitySummary,
          latestPreviewSession,
          previewEvidence,
        })
        : ''
    }
    <section class="panel">
      <div class="panel-body stack">
        <div class="stack">
          <p class="section-label">Saved details</p>
          <details>
            <summary>Show access notes, saved files, and manifest JSON</summary>
            <div class="line-list">
              ${
      capabilitySummary
        .map(
          (capability) =>
            `<article class="line-item">
              <p class="line-title">${escapeHtml(capability.label)}${
              capability.flagLabel
                ? ` <span class="micro muted">${escapeHtml(capability.flagLabel)}</span>`
                : ''
            }</p>
              <p class="line-copy">${escapeHtml(capability.detail)}</p>
              <p class="micro muted">${escapeHtml(capability.purpose)} ${
              escapeHtml(
                capability.dataScope,
              )
            }</p>
            </article>`,
        )
        .join('')
    }
              <article class="line-item">
                <p class="line-title">Scoring setup</p>
                <p class="line-copy">${escapeHtml(grading.detail)}</p>
              </article>
              <article class="line-item">
                <p class="line-title">Saved files</p>
                <p class="line-copy">Lantern saved a reviewed copy in ${
      escapeHtml(
        packageVersion.artifact.snapshotRoot,
      )
    } with checksum ${escapeHtml(packageVersion.artifact.digest)}.</p>
              </article>
            </div>
            <pre>${escapeHtml(JSON.stringify(packageVersion.manifestJson, null, 2))}</pre>
          </details>
        </div>
        ${
      validation.issues.length > 0
        ? `<section class="callout">
              <h3>Things to fix</h3>
              <ul>
                ${
          validation.issues
            .map(
              (issue) =>
                `<li><strong>${escapeHtml(issue.field)}</strong>: ${
                  escapeHtml(
                    issue.message,
                  )
                }</li>`,
            )
            .join('')
        }
              </ul>
            </section>`
        : ''
    }
      </div>
    </section>
    ${renderDecisionSection(packageVersion)}
    ${
      renderRuntimeLogSection({
        packageVersion,
        latestPreviewSession,
        previewEvidence,
      })
    }
    ${renderGenerationActivitySection(input.generationActivityEvents ?? [])}
    ${renderReviewedPlacementsSection(input.reviewedPlacements ?? [])}
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Other versions</p>
        <div class="table-list">
          ${input.history.map((version) => renderHistoryRow(packageVersion, version)).join('')}
        </div>
      </div>
    </section>`,
  });
}

function renderPendingReviewOverview(input: {
  packageVersion: PackageVersionRecord;
  history: PackageVersionRecord[];
  validation: ReturnType<typeof summarizeValidation>;
  capabilitySummary: CapabilitySummary[];
  latestPreviewSession: PreviewSessionRecord | null;
  previewEvidence: PreviewEvidenceRecord[];
}): string {
  const previousVersion = resolvePreviousVersion(input.history, input.packageVersion);
  const previousApprovedVersion = resolvePreviousApprovedVersion(
    input.history,
    input.packageVersion,
  );
  const capabilityChanges = summarizeCapabilityChanges({
    current: input.capabilitySummary,
    previousApprovedVersion,
  });
  const sensitiveCount = input.capabilitySummary.filter((capability) => capability.flagged).length;
  const normalCount = input.capabilitySummary.length - sensitiveCount;
  const standardCapabilityText = `${normalCount} standard runtime ${
    normalCount === 1 ? 'capability' : 'capabilities'
  }`;
  const sensitiveCapabilityText = sensitiveCount === 0
    ? ''
    : `, ${sensitiveCount} sensitive review ${sensitiveCount === 1 ? 'item' : 'items'}`;
  const previewHref = versionPreviewHref(input.packageVersion);
  const diffHref = previousVersion === null
    ? null
    : `/admin/packages/${escapeHtml(input.packageVersion.appId)}/versions/${
      escapeHtml(
        input.packageVersion.version,
      )
    }/diff`;

  return `<section class="panel">
    <div class="panel-body stack">
      <div class="panel-header">
        <div class="stack">
          <p class="section-label">Review before approval</p>
          <h2>Decide with the runtime facts visible.</h2>
          <p class="line-copy">Use this checklist to test the pending version, inspect what changed, and confirm the app stays inside Lantern's boundary.</p>
        </div>
        <div class="button-row">
          <a class="button-primary" href="${previewHref}">Open review test launch</a>
          ${
    diffHref === null ? '' : `<a class="button-secondary" href="${diffHref}">Compare changes</a>`
  }
        </div>
      </div>
      <div class="line-list">
        <article class="line-item">
          <p class="line-title">What changed</p>
          <p class="line-copy">${
    escapeHtml(formatChangeSummary(input.packageVersion, previousVersion))
  }</p>
          ${
    diffHref === null
      ? ''
      : `<p class="micro muted"><a href="${diffHref}">Open the file-level version diff.</a></p>`
  }
          ${renderCapabilityChangeSummary(capabilityChanges)}
        </article>
        <article class="line-item">
          <p class="line-title">What it can do</p>
          <p class="line-copy">${
    escapeHtml(`${standardCapabilityText}${sensitiveCapabilityText}.`)
  }</p>
          <p class="micro muted">${escapeHtml(formatCapabilityNames(input.capabilitySummary))}</p>
        </article>
        <article class="line-item">
          <p class="line-title">Test launch</p>
          <p class="line-copy">${
    escapeHtml(formatPreviewSessionSummary(input.latestPreviewSession))
  }</p>
          <p class="micro muted">Review launches stay in Lantern preview mode and do not write to the live LMS.</p>
        </article>
        <article class="line-item">
          <p class="line-title">Runtime log</p>
          <p class="line-copy">${escapeHtml(formatRuntimeLogSummary(input.previewEvidence))}</p>
        </article>
        <article class="line-item">
          <p class="line-title">Why this is safe</p>
          <p class="line-copy">${escapeHtml(input.validation.detail)}</p>
          <p class="micro muted">The app receives only declared GatewayApp capabilities. Lantern blocks raw LMS tokens, direct storage, Worker code, direct grade writes, and arbitrary outbound network access.</p>
        </article>
      </div>
    </div>
  </section>`;
}

function renderCapabilityPrivacySummary(
  grading: GradingSettings,
  capabilities: CapabilitySummary[],
): string {
  const normalCapabilities = capabilities.filter((capability) => !capability.flagged);
  const sensitiveCapabilities = capabilities.filter((capability) => capability.flagged);
  const gradeReviewItem = summarizeGradeReviewItem(grading);

  return `<div class="capability-privacy">
    <section class="capability-group capability-group-standard">
      <div class="capability-group-header">
        <div>
          <h3>Standard learning activity</h3>
          <p>Expected LMS-style features for participation, resume, and completion tracking.</p>
        </div>
        <span class="chip capability-classification capability-classification-standard">Normal</span>
      </div>
      <div class="capability-card-grid">
        ${normalCapabilities.map(renderCapabilityCard).join('')}
      </div>
    </section>
    ${
    sensitiveCapabilities.length > 0 || gradeReviewItem !== null
      ? `<section class="capability-group capability-group-sensitive">
        <div class="capability-group-header">
          <div>
            <h3>Sensitive review items</h3>
            <p>These can affect grading or store learner-submitted evidence. Review them against the assignment purpose.</p>
          </div>
          <span class="chip capability-classification capability-classification-sensitive">Sensitive</span>
        </div>
        <div class="capability-card-grid">
          ${sensitiveCapabilities.map(renderCapabilityCard).join('')}
          ${gradeReviewItem ?? ''}
        </div>
      </section>`
      : ''
  }
    <section class="capability-group capability-group-blocked">
      <div class="capability-group-header">
        <div>
          <h3>Blocked by Lantern</h3>
          <p>App packages do not receive raw LMS tokens, direct database access, direct grade-write authority, Worker bindings, or arbitrary outbound network access.</p>
        </div>
        <span class="chip capability-classification capability-classification-blocked">Blocked</span>
      </div>
    </section>
  </div>`;
}

function renderCapabilityCard(capability: CapabilitySummary): string {
  return `<article class="capability-card">
    <div class="capability-card-header">
      <h4>${escapeHtml(capability.label)}</h4>
      <span class="chip capability-classification ${
    capability.flagged
      ? 'capability-classification-sensitive'
      : 'capability-classification-standard'
  }">${escapeHtml(capability.sensitivityLabel)}</span>
    </div>
    <p>${escapeHtml(capability.detail)}</p>
    <dl class="capability-meta">
      <div>
        <dt>Purpose</dt>
        <dd>${escapeHtml(capability.purpose)}</dd>
      </div>
      <div>
        <dt>Data scope</dt>
        <dd>${escapeHtml(capability.dataScope)}</dd>
      </div>
      <div>
        <dt>Retention</dt>
        <dd>${escapeHtml(capability.retention)}</dd>
      </div>
      <div>
        <dt>Sensitivity</dt>
        <dd>${escapeHtml(capability.sensitivityDetail)}</dd>
      </div>
    </dl>
  </article>`;
}

function summarizeGradeReviewItem(grading: GradingSettings): string | null {
  if (grading.mode !== 'browser' && grading.mode !== 'declarative') {
    return null;
  }

  const gradingLabel = grading.mode === 'browser' ? 'Browser grading' : 'Reviewed scoring rules';
  const gradingDetail = grading.mode === 'browser'
    ? 'Lantern runs reviewed browser-grader checks and owns any grade publication.'
    : 'Lantern scores the attempt with reviewed scoring rules and owns any grade publication.';
  const maxScore = grading.maxScore === null
    ? 'Maximum score not recorded.'
    : `Maximum score ${grading.maxScore}.`;

  return `<article class="capability-card">
    <div class="capability-card-header">
      <h4>${escapeHtml(gradingLabel)}</h4>
      <span class="chip capability-classification capability-classification-sensitive">Affects grades</span>
    </div>
    <p>${escapeHtml(gradingDetail)}</p>
    <dl class="capability-meta">
      <div>
        <dt>Purpose</dt>
        <dd>Produce a reviewed score for the LMS assignment.</dd>
      </div>
      <div>
        <dt>Data scope</dt>
        <dd>Attempt results produced inside Lantern's governed runtime. ${escapeHtml(maxScore)}</dd>
      </div>
      <div>
        <dt>Retention</dt>
        <dd>Stored with the attempt, grade publication record, and audit trail.</dd>
      </div>
      <div>
        <dt>Sensitivity</dt>
        <dd>Sensitive because it can affect a grade, but the generated app cannot write directly to the LMS gradebook.</dd>
      </div>
    </dl>
  </article>`;
}

function renderRuntimeLogSection(input: {
  packageVersion: PackageVersionRecord;
  latestPreviewSession: PreviewSessionRecord | null;
  previewEvidence: PreviewEvidenceRecord[];
}): string {
  const previewHref = versionPreviewHref(input.packageVersion);

  return `<section class="panel">
    <div class="panel-body stack">
      <div class="panel-header">
        <div class="stack">
          <p class="section-label">Runtime log</p>
          <h2>Latest review test activity</h2>
          <p class="line-copy">${
    escapeHtml(formatPreviewSessionSummary(input.latestPreviewSession))
  }</p>
        </div>
        <div class="button-row">
          <a class="button-secondary" href="${previewHref}">${
    input.latestPreviewSession === null ? 'Start test launch' : 'Open full test launch log'
  }</a>
        </div>
      </div>
      ${
    input.previewEvidence.length === 0
      ? '<p class="muted">No runtime gateway events have been recorded for this version yet.</p>'
      : `<div class="line-list">
            ${input.previewEvidence.slice(0, 5).map(renderRuntimeLogItem).join('')}
          </div>
          ${
        input.previewEvidence.length > 5
          ? `<p class="micro muted">${
            escapeHtml(
              `${
                input.previewEvidence.length - 5
              } more events are available on the full test launch log.`,
            )
          }</p>`
          : ''
      }`
  }
    </div>
  </section>`;
}

function renderRuntimeLogItem(record: PreviewEvidenceRecord): string {
  return `<article class="line-item">
    <p class="line-title">${escapeHtml(formatPreviewEvidenceLabel(record.eventType))}${
    record.capability === null
      ? ''
      : ` <span class="inline-code">${escapeHtml(record.capability)}</span>`
  }</p>
    <p class="micro muted">${escapeHtml(formatDateTime(record.occurredAt))}</p>
    <p class="line-copy">${escapeHtml(record.summary)}</p>
  </article>`;
}

function renderReviewedPlacementsSection(placements: ReviewedPlacementRecord[]): string {
  if (placements.length === 0) {
    return '';
  }

  return `<section class="panel">
    <div class="panel-body stack">
      <p class="section-label">LMS placements using this version</p>
      <div class="line-list">
        ${
    placements
      .map(
        (placement) =>
          `<article class="line-item">
              <p class="line-title">${escapeHtml(placement.deploymentSlug)} · ${
            escapeHtml(
              placement.placementId,
            )
          }</p>
              <p class="line-copy">${
            escapeHtml(
              placement.contentTitle ?? placement.contentPath,
            )
          }</p>
              <p class="micro muted">Context ${
            escapeHtml(
              placement.contextTitle ?? placement.contextId ?? 'Not recorded',
            )
          }; resource link ${escapeHtml(placement.resourceLinkId ?? 'not bound yet')}.</p>
            </article>`,
      )
      .join('')
  }
      </div>
    </div>
  </section>`;
}

function renderGenerationActivitySection(events: AuditEventRecord[]): string {
  if (events.length === 0) {
    return '';
  }

  return `<section class="panel">
    <div class="panel-body stack">
      <p class="section-label">Generated package activity</p>
      <div class="line-list">
        ${
    events
      .map(
        (event) =>
          `<article class="line-item">
              <p class="line-title">${escapeHtml(event.summary)}</p>
              <p class="line-copy">${escapeHtml(formatDateTime(event.occurredAt))}</p>
            </article>`,
      )
      .join('')
  }
      </div>
    </div>
  </section>`;
}

function formatInstallScope(scope: PackageVersionRecord['installScope']): string {
  return scope === 'assignment' ? 'Assignment placement' : 'Course placement';
}

function resolvePreviousVersion(
  history: readonly PackageVersionRecord[],
  packageVersion: PackageVersionRecord,
): PackageVersionRecord | null {
  const currentIndex = history.findIndex((version) => version.id === packageVersion.id);

  if (currentIndex < 0) {
    return null;
  }

  return history[currentIndex + 1] ?? null;
}

function resolvePreviousApprovedVersion(
  history: readonly PackageVersionRecord[],
  packageVersion: PackageVersionRecord,
): PackageVersionRecord | null {
  const currentIndex = history.findIndex((version) => version.id === packageVersion.id);

  if (currentIndex === -1) {
    return null;
  }

  return history.slice(currentIndex + 1).find((version) => version.approvalStatus === 'approved') ??
    null;
}

interface CapabilityChangeSummary {
  previousApprovedVersion: PackageVersionRecord | null;
  added: CapabilitySummary[];
  removed: CapabilitySummary[];
  unchanged: CapabilitySummary[];
}

function summarizeCapabilityChanges(input: {
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

function renderCapabilityChangeSummary(summary: CapabilityChangeSummary): string {
  const addedSensitive = summary.added.filter((capability) => capability.flagged);

  if (summary.previousApprovedVersion === null) {
    return `<div class="detail-stack">
      <p class="micro muted">Capability baseline: no previously approved version exists. Review every declared runtime capability before approval.</p>
      ${renderCapabilityChangeGroup('Declared for first approval', summary.added)}
    </div>`;
  }

  if (summary.added.length === 0 && summary.removed.length === 0) {
    return `<div class="detail-stack">
      <p class="micro muted">Capability changes since approved version ${
      escapeHtml(summary.previousApprovedVersion.version)
    }: no capability changes.</p>
      ${renderCapabilityChangeGroup('Unchanged', summary.unchanged)}
    </div>`;
  }

  return `<div class="detail-stack">
    <p class="micro muted">Capability changes since approved version ${
    escapeHtml(summary.previousApprovedVersion.version)
  }.</p>
    ${renderCapabilityChangeGroup('Added', summary.added)}
    ${renderCapabilityChangeGroup('Removed', summary.removed)}
    ${renderCapabilityChangeGroup('Unchanged', summary.unchanged)}
    ${
    addedSensitive.length === 0
      ? ''
      : `<p class="micro muted">Review impact: this version newly requests ${
        escapeHtml(formatCapabilityNames(addedSensitive))
      }. Confirm the assignment purpose, evidence or grading flow, and latest preview evidence before approval.</p>`
  }
  </div>`;
}

function renderCapabilityChangeGroup(label: string, capabilities: CapabilitySummary[]): string {
  if (capabilities.length === 0) {
    return `<p class="micro muted">${escapeHtml(label)}: none.</p>`;
  }

  return `<div>
    <p class="micro muted">${escapeHtml(label)}</p>
    <ul>
      ${
    capabilities
      .map((capability) =>
        `<li><strong>${escapeHtml(capability.label)}</strong>: ${escapeHtml(capability.detail)}${
          capability.flagged
            ? ` <span class="micro muted">${escapeHtml(capability.sensitivityLabel)}</span>`
            : ''
        }</li>`
      )
      .join('')
  }
    </ul>
  </div>`;
}

function formatChangeSummary(
  packageVersion: PackageVersionRecord,
  previousVersion: PackageVersionRecord | null,
): string {
  if (previousVersion === null) {
    return `Version ${packageVersion.version} is the first saved version of this app.`;
  }

  return `Version ${packageVersion.version} is pending review against previous version ${previousVersion.version}.`;
}

function formatCapabilityNames(capabilities: CapabilitySummary[]): string {
  return capabilities.map((capability) => capability.label).join(', ');
}

function formatPreviewSessionSummary(session: PreviewSessionRecord | null): string {
  if (session === null) {
    return 'No review test launch has been recorded yet.';
  }

  return `Latest review test launch ${session.sessionId} ran as ${
    formatPreviewRole(
      session.launch.userRole,
    )
  } in course ${session.launch.courseId}.`;
}

function formatRuntimeLogSummary(records: PreviewEvidenceRecord[]): string {
  if (records.length === 0) {
    return 'No runtime events have been recorded yet. Start a review test launch to see gateway activity here.';
  }

  return `${records.length} runtime event${
    records.length === 1 ? '' : 's'
  } recorded from the latest review test launch.`;
}

function formatPreviewEvidenceLabel(eventType: string): string {
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

function formatPreviewRole(role: string): string {
  return role === 'learner' ? 'Student' : role === 'instructor' ? 'Instructor' : role;
}

function versionPreviewHref(packageVersion: PackageVersionRecord): string {
  return `/admin/packages/${escapeHtml(packageVersion.appId)}/versions/${
    escapeHtml(
      packageVersion.version,
    )
  }/preview`;
}
