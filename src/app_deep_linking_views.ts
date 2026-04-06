import type { Context } from '@hono/hono';
import { renderDeepLinkingPickerPage } from './admin/deep_linking_picker.ts';
import { type AdminNotice, escapeHtml } from './admin/layout.ts';
import { listDeepLinkingResources, resolveDeepLinkingSelection } from './lti/deep_linking.ts';
import type { DeepLinkingSessionRecord } from './lti/types.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';
import type { DeepLinkingResourceSelection } from './package_review/types.ts';

interface DeepLinkingResponseSubmissionView {
  returnUrl: string;
  formFields: Record<string, string>;
}

export async function renderDeepLinkingPickerResponse(input: {
  context: Context;
  repository: PackageReviewRepository;
  session: DeepLinkingSessionRecord;
  token: string;
  notice: AdminNotice | null;
  status?: 200 | 400 | 409;
}) {
  const resources = await listDeepLinkingResources({
    repository: input.repository,
    session: input.session,
  });
  const selection = resolveDeepLinkingSelection({
    session: input.session,
    resources,
  });

  return input.context.html(
    renderDeepLinkingPickerPage({
      sessionId: input.session.sessionId,
      token: input.token,
      session: input.session,
      resources,
      selection,
      notice: input.notice,
    }),
    input.status ?? 200,
  );
}

export function renderDeepLinkingSubmitStatusPage(input: {
  tone: 'success' | 'error';
  title: string;
  detail: string;
  session?: Pick<
    DeepLinkingSessionRecord,
    'appId' | 'contextTitle' | 'deploymentSlug' | 'placement'
  >;
  selection?: DeepLinkingResourceSelection | null;
  submission?: DeepLinkingResponseSubmissionView;
}): string {
  const surfaceClass = input.tone === 'success' ? 'success' : 'error';
  const session = input.session ?? null;
  const selection = input.selection ?? null;
  const submission = input.submission ?? null;
  const selectionSummaryLabel =
    session?.placement === 'resource_selection'
      ? 'Saved reviewed course resource'
      : 'Saved reviewed assignment resource';
  const returnSummaryLabel =
    session?.placement === 'resource_selection'
      ? 'Course resource return'
      : 'Assignment resource return';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light;
        --font: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        --bg: linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%);
        --surface: #ffffff;
        --surface-soft: #f8fafc;
        --ink: #0f172a;
        --muted: #475569;
        --line: #d9e2ec;
        --success: #166534;
        --success-soft: #e8f5eb;
        --error: #b42318;
        --error-soft: #fef3f2;
        --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
      }

      body {
        font: 14px/1.55 var(--font);
        color: var(--ink);
        background: var(--bg);
        padding: 24px;
      }

      main {
        max-width: 760px;
        margin: 0 auto;
      }

      .shell {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(217, 226, 236, 0.9);
        border-radius: 28px;
        padding: 20px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }

      .status-card,
      .summary-card {
        padding: 20px;
        border-radius: 22px;
        border: 1px solid var(--line);
        background: var(--surface);
      }

      .status-card.success {
        background: linear-gradient(180deg, rgba(232, 245, 235, 0.72), #ffffff);
        border-color: rgba(22, 101, 52, 0.16);
      }

      .status-card.error {
        background: linear-gradient(180deg, rgba(254, 243, 242, 0.82), #ffffff);
        border-color: rgba(180, 35, 24, 0.16);
      }

      .eyebrow {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: ${surfaceClass === 'success' ? 'var(--success)' : 'var(--error)'};
      }

      h1 {
        margin: 0;
        font-size: clamp(1.8rem, 4vw, 2.4rem);
        line-height: 1.05;
        letter-spacing: -0.03em;
      }

      p {
        margin: 12px 0 0;
        color: var(--muted);
      }

      .layout {
        display: grid;
        gap: 16px;
        margin-top: 16px;
      }

      .summary-label {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .summary-item {
        margin: 0;
      }

      .summary-item strong {
        display: block;
        margin-bottom: 4px;
      }

      .button-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 600;
        color: white;
        background: var(--success);
        cursor: pointer;
      }

      .helper-copy {
        margin-top: 12px;
      }

      .resource-path {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      @media (max-width: 720px) {
      body {
        padding: 12px;
      }

        .shell {
          padding: 12px;
          border-radius: 20px;
        }

        .status-card,
        .summary-card {
          padding: 16px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <section class="status-card ${surfaceClass}">
          <p class="eyebrow">Lantern Deep Linking</p>
          <h1>${escapeHtml(input.title)}</h1>
          <p>${escapeHtml(input.detail)}</p>
        </section>
        <div class="layout">
          ${
            session === null
              ? ''
              : `<section class="summary-card">
          <p class="summary-label">Session</p>
          <p class="summary-item"><strong>Course context</strong>${escapeHtml(
            session.contextTitle ?? 'LMS context',
          )}</p>
          <p class="summary-item"><strong>Bound app</strong>${escapeHtml(session.appId)}</p>
          <p class="summary-item"><strong>Deployment</strong>${escapeHtml(
            session.deploymentSlug,
          )}</p>
        </section>`
          }
          ${
            selection === null
              ? ''
              : `<section class="summary-card">
          <p class="summary-label">${escapeHtml(selectionSummaryLabel)}</p>
          <p class="summary-item"><strong>${escapeHtml(
            selection.contentTitle ?? `${selection.packageVersion} reviewed activity`,
          )}</strong>${escapeHtml(selection.packageVersion)}</p>
          <p class="summary-item resource-path">${escapeHtml(selection.contentPath)}</p>
        </section>`
          }
          ${
            submission === null
              ? ''
              : `<section class="summary-card">
          <p class="summary-label">${escapeHtml(returnSummaryLabel)}</p>
          <p class="summary-item"><strong>Signed Deep Linking response</strong>Lantern is posting the reviewed placement back now.</p>
          <form id="lms-return-form" method="post" action="${escapeHtml(submission.returnUrl)}">
            ${Object.entries(submission.formFields)
              .map(
                ([name, value]) =>
                  `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
              )
              .join('')}
            <button type="submit" class="button-primary">Return to LMS</button>
          </form>
          <p class="helper-copy">If the LMS does not resume automatically, use the button above.</p>
        </section>`
          }
        </div>
      </div>
      ${
        submission === null
          ? ''
          : `<script>
        window.addEventListener("load", () => {
          document.getElementById("lms-return-form")?.submit();
        }, { once: true });
      </script>`
      }
    </main>
  </body>
</html>`;
}
