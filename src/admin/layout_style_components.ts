export const ADMIN_LAYOUT_STYLE_COMPONENTS = `
      .panel {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--surface);
      }

      .panel-body {
        padding: 24px;
      }

      .section-label {
        margin: 0 0 12px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .flash {
        padding: 14px 18px;
        border-radius: var(--radius);
        border: 1px solid transparent;
        font-size: 13.5px;
      }

      .flash h2 {
        margin: 0 0 2px;
        font-size: 14px;
        font-weight: 600;
      }

      .flash p,
      .flash ul {
        margin: 0;
      }

      .flash ul {
        margin-top: 8px;
        padding-left: 18px;
      }

      .flash-success {
        background: var(--success-soft);
        border-color: #c6f0df;
        color: #0c6b4b;
      }

      .flash-note {
        background: var(--accent-soft);
        border-color: color-mix(in srgb, var(--accent) 18%, var(--line));
        color: color-mix(in srgb, var(--accent) 78%, var(--ink));
      }

      .flash-error {
        background: var(--danger-soft);
        border-color: #f9c4cf;
        color: #9b1133;
      }

      .grid {
        display: grid;
        gap: 20px;
      }

      .panel-header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--line);
        overflow: hidden;
      }

      .fact {
        padding: 14px 16px;
        background: var(--surface);
      }

      .stack > .fact {
        border: 1px solid var(--line);
        border-radius: var(--radius);
      }

      .fact-label {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        font-weight: 500;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .fact-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--ink);
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px 3px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .status-badge::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
      }

      .status-approved {
        background: var(--success-soft);
        color: var(--success);
      }

      .status-pending {
        background: var(--warning-soft);
        color: var(--warning);
      }

      .status-rejected {
        background: var(--danger-soft);
        color: var(--danger);
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      .button,
      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      .button,
      button {
        appearance: none;
        border: none;
        cursor: pointer;
        text-decoration: none;
      }

      .button,
      .button-primary,
      .button-secondary,
      .button-danger,
      .button-ghost,
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 36px;
        padding: 0 16px;
        border-radius: var(--radius-sm);
        font-size: 13.5px;
        font-weight: 600;
        transition: background 120ms, box-shadow 120ms;
      }

      .button,
      .button-primary,
      button.button-primary {
        background: var(--accent);
        color: #fdfefe;
        box-shadow:
          0 1px 2px rgba(0, 0, 0, 0.10),
          0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
      }

      .button:hover,
      .button-primary:hover,
      button.button-primary:hover {
        background: var(--accent-hover);
      }

      .button-secondary {
        background: var(--surface);
        color: var(--ink);
        border: 1px solid var(--line);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }

      .button-secondary:hover {
        background: var(--bg);
      }

      .button-danger {
        background: var(--danger);
        color: #fdfefe;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.10);
      }

      .button-danger:hover {
        background: #c5183a;
      }

      .button-ghost {
        background: transparent;
        color: var(--secondary);
        border: 1px solid var(--line);
      }

      .button-ghost:hover {
        background: var(--bg);
        color: var(--ink);
      }

      .line-list {
        display: grid;
        gap: 0;
      }

      .line-item {
        display: grid;
        gap: 4px;
        padding: 14px 0;
        border-top: 1px solid var(--line-light);
      }

      .line-item:first-child {
        padding-top: 0;
        border-top: none;
      }

      .line-title {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        font-weight: 600;
        font-size: 14px;
      }

      .line-copy {
        margin: 0;
        color: var(--secondary);
        font-size: 13.5px;
      }

      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }

      .card-grid > .fact {
        border: 1px solid var(--line);
        border-radius: var(--radius);
      }
`;
