import { ADMIN_LAYOUT_STYLE_DETAIL_DEPLOYMENT } from './layout_style_detail_deployment.ts';
import { ADMIN_LAYOUT_STYLE_DETAIL_TABLES } from './layout_style_detail_tables.ts';

export const ADMIN_LAYOUT_STYLE_DETAIL = `
      ${ADMIN_LAYOUT_STYLE_DETAIL_TABLES}

      .two-column {
        display: grid;
        gap: 24px;
        grid-template-columns: 1fr minmax(240px, 320px);
      }

      .field {
        display: grid;
        gap: 6px;
      }

      .field label {
        font-size: 13px;
        font-weight: 600;
        color: var(--secondary);
      }

      input,
      textarea,
      select {
        width: 100%;
        border-radius: var(--radius-sm);
        border: 1px solid var(--line);
        background: var(--surface);
        color: var(--ink);
        padding: 10px 12px;
        font-size: 14px;
        transition: border-color 120ms, box-shadow 120ms;
      }

      input:focus,
      textarea:focus,
      select:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }

      input::placeholder,
      textarea::placeholder {
        color: var(--muted);
      }

      textarea {
        min-height: 100px;
        resize: vertical;
      }

      input[aria-invalid="true"],
      textarea[aria-invalid="true"],
      select[aria-invalid="true"] {
        border-color: #f2a9b7;
        box-shadow: 0 0 0 3px rgba(223, 27, 65, 0.12);
      }

      .field-hint {
        margin: 0;
        font-size: 12.5px;
        color: var(--muted);
      }

      .field-error {
        margin: 0;
        font-size: 12.5px;
        color: var(--danger);
      }

      .deployment-form-note {
        margin: 0;
        color: var(--secondary);
        font-size: 13.5px;
      }

      .inline-flash {
        margin: 0;
      }

      .step-list {
        display: grid;
        gap: 14px;
      }

      .step-card {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--surface);
      }

      ${ADMIN_LAYOUT_STYLE_DETAIL_DEPLOYMENT}

      .inline-code {
        display: inline-block;
        overflow-wrap: anywhere;
        font: 12.5px/1.6 "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
        color: var(--secondary);
      }

      details {
        border-radius: var(--radius);
        border: 1px solid var(--line);
        background: var(--surface);
        overflow: hidden;
      }

      summary {
        padding: 12px 16px;
        cursor: pointer;
        font-weight: 600;
        font-size: 13.5px;
        color: var(--secondary);
      }

      summary:hover {
        background: var(--bg);
      }

      pre {
        margin: 0;
        padding: 0 16px 16px;
        overflow-x: auto;
        font: 12.5px/1.6 "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
        color: var(--secondary);
      }

      .detail-stack {
        display: grid;
        gap: 16px;
        padding-top: 16px;
      }

      .empty-state {
        display: grid;
        gap: 16px;
      }

      .empty-state h2,
      .panel h2,
      .panel h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .empty-state p,
      .panel > p,
      .panel-body > .stack > p:not(.section-label):not(.line-title) {
        margin: 0;
        color: var(--secondary);
        font-size: 14px;
      }

      .micro {
        font-size: 13px;
      }

      .muted {
        color: var(--muted);
      }
`;
