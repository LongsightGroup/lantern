import type { ManagedDeploymentSlot } from './deployment_detail.ts';
import type { ControlPlaneDeploymentDetailSnapshot } from '../ops/types.ts';
import { escapeHtml } from './layout.ts';
import {
  formatActivityTimestamp,
  readBooleanDetail,
  readNestedStringDetail,
  readStringDetail,
  renderActivityFact,
  renderDiagnosticRow,
} from './deployment_detail_ops_support.ts';
import {
  describeBrokerVerificationStatus as describeBrokerVerificationStatusLabel,
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
              <p>Lantern has not recorded a failed launch, roster read, or grade write for this setup.</p>
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
        <p class="section-label">More history</p>
        <h2>Setup history</h2>
        <p>If you need past setup records or test logs for this app setup, open Verification. Most admins can ignore this unless they are troubleshooting.</p>
        <div class="facts">
          ${renderActivityFact(
            'Latest saved result',
            describeBrokerVerificationStatusLabel(internalVerification?.status ?? null),
            internalVerification?.summary ??
              'No setup record has been saved for this app setup yet.',
          )}
        </div>
        <div class="button-row">
          <a class="button-ghost" href="/admin/verification">Open Verification</a>
          ${
            internalVerification?.evidenceUrl
              ? `<a class="button-ghost" href="${escapeHtml(
                  internalVerification.evidenceUrl,
                )}">Open log</a>`
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
  const canRunSmoke =
    slot.persisted &&
    (slot.lms === 'moodle' || slot.lms === 'sakai') &&
    slot.deployment.binding?.lms === slot.lms;
  const runCopy =
    slot.lms === 'canvas'
      ? 'This test is available for Moodle and Sakai only.'
      : canRunSmoke
        ? `Run a grade return test for this ${formatLmsLabel(slot.lms)} setup.`
        : `Save the exact ${formatLmsLabel(slot.lms)} setup before running a grade return test.`;
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
              }>Run grade return check</button>
            </div>
          </form>`;
  const lineItemFact =
    lineItemUrl === null
      ? ''
      : `<div class="fact">
            <span class="fact-label">Test line item</span>
            <span class="fact-value">${escapeHtml(lineItemUrl)}</span>
            <p class="micro muted">Lantern uses a separate test line item so this check does not touch learner grades.</p>
          </div>`;
  const failureCallout =
    errorText === null
      ? ''
      : `<div class="callout">
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
          ${renderActivityFact(
            'Status',
            describeSmokeStatus(latestAgsSmoke),
            latestAgsSmoke?.summary ??
              'No grade return check has been recorded for this setup yet.',
          )}
          ${renderActivityFact(
            'Checked at',
            formatActivityTimestamp(latestAgsSmoke),
            latestAgsSmoke === null
              ? 'Lantern has not recorded a grade return check for this setup yet.'
              : `Lantern keeps this result scoped to the viewed ${formatLmsLabel(slot.lms)} setup.`,
          )}
          ${renderActivityFact(
            'Grade return access',
            describeSmokeCapability(latestAgsSmoke, readBooleanDetail),
            describeSmokeCapabilitySummary(latestAgsSmoke, readBooleanDetail),
          )}
          ${renderActivityFact(
            'Test write',
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
