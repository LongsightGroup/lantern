export const ADMIN_LAYOUT_STYLE_DETAIL_DEPLOYMENT = `
      .deployment-tab-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 8px;
        border-radius: var(--radius);
        border: 1px solid var(--line);
        background: color-mix(in srgb, var(--bg) 86%, white);
      }

      .deployment-tab {
        display: grid;
        gap: 4px;
        flex: 1 1 180px;
        min-width: 0;
        padding: 14px 16px;
        border-radius: calc(var(--radius) - 4px);
        border: 1px solid transparent;
        background: transparent;
        text-decoration: none;
        transition: border-color 120ms, background 120ms, box-shadow 120ms;
      }

      .deployment-tab:hover {
        background: var(--surface);
        border-color: var(--line-light);
      }

      .deployment-tab.active {
        background: var(--surface);
        border-color: color-mix(in srgb, var(--accent) 20%, var(--line));
        box-shadow: 0 10px 28px rgba(10, 37, 64, 0.06);
      }

      .deployment-tab-label {
        font-size: 15px;
        font-weight: 600;
        color: var(--ink);
      }

      .deployment-tab-note {
        font-size: 12.5px;
        color: var(--secondary);
      }

      .deployment-tab-panel {
        padding: 18px;
        border-radius: var(--radius);
        border: 1px solid var(--line);
        background: var(--surface);
        box-shadow: 0 10px 28px rgba(10, 37, 64, 0.04);
      }

      .deployment-tab-copy {
        display: grid;
        gap: 4px;
        padding: 14px 16px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--line-light);
        background: var(--bg);
      }

      .deployment-tab-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--ink);
      }

      .deployment-tab-copy-text {
        font-size: 13.5px;
        color: var(--secondary);
      }

      .deployment-tab-body {
        display: grid;
        gap: 18px;
      }
`;
