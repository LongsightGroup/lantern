import type { ManagedDeploymentSlot } from './deployment_detail.ts';
import type {
  ControlPlaneAnonymousEvidenceArtifact,
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneRuntimeEvidenceSnapshot,
} from '../ops/types.ts';
import { escapeHtml } from './layout.ts';
import {
  describeActivityLtiProfile,
  describeRuntimeRoute,
  formatActivityTimestamp,
  formatByteSize,
  formatOptionalTimestamp,
  formatRuntimeTimestamp,
  readBooleanDetail,
  readNestedStringDetail,
  readStringDetail,
  renderActivityFact,
  renderDiagnosticRow,
} from './deployment_detail_ops_support.ts';
import {
  describeBrokerVerificationStatus as describeBrokerVerificationStatusLabel,
  describeEvidenceArtifactKind,
  describeRuntimeBoundary,
  describeRuntimeDeliveryState,
  describeRuntimeDeliverySubstrate,
  describeRuntimeOutcome,
  describeRuntimeSandboxModel,
  describeSmokeCapability,
  describeSmokeCapabilitySummary,
  describeSmokePublication,
  describeSmokePublicationSummary,
  describeSmokeStatus,
  formatLmsLabel,
} from './deployment_detail_ops_labels.ts';

export function renderDiagnosticsSection(
  appId: string,
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const diagnostics = detail?.diagnostics ?? [];
  const retryAttemptId = detail?.retryableGradePublication?.attemptId ?? null;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Problems</p>
        <h2>Problems to review</h2>
        ${
    diagnostics.length === 0
      ? `<div class="callout">
              <h3>No problems recorded</h3>
              <p>Lantern has not recorded a failed launch, reviewed runtime event, roster read, or grade write for this setup.</p>
            </div>`
      : `<div class="table-list">
              ${
        diagnostics
          .map((item) => renderDiagnosticRow(item, appId, retryAttemptId))
          .join('')
      }
            </div>`
  }
      </div>
    </section>`;
}

export function renderRuntimeSection(detail: ControlPlaneDeploymentDetailSnapshot | null): string {
  const latestRuntimeSession = detail?.latestRuntimeSession ?? null;
  const latestRuntimeOutcome = detail?.latestRuntimeOutcome ?? null;
  const runtimeSnapshot = latestRuntimeOutcome ?? latestRuntimeSession;
  const packageVersion = runtimeSnapshot?.packageVersion ?? null;
  const artifactDigest = runtimeSnapshot?.artifactDigest ?? null;
  const runtimeContractSignature = runtimeSnapshot?.runtimeContractSignature ?? null;
  const sandboxModel = latestRuntimeSession?.sandboxModel ?? latestRuntimeOutcome?.sandboxModel ??
    null;
  const boundary = latestRuntimeSession?.boundary ?? latestRuntimeOutcome?.boundary ?? null;
  const deliverySubstrate = latestRuntimeOutcome?.deliverySubstrate ??
    latestRuntimeSession?.deliverySubstrate ?? null;
  const deliveryState = latestRuntimeOutcome?.deliveryState ??
    latestRuntimeSession?.deliveryState ?? null;
  const deliveryWorkerId = latestRuntimeOutcome?.deliveryWorkerId ??
    latestRuntimeSession?.deliveryWorkerId ?? null;
  const attemptId = latestRuntimeOutcome?.attemptId ?? latestRuntimeSession?.attemptId ?? null;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Reviewed runtime</p>
        <h2>Runtime session</h2>
        <p>Lantern records which reviewed package was launched, how Lantern delivered it, and how the latest governed runtime session ended for this setup.</p>
        <div class="facts">
          ${
    renderRuntimeFact(
      'Runtime session',
      latestRuntimeSession?.sessionId ?? 'Not recorded yet',
      latestRuntimeSession?.summary ??
        'Lantern has not recorded a reviewed runtime session for this setup yet.',
    )
  }
          ${
    renderRuntimeFact(
      'Attempt binding',
      attemptId ?? 'Not recorded yet',
      attemptId === null
        ? 'Lantern has not tied the latest reviewed runtime record to an attempt yet.'
        : `Lantern tied the latest reviewed runtime record to attempt ${attemptId}.`,
    )
  }
          ${
    renderRuntimeFact(
      'Reviewed package',
      packageVersion === null ? 'Not recorded yet' : `Package ${packageVersion}`,
      packageVersion === null
        ? 'Lantern has not recorded which approved reviewed package version launched for this setup yet.'
        : `Lantern launched the approved reviewed package version ${packageVersion} for this setup.`,
    )
  }
          ${
    renderRuntimeFact(
      'Artifact digest',
      artifactDigest ?? 'Not recorded yet',
      artifactDigest === null
        ? 'Lantern has not recorded the reviewed artifact digest for this runtime yet.'
        : 'Lantern records the immutable reviewed artifact digest that backed this runtime session.',
    )
  }
          ${
    renderRuntimeFact(
      'Runtime contract',
      runtimeContractSignature ?? 'Not recorded yet',
      runtimeContractSignature === null
        ? 'Lantern has not recorded the reviewed runtime contract signature for this runtime yet.'
        : 'Lantern records the reviewed runtime contract signature used to bind delivery and audit to the approved package.',
    )
  }
          ${
    renderActivityFact(
      'Started at',
      formatRuntimeTimestamp(latestRuntimeSession),
      latestRuntimeSession === null
        ? 'Lantern has not recorded when the latest reviewed runtime session started for this setup yet.'
        : 'Lantern records when the latest reviewed runtime session crossed into the governed runtime boundary.',
    )
  }
          ${
    renderActivityFact(
      'Sandbox model',
      describeRuntimeSandboxModel(sandboxModel),
      sandboxModel === null
        ? 'Lantern has not recorded the enforced sandbox model for this setup yet.'
        : `Lantern enforced the ${
          describeRuntimeSandboxModel(
            sandboxModel,
          )
        } for the latest reviewed runtime session.`,
    )
  }
          ${
    renderActivityFact(
      'Runtime boundary',
      describeRuntimeBoundary(boundary),
      boundary === null
        ? 'Lantern has not recorded the enforced runtime boundary for this setup yet.'
        : `Lantern kept reviewed app traffic inside the ${
          describeRuntimeBoundary(
            boundary,
          )
        } boundary.`,
    )
  }
          ${
    renderActivityFact(
      'Delivery substrate',
      describeRuntimeDeliverySubstrate(deliverySubstrate),
      deliverySubstrate === null
        ? 'Lantern has not recorded which reviewed-runtime delivery path served this setup yet.'
        : `Lantern served the latest reviewed runtime through ${
          describeRuntimeDeliverySubstrate(
            deliverySubstrate,
          )
        }.`,
    )
  }
          ${
    renderActivityFact(
      'Delivery state',
      describeRuntimeDeliveryState(deliveryState),
      deliveryState === null
        ? 'Lantern has not normalized the latest reviewed runtime state for this setup yet.'
        : describeRuntimeDeliveryStateSummary(runtimeSnapshot),
    )
  }
          ${
    renderRuntimeFact(
      'Delivery worker',
      deliveryWorkerId ?? 'Not recorded yet',
      deliveryWorkerId === null
        ? 'Lantern did not record a Dynamic Worker identity for this runtime delivery path.'
        : 'Lantern records the deterministic Dynamic Worker id used for the immutable reviewed runtime envelope.',
    )
  }
          ${
    renderRuntimeFact(
      'Latest outcome',
      describeRuntimeOutcome(latestRuntimeOutcome?.eventType),
      latestRuntimeOutcome?.summary ??
        'Lantern has not recorded a reviewed runtime outcome for this setup yet.',
    )
  }
        </div>
        ${renderRuntimeTroubleshootingCallout(runtimeSnapshot)}
        ${renderRuntimeOutcomeCallout(runtimeSnapshot)}
      </div>
    </section>`;
}

export function renderAnonymousEvidenceSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const anonymousEvidence = detail?.latestAnonymousEvidence ?? [];
  const runtimeOutcome = detail?.latestRuntimeOutcome ?? null;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Anonymous submission evidence</p>
        <h2>Anonymous submission evidence</h2>
        ${
    anonymousEvidence.length === 0
      ? `<div class="callout">
              <h3>No anonymous evidence recorded</h3>
              <p>Lantern has not recorded a stored anonymous submission artifact for this deployment yet.</p>
            </div>`
      : `<p>${escapeHtml(describeAnonymousEvidenceOutcome(runtimeOutcome))}</p>
            <div class="line-list">
              ${
        anonymousEvidence
          .map((artifact) => renderAnonymousEvidenceArtifact(artifact))
          .join('')
      }
            </div>`
  }
      </div>
    </section>`;
}

export function renderBrokerVerificationSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const internalVerification = detail?.brokerVerification?.internal ?? null;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">More history</p>
        <h2>Setup history</h2>
        <p>If you need past setup records or test logs for this app setup, open Verification. Most admins can ignore this unless they are troubleshooting.</p>
        <div class="facts">
          ${
    renderActivityFact(
      'Latest saved result',
      describeBrokerVerificationStatusLabel(internalVerification?.status ?? null),
      internalVerification?.summary ??
        'No setup record has been saved for this app setup yet.',
    )
  }
        </div>
        <div class="button-row">
          <a class="button-ghost" href="/admin/verification">Open Verification</a>
          ${
    internalVerification?.evidenceUrl
      ? `<a class="button-ghost" href="${
        escapeHtml(
          internalVerification.evidenceUrl,
        )
      }">Open log</a>`
      : ''
  }
        </div>
      </div>
    </section>`;
}

export function renderAgsSmokeSection(
  appId: string,
  slot: ManagedDeploymentSlot,
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const latestAgsSmoke = detail?.latestAgsSmoke ?? null;
  const lineItemUrl = readStringDetail(latestAgsSmoke?.detail, 'lineItemUrl');
  const errorCode = readNestedStringDetail(latestAgsSmoke?.detail, 'error', 'code');
  const errorText = readNestedStringDetail(latestAgsSmoke?.detail, 'error', 'message');
  const canRunSmoke = slot.persisted &&
    (slot.lms === 'moodle' || slot.lms === 'sakai') &&
    slot.deployment.binding?.lms === slot.lms;
  const runCopy = slot.lms === 'canvas'
    ? 'This test is available for Moodle and Sakai only.'
    : canRunSmoke
    ? `Run a grade return test for this ${formatLmsLabel(slot.lms)} setup.`
    : `Save the exact ${formatLmsLabel(slot.lms)} setup before running a grade return test.`;
  const runAction = slot.lms === 'canvas'
    ? ''
    : `<form method="post" action="/admin/packages/${
      escapeHtml(
        appId,
      )
    }/deployment/verify-grade-smoke" class="stack">
            <input type="hidden" name="lms" value="${escapeHtml(slot.lms)}" />
            <input type="hidden" name="deploymentRecordId" value="${
      escapeHtml(
        String(slot.deployment.id),
      )
    }" />
            <div class="button-row">
              <button type="submit" class="button-secondary" ${
      canRunSmoke ? '' : 'disabled'
    }>Run grade return check</button>
            </div>
          </form>`;
  const lineItemFact = lineItemUrl === null ? '' : `<div class="fact">
            <span class="fact-label">Test line item</span>
            <span class="fact-value">${escapeHtml(lineItemUrl)}</span>
            <p class="micro muted">Lantern uses a separate test line item so this check does not touch learner grades.</p>
          </div>`;
  const failureCallout = errorText === null ? '' : `<div class="callout">
            <h3>Latest check failure</h3>
            <p>${escapeHtml(errorText)}</p>
            ${errorCode === null ? '' : `<p class="micro muted">Code ${escapeHtml(errorCode)}</p>`}
          </div>`;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Grade return check</p>
        <h2>Latest grade return check</h2>
        <p>${escapeHtml(runCopy)}</p>
        <div class="facts">
          ${
    renderActivityFact(
      'Status',
      describeSmokeStatus(latestAgsSmoke),
      latestAgsSmoke?.summary ??
        'No grade return check has been recorded for this setup yet.',
    )
  }
          ${
    renderActivityFact(
      'Checked at',
      formatActivityTimestamp(latestAgsSmoke),
      latestAgsSmoke === null
        ? 'Lantern has not recorded a grade return check for this setup yet.'
        : `Lantern keeps this result scoped to the viewed ${formatLmsLabel(slot.lms)} setup.`,
    )
  }
          ${
    renderActivityFact(
      'Grade return access',
      describeSmokeCapability(latestAgsSmoke, readBooleanDetail),
      describeSmokeCapabilitySummary(latestAgsSmoke, readBooleanDetail),
    )
  }
          ${
    renderActivityFact(
      'Test write',
      describeSmokePublication(latestAgsSmoke, readStringDetail),
      describeSmokePublicationSummary(latestAgsSmoke, readStringDetail),
    )
  }
          ${
    renderActivityFact(
      'LTI profile',
      describeActivityLtiProfile(latestAgsSmoke?.detail) ?? 'Not recorded yet',
      latestAgsSmoke === null
        ? 'Lantern has not recorded a grade return check for this setup yet.'
        : 'Lantern records which saved LTI profile was enforced for this check.',
    )
  }
        </div>
        ${lineItemFact}
        ${failureCallout}
        ${runAction}
      </div>
    </section>`;
}

function renderRuntimeTroubleshootingCallout(
  runtimeSnapshot: ControlPlaneRuntimeEvidenceSnapshot | null,
): string {
  if (runtimeSnapshot === null) {
    return '';
  }

  const summary = describeRuntimeTroubleshootingSummary(runtimeSnapshot);

  if (summary === null) {
    return '';
  }

  return `<div class="callout">
      <h3>${escapeHtml(describeRuntimeDeliveryState(runtimeSnapshot.deliveryState))}</h3>
      <p>${escapeHtml(summary)}</p>
    </div>`;
}

function renderRuntimeOutcomeCallout(
  runtimeSnapshot: ControlPlaneRuntimeEvidenceSnapshot | null,
): string {
  if (runtimeSnapshot === null) {
    return '';
  }

  const runtimeFacts = [
    describeRuntimeRoute(runtimeSnapshot.route),
    runtimeSnapshot.capability === null ? null : `Capability ${runtimeSnapshot.capability}`,
    runtimeSnapshot.code === null ? null : `Code ${runtimeSnapshot.code}`,
  ].filter((value): value is string => value !== null);

  if (runtimeFacts.length === 0) {
    return '';
  }

  return `<p class="micro muted">${escapeHtml(runtimeFacts.join(' · '))}</p>`;
}

function describeRuntimeDeliveryStateSummary(
  runtimeSnapshot: ControlPlaneRuntimeEvidenceSnapshot | null,
): string {
  if (runtimeSnapshot === null) {
    return 'Lantern has not normalized the latest reviewed runtime state for this setup yet.';
  }

  switch (runtimeSnapshot.deliveryState) {
    case 'started':
      return 'Lantern launched the reviewed package and has not recorded a later runtime outcome for this setup yet.';
    case 'exited':
      return 'Lantern recorded a governed runtime exit for the latest reviewed session.';
    case 'deliveryFailed':
      return 'Lantern recorded a reviewed-runtime delivery failure before app bytes could be served.';
    case 'assetMissing':
      return 'Lantern recorded that a reviewed runtime file was missing from the approved package snapshot.';
    case 'integrityFailed':
      return 'Lantern blocked the reviewed runtime before app code could continue because an integrity check failed.';
    case 'timedOut':
      return 'Lantern recorded that the reviewed runtime session timed out before the app could continue.';
    case 'denied':
      return 'Lantern denied the reviewed runtime session before app code could continue.';
    case 'capabilityDenied':
      return 'Lantern denied a reviewed app capability at the governed runtime boundary.';
    case null:
      return 'Lantern has not normalized the latest reviewed runtime state for this setup yet.';
  }
}

function describeRuntimeTroubleshootingSummary(
  runtimeSnapshot: ControlPlaneRuntimeEvidenceSnapshot,
): string | null {
  switch (runtimeSnapshot.deliveryState) {
    case 'deliveryFailed':
      return 'Dynamic Worker delivery failed before Lantern could serve the immutable reviewed runtime bytes for the latest session.';
    case 'assetMissing':
      return 'Lantern could not find one of the reviewed runtime files inside the approved package snapshot.';
    case 'integrityFailed':
      return 'Lantern stopped the reviewed runtime before app code could continue because a governed integrity check failed.';
    case 'timedOut':
      return 'Lantern recorded that the reviewed runtime session timed out before the learner could continue.';
    case 'denied':
      return 'Lantern denied the reviewed runtime session before the reviewed app could continue.';
    case 'capabilityDenied':
      return 'Lantern denied a reviewed app capability at the governed runtime boundary.';
    case 'started':
    case 'exited':
    case null:
      return null;
  }
}

function describeAnonymousEvidenceOutcome(
  latestRuntimeOutcome: ControlPlaneRuntimeEvidenceSnapshot | null,
): string {
  if (latestRuntimeOutcome === null) {
    return 'Lantern has not recorded an anonymous finalize outcome for this deployment yet.';
  }

  const detail = latestRuntimeOutcome.detail;
  const submissionMode = readStringDetail(detail, 'submissionMode');
  const scoreGiven = readFiniteDetailNumber(detail, 'scoreGiven');
  const scoreMaximum = readFiniteDetailNumber(detail, 'scoreMaximum');
  const specCount = readBrowserGraderSpecCount(detail);

  if (
    submissionMode === 'anonymous_submission' &&
    scoreGiven !== null &&
    scoreMaximum !== null &&
    specCount !== null
  ) {
    return `Latest browser-grader outcome: ${scoreGiven} / ${scoreMaximum} across ${specCount} reviewed specs.`;
  }

  if (submissionMode === 'anonymous_submission' && scoreGiven !== null && scoreMaximum !== null) {
    return `Latest finalize outcome: ${scoreGiven} / ${scoreMaximum} recorded through anonymous submission.`;
  }

  return latestRuntimeOutcome.summary;
}

function describeAnonymousEvidenceArtifactMetadata(artifact: {
  contentType: string | null;
  byteSize: number | null;
  sha256: string | null;
  createdAt: string | null;
}): string {
  const facts = [
    artifact.contentType === null
      ? 'Content type not recorded yet'
      : `Content type ${artifact.contentType}`,
    `Size ${formatByteSize(artifact.byteSize)}`,
    artifact.sha256 === null ? 'SHA-256 not recorded yet' : `SHA-256 ${artifact.sha256}`,
    `Recorded ${formatOptionalTimestamp(artifact.createdAt)}`,
  ];

  return facts.join(' · ');
}

function renderAnonymousEvidenceArtifact(artifact: ControlPlaneAnonymousEvidenceArtifact): string {
  const isScreenshot = artifact.kind === 'screenshot_png' || artifact.contentType === 'image/png';

  if (!isScreenshot) {
    return `<article class="line-item">
        <p class="line-title">${escapeHtml(artifact.fileName)}</p>
        <p class="line-copy">${
      escapeHtml(
        `${describeEvidenceArtifactKind(artifact.kind)} stored for ${artifact.artifactId}.`,
      )
    }</p>
        <p class="micro muted">${
      escapeHtml(
        describeAnonymousEvidenceArtifactMetadata(artifact),
      )
    }</p>
        <p><a href="${escapeHtml(artifact.artifactUrl)}">Open stored artifact</a></p>
      </article>`;
  }

  return `<article class="line-item">
      <p class="line-title">Supplemental screenshot evidence</p>
      <p class="micro muted">${escapeHtml(artifact.fileName)}</p>
      <p class="line-copy">Supplemental screenshot evidence stored for ${
    escapeHtml(
      artifact.artifactId,
    )
  }. Helpful for review, but not exhaustive proof of learner behavior.</p>
      <p class="micro muted">${escapeHtml(describeAnonymousEvidenceArtifactMetadata(artifact))}</p>
      <img src="${escapeHtml(artifact.artifactUrl)}" alt="${
    escapeHtml(
      `Supplemental screenshot evidence ${artifact.fileName}`,
    )
  }" loading="lazy" style="max-width: 100%; height: auto;">
      <p><a href="${escapeHtml(artifact.artifactUrl)}">Open stored artifact</a></p>
    </article>`;
}

function readFiniteDetailNumber(detail: Record<string, unknown>, key: string): number | null {
  const value = detail[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBrowserGraderSpecCount(detail: Record<string, unknown>): number | null {
  const browserGraderResult = detail.browserGraderResult;

  if (
    !browserGraderResult ||
    typeof browserGraderResult !== 'object' ||
    Array.isArray(browserGraderResult)
  ) {
    return null;
  }

  const specResults = (browserGraderResult as Record<string, unknown>).specResults;

  return Array.isArray(specResults) ? specResults.length : null;
}

function renderRuntimeFact(label: string, value: string, summary: string): string {
  return `<div class="fact">
      <span class="fact-label">${escapeHtml(label)}</span>
      <span class="fact-value">${escapeHtml(value)}</span>
      <p class="micro muted">${escapeTextContent(summary)}</p>
    </div>`;
}

function escapeTextContent(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
