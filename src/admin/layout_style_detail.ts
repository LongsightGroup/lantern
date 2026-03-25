export const ADMIN_LAYOUT_STYLE_DETAIL = `
      .table-list {
        display: grid;
        gap: 0;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        overflow: hidden;
      }

      .table-row {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        background: var(--surface);
        border-bottom: 1px solid var(--line-light);
      }

      .table-row:last-child {
        border-bottom: none;
      }

      .table-row-top {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .table-row p {
        margin: 0;
      }

      .table-row-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        color: var(--muted);
        font-size: 13px;
      }

      .table-row-meta strong {
        font-weight: 500;
        color: var(--secondary);
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: var(--radius-sm);
        background: var(--bg);
        border: 1px solid var(--line);
        font-size: 13px;
        color: var(--secondary);
      }

      .chip-flagged {
        background: var(--warning-soft);
        border-color: #fde6a8;
        color: #92400e;
      }

      .callout {
        padding: 14px 18px;
        border-radius: var(--radius);
        background: var(--warning-soft);
        border: 1px solid #fde6a8;
        font-size: 13.5px;
      }

      .callout h2,
      .callout h3 {
        margin: 0 0 4px;
        font-size: 13.5px;
        font-weight: 600;
        color: #92400e;
      }

      .callout p {
        margin: 0;
        color: #78350f;
      }

      .callout ul {
        margin: 8px 0 0;
        padding-left: 18px;
        color: #78350f;
      }

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

      .field-hint {
        margin: 0;
        font-size: 12.5px;
        color: var(--muted);
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
