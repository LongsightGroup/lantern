function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderLayout(title: string, body: string): string {
  const safeTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: light;
        --font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        --ink: #11253d;
        --secondary: #475c72;
        --muted: #708397;
        --accent: #153a61;
        --accent-hover: #102f4d;
        --brand-warm: #c7771d;
        --line: #dbe4ec;
        --surface: #fcfdff;
      }

      * {
        box-sizing: border-box;
        margin: 0;
      }

      body {
        margin: 0;
        color: var(--ink);
        font: 16px/1.6 var(--font);
        -webkit-font-smoothing: antialiased;
        background: linear-gradient(180deg, #f7fafc 0%, #eef3f7 100%);
      }

      .home {
        width: min(1080px, 100% - 40px);
        margin: 0 auto;
        padding: 56px 0 64px;
      }

      .home-hero {
        padding: 20px 0 34px;
        margin-bottom: 20px;
        border-bottom: 1px solid var(--line);
      }

      .eyebrow {
        color: var(--accent);
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 10px;
      }

      h1 {
        font-size: 2.75rem;
        line-height: 1.2;
        letter-spacing: 0;
        margin-bottom: 14px;
      }

      .home-hero p {
        color: var(--secondary);
        max-width: 68ch;
      }

      .home-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }

      .home-card {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 18px 18px 16px;
        box-shadow: 0 2px 8px rgba(10, 37, 64, 0.05);
      }

      h2 {
        font-size: 1.05rem;
        margin-bottom: 8px;
      }

      .home-card p {
        color: var(--secondary);
      }

      ul,
      ol {
        color: var(--secondary);
        padding-left: 20px;
        display: grid;
        gap: 6px;
      }

      .home-cta {
        margin-top: 12px;
      }

      .cta-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 0 14px;
        border-radius: 8px;
        background: var(--accent);
        color: #fdfefe;
        text-decoration: none;
        font-weight: 600;
      }

      .cta-primary:hover {
        background: var(--accent-hover);
      }

      @media (max-width: 640px) {
        .home {
          width: min(1080px, 100% - 28px);
          padding-top: 32px;
        }

        h1 {
          font-size: 2rem;
        }
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
