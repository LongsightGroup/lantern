import type {
  CertificationWorkflowKey,
  CertificationWorkflowStatus,
  ControlPlaneDeploymentInventoryRow,
} from '../ops/types.ts';
import {
  DEFAULT_LTI_PROFILE_ID,
  getLtiProfileDefinition,
  LTI_PROFILE_DEFINITIONS,
} from '../lti/profile.ts';
import {
  BROKER_VERIFICATION_SUPPORTED_PATHS,
  describeSupportedPath,
} from '../ops/broker_verification_paths.ts';
import type { LanternLtiProfileSettingsRecord } from '../package_review/types.ts';
import { escapeHtml, formatDateTime } from './layout.ts';
import {
  buildDeploymentActivityHref,
  describeBrokerRunStatus,
  describeCertificationWorkflowShortLabel,
  describeOfficialCertificationState,
  type VerificationOfficialEvidenceDisplay,
} from './control_plane_support.ts';

interface CertificationChecklistItem {
  workflowKey: CertificationWorkflowKey;
  label: string;
}

const CERTIFICATION_CHECKLIST: readonly CertificationChecklistItem[] = [
  { workflowKey: 'core', label: 'LTI Core' },
  { workflowKey: 'deepLinking', label: 'Deep Linking' },
  { workflowKey: 'nrps', label: 'NRPS' },
  { workflowKey: 'ags', label: 'AGS' },
] as const;

export function renderVerificationSummarySection(input: {
  certificationWorkflowStatuses: CertificationWorkflowStatus[];
  officialEvidence: VerificationOfficialEvidenceDisplay | null;
  ltiProfileSettings: LanternLtiProfileSettingsRecord | null;
}): string {
  const currentProfile = getLtiProfileDefinition(
    input.ltiProfileSettings?.defaultLtiProfile ?? DEFAULT_LTI_PROFILE_ID,
  );
  const recordedWorkflows = input.certificationWorkflowStatuses.filter(
    (status) => status.latestInternal !== null,
  ).length;

  return `<section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Verification overview</p>
            <h2>Keep each verification job on its own page</h2>
            <p>The checklist keeps only internal workflow results. Official Product Directory evidence and Lantern-wide defaults now live on dedicated pages.</p>
          </div>
          <div class="button-row">
            <a class="button-secondary" href="/admin/verification/new">Add result</a>
            <a class="button-ghost" href="/admin/verification/official">Official evidence</a>
            <a class="button-ghost" href="/admin/verification/lti-profile">Lantern default</a>
          </div>
        </div>
        <div class="card-grid">
          <div class="fact">
            <span class="fact-label">Saved internal workflows</span>
            <span class="fact-value">${recordedWorkflows} of ${CERTIFICATION_CHECKLIST.length} recorded</span>
            <p class="micro muted">Each workflow stores only its latest internal result.</p>
          </div>
          <div class="fact">
            <span class="fact-label">Official directory</span>
            <span class="fact-value">${escapeHtml(
              input.officialEvidence === null
                ? 'No official claim recorded'
                : describeOfficialCertificationState(input.officialEvidence.state),
            )}</span>
            <p class="micro muted">${escapeHtml(
              input.officialEvidence?.summary ??
                'No 1EdTech Product Directory evidence is recorded yet.',
            )}</p>
          </div>
          <div class="fact">
            <span class="fact-label">Lantern default</span>
            <span class="fact-value">${escapeHtml(currentProfile.label)}</span>
            <p class="micro muted">${escapeHtml(currentProfile.summary)}</p>
          </div>
        </div>
      </div>
    </section>`;
}

export function renderVerificationChecklistSection(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  certificationWorkflowStatuses: CertificationWorkflowStatus[];
}): string {
  const workflowStatuses = new Map(
    input.certificationWorkflowStatuses.map((status) => [status.workflowKey, status] as const),
  );

  return `<section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Saved checks</p>
            <h2>Certification checklist</h2>
            <p>Review one workflow at a time. A passed result never spills into a different workflow.</p>
          </div>
          <div class="button-row">
            <a class="button-secondary" href="/admin/verification/new">Add result</a>
          </div>
        </div>
        <div class="table-list">
          ${CERTIFICATION_CHECKLIST.map((item) =>
            renderCertificationChecklistRow({
              item,
              status: workflowStatuses.get(item.workflowKey) ?? null,
              deployments: input.deployments,
            }),
          ).join('')}
        </div>
      </div>
    </section>`;
}

export function renderOfficialEvidenceSection(
  officialEvidence: VerificationOfficialEvidenceDisplay | null,
): string {
  const latestCheckedAt =
    officialEvidence === null ? 'Not recorded yet' : formatDateTime(officialEvidence.checkedAt);

  return `<section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Official evidence</p>
            <h2>Official 1EdTech listing</h2>
            <p>Only the 1EdTech Product Directory supports an official certification claim. Internal checklist rows stay separate.</p>
          </div>
          <div class="button-row">
            <a class="button-secondary" href="/admin/verification/new">Add result</a>
            ${
              officialEvidence?.directoryUrl
                ? `<a class="button-ghost" href="${escapeHtml(
                    officialEvidence.directoryUrl,
                  )}">Open directory entry</a>`
                : ''
            }
          </div>
        </div>
        <div class="card-grid">
          <div class="fact">
            <span class="fact-label">Product Directory status</span>
            <span class="fact-value">${escapeHtml(
              officialEvidence === null
                ? 'No official claim recorded'
                : describeOfficialCertificationState(officialEvidence.state),
            )}</span>
            <p class="micro muted">Internal checks can support readiness work, but they never become an official claim.</p>
          </div>
          <div class="fact">
            <span class="fact-label">Covers workflow</span>
            <span class="fact-value">${escapeHtml(
              officialEvidence?.workflowLabel ?? 'No workflow recorded',
            )}</span>
            <p class="micro muted">Save one Product Directory result against the workflow it actually covers.</p>
          </div>
          <div class="fact">
            <span class="fact-label">Latest official evidence</span>
            <span class="fact-value">${escapeHtml(latestCheckedAt)}</span>
            <p class="micro muted">${escapeHtml(
              officialEvidence?.summary ??
                'Lantern has no recorded 1EdTech Product Directory evidence yet.',
            )}</p>
          </div>
        </div>
        <div class="callout">
          <h3>Claim boundary</h3>
          <p>A passed Core, Deep Linking, NRPS, or AGS row does not claim official certification on its own. Only the dated Product Directory entry on this page can do that.</p>
        </div>
      </div>
    </section>`;
}

export function renderVerificationUpdateSection(
  deployments: ControlPlaneDeploymentInventoryRow[],
): string {
  return `<section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Add result</p>
            <h2>Record one verification result</h2>
            <p>Save one workflow result at a time. Internal checks need a specific deployment. Leave deployment blank only for Product Directory evidence.</p>
          </div>
          <div class="button-row">
            <a class="button-ghost" href="/admin/verification">Back to checklist</a>
          </div>
        </div>
        <div class="card-grid">
          <div class="fact">
            <span class="fact-label">Internal result</span>
            <span class="fact-value">CI or manual workflow evidence</span>
            <p class="micro muted">Choose one deployment and one workflow. Lantern stores the latest internal result for that workflow only.</p>
          </div>
          <div class="fact">
            <span class="fact-label">Official result</span>
            <span class="fact-value">1EdTech Product Directory evidence</span>
            <p class="micro muted">Use the directory URL and official certification state. Leave deployment blank for this case.</p>
          </div>
        </div>
        ${renderBrokerVerificationForm(deployments)}
      </div>
    </section>`;
}

export function renderLtiProfileSettingsSection(
  settings: LanternLtiProfileSettingsRecord | null,
): string {
  const currentProfile = getLtiProfileDefinition(
    settings?.defaultLtiProfile ?? DEFAULT_LTI_PROFILE_ID,
  );
  const savedAt =
    settings?.updatedAt === undefined || settings?.updatedAt === null
      ? 'Not recorded yet'
      : formatDateTime(settings.updatedAt);

  return `<section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Default LTI behavior</p>
            <h2>Lantern default profile</h2>
            <p>Choose the baseline LTI behavior Lantern should enforce unless one deployment saves its own explicit override.</p>
          </div>
          <div class="button-row">
            <a class="button-ghost" href="/admin/verification">Back to checklist</a>
          </div>
        </div>
        <div class="card-grid">
          <div class="fact">
            <span class="fact-label">Current Lantern default</span>
            <span class="fact-value">${escapeHtml(currentProfile.label)}</span>
            <p class="micro muted">${escapeHtml(currentProfile.summary)}</p>
          </div>
          <div class="fact">
            <span class="fact-label">Deployment overrides</span>
            <span class="fact-value">Allowed</span>
            <p class="micro muted">An individual LMS setup can inherit this default or save one explicit profile on the app settings page.</p>
          </div>
          <div class="fact">
            <span class="fact-label">Last saved</span>
            <span class="fact-value">${escapeHtml(savedAt)}</span>
            <p class="micro muted">This Lantern-wide setting applies before any deployment-specific override.</p>
          </div>
        </div>
        ${renderLtiProfileSettingsForm(currentProfile.id)}
      </div>
    </section>`;
}

function renderBrokerVerificationForm(deployments: ControlPlaneDeploymentInventoryRow[]): string {
  return `<form method="post" action="/admin/verification" class="stack">
    <div class="form-grid">
      <div class="field">
        <label for="verification-source">Result source</label>
        <select id="verification-source" name="source">
          <option value="ci">Automated check</option>
          <option value="manual">Manual follow-up</option>
          <option value="1edtech">Official 1EdTech listing</option>
        </select>
      </div>
      <div class="field">
        <label for="verification-deployment-record-id">App setup</label>
        <select id="verification-deployment-record-id" name="deploymentRecordId">
          <option value="">No deployment selected</option>
          ${deployments
            .map(
              (deployment) =>
                `<option value="${deployment.deploymentId}">${escapeHtml(
                  deployment.deploymentLabel,
                )}</option>`,
            )
            .join('')}
        </select>
        <p class="field-hint">Leave this blank only for an official 1EdTech listing.</p>
      </div>
      <div class="field">
        <label for="verification-scope">Compatibility profile</label>
        <select id="verification-scope" name="scope">
          ${BROKER_VERIFICATION_SUPPORTED_PATHS.map(
            (supportedPath) =>
              `<option value="${supportedPath}">${escapeHtml(
                describeSupportedPath(supportedPath),
              )}</option>`,
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label for="verification-workflow-key">Certification workflow</label>
        <select id="verification-workflow-key" name="workflowKey">
          ${CERTIFICATION_CHECKLIST.map(
            (item) => `<option value="${item.workflowKey}">${escapeHtml(item.label)}</option>`,
          ).join('')}
        </select>
        <p class="field-hint">Save each result against exactly one workflow. A passed AGS row does not also cover NRPS, Core, or Deep Linking.</p>
      </div>
      <div class="field">
        <label for="verification-status">Result</label>
        <select id="verification-status" name="status">
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="notCertified">Not certified</option>
        </select>
      </div>
      <div class="field">
        <label for="verification-checked-at">Checked at</label>
        <input
          id="verification-checked-at"
          name="checkedAt"
          type="text"
          placeholder="2026-03-24T12:50:00Z"
        >
        <p class="field-hint">Enter the evidence timestamp in ISO-8601 format.</p>
      </div>
      <div class="field field-span-full">
        <label for="verification-detail-url">Notes or log link</label>
        <input
          id="verification-detail-url"
          name="detailUrl"
          type="url"
          placeholder="https://example.test/verification/run"
        >
        <p class="field-hint">Link to CI logs, operator notes, or the official 1EdTech directory entry.</p>
      </div>
      <div class="field field-span-full">
        <label for="verification-summary">What happened</label>
        <textarea
          id="verification-summary"
          name="summary"
          placeholder="Describe what this check showed for the selected connection or official listing."
        ></textarea>
        <p class="field-hint">Keep the wording factual. Lantern should not claim official certification from internal checks alone.</p>
      </div>
      <details class="field-span-full">
        <summary>Official listing details</summary>
        <div class="detail-stack">
          <div class="field">
            <label for="verification-certification-state">Official certification listing</label>
            <select id="verification-certification-state" name="certificationState">
              <option value="">No official certified state recorded</option>
              <option value="ltiAdvantageCertified">LTI Advantage Certified</option>
              <option value="ltiAdvantageComplete">LTI Advantage Complete</option>
            </select>
            <p class="field-hint">Use this only when the 1EdTech directory shows a certified state.</p>
          </div>
        </div>
      </details>
    </div>
    <div class="button-row">
      <button type="submit" class="button-secondary">Save verification result</button>
    </div>
  </form>`;
}

function renderLtiProfileSettingsForm(currentProfileId: string): string {
  return `<form method="post" action="/admin/verification/lti-profile" class="stack">
    <div class="field">
      <span>LTI profile</span>
      <div class="detail-stack">
        ${LTI_PROFILE_DEFINITIONS.map(
          (profile) =>
            `<label class="choice-row">
              <input
                type="radio"
                name="defaultLtiProfile"
                value="${escapeHtml(profile.id)}"
                ${profile.id === currentProfileId ? 'checked' : ''}
              >
              <span>
                <strong>${escapeHtml(profile.label)}</strong>
                <span class="micro muted">${escapeHtml(profile.summary)}</span>
              </span>
            </label>`,
        ).join('')}
      </div>
      <p class="field-hint">This is the saved Lantern-wide default. Deployment pages can still choose “Use Lantern default” or save one explicit override.</p>
    </div>
    <div class="button-row">
      <button type="submit" class="button-secondary">Save Lantern default</button>
    </div>
  </form>`;
}

function renderCertificationChecklistRow(input: {
  item: CertificationChecklistItem;
  status: CertificationWorkflowStatus | null;
  deployments: ControlPlaneDeploymentInventoryRow[];
}): string {
  const internal = input.status?.latestInternal ?? null;
  const guidanceDeployment = resolveGuidanceDeployment(
    input.deployments,
    internal?.deploymentRecordId ?? null,
  );
  const guidance = resolveWorkflowGuidance(input.item.workflowKey, guidanceDeployment);
  const statusLabel = internal === null ? 'Not recorded' : describeBrokerRunStatus(internal.status);
  const checkedAt =
    internal === null
      ? 'Checked at Not recorded yet'
      : `Checked ${formatDateTime(internal.checkedAt)}`;
  const summary =
    internal?.summary ??
    `No internal evidence has been recorded for ${describeCertificationWorkflowShortLabel(
      input.item.workflowKey,
    )} yet.`;
  const evidenceSetup = internal?.deploymentLabel ?? 'No internal evidence recorded';

  return `<article class="table-row">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(input.item.label)}</span>
          <span class="chip">${escapeHtml(statusLabel)}</span>
        </p>
        <p class="micro muted">${escapeHtml(checkedAt)}</p>
      </div>
      <p class="line-copy">${escapeHtml(summary)}</p>
      <p class="micro muted">${escapeHtml(describeWorkflowBoundaryNote(input.item.workflowKey))}</p>
      <div class="table-row-meta">
        <span><strong>Latest internal evidence:</strong> ${escapeHtml(evidenceSetup)}</span>
        <span><strong>Run guidance:</strong> ${escapeHtml(guidance.copy)}</span>
      </div>
      <div class="button-row">
        ${
          internal?.evidenceUrl
            ? `<a class="button-ghost" href="${escapeHtml(
                internal.evidenceUrl,
              )}">Open internal evidence</a>`
            : ''
        }
        ${
          guidance.href
            ? `<a class="button-secondary" href="${escapeHtml(guidance.href)}">${escapeHtml(
                guidance.label,
              )}</a>`
            : ''
        }
      </div>
    </article>`;
}

function resolveGuidanceDeployment(
  deployments: ControlPlaneDeploymentInventoryRow[],
  deploymentRecordId: number | null,
): ControlPlaneDeploymentInventoryRow | null {
  if (deploymentRecordId !== null) {
    const matchingDeployment = deployments.find(
      (deployment) => deployment.deploymentId === deploymentRecordId,
    );

    if (matchingDeployment) {
      return matchingDeployment;
    }
  }

  return deployments.find((deployment) => deployment.binding !== null) ?? deployments[0] ?? null;
}

function resolveWorkflowGuidance(
  workflowKey: CertificationWorkflowKey,
  deployment: ControlPlaneDeploymentInventoryRow | null,
): {
  copy: string;
  href: string | null;
  label: string;
} {
  switch (workflowKey) {
    case 'core':
      return {
        copy: 'Run the LTI Core workflow in the official 1EdTech suite. Save the latest result here after the suite finishes.',
        href: 'https://www.imsglobal.org/spec/lti/v1p3/cert/',
        label: 'Open Core suite guidance',
      };
    case 'deepLinking':
      return {
        copy: 'Run the Deep Linking workflow in the official 1EdTech suite. Save the latest result here after the suite finishes.',
        href: 'https://www.imsglobal.org/spec/lti/v1p3/cert/',
        label: 'Open Deep Linking suite guidance',
      };
    case 'nrps':
      return deployment === null
        ? {
            copy: 'Save one app setup, then open its deployment activity page to run or review the roster check.',
            href: null,
            label: 'Open deployment activity',
          }
        : {
            copy: "Open the deployment activity page to run or review the saved roster check from Lantern's existing SSR surface.",
            href: buildDeploymentActivityHref(deployment),
            label: 'Open deployment activity',
          };
    case 'ags':
      return deployment === null
        ? {
            copy: 'Save one app setup, then open its deployment activity page to run or review the AGS smoke check.',
            href: null,
            label: 'Open deployment activity',
          }
        : {
            copy: "Open the deployment activity page to run or review the saved AGS smoke check from Lantern's existing SSR surface.",
            href: buildDeploymentActivityHref(deployment),
            label: 'Open deployment activity',
          };
  }
}

function describeWorkflowBoundaryNote(workflowKey: CertificationWorkflowKey): string {
  switch (workflowKey) {
    case 'core':
      return 'A passed Core row does not cover Deep Linking, NRPS, or AGS.';
    case 'deepLinking':
      return 'A passed Deep Linking row does not cover Core, NRPS, or AGS.';
    case 'nrps':
      return 'A passed NRPS row does not cover Core, Deep Linking, or AGS.';
    case 'ags':
      return 'A passed AGS row does not cover Core, Deep Linking, or NRPS.';
  }
}
