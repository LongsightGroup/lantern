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
        --bg: #f6f8fb;
        --surface: #ffffff;
        --text: #18354a;
        --muted: #5f7484;
        --accent: #1d7ed6;
        --border: #d9e2ea;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font: 16px/1.55 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      main {
        max-width: 840px;
        margin: 64px auto;
        padding: 32px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 18px 40px rgba(24, 53, 74, 0.08);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 2rem;
        line-height: 1.1;
      }

      p {
        margin: 0;
        color: var(--muted);
      }

      .section {
        margin-top: 28px;
        padding-top: 20px;
        border-top: 1px solid var(--border);
      }

      .tag {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(29, 126, 214, 0.1);
        color: var(--accent);
        font-size: 0.875rem;
        font-weight: 600;
      }

      ul {
        margin: 14px 0 0;
        padding-left: 18px;
        color: var(--text);
      }

      li + li {
        margin-top: 8px;
      }

      strong {
        color: var(--text);
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
