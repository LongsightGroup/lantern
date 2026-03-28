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
  formatGradePublicationTimestamp,
  formatBrokerVerificationTimestamp,
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
          <p>Keep the deployment's release state, latest launch evidence, latest AGS write, and latest NRPS read on one governed admin page.</p>
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
              'Last AGS write',
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
          <p class="section-label">Status dimensions</p>
          <h2>Readable control-plane facts</h2>
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
        <h2>Basic activity from durable evidence</h2>
        <p>Counts stay deliberately small: launches, completed attempts, governed grade publishes, and recent active learners for this deployment.</p>
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
        <p class="section-label">Operations</p>
        <div class="two-column">
          <div class="stack">
            <h2>Deployment-scoped operational evidence.</h2>
            <p>Use the LMS slot in view first. Open the evidence drawer only when you need install, launch, verification, or failure detail for this ${escapeHtml(
              viewedDeploymentLabel,
            )}.</p>
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
              'Latest AGS smoke',
              formatActivityTimestamp(latestAgsSmoke),
              latestAgsSmoke?.summary ??
                'No grade smoke verification has been recorded for this deployment yet.',
            )}
            ${renderActivityFact(
              'Latest internal verification',
              formatBrokerVerificationTimestamp(internalVerification),
              internalVerification?.summary ??
                'No internal verification evidence has been recorded for this deployment yet.',
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
        <details>
          <summary>Show install, launch, verification, and diagnostic detail</summary>
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
