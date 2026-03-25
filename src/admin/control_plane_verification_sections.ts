import type { BrokerVerificationStatus, OfficialCertificationState } from '../ops/types.ts';
import { escapeHtml, formatDateTime } from './layout.ts';
import {
  describeBrokerRunStatus,
  describeOfficialCertificationState,
  describeSupportedPath,
} from './control_plane_support.ts';

export function renderBrokerVerificationSection(
  latestBrokerVerification: BrokerVerificationStatus | null,
): string {
  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Broker verification</p>
          <h2>Supported Canvas path</h2>
          <p>Lantern keeps internal proof of the supported broker path separate from any official directory status so operators can see evidence, not marketing shorthand.</p>
          <div class="fact">
            <span class="fact-label">Supported path</span>
            <span class="fact-value">${escapeHtml(
              latestBrokerVerification === null
                ? 'Canvas LTI 1.3 launch, AGS, and NRPS'
                : describeSupportedPath(latestBrokerVerification.supportedPath),
            )}</span>
          </div>
        </div>
        <section class="stack">
          ${renderBrokerVerificationFacts(latestBrokerVerification)}
        </section>
      </div>
    </section>`;
}

export function renderVerificationUpdateSection(): string {
  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Verification updates</p>
          <h2>Record verification evidence</h2>
          <p>Use one explicit SSR action to record the latest internal proof or official 1EdTech directory result. Lantern stores exactly what you enter here and does not infer certification claims from local tests.</p>
        </div>
        ${renderBrokerVerificationForm()}
      </div>
    </section>`;
}

function renderBrokerVerificationFacts(verification: BrokerVerificationStatus | null): string {
  const internal = verification?.internal ?? null;
  const hasOfficialRecord = verification?.official.checkedAt !== null;
  const official = verification?.official ?? {
    state: 'notCertified' as OfficialCertificationState,
    checkedAt: null,
    directoryUrl: null,
  };

  return `<div class="fact">
      <span class="fact-label">Internal verification</span>
      <span class="fact-value">${escapeHtml(
        describeBrokerRunStatus(internal?.status ?? 'notRun'),
      )}</span>
      <p class="micro muted">${escapeHtml(
        internal?.summary ??
          'No internal verification evidence has been recorded for the supported broker path yet.',
      )}</p>
      <p class="micro muted">${escapeHtml(
        internal?.checkedAt === undefined || internal?.checkedAt === null
          ? 'Checked at Not recorded yet'
          : `Checked ${formatDateTime(internal.checkedAt)}`,
      )}</p>
      ${
        internal?.evidenceUrl
          ? `<a class="button-ghost" href="${escapeHtml(internal.evidenceUrl)}">${escapeHtml(
              internal.evidenceUrl,
            )}</a>`
          : ''
      }
    </div>
    <div class="fact">
      <span class="fact-label">Official certification</span>
      <span class="fact-value">${escapeHtml(
        hasOfficialRecord
          ? describeOfficialCertificationState(official.state)
          : 'No official claim recorded',
      )}</span>
      <p class="micro muted">${escapeHtml(
        hasOfficialRecord
          ? official.state === 'notCertified'
            ? 'Latest recorded 1EdTech evidence does not show a certification listing.'
            : 'Latest recorded 1EdTech evidence shows the listed certification state.'
          : 'Lantern has no recorded 1EdTech directory evidence for the supported broker path yet.',
      )}</p>
      <p class="micro muted">${escapeHtml(
        official.checkedAt === null
          ? 'Checked at Not recorded yet'
          : `Checked ${formatDateTime(official.checkedAt)}`,
      )}</p>
      ${
        official.directoryUrl
          ? `<a class="button-ghost" href="${escapeHtml(official.directoryUrl)}">${escapeHtml(
              official.directoryUrl,
            )}</a>`
          : ''
      }
    </div>`;
}

function renderBrokerVerificationForm(): string {
  return `<form method="post" action="/admin/packages/verification" class="stack">
    <div class="field">
      <label for="verification-source">Evidence source</label>
      <select id="verification-source" name="source">
        <option value="manual">Manual operator check</option>
        <option value="ci">CI verification</option>
        <option value="1edtech">1EdTech directory evidence</option>
      </select>
      <p class="field-hint">Use manual or CI for Lantern's internal proof. Use 1EdTech only for official directory evidence.</p>
    </div>
    <div class="field">
      <label for="verification-status">Verification status</label>
      <select id="verification-status" name="status">
        <option value="passed">Passed</option>
        <option value="failed">Failed</option>
        <option value="pending">Pending</option>
        <option value="notCertified">Not certified</option>
      </select>
      <p class="field-hint">Reserve not certified for official 1EdTech evidence. Internal manual and CI runs should stay in passed, failed, or pending.</p>
    </div>
    <div class="field">
      <label for="verification-certification-state">Official certification state</label>
      <select id="verification-certification-state" name="certificationState">
        <option value="">No official certified state recorded</option>
        <option value="ltiAdvantageCertified">LTI Advantage Certified</option>
        <option value="ltiAdvantageComplete">LTI Advantage Complete</option>
      </select>
      <p class="field-hint">Leave this blank unless the 1EdTech directory explicitly shows an official certification state.</p>
    </div>
    <div class="field">
      <label for="verification-checked-at">Checked at</label>
      <input id="verification-checked-at" name="checkedAt" type="text" placeholder="2026-03-24T12:50:00Z">
      <p class="field-hint">Enter the evidence timestamp in ISO-8601 format.</p>
    </div>
    <div class="field">
      <label for="verification-detail-url">Evidence link</label>
      <input id="verification-detail-url" name="detailUrl" type="url" placeholder="https://example.test/verification/run">
      <p class="field-hint">Link to CI logs, operator notes, or the official 1EdTech directory entry.</p>
    </div>
    <div class="field">
      <label for="verification-summary">Summary</label>
      <textarea id="verification-summary" name="summary" placeholder="Record exactly what the evidence shows."></textarea>
      <p class="field-hint">Keep the wording factual. Lantern should not claim official certification from internal proof alone.</p>
    </div>
    <div class="button-row">
      <button type="submit" class="button-secondary">Record verification evidence</button>
    </div>
  </form>`;
}
