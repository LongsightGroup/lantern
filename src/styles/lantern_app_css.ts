export const LANTERN_APP_CSS_VERSION = '0.1.0';

export const LANTERN_APP_CSS = `:root {
  color-scheme: light;
  --ln-bg: #f6f8fb;
  --ln-surface: #fdfefe;
  --ln-ink: #102236;
  --ln-muted: #566b80;
  --ln-line: #d9e3ec;
  --ln-accent: #153a61;
  --ln-accent-soft: #e8eff6;
  --ln-success: #0e7f5f;
  --ln-warning: #a85f00;
  --ln-danger: #b91c3a;
  --ln-radius: 8px;
  --pico-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --pico-primary: var(--ln-accent);
  --pico-primary-hover: #102f4d;
  --pico-border-radius: var(--ln-radius);
}

body {
  margin: 0;
  background: var(--ln-bg);
  color: var(--ln-ink);
}

main,
.ln-app {
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 2rem 1rem;
}

.ln-app {
  display: grid;
  gap: 1rem;
}

.ln-panel,
.ln-flashcard,
.ln-instructor-panel {
  border: 1px solid var(--ln-line);
  border-radius: var(--ln-radius);
  background: var(--ln-surface);
  padding: 1rem;
}

.ln-activity-header,
.ln-toolbar,
.ln-progress-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
}

.ln-choice-grid,
.ln-match-grid,
.ln-sort-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.75rem;
}

.ln-choice {
  width: 100%;
  min-height: 3rem;
  text-align: left;
}

.ln-choice-selected {
  border-color: var(--ln-accent);
  background: var(--ln-accent-soft);
}

.ln-choice-correct {
  border-color: var(--ln-success);
}

.ln-choice-incorrect {
  border-color: var(--ln-danger);
}

.ln-feedback {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ln-line);
  border-radius: var(--ln-radius);
  background: var(--ln-surface);
}

.ln-feedback-success {
  border-color: color-mix(in srgb, var(--ln-success) 36%, var(--ln-line));
  color: var(--ln-success);
}

.ln-feedback-warning {
  border-color: color-mix(in srgb, var(--ln-warning) 36%, var(--ln-line));
  color: var(--ln-warning);
}

.ln-feedback-danger {
  border-color: color-mix(in srgb, var(--ln-danger) 36%, var(--ln-line));
  color: var(--ln-danger);
}

.ln-report-table {
  width: 100%;
}

.ln-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;
