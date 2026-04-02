import type {
  CertificationWorkflowKey,
  CertificationWorkflowStatus,
  ControlPlaneDeploymentInventoryRow,
} from "../ops/types.ts";
import {
  DEFAULT_LTI_PROFILE_ID,
  getLtiProfileDefinition,
  LTI_PROFILE_DEFINITIONS,
} from "../lti/profile.ts";
import {
  BROKER_VERIFICATION_SUPPORTED_PATHS,
  describeSupportedPath,
} from "../ops/broker_verification_paths.ts";
import type { LanternLtiProfileSettingsRecord } from "../package_review/types.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";
import {
  buildDeploymentActivityHref,
  describeBrokerRunStatus,
  describeCertificationWorkflowShortLabel,
  describeOfficialCertificationState,
  type VerificationOfficialEvidenceDisplay,
} from "./control_plane_support.ts";

interface CertificationChecklistItem {
  workflowKey: CertificationWorkflowKey;
  label: string;
}

const CERTIFICATION_CHECKLIST: readonly CertificationChecklistItem[] = [
  { workflowKey: "core", label: "LTI Core" },
  { workflowKey: "deepLinking", label: "Deep Linking" },
  { workflowKey: "nrps", label: "NRPS" },
  { workflowKey: "ags", label: "AGS" },
] as const;

export function renderBrokerVerificationSection(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  certificationWorkflowStatuses: CertificationWorkflowStatus[];
  officialEvidence: VerificationOfficialEvidenceDisplay | null;
}): string {
  const workflowStatuses = new Map(
    input.certificationWorkflowStatuses.map((status) =>
      [
        status.workflowKey,
        status,
      ] as const
    ),
  );

  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Certification checklist</p>
          <h2>Certification checklist</h2>
          <p>Saved checks stay on this page, but each workflow keeps its own latest internal evidence.</p>
          <div class="table-list">
            ${
    CERTIFICATION_CHECKLIST.map((item) =>
      renderCertificationChecklistRow({
        item,
        status: workflowStatuses.get(item.workflowKey) ?? null,
        deployments: input.deployments,
      })
    ).join("")
  }
          </div>
        </div>
        ${renderOfficialEvidenceSection(input.officialEvidence)}
      </div>
    </section>`;
}

export function renderVerificationUpdateSection(
  deployments: ControlPlaneDeploymentInventoryRow[],
): string {
  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Add a result</p>
          <h2>Add a check</h2>
          <p>Save one check result for one app setup.</p>
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

  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Default LTI behavior</p>
          <h2>Lantern default profile</h2>
          <p>Choose the LTI behavior Lantern should enforce unless one deployment saves its own override.</p>
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
          ${
    settings?.updatedAt
      ? `<p class="micro muted">Saved ${
        escapeHtml(formatDateTime(settings.updatedAt))
      }</p>`
      : ""
  }
        </div>
        ${renderLtiProfileSettingsForm(currentProfile.id)}
      </div>
    </section>`;
}

function renderOfficialEvidenceSection(
  officialEvidence: VerificationOfficialEvidenceDisplay | null,
): string {
  return `<section class="stack">
      <p class="section-label">Official 1EdTech evidence</p>
      <h2>Official 1EdTech listing</h2>
      <p>Only the 1EdTech Product Directory supports an official certification claim.</p>
      <div class="fact">
        <span class="fact-label">Product Directory status</span>
        <span class="fact-value">${
    escapeHtml(
      officialEvidence === null
        ? "No official claim recorded"
        : describeOfficialCertificationState(officialEvidence.state),
    )
  }</span>
      </div>
      ${
    officialEvidence?.workflowLabel
      ? `<div class="fact">
            <span class="fact-label">Covers workflow</span>
            <span class="fact-value">${
        escapeHtml(officialEvidence.workflowLabel)
      }</span>
          </div>`
      : ""
  }
      <div class="fact">
        <span class="fact-label">Latest official evidence</span>
        <span class="fact-value">${
    escapeHtml(
      officialEvidence?.summary ??
        "Lantern has no recorded 1EdTech Product Directory evidence yet.",
    )
  }</span>
        <p class="micro muted">${
    escapeHtml(
      officialEvidence === null
        ? "Checked at Not recorded yet"
        : `Checked ${formatDateTime(officialEvidence.checkedAt)}`,
    )
  }</p>
      </div>
      ${
    officialEvidence?.directoryUrl
      ? `<div class="button-row">
              <a class="button-ghost" href="${
        escapeHtml(officialEvidence.directoryUrl)
      }">Open directory entry</a>
            </div>`
      : ""
  }
    </section>`;
}

function renderBrokerVerificationForm(
  deployments: ControlPlaneDeploymentInventoryRow[],
): string {
  return `<form method="post" action="/admin/verification" class="stack">
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
        ${
    deployments
      .map(
        (deployment) =>
          `<option value="${deployment.deploymentId}">${
            escapeHtml(
              deployment.deploymentLabel,
            )
          }</option>`,
      )
      .join("")
  }
      </select>
      <p class="field-hint">Leave this blank only for an official 1EdTech listing.</p>
    </div>
    <div class="field">
      <label for="verification-scope">Compatibility profile</label>
      <select id="verification-scope" name="scope">
        ${
    BROKER_VERIFICATION_SUPPORTED_PATHS.map(
      (supportedPath) =>
        `<option value="${supportedPath}">${
          escapeHtml(
            describeSupportedPath(supportedPath),
          )
        }</option>`,
    ).join("")
  }
      </select>
    </div>
    <div class="field">
      <label for="verification-workflow-key">Certification workflow</label>
      <select id="verification-workflow-key" name="workflowKey">
        ${
    CERTIFICATION_CHECKLIST.map((item) =>
      `<option value="${item.workflowKey}">${escapeHtml(item.label)}</option>`
    ).join("")
  }
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
      <input id="verification-checked-at" name="checkedAt" type="text" placeholder="2026-03-24T12:50:00Z">
      <p class="field-hint">Enter the evidence timestamp in ISO-8601 format.</p>
    </div>
    <div class="field">
      <label for="verification-detail-url">Notes or log link</label>
      <input id="verification-detail-url" name="detailUrl" type="url" placeholder="https://example.test/verification/run">
      <p class="field-hint">Link to CI logs, operator notes, or the official 1EdTech directory entry.</p>
    </div>
    <div class="field">
      <label for="verification-summary">What happened</label>
      <textarea id="verification-summary" name="summary" placeholder="Describe what this check showed for the selected connection or official listing."></textarea>
      <p class="field-hint">Keep the wording factual. Lantern should not claim official certification from internal checks alone.</p>
    </div>
    <details>
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
    <div class="button-row">
      <button type="submit" class="button-secondary">Save check result</button>
    </div>
  </form>`;
}

function renderLtiProfileSettingsForm(currentProfileId: string): string {
  return `<form method="post" action="/admin/verification/lti-profile" class="stack">
    <div class="field">
      <span>LTI profile</span>
      <div class="detail-stack">
        ${
    LTI_PROFILE_DEFINITIONS.map((profile) =>
      `<label class="choice-row">
            <input
              type="radio"
              name="defaultLtiProfile"
              value="${escapeHtml(profile.id)}"
              ${profile.id === currentProfileId ? "checked" : ""}
            >
            <span>
              <strong>${escapeHtml(profile.label)}</strong>
              <span class="micro muted">${escapeHtml(profile.summary)}</span>
            </span>
          </label>`
    ).join("")
  }
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
  const guidance = resolveWorkflowGuidance(
    input.item.workflowKey,
    guidanceDeployment,
  );
  const statusLabel = internal === null
    ? "Not recorded"
    : describeBrokerRunStatus(internal.status);
  const checkedAt = internal === null
    ? "Checked at Not recorded yet"
    : `Checked ${formatDateTime(internal.checkedAt)}`;
  const summary = internal?.summary ??
    `No internal evidence has been recorded for ${
      describeCertificationWorkflowShortLabel(input.item.workflowKey)
    } yet.`;
  const evidenceSetup = internal?.deploymentLabel ??
    "No internal evidence recorded";

  return `<article class="table-row">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(input.item.label)}</span>
          <span class="chip">${escapeHtml(statusLabel)}</span>
        </p>
        <p class="micro muted">${escapeHtml(checkedAt)}</p>
      </div>
      <p class="line-copy">${escapeHtml(summary)}</p>
      <p class="micro muted">${
    escapeHtml(describeWorkflowBoundaryNote(input.item.workflowKey))
  }</p>
      <div class="table-row-meta">
        <span><strong>Latest internal evidence:</strong> ${
    escapeHtml(evidenceSetup)
  }</span>
        <span><strong>Run guidance:</strong> ${escapeHtml(guidance.copy)}</span>
      </div>
      <div class="button-row">
        ${
    internal?.evidenceUrl
      ? `<a class="button-ghost" href="${
        escapeHtml(internal.evidenceUrl)
      }">Open internal evidence</a>`
      : ""
  }
        ${
    guidance.href
      ? `<a class="button-secondary" href="${escapeHtml(guidance.href)}">${
        escapeHtml(guidance.label)
      }</a>`
      : ""
  }
      </div>
    </article>`;
}

function resolveGuidanceDeployment(
  deployments: ControlPlaneDeploymentInventoryRow[],
  deploymentRecordId: number | null,
): ControlPlaneDeploymentInventoryRow | null {
  if (deploymentRecordId !== null) {
    const matchingDeployment = deployments.find((deployment) =>
      deployment.deploymentId === deploymentRecordId
    );

    if (matchingDeployment) {
      return matchingDeployment;
    }
  }

  return deployments.find((deployment) => deployment.binding !== null) ??
    deployments[0] ?? null;
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
    case "core":
      return {
        copy:
          "Run the LTI Core workflow in the official 1EdTech suite. Save the latest result here after the suite finishes.",
        href: "https://www.imsglobal.org/spec/lti/v1p3/cert/",
        label: "Open Core suite guidance",
      };
    case "deepLinking":
      return {
        copy:
          "Run the Deep Linking workflow in the official 1EdTech suite. Save the latest result here after the suite finishes.",
        href: "https://www.imsglobal.org/spec/lti/v1p3/cert/",
        label: "Open Deep Linking suite guidance",
      };
    case "nrps":
      return deployment === null
        ? {
          copy:
            "Save one app setup, then open its deployment activity page to run or review the roster check.",
          href: null,
          label: "Open deployment activity",
        }
        : {
          copy:
            "Open the deployment activity page to run or review the saved roster check from Lantern's existing SSR surface.",
          href: buildDeploymentActivityHref(deployment),
          label: "Open deployment activity",
        };
    case "ags":
      return deployment === null
        ? {
          copy:
            "Save one app setup, then open its deployment activity page to run or review the AGS smoke check.",
          href: null,
          label: "Open deployment activity",
        }
        : {
          copy:
            "Open the deployment activity page to run or review the saved AGS smoke check from Lantern's existing SSR surface.",
          href: buildDeploymentActivityHref(deployment),
          label: "Open deployment activity",
        };
  }
}

function describeWorkflowBoundaryNote(
  workflowKey: CertificationWorkflowKey,
): string {
  switch (workflowKey) {
    case "core":
      return "A passed Core row does not cover Deep Linking, NRPS, or AGS.";
    case "deepLinking":
      return "A passed Deep Linking row does not cover Core, NRPS, or AGS.";
    case "nrps":
      return "A passed NRPS row does not cover Core, Deep Linking, or AGS.";
    case "ags":
      return "A passed AGS row does not cover Core, Deep Linking, or NRPS.";
  }
}
