import { describeDeploymentPin } from '../package_review/summary.ts';
import type { CanvasEnvironmentOption } from '../lti/config.ts';
import type { DeploymentRecord, PackageVersionRecord } from '../package_review/types.ts';
import { escapeHtml, formatDateTime } from './layout.ts';
import type { DeploymentNrpsVerificationSummary } from './deployment_detail.ts';

export function renderCurrentPinSection(input: {
  deployment: DeploymentRecord | null;
  activeDeployment: DeploymentRecord;
  launchReady: boolean;
  installStatusHeading: string;
}): string {
  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Current pin</p>
          <h2>${escapeHtml(describeDeploymentPin(input.deployment))}</h2>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Slug</span>
              <span class="fact-value">${escapeHtml(input.activeDeployment.slug)}</span>
            </div>
            <div class="fact">
              <span class="fact-label">App ID</span>
              <span class="fact-value">${escapeHtml(input.activeDeployment.appId)}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Updated</span>
              <span class="fact-value">${escapeHtml(
                formatDateTime(input.activeDeployment.updatedAt),
              )}</span>
            </div>
          </div>
          <div class="callout">
            <h3>Release gate</h3>
            <p>Only versions that are already approved appear in the picker. Pending and rejected versions stay visible in history, but they cannot become active pins.</p>
          </div>
        </div>
        <section class="stack">
          <p class="section-label">Canvas status</p>
          <h2>${escapeHtml(input.installStatusHeading)}</h2>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Launch readiness</span>
              <span class="fact-value">${
                input.launchReady ? 'Ready for Canvas launch' : 'Needs configuration'
              }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas environment</span>
              <span class="fact-value">${escapeHtml(
                describeBindingValue(input.activeDeployment.binding?.canvasEnvironment),
              )}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas issuer</span>
              <span class="fact-value">${escapeHtml(
                describeBindingValue(input.activeDeployment.binding?.issuer),
              )}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas Client ID</span>
              <span class="fact-value">${escapeHtml(
                describeBindingValue(input.activeDeployment.binding?.clientId),
              )}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas Deployment ID</span>
              <span class="fact-value">${escapeHtml(
                describeBindingValue(input.activeDeployment.binding?.deploymentId),
              )}</span>
            </div>
          </div>
          <p class="micro muted">A deployment is launch-ready only after Lantern has both an exact approved version pin and an exact Canvas binding.</p>
        </section>
      </div>
    </section>`;
}

export function renderCanvasInstallSection(input: {
  appId: string;
  activeDeployment: DeploymentRecord;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  rosterVerificationHeading: string;
  canvasConfigUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  approvedVersions: PackageVersionRecord[];
  history: PackageVersionRecord[];
}): string {
  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Canvas install</p>
          <h2>One supported setup path</h2>
          <div class="step-list">
            <article class="step-card">
              <p class="section-label">Step 1</p>
              <h3>Copy Lantern's config URL into Canvas</h3>
              <p>Use the hosted Lantern config document when you create the developer key or external tool in Canvas. Lantern publishes one supported pilot configuration.</p>
              <div class="fact">
                <span class="fact-label">Config URL</span>
                <code class="inline-code">${escapeHtml(
                  input.canvasConfigUrl ??
                    'APP_ORIGIN is required before Lantern can publish the config URL.',
                )}</code>
              </div>
            </article>
            <article class="step-card">
              <p class="section-label">Step 2</p>
              <h3>Deploy the tool in Canvas</h3>
              <p>Finish the Canvas-side setup through the single supported placement, then note the exact Client ID and Deployment ID that Canvas assigns.</p>
            </article>
            <article class="step-card">
              <p class="section-label">Step 3</p>
              <h3>Save the exact Canvas binding in Lantern</h3>
              <p>Return here and record the exact environment, Client ID, and Deployment ID. Lantern binds launches only through those saved identifiers.</p>
            </article>
          </div>
          ${
            input.canvasConfigUrl === null
              ? `<div class="callout">
              <h3>Config URL unavailable</h3>
              <p>Set <code class="inline-code">APP_ORIGIN</code> before you attempt the Canvas install flow. Lantern will not guess public launch URLs from the local request.</p>
            </div>`
              : ''
          }
        </div>
        <section class="stack">
          <p class="section-label">Canvas binding</p>
          <form method="post" action="/admin/packages/${escapeHtml(
            input.appId,
          )}/deployment/install" class="stack">
            <div class="field">
              <label for="canvas-environment">Canvas environment</label>
              <select id="canvas-environment" name="canvasEnvironment" ${
                input.canvasConfigUrl === null ? 'disabled' : ''
              }>
                ${input.supportedCanvasEnvironments
                  .map(
                    (environment) =>
                      `<option value="${escapeHtml(environment.id)}" ${
                        input.activeDeployment.binding?.canvasEnvironment === environment.id
                          ? 'selected'
                          : ''
                      }>${escapeHtml(environment.label)}</option>`,
                  )
                  .join('')}
              </select>
              <p class="field-hint">Pick the hosted Canvas environment this deployment will use. Lantern stores the matching issuer value behind the scenes.</p>
            </div>
            <div class="field">
              <label for="client-id">Canvas Client ID</label>
              <input
                id="client-id"
                name="clientId"
                type="text"
                value="${escapeHtml(input.activeDeployment.binding?.clientId ?? '')}"
                placeholder="10000000000001"
                ${input.canvasConfigUrl === null ? 'disabled' : ''}
              />
              <p class="field-hint">Paste the exact Client ID Canvas assigned when you created the tool.</p>
            </div>
            <div class="field">
              <label for="deployment-id">Canvas Deployment ID</label>
              <input
                id="deployment-id"
                name="deploymentId"
                type="text"
                value="${escapeHtml(input.activeDeployment.binding?.deploymentId ?? '')}"
                placeholder="deployment-123"
                ${input.canvasConfigUrl === null ? 'disabled' : ''}
              />
              <p class="field-hint">Paste the exact Deployment ID for this Canvas placement. Lantern does not infer deployments from course or client data alone.</p>
            </div>
            <div class="button-row">
              <button type="submit" class="button-primary" ${
                input.canvasConfigUrl === null ? 'disabled' : ''
              }>Save Canvas binding</button>
              <a class="button-ghost" href="/admin/packages/${escapeHtml(
                input.appId,
              )}/versions/${escapeHtml(input.history[0]?.version ?? '')}">Back to dossier</a>
            </div>
          </form>
          <p class="micro muted">Lantern records the exact Canvas identifiers and keeps them visible on reload so the install path stays auditable.</p>
          <div class="callout">
            <h3>Roster access proof</h3>
            <p>${escapeHtml(input.rosterVerificationHeading)}</p>
            <div class="facts">
              <div class="fact">
                <span class="fact-label">Last check</span>
                <span class="fact-value">${escapeHtml(
                  input.nrpsVerification === null
                    ? 'Not run yet'
                    : formatDateTime(input.nrpsVerification.checkedAt),
                )}</span>
              </div>
              <div class="fact">
                <span class="fact-label">Context ID</span>
                <span class="fact-value">${escapeHtml(
                  input.nrpsVerification?.contextId ?? 'Latest launch context required',
                )}</span>
              </div>
              <div class="fact">
                <span class="fact-label">Member count</span>
                <span class="fact-value">${escapeHtml(
                  input.nrpsVerification?.memberCount === null ||
                    input.nrpsVerification?.memberCount === undefined
                    ? 'Not recorded'
                    : String(input.nrpsVerification.memberCount),
                )}</span>
              </div>
              <div class="fact">
                <span class="fact-label">Status</span>
                <span class="fact-value">${escapeHtml(
                  input.nrpsVerification === null
                    ? 'Pending verification'
                    : input.nrpsVerification.status === 'succeeded'
                      ? 'Succeeded'
                      : 'Failed',
                )}</span>
              </div>
            </div>
            <form method="post" action="/admin/packages/${escapeHtml(
              input.appId,
            )}/deployment/verify-roster" class="stack">
              <div class="button-row">
                <button type="submit" class="button-secondary" ${
                  input.activeDeployment.binding === null ? 'disabled' : ''
                }>Verify roster access</button>
              </div>
            </form>
            <p class="micro muted">Lantern uses the latest launch-captured NRPS URL for this deployment and stores only a small verification summary.</p>
          </div>
          <p class="section-label">Version picker</p>
          <form method="post" action="/admin/packages/${escapeHtml(
            input.appId,
          )}/deployment/pin" class="stack">
            <div class="field">
              <label for="package-version-id">Approved version</label>
              <select id="package-version-id" name="packageVersionId" ${
                input.approvedVersions.length === 0 ? 'disabled' : ''
              }>
                ${
                  input.approvedVersions.length === 0
                    ? `<option value="">No approved versions available yet</option>`
                    : input.approvedVersions
                        .map(
                          (version) =>
                            `<option value="${escapeHtml(String(version.id))}" ${
                              input.activeDeployment.enabledPackageVersionId === version.id
                                ? 'selected'
                                : ''
                            }>Version ${escapeHtml(version.version)} · ${escapeHtml(
                              version.title,
                            )}</option>`,
                        )
                        .join('')
                }
              </select>
            </div>
            <div class="button-row">
              <button type="submit" class="button-primary" ${
                input.approvedVersions.length === 0 ? 'disabled' : ''
              }>Save exact version pin</button>
              <a class="button-ghost" href="/admin/packages/${escapeHtml(
                input.appId,
              )}/versions/${escapeHtml(input.history[0]?.version ?? '')}">Back to dossier</a>
            </div>
          </form>
          <p class="micro muted">Saving records the exact package version id and leaves the active pin visible on reload.</p>
        </section>
      </div>
    </section>`;
}

function describeBindingValue(value: string | null | undefined): string {
  if (!value) {
    return 'Not saved yet';
  }

  return value;
}
