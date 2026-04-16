import { listReferencePackageIds } from '../package_review/intake.ts';
import { escapeHtml } from './layout.ts';

export function renderReferencePackageCatalog(
  buttonClass: 'button-primary' | 'button-secondary',
): string {
  return listReferencePackageIds()
    .map((appId) => renderReferencePackageCard(appId, buttonClass))
    .join('');
}

export function formatReferencePackageTitle(appId: string): string {
  switch (appId) {
    case 'chapter-4-asteroids':
      return 'Chapter 4 Asteroids';
    case 'typescript-ladder-game':
      return 'TypeScript Ladder Game';
    case 'quick-study':
      return 'Quick Study';
    default:
      return appId;
  }
}

export function describeReferencePackage(appId: string): string {
  switch (appId) {
    case 'chapter-4-asteroids':
      return 'Arcade-style vocabulary review with saved launch and review data.';
    case 'typescript-ladder-game':
      return 'Ten-step TypeScript correction ladder with browser grading, coaching hints, and anonymous evidence return.';
    case 'quick-study':
      return 'Flashcard-style study app with calmer pacing and completion grading.';
    default:
      return 'Shipped reference app.';
  }
}

function renderReferencePackageCard(
  appId: string,
  buttonClass: 'button-primary' | 'button-secondary',
): string {
  const title = formatReferencePackageTitle(appId);
  const summary = describeReferencePackage(appId);

  return `<section class="fact">
    <span class="fact-label">Reference app</span>
    <strong class="fact-value">${escapeHtml(title)}</strong>
    <p class="micro muted">${escapeHtml(summary)}</p>
    <form method="post" action="/admin/packages/import-reference" class="button-row">
      <input type="hidden" name="appId" value="${escapeHtml(appId)}" />
      <button type="submit" class="${escapeHtml(buttonClass)}">Import ${escapeHtml(title)}</button>
    </form>
  </section>`;
}
