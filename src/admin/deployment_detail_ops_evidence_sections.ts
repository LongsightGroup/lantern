import type { ManagedDeploymentSlot } from './deployment_detail.ts';
import type { ControlPlaneDeploymentDetailSnapshot } from '../ops/types.ts';
import { escapeHtml } from './layout.ts';
import {
  formatActivityTimestamp,
  formatBrokerVerificationTimestamp,
  readBooleanDetail,
  readNestedStringDetail,
  readStringDetail,
  renderActivityFact,
  renderDiagnosticRow,
} from './deployment_detail_ops_support.ts';
import {
  describeBrokerVerificationStatus as describeBrokerVerificationStatusLabel,
  describeSmokeStatus,
  describeSmokeCapability,
  describeSmokeCapabilitySummary,
  formatLmsLabel,
  describeSmokePublication,
  describeSmokePublicationSummary,
} from './deployment_detail_ops_labels.ts';

export function renderDiagnosticsSection(
  appId: string,
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const diagnostics = detail?.diagnostics ?? [];
  const retryAttemptId = detail?.retryableGradePublication?.attemptId ?? null;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Diagnostics</p>
        <h2>Readable failure evidence</h2>
        <p>Lantern keeps rejected launches, roster verification failures, and AGS publish failures as bounded operator evidence instead of raw protocol dumps.</p>
        ${
          diagnostics.length === 0
            ? `<div class="callout">
              <h3>No diagnostics recorded yet</h3>
              <p>The deployment has not recorded a failed launch, NRPS read, or AGS publish yet.</p>
            </div>`
            : `<div class="table-list">
              ${diagnostics
                .map((item) => renderDiagnosticRow(item, appId, retryAttemptId))
                .join('')}
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
        <p class="section-label">Verification</p>
        <h2>Latest internal verification</h2>
        <p>Internal broker verification stays deployment-scoped here. Official 1EdTech evidence remains on the shared verification page.</p>
        <div class="facts">
          ${renderActivityFact(
            'Status',
            describeBrokerVerificationStatusLabel(internalVerification?.status ?? null),
            internalVerification?.summary ??
              'No internal verification evidence has been recorded for this deployment yet.',
          )}
          ${renderActivityFact(
            'Checked at',
            formatBrokerVerificationTimestamp(internalVerification),
            internalVerification === null
              ? 'Record manual or CI proof from /admin/verification when this deployment has been checked.'
              : 'Lantern keeps this proof scoped to the deployment in view.',
          )}
        </div>
        ${
          internalVerification?.evidenceUrl
            ? `<div class="button-row">
              <a class="button-ghost" href="${escapeHtml(
                internalVerification.evidenceUrl,
              )}">${escapeHtml(internalVerification.evidenceUrl)}</a>
            </div>`
            : ''
        }
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
  const canRunSmoke =
    slot.persisted &&
    (slot.lms === 'moodle' || slot.lms === 'sakai') &&
    slot.deployment.binding?.lms === slot.lms;
  const runCopy =
    slot.lms === 'canvas'
      ? 'Phase 11 keeps grade smoke verification limited to the blessed Moodle and Sakai deployment paths.'
      : canRunSmoke
        ? `Run the blessed ${formatLmsLabel(
            slot.lms,
          )} smoke path from this deployment view. Lantern records only bounded AGS capability, publication, and line-item facts.`
        : `Save the exact ${formatLmsLabel(
            slot.lms,
          )} binding before running grade smoke verification.`;
  const runAction =
    slot.lms === 'canvas'
      ? ''
      : `<form method="post" action="/admin/packages/${escapeHtml(
          appId,
        )}/deployment/verify-grade-smoke" class="stack">
            <input type="hidden" name="lms" value="${escapeHtml(slot.lms)}" />
            <input type="hidden" name="deploymentRecordId" value="${escapeHtml(
              String(slot.deployment.id),
            )}" />
            <div class="button-row">
              <button type="submit" class="button-secondary" ${
                canRunSmoke ? '' : 'disabled'
              }>Run grade smoke check</button>
            </div>
          </form>`;
  const lineItemFact =
    lineItemUrl === null
      ? ''
      : `<div class="fact">
            <span class="fact-label">Smoke line item</span>
            <span class="fact-value">${escapeHtml(lineItemUrl)}</span>
            <p class="micro muted">Lantern keeps smoke verification on a dedicated line item instead of the learner final-grade path.</p>
          </div>`;
  const failureCallout =
    errorText === null
      ? ''
      : `<div class="callout">
            <h3>Latest smoke failure</h3>
            <p>${escapeHtml(errorText)}</p>
            ${errorCode === null ? '' : `<p class="micro muted">Code ${escapeHtml(errorCode)}</p>`}
          </div>`;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">AGS smoke</p>
        <h2>Latest grade smoke verification</h2>
        <p>${escapeHtml(runCopy)}</p>
        <div class="facts">
          ${renderActivityFact(
            'Status',
            describeSmokeStatus(latestAgsSmoke),
            latestAgsSmoke?.summary ??
              'No grade smoke verification has been recorded for this deployment yet.',
          )}
          ${renderActivityFact(
            'Checked at',
            formatActivityTimestamp(latestAgsSmoke),
            latestAgsSmoke === null
              ? 'Lantern has not recorded a grade smoke check for this deployment yet.'
              : `Lantern keeps this result scoped to the viewed ${formatLmsLabel(
                  slot.lms,
                )} deployment.`,
          )}
          ${renderActivityFact(
            'AGS capability',
            describeSmokeCapability(latestAgsSmoke, readBooleanDetail),
            describeSmokeCapabilitySummary(latestAgsSmoke, readBooleanDetail),
          )}
          ${renderActivityFact(
            'Publication',
            describeSmokePublication(latestAgsSmoke, readStringDetail),
            describeSmokePublicationSummary(latestAgsSmoke, readStringDetail),
          )}
        </div>
        ${lineItemFact}
        ${failureCallout}
        ${runAction}
      </div>
    </section>`;
}
