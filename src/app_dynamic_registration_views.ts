import { escapeHtml } from './admin/layout.ts';

export function renderDynamicRegistrationStatusPage(input: {
  tone: 'success' | 'error';
  title: string;
  detail: string;
  closeLabel: string;
  returnUrl: string;
  returnLabel: string;
}): string {
  const accent = input.tone === 'success' ? '#166534' : '#b42318';
  const surface =
    input.tone === 'success'
      ? 'linear-gradient(180deg, rgba(232, 245, 235, 0.82), #ffffff)'
      : 'linear-gradient(180deg, rgba(254, 243, 242, 0.88), #ffffff)';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        --ink: #0f172a;
        --muted: #475569;
        --line: #d9e2ec;
        --accent: ${accent};
        --surface: ${surface};
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
        background:
          radial-gradient(circle at top, rgba(15, 23, 42, 0.06), transparent 45%),
          #f8fafc;
        padding: 20px;
      }

      main {
        max-width: 720px;
        margin: 0 auto;
      }

      .card {
        background: var(--surface);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 20px 44px rgba(15, 23, 42, 0.08);
      }

      .eyebrow {
        margin: 0 0 10px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1 {
        margin: 0;
        font-size: clamp(1.8rem, 4vw, 2.3rem);
        line-height: 1.08;
        letter-spacing: -0.03em;
      }

      p {
        margin: 14px 0 0;
        color: var(--muted);
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
      }

      button,
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        font: inherit;
        font-weight: 600;
        text-decoration: none;
      }

      button {
        border: none;
        color: white;
        background: var(--accent);
        cursor: pointer;
      }

      a {
        border: 1px solid rgba(15, 23, 42, 0.12);
        color: var(--ink);
        background: rgba(255, 255, 255, 0.86);
      }

      @media (max-width: 640px) {
        body {
          padding: 12px;
        }

        .card {
          border-radius: 18px;
          padding: 18px;
        }

        .button-row {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <p class="eyebrow">Lantern Dynamic Registration</p>
        <h1>${escapeHtml(input.title)}</h1>
        <p>${escapeHtml(input.detail)}</p>
        <div class="button-row">
          <button type="button" onclick="closeRegistration()">${escapeHtml(
            input.closeLabel,
          )}</button>
          <a href="${escapeHtml(
            input.returnUrl,
          )}" target="_blank" rel="noreferrer">${escapeHtml(input.returnLabel)}</a>
        </div>
      </section>
    </main>
    <script>
      function closeRegistration() {
        const target = window.opener || window.parent;

        if (target && typeof target.postMessage === "function") {
          target.postMessage({ subject: "org.imsglobal.lti.close" }, "*");
        }
      }
    </script>
  </body>
</html>`;
}
