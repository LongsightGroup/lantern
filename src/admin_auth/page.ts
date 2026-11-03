import { escapeHtml } from '../admin/layout.ts';
import { ADMIN_LAYOUT_STYLES } from '../admin/layout_styles.ts';
import type { AdminAuthSocialProvider } from './config.ts';

const AUTH_PAGE_STYLES = `${ADMIN_LAYOUT_STYLES}
      body { background: var(--color-bg); }
      .auth-shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 40px 20px;
      }
      .auth-panel {
        width: min(100%, 420px);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-surface);
        box-shadow: var(--shadow-soft);
        padding: 28px;
      }
      .auth-title {
        margin: 0;
        color: var(--color-text);
        font-size: 1.45rem;
        line-height: 1.2;
      }
      .auth-intro {
        margin: 10px 0 24px;
        color: var(--color-muted);
        line-height: 1.5;
      }
      .auth-form {
        display: grid;
        gap: 16px;
      }
      .auth-stack {
        display: grid;
        gap: 18px;
      }
      .auth-divider {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 12px;
        color: var(--color-muted);
        font-size: 0.82rem;
        font-weight: 650;
        text-transform: uppercase;
      }
      .auth-divider::before,
      .auth-divider::after {
        content: "";
        height: 1px;
        background: var(--color-border);
      }
      .auth-field {
        display: grid;
        gap: 6px;
      }
      .auth-field label {
        color: var(--color-text);
        font-size: 0.9rem;
        font-weight: 650;
      }
      .auth-field input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--color-border-strong);
        border-radius: 6px;
        padding: 10px 12px;
        font: inherit;
      }
      .auth-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-top: 8px;
      }
      .auth-link {
        color: var(--color-link);
        font-size: 0.92rem;
        font-weight: 650;
        text-decoration: none;
      }
      .auth-error {
        border: 1px solid var(--color-danger-border);
        border-radius: 6px;
        background: var(--color-danger-bg);
        color: var(--color-danger-text);
        padding: 10px 12px;
        font-size: 0.92rem;
      }`;

export function renderAdminAuthPage(input: {
  mode: 'login' | 'signup';
  returnTo: string;
  socialProviders: ReadonlyArray<AdminAuthSocialProvider>;
  error?: string;
  email?: string;
  name?: string;
}): string {
  const isSignup = input.mode === 'signup';
  const title = isSignup ? 'Create your Lantern admin account' : 'Sign in to Lantern';
  const action = isSignup ? '/admin/signup' : '/admin/login';
  const alternateHref = isSignup ? '/admin/login' : '/admin/signup';
  const alternateLabel = isSignup
    ? 'Already have an account? Sign in'
    : 'Need access? Create an account';

  return renderAdminAuthShell({
    title,
    intro:
      'Use a Lantern admin account to review packages, govern LMS connections, and inspect runtime activity.',
    body: `
        ${renderAuthError(input.error)}
        <div class="auth-stack">
        ${isSignup ? '' : renderSocialSignInForms(input.returnTo, input.socialProviders)}
        <form class="auth-form" method="post" action="${action}">
          <input type="hidden" name="returnTo" value="${escapeHtml(input.returnTo)}">
          ${isSignup ? renderNameField(input.name) : ''}
          ${renderEmailField(input.email)}
          <div class="auth-field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="${
              isSignup ? 'new-password' : 'current-password'
            }" required>
          </div>
          <div class="auth-actions">
            <a class="auth-link" href="${alternateHref}">${alternateLabel}</a>
            <button class="button primary" type="submit">${
              isSignup ? 'Create account' : 'Sign in'
            }</button>
          </div>
        </form>
        </div>`,
  });
}

export function renderAdminLogoutPage(error?: string): string {
  return renderAdminAuthShell({
    title: 'Sign out of Lantern',
    intro: 'End the current admin session on this browser.',
    body: `
        ${renderAuthError(error)}
        <form class="auth-form" method="post" action="/admin/logout">
          <div class="auth-actions">
            <a class="auth-link" href="/admin/packages">Stay signed in</a>
            <button class="button primary" type="submit">Sign out</button>
          </div>
        </form>`,
  });
}

function renderAdminAuthShell(input: { title: string; intro: string; body: string }): string {
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <style>${AUTH_PAGE_STYLES}
    </style>
  </head>
  <body>
    <main class="auth-shell">
      <section class="auth-panel" aria-labelledby="auth-title">
        <h1 id="auth-title" class="auth-title">${escapeHtml(input.title)}</h1>
        <p class="auth-intro">${escapeHtml(input.intro)}</p>
        ${input.body}
      </section>
    </main>
  </body>
</html>`;
}

function renderAuthError(error: string | undefined): string {
  return error ? `<div class="auth-error" role="alert">${escapeHtml(error)}</div>` : '';
}

function renderSocialSignInForms(
  returnTo: string,
  providers: ReadonlyArray<AdminAuthSocialProvider>,
): string {
  if (providers.length === 0) {
    return '';
  }

  const forms = providers.map(
    (provider) =>
      `<form class="auth-form" method="post" action="/admin/login/${escapeHtml(provider.id)}">
          <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
          <button class="button" type="submit">Sign in with ${escapeHtml(provider.label)}</button>
        </form>`,
  );

  return `${forms.join('')}
        <div class="auth-divider" aria-hidden="true">or</div>`;
}

function renderNameField(name: string | undefined): string {
  return `<div class="auth-field">
            <label for="name">Name</label>
            <input id="name" name="name" autocomplete="name" required value="${escapeHtml(
              name ?? '',
            )}">
          </div>`;
}

function renderEmailField(email: string | undefined): string {
  return `<div class="auth-field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" required value="${escapeHtml(
              email ?? '',
            )}">
          </div>`;
}
