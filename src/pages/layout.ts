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
        --line: #dbe4ec;
        --surface: #fcfdff;
      }

      * {
        box-sizing: border-box;
        margin: 0;
      }

      body {
        min-height: 100vh;
        margin: 0;
        color: var(--ink);
        font: 16px/1.6 var(--font);
        -webkit-font-smoothing: antialiased;
        background: linear-gradient(180deg, #f7fafc 0%, #eef3f7 100%);
      }

      .home {
        width: calc(100% - 40px);
        max-width: 760px;
        margin: 0 auto;
        padding: 64px 0;
      }

      .home-hero {
        padding-bottom: 28px;
        border-bottom: 1px solid var(--line);
      }

      .eyebrow {
        margin-bottom: 10px;
        color: var(--accent);
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin-bottom: 14px;
        font-size: clamp(2rem, 5vw, 2.75rem);
        line-height: 1.18;
        letter-spacing: 0;
      }

      p {
        color: var(--secondary);
      }

      .route-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding-top: 24px;
      }

      .route-list a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid var(--accent);
        border-radius: 8px;
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }

      .route-list a:hover {
        background: var(--accent);
        color: var(--surface);
      }

      @media (max-width: 640px) {
        .home {
          width: calc(100% - 28px);
          padding-top: 40px;
        }

        .route-list {
          flex-direction: column;
          align-items: stretch;
        }
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
