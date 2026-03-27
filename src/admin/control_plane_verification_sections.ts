import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
  OfficialCertificationState,
} from "../ops/types.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";
import {
  describeBrokerRunStatus,
  describeOfficialCertificationState,
  describeSupportedPath,
  resolveSupportedPathForDeployment,
} from "./control_plane_support.ts";

export function renderBrokerVerificationSection(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  latestOfficialBrokerVerification: BrokerVerificationStatus | null;
}): string {
  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Broker verification</p>
          <h2>Deployment-scoped internal proof</h2>
          <p>Each deployment keeps its own manual or CI verification record. Lantern does not hide which deployment was actually checked.</p>
          ${
    input.deployments.length === 0
      ? `<div class="callout">
              <h3>No deployments recorded yet</h3>
              <p>Save a deployment binding before you record deployment-scoped broker verification evidence.</p>
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
          <p class="section-label">Verification updates</p>
          <h2>Record verification evidence</h2>
          <p>Use this form to record deployment-scoped internal proof or official 1EdTech directory evidence. Lantern stores exactly what you enter here and does not infer certification claims from local tests.</p>
        </div>
        ${renderBrokerVerificationForm(deployments)}
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
    escapeHtml(describeBrokerRunStatus(internal?.status ?? "notRun"))
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
        <span><strong>Deployment:</strong> ${
    escapeHtml(describeDeploymentContext(deployment))
  }</span>
        <span><strong>Path:</strong> ${
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
              <a class="button-ghost" href="${escapeHtml(internal.evidenceUrl)}">${
        escapeHtml(internal.evidenceUrl)
      }</a>
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
      <h2>Official 1EdTech evidence</h2>
      <p>Official directory evidence stays scope-based and separate from deployment-scoped internal proof.</p>
      <div class="fact">
        <span class="fact-label">Supported path</span>
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
              <a class="button-ghost" href="${escapeHtml(official.directoryUrl)}">${
        escapeHtml(official.directoryUrl)
      }</a>
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
      <label for="verification-source">Evidence source</label>
      <select id="verification-source" name="source">
        <option value="manual">Manual operator check</option>
        <option value="ci">CI verification</option>
        <option value="1edtech">1EdTech directory evidence</option>
      </select>
      <p class="field-hint">Manual and CI evidence require an explicit deployment and supported path. Use 1EdTech only for official scope-based evidence.</p>
    </div>
    <div class="field">
      <label for="verification-deployment-record-id">Deployment</label>
      <select id="verification-deployment-record-id" name="deploymentRecordId">
        <option value="">No deployment selected</option>
        ${
    deployments
      .map((deployment) =>
        `<option value="${deployment.deploymentId}">${
          escapeHtml(deployment.deploymentLabel)
        }</option>`
      )
      .join("")
  }
      </select>
      <p class="field-hint">Pick the exact deployment for internal manual or CI proof. Leave this blank for official 1EdTech evidence.</p>
    </div>
    <div class="field">
      <label for="verification-scope">Supported path</label>
      <select id="verification-scope" name="scope">
        <option value="canvasLti13LaunchAgsNrps">Canvas LTI 1.3 launch, AGS, and NRPS</option>
        <option value="moodleLti13LaunchAgsScore">Moodle LTI 1.3 launch and AGS score publish</option>
        <option value="sakaiLti13LaunchAgsScore">Sakai LTI 1.3 launch and AGS score publish</option>
      </select>
      <p class="field-hint">Record the exact supported path the evidence covers.</p>
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
      <textarea id="verification-summary" name="summary" placeholder="Record exactly what the evidence shows for the selected deployment or official path."></textarea>
      <p class="field-hint">Keep the wording factual. Lantern should not claim official certification from internal proof alone.</p>
    </div>
    <div class="button-row">
      <button type="submit" class="button-secondary">Record verification evidence</button>
    </div>
  </form>`;
}

function describeMissingInternalVerification(
  deployment: ControlPlaneDeploymentInventoryRow,
): string {
  return `No internal verification evidence has been recorded for ${
    deployment.deploymentLabel
  } yet.`;
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
