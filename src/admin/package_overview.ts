import {
  approvalStatusClass,
  approvalStatusDetail,
  approvalStatusLabel,
  summarizeAccessibilityReview,
} from '../package_review/summary.ts';
import type { DeploymentRecord, PackageVersionRecord } from '../package_review/types.ts';
import { type AdminNotice, escapeHtml, formatDateTime, renderAdminLayout } from './layout.ts';
import { renderPackagePageNav, supportsAuthoringDrafts } from './package_navigation.ts';

export function renderPackageOverviewPage(input: {
  appId: string;
  appTitle: string;
  history: PackageVersionRecord[];
  deployments: DeploymentRecord[];
  notice?: AdminNotice | null;
}): string {
  const latestVersion = input.history[0] ?? null;
  const latestApprovedVersion =
    input.history.find((version) => version.approvalStatus === 'approved') ?? null;
  const connectedDeployments = input.deployments.filter(
    (deployment) => deployment.binding !== null,
  );
  const liveDeploymentCounts = buildLiveDeploymentCounts(input.deployments);

  return renderAdminLayout({
    title: `${input.appTitle} App`,
    eyebrow: 'App',
    heading: input.appTitle,
    intro: 'Versions, governed launch tools, and LMS settings for this app.',
    activePath: '/admin/packages',
    breadcrumbs: [
      { label: 'Apps', href: '/admin/packages' },
      {
        label: input.appTitle,
      },
    ],
    notice: input.notice ?? null,
    pageNav: renderPackagePageNav({
      appId: input.appId,
      history: input.history,
      currentSection: 'overview',
    }),
    body: `<section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">App summary</p>
            <h2>${escapeHtml(input.appTitle)} <span class="app-inline-meta">App ID ${
      escapeHtml(
        input.appId,
      )
    }</span></h2>
            <p>${escapeHtml(latestVersion?.description ?? 'No app description was provided.')}</p>
          </div>
          <div class="button-row">
            ${
      latestVersion === null ? '' : `<a class="button-primary" href="/admin/packages/${
        escapeHtml(
          input.appId,
        )
      }/versions/${escapeHtml(latestVersion.version)}">Open latest version</a>`
    }
            <a class="button-secondary" href="/admin/packages/${
      escapeHtml(
        input.appId,
      )
    }/deployment">Open settings</a>
            <a class="button-ghost" href="/admin/packages/${
      escapeHtml(
        input.appId,
      )
    }/reports">Reports</a>
            ${
      latestApprovedVersion === null
        ? ''
        : `<a class="button-ghost" href="/admin/packages/${
          escapeHtml(
            input.appId,
          )
        }/versions/${escapeHtml(latestApprovedVersion.version)}/preview">Test launch</a>`
    }
          </div>
        </div>
        <div class="facts">
          <div class="fact">
            <span class="fact-label">Latest version</span>
            <span class="fact-value">${escapeHtml(latestVersion?.version ?? 'None yet')}</span>
          </div>
          <div class="fact">
            <span class="fact-label">Latest status</span>
            <span class="fact-value">${
      escapeHtml(
        latestVersion === null ? 'Not reviewed' : approvalStatusLabel(latestVersion.approvalStatus),
      )
    }</span>
          </div>
          <div class="fact">
            <span class="fact-label">Approved version</span>
            <span class="fact-value">${
      escapeHtml(
        latestApprovedVersion?.version ?? 'No approved version',
      )
    }</span>
          </div>
          <div class="fact">
            <span class="fact-label">LMS connections</span>
            <span class="fact-value">${escapeHtml(String(connectedDeployments.length))}</span>
          </div>
          <div class="fact">
            <span class="fact-label">Updated</span>
            <span class="fact-value">${
      escapeHtml(
        formatDateTime(latestVersion?.importedAt ?? null),
      )
    }</span>
          </div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Versions</p>
            <h2>Reviewed versions</h2>
            <p>Each version shows whether it is the current reviewed baseline and whether it is live in LMS now.</p>
          </div>
        </div>
        <div class="table-list">
          ${
      input.history
        .map((version) =>
          renderOverviewVersionRow({
            version,
            isLatestVersion: latestVersion?.id === version.id,
            isLatestApproved: latestApprovedVersion?.id === version.id,
            liveDeploymentCount: liveDeploymentCounts.get(version.id) ?? 0,
          })
        )
        .join('')
    }
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Connections</p>
            <h2>LMS setup</h2>
            <p>Keep live LMS bindings in one place so version review stays separate from rollout decisions.</p>
          </div>
          <div class="button-row">
            <a class="button-secondary" href="/admin/packages/${
      escapeHtml(
        input.appId,
      )
    }/deployment">Manage settings</a>
          </div>
        </div>
        ${
      input.deployments.length === 0
        ? '<p class="muted">No LMS connection has been saved for this app yet.</p>'
        : `<div class="table-list">
              ${input.deployments.map((deployment) => renderDeploymentRow(deployment)).join('')}
            </div>`
    }
      </div>
    </section>`,
  });
}

function renderOverviewVersionRow(input: {
  version: PackageVersionRecord;
  isLatestVersion: boolean;
  isLatestApproved: boolean;
  liveDeploymentCount: number;
}): string {
  const { version, isLatestVersion, isLatestApproved, liveDeploymentCount } = input;
  const accessibility = summarizeAccessibilityReview(version);
  const stateChips = renderVersionStateChips({
    isLatestVersion,
    isLatestApproved,
    liveDeploymentCount,
  });

  return `<article class="table-row version-row${isLatestApproved ? ' version-row-current' : ''}">
    <div class="version-row-layout">
      <div class="stack version-row-copy">
        <p class="line-title">
          <a href="/admin/packages/${escapeHtml(version.appId)}/versions/${
    escapeHtml(
      version.version,
    )
  }">Version ${escapeHtml(version.version)}</a>
          <span class="${approvalStatusClass(version.approvalStatus)}">${
    escapeHtml(
      approvalStatusLabel(version.approvalStatus),
    )
  }</span>
        </p>
        ${stateChips}
        <p class="line-copy">${
    escapeHtml(
      version.reviewNotes ??
        version.description ??
        approvalStatusDetail(version.approvalStatus),
    )
  }</p>
      </div>
      <div class="version-row-actions">
        <a class="button-secondary" href="/admin/packages/${
    escapeHtml(
      version.appId,
    )
  }/versions/${escapeHtml(version.version)}">Open version</a>
        ${
    version.approvalStatus === 'rejected'
      ? ''
      : `<a class="button-ghost" href="/admin/packages/${
        escapeHtml(
          version.appId,
        )
      }/versions/${escapeHtml(version.version)}/preview">Test launch</a>`
  }
        ${
    version.approvalStatus !== 'approved' || !supportsAuthoringDrafts(version)
      ? ''
      : `<a class="button-ghost" href="/admin/packages/${
        escapeHtml(
          version.appId,
        )
      }/versions/${escapeHtml(version.version)}/authoring">Authoring</a>`
  }
      </div>
    </div>
    <div class="table-row-meta">
      <span><strong>Added</strong> ${escapeHtml(formatDateTime(version.importedAt))}</span>
      <span><strong>Accessibility</strong> ${escapeHtml(accessibility.label)}</span>
      <span><strong>Roles</strong> ${escapeHtml(version.roles.join(', '))}</span>
      <span><strong>Placement</strong> ${
    escapeHtml(
      version.installScope === 'assignment' ? 'Assignment' : 'Course',
    )
  }</span>
    </div>
  </article>`;
}

function renderVersionStateChips(input: {
  isLatestVersion: boolean;
  isLatestApproved: boolean;
  liveDeploymentCount: number;
}): string {
  const chips: string[] = [];

  if (input.isLatestApproved) {
    chips.push('<span class="chip version-summary-chip">Current reviewed baseline</span>');
  } else if (input.isLatestVersion) {
    chips.push(
      '<span class="chip version-summary-chip version-summary-chip-muted">Newest upload</span>',
    );
  }

  chips.push(
    input.liveDeploymentCount > 0
      ? `<span class="chip chip-status chip-status-healthy">${
        escapeHtml(
          formatLiveRolloutChipLabel(input.liveDeploymentCount),
        )
      }</span>`
      : '<span class="chip version-rollout-chip">Not live in LMS</span>',
  );

  return `<div class="chip-row version-row-state">${chips.join('')}</div>`;
}

function buildLiveDeploymentCounts(deployments: DeploymentRecord[]): Map<number, number> {
  const counts = new Map<number, number>();

  for (const deployment of deployments) {
    if (deployment.binding === null || deployment.enabledPackageVersionId === null) {
      continue;
    }

    counts.set(
      deployment.enabledPackageVersionId,
      (counts.get(deployment.enabledPackageVersionId) ?? 0) + 1,
    );
  }

  return counts;
}

function formatLiveRolloutChipLabel(liveDeploymentCount: number): string {
  return `Live now in ${liveDeploymentCount} LMS setup${liveDeploymentCount === 1 ? '' : 's'}`;
}

function renderDeploymentRow(deployment: DeploymentRecord): string {
  return `<article class="table-row">
    <div class="table-row-top">
      <div class="stack">
        <p class="line-title">${escapeHtml(formatLmsLabel(deployment.lmsType))}</p>
        <p class="line-copy">${
    escapeHtml(
      deployment.binding === null
        ? 'No binding saved yet.'
        : 'Binding saved and ready for governed launch.',
    )
  }</p>
      </div>
    </div>
    <div class="table-row-meta">
      <span><strong>Live version</strong> ${
    escapeHtml(
      deployment.enabledPackageVersion ?? 'Not pinned',
    )
  }</span>
      <span><strong>Updated</strong> ${escapeHtml(formatDateTime(deployment.updatedAt))}</span>
      <span><strong>Deployment</strong> ${escapeHtml(deployment.label)}</span>
    </div>
  </article>`;
}

function formatLmsLabel(lms: DeploymentRecord['lmsType']): string {
  switch (lms) {
    case 'canvas':
      return 'Canvas';
    case 'moodle':
      return 'Moodle';
    case 'sakai':
      return 'Sakai';
    default:
      return lms;
  }
}
