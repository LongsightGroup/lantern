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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light;
        --font: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        --ink: #0a2540;
        --secondary: #425466;
        --muted: #6b7c93;
        --accent: #4f46e5;
        --accent-hover: #4338ca;
        --brand-warm: #f59e0b;
        --line: #e3e8ee;
        --surface: #ffffff;
      }

      * {
        box-sizing: border-box;
        margin: 0;
      }

      body {
        color: var(--ink);
        font: 16px/1.6 var(--font);
        -webkit-font-smoothing: antialiased;
      }

      .hero {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 40px 24px;
        background:
          radial-gradient(ellipse 60% 50% at 50% 35%, rgba(245, 158, 11, 0.07) 0%, transparent 60%),
          radial-gradient(ellipse 80% 60% at 50% 0%, rgba(79, 70, 229, 0.10) 0%, transparent 60%),
          linear-gradient(180deg, #0a2540 0%, #0d3155 50%, #122b44 100%);
        color: #fff;
      }

      .hero-mark {
        margin-bottom: 28px;
      }

      .hero h1 {
        font-size: clamp(3rem, 8vw, 5.5rem);
        font-weight: 700;
        letter-spacing: -0.04em;
        line-height: 1;
        margin-bottom: 12px;
      }

      .hero-sub {
        font-size: clamp(1.1rem, 2vw, 1.35rem);
        font-weight: 500;
        color: rgba(255, 255, 255, 0.5);
        letter-spacing: -0.01em;
        margin-bottom: 20px;
      }

      .hero-desc {
        max-width: 44ch;
        font-size: clamp(0.95rem, 1.2vw, 1.05rem);
        line-height: 1.65;
        color: rgba(255, 255, 255, 0.4);
      }

      .hero-cta {
        margin-top: 36px;
        display: flex;
        gap: 12px;
      }

      .hero-cta a {
        display: inline-flex;
        align-items: center;
        height: 44px;
        padding: 0 24px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        text-decoration: none;
        transition: background 120ms;
      }

      .hero-cta .cta-primary {
        background: var(--accent);
        color: #fff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(79, 70, 229, 0.3);
      }

      .hero-cta .cta-primary:hover {
        background: var(--accent-hover);
      }

      .hero-cta .cta-secondary {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.10);
      }

      .hero-cta .cta-secondary:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
