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

      .report-chart {
        display: grid;
        gap: 10px;
      }

      .report-health-grid {
        display: grid;
        grid-template-columns: minmax(220px, 0.8fr) minmax(260px, 1.2fr);
        gap: 24px;
        align-items: stretch;
      }

      .report-health-primary {
        display: flex;
        gap: 18px;
        align-items: center;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: color-mix(in srgb, var(--success-soft) 38%, var(--surface));
      }

      .report-health-primary h3,
      .report-insight h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 650;
      }

      .report-completion-meter {
        --report-meter-value: 0%;
        position: relative;
        display: grid;
        width: 92px;
        height: 92px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 999px;
        background:
          radial-gradient(circle at center, var(--surface) 0 58%, transparent 59%),
          conic-gradient(var(--success) var(--report-meter-value), var(--line-light) 0);
        color: var(--ink);
        font-size: 17px;
        font-weight: 750;
      }

      .report-completion-meter::after {
        content: "";
        position: absolute;
        inset: 7px;
        border: 1px solid color-mix(in srgb, var(--success) 16%, var(--line));
        border-radius: inherit;
      }

      .report-takeaways {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
        list-style-type: none;
      }

      .report-takeaways li {
        display: block;
        padding: 0 0 10px;
        border-bottom: 1px solid var(--line-light);
        color: var(--secondary);
        font-size: 13.5px;
      }

      .report-takeaways li:last-child {
        padding-bottom: 0;
        border-bottom: none;
      }

      .report-takeaways strong {
        color: var(--ink);
      }

      .report-insight-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 22px;
      }

      .report-insight {
        display: grid;
        align-content: start;
        gap: 14px;
        min-width: 0;
        padding-left: 20px;
        border-left: 1px solid var(--line-light);
      }

      .report-insight:first-child {
        padding-left: 0;
        border-left: none;
      }

      .report-meter-rows {
        display: grid;
        gap: 12px;
      }

      .report-meter-row {
        display: grid;
        gap: 6px;
      }

      .report-meter-row-copy {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
        color: var(--muted);
        font-size: 12.5px;
      }

      .report-meter-row-copy span:first-child {
        overflow: hidden;
        color: var(--ink);
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .report-meter-row-copy span:last-child {
        flex: 0 0 auto;
      }

      .report-meter-track {
        height: 8px;
        border-radius: 999px;
        background: var(--line-light);
        overflow: hidden;
      }

      .report-meter-fill {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
      }

      .report-meter-fill-success {
        background: var(--success);
      }

      .report-chart-bars {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
        gap: 12px;
        min-height: 178px;
        align-items: end;
        padding: 16px 16px 12px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: color-mix(in srgb, var(--bg) 70%, var(--surface));
      }

      .report-chart-bar-group {
        display: grid;
        gap: 6px;
        justify-items: center;
        min-width: 0;
      }

      .report-chart-bar-track {
        position: relative;
        display: flex;
        width: 28px;
        height: 128px;
        align-items: end;
        justify-content: center;
        border-radius: 999px;
        background: var(--line-light);
        overflow: hidden;
      }

      .report-chart-bar,
      .report-chart-bar-completed {
        position: absolute;
        bottom: 0;
        width: 100%;
        border-radius: 999px 999px 0 0;
      }

      .report-chart-bar {
        background: var(--accent-muted);
      }

      .report-chart-bar-completed {
        background: var(--success);
      }

      .report-chart-value {
        font-size: 12.5px;
        font-weight: 700;
        color: var(--ink);
      }

      .report-chart-label {
        max-width: 8ch;
        overflow-wrap: anywhere;
        text-align: center;
        font-size: 11.5px;
        line-height: 1.2;
        color: var(--muted);
      }

      .report-table-wrap {
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: var(--radius);
      }

      .report-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13.5px;
      }

      .report-table th,
      .report-table td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line-light);
        text-align: left;
        vertical-align: top;
      }

      .report-table thead th {
        background: color-mix(in srgb, var(--bg) 76%, var(--surface));
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .report-table tbody tr:last-child th,
      .report-table tbody tr:last-child td {
        border-bottom: none;
      }

      .report-student-name {
        display: block;
        color: var(--ink);
        font-weight: 650;
      }

      .report-table-detail {
        display: block;
        margin-top: 2px;
        white-space: nowrap;
      }

      .report-student-metric {
        display: grid;
        gap: 6px;
        min-width: 90px;
      }

      .report-signal {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 12px;
        font-weight: 650;
      }

      .report-signal::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
      }

      .report-signal-on_track {
        background: var(--success-soft);
        color: color-mix(in srgb, var(--success) 82%, var(--ink));
      }

      .report-signal-in_progress {
        background: var(--accent-soft);
        color: color-mix(in srgb, var(--accent) 82%, var(--ink));
      }

      .report-signal-needs_follow_up {
        background: var(--warning-soft);
        color: color-mix(in srgb, var(--warning) 82%, var(--ink));
      }

      @media (max-width: 920px) {
        .report-health-grid,
        .report-insight-grid {
          grid-template-columns: 1fr;
        }

        .report-insight {
          padding-top: 18px;
          padding-left: 0;
          border-top: 1px solid var(--line-light);
          border-left: none;
        }

        .report-insight:first-child {
          padding-top: 0;
          border-top: none;
        }
      }

      .micro {
        font-size: 13px;
      }

      .muted {
        color: var(--muted);
      }
`;
