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
  describeProblemFactSummary,
  formatActivityTimestamp,
  formatGradePublicationTimestamp,
  renderActivityFact,
  renderDimensionRow,
  renderRecentLaunchRow,
} from './deployment_detail_ops_support.ts';
import {
  describeGradePublication,
  describeOverallStatus,
  describeProblemSummary,
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
  const recentLaunches = detail?.recentLaunches ?? [];
  const visibleLaunches = recentLaunches.slice(0, 3);
  const retryableDiagnostics = diagnostics.filter((item) => item.retryable);
  const showDetails = openDetails || diagnostics.length > 0;
  const viewedDeploymentLabel = slot.persisted
    ? `${formatLmsLabel(slot.lms)} deployment`
    : `${formatLmsLabel(slot.lms)} slot`;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Recent use</p>
        <div class="two-column">
          <div class="stack">
            <h2>Recent launches</h2>
            <p>See who opened this ${escapeHtml(
              viewedDeploymentLabel,
            )}. Open the details below only when you need checks or troubleshooting.</p>
          </div>
          <div class="facts">
            ${renderActivityFact(
              'People recently active',
              String(detail?.pilotUsage.recentActiveUsers ?? 0),
              detail === null
                ? 'No recent usage has been recorded for this LMS setup yet.'
                : `Lantern counted ${detail.pilotUsage.recentActiveUsers} recent people on this LMS setup.`,
            )}
            ${renderActivityFact(
              'Last opened',
              formatActivityTimestamp(detail?.latestLaunch),
              detail?.latestLaunch?.summary ?? 'No launch has been recorded yet.',
            )}
            ${renderActivityFact(
              'Problems to review',
              describeProblemSummary(diagnostics.length),
              describeProblemFactSummary(diagnostics.length, retryableDiagnostics.length),
            )}
          </div>
        </div>
        ${
          visibleLaunches.length === 0
            ? `<div class="callout">
              <h3>No launches recorded yet</h3>
              <p>Lantern has not recorded a successful launch for this LMS setup yet.</p>
            </div>`
            : `<div class="table-list">
              ${visibleLaunches.map((item) => renderRecentLaunchRow(item)).join('')}
            </div>`
        }
        ${
          recentLaunches.length > visibleLaunches.length
            ? `<p class="micro muted">Showing the ${escapeHtml(
                String(visibleLaunches.length),
              )} most recent launches.</p>`
            : ''
        }
        <details id="activity-details" ${showDetails ? 'open' : ''}>
          <summary>Open checks and troubleshooting</summary>
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
