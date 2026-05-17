export const ADMIN_LAYOUT_STYLE_TOKENS = `
      :root {
        color-scheme: light;
        --font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        --pico-font-family: var(--font);
        --pico-primary: #153a61;
        --pico-primary-hover: #102f4d;
        --pico-primary-background: #153a61;
        --pico-primary-hover-background: #102f4d;
        --pico-primary-border: #153a61;
        --pico-primary-hover-border: #102f4d;
        --pico-border-radius: 0.375rem;
        --bg: #f4f7fa;
        --surface: #fcfdff;
        --ink: #11253d;
        --secondary: #475c72;
        --muted: #708397;
        --faint: #91a0b1;
        --line: #dbe4ec;
        --line-light: #edf2f7;
        --accent: #153a61;
        --accent-hover: #102f4d;
        --accent-soft: #e8eff6;
        --accent-muted: #8ea5bf;
        --brand-warm: #c7771d;
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
