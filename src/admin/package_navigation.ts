import type { PackageVersionRecord } from '../package_review/types.ts';
import { escapeHtml } from './layout.ts';
import { resolvePreviousPackageVersion } from './package_version_history.ts';

export type PackagePageSection = 'overview' | 'version' | 'diff' | 'preview' | 'authoring';

export function renderPackagePageNav(input: {
  appId: string;
  history: PackageVersionRecord[];
  currentSection: PackagePageSection;
  currentVersion?: PackageVersionRecord | null;
}): string {
  const latestVersion = input.history[0] ?? input.currentVersion ?? null;
  const currentVersion = input.currentVersion ?? latestVersion;
  const actionVersion = resolveActionVersion(input.history, input.currentVersion ?? null);
  const authoringVersion = resolveAuthoringVersion(input.history, input.currentVersion ?? null);
  const diffBaseVersion =
    currentVersion === null ? null : resolvePreviousPackageVersion(input.history, currentVersion);
  const links = [
    renderNavLink({
      label: 'Overview',
      href: `/admin/packages/${encodeURIComponent(input.appId)}`,
      current: input.currentSection === 'overview',
    }),
    latestVersion === null
      ? ''
      : renderNavLink({
          label:
            input.currentSection === 'version' && currentVersion !== null
              ? `Version ${currentVersion.version}`
              : 'Latest version',
          href: `/admin/packages/${encodeURIComponent(input.appId)}/versions/${encodeURIComponent(
            currentVersion?.version ?? latestVersion.version,
          )}`,
          current: input.currentSection === 'version',
        }),
    currentVersion === null || diffBaseVersion === null
      ? ''
      : renderNavLink({
          label: 'Changes',
          href: `/admin/packages/${encodeURIComponent(input.appId)}/versions/${encodeURIComponent(
            currentVersion.version,
          )}/diff`,
          current: input.currentSection === 'diff',
        }),
    actionVersion === null
      ? ''
      : renderNavLink({
          label: 'Test launch',
          href: `/admin/packages/${encodeURIComponent(input.appId)}/versions/${encodeURIComponent(
            actionVersion.version,
          )}/preview`,
          current: input.currentSection === 'preview',
        }),
    authoringVersion === null
      ? ''
      : renderNavLink({
          label: 'Authoring',
          href: `/admin/packages/${encodeURIComponent(input.appId)}/versions/${encodeURIComponent(
            authoringVersion.version,
          )}/authoring`,
          current: input.currentSection === 'authoring',
        }),
  ]
    .filter((link) => link !== '')
    .join('');

  return `<nav class="page-nav" aria-label="App sections">${links}</nav>`;
}

export function supportsAuthoringDrafts(packageVersion: PackageVersionRecord): boolean {
  const manifestJson = packageVersion.manifestJson;

  if (!manifestJson || typeof manifestJson !== 'object' || Array.isArray(manifestJson)) {
    return false;
  }

  const authoring = (manifestJson as Record<string, unknown>).authoring;

  if (!authoring || typeof authoring !== 'object' || Array.isArray(authoring)) {
    return false;
  }

  return (authoring as Record<string, unknown>).kind === 'browser_autograder';
}

function resolveActionVersion(
  history: PackageVersionRecord[],
  currentVersion: PackageVersionRecord | null,
): PackageVersionRecord | null {
  if (currentVersion !== null && currentVersion.approvalStatus !== 'rejected') {
    return currentVersion;
  }

  return history.find((version) => version.approvalStatus === 'approved') ?? null;
}

function resolveAuthoringVersion(
  history: PackageVersionRecord[],
  currentVersion: PackageVersionRecord | null,
): PackageVersionRecord | null {
  const actionVersion = resolveActionVersion(history, currentVersion);

  if (actionVersion !== null && supportsAuthoringDrafts(actionVersion)) {
    return actionVersion;
  }

  return (
    history.find(
      (version) => version.approvalStatus === 'approved' && supportsAuthoringDrafts(version),
    ) ?? null
  );
}

function renderNavLink(input: { label: string; href: string; current: boolean }): string {
  return `<a class="page-nav-link ${input.current ? 'page-nav-link-current' : ''}" href="${escapeHtml(
    input.href,
  )}"${input.current ? ' aria-current="page"' : ''}>${escapeHtml(input.label)}</a>`;
}
