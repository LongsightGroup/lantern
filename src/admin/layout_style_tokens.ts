export const ADMIN_LAYOUT_STYLE_TOKENS = `
      :root {
        color-scheme: light;
        --font: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        --bg: #f7f8fa;
        --surface: #ffffff;
        --ink: #0a2540;
        --secondary: #425466;
        --muted: #6b7c93;
        --faint: #8898a9;
        --line: #e3e8ee;
        --line-light: #f0f3f7;
        --accent: #4f46e5;
        --accent-hover: #4338ca;
        --accent-soft: #eef2ff;
        --accent-muted: #a5b4fc;
        --brand-warm: #f59e0b;
        --success: #0ea371;
        --success-soft: #eaf9f4;
        --warning: #d97706;
        --warning-soft: #fef9ec;
        --danger: #df1b41;
        --danger-soft: #fdf0f3;
        --sidebar-width: 240px;
        --radius: 8px;
        --radius-sm: 6px;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        height: 100%;
      }

      body {
        color: var(--ink);
        font: 14px/1.55 var(--font);
        background: var(--bg);
        -webkit-font-smoothing: antialiased;
      }

      a {
        color: inherit;
      }

      .app {
        display: flex;
        min-height: 100vh;
      }

      .main {
        margin-left: var(--sidebar-width);
        flex: 1;
        min-height: 100vh;
      }

      .page-body {
        padding: 28px 40px 60px;
      }

      .content {
        display: grid;
        gap: 24px;
      }
`;
