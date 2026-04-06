import { summarizeAccessibilityReview } from '../package_review/summary.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { escapeHtml, formatDateTime } from './layout.ts';
import type {
  DeploymentEditorState,
  DeploymentNrpsVerificationSummary,
  ManagedDeploymentSlot,
} from './deployment_detail.ts';
import {
  getCanvasBinding,
  hasPendingCanvasRegistration,
  hasSavedBinding,
} from './deployment_detail_release_support.ts';
import {
  renderFieldAriaInvalid,
  renderFieldError,
  resolvePinnedVersionId,
} from './deployment_detail_release_field_support.ts';

export function renderCanvasRosterVerification(
  appId: string,
  slot: ManagedDeploymentSlot,
  nrpsVerification: DeploymentNrpsVerificationSummary | null,
): string {
  const rosterStatus =
    nrpsVerification === null
      ? 'Not run yet'
      : nrpsVerification.status === 'succeeded'
        ? 'Succeeded'
        : 'Failed';
  const rosterSummary =
    nrpsVerification === null
      ? 'Run this after the Canvas slot has launched once.'
      : `Last check ${formatDateTime(nrpsVerification.checkedAt)} · Context ${
          nrpsVerification.contextId ?? 'not recorded'
        } · Members ${
          nrpsVerification.memberCount === null ? 'not recorded' : nrpsVerification.memberCount
        }`;

  return `<div class="stack">
      <p class="section-label">Canvas test</p>
      <div class="fact">
        <span class="fact-label">Roster access</span>
        <span class="fact-value">${escapeHtml(rosterStatus)}</span>
        <p class="micro muted">${escapeHtml(rosterSummary)}</p>
      </div>
      <form method="post" action="/admin/packages/${escapeHtml(
        appId,
      )}/deployment/verify-roster" class="stack">
        <div class="button-row">
          <button type="submit" class="button-secondary" ${
            getCanvasBinding(slot.deployment.binding) === null ? 'disabled' : ''
          }>Run roster test</button>
        </div>
      </form>
    </div>`;
}

export function renderVersionPinForm(
  appId: string,
  slot: ManagedDeploymentSlot,
  editorState: DeploymentEditorState | null,
  approvedVersions: PackageVersionRecord[],
): string {
  const bindingSaved = hasSavedBinding(slot) || hasPendingCanvasRegistration(slot);
  const pinEnabled = bindingSaved && approvedVersions.length > 0;
  const selectedVersionId = resolvePinnedVersionId(editorState, slot);
  const accessibilityVersion = resolveAccessibilityVersion(approvedVersions, selectedVersionId);
  const accessibilitySummary =
    accessibilityVersion === null ? null : summarizeAccessibilityReview(accessibilityVersion);
  const pinHint = bindingSaved
    ? approvedVersions.length === 0
      ? 'Approve a version before you choose what learners should open.'
      : hasPendingCanvasRegistration(slot)
        ? 'Choose the live version now. Lantern will finish the exact Canvas setup on the first launch.'
        : 'Choose the approved version this app setup should open.'
    : 'Save the app settings first. Lantern keeps the live version secondary until the slot is identified.';

  return `<div class="stack">
      <p class="section-label">Live version</p>
      <p class="deployment-form-note">${escapeHtml(pinHint)}</p>
      <form method="post" action="/admin/packages/${escapeHtml(
        appId,
      )}/deployment/pin" class="stack">
        <input type="hidden" name="lms" value="${escapeHtml(slot.lms)}" />
        <div class="field">
          <label for="${escapeHtml(slot.lms)}-package-version-id">Approved version</label>
          <select id="${escapeHtml(slot.lms)}-package-version-id" name="packageVersionId" ${
            pinEnabled ? '' : 'disabled'
          } ${renderFieldAriaInvalid(editorState, 'packageVersionId')}>
            ${
              bindingSaved
                ? approvedVersions.length === 0
                  ? `<option value="">No approved versions available yet</option>`
                  : approvedVersions
                      .map((version) => {
                        const accessibility = summarizeAccessibilityReview(version);

                        return `<option value="${escapeHtml(String(version.id))}" ${
                          selectedVersionId === String(version.id) ? 'selected' : ''
                        }>Version ${escapeHtml(version.version)} · ${escapeHtml(
                          version.title,
                        )} · ${escapeHtml(accessibility.label)}</option>`;
                      })
                      .join('')
                : `<option value="">Save the binding first</option>`
            }
          </select>
          <p class="field-hint">Pending and rejected versions stay visible in history, but they cannot become active pins.</p>
          ${renderFieldError(editorState, 'packageVersionId')}
        </div>
        ${
          accessibilitySummary === null
            ? ''
            : `<div class="fact">
            <span class="fact-label">Accessibility</span>
            <span class="fact-value">${escapeHtml(accessibilitySummary.label)}</span>
            <p class="micro muted">${escapeHtml(accessibilitySummary.detail)}</p>
            ${
              accessibilitySummary.exceptionNote === null
                ? ''
                : `<p class="micro muted">${escapeHtml(accessibilitySummary.exceptionNote)}</p>`
            }
          </div>`
        }
        <div class="button-row">
          <button type="submit" class="button-secondary" ${
            pinEnabled ? '' : 'disabled'
          }>Save live version</button>
        </div>
      </form>
    </div>`;
}

function resolveAccessibilityVersion(
  approvedVersions: PackageVersionRecord[],
  selectedVersionId: string | null,
): PackageVersionRecord | null {
  if (selectedVersionId !== null) {
    const selectedVersion = approvedVersions.find(
      (version) => String(version.id) === selectedVersionId,
    );

    if (selectedVersion) {
      return selectedVersion;
    }
  }

  return approvedVersions[0] ?? null;
}
