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

      .form-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .form-stack {
        display: grid;
        gap: 16px;
      }

      .field-span-full {
        grid-column: 1 / -1;
      }

      .preview-launch-stack {
        display: grid;
        gap: 16px;
        max-width: 46rem;
      }

      .preview-launch-form {
        max-width: 100%;
      }

      .field label {
        font-size: 13px;
        font-weight: 600;
        color: var(--secondary);
      }

      input:not([type="checkbox"], [type="radio"], [type="submit"], [type="button"], [type="reset"], [type="file"], [type="range"]),
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

      input:not([type="checkbox"], [type="radio"], [type="submit"], [type="button"], [type="reset"], [type="file"], [type="range"]):focus,
      textarea:focus,
      select:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }

      input:not([type="checkbox"], [type="radio"], [type="submit"], [type="button"], [type="reset"], [type="file"], [type="range"])::placeholder,
      textarea::placeholder {
        color: var(--muted);
      }

      textarea {
        min-height: 100px;
        resize: vertical;
      }

      input:not([type="checkbox"], [type="radio"], [type="submit"], [type="button"], [type="reset"], [type="file"], [type="range"])[aria-invalid="true"],
      textarea[aria-invalid="true"],
      select[aria-invalid="true"] {
        border-color: #f2a9b7;
        box-shadow: 0 0 0 3px rgba(223, 27, 65, 0.12);
      }

      .field .chip-row label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0;
      }

      .field .chip-row input[type="radio"],
      .field .chip-row input[type="checkbox"] {
        flex: 0 0 auto;
        margin: 0;
      }

      .field-hint {
        margin: 0;
        font-size: 12.5px;
        color: var(--muted);
      }

      .choice-row {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, var(--bg) 72%, white);
        color: var(--secondary);
        cursor: pointer;
      }

      .choice-row:hover {
        border-color: var(--line-light);
        background: var(--surface);
      }

      .choice-row > span {
        display: grid;
        gap: 2px;
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

      .form-actions {
        align-items: flex-start;
      }

      .app-writer-submit-button {
        min-width: 126px;
      }

      .app-writer-submit-busy-label {
        display: none;
      }

      .app-writer-form.is-submitting .app-writer-submit-label {
        display: none;
      }

      .app-writer-form.is-submitting .app-writer-submit-busy-label {
        display: inline;
      }

      .app-writer-submit-button[aria-busy="true"] {
        cursor: wait;
      }

      .app-writer-submit-button[aria-busy="true"]::before {
        content: "";
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid color-mix(in srgb, var(--accent-soft) 74%, var(--surface));
        border-top-color: currentColor;
        animation: app-writer-spin 800ms linear infinite;
      }

      .app-writer-submit-status {
        display: flex;
        gap: 8px;
        align-items: center;
        margin: 0;
        color: var(--secondary);
        font-size: 13.5px;
      }

      .app-writer-submit-status[hidden] {
        display: none;
      }

      .app-writer-submit-status::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--warning);
        box-shadow: 0 0 0 4px var(--warning-soft);
        flex: none;
      }

      .generation-progress {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .generation-progress li {
        display: grid;
        gap: 6px;
        min-width: 0;
        color: var(--muted);
        font-size: 12.5px;
        font-weight: 600;
      }

      .generation-progress-marker {
        display: block;
        height: 6px;
        border-radius: 999px;
        background: var(--line);
      }

      .generation-progress li.is-complete {
        color: var(--secondary);
      }

      .generation-progress li.is-complete .generation-progress-marker {
        background: var(--success);
      }

      .generation-progress li.is-current {
        color: var(--ink);
      }

      .generation-progress li.is-current .generation-progress-marker {
        background: var(--accent);
        box-shadow: 0 0 0 4px var(--accent-soft);
      }

      @keyframes app-writer-spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .app-writer-submit-button[aria-busy="true"]::before {
          animation: none;
        }
      }

      @media (max-width: 720px) {
        .generation-progress {
          grid-template-columns: 1fr;
        }
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

      .app-inline-meta {
        margin-left: 10px;
        font-size: 13px;
        font-weight: 500;
        color: var(--muted);
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
