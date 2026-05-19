export const ADMIN_LAYOUT_STYLE_DETAIL_TABLES = `
      .table-scroll {
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--surface);
      }

      .detail-table {
        width: 100%;
        min-width: 760px;
        border-collapse: collapse;
      }

      .detail-table th,
      .detail-table td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--line-light);
        text-align: left;
        vertical-align: top;
      }

      .detail-table th {
        background: color-mix(in srgb, var(--bg) 74%, white);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .detail-table tbody tr:last-child td {
        border-bottom: none;
      }

      .detail-table-primary strong {
        font-size: 14px;
        color: var(--ink);
      }

      .detail-table-stack {
        display: grid;
        gap: 4px;
      }

      .detail-table-notes {
        min-width: 20rem;
        color: var(--secondary);
        white-space: pre-wrap;
      }

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

      .table-row-status {
      }

      .table-row-status-healthy {
        background: color-mix(in srgb, var(--success-soft) 22%, var(--surface));
      }

      .table-row-status-attention {
        background: color-mix(in srgb, var(--warning-soft) 34%, var(--surface));
      }

      .table-row-status-failed {
        background: color-mix(in srgb, var(--danger-soft) 30%, var(--surface));
      }

      .table-row-status-unknown {
        background: color-mix(in srgb, var(--accent-soft) 24%, var(--surface));
      }

      .table-row:last-child {
        border-bottom: none;
      }

      .version-row {
        gap: 14px;
      }

      .version-row-current {
        background: color-mix(in srgb, var(--accent-soft) 72%, var(--surface));
      }

      .version-row-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 11.5rem;
        gap: 18px;
        align-items: start;
      }

      .version-row-copy {
        min-width: 0;
        gap: 8px;
      }

      .version-row-state {
        gap: 8px;
      }

      .version-row-actions {
        display: grid;
        gap: 8px;
        align-content: start;
      }

      .version-row-actions > * {
        width: 100%;
      }

      .version-summary-chip {
        background: color-mix(in srgb, var(--accent-soft) 84%, white);
        border-color: color-mix(in srgb, var(--accent) 22%, var(--line));
        color: color-mix(in srgb, var(--accent) 82%, var(--ink));
        font-weight: 700;
      }

      .version-summary-chip-muted {
        background: color-mix(in srgb, var(--bg) 72%, white);
        border-color: var(--line);
        color: var(--secondary);
        font-weight: 600;
      }

      .version-rollout-chip {
        background: color-mix(in srgb, var(--bg) 70%, white);
        border-color: color-mix(in srgb, var(--secondary) 10%, var(--line));
        color: var(--secondary);
        font-weight: 600;
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

      .capability-chip {
        position: relative;
        padding-left: 12px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
      }

      .capability-chip::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.78;
      }

      .capability-chip-basic {
        background: color-mix(in srgb, var(--accent-soft) 72%, white);
        border-color: color-mix(in srgb, var(--accent) 18%, var(--line));
        color: color-mix(in srgb, var(--accent) 68%, var(--ink));
      }

      .capability-chip-flagged {
        background: color-mix(in srgb, var(--warning-soft) 84%, white);
        border-color: color-mix(in srgb, var(--warning) 24%, var(--line));
        color: color-mix(in srgb, var(--warning) 82%, var(--ink));
      }

      .capability-privacy {
        display: grid;
        gap: 18px;
      }

      .capability-group {
        display: grid;
        gap: 14px;
      }

      .capability-group + .capability-group {
        padding-top: 16px;
        border-top: 1px solid var(--line-light);
      }

      .capability-group-sensitive {
        padding: 16px;
        border-radius: var(--radius);
        background: color-mix(in srgb, var(--warning-soft) 46%, var(--surface));
      }

      .capability-group-blocked {
        padding: 14px 16px;
        border-radius: var(--radius);
        background: color-mix(in srgb, var(--accent-soft) 42%, var(--surface));
      }

      .capability-group-header,
      .capability-card-header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .capability-group-header h3,
      .capability-card h4 {
        margin: 0;
        font-size: 13.5px;
        font-weight: 650;
      }

      .capability-group-header p,
      .capability-card p {
        margin: 2px 0 0;
        color: var(--secondary);
        font-size: 13.5px;
      }

      .capability-card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
      }

      .capability-card {
        display: grid;
        gap: 12px;
        min-width: 0;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        background: var(--surface);
      }

      .capability-meta {
        display: grid;
        gap: 8px;
        margin: 0;
      }

      .capability-meta div {
        display: grid;
        gap: 2px;
      }

      .capability-meta dt {
        color: var(--muted);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .capability-meta dd {
        margin: 0;
        color: var(--secondary);
        font-size: 13px;
      }

      .capability-classification {
        font-size: 11.5px;
        font-weight: 700;
      }

      .capability-classification-standard {
        background: color-mix(in srgb, var(--success-soft) 82%, white);
        border-color: color-mix(in srgb, var(--success) 18%, var(--line));
        color: color-mix(in srgb, var(--success) 78%, var(--ink));
      }

      .capability-classification-sensitive {
        background: color-mix(in srgb, var(--warning-soft) 84%, white);
        border-color: color-mix(in srgb, var(--warning) 24%, var(--line));
        color: color-mix(in srgb, var(--warning) 80%, var(--ink));
      }

      .capability-classification-blocked {
        background: color-mix(in srgb, var(--accent-soft) 72%, white);
        border-color: color-mix(in srgb, var(--accent) 18%, var(--line));
        color: color-mix(in srgb, var(--accent) 76%, var(--ink));
      }

      .chip-status {
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .chip-status-healthy {
        background: color-mix(in srgb, var(--success-soft) 82%, white);
        border-color: color-mix(in srgb, var(--success) 24%, var(--line));
        color: color-mix(in srgb, var(--success) 84%, var(--ink));
      }

      .chip-status-attention {
        background: color-mix(in srgb, var(--warning-soft) 84%, white);
        border-color: color-mix(in srgb, var(--warning) 24%, var(--line));
        color: color-mix(in srgb, var(--warning) 78%, var(--ink));
      }

      .chip-status-failed {
        background: color-mix(in srgb, var(--danger-soft) 84%, white);
        border-color: color-mix(in srgb, var(--danger) 24%, var(--line));
        color: color-mix(in srgb, var(--danger) 82%, var(--ink));
      }

      .chip-status-unknown {
        background: color-mix(in srgb, var(--accent-soft) 80%, white);
        border-color: color-mix(in srgb, var(--accent) 20%, var(--line));
        color: color-mix(in srgb, var(--accent) 78%, var(--ink));
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

      .callout-review {
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--warning-soft) 76%, white),
            color-mix(in srgb, var(--surface) 86%, var(--warning-soft))
          );
        border-color: color-mix(in srgb, var(--warning) 22%, var(--line));
      }

      .callout-review h3 {
        color: color-mix(in srgb, var(--warning) 84%, var(--ink));
      }

      .callout-review p {
        color: color-mix(in srgb, var(--warning) 58%, var(--ink));
      }

      .callout-review .micro.muted {
        color: color-mix(in srgb, var(--warning) 44%, var(--ink));
      }

      .capability-review-list {
        display: grid;
        gap: 10px;
        list-style: none;
        margin: 8px 0 0;
        padding: 0;
      }

      .capability-review-item {
        display: grid;
        gap: 6px;
        padding: 12px 14px;
        border-radius: var(--radius-sm);
        border: 1px solid color-mix(in srgb, var(--warning) 16%, var(--line));
        background: color-mix(in srgb, white 82%, var(--warning-soft));
      }

      .capability-review-item .line-title {
        margin: 0;
        justify-content: space-between;
      }

      .capability-review-item .line-copy {
        margin: 0;
        color: color-mix(in srgb, var(--warning) 52%, var(--ink));
      }

      .capability-risk-chip {
        background: color-mix(in srgb, var(--danger-soft) 78%, white);
        border-color: color-mix(in srgb, var(--danger) 20%, var(--line));
        color: color-mix(in srgb, var(--danger) 70%, var(--ink));
        font-size: 12px;
        font-weight: 600;
      }
`;
