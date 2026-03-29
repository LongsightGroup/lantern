import { summarizePilotUsage } from '../ops/service.ts';
import type { ManagedDeploymentSlot } from './deployment_detail.ts';
import type { ControlPlaneDeploymentDetailSnapshot } from '../ops/types.ts';
import { escapeHtml } from './layout.ts';
import {
  renderAgsSmokeSection,
  renderBrokerVerificationSection,
  renderDiagnosticsSection,
} from './deployment_detail_ops_evidence_sections.ts';
import {
  formatActivityTimestamp,
  formatBrokerVerificationTimestamp,
  formatGradePublicationTimestamp,
  renderActivityFact,
  renderDimensionRow,
} from './deployment_detail_ops_support.ts';
import {
  describeGradePublication,
  describeOverallStatus,
  formatLmsLabel,
} from './deployment_detail_ops_labels.ts';

export function renderControlPlaneStatusSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const health = detail?.inventory.health ?? null;

  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Operations</p>
          <h2>Current status</h2>
          <div class="facts">
            ${renderActivityFact(
              'Overall status',
              describeOverallStatus(health?.overallStatus ?? null),
              health?.summary ?? 'No control-plane status has been recorded yet.',
            )}
            ${renderActivityFact(
              'Last launch',
              formatActivityTimestamp(detail?.latestLaunch),
              detail?.latestLaunch?.summary ?? 'No launch has been recorded yet.',
            )}
            ${renderActivityFact(
              'Last grade write',
              formatGradePublicationTimestamp(detail?.latestGradePublish),
              detail?.latestGradePublish
                ? describeGradePublication(detail.latestGradePublish)
                : 'No grade publish has been recorded yet.',
            )}
            ${renderActivityFact(
              'Last NRPS read',
              formatActivityTimestamp(detail?.latestNrpsRead),
              detail?.latestNrpsRead?.summary ?? 'Roster verification has not run yet.',
            )}
          </div>
        </div>
        <section class="stack">
          <p class="section-label">Checks</p>
          <h2>Status by area</h2>
          <div class="table-list">
            ${renderDimensionRow('Review', health?.dimensions.review ?? null)}
            ${renderDimensionRow('Enablement', health?.dimensions.enablement ?? null)}
            ${renderDimensionRow('Launch', health?.dimensions.launch ?? null)}
            ${renderDimensionRow('AGS publish', health?.dimensions.gradePublication ?? null)}
            ${renderDimensionRow('NRPS', health?.dimensions.nrps ?? null)}
          </div>
        </section>
      </div>
    </section>`;
}

export function renderPilotUsageSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const pilotUsageFacts =
    detail === null
      ? [
          { label: 'Launches recorded', value: '0' },
          { label: 'Attempts completed', value: '0' },
          { label: 'Grade publishes', value: '0 passed / 0 failed' },
          { label: 'Recent active users', value: '0' },
        ]
      : summarizePilotUsage(detail.pilotUsage);

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Pilot usage</p>
        <h2>Recent usage</h2>
        <div class="facts">
          ${pilotUsageFacts
            .map(
              (fact) =>
                `<div class="fact">
              <span class="fact-label">${escapeHtml(fact.label)}</span>
              <span class="fact-value">${escapeHtml(fact.value)}</span>
            </div>`,
            )
            .join('')}
        </div>
      </div>
    </section>`;
}

export function renderOperationalEvidenceSection(
  appId: string,
  slot: ManagedDeploymentSlot,
  detail: ControlPlaneDeploymentDetailSnapshot | null,
  openDetails = false,
): string {
  const diagnostics = detail?.diagnostics ?? [];
  const latestAgsSmoke = detail?.latestAgsSmoke ?? null;
  const retryableDiagnostics = diagnostics.filter((item) => item.retryable);
  const internalVerification = detail?.brokerVerification?.internal ?? null;
  const viewedDeploymentLabel = slot.persisted
    ? `${formatLmsLabel(slot.lms)} deployment`
    : `${formatLmsLabel(slot.lms)} slot`;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Tests and activity</p>
        <div class="two-column">
          <div class="stack">
            <h2>Recent activity</h2>
            <p>See what Lantern has recorded for this ${escapeHtml(
              viewedDeploymentLabel,
            )}: setup saves, launches, grade return checks, and any problems. Open details only if you need more.</p>
          </div>
          <div class="facts">
            ${renderActivityFact(
              'Install evidence',
              formatActivityTimestamp(detail?.latestInstallEvidence),
              detail?.latestInstallEvidence?.summary ??
                'No install evidence has been recorded for this deployment yet.',
            )}
            ${renderActivityFact(
              'Last launch',
              formatActivityTimestamp(detail?.latestLaunch),
              detail?.latestLaunch?.summary ?? 'No launch has been recorded yet.',
            )}
            ${renderActivityFact(
              'Latest grade check',
              formatActivityTimestamp(latestAgsSmoke),
              latestAgsSmoke?.summary ??
                'No grade return check has been recorded for this setup yet.',
            )}
            ${renderActivityFact(
              'Latest setup check',
              formatBrokerVerificationTimestamp(internalVerification),
              internalVerification?.summary ??
                'No setup check has been recorded for this LMS setup yet.',
            )}
            ${renderActivityFact(
              'Diagnostics',
              diagnostics.length === 0 ? 'Clear' : `${diagnostics.length} recorded`,
              retryableDiagnostics.length === 0
                ? 'No retry actions are waiting right now.'
                : `${retryableDiagnostics.length} retry action${
                    retryableDiagnostics.length === 1 ? '' : 's'
                  } still need operator follow-up.`,
            )}
          </div>
        </div>
        <details id="activity-details" ${openDetails ? 'open' : ''}>
          <summary>Open activity and failure details</summary>
          <div class="detail-stack">
            ${renderControlPlaneStatusSection(detail)}
            ${renderAgsSmokeSection(appId, slot, detail)}
            ${renderBrokerVerificationSection(detail)}
            ${renderPilotUsageSection(detail)}
            ${renderDiagnosticsSection(appId, detail)}
          </div>
        </details>
      </div>
    </section>`;
}
