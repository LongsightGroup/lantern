export const ADMIN_LAYOUT_STYLE_DETAIL_TABLES = `
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
        box-shadow: inset 3px 0 0 transparent;
      }

      .table-row-status-healthy {
        background: color-mix(in srgb, var(--success-soft) 22%, var(--surface));
        box-shadow: inset 3px 0 0 color-mix(in srgb, var(--success) 72%, white);
      }

      .table-row-status-attention {
        background: color-mix(in srgb, var(--warning-soft) 34%, var(--surface));
        box-shadow: inset 3px 0 0 color-mix(in srgb, var(--warning) 76%, white);
      }

      .table-row-status-failed {
        background: color-mix(in srgb, var(--danger-soft) 30%, var(--surface));
        box-shadow: inset 3px 0 0 color-mix(in srgb, var(--danger) 78%, white);
      }

      .table-row-status-unknown {
        background: color-mix(in srgb, var(--accent-soft) 24%, var(--surface));
        box-shadow: inset 3px 0 0 color-mix(in srgb, var(--accent) 60%, white);
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
        box-shadow: inset 3px 0 0 color-mix(in srgb, var(--warning) 76%, white);
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
