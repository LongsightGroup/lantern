import {
  approvalStatusClass,
  approvalStatusDetail,
  approvalStatusLabel,
  summarizeAccessibilityReview,
} from '../package_review/summary.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import {
  type AdminIdentity,
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from './layout.ts';
import { renderPackagePageNav, supportsAuthoringDrafts } from './package_navigation.ts';

export function renderPackageOverviewPage(input: {
  identity: AdminIdentity;
  appId: string;
  appTitle: string;
  history: PackageVersionRecord[];
  notice?: AdminNotice | null;
}): string {
  const latestVersion = input.history[0] ?? null;
  const latestApprovedVersion =
    input.history.find((version) => version.approvalStatus === 'approved') ?? null;
  return renderAdminLayout({
    identity: input.identity,
    title: `${input.appTitle} App`,
    eyebrow: 'App',
    heading: input.appTitle,
    intro: 'Reviewed versions for installation through the governed app catalog.',
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
            <a class="button-secondary" href="/admin/governance">Install app</a>
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
            <p>Each immutable version is reviewed independently before an institution can install it.</p>
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
          })
        )
        .join('')
    }
        </div>
      </div>
    </section>`,
  });
}

function renderOverviewVersionRow(input: {
  version: PackageVersionRecord;
  isLatestVersion: boolean;
  isLatestApproved: boolean;
}): string {
  const { version, isLatestVersion, isLatestApproved } = input;
  const accessibility = summarizeAccessibilityReview(version);
  const stateChips = renderVersionStateChips({
    isLatestVersion,
    isLatestApproved,
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
}): string {
  const chips: string[] = [];

  if (input.isLatestApproved) {
    chips.push('<span class="chip version-summary-chip">Current reviewed baseline</span>');
  } else if (input.isLatestVersion) {
    chips.push(
      '<span class="chip version-summary-chip version-summary-chip-muted">Newest upload</span>',
    );
  }

  chips.push('<span class="chip version-rollout-chip">Install through governance</span>');

  return `<div class="chip-row version-row-state">${chips.join('')}</div>`;
}
