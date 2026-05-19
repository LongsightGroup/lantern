import { escapeHtml } from './layout.ts';

export type VerificationPageSection = 'checklist' | 'official' | 'new' | 'profile';

export function renderVerificationPageNav(currentSection: VerificationPageSection): string {
  const links = [
    renderNavLink({
      label: 'Checklist',
      href: '/admin/verification',
      current: currentSection === 'checklist',
    }),
    renderNavLink({
      label: 'Official evidence',
      href: '/admin/verification/official',
      current: currentSection === 'official',
    }),
    renderNavLink({
      label: 'Add result',
      href: '/admin/verification/new',
      current: currentSection === 'new',
    }),
    renderNavLink({
      label: 'Lantern default',
      href: '/admin/verification/lti-profile',
      current: currentSection === 'profile',
    }),
  ].join('');

  return `<nav class="page-nav" aria-label="Verification sections">${links}</nav>`;
}

function renderNavLink(input: { label: string; href: string; current: boolean }): string {
  return `<a class="page-nav-link ${input.current ? 'page-nav-link-current' : ''}" href="${
    escapeHtml(input.href)
  }"${input.current ? ' aria-current="page"' : ''}>${
    escapeHtml(
      input.label,
    )
  }</a>`;
}
