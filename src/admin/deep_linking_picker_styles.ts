export const DEEP_LINKING_PICKER_STYLES = `
      :root {
        color-scheme: light;
        --font: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        --bg: linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%);
        --surface: #ffffff;
        --surface-soft: #f8fafc;
        --ink: #0f172a;
        --muted: #475569;
        --line: #d9e2ec;
        --accent: #14532d;
        --accent-soft: #e8f5eb;
        --accent-strong: #166534;
        --warn: #9a3412;
        --warn-soft: #fff3ec;
        --error: #b42318;
        --error-soft: #fef3f2;
        --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
        --radius: 18px;
        --radius-sm: 12px;
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
        max-width: 920px;
        margin: 0 auto;
      }
      .shell {
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(217, 226, 236, 0.9);
        border-radius: 28px;
        padding: 20px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }
      .hero {
        display: grid;
        gap: 16px;
        padding: 22px;
        border-radius: 22px;
        background:
          radial-gradient(circle at top right, rgba(20, 83, 45, 0.12), transparent 36%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.94));
        border: 1px solid rgba(217, 226, 236, 0.85);
      }
      .eyebrow {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent-strong);
      }
      h1 {
        margin: 0;
        font-size: clamp(1.8rem, 4vw, 2.6rem);
        line-height: 1.05;
        letter-spacing: -0.03em;
      }
      .hero-copy {
        margin: 0;
        max-width: 62ch;
        color: var(--muted);
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }

      .fact {
        padding: 14px;
        border-radius: 16px;
        background: var(--surface);
        border: 1px solid var(--line);
      }

      .fact-label {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .fact-value {
        font-size: 15px;
        font-weight: 600;
      }

      .notice {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
      }

      .notice.error {
        background: var(--error-soft);
        border-color: rgba(180, 35, 24, 0.18);
      }

      .notice.success {
        background: var(--accent-soft);
        border-color: rgba(20, 83, 45, 0.16);
      }

      .notice.note {
        background: var(--warn-soft);
        border-color: rgba(154, 52, 18, 0.16);
      }

      .notice h2 {
        margin: 0 0 6px;
        font-size: 1rem;
      }

      .notice p {
        margin: 0;
        color: var(--muted);
      }

      .layout {
        display: grid;
        gap: 18px;
        margin-top: 18px;
      }

      .selection-panel,
      .resource-panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 18px;
      }

      .section-label {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .selection-summary {
        padding: 14px;
        border-radius: 16px;
        background: var(--surface-soft);
        border: 1px solid var(--line);
      }

      .selection-summary strong {
        display: block;
        margin-bottom: 4px;
        font-size: 0.95rem;
      }

      .selection-summary p {
        margin: 0;
        color: var(--muted);
      }

      .resource-list {
        display: grid;
        gap: 12px;
      }

      .resource-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 14px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--surface);
        cursor: pointer;
      }

      .resource-card.selected {
        border-color: rgba(20, 83, 45, 0.34);
        background: linear-gradient(180deg, #ffffff 0%, #f4fbf6 100%);
        box-shadow: inset 0 0 0 1px rgba(20, 83, 45, 0.06);
      }

      .resource-card input {
        margin-top: 4px;
      }

      .resource-card h2 {
        margin: 0 0 4px;
        font-size: 1.05rem;
      }

      .resource-kicker,
      .resource-meta,
      .resource-path {
        margin: 0;
      }

      .resource-kicker {
        color: var(--accent-strong);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .resource-path {
        margin-top: 8px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: var(--muted);
      }

      .resource-meta {
        color: var(--muted);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }

      button,
      .phase-note {
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
      }

      button {
        border: none;
        cursor: pointer;
      }

      .button-primary {
        background: var(--accent);
        color: white;
        font-weight: 600;
      }

      .button-primary:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .phase-note {
        display: inline-flex;
        align-items: center;
        background: var(--surface-soft);
        border: 1px solid var(--line);
        color: var(--muted);
      }

      .empty {
        padding: 18px;
        border-radius: 18px;
        background: var(--surface-soft);
        border: 1px dashed var(--line);
        color: var(--muted);
      }

      @media (max-width: 720px) {
        body {
          padding: 12px;
        }

        .shell {
          padding: 12px;
          border-radius: 20px;
        }

        .hero,
        .selection-panel,
        .resource-panel {
          padding: 16px;
        }
      }
`;
