import type { AuditEventRecord, PlacementAuditSnapshot } from '../package_review/types.ts';
import { escapeHtml, formatDateTime, renderAdminLayout } from './layout.ts';

export function renderPlacementAuditPage(input: {
  snapshot: PlacementAuditSnapshot;
  timeline: AuditEventRecord[];
  notice?: {
    tone: 'error' | 'note' | 'success';
    title: string;
    detail: string;
    items?: string[];
  } | null;
}): string {
  const { placement } = input.snapshot;
  const status = describePlacementStatus(input.snapshot.status);
  const previewLink = `/admin/packages/${placement.appId}/versions/${placement.packageVersion}/preview`;
  const packageLink = `/admin/packages/${placement.appId}/versions/${placement.packageVersion}`;
  const deploymentLink = `/admin/packages/${placement.appId}/deployment`;

  return renderAdminLayout({
    title: `Placement ${placement.placementId}`,
    eyebrow: 'Placement audit',
    heading: 'Placement audit',
    intro:
      'Inspect the reviewed placement record and one durable evidence timeline from Lantern-owned logs.',
    activePath: '/admin/placements',
    breadcrumbs: [
      { label: 'Packages', href: '/admin/packages' },
      { label: 'Placements', href: '/admin/placements' },
      { label: placement.placementId },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Reviewed placement</p>
          <h2>${escapeHtml(placement.placementId)}</h2>
          <p>Selected content <strong>${escapeHtml(
            placement.contentTitle ?? placement.contentPath,
          )}</strong> from <code>${escapeHtml(placement.contentPath)}</code>.</p>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Current status</span>
              <span class="fact-value">${escapeHtml(status.label)}</span>
              <p class="micro muted">${escapeHtml(status.detail)}</p>
            </div>
            <div class="fact">
              <span class="fact-label">Reviewed package</span>
              <span class="fact-value">${escapeHtml(placement.packageTitle)}</span>
              <p class="micro muted">Version ${escapeHtml(placement.packageVersion)}</p>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas context</span>
              <span class="fact-value">${escapeHtml(
                placement.contextTitle ?? 'Not recorded yet',
              )}</span>
              <p class="micro muted">${escapeHtml(placement.contextId ?? 'Not recorded yet')}</p>
            </div>
            <div class="fact">
              <span class="fact-label">Resource link</span>
              <span class="fact-value">${escapeHtml(
                placement.resourceLinkId ?? 'Not recorded yet',
              )}</span>
            </div>
          </div>
        </div>
        <aside class="stack">
          <section class="fact">
            <span class="fact-label">Evidence summary</span>
            <strong class="fact-value">${escapeHtml(
              String(input.snapshot.previewEvidenceCount),
            )} preview events</strong>
            <p class="micro muted">${escapeHtml(
              `${input.snapshot.evidenceSummary.deepLinkingRequestCount} deep-linking requests · ${input.snapshot.evidenceSummary.placementEventCount} placement events · ${input.snapshot.evidenceSummary.reviewerEventCount} reviewer events`,
            )}</p>
          </section>
          <div class="button-row">
            <a class="button-secondary" href="${escapeHtml(packageLink)}">Open reviewed package</a>
            <a class="button-secondary" href="${escapeHtml(deploymentLink)}">Open deployment</a>
            ${
              input.snapshot.latestPreviewSessionId === null
                ? ''
                : `<a class="button-secondary" href="${escapeHtml(
                    previewLink,
                  )}">Open preview evidence</a>`
            }
          </div>
        </aside>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Evidence timeline</p>
        <h2>Durable placement and reviewer evidence</h2>
        <div class="line-list">
          ${renderTimelineRows(input.snapshot, input.timeline, previewLink)}
        </div>
      </div>
    </section>`,
  });
}

export function renderPlacementAuditRequestPage(input: {
  notice?: {
    tone: 'error' | 'note' | 'success';
    title: string;
    detail: string;
    items?: string[];
  } | null;
}): string {
  return renderAdminLayout({
    title: 'Placements',
    eyebrow: 'Placements',
    heading: 'Placements',
    intro:
      'Open one reviewed placement when you need the exact content choice, package version, Canvas context, and durable reviewer evidence.',
    activePath: '/admin/placements',
    breadcrumbs: [
      { label: 'Packages', href: '/admin/packages' },
      {
        label: 'Placements',
      },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Find a placement</p>
          <h2>Open one reviewed placement.</h2>
          <p>Paste a placement id from a package dossier, deployment diagnostic, or audit event to inspect the governed record behind it.</p>
          <p class="micro muted">Lantern keeps placement audits on their own page so package review and deployment tasks stay simpler.</p>
        </div>
        <form method="get" action="/admin/placements" class="stack">
          <div class="field">
            <label for="placement-id">Placement id</label>
            <input
              id="placement-id"
              name="placementId"
              type="text"
              placeholder="placement-audit-123"
            >
            <p class="field-hint">Use the durable placement id, not the Canvas resource link id.</p>
          </div>
          <div class="button-row">
            <button type="submit" class="button-secondary">Open placement</button>
          </div>
        </form>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">No selection yet</p>
        <h2>No placement is open.</h2>
        <p>Choose a placement id to inspect one reviewed selection without mixing this audit trail into the package library.</p>
      </div>
    </section>`,
  });
}

function renderTimelineRows(
  snapshot: PlacementAuditSnapshot,
  timeline: AuditEventRecord[],
  previewLink: string,
): string {
  const rows = [...timeline]
    .sort((left, right) => {
      const occurred = right.occurredAt.localeCompare(left.occurredAt);
      if (occurred !== 0) {
        return occurred;
      }
      return right.id - left.id;
    })
    .map(
      (event) =>
        `<article class="line-item">
      <p class="line-title">${escapeHtml(event.eventType)}</p>
      <p class="line-copy">${escapeHtml(event.summary)}</p>
      <p class="micro muted">${escapeHtml(formatDateTime(event.occurredAt))}</p>
    </article>`,
    );

  if (snapshot.latestPreviewSessionId !== null) {
    rows.unshift(`<article class="line-item">
      <p class="line-title">preview.evidence</p>
      <p class="line-copy">Preview session ${escapeHtml(
        snapshot.latestPreviewSessionId,
      )} recorded ${escapeHtml(String(snapshot.previewEvidenceCount))} events.</p>
      <p class="micro muted">${escapeHtml(formatDateTime(snapshot.latestPreviewOccurredAt))}</p>
      <a class="button-ghost" href="${escapeHtml(previewLink)}">Open preview evidence</a>
    </article>`);
  }

  if (rows.length > 0) {
    return rows.join('');
  }

  return `<article class="line-item">
      <p class="line-title">No timeline evidence recorded yet</p>
      <p class="line-copy">Lantern has the placement record, but no linked deep-linking, preview, or reviewer activity has been recorded for this placement yet.</p>
    </article>`;
}

function describePlacementStatus(status: PlacementAuditSnapshot['status']): {
  label: string;
  detail: string;
} {
  switch (status) {
    case 'awaiting_canvas_binding':
      return {
        label: 'Awaiting Canvas binding',
        detail: 'The reviewed placement exists but Canvas has not yet bound a resource_link.id.',
      };
    case 'bound_no_preview':
      return {
        label: 'Bound with no preview evidence',
        detail:
          'Canvas binding exists and Lantern has no preview evidence for this reviewed package version yet.',
      };
    case 'bound_with_preview':
      return {
        label: 'Bound with governed preview evidence',
        detail:
          'Canvas binding and preview evidence are both recorded for this reviewed placement.',
      };
    case 'reviewed':
      return {
        label: 'Reviewed with operator activity',
        detail: 'Reviewer evidence has been recorded against this reviewed placement.',
      };
  }
}
