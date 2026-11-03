import type { PythonLabAccessRequestRecord } from '../python_lab/repository.ts';
import {
  type AdminIdentity,
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from './layout.ts';

export function renderPythonLabRequestsPage(input: {
  readonly identity: AdminIdentity;
  readonly requests: readonly PythonLabAccessRequestRecord[];
  readonly notice?: AdminNotice | null;
}): string {
  return renderAdminLayout({
    identity: input.identity,
    title: 'Python Lab Requests',
    eyebrow: 'Autograder Lab',
    heading: 'Canvas access requests',
    intro: 'Review instructor requests from the public Python Autograder Lab.',
    activePath: '/admin/python-lab-requests',
    notice: input.notice ?? null,
    body: input.requests.length === 0 ? renderEmptyState() : renderRequests(input.requests),
  });
}

function renderEmptyState(): string {
  return `<section class="panel"><div class="panel-body stack"><p class="section-label">Requests</p><h2>No access requests</h2><p>Canvas access requests from the public Python Lab will appear here.</p></div></section>`;
}

function renderRequests(requests: readonly PythonLabAccessRequestRecord[]): string {
  return `<section class="panel"><div class="panel-body"><div class="table-scroll"><table class="detail-table"><thead><tr><th>Instructor</th><th>Institution</th><th>Requested</th><th>Status</th></tr></thead><tbody>${requests
    .map(renderRequest)
    .join('')}</tbody></table></div></div></section>`;
}

function renderRequest(request: PythonLabAccessRequestRecord): string {
  return `<tr><td><div class="detail-table-stack"><strong>${escapeHtml(
    request.name,
  )}</strong><span>${escapeHtml(request.workEmail)}</span></div></td><td>${escapeHtml(
    request.institution,
  )}</td><td>${escapeHtml(
    formatDateTime(request.createdAt),
  )}</td><td><form method="post" action="/admin/python-lab-requests/${encodeURIComponent(
    request.requestId,
  )}" class="button-row"><label class="sr-only" for="status-${escapeHtml(
    request.requestId,
  )}">Request status</label><select id="status-${escapeHtml(request.requestId)}" name="status">${renderStatusOptions(
    request.status,
  )}</select><button class="button-secondary" type="submit">Update</button></form></td></tr>`;
}

function renderStatusOptions(current: PythonLabAccessRequestRecord['status']): string {
  return (['new', 'contacted', 'closed'] as const)
    .map(
      (status) =>
        `<option value="${status}"${status === current ? ' selected' : ''}>${status}</option>`,
    )
    .join('');
}
