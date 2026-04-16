export const ADMIN_LAYOUT_STYLE_SIDEBAR = `
      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: var(--sidebar-width);
        display: flex;
        flex-direction: column;
        padding: 0;
        background: var(--ink);
        color: rgba(255, 255, 255, 0.7);
        z-index: 10;
        overflow-y: auto;
      }

      .sidebar-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 18px 20px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: #fff;
        text-decoration: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .sidebar-brand svg {
        flex-shrink: 0;
      }

      .sidebar-nav {
        padding: 12px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }

      .sidebar-section-label {
        padding: 10px 10px 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.35);
      }

      .sidebar-link {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: var(--radius-sm);
        font-size: 13.5px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
        text-decoration: none;
        transition: background 120ms, color 120ms;
      }

      .sidebar-link:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }

      .sidebar-link.active {
        background: rgba(255, 255, 255, 0.10);
        color: #fff;
      }

      .sidebar-link svg {
        opacity: 0.5;
        flex-shrink: 0;
      }

      .sidebar-link.active svg {
        opacity: 0.9;
      }

      .sidebar-nav-group {
        display: grid;
        gap: 4px;
      }

      .sidebar-subnav {
        display: grid;
        gap: 2px;
        margin: 0 0 8px 36px;
        padding-left: 12px;
        border-left: 1px solid rgba(255, 255, 255, 0.1);
      }

      .sidebar-sublink {
        display: block;
        padding: 6px 10px;
        border-radius: var(--radius-sm);
        font-size: 12.5px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.5);
        text-decoration: none;
        transition: background 120ms, color 120ms;
      }

      .sidebar-sublink:hover {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.9);
      }

      .sidebar-sublink.active {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .sidebar-footer {
        padding: 14px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 12px;
        color: rgba(255, 255, 255, 0.25);
      }

      .page-header {
        padding: 28px 40px 24px;
        background: var(--surface);
        border-bottom: 1px solid var(--line);
      }

      .page-header-bar {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
      }

      .page-header-copy {
        flex: 1;
        min-width: 0;
      }

      .breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 0;
        margin: 0 0 10px;
        list-style: none;
        color: var(--muted);
        font-size: 13px;
      }

      .breadcrumbs li + li::before {
        content: "/";
        margin-right: 6px;
        color: var(--line);
      }

      .breadcrumbs a {
        text-decoration: none;
        color: var(--muted);
      }

      .breadcrumbs a:hover {
        color: var(--ink);
      }

      .page-eyebrow {
        margin: 0 0 4px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .page-title {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.25;
        color: var(--ink);
      }

      .page-desc {
        margin: 6px 0 0;
        max-width: 600px;
        font-size: 14px;
        color: var(--secondary);
        line-height: 1.55;
      }

      .operator-chip {
        display: grid;
        gap: 2px;
        justify-items: end;
        min-width: 132px;
        padding: 10px 14px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--bg);
        text-align: right;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }

      .operator-chip-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .operator-chip-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--ink);
      }

      .page-header-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid var(--line-light);
      }

      .page-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .page-nav-link {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid transparent;
        color: var(--secondary);
        font-size: 13.5px;
        font-weight: 600;
        text-decoration: none;
        transition: background 120ms, border-color 120ms, color 120ms;
      }

      .page-nav-link:hover {
        background: var(--bg);
        border-color: var(--line);
        color: var(--ink);
      }

      .page-nav-link-current {
        background: var(--accent-soft);
        border-color: color-mix(in srgb, var(--accent) 18%, var(--line));
        color: color-mix(in srgb, var(--accent) 82%, var(--ink));
      }
`;
