import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
  OfficialCertificationState,
} from "../ops/types.ts";
import {
  DEFAULT_LTI_PROFILE_ID,
  getLtiProfileDefinition,
  LTI_PROFILE_DEFINITIONS,
} from "../lti/profile.ts";
import {
  BROKER_VERIFICATION_SUPPORTED_PATHS,
  describeSupportedPath,
  resolveSupportedPathForDeployment,
} from "../ops/broker_verification_paths.ts";
import type { LanternLtiProfileSettingsRecord } from "../package_review/types.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";
import {
  describeBrokerRunStatus,
  describeOfficialCertificationState,
} from "./control_plane_support.ts";

export function renderBrokerVerificationSection(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  latestOfficialBrokerVerification: BrokerVerificationStatus | null;
}): string {
  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Check results</p>
          <h2>Saved checks</h2>
          <p>Each row shows the latest check for one app setup.</p>
          ${
    input.deployments.length === 0
      ? `<div class="callout">
              <h3>No connections recorded yet</h3>
              <p>Save a connection before you add a check result.</p>
            </div>`
      : `<div class="table-list">
              ${
        input.deployments
          .map((deployment) => renderDeploymentVerificationRow(deployment))
          .join("")
      }
            </div>`
  }
        </div>
        ${renderOfficialEvidenceSection(input.latestOfficialBrokerVerification)}
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

function renderDeploymentVerificationRow(
  deployment: ControlPlaneDeploymentInventoryRow,
): string {
  const verification = deployment.brokerVerification;
  const internal = verification?.internal ?? null;
  const supportedPath = resolveSupportedPathForDeployment(deployment);
  const checkedAt = internal === null
    ? "Not recorded yet"
    : formatDateTime(internal.checkedAt);

  return `<article class="table-row">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(deployment.deploymentLabel)}</span>
          <span class="chip">${
    escapeHtml(
      describeBrokerRunStatus(internal?.status ?? "notRun"),
    )
  }</span>
        </p>
        <p class="micro muted">${escapeHtml(checkedAt)}</p>
      </div>
      <p class="line-copy">${
    escapeHtml(
      internal?.summary ?? describeMissingInternalVerification(deployment),
    )
  }</p>
      <div class="table-row-meta">
        <span><strong>Setup:</strong> ${
    escapeHtml(describeDeploymentContext(deployment))
  }</span>
        <span><strong>Profile:</strong> ${
    escapeHtml(
      supportedPath === null
        ? "No supported path recorded yet."
        : describeSupportedPath(supportedPath),
    )
  }</span>
      </div>
      ${
    internal?.evidenceUrl
      ? `<div class="button-row">
              <a class="button-ghost" href="${
        escapeHtml(internal.evidenceUrl)
      }">Open log</a>
            </div>`
      : ""
  }
    </article>`;
}

function renderOfficialEvidenceSection(
  latestOfficialBrokerVerification: BrokerVerificationStatus | null,
): string {
  const official = latestOfficialBrokerVerification?.official ?? {
    state: "notCertified" as OfficialCertificationState,
    checkedAt: null,
    directoryUrl: null,
  };
  const hasOfficialRecord = official.checkedAt !== null;
  const supportedPath = latestOfficialBrokerVerification?.supportedPath ?? null;

  return `<section class="stack">
      <p class="section-label">Official evidence</p>
      <h2>Official 1EdTech listing</h2>
      <p>Use this only for the official 1EdTech directory listing.</p>
      <div class="fact">
        <span class="fact-label">Compatibility profile</span>
        <span class="fact-value">${
    escapeHtml(
      supportedPath === null
        ? "No official path recorded"
        : describeSupportedPath(supportedPath),
    )
  }</span>
      </div>
      <div class="fact">
        <span class="fact-label">Official certification</span>
        <span class="fact-value">${
    escapeHtml(
      hasOfficialRecord
        ? describeOfficialCertificationState(official.state)
        : "No official claim recorded",
    )
  }</span>
        <p class="micro muted">${
    escapeHtml(
      hasOfficialRecord
        ? official.state === "notCertified"
          ? "Latest recorded 1EdTech evidence does not show a certification listing."
          : "Latest recorded 1EdTech evidence shows the listed certification state."
        : "Lantern has no recorded 1EdTech directory evidence for the supported path yet.",
    )
  }</p>
        <p class="micro muted">${
    escapeHtml(
      official.checkedAt === null
        ? "Checked at Not recorded yet"
        : `Checked ${formatDateTime(official.checkedAt)}`,
    )
  }</p>
      </div>
      ${
    official.directoryUrl
      ? `<div class="button-row">
              <a class="button-ghost" href="${
        escapeHtml(official.directoryUrl)
      }">Open listing</a>
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

function describeMissingInternalVerification(
  deployment: ControlPlaneDeploymentInventoryRow,
): string {
  return `No compatibility check has been recorded for ${deployment.deploymentLabel} yet.`;
}

function describeDeploymentContext(
  deployment: ControlPlaneDeploymentInventoryRow,
): string {
  switch (deployment.binding?.lms ?? null) {
    case "canvas":
      return "Canvas deployment";
    case "moodle":
      return "Moodle deployment";
    case "sakai":
      return "Sakai deployment";
    case null:
      return "Binding not saved yet";
  }
}
